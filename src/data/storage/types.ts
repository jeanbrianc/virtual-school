/**
 * Minimal storage abstraction over a document store with secondary indexes.
 * Implemented by IndexedDB (browser) and an in-memory store (tests/SSR).
 * A future server-backed implementation (e.g. SQLite/Postgres behind an API)
 * would implement the same interface, which is what keeps repositories and
 * services storage-agnostic.
 */
export type Key = string;

export interface IndexSpec {
  name: string;
  keyPath: string;
  multiEntry?: boolean;
}

export interface TableSpec {
  name: string;
  keyPath: string;
  indexes: IndexSpec[];
}

export interface WriteOp {
  table: string;
  type: 'put' | 'add' | 'delete';
  value?: unknown;
  key?: Key;
}

export interface Table<T> {
  readonly name: string;
  get(key: Key): Promise<T | undefined>;
  getMany(keys: Key[]): Promise<(T | undefined)[]>;
  all(): Promise<T[]>;
  where(index: string, value: IDBValidKey): Promise<T[]>;
  count(): Promise<number>;
  put(value: T): Promise<void>;
  bulkPut(values: T[]): Promise<void>;
  delete(key: Key): Promise<void>;
  clear(): Promise<void>;
}

export interface Database {
  table<T>(name: string): Table<T>;
  /** Applies all writes atomically (single transaction). */
  commit(ops: WriteOp[]): Promise<void>;
  /** Subscribes to change notifications (table names written). */
  subscribe(listener: (tables: string[]) => void): () => void;
  /** Deletes every record in every table. */
  wipe(): Promise<void>;
  close(): void;
}
