import { sign, toBytes } from './crypto.js';
import {
	AriApiError,
	AriConnectionError,
	AriInputError,
	AriResponseError,
	AriTimeoutError
} from './errors.js';
import { validateConfiguration, validateLookup, validateShip } from './validation.js';
import { webhooks } from './webhooks.js';

import type {
	AriCreateShipResponse,
	AriRequestOptions,
	AriShipInput,
	AriShipLookup,
	AriShipStatus,
	AriWithdrawShipResponse
} from './types.js';

export type AriFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AriOptions {
	programId: string;
	signingSecret: string;
	baseUrl?: string;
	timeoutMs?: number;
	maxRetries?: number;
	fetch?: AriFetch;
}

interface RequestInput {
	method: 'GET' | 'POST';
	path: string;
	body?: string;
	auth: 'bearer' | 'signature';
	retryable: boolean;
	options?: AriRequestOptions;
}

interface AttemptSignal {
	signal: AbortSignal;
	timedOut(): boolean;
	cleanup(): void;
}

function attemptSignal(parent: AbortSignal | undefined, timeoutMs: number): AttemptSignal {
	const controller = new AbortController();
	let timeout = false;
	const abort = () => controller.abort(parent?.reason);
	if (parent?.aborted) abort();
	else parent?.addEventListener('abort', abort, { once: true });
	const timer = setTimeout(() => {
		timeout = true;
		controller.abort();
	}, timeoutMs);
	return {
		signal: controller.signal,
		timedOut: () => timeout,
		cleanup: () => {
			clearTimeout(timer);
			parent?.removeEventListener('abort', abort);
		}
	};
}

function retryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function retryAfter(response: Response, attempt: number): number {
	const value = response.headers.get('retry-after');
	if (value) {
		const seconds = Number(value);
		if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000);
		const at = Date.parse(value);
		if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), 30_000);
	}
	return Math.min(250 * 2 ** attempt, 4_000);
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw signal.reason;
	await new Promise<void>((resolve, reject) => {
		const finish = () => {
			signal?.removeEventListener('abort', abort);
			resolve();
		};
		const timer = setTimeout(finish, ms);
		const abort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		signal?.addEventListener('abort', abort, { once: true });
	});
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const phases = new Set([
	'processing',
	'fraud_review',
	'review',
	'under_review',
	'second_pass',
	'reviewed',
	'withdrawn',
	'reverted'
]);

function decision(value: unknown): boolean {
	return value === null || value === 'approved' || value === 'changes' || value === 'rejected';
}

class AriClient {
	readonly #programId: string;
	readonly #signingSecret: string;
	readonly #baseUrl: URL;
	readonly #timeoutMs: number;
	readonly #maxRetries: number;
	readonly #fetch: AriFetch;

	constructor(input: AriOptions) {
		const timeoutMs = input.timeoutMs ?? 15_000;
		const maxRetries = input.maxRetries ?? 2;
		this.#baseUrl = validateConfiguration({
			programId: input.programId,
			signingSecret: input.signingSecret,
			baseUrl: input.baseUrl ?? 'https://webhooks.ari.hackclub.com',
			timeoutMs,
			maxRetries
		});
		const fetcher = input.fetch ?? globalThis.fetch;
		if (!fetcher) throw new AriConnectionError('This runtime does not provide fetch.');
		this.#programId = input.programId.trim();
		this.#signingSecret = input.signingSecret;
		this.#timeoutMs = timeoutMs;
		this.#maxRetries = maxRetries;
		this.#fetch = fetcher.bind(globalThis);
	}

	async request<T>(input: RequestInput): Promise<T> {
		const url = new URL(input.path, `${this.#baseUrl.toString().replace(/\/$/, '')}/`);
		const timeoutMs = input.options?.timeout_ms ?? this.#timeoutMs;
		const maxRetries = input.options?.max_retries ?? this.#maxRetries;
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
			throw new AriInputError('timeout_ms must be greater than zero.', 'timeout_ms');
		}
		if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
			throw new AriInputError('max_retries must be an integer between 0 and 10.', 'max_retries');
		}
		const headers = new Headers({ Accept: 'application/json' });
		if (input.body !== undefined) headers.set('Content-Type', 'application/json');
		if (input.auth === 'bearer') headers.set('Authorization', `Bearer ${this.#signingSecret}`);
		else headers.set('X-Ari-Signature', await sign(this.#signingSecret, toBytes(input.body ?? '')));

		const retries = input.retryable ? maxRetries : 0;
		let lastError: unknown;
		for (let attempt = 0; attempt <= retries; attempt += 1) {
			const current = attemptSignal(input.options?.signal, timeoutMs);
			try {
				const response = await this.#fetch(url, {
					method: input.method,
					headers,
					...(input.body === undefined ? {} : { body: input.body }),
					signal: current.signal
				});
				if (retryableStatus(response.status) && attempt < retries) {
					await response.body?.cancel();
					current.cleanup();
					await wait(retryAfter(response, attempt), input.options?.signal);
					continue;
				}
				return await this.parse<T>(response);
			} catch (error) {
				if (error instanceof AriApiError || error instanceof AriResponseError) throw error;
				if (input.options?.signal?.aborted) throw input.options.signal.reason ?? error;
				lastError = current.timedOut()
					? new AriTimeoutError(timeoutMs, { cause: error })
					: new AriConnectionError('Ari could not be reached.', { cause: error });
				if (attempt < retries) {
					current.cleanup();
					await wait(Math.min(250 * 2 ** attempt, 4_000), input.options?.signal);
					continue;
				}
				throw lastError;
			} finally {
				current.cleanup();
			}
		}
		throw lastError;
	}

	private async parse<T>(response: Response): Promise<T> {
		const body = await response.text();
		let parsed: unknown;
		try {
			parsed = body === '' ? null : JSON.parse(body);
		} catch (cause) {
			throw new AriResponseError(response.status, body, { cause });
		}
		if (!response.ok) {
			const code = record(parsed) && typeof parsed.error === 'string' ? parsed.error : 'api_error';
			const field = record(parsed) && typeof parsed.field === 'string' ? parsed.field : undefined;
			throw new AriApiError({
				status: response.status,
				code,
				...(field ? { field } : {}),
				details: parsed,
				retryable: retryableStatus(response.status)
			});
		}
		return parsed as T;
	}

	shipPath(suffix = ''): string {
		return `api/ingest/${encodeURIComponent(this.#programId)}${suffix}`;
	}
}

export class AriShips {
	readonly #client: AriClient;

	constructor(client: AriClient) {
		this.#client = client;
	}

	async create(input: AriShipInput, options?: AriRequestOptions): Promise<AriCreateShipResponse> {
		validateShip(input);
		const body = JSON.stringify(input);
		if (new TextEncoder().encode(body).byteLength > 25 << 20) {
			throw new AriInputError('The ship payload must be 25 MB or smaller.');
		}
		const response = await this.#client.request<AriCreateShipResponse>({
			method: 'POST',
			path: this.#client.shipPath(),
			body,
			auth: 'signature',
			retryable: true,
			...(options ? { options } : {})
		});
		if (
			!record(response) ||
			(response.status !== 'accepted' && response.status !== 'duplicate') ||
			typeof response.id !== 'string'
		) {
			throw new AriResponseError(200, JSON.stringify(response));
		}
		return response;
	}

	async withdraw(
		external_id: string,
		options?: AriRequestOptions
	): Promise<AriWithdrawShipResponse> {
		if (typeof external_id !== 'string' || external_id.trim() === '') {
			throw new AriInputError('external_id must be a non-empty string.', 'external_id');
		}
		const response = await this.#client.request<AriWithdrawShipResponse>({
			method: 'POST',
			path: this.#client.shipPath('/withdraw'),
			body: JSON.stringify({ external_id }),
			auth: 'signature',
			retryable: false,
			...(options ? { options } : {})
		});
		if (!record(response) || response.status !== 'withdrawn' || typeof response.id !== 'string') {
			throw new AriResponseError(200, JSON.stringify(response));
		}
		return response;
	}

	async status(lookup: AriShipLookup, options?: AriRequestOptions): Promise<AriShipStatus> {
		validateLookup(lookup);
		const query = new URLSearchParams();
		if (lookup.id) query.set('id', lookup.id);
		else query.set('external_id', lookup.external_id ?? '');
		const response = await this.#client.request<AriShipStatus>({
			method: 'GET',
			path: `${this.#client.shipPath('/status')}?${query}`,
			auth: 'bearer',
			retryable: true,
			...(options ? { options } : {})
		});
		if (
			!record(response) ||
			typeof response.id !== 'string' ||
			typeof response.external_id !== 'string' ||
			!Number.isInteger(response.version) ||
			typeof response.phase !== 'string' ||
			!phases.has(response.phase) ||
			!decision(response.decision)
		) {
			throw new AriResponseError(200, JSON.stringify(response));
		}
		return response;
	}
}

export class Ari {
	static readonly webhooks = webhooks;
	readonly ships: AriShips;

	constructor(input: AriOptions) {
		this.ships = new AriShips(new AriClient(input));
	}
}
