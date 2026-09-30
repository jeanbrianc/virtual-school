/**
 * Family sync — what devices and the family's helper (/api on the hosted
 * site) say to each other. Pure: shared by the browser and the helper, and
 * unit-tested.
 *
 *   POST /v1/sync            { push, since, page, pull, summary } → { accepted, changes, cursor, next }
 *   GET  /v1/sync/status     → { available, hasData, summary }
 *   POST /v1/sync/media/:id  { data (base64), type } → { ok }       (photo bytes)
 *   GET  /v1/sync/media/:id  → the photo
 */
import { isSyncedTable } from '../data/schema';
import { MOD_PATTERN, type RecordChange } from '../data/storage/syncing';

export type { RecordChange };

/** What a device that hasn't joined yet is told about the family's saved school. */
export interface SyncSummary {
  children: string[];
  books: number;
  savedAt: string;
}

export interface SyncRequest {
  /** This device's changes. */
  push?: RecordChange[];
  /** Send changes saved after this server time (ms); null = everything. */
  since?: number | null;
  /** Continue a previous answer that had more. */
  page?: string | null;
  /** false = only send (don't return changes). */
  pull?: boolean;
  summary?: SyncSummary;
}

export type ServerChange = RecordChange & { changedAt: number };

export interface SyncResponse {
  /** How many pushed changes were kept (older ones lose to what the server has). */
  accepted: number;
  changes: ServerChange[];
  /** Newest server time among `changes` (or the `since` that was asked). */
  cursor: number;
  /** More changes to fetch with `page`. */
  next: string | null;
}

export interface SyncStatus {
  available: boolean;
  hasData: boolean;
  summary?: SyncSummary;
}

export const MAX_PUSH = 200;
export const PULL_PAGE = 400;
/** DynamoDB items top out at 400 KB. */
export const MAX_RECORD_CHARS = 350_000;
/** Photos are resized to 1600 px JPEGs (a few hundred KB); this leaves room. */
export const MAX_MEDIA_BYTES = 4_000_000;
/** Pulls look back this far to catch writes that landed out of order. */
export const PULL_OVERLAP_MS = 2 * 60 * 1000;

const ID = /^[A-Za-z0-9_.:-]{1,120}$/;

export const mediaIdOk = (id: string): boolean => /^[A-Za-z0-9_-]{1,80}$/.test(id);

/** A well-formed change for a shared table, or null. */
export function validChange(raw: unknown): RecordChange | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.table !== 'string' || !isSyncedTable(c.table)) return null;
  if (typeof c.id !== 'string' || !ID.test(c.id)) return null;
  if (typeof c.mod !== 'string' || !MOD_PATTERN.test(c.mod)) return null;
  if (c.deleted === true) return { table: c.table, id: c.id, mod: c.mod, deleted: true };
  if (typeof c.data !== 'object' || c.data === null || Array.isArray(c.data)) return null;
  const data = c.data as Record<string, unknown>;
  if (data.id !== c.id) return null;
  if (JSON.stringify(data).length > MAX_RECORD_CHARS) return null;
  return { table: c.table, id: c.id, mod: c.mod, data };
}

export function validSummary(raw: unknown): SyncSummary | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const children = Array.isArray(s.children)
    ? s.children
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.slice(0, 40))
        .slice(0, 10)
    : [];
  const books = typeof s.books === 'number' && Number.isFinite(s.books) ? Math.max(0, Math.floor(s.books)) : 0;
  const savedAt = typeof s.savedAt === 'string' ? s.savedAt.slice(0, 40) : new Date(0).toISOString();
  return { children, books, savedAt };
}
