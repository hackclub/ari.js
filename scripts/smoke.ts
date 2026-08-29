import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dir, '..');
const esm = (await import(pathToFileURL(resolve(root, 'dist/index.js')).href)) as Record<
	string,
	unknown
>;
const cjs = createRequire(import.meta.url)(resolve(root, 'dist-cjs/index.js')) as Record<
	string,
	unknown
>;
const expected = ['Ari', 'AriApiError', 'constructWebhookEvent', 'webhooks'];

for (const name of expected) {
	if (typeof esm[name] === 'undefined') throw new Error(`ESM build does not export ${name}.`);
	if (typeof cjs[name] === 'undefined') throw new Error(`CommonJS build does not export ${name}.`);
}
