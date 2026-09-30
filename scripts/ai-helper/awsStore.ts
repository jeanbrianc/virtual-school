/**
 * Family sync storage on AWS, without the AWS SDK: signed HTTPS calls
 * (Signature Version 4, awsSecret.ts) with the Lambda role's credentials.
 *
 *  • Records → one DynamoDB table (on-demand, point-in-time recovery on):
 *      pk "family", sk "<table>/<id>", mod, changedAt, deleted, data (JSON)
 *    A conditional write keeps only newer versions. The "byChange" index
 *    (pk + changedAt) answers "what changed since…". The summary lives at
 *    sk "_summary" (no changedAt, so it's not in the index).
 *  • Photos → a private, versioned S3 bucket at media/<id>.
 */
import type { RecordChange, ServerChange, SyncSummary } from '../../src/sync/protocol';
import { sha256, signV4, type AwsCredentials } from './awsSecret';
import type { SyncStore } from './sync';

type Attr = { S?: string; N?: string; BOOL?: boolean };
type Item = Record<string, Attr>;

const PK = 'family';

export interface AwsStoreOptions {
  table: string;
  bucket: string;
  region: string;
  credentials: () => AwsCredentials | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const amzDate = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export class AwsSyncStore implements SyncStore {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly opts: AwsStoreOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    this.now = opts.now ?? (() => Date.now());
  }

  private creds(): AwsCredentials {
    const c = this.opts.credentials();
    if (!c) throw new Error('no AWS credentials in the environment');
    return c;
  }

  /** One DynamoDB JSON API call. Returns the parsed body, or throws with the error type only. */
  private async dynamo<T>(action: string, payload: unknown): Promise<{ ok: true; body: T } | { ok: false; type: string }> {
    const host = `dynamodb.${this.opts.region}.amazonaws.com`;
    const body = JSON.stringify(payload);
    const headers = signV4({
      method: 'POST',
      host,
      path: '/',
      headers: { 'content-type': 'application/x-amz-json-1.0', 'x-amz-target': `DynamoDB_20120810.${action}` },
      body,
      region: this.opts.region,
      service: 'dynamodb',
      credentials: this.creds(),
      amzDate: amzDate(this.now()),
    });
    const res = await this.fetchImpl(`https://${host}/`, { method: 'POST', headers, body });
    const json = (await res.json().catch(() => ({}))) as { __type?: string };
    if (res.ok) return { ok: true, body: json as T };
    return { ok: false, type: (json.__type ?? `HTTP ${res.status}`).split('#').pop()! };
  }

  async put(change: RecordChange, changedAt: number): Promise<boolean> {
    const item: Item = {
      pk: { S: PK },
      sk: { S: `${change.table}/${change.id}` },
      tbl: { S: change.table },
      rid: { S: change.id },
      mod: { S: change.mod },
      changedAt: { N: String(changedAt) },
      ...(change.deleted ? { deleted: { BOOL: true } } : { data: { S: JSON.stringify(change.data ?? {}) } }),
    };
    const res = await this.dynamo('PutItem', {
      TableName: this.opts.table,
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk) OR #m < :m',
      ExpressionAttributeNames: { '#m': 'mod' },
      ExpressionAttributeValues: { ':m': { S: change.mod } },
    });
    if (res.ok) return true;
    if (res.type === 'ConditionalCheckFailedException') return false;
    throw new Error(`DynamoDB PutItem failed (${res.type})`);
  }

  async changesSince(since: number, page: string | null, limit: number): Promise<{ changes: ServerChange[]; next: string | null }> {
    const start = page ? decodePage(page) : null;
    const res = await this.dynamo<{ Items?: Item[]; LastEvaluatedKey?: Item }>('Query', {
      TableName: this.opts.table,
      IndexName: 'byChange',
      KeyConditionExpression: 'pk = :p AND changedAt > :s',
      ExpressionAttributeValues: { ':p': { S: PK }, ':s': { N: String(Math.floor(since)) } },
      Limit: limit,
      ...(start ? { ExclusiveStartKey: start } : {}),
    });
    if (!res.ok) throw new Error(`DynamoDB Query failed (${res.type})`);
    const changes = (res.body.Items ?? []).map(fromItem).filter((c): c is ServerChange => !!c);
    return { changes, next: res.body.LastEvaluatedKey ? encodePage(res.body.LastEvaluatedKey) : null };
  }

  async getSummary(): Promise<SyncSummary | null> {
    const res = await this.dynamo<{ Item?: Item }>('GetItem', {
      TableName: this.opts.table,
      Key: { pk: { S: PK }, sk: { S: '_summary' } },
      ConsistentRead: true,
    });
    if (!res.ok) throw new Error(`DynamoDB GetItem failed (${res.type})`);
    const raw = res.body.Item?.data?.S;
    return raw ? (JSON.parse(raw) as SyncSummary) : null;
  }

  async putSummary(summary: SyncSummary): Promise<void> {
    const res = await this.dynamo('PutItem', {
      TableName: this.opts.table,
      Item: { pk: { S: PK }, sk: { S: '_summary' }, data: { S: JSON.stringify(summary) } },
    });
    if (!res.ok) throw new Error(`DynamoDB PutItem failed (${res.type})`);
  }

  private s3(method: 'GET' | 'PUT', id: string, body: Uint8Array = new Uint8Array(), type?: string) {
    const host = `${this.opts.bucket}.s3.${this.opts.region}.amazonaws.com`;
    const path = `/media/${encodeURIComponent(id)}`;
    const headers = signV4({
      method,
      host,
      path,
      headers: { 'x-amz-content-sha256': sha256(body), ...(type ? { 'content-type': type } : {}) },
      body,
      region: this.opts.region,
      service: 's3',
      credentials: this.creds(),
      amzDate: amzDate(this.now()),
    });
    return this.fetchImpl(`https://${host}${path}`, { method, headers, ...(method === 'PUT' ? { body: Buffer.from(body) } : {}) });
  }

  async putMedia(id: string, bytes: Uint8Array, type: string): Promise<void> {
    const res = await this.s3('PUT', id, bytes, type);
    if (!res.ok) throw new Error(`S3 PutObject failed (HTTP ${res.status})`);
  }

  async getMedia(id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
    const res = await this.s3('GET', id);
    if (res.status === 404 || res.status === 403) return null; // 403 = missing object without ListBucket
    if (!res.ok) throw new Error(`S3 GetObject failed (HTTP ${res.status})`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/jpeg' };
  }
}

function fromItem(item: Item): ServerChange | null {
  const table = item.tbl?.S;
  const id = item.rid?.S;
  const mod = item.mod?.S;
  const changedAt = Number(item.changedAt?.N);
  if (!table || !id || !mod || !Number.isFinite(changedAt)) return null;
  if (item.deleted?.BOOL) return { table: table as ServerChange['table'], id, mod, deleted: true, changedAt };
  const data = item.data?.S ? (JSON.parse(item.data.S) as Record<string, unknown>) : {};
  return { table: table as ServerChange['table'], id, mod, data, changedAt };
}

/** Page tokens are the index key, base64url — only these three attributes are accepted back. */
function encodePage(key: Item): string {
  return Buffer.from(JSON.stringify({ sk: key.sk?.S, changedAt: key.changedAt?.N })).toString('base64url');
}

function decodePage(page: string): Item | null {
  try {
    const k = JSON.parse(Buffer.from(page, 'base64url').toString('utf8')) as { sk?: unknown; changedAt?: unknown };
    if (typeof k.sk !== 'string' || typeof k.changedAt !== 'string' || !/^\d+$/.test(k.changedAt)) return null;
    return { pk: { S: PK }, sk: { S: k.sk }, changedAt: { N: k.changedAt } };
  } catch {
    return null;
  }
}
