// Production build: `npm run build` → dist/
// Pass --e2e to include the test automation hooks used by Playwright.
import * as esbuild from 'esbuild';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyPublic, ensureDir, esbuildOptions, root, writeIndexHtml } from './esbuild.shared.mjs';

const e2e = process.argv.includes('--e2e');
const outdir = join(root, e2e ? 'dist-e2e' : 'dist');

rmSync(outdir, { recursive: true, force: true });
ensureDir(outdir);
copyPublic(outdir);

const result = await esbuild.build(esbuildOptions({ mode: 'production', e2e, outdir }));
writeIndexHtml(outdir, result.metafile);
writeFileSync(join(outdir, 'meta.json'), JSON.stringify(result.metafile));

const sizes = Object.entries(result.metafile.outputs)
  .filter(([file]) => file.endsWith('.js') || file.endsWith('.css'))
  .map(([file, meta]) => `${(meta.bytes / 1024).toFixed(0).padStart(6)} kB  ${file.replace(root + '/', '')}`);
console.log(`\nBuilt ${e2e ? 'e2e ' : ''}bundle → ${outdir}\n${sizes.join('\n')}`);
