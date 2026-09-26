import type { Database, Key, Table, TableSpec, WriteOp } from './types';

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * IndexedDB-backed Database. Schema upgrades are additive: missing stores and
 * indexes are created; obsolete ones are removed. Data migrations between
 * versions can be added in `migrate` below.
 */
export class IndexedDbDatabase implements Database {
  private readonly listeners = new Set<(tables: string[]) => void>();
  private readonly channel: BroadcastChannel | null;

  private constructor(
    private readonly db: IDBDatabase,
    private readonly specs: TableSpec[],
  ) {
    // Keep multiple open tabs (e.g. parent mode + child mode) in sync.
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${db.name}-changes`) : null;
    this.channel?.addEventListener('message', (e: MessageEvent<string[]>) => this.emit(e.data, false));
  }

  static async open(name: string, version: number, specs: TableSpec[]): Promise<IndexedDbDatabase> {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) return;
      for (const spec of specs) {
        const store = db.objectStoreNames.contains(spec.name)
          ? tx.objectStore(spec.name)
          : db.createObjectStore(spec.name, { keyPath: spec.keyPath });
        for (const idx of spec.indexes) {
          if (!store.indexNames.contains(idx.name)) {
            store.createIndex(idx.name, idx.keyPath, { multiEntry: idx.multiEntry ?? false });
          }
        }
        for (const existing of Array.from(store.indexNames)) {
          if (!spec.indexes.some((i) => i.name === existing)) store.deleteIndex(existing);
        }
      }
      for (const existing of Array.from(db.objectStoreNames)) {
        if (!specs.some((s) => s.name === existing)) db.deleteObjectStore(existing);
      }
      migrate(event.oldVersion, version, tx);
    };
    const db = await req(request);
    db.onversionchange = () => db.close();
    return new IndexedDbDatabase(db, specs);
  }

  private emit(tables: string[], broadcast = true) {
    for (const l of this.listeners) l(tables);
    if (broadcast) this.channel?.postMessage(tables);
  }

  table<T>(name: string): Table<T> {
    const db = this.db;
    const ro = () => db.transaction(name, 'readonly').objectStore(name);
    const write = async (fn: (store: IDBObjectStore) => void) => {
      const tx = db.transaction(name, 'readwrite');
      fn(tx.objectStore(name));
      await done(tx);
      this.emit([name]);
    };
    return {
      name,
      get: (key: Key) => req(ro().get(key)) as Promise<T | undefined>,
      getMany: async (keys: Key[]) => {
        const store = ro();
        return Promise.all(keys.map((k) => req(store.get(k)) as Promise<T | undefined>));
      },
      all: () => req(ro().getAll()) as Promise<T[]>,
      where: (index: string, value: IDBValidKey) => req(ro().index(index).getAll(value)) as Promise<T[]>,
      count: () => req(ro().count()),
      put: (value: T) => write((s) => s.put(value)),
      bulkPut: (values: T[]) => write((s) => values.forEach((v) => s.put(v))),
      delete: (key: Key) => write((s) => s.delete(key)),
      clear: () => write((s) => s.clear()),
    };
  }

  async commit(ops: WriteOp[]): Promise<void> {
    if (ops.length === 0) return;
    const tables = [...new Set(ops.map((o) => o.table))];
    const tx = this.db.transaction(tables, 'readwrite');
    for (const op of ops) {
      const store = tx.objectStore(op.table);
      if (op.type === 'put') store.put(op.value);
      else if (op.key !== undefined) store.delete(op.key);
    }
    await done(tx);
    this.emit(tables);
  }

  subscribe(listener: (tables: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async wipe(): Promise<void> {
    const names = this.specs.map((s) => s.name);
    const tx = this.db.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    await done(tx);
    this.emit(names);
  }

  close(): void {
    this.channel?.close();
    this.db.close();
  }
}

/** Data migrations between schema versions go here (none needed yet). */
function migrate(oldVersion: number, newVersion: number, _tx: IDBTransaction): void {
  if (oldVersion === 0 || oldVersion === newVersion) return;
}
