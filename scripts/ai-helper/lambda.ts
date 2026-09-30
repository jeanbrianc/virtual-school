/**
 * The AI helper as an AWS Lambda (function URL), for the hosted site.
 *
 * CloudFront sends /api/* here after the family sign-in check, adding a secret
 * X-Origin-Verify header; anything without it (someone calling the function
 * URL directly) is refused before any work. Everything else — prompts, safety
 * rules, size and rate limits — is the same handler the local helper uses.
 *
 * Keys: the OpenAI key is read from AWS Secrets Manager (OPENAI_SECRET_ARN) on
 * first use and cached; an Anthropic key can come from ANTHROPIC_API_KEY.
 */
import { timingSafeEqual } from 'node:crypto';
import { lambdaCredentials, secretKeyReader } from './awsSecret';
import { AwsSyncStore } from './awsStore';
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
  isBase64Encoded?: boolean;
}

const env = process.env;
const secretArn = env.OPENAI_SECRET_ARN?.trim();
const limit = (v: string | undefined, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);

const helper = createHelper({
  apiKey: env.ANTHROPIC_API_KEY || undefined,
  openaiKey: secretArn ? secretKeyReader({ arn: secretArn, credentials: () => lambdaCredentials(env) }) : env.OPENAI_API_KEY || undefined,
  models: {
    ...(env.OPENAI_MODEL ? { openai: env.OPENAI_MODEL } : {}),
    ...(env.AI_MODEL ? { anthropic: env.AI_MODEL } : {}),
  },
  ...(env.OPENAI_VOICE_MODEL ? { voiceModel: env.OPENAI_VOICE_MODEL } : {}),
  ...(env.OPENAI_LISTEN_MODEL ? { listenModel: env.OPENAI_LISTEN_MODEL } : {}),
  perDay: limit(env.AI_DAILY_LIMIT, 300),
  speakPerDay: limit(env.AI_VOICE_DAILY_LIMIT, 1500),
  listenPerDay: limit(env.AI_LISTEN_DAILY_LIMIT, 500),
  extraOrigins: env.SITE_ORIGIN ? [env.SITE_ORIGIN] : [],
  // Family sync: records in DynamoDB, photos in S3 (both in this stack).
  ...(env.SYNC_TABLE && env.SYNC_BUCKET
    ? {
        syncStore: new AwsSyncStore({
          table: env.SYNC_TABLE,
          bucket: env.SYNC_BUCKET,
          region: env.AWS_REGION || 'us-east-1',
          credentials: () => lambdaCredentials(env),
        }),
      }
    : {}),
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
  // Audio goes back base64-encoded (how function URLs return binary bodies).
  if (typeof res.body !== 'string') {
    return { statusCode: res.status, headers: res.headers, body: Buffer.from(res.body).toString('base64'), isBase64Encoded: true };
  }
  return { statusCode: res.status, headers: res.headers, body: res.body };
}
