import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const dist = resolve(root, 'dist');
const distCjs = resolve(root, 'dist-cjs');

await Promise.all([
	rm(dist, { recursive: true, force: true }),
	rm(distCjs, { recursive: true, force: true })
]);

const tsc = Bun.which('tsc');
if (!tsc) throw new Error('TypeScript is not installed. Run bun install first.');

for (const config of ['tsconfig.build.json', 'tsconfig.cjs.json']) {
	const compiler = Bun.spawn([tsc, '-p', config], {
		cwd: root,
		stdout: 'inherit',
		stderr: 'inherit'
	});
	if ((await compiler.exited) !== 0) throw new Error(`Build failed for ${config}.`);
}

await Bun.write(resolve(distCjs, 'package.json'), '{"type":"commonjs"}\n');
