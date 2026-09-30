/**
 * Family sync: keeps this device's school and the family's saved school (in the
 * family's own AWS account) the same, so every signed-in device shows the same
 * books, progress, photos and settings.
 *
 *  • A parent turns it on once, on the device that has the school's history —
 *    that device's school is saved.
 *  • Another device that hasn't been used yet takes the family's school
 *    automatically when it opens. One with its own records asks a parent.
 *  • After that: local changes go out a few seconds after they happen, and other
 *    devices' changes come in when the page opens, regains focus, and every
 *    ~45 s while open. The newer version of a record wins.
 */
import type { Repositories } from '../data/repositories';
import { AUTHORED_TABLES } from '../data/seed/launch';
import { SYNC_META_PREFIX, type RecordChange, type SyncingDatabase } from '../data/storage/syncing';
import { MAX_PUSH, PULL_OVERLAP_MS, type SyncStatus, type SyncSummary } from './protocol';
import type { SyncTransport } from './transport';

const STATE_KEY = `${SYNC_META_PREFIX}state`;
const DEVICE_KEY = `${SYNC_META_PREFIX}device`;
const RETRY_KEY = `${SYNC_META_PREFIX}mediaRetry`;

interface SyncState {
  enabled: boolean;
  /** Newest server time seen (ms). */
  cursor: number | null;
  lastSyncAt?: string;
  /** How this device joined: it saved its school, or it took the family's. */
  joined?: 'uploaded' | 'adopted' | 'replaced-cloud';
  joinedAt?: string;
}

export type SyncPhase = 'unavailable' | 'checking' | 'off' | 'needs-choice' | 'working' | 'on' | 'error';

export interface SyncView {
  phase: SyncPhase;
  /** What the family's saved school looks like (when known). */
  cloud?: SyncStatus;
  lastSyncAt?: string;
  joined?: SyncState['joined'];
  joinedAt?: string;
  /** Local changes not sent yet. */
  pending: number;
  error?: string;
  /** Set once when this device just took the family's school (for a friendly note). */
  justAdopted?: boolean;
}

export interface SyncEngineOptions {
  now?: () => number;
  /** Background timers (off in tests). */
  timers?: boolean;
  intervalMs?: number;
  debounceMs?: number;
}

export class SyncEngine {
  private state: SyncState = { enabled: false, cursor: null };
  private view: SyncView;
  private readonly listeners = new Set<(v: SyncView) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;

  constructor(
    private readonly db: SyncingDatabase,
    private readonly repos: Repositories,
    private readonly transport: SyncTransport | null,
    private readonly opts: SyncEngineOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.view = { phase: transport ? 'checking' : 'unavailable', pending: 0 };
  }

  get current(): SyncView {
    return this.view;
  }

  subscribe(listener: (v: SyncView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<SyncView>): void {
    this.view = { ...this.view, ...patch };
    for (const l of this.listeners) l(this.view);
  }

  private async saveState(patch: Partial<SyncState>): Promise<void> {
    this.state = { ...this.state, ...patch };
    await this.repos.meta.put({ key: STATE_KEY, value: this.state });
  }

  /** Reads this device's sync settings, names the device, and decides what to do. */
  async init(): Promise<SyncView> {
    const saved = (await this.repos.meta.get(STATE_KEY))?.value as SyncState | undefined;
    if (saved) this.state = saved;
    let device = (await this.repos.meta.get(DEVICE_KEY))?.value as string | undefined;
    if (!device) {
      device = randomDevice();
      await this.repos.meta.put({ key: DEVICE_KEY, value: device });
    }
    this.db.setDevice(device, this.opts.now);
    if (!this.transport) return this.view;
    this.startTimers();
    if (!this.state.enabled && this.state.joined) {
      // Paused on this device by a parent.
      this.set({ phase: 'off', pending: (await this.db.outbox()).length, ...this.stamps() });
      return this.view;
    }
    if (this.state.enabled) {
      this.set({ phase: 'on', ...this.stamps() });
      void this.syncNow(); // in the background — the school opens right away
      return this.view;
    }
    await this.decide();
    return this.view;
  }

  private stamps(): Partial<SyncView> {
    return {
      ...(this.state.lastSyncAt ? { lastSyncAt: this.state.lastSyncAt } : {}),
      ...(this.state.joined ? { joined: this.state.joined } : {}),
      ...(this.state.joinedAt ? { joinedAt: this.state.joinedAt } : {}),
    };
  }

  /** Not syncing yet: take the family's school if this device is unused, else wait for a parent. */
  private async decide(): Promise<void> {
    if (!this.transport) return;
    try {
      const cloud = await this.transport.status();
      if (!cloud.available) return this.set({ phase: 'unavailable', cloud });
      if (!cloud.hasData) return this.set({ phase: 'off', cloud });
      if (await this.hasOwnRecords()) return this.set({ phase: 'needs-choice', cloud });
      await this.useFamilySchool();
      this.set({ justAdopted: true, cloud });
    } catch (err) {
      this.set({ phase: 'error', error: message(err) });
    }
  }

  /** Anything a person made on this device (books, reading, photos…). */
  async hasOwnRecords(): Promise<boolean> {
    for (const t of AUTHORED_TABLES) if ((await this.repos.db.table(t).count()) > 0) return true;
    return false;
  }

  /** First device: save this device's school as the family's. */
  async turnOn(): Promise<void> {
    if (this.state.joined) {
      // Resuming after a pause: changes made meanwhile go out; the newest version of each record wins.
      await this.saveState({ enabled: true });
      this.set({ phase: 'on', ...this.stamps() });
      return this.syncNow();
    }
    this.set({ phase: 'working' });
    try {
      // Another device may have saved the family's school meanwhile: never overwrite it by accident.
      const cloud = await this.transport?.status();
      if (cloud?.hasData) return this.decide();
    } catch (err) {
      return this.set({ phase: 'error', error: message(err) });
    }
    await this.db.stampEverything();
    await this.saveState({ enabled: true, cursor: null, joined: 'uploaded', joinedAt: new Date(this.now()).toISOString() });
    this.set({ ...this.stamps() });
    await this.syncNow();
  }

  /** This device takes the family's saved school (its own shared records are replaced). */
  async useFamilySchool(): Promise<void> {
    this.set({ phase: 'working' });
    await this.db.clearShared();
    await this.saveState({ enabled: true, cursor: null, joined: 'adopted', joinedAt: new Date(this.now()).toISOString() });
    this.set({ ...this.stamps() });
    await this.syncNow();
  }

  /** The family's saved school becomes this device's (records only the family's school has are deleted everywhere). */
  async replaceFamilySchool(): Promise<void> {
    if (!this.transport) return;
    this.set({ phase: 'working' });
    try {
      const cloudKeys = new Set<string>();
      let page: string | null = null;
      do {
        const res = await this.transport.sync({ since: 0, page, pull: true });
        for (const c of res.changes)
          if (!c.deleted) cloudKeys.add(`${c.table}/${c.id}`);
          else cloudKeys.delete(`${c.table}/${c.id}`);
        page = res.next;
      } while (page);
      await this.db.stampEverything();
      const mine = await this.db.sharedKeys();
      await this.db.queueDeletes([...cloudKeys].filter((k) => !mine.has(k)));
      await this.saveState({ enabled: true, cursor: null, joined: 'replaced-cloud', joinedAt: new Date(this.now()).toISOString() });
      this.set({ ...this.stamps() });
      await this.syncNow();
    } catch (err) {
      this.set({ phase: 'error', error: message(err) });
    }
  }

  /** Stops syncing on this device (its school stays; the family's saved school stays). */
  async turnOff(): Promise<void> {
    await this.saveState({ enabled: false });
    this.set({ phase: 'off', pending: (await this.db.outbox()).length });
  }

  /** Sends local changes, then fetches everyone else's. Safe to call often. */
  syncNow(): Promise<void> {
    if (!this.transport || !this.state.enabled) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = async () => {
      do {
        this.again = false;
        await this.withLock(() => this.runOnce());
      } while (this.again);
    };
    this.running = run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async withLock(fn: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (!locks?.request) return fn();
    // One tab at a time per browser.
    await locks.request('izzy-family-sync', fn);
  }

  private async runOnce(): Promise<void> {
    const transport = this.transport!;
    this.set({ phase: 'working' });
    try {
      await this.push(transport);
      await this.pull(transport);
      await this.saveState({ lastSyncAt: new Date(this.now()).toISOString() });
      this.set({ phase: 'on', pending: (await this.db.outbox()).length, error: undefined, ...this.stamps() });
    } catch (err) {
      this.set({ phase: 'error', error: message(err), pending: (await this.db.outbox()).length });
    }
  }

  private async push(transport: SyncTransport): Promise<void> {
    const entries = await this.db.outbox();
    for (let i = 0; i < entries.length; i += MAX_PUSH / 2) {
      const batch = entries.slice(i, i + MAX_PUSH / 2);
      const changes: RecordChange[] = [];
      const sent: { key: string; mod: string }[] = [];
      for (const e of batch) {
        const change = await this.db.changeFor(e);
        sent.push({ key: e.key, mod: e.mod });
        if (!change) continue;
        const { blob, ...rest } = change;
        // The photo goes first, so no device ever sees a photo record without its photo.
        if (blob) await transport.putMedia(change.id, blob);
        changes.push(rest);
      }
      if (changes.length) await transport.sync({ push: changes, pull: false, summary: await this.summary() });
      await this.db.markSent(sent);
    }
  }

  private async pull(transport: SyncTransport): Promise<void> {
    const cursor0 = this.state.cursor;
    const since = cursor0 === null ? 0 : Math.max(0, cursor0 - PULL_OVERLAP_MS);
    let cursor = cursor0 ?? 0;
    let page: string | null = null;
    const retry = ((await this.repos.meta.get(RETRY_KEY))?.value as RecordChange[] | undefined) ?? [];
    const stillMissing: RecordChange[] = [];
    const apply = async (changes: RecordChange[]) => {
      const ready: (RecordChange & { blob?: Blob })[] = [];
      for (const c of changes) {
        if (c.table === 'media' && !c.deleted) {
          try {
            ready.push({ ...c, blob: await transport.getMedia(c.id) });
          } catch {
            stillMissing.push(c); // try the photo again next time
          }
        } else ready.push(c);
      }
      await this.db.applyRemote(ready);
    };
    if (retry.length) await apply(retry);
    do {
      const res = await transport.sync({ since, page, pull: true });
      await apply(res.changes);
      cursor = Math.max(cursor, res.cursor);
      page = res.next;
    } while (page);
    await this.repos.meta.put({ key: RETRY_KEY, value: stillMissing.slice(0, 200) });
    await this.saveState({ cursor });
  }

  /** What a new device is told about the family's school. */
  private async summary(): Promise<SyncSummary> {
    const [children, books] = await Promise.all([this.repos.children.all(), this.repos.books.count()]);
    return {
      children: children.filter((c) => c.status === 'active').map((c) => c.name),
      books,
      savedAt: new Date(this.now()).toISOString(),
    };
  }

  private startTimers(): void {
    if (this.opts.timers === false || typeof window === 'undefined') return;
    // Local edits go out a few seconds later.
    this.db.onLocalChange(() => {
      if (!this.state.enabled) return;
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.syncNow(), this.opts.debounceMs ?? 3000);
    });
    this.timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      // Not joined yet: notice when the family's school appears (e.g. the Mac just turned sync on).
      if (!this.state.enabled && !this.state.joined && (this.view.phase === 'off' || this.view.phase === 'needs-choice')) void this.decide();
      else void this.syncNow();
    }, this.opts.intervalMs ?? 45_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.syncNow();
    });
    window.addEventListener('online', () => void this.syncNow());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
  }
}

function randomDevice(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `d${[...bytes].map((b) => b.toString(36).padStart(2, '0')).join('')}`.slice(0, 16);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Couldn’t reach the family’s saved school.';
}
