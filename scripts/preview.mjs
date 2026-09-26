// Serves the production build from dist/ (or dist-e2e with --e2e): `npm run preview`
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { root } from './esbuild.shared.mjs';

const dir = join(root, process.argv.includes('--e2e') ? 'dist-e2e' : 'dist');
const port = Number(process.env.PORT ?? 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(dir)) {
  console.error(`No build found at ${dir}. Run "npm run build" first.`);
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = normalize(join(dir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dir)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
  res.writeHead(200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    // Local-first privacy posture: no third-party requests are ever needed.
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:",
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Preview → http://127.0.0.1:${port}`));
