/**
 * Family sync on the helper: the family's devices send their changes and get
 * everyone else's. Records are kept by "<table>/<id>" with the newest version
 * winning (by its `mod` stamp); photos are kept separately. Storage is a
 * `SyncStore` — DynamoDB + S3 on AWS (awsStore.ts), memory in tests.
 *
 * Only reachable through the family sign-in (CloudFront) and, on AWS, only
 * with CloudFront's secret header — the same protection as the AI teachers.
 */
import {
  MAX_MEDIA_BYTES,
  MAX_PUSH,
  mediaIdOk,
  PULL_PAGE,
  validChange,
  validSummary,
  type RecordChange,
  type ServerChange,
  type SyncResponse,
  type SyncStatus,
  type SyncSummary,
} from '../../src/sync/protocol';

export interface SyncStore {
  /** Saves a change unless the stored version is as new or newer. Returns whether it was saved. */
  put(change: RecordChange, changedAt: number): Promise<boolean>;
  /** Changes saved after `since` (server ms), oldest first, `limit` at a time. */
  changesSince(since: number, page: string | null, limit: number): Promise<{ changes: ServerChange[]; next: string | null }>;
  getSummary(): Promise<SyncSummary | null>;
  putSummary(summary: SyncSummary): Promise<void>;
  putMedia(id: string, bytes: Uint8Array, type: string): Promise<void>;
  getMedia(id: string): Promise<{ bytes: Uint8Array; type: string } | null>;
}

/** In-memory store (tests, and the local helper when asked for one). */
export class MemorySyncStore implements SyncStore {
  readonly records = new Map<string, ServerChange>();
  readonly media = new Map<string, { bytes: Uint8Array; type: string }>();
  summary: SyncSummary | null = null;

  async put(change: RecordChange, changedAt: number): Promise<boolean> {
    const key = `${change.table}/${change.id}`;
    const have = this.records.get(key);
    if (have && have.mod >= change.mod) return false;
    const { data, ...rest } = change;
    this.records.set(key, { ...rest, ...(change.deleted ? {} : { data: structuredClone(data) }), changedAt });
    return true;
  }

  async changesSince(since: number, page: string | null, limit: number): Promise<{ changes: ServerChange[]; next: string | null }> {
    const all = [...this.records.values()].filter((c) => c.changedAt > since).sort((a, b) => a.changedAt - b.changedAt || (a.id < b.id ? -1 : 1));
    const start = page ? Number(page) : 0;
    const changes = all.slice(start, start + limit).map((c) => structuredClone(c));
    return { changes, next: start + limit < all.length ? String(start + limit) : null };
  }

  async getSummary(): Promise<SyncSummary | null> {
    return this.summary;
  }
  async putSummary(summary: SyncSummary): Promise<void> {
    this.summary = summary;
  }
  async putMedia(id: string, bytes: Uint8Array, type: string): Promise<void> {
    this.media.set(id, { bytes, type });
  }
  async getMedia(id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
    return this.media.get(id) ?? null;
  }
}

export interface SyncReply {
  status: number;
  json?: unknown;
  bytes?: { data: Uint8Array; type: string };
}

const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|heic)$/;

/** Handles /v1/sync… requests (null for any other path). */
export function syncRoutes(store: SyncStore, now: () => number = () => Date.now()) {
  // Server times are unique and increasing, so "changed after X" never skips a record.
  let last = 0;
  const stamp = () => {
    last = Math.max(now(), last + 1);
    return last;
  };

  return async function route(method: string, path: string, parsed: () => unknown): Promise<SyncReply | null> {
    if (path === '/v1/sync/status' && method === 'GET') {
      const summary = await store.getSummary();
      const status: SyncStatus = summary ? { available: true, hasData: true, summary } : { available: true, hasData: false };
      return { status: 200, json: status };
    }

    const media = /^\/v1\/sync\/media\/([^/]+)$/.exec(path);
    if (media) {
      const id = decodeURIComponent(media[1]!);
      if (!mediaIdOk(id)) return { status: 400, json: { error: 'Bad photo id.' } };
      if (method === 'GET') {
        const found = await store.getMedia(id);
        return found ? { status: 200, bytes: { data: found.bytes, type: found.type } } : { status: 404, json: { error: 'No such photo.' } };
      }
      if (method !== 'POST') return { status: 405, json: { error: 'Use GET or POST.' } };
      const body = parsed() as { data?: unknown; type?: unknown } | null;
      const type = typeof body?.type === 'string' ? body.type.toLowerCase() : '';
      if (!IMAGE_TYPES.test(type) || typeof body?.data !== 'string') return { status: 400, json: { error: 'Send { data: base64, type: image/… }.' } };
      const bytes = new Uint8Array(Buffer.from(body.data, 'base64'));
      if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) return { status: 413, json: { error: 'Photo too large.' } };
      await store.putMedia(id, bytes, type);
      return { status: 200, json: { ok: true } };
    }

    if (path !== '/v1/sync') return null;
    if (method !== 'POST') return { status: 405, json: { error: 'Use POST.' } };
    const body = parsed() as { push?: unknown; since?: unknown; page?: unknown; pull?: unknown; summary?: unknown } | null;
    if (!body || typeof body !== 'object') return { status: 400, json: { error: 'Invalid sync request.' } };
    const push = Array.isArray(body.push) ? body.push : [];
    if (push.length > MAX_PUSH) return { status: 413, json: { error: `Send at most ${MAX_PUSH} changes at a time.` } };
    const changes: RecordChange[] = [];
    for (const raw of push) {
      const c = validChange(raw);
      if (!c) return { status: 400, json: { error: 'A change was not valid.' } };
      changes.push(c);
    }
    let accepted = 0;
    // A few at a time: each is a conditional write.
    for (let i = 0; i < changes.length; i += 10) {
      const saved = await Promise.all(changes.slice(i, i + 10).map((c) => store.put(c, stamp())));
      accepted += saved.filter(Boolean).length;
    }
    const summary = body.summary === undefined ? null : validSummary(body.summary);
    if (summary && (accepted > 0 || !(await store.getSummary()))) await store.putSummary(summary);

    const since = typeof body.since === 'number' && Number.isFinite(body.since) ? Math.max(0, body.since) : 0;
    if (body.pull === false) {
      const reply: SyncResponse = { accepted, changes: [], cursor: since, next: null };
      return { status: 200, json: reply };
    }
    const page = typeof body.page === 'string' && body.page.length < 2000 ? body.page : null;
    const pulled = await store.changesSince(since, page, PULL_PAGE);
    const cursor = pulled.changes.reduce((m, c) => Math.max(m, c.changedAt), since);
    const reply: SyncResponse = { accepted, changes: pulled.changes, cursor, next: pulled.next };
    return { status: 200, json: reply };
  };
}
