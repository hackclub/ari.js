import { createHmac } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { Ari, AriApiError, AriInputError, AriTimeoutError } from '../src/index.js';

import type { AriFetch, AriShipInput } from '../src/index.js';

const ship: AriShipInput = {
	external_id: 'project-123',
	title: 'Example Project',
	description: 'Example project description.',
	maker: {
		email: 'example@hackclub.com',
		name: 'Example',
		slack_id: 'U1234567890'
	},
	repo_url: 'https://github.com/example/project',
	demo_url: 'https://example.com/demo',
	thumbnail_url: 'https://example.com/image.png',
	hackatime_projects: ['example-project']
};

function mockFetch(handler: (request: Request) => Response | Promise<Response>): AriFetch {
	return async (input, init) => handler(new Request(input, init));
}

describe('Ari client', () => {
	test('sends and signs a ship without changing its JSON fields', async () => {
		let received: Request | undefined;
		const ari = new Ari({
			programId: 'program 123',
			signingSecret: 'whsec_ingest',
			maxRetries: 0,
			fetch: mockFetch((request) => {
				received = request;
				return Response.json(
					{ status: 'accepted', id: 'cm1234567890abcdefghijkl' },
					{ status: 202 }
				);
			})
		});

		await expect(ari.ships.create(ship)).resolves.toEqual({
			status: 'accepted',
			id: 'cm1234567890abcdefghijkl'
		});
		expect(received).toBeDefined();
		expect(received?.url).toBe('https://webhooks.ari.hackclub.com/api/ingest/program%20123');
		expect(received?.headers.get('content-type')).toBe('application/json');
		const body = await received?.text();
		expect(body).toBe(JSON.stringify(ship));
		expect(received?.headers.get('x-ari-signature')).toBe(
			createHmac('sha256', 'whsec_ingest')
				.update(body ?? '')
				.digest('hex')
		);
	});

	test('uses bearer authentication for a status lookup', async () => {
		let received: Request | undefined;
		const ari = new Ari({
			programId: 'program-123',
			signingSecret: 'whsec_ingest',
			fetch: mockFetch((request) => {
				received = request;
				return Response.json({
					id: 'cm1234567890abcdefghijkl',
					external_id: 'project/123',
					version: 2,
					phase: 'under_review',
					decision: null
				});
			})
		});

		await ari.ships.status({ external_id: 'project/123' });
		expect(received?.url).toBe(
			'https://webhooks.ari.hackclub.com/api/ingest/program-123/status?external_id=project%2F123'
		);
		expect(received?.headers.get('authorization')).toBe('Bearer whsec_ingest');
		expect(received?.headers.get('x-ari-signature')).toBeNull();
	});

	test('returns structured API errors', async () => {
		const ari = new Ari({
			programId: 'program-123',
			signingSecret: 'whsec_ingest',
			maxRetries: 0,
			fetch: mockFetch(() =>
				Response.json({ error: 'invalid_payload', field: 'title' }, { status: 422 })
			)
		});

		try {
			await ari.ships.create(ship);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(AriApiError);
			expect(error).toMatchObject({
				status: 422,
				code: 'invalid_payload',
				field: 'title',
				retryable: false
			});
		}
	});

	test('retries a safe create request with the same bytes', async () => {
		const bodies: string[] = [];
		let attempts = 0;
		const ari = new Ari({
			programId: 'program-123',
			signingSecret: 'whsec_ingest',
			maxRetries: 1,
			fetch: mockFetch(async (request) => {
				attempts += 1;
				bodies.push(await request.text());
				if (attempts === 1) return Response.json({ error: 'internal_error' }, { status: 500 });
				return Response.json({ status: 'duplicate', id: 'cm1234567890abcdefghijkl' });
			})
		});

		await expect(ari.ships.create(ship)).resolves.toEqual({
			status: 'duplicate',
			id: 'cm1234567890abcdefghijkl'
		});
		expect(bodies).toEqual([JSON.stringify(ship), JSON.stringify(ship)]);
	});

	test('does not retry withdrawal requests', async () => {
		let attempts = 0;
		const ari = new Ari({
			programId: 'program-123',
			signingSecret: 'whsec_ingest',
			maxRetries: 4,
			fetch: mockFetch(() => {
				attempts += 1;
				return Response.json({ error: 'internal_error' }, { status: 500 });
			})
		});

		await expect(ari.ships.withdraw('project-123')).rejects.toBeInstanceOf(AriApiError);
		expect(attempts).toBe(1);
	});

	test('times out stalled requests', async () => {
		const ari = new Ari({
			programId: 'program-123',
			signingSecret: 'whsec_ingest',
			maxRetries: 0,
			fetch: mockFetch(
				(request) =>
					new Promise((_resolve, reject) => {
						request.signal.addEventListener('abort', () =>
							reject(new DOMException('Aborted', 'AbortError'))
						);
					})
			)
		});

		await expect(
			ari.ships.status({ id: 'cm1234567890abcdefghijkl' }, { timeout_ms: 5 })
		).rejects.toBeInstanceOf(AriTimeoutError);
	});

	test('rejects common payload mistakes before sending', async () => {
		const ari = new Ari({
			programId: 'program-123',
			signingSecret: 'whsec_ingest',
			fetch: mockFetch(() => Response.json({ status: 'accepted', id: 'unused' }))
		});
		const invalid = {
			...ship,
			hackatime_projects: [],
			collaborators: [{ email: 'same@example.com' }, { email: 'SAME@example.com' }]
		} as AriShipInput;

		await expect(ari.ships.create(invalid)).rejects.toBeInstanceOf(AriInputError);
	});
});
