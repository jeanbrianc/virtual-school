import type { ID } from '../types';

export type IdFactory = (prefix: string) => ID;

/** Production ids: random UUIDs, prefixed by entity type for readability. */
export const randomIds: IdFactory = (prefix) => {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`;
};

/** Deterministic ids for seeds and tests. */
export function sequentialIds(namespace = 'seq'): IdFactory {
  const counters = new Map<string, number>();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_${namespace}_${String(n).padStart(3, '0')}`;
  };
}

export function masteryId(childId: ID, skillId: string): string {
  return `${childId}:${skillId}`;
}
