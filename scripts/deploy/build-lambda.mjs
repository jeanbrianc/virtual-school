// Bundles the AI helper Lambda into dist-lambda/ai-helper.zip (one file, no dependencies).
//   node scripts/deploy/build-lambda.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { root } from '../esbuild.shared.mjs';

const out = join(root, 'dist-lambda');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['scripts/ai-helper/lambda.ts'],
  // ESM (.mjs) so it's unambiguous everywhere; Lambda resolves index.handler to index.mjs.
  outfile: join(out, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: true,
  legalComments: 'none',
  define: { __AI_HELPER_URL__: '""' },
  logLevel: 'warning',
});

// -X: no extra file attributes, so the zip is reproducible enough for diffs.
execFileSync('zip', ['-q', '-X', '-j', join(out, 'ai-helper.zip'), join(out, 'index.mjs')]);
console.log(`Lambda bundle → ${join(out, 'ai-helper.zip')}`);
