import { describe, expect, test } from 'bun:test';

import { joinBytes, sign, toBytes, verify } from '../src/crypto.js';

const fixture = {
	secret: 'whsec_test-signing-secret',
	body: '{"external_id":"proj-1","title":"Test — ship é漢"}',
	inbound: 'd32f82feca09b6b44f96de35d3a1255d1b5b7f64e635b421cbb73a7f91c80dcd',
	timestamp: 1_751_500_000,
	deliveryId: 'cmcka1b2c3d4e5f6g7h8i9j0k',
	outbound: 'a604592b33cb83d8c719f8b0813b5e898f78654191642699c421c67dab9d9799'
};

describe('Ari signatures', () => {
	test('matches the ingest compatibility vector', async () => {
		expect(await sign(fixture.secret, toBytes(fixture.body))).toBe(fixture.inbound);
		expect(
			await verify(fixture.secret, toBytes(fixture.body), `  ${fixture.inbound.toUpperCase()} `)
		).toBe(true);
		expect(await verify(fixture.secret, toBytes(`${fixture.body}x`), fixture.inbound)).toBe(false);
	});

	test('matches the outbound compatibility vector', async () => {
		const payload = joinBytes(`${fixture.timestamp}.${fixture.deliveryId}.`, toBytes(fixture.body));
		expect(await sign(fixture.secret, payload)).toBe(fixture.outbound);
	});
});
