import { describe, expect, test } from 'bun:test';

import {
	AriWebhookVerificationError,
	constructWebhookEvent,
	createWebhookHandler,
	generateTestWebhookHeaders,
	unwrapWebhookRequest,
	verifyWebhookSignature
} from '../src/index.js';

const timestamp = 1_751_500_000;
const now = new Date(timestamp * 1_000);
const secret = 'whsec_outbound';
const deliveryId = 'delivery_123';
const body = JSON.stringify({
	event: 'ship.updated',
	id: 'cm1234567890abcdefghijkl',
	external_id: 'project-123',
	ship: {},
	edited_by: null,
	changes: []
});

async function headers(payload = body) {
	return generateTestWebhookHeaders(payload, {
		secret,
		delivery_id: deliveryId,
		timestamp
	});
}

describe('Ari outbound webhooks', () => {
	test('verifies and constructs a typed delivery', async () => {
		const delivery = await constructWebhookEvent(body, await headers(), { secret, now });
		expect(delivery.delivery_id).toBe(deliveryId);
		expect(delivery.timestamp).toBe(timestamp);
		expect(delivery.event.event).toBe('ship.updated');
		if (delivery.event.event === 'ship.updated') {
			expect(delivery.event.external_id).toBe('project-123');
		}
	});

	test('accepts case-insensitive header names', async () => {
		const signed = await headers();
		const lower = Object.fromEntries(
			Object.entries(signed).map(([key, value]) => [key.toLowerCase(), value])
		);
		await expect(verifyWebhookSignature(body, lower, { secret, now })).resolves.toBe(true);
	});

	test('rejects a modified body', async () => {
		await expect(
			constructWebhookEvent(`${body} `, await headers(), { secret, now })
		).rejects.toMatchObject({
			reason: 'invalid_signature'
		});
	});

	test('rejects timestamps outside the tolerance window', async () => {
		await expect(
			constructWebhookEvent(body, await headers(), {
				secret,
				now: new Date((timestamp + 301) * 1_000)
			})
		).rejects.toMatchObject({ reason: 'stale_timestamp' });
	});

	test('preserves unknown events for forward-compatible handling', async () => {
		const unknownBody = JSON.stringify({ event: 'review.new_event', value: 42 });
		const delivery = await constructWebhookEvent(unknownBody, await headers(unknownBody), {
			secret,
			now
		});
		expect(delivery.event).toEqual({
			event: 'unknown',
			event_name: 'review.new_event',
			payload: { event: 'review.new_event', value: 42 }
		});
	});

	test('unwraps a Web Request without pre-parsing the body', async () => {
		const request = new Request('https://program.example/webhooks/ari', {
			method: 'POST',
			headers: await headers(),
			body
		});
		const delivery = await unwrapWebhookRequest(request, { secret, now });
		expect(delivery.delivery_id).toBe(deliveryId);
	});

	test('creates a portable request handler', async () => {
		const seen: string[] = [];
		const handler = createWebhookHandler({
			secret,
			now,
			on_event(event, context) {
				seen.push(`${context.delivery_id}:${event.event}`);
			}
		});
		const response = await handler(
			new Request('https://program.example/webhooks/ari', {
				method: 'POST',
				headers: await headers(),
				body
			})
		);
		expect(response.status).toBe(204);
		expect(seen).toEqual([`${deliveryId}:ship.updated`]);
	});

	test('returns a plain 400 response for untrusted requests', async () => {
		const handler = createWebhookHandler({ secret, now, on_event() {} });
		const response = await handler(
			new Request('https://program.example/webhooks/ari', { method: 'POST', body })
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid webhook.' });
	});

	test('throws a specific error when a required header is missing', async () => {
		try {
			await constructWebhookEvent(body, {}, { secret, now });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(AriWebhookVerificationError);
			expect(error).toMatchObject({ reason: 'missing_signature' });
		}
	});
});
