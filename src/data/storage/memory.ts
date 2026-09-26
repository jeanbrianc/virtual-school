import type { Database, Key, Table, TableSpec, WriteOp } from './types';

const clone = <T>(v: T): T => {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v)) as T;
  }
};

function readPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** In-memory Database used by unit tests and as a fallback when IndexedDB is unavailable. */
export class MemoryDatabase implements Database {
  private readonly stores = new Map<string, Map<Key, unknown>>();
  private readonly specs = new Map<string, TableSpec>();
  private readonly listeners = new Set<(tables: string[]) => void>();

  constructor(tables: TableSpec[]) {
    for (const t of tables) {
      this.stores.set(t.name, new Map());
      this.specs.set(t.name, t);
    }
  }

  private store(name: string): Map<Key, unknown> {
    const s = this.stores.get(name);
    if (!s) throw new Error(`Unknown table ${name}`);
    return s;
  }

  private keyOf(table: string, value: unknown): Key {
    const spec = this.specs.get(table);
    const key = readPath(value, spec?.keyPath ?? 'id');
    if (typeof key !== 'string') throw new Error(`Missing key for ${table}`);
    return key;
  }

  private notify(tables: string[]) {
    for (const l of this.listeners) l(tables);
  }

  table<T>(name: string): Table<T> {
    const store = this.store(name);
    const spec = this.specs.get(name);
    return {
      name,
      get: async (key) => clone(store.get(key) as T | undefined),
      getMany: async (keys) => keys.map((k) => clone(store.get(k) as T | undefined)),
      all: async () => [...store.values()].map((v) => clone(v as T)),
      where: async (index, value) => {
        const idx = spec?.indexes.find((i) => i.name === index);
        if (!idx) throw new Error(`Unknown index ${name}.${index}`);
        return [...store.values()]
          .filter((v) => {
            const field = readPath(v, idx.keyPath);
            return Array.isArray(field) ? field.includes(value) : field === value;
          })
          .map((v) => clone(v as T));
      },
      count: async () => store.size,
      put: async (value) => {
        store.set(this.keyOf(name, value), clone(value));
        this.notify([name]);
      },
      bulkPut: async (values) => {
        for (const v of values) store.set(this.keyOf(name, v), clone(v));
        this.notify([name]);
      },
      delete: async (key) => {
        store.delete(key);
        this.notify([name]);
      },
      clear: async () => {
        store.clear();
        this.notify([name]);
      },
    };
  }

  async commit(ops: WriteOp[]): Promise<void> {
    // Validate first so the batch is all-or-nothing.
    const staged = ops.map((op) => ({ op, key: op.type === 'put' ? this.keyOf(op.table, op.value) : op.key }));
    for (const { op, key } of staged) {
      const store = this.store(op.table);
      if (op.type === 'put') store.set(key as Key, clone(op.value));
      else if (key) store.delete(key);
    }
    this.notify([...new Set(ops.map((o) => o.table))]);
  }

  subscribe(listener: (tables: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async wipe(): Promise<void> {
    for (const s of this.stores.values()) s.clear();
    this.notify([...this.stores.keys()]);
  }

  close(): void {
    this.listeners.clear();
  }
}
