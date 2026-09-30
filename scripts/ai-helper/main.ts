/**
 * Starts the local AI helper on 127.0.0.1 (never on the network).
 *   npm run ai-helper        (npm run dev starts it automatically when a key is set)
 * Configuration comes from .env.local (see .env.example).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AI_MODEL } from '../../src/domain/teachers/aiPrompt';
import { createHelper, MAX_BODY } from './handler';
import { DEFAULT_OPENAI_MODEL } from './openai';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const env = { ...loadEnvFile(join(root, '.env')), ...loadEnvFile(join(root, '.env.local')), ...process.env };
const port = Number(env.AI_HELPER_PORT ?? 8787);
const handle = createHelper({
  apiKey: env.ANTHROPIC_API_KEY || undefined,
  openaiKey: env.OPENAI_API_KEY || undefined,
  models: {
    ...(env.OPENAI_MODEL ? { openai: env.OPENAI_MODEL } : {}),
    ...(env.AI_MODEL ? { anthropic: env.AI_MODEL } : {}),
  },
  perDay: Number(env.AI_DAILY_LIMIT ?? 300),
  extraOrigins: (env.AI_HELPER_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  log: (msg) => console.info(`  [ai-helper] ${msg}`),
});

createServer((req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size <= MAX_BODY + 1024) chunks.push(c);
  });
  req.on('end', () => {
    void handle({
      method: req.method ?? 'GET',
      path: (req.url ?? '/').split('?')[0] ?? '/',
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v])),
      body: Buffer.concat(chunks).toString('utf8'),
    }).then((r) => {
      res.writeHead(r.status, r.headers);
      res.end(typeof r.body === 'string' ? r.body : Buffer.from(r.body));
    });
  });
}).listen(port, '127.0.0.1', () => {
  const limit = env.AI_DAILY_LIMIT ?? 300;
  console.info(
    env.OPENAI_API_KEY
      ? `  AI helper → http://127.0.0.1:${port} (OpenAI ${env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL} + natural voices + listening; up to ${limit} replies/day)`
      : env.ANTHROPIC_API_KEY
        ? `  AI helper → http://127.0.0.1:${port} (Claude ${env.AI_MODEL || DEFAULT_AI_MODEL}; up to ${limit} replies/day)`
        : `  AI helper → http://127.0.0.1:${port} — no OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local, so AI teachers stay off.`,
  );
});
