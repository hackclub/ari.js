import { AriConfigurationError } from './errors.js';

export type AriBody = string | ArrayBuffer | ArrayBufferView;

const encoder = new TextEncoder();

export function toBytes(body: AriBody): Uint8Array<ArrayBuffer> {
	if (typeof body === 'string') return encoder.encode(body);
	if (ArrayBuffer.isView(body)) {
		const output = new Uint8Array(body.byteLength);
		output.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
		return output;
	}
	return new Uint8Array(body.slice(0));
}

function subtle(): SubtleCrypto {
	if (!globalThis.crypto?.subtle) {
		throw new AriConfigurationError('This runtime does not provide the Web Crypto API.');
	}
	return globalThis.crypto.subtle;
}

async function key(secret: string, usage: KeyUsage): Promise<CryptoKey> {
	return subtle().importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		[usage]
	);
}

export async function sign(secret: string, data: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await subtle().sign('HMAC', await key(secret, 'sign'), data);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verify(
	secret: string,
	data: Uint8Array<ArrayBuffer>,
	signature: string
): Promise<boolean> {
	const normalized = signature.trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(normalized)) return false;
	const bytes = new Uint8Array(32);
	for (let index = 0; index < normalized.length; index += 2) {
		bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
	}
	return subtle().verify('HMAC', await key(secret, 'verify'), bytes, data);
}

export function joinBytes(prefix: string, body: Uint8Array): Uint8Array<ArrayBuffer> {
	const prefixBytes = encoder.encode(prefix);
	const joined = new Uint8Array(prefixBytes.byteLength + body.byteLength);
	joined.set(prefixBytes);
	joined.set(body, prefixBytes.byteLength);
	return joined;
}
