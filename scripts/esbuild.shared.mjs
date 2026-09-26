// Shared esbuild configuration for dev, build and e2e builds.
// esbuild is used directly (rather than Vite) so the toolchain stays tiny,
// fast, and fully offline-capable. See docs/ARCHITECTURE.md → "Toolchain".
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {{ mode: 'development' | 'production', e2e?: boolean, outdir: string }} opts */
export function esbuildOptions({ mode, e2e = false, outdir }) {
  const isProd = mode === 'production';
  return {
    absWorkingDir: root,
    entryPoints: { app: 'src/main.tsx' },
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: join(outdir, 'assets'),
    entryNames: isProd ? '[name]-[hash]' : '[name]',
    chunkNames: isProd ? 'chunk-[name]-[hash]' : 'chunk-[name]',
    assetNames: isProd ? '[name]-[hash]' : '[name]',
    metafile: true,
    sourcemap: isProd ? 'linked' : 'inline',
    minify: isProd,
    target: ['es2022', 'chrome111', 'safari16.4', 'firefox115'],
    jsx: 'automatic',
    loader: { '.woff': 'file', '.woff2': 'file', '.png': 'file', '.glb': 'file' },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      __BUILD_MODE__: JSON.stringify(mode),
      __E2E__: JSON.stringify(e2e),
      __APP_VERSION__: JSON.stringify(readPackageVersion()),
    },
    logLevel: 'info',
  };
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Writes index.html referencing the produced entry JS/CSS (relative URLs so the
 * build can be hosted from any sub-path or opened from a static file server).
 */
export function writeIndexHtml(outdir, metafile, { liveReload = false } = {}) {
  const outputs = Object.entries(metafile.outputs);
  const entry = outputs.find(([, meta]) => meta.entryPoint === 'src/main.tsx');
  if (!entry) throw new Error('Could not locate app entry in metafile');
  const jsFile = entry[0].split('/assets/').pop();
  const cssFile = entry[1].cssBundle ? entry[1].cssBundle.split('/assets/').pop() : null;
  const template = readFileSync(join(root, 'index.html'), 'utf8');
  const tags = [
    cssFile ? `<link rel="stylesheet" href="./assets/${cssFile}" />` : '',
    `<script type="module" src="./assets/${jsFile}"></script>`,
    liveReload
      ? `<script>new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>`
      : '',
  ]
    .filter(Boolean)
    .join('\n    ');
  writeFileSync(join(outdir, 'index.html'), template.replace('<!-- app:assets -->', tags));
}

export function copyPublic(outdir) {
  const pub = join(root, 'public');
  if (existsSync(pub)) cpSync(pub, outdir, { recursive: true });
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}
