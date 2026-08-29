import { describe, expect, test } from 'bun:test';

import { Ari, AriConfigurationError, AriInputError } from '../src/index.js';
import { validateLookup, validateShip } from '../src/validation.js';

import type { AriShipInput } from '../src/index.js';

const valid: AriShipInput = {
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

function invalid(change: Record<string, unknown>): AriShipInput {
	return { ...valid, ...change } as AriShipInput;
}

describe('Ari input validation', () => {
	test('accepts hardware with program-provided time', () => {
		const { demo_url: _demoUrl, ...hardware } = valid;
		expect(() =>
			validateShip({
				...hardware,
				track: 'hardware',
				hackatime_projects: [],
				maker: { ...valid.maker, program_hours: 2 }
			})
		).not.toThrow();
	});

	test('accepts collaborative journals and flat metadata', () => {
		expect(() =>
			validateShip({
				...valid,
				collaborators: [
					{
						email: 'example@hackclub.com',
						name: 'Example',
						slack_id: 'U1234567890',
						hackatime_id: '42',
						hackatime_projects: ['example-project']
					},
					{ email: 'example2@hackclub.com', program_minutes: 60 }
				],
				journals: [
					{
						at: new Date('2026-08-20T12:00:00Z'),
						hours: 1,
						text: 'Built it',
						markdown: '**Built it**',
						email: 'example2@hackclub.com'
					}
				],
				meta: { source: 'test', git: ['https://github.com/example/extra'], active: true }
			})
		).not.toThrow();
	});

	test.each([
		[invalid({ external_id: ' ' }), 'external_id'],
		[invalid({ repo_url: 'javascript:alert(1)' }), 'repo_url'],
		[invalid({ demo_url: undefined }), 'demo_url'],
		[invalid({ track: 'paper' }), 'track'],
		[invalid({ maker: { ...valid.maker, slack_id: '' } }), 'maker.slack_id'],
		[invalid({ maker: { ...valid.maker, program_hours: 1_001 } }), 'maker'],
		[invalid({ evidence: ['unknown'] }), 'evidence'],
		[invalid({ hackatime_projects: [42] }), 'hackatime_projects'],
		[invalid({ shipped_at: 'not-a-date' }), 'shipped_at'],
		[
			invalid({
				hackatime_projects: [],
				journals: [],
				maker: { ...valid.maker, program_minutes: 0 }
			}),
			'hackatime_projects'
		]
	])('rejects an invalid ship field', (ship, field) => {
		expect(() => validateShip(ship as AriShipInput)).toThrow(AriInputError);
		try {
			validateShip(ship as AriShipInput);
		} catch (error) {
			expect(error).toMatchObject({ field });
		}
	});

	test('rejects duplicate and excessive collaborators', () => {
		expect(() =>
			validateShip(
				invalid({
					collaborators: [{ email: 'same@example.com' }, { email: ' SAME@example.com ' }]
				})
			)
		).toThrow(AriInputError);
		expect(() =>
			validateShip(
				invalid({
					collaborators: Array.from({ length: 11 }, (_, index) => ({
						email: `${index}@example.com`
					}))
				})
			)
		).toThrow(AriInputError);
	});

	test('rejects malformed collaborator fields', () => {
		expect(() =>
			validateShip(
				invalid({ collaborators: [{ email: 'example@hackclub.com', hackatime_projects: [42] }] })
			)
		).toThrow(AriInputError);
		expect(() =>
			validateShip(invalid({ collaborators: [{ email: 'maker@example.com', name: 42 }] }))
		).toThrow(AriInputError);
	});

	test('rejects malformed journals', () => {
		for (const entry of [
			{ at: 'bad', minutes: 5, text: 'Work' },
			{ at: '2026-08-20', text: 'Work' },
			{ at: '2026-08-20', minutes: 1_441, text: 'Work' },
			{ at: '2026-08-20', minutes: 5, text: ' ' }
		]) {
			expect(() => validateShip(invalid({ journals: [entry] }))).toThrow(AriInputError);
		}
		expect(() =>
			validateShip(
				invalid({
					collaborators: [{ email: 'maker@example.com' }],
					journals: [{ at: '2026-08-20', minutes: 5, text: 'Work', email: 'other@example.com' }]
				})
			)
		).toThrow(AriInputError);
	});

	test('rejects nested or oversized metadata', () => {
		expect(() => validateShip(invalid({ meta: { nested: { value: true } } }))).toThrow(
			AriInputError
		);
		expect(() => validateShip(invalid({ meta: { nested: [[true]] } }))).toThrow(AriInputError);
		expect(() =>
			validateShip(
				invalid({
					meta: Object.fromEntries(
						Array.from({ length: 25 }, (_, index) => [`key-${index}`, index])
					)
				})
			)
		).toThrow(AriInputError);
	});

	test('requires exactly one status lookup key', () => {
		expect(() => validateLookup({} as never)).toThrow(AriInputError);
		expect(() =>
			validateLookup({ id: 'cm1234567890abcdefghijkl', external_id: 'project-123' } as never)
		).toThrow(AriInputError);
		expect(() => validateLookup({ id: 'cm1234567890abcdefghijkl' })).not.toThrow();
	});

	test('validates client configuration', () => {
		expect(() => new Ari({ programId: '', signingSecret: 'secret' })).toThrow(
			AriConfigurationError
		);
		expect(() => new Ari({ programId: 'program', signingSecret: '' })).toThrow(
			AriConfigurationError
		);
		expect(
			() => new Ari({ programId: 'program', signingSecret: 'secret', baseUrl: 'file:///tmp/ari' })
		).toThrow(AriConfigurationError);
		expect(() => new Ari({ programId: 'program', signingSecret: 'secret', timeoutMs: 0 })).toThrow(
			AriConfigurationError
		);
		expect(
			() => new Ari({ programId: 'program', signingSecret: 'secret', maxRetries: 11 })
		).toThrow(AriConfigurationError);
	});
});
