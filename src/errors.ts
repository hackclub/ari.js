export type AriApiErrorCode =
	| 'already_queued'
	| 'bad_signature'
	| 'collaborators_not_enabled'
	| 'internal_error'
	| 'invalid_payload'
	| 'not_found'
	| 'not_queued'
	| 'unauthorized'
	| 'unknown_program';

export class AriError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = new.target.name;
	}
}

export class AriConfigurationError extends AriError {}

export class AriInputError extends AriError {
	readonly field: string | undefined;

	constructor(message: string, field?: string) {
		super(message);
		this.field = field;
	}
}

export class AriApiError extends AriError {
	readonly status: number;
	readonly code: AriApiErrorCode | (string & {});
	readonly field: string | undefined;
	readonly details: unknown;
	readonly retryable: boolean;

	constructor(input: {
		status: number;
		code: AriApiErrorCode | (string & {});
		field?: string;
		details: unknown;
		retryable: boolean;
	}) {
		const field = input.field ? `: ${input.field}` : '';
		super(`Ari request failed with status ${input.status} (${input.code}${field}).`);
		this.status = input.status;
		this.code = input.code;
		this.field = input.field;
		this.details = input.details;
		this.retryable = input.retryable;
	}
}

export class AriConnectionError extends AriError {}

export class AriTimeoutError extends AriConnectionError {
	readonly timeout_ms: number;

	constructor(timeout_ms: number, options?: ErrorOptions) {
		super(`Ari did not respond within ${timeout_ms}ms.`, options);
		this.timeout_ms = timeout_ms;
	}
}

export class AriResponseError extends AriError {
	readonly status: number;
	readonly body: string;

	constructor(status: number, body: string, options?: ErrorOptions) {
		super(`Ari returned an unreadable response with status ${status}.`, options);
		this.status = status;
		this.body = body;
	}
}

export type AriWebhookFailure =
	| 'invalid_delivery_id'
	| 'invalid_signature'
	| 'invalid_timestamp'
	| 'missing_delivery_id'
	| 'missing_signature'
	| 'missing_timestamp'
	| 'stale_timestamp';

export class AriWebhookVerificationError extends AriError {
	readonly reason: AriWebhookFailure;

	constructor(reason: AriWebhookFailure, message: string) {
		super(message);
		this.reason = reason;
	}
}

export class AriWebhookPayloadError extends AriError {}
