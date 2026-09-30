/**
 * Family sync over HTTPS to the family's own helper (/api on the hosted site,
 * behind the family sign-in). Used only after a parent turned family sync on,
 * or to ask whether the family already saved a school (a yes/no and a summary).
 */
import type { SyncRequest, SyncResponse, SyncStatus } from './protocol';

const HEADER = { 'X-Izzy-Classroom': '1' };

class NotFound extends Error {}

export interface SyncTransport {
  status(): Promise<SyncStatus>;
  sync(req: SyncRequest): Promise<SyncResponse>;
  putMedia(id: string, blob: Blob): Promise<void>;
  getMedia(id: string): Promise<Blob>;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class HttpSyncTransport implements SyncTransport {
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 30_000,
  ) {}

  private url(path: string): string {
    return `${this.endpoint.replace(/\/+$/, '')}${path}`;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url(path), {
        ...init,
        headers: { ...HEADER, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) {
        const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        if (res.status === 404) throw new NotFound(msg ?? 'Not found');
        throw new Error(res.status === 401 ? 'Signed out — sign in again on the welcome page.' : (msg ?? `The family helper answered ${res.status}.`));
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async status(): Promise<SyncStatus> {
    try {
      return (await (await this.call('/v1/sync/status')).json()) as SyncStatus;
    } catch (err) {
      // A helper without family sync (the site's AWS setup not updated yet) answers 404.
      if (err instanceof NotFound) return { available: false, hasData: false };
      throw err;
    }
  }

  async sync(req: SyncRequest): Promise<SyncResponse> {
    return (await (await this.call('/v1/sync', { method: 'POST', body: JSON.stringify(req) })).json()) as SyncResponse;
  }

  async putMedia(id: string, blob: Blob): Promise<void> {
    await this.call(`/v1/sync/media/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ data: await toBase64(blob), type: blob.type || 'image/jpeg' }),
    });
  }

  async getMedia(id: string): Promise<Blob> {
    const res = await this.call(`/v1/sync/media/${encodeURIComponent(id)}`);
    return new Blob([await res.arrayBuffer()], { type: res.headers.get('content-type') || 'image/jpeg' });
  }
}
