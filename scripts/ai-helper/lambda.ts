/**
 * The AI helper as an AWS Lambda (function URL), for the hosted site.
 *
 * CloudFront sends /api/* here after the site password check, adding a secret
 * X-Origin-Verify header; anything without it (someone calling the function
 * URL directly) is refused before any work. Everything else — prompts, safety
 * rules, size and rate limits — is the same handler the local helper uses.
 */
import { timingSafeEqual } from 'node:crypto';
import { createHelper } from './handler';

interface FunctionUrlEvent {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const env = process.env;
const helper = createHelper({
  apiKey: env.ANTHROPIC_API_KEY || undefined,
  ...(env.AI_MODEL ? { model: env.AI_MODEL } : {}),
  perDay: Number(env.AI_DAILY_LIMIT || 300),
  extraOrigins: env.SITE_ORIGIN ? [env.SITE_ORIGIN] : [],
  log: (msg) => console.info(msg),
});

function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResult> {
  const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (!sameSecret(headers['x-origin-verify'], env.ORIGIN_SECRET)) {
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: '{"error":"Forbidden"}' };
  }
  const path = (event.rawPath ?? '/').replace(/^\/api(?=\/|$)/, '') || '/';
  const body = event.body === undefined ? undefined : event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const res = await helper({
    method: event.requestContext?.http?.method ?? 'GET',
    path,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  return { statusCode: res.status, headers: res.headers, body: res.body };
}
