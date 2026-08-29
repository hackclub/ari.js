import { joinBytes, sign, toBytes, verify } from './crypto.js';
import {
	AriConfigurationError,
	AriWebhookPayloadError,
	AriWebhookVerificationError
} from './errors.js';

import type { AriBody } from './crypto.js';
import type {
	AriKnownWebhookEvent,
	AriTestWebhookOptions,
	AriWebhookDelivery,
	AriWebhookEvent,
	AriWebhookHandlerOptions,
	AriWebhookHeaders,
	AriWebhookOptions
} from './types.js';

const knownEvents = new Set([
	'ship.updated',
	'review.approved',
	'review.changes',
	'review.rejected',
	'review.reverted',
	'review.requeued',
	'review.fraud'
]);

function header(headers: AriWebhookHeaders, name: string): string | undefined {
	if ('get' in headers && typeof headers.get === 'function') return headers.get(name) ?? undefined;
	const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
	if (!entry) return undefined;
	const value = entry[1];
	return Array.isArray(value) ? value[0] : value;
}

function options(
	input: AriWebhookOptions
): Required<Omit<AriWebhookOptions, 'now'>> & { now: Date } {
	if (typeof input.secret !== 'string' || input.secret.trim() === '') {
		throw new AriConfigurationError('A webhook secret is required.');
	}
	const tolerance_seconds = input.tolerance_seconds ?? 300;
	if (!Number.isFinite(tolerance_seconds) || tolerance_seconds < 0) {
		throw new AriConfigurationError('tolerance_seconds must be zero or greater.');
	}
	const now = input.now ?? new Date();
	if (Number.isNaN(now.getTime())) throw new AriConfigurationError('now must be a valid date.');
	return { secret: input.secret, tolerance_seconds, now };
}

async function envelope(body: AriBody, headers: AriWebhookHeaders, input: AriWebhookOptions) {
	const config = options(input);
	const signature = header(headers, 'x-ari-signature');
	const timestampHeader = header(headers, 'x-ari-timestamp');
	const deliveryId = header(headers, 'x-ari-delivery-id');
	if (!signature) {
		throw new AriWebhookVerificationError('missing_signature', 'X-Ari-Signature is required.');
	}
	if (!timestampHeader) {
		throw new AriWebhookVerificationError('missing_timestamp', 'X-Ari-Timestamp is required.');
	}
	if (!deliveryId) {
		throw new AriWebhookVerificationError('missing_delivery_id', 'X-Ari-Delivery-Id is required.');
	}
	if (!/^\d+$/.test(timestampHeader)) {
		throw new AriWebhookVerificationError('invalid_timestamp', 'X-Ari-Timestamp is invalid.');
	}
	if (deliveryId.trim() === '') {
		throw new AriWebhookVerificationError('invalid_delivery_id', 'X-Ari-Delivery-Id is invalid.');
	}
	const timestamp = Number(timestampHeader);
	if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
		throw new AriWebhookVerificationError('invalid_timestamp', 'X-Ari-Timestamp is invalid.');
	}
	const now = Math.floor(config.now.getTime() / 1_000);
	if (Math.abs(now - timestamp) > config.tolerance_seconds) {
		throw new AriWebhookVerificationError(
			'stale_timestamp',
			'The webhook timestamp is outside the allowed window.'
		);
	}
	const bytes = toBytes(body);
	const valid = await verify(
		config.secret,
		joinBytes(`${timestamp}.${deliveryId}.`, bytes),
		signature
	);
	if (!valid) {
		throw new AriWebhookVerificationError(
			'invalid_signature',
			'The webhook signature does not match.'
		);
	}
	return { bytes, deliveryId, timestamp };
}

function parseEvent(bytes: Uint8Array): AriWebhookEvent {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch (cause) {
		throw new AriWebhookPayloadError('The webhook body is not valid UTF-8 JSON.', { cause });
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new AriWebhookPayloadError('The webhook body must be a JSON object.');
	}
	const payload = parsed as Record<string, unknown>;
	if (typeof payload.event !== 'string' || payload.event.trim() === '') {
		throw new AriWebhookPayloadError('The webhook body does not include an event name.');
	}
	if (knownEvents.has(payload.event)) return payload as unknown as AriKnownWebhookEvent;
	return { event: 'unknown', event_name: payload.event, payload };
}

export async function constructWebhookEvent(
	body: AriBody,
	headers: AriWebhookHeaders,
	input: AriWebhookOptions
): Promise<AriWebhookDelivery> {
	const verified = await envelope(body, headers, input);
	return {
		delivery_id: verified.deliveryId,
		timestamp: verified.timestamp,
		event: parseEvent(verified.bytes)
	};
}

export async function unwrapWebhookRequest(
	request: Request,
	input: AriWebhookOptions
): Promise<AriWebhookDelivery> {
	return constructWebhookEvent(await request.arrayBuffer(), request.headers, input);
}

export async function verifyWebhookSignature(
	body: AriBody,
	headers: AriWebhookHeaders,
	input: AriWebhookOptions
): Promise<boolean> {
	try {
		await envelope(body, headers, input);
		return true;
	} catch (error) {
		if (error instanceof AriWebhookVerificationError) return false;
		throw error;
	}
}

export async function generateTestWebhookHeaders(
	body: AriBody,
	input: AriTestWebhookOptions
): Promise<Record<string, string>> {
	if (input.secret.trim() === '') throw new AriConfigurationError('A webhook secret is required.');
	if (input.delivery_id.trim() === '') throw new AriConfigurationError('delivery_id is required.');
	const timestamp = input.timestamp ?? Math.floor(Date.now() / 1_000);
	if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
		throw new AriConfigurationError('timestamp must be a positive Unix timestamp.');
	}
	const signature = await sign(
		input.secret,
		joinBytes(`${timestamp}.${input.delivery_id}.`, toBytes(body))
	);
	return {
		'X-Ari-Signature': signature,
		'X-Ari-Timestamp': String(timestamp),
		'X-Ari-Delivery-Id': input.delivery_id
	};
}

export function createWebhookHandler(
	input: AriWebhookHandlerOptions
): (request: Request) => Promise<Response> {
	return async (request) => {
		let delivery: AriWebhookDelivery;
		try {
			delivery = await unwrapWebhookRequest(request, input);
		} catch (error) {
			if (error instanceof AriWebhookVerificationError || error instanceof AriWebhookPayloadError) {
				return Response.json({ error: 'Invalid webhook.' }, { status: 400 });
			}
			throw error;
		}
		const response = await input.on_event(delivery.event, {
			delivery_id: delivery.delivery_id,
			timestamp: delivery.timestamp
		});
		return response ?? new Response(null, { status: 204 });
	};
}

export const webhooks = Object.freeze({
	constructEvent: constructWebhookEvent,
	unwrap: unwrapWebhookRequest,
	verifySignature: verifyWebhookSignature,
	generateTestHeaders: generateTestWebhookHeaders,
	createHandler: createWebhookHandler
});
