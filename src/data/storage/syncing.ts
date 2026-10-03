/**
 * Change tracking for family sync.
 *
 * Wraps the device's Database so every write to a shared table
 *  • stamps the record with `_mod` — when and on which device it last changed
 *    (a string that sorts by time: "<ms>.<counter>.<device>"), and
 *  • leaves a note in `syncOutbox` (in the same transaction) so the change is
 *    sent to the family's sync the next time it runs. Deletions leave a note
 *    too (a "tombstone"), so a deleted book disappears on every device.
 *
 * Changes that arrive from other devices go through `applyRemote`, which keeps
 * the newer of the two versions (last writer wins) and doesn't echo them back.
 * The `meta` table (this device's own notes) is never shared.
 */
import { isSyncedTable, SYNCED_TABLES, type SyncedTable } from '../schema';
import type { Database, Key, Table, WriteOp } from './types';

export const OUTBOX = 'syncOutbox';
/** `meta` keys that belong to sync itself (kept when the school is wiped). */
export const SYNC_META_PREFIX = 'sync:';

/** A local change waiting to be sent. Keyed "<table>/<id>" so repeated edits collapse. */
export interface OutboxEntry {
  key: string;
  table: SyncedTable;
  id: string;
  mod: string;
  deleted?: boolean;
}

/** A change as it travels between devices. */
export interface RecordChange {
  table: SyncedTable;
  id: string;
  mod: string;
  deleted?: boolean;
  /** The record (without `_mod`; media without its photo). Absent for deletions. */
  data?: Record<string, unknown>;
}

type Stamped = Record<string, unknown> & { _mod?: string };

const KEY_PATH: Record<string, string> = { meta: 'key', syncOutbox: 'key' };
const idOf = (table: string, value: unknown): string => String((value as Record<string, unknown>)[KEY_PATH[table] ?? 'id']);

/** Monotonic "<13-digit ms>.<4-digit counter>.<device>" stamps; string order = time order. */
export function modClock(device: string, now: () => number = () => Date.now()) {
  let lastMs = 0;
  let counter = 0;
  return (): string => {
    let ms = now();
    if (ms <= lastMs) {
      ms = lastMs;
      counter += 1;
      if (counter > 9999) {
        ms += 1;
        counter = 0;
      }
    } else counter = 0;
    lastMs = ms;
    return `${String(ms).padStart(13, '0')}.${String(counter).padStart(4, '0')}.${device}`;
  };
}

export const MOD_PATTERN = /^\d{13}\.\d{4}\.[A-Za-z0-9_-]{1,40}$/;

/** The record as it should travel: no sync stamp, and no photo bytes (those go separately). */
export function shareable(table: string, value: unknown): Record<string, unknown> {
  const { _mod: _m, ...rest } = value as Stamped;
  if (table === 'media') {
    const { blob: _b, ...meta } = rest;
    return meta;
  }
  return rest;
}

export class SyncingDatabase implements Database {
  private nextMod: () => string;
  /** True while writing changes that came from other devices (so they aren't treated as local edits). */
  private applying = false;
  private readonly localListeners = new Set<(tables: string[]) => void>();

  constructor(
    readonly inner: Database,
    device: string,
    now?: () => number,
  ) {
    this.nextMod = modClock(device, now);
  }

  /** Sets the device name used in stamps (once it's known). */
  setDevice(device: string, now?: () => number): void {
    this.nextMod = modClock(device, now);
  }

  /** Stamps puts and records deletions for shared tables; other tables pass through. */
  private track(ops: WriteOp[]): WriteOp[] {
    const out: WriteOp[] = [];
    for (const op of ops) {
      if (!isSyncedTable(op.table)) {
        out.push(op);
        continue;
      }
      const mod = this.nextMod();
      if (op.type !== 'delete') {
        const value = { ...(op.value as Stamped), _mod: mod };
        const id = idOf(op.table, value);
        out.push({ table: op.table, type: op.type, value });
        out.push({ table: OUTBOX, type: 'put', value: { key: `${op.table}/${id}`, table: op.table, id, mod } satisfies OutboxEntry });
      } else if (op.key !== undefined) {
        out.push(op);
        out.push({
          table: OUTBOX,
          type: 'put',
          value: { key: `${op.table}/${op.key}`, table: op.table, id: String(op.key), mod, deleted: true } satisfies OutboxEntry,
        });
      }
    }
    return out;
  }

  table<T>(name: string): Table<T> {
    const base = this.inner.table<T>(name);
    if (!isSyncedTable(name)) return base;
    return {
      ...base,
      name,
      put: (value: T) => this.commit([{ table: name, type: 'put', value }]),
      bulkPut: (values: T[]) => this.commit(values.map((value) => ({ table: name, type: 'put' as const, value }))),
      delete: (key: Key) => this.commit([{ table: name, type: 'delete', key }]),
      clear: async () => {
        const all = (await base.all()) as unknown[];
        await this.commit(all.map((v) => ({ table: name, type: 'delete' as const, key: idOf(name, v) })));
      },
    };
  }

  async commit(ops: WriteOp[]): Promise<void> {
    if (!ops.length) return;
    await this.inner.commit(this.applying ? ops : this.track(ops));
    if (!this.applying) this.notifyLocal([...new Set(ops.map((o) => o.table))]);
  }

  subscribe(listener: (tables: string[]) => void): () => void {
    return this.inner.subscribe(listener);
  }

  /** Called after this device changes a shared table (not for changes from other devices). */
  onLocalChange(listener: (tables: string[]) => void): () => void {
    this.localListeners.add(listener);
    return () => this.localListeners.delete(listener);
  }

  private notifyLocal(tables: string[]): void {
    const shared = tables.filter(isSyncedTable);
    if (shared.length) for (const l of this.localListeners) l(shared);
  }

  /** Deletes everything; shared records leave tombstones so other devices delete them too. */
  async wipe(): Promise<void> {
    const ops: WriteOp[] = [];
    for (const t of SYNCED_TABLES) {
      const rows = (await this.inner.table<unknown>(t).all()) as unknown[];
      for (const r of rows) ops.push({ table: t, type: 'delete', key: idOf(t, r) });
    }
    // This device's notes go too (like before) — except its sync settings, which belong to the device.
    const meta = await this.inner.table<{ key: string }>('meta').all();
    const dropMeta = meta.filter((m) => !m.key.startsWith(SYNC_META_PREFIX)).map((m) => ({ table: 'meta', type: 'delete' as const, key: m.key }));
    await this.inner.commit([...dropMeta, ...(await this.outbox()).map((e) => ({ table: OUTBOX, type: 'delete' as const, key: e.key }))]);
    await this.commit(ops);
  }

  close(): void {
    this.inner.close();
  }

  // ── Sync support ──────────────────────────────────────────────────────────

  outbox(): Promise<OutboxEntry[]> {
    return this.inner.table<OutboxEntry>(OUTBOX).all();
  }

  /** Forget outbox entries that were sent — unless the record changed again meanwhile. */
  async markSent(sent: { key: string; mod: string }[]): Promise<void> {
    const box = this.inner.table<OutboxEntry>(OUTBOX);
    const current = await box.getMany(sent.map((s) => s.key));
    const ops: WriteOp[] = [];
    sent.forEach((s, i) => {
      if (current[i]?.mod === s.mod) ops.push({ table: OUTBOX, type: 'delete', key: s.key });
    });
    if (ops.length) await this.inner.commit(ops);
  }

  /** The change to send for an outbox entry (null if the record vanished without a tombstone). */
  async changeFor(entry: OutboxEntry): Promise<(RecordChange & { blob?: Blob }) | null> {
    if (entry.deleted) return { table: entry.table, id: entry.id, mod: entry.mod, deleted: true };
    const value = (await this.inner.table<Stamped>(entry.table).get(entry.id)) as Stamped | undefined;
    if (!value) return null;
    const mod = value._mod ?? entry.mod;
    const blob = entry.table === 'media' ? (value as { blob?: Blob }).blob : undefined;
    return { table: entry.table, id: entry.id, mod, data: shareable(entry.table, value), ...(blob ? { blob } : {}) };
  }

  /**
   * Applies changes from other devices: each is kept only if it is newer than
   * what this device has (including an edit still waiting in the outbox).
   * Returns how many were applied.
   */
  async applyRemote(changes: (RecordChange & { blob?: Blob })[]): Promise<number> {
    if (!changes.length) return 0;
    const ops: WriteOp[] = [];
    const box = this.inner.table<OutboxEntry>(OUTBOX);
    for (const c of changes) {
      if (!isSyncedTable(c.table)) continue;
      const [local, pending] = await Promise.all([this.inner.table<Stamped>(c.table).get(c.id), box.get(`${c.table}/${c.id}`)]);
      const localMod = pending?.mod ?? (local as Stamped | undefined)?._mod ?? '';
      if (localMod >= c.mod) continue;
      if (c.deleted) {
        if (local) ops.push({ table: c.table, type: 'delete', key: c.id });
      } else if (c.data) {
        if (c.table === 'media' && !c.blob) continue; // a photo record is only useful with its photo
        ops.push({ table: c.table, type: 'put', value: { ...c.data, ...(c.blob ? { blob: c.blob } : {}), _mod: c.mod } });
      }
      if (pending) ops.push({ table: OUTBOX, type: 'delete', key: pending.key });
    }
    if (!ops.length) return 0;
    this.applying = true;
    try {
      await this.inner.commit(ops);
    } finally {
      this.applying = false;
    }
    return ops.filter((o) => o.table !== OUTBOX).length;
  }

  /** Marks every shared record as changed now, so the whole school is sent (first device to turn sync on). */
  async stampEverything(): Promise<number> {
    let n = 0;
    for (const t of SYNCED_TABLES) {
      const rows = (await this.inner.table<unknown>(t).all()) as unknown[];
      if (!rows.length) continue;
      n += rows.length;
      await this.commit(rows.map((value) => ({ table: t, type: 'put' as const, value })));
    }
    return n;
  }

  /** Empties the shared tables and the outbox without tombstones (a device adopting the family's school). */
  async clearShared(): Promise<void> {
    const ops: WriteOp[] = [];
    for (const t of SYNCED_TABLES) {
      const rows = (await this.inner.table<unknown>(t).all()) as unknown[];
      for (const r of rows) ops.push({ table: t, type: 'delete', key: idOf(t, r) });
    }
    const box = (await this.inner.table<OutboxEntry>(OUTBOX).all()).map((e) => ({ table: OUTBOX, type: 'delete' as const, key: e.key }));
    this.applying = true;
    try {
      await this.inner.commit([...ops, ...box]);
    } finally {
      this.applying = false;
    }
  }

  /** Queues deletions for records this device doesn't have (replacing the family's school with this one). */
  async queueDeletes(keys: string[]): Promise<void> {
    const ops: WriteOp[] = [];
    for (const key of keys) {
      const slash = key.indexOf('/');
      const table = key.slice(0, slash);
      if (!isSyncedTable(table)) continue;
      ops.push({ table: OUTBOX, type: 'put', value: { key, table, id: key.slice(slash + 1), mod: this.nextMod(), deleted: true } satisfies OutboxEntry });
    }
    if (ops.length) await this.inner.commit(ops);
  }

  /** Every shared record's key on this device ("<table>/<id>"). */
  async sharedKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    for (const t of SYNCED_TABLES) for (const r of (await this.inner.table<unknown>(t).all()) as unknown[]) keys.add(`${t}/${idOf(t, r)}`);
    return keys;
  }
}
