/**
 * The hosted site's front door: the branded welcome page with the family
 * sign-in, served through the real edge function from infra/aws/stack.yaml
 * (run here in a tiny local server in front of the e2e build).
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { expect, test } from 'playwright/test';

const root = new URL('../..', import.meta.url).pathname;
const dist = join(root, 'dist-e2e');
const PORT = 4311;
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

type EdgeResult = {
  uri?: string;
  statusCode?: number;
  headers: Record<string, { value: string }>;
  cookies?: Record<string, { value: string; attributes?: string }>;
};

function edgeFunction(): (event: unknown) => EdgeResult {
  const lines = readFileSync(join(root, 'infra/aws/stack.yaml'), 'utf8').split('\n');
  const start = lines.findIndex((l) => /^\s+FunctionCode: !Sub \|\s*$/.test(l));
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith('        ')) break;
    body.push(line.slice(8));
  }
  const hash = createHash('sha256')
    .update(`Basic ${Buffer.from('family:open sesame').toString('base64')}`)
    .digest('hex');
  const code = body.join('\n').replace('${BasicAuthHash}', hash).replace('${SessionSecret}', 'z'.repeat(64));
  return new Function('require', `${code}\nreturn handler;`)(createRequire(import.meta.url)) as (event: unknown) => EdgeResult;
}

let server: Server;

test.beforeAll(async () => {
  const edge = edgeFunction();
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const cookies: Record<string, { value: string }> = {};
    for (const part of (req.headers.cookie ?? '').split(/;\s*/)) {
      const i = part.indexOf('=');
      if (i > 0) cookies[part.slice(0, i)] = { value: part.slice(i + 1) };
    }
    const headers: Record<string, { value: string }> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k] = { value: v };
    const out = edge({ request: { uri: url.pathname, method: req.method, headers, cookies } });
    if (out.statusCode) {
      const h: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(out.headers)) h[k] = v.value;
      if (out.cookies) h['set-cookie'] = Object.entries(out.cookies).map(([k, v]) => `${k}=${v.value}; ${v.attributes ?? ''}`);
      res.writeHead(out.statusCode, h).end();
      return;
    }
    let file = normalize(join(dist, out.uri === '/' ? '/index.html' : decodeURIComponent(out.uri!)));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('the welcome page signs the family in, and only then opens the school', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await expect(page.getByRole('heading', { name: 'Family sign-in' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('feel like play');

  // The school's files stay closed until sign-in.
  const blocked = await page.request.get(`http://127.0.0.1:${PORT}/api/health`);
  expect(blocked.status()).toBe(401);

  await page.getByLabel('Username').fill('family');
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: /Open the school/ }).click();
  await expect(page.locator('#signin-status')).toContainText('didn’t work');

  await page.getByLabel('Password').fill('open sesame');
  await page.getByRole('button', { name: /Open the school/ }).click();
  await expect(page.getByTestId('enter-izzy')).toBeVisible({ timeout: 60_000 });

  // Signing out brings the welcome page back.
  await page.goto(`http://127.0.0.1:${PORT}/auth/logout`);
  await expect(page.getByRole('heading', { name: 'Family sign-in' })).toBeVisible();
  expect(errors).toEqual([]);
});
