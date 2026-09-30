/**
 * Reads the OpenAI key from AWS Secrets Manager — a small, dependency-free
 * GetSecretValue call signed with AWS Signature Version 4, using the Lambda's
 * own role credentials (from its environment). The secret can live in another
 * region than the Lambda (its ARN says where). The value is cached for an hour,
 * so a rotated key is picked up without a redeploy.
 */
import { createHash, createHmac } from 'node:crypto';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export const sha256 = (data: string | Uint8Array) =>
  (typeof data === 'string' ? createHash('sha256').update(data, 'utf8') : createHash('sha256').update(data)).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();

/**
 * AWS Signature Version 4 for a request with no query string (DynamoDB,
 * Secrets Manager, S3 objects). Returns the headers to send (including
 * Authorization and X-Amz-Date). For S3, pass `x-amz-content-sha256`.
 */
export function signV4(req: {
  method: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string | Uint8Array;
  region: string;
  service: string;
  credentials: AwsCredentials;
  amzDate: string; // YYYYMMDDTHHMMSSZ
}): Record<string, string> {
  const date = req.amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...req.headers, host: req.host, 'x-amz-date': req.amzDate };
  if (req.credentials.sessionToken) headers['x-amz-security-token'] = req.credentials.sessionToken;
  const names = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')]));
  const signedHeaders = names.join(';');
  const payloadHash = lower['x-amz-content-sha256'] ?? sha256(req.body);
  const canonical = [req.method, req.path, '', ...names.map((n) => `${n}:${lower[n]}`), '', signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${req.region}/${req.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', req.amzDate, scope, sha256(canonical)].join('\n');
  const kDate = hmac(`AWS4${req.credentials.secretAccessKey}`, date);
  const kSigning = hmac(hmac(hmac(kDate, req.region), req.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign, 'utf8').digest('hex');
  const { host: _host, ...rest } = headers;
  return {
    ...rest,
    Authorization: `AWS4-HMAC-SHA256 Credential=${req.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** The region inside a Secrets Manager ARN (arn:aws:secretsmanager:<region>:<account>:secret:<name>). */
export function regionOfSecretArn(arn: string): string | null {
  const m = /^arn:aws[a-z-]*:secretsmanager:([a-z0-9-]+):\d{12}:secret:.+$/.exec(arn.trim());
  return m ? m[1]! : null;
}

/**
 * The API key inside a secret: either the whole SecretString ("sk-…"), or one
 * field of a JSON secret (OPENAI_API_KEY, api_key, apiKey, key, or the only / first "sk-…" value).
 */
export function apiKeyFromSecretString(secret: string): string | null {
  const s = secret.trim();
  if (!s) return null;
  if (!s.startsWith('{')) return s;
  try {
    const obj = JSON.parse(s) as Record<string, unknown>;
    for (const k of ['OPENAI_API_KEY', 'openai_api_key', 'api_key', 'apiKey', 'apikey', 'key', 'openai']) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const values = Object.values(obj).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return values.find((v) => v.trim().startsWith('sk-'))?.trim() ?? (values.length === 1 ? values[0]!.trim() : null);
  } catch {
    return null;
  }
}

export interface SecretReaderOptions {
  arn: string;
  credentials: () => AwsCredentials | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
}

/** A cached reader for one secret's API key. Never logs or returns the key in an error. */
export function secretKeyReader(opts: SecretReaderOptions): () => Promise<string | undefined> {
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = opts.now ?? (() => Date.now());
  const ttl = opts.ttlMs ?? 60 * 60 * 1000;
  let cached: { value: string; at: number } | null = null;
  let pending: Promise<string | undefined> | null = null;

  async function load(): Promise<string | undefined> {
    const region = regionOfSecretArn(opts.arn);
    if (!region) throw new Error('OPENAI_SECRET_ARN is not a Secrets Manager ARN');
    const credentials = opts.credentials();
    if (!credentials) throw new Error('no AWS credentials in the environment');
    const host = `secretsmanager.${region}.amazonaws.com`;
    const body = JSON.stringify({ SecretId: opts.arn });
    const amzDate = new Date(now())
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    const headers = signV4({
      method: 'POST',
      host,
      path: '/',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'secretsmanager.GetSecretValue' },
      body,
      region,
      service: 'secretsmanager',
      credentials,
      amzDate,
    });
    const res = await fetchImpl(`https://${host}/`, { method: 'POST', headers, body });
    if (!res.ok) {
      // Only the error type (e.g. AccessDeniedException) — never the response body, which could echo the ARN.
      const type = res.headers.get('x-amzn-errortype')?.split(':')[0] ?? `HTTP ${res.status}`;
      throw new Error(`Secrets Manager refused (${type})`);
    }
    const data = (await res.json()) as { SecretString?: unknown };
    const key = typeof data.SecretString === 'string' ? apiKeyFromSecretString(data.SecretString) : null;
    if (!key) throw new Error('the secret has no API key in it');
    cached = { value: key, at: now() };
    return key;
  }

  return async () => {
    if (cached && now() - cached.at < ttl) return cached.value;
    pending ??= load().finally(() => {
      pending = null;
    });
    return pending;
  };
}

/** The Lambda role's credentials (Lambda puts them in the environment). */
export function lambdaCredentials(env: NodeJS.ProcessEnv = process.env): AwsCredentials | null {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) return null;
  return {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
  };
}
