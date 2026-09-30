/**
 * Persistent schema. Each child-scoped table has a `childId` index; services
 * always query through it (multi-child separation). Bump SCHEMA_VERSION and
 * add a migration step when changing stores or indexes.
 */
import type { TableSpec } from './storage/types';

export const DB_NAME = 'izzys-classroom';
export const SCHEMA_VERSION = 2;

const child = { name: 'childId', keyPath: 'childId' };

export const TABLES: TableSpec[] = [
  { name: 'households', keyPath: 'id', indexes: [] },
  { name: 'parents', keyPath: 'id', indexes: [{ name: 'householdId', keyPath: 'householdId' }] },
  { name: 'children', keyPath: 'id', indexes: [{ name: 'householdId', keyPath: 'householdId' }] },
  { name: 'avatars', keyPath: 'id', indexes: [child] },
  { name: 'books', keyPath: 'id', indexes: [child, { name: 'status', keyPath: 'status' }] },
  { name: 'readingSessions', keyPath: 'id', indexes: [child, { name: 'bookId', keyPath: 'bookId' }] },
  { name: 'activities', keyPath: 'id', indexes: [child, { name: 'date', keyPath: 'date' }] },
  { name: 'evidence', keyPath: 'id', indexes: [child, { name: 'skillId', keyPath: 'skillId' }] },
  { name: 'mastery', keyPath: 'id', indexes: [child] },
  { name: 'lessonAttempts', keyPath: 'id', indexes: [child] },
  { name: 'teacherInteractions', keyPath: 'id', indexes: [child] },
  { name: 'rewardUnlocks', keyPath: 'id', indexes: [child] },
  { name: 'portfolio', keyPath: 'id', indexes: [child] },
  { name: 'media', keyPath: 'id', indexes: [{ name: 'householdId', keyPath: 'householdId' }, child] },
  { name: 'reports', keyPath: 'id', indexes: [child] },
  { name: 'meta', keyPath: 'key', indexes: [] },
  // v2: local changes waiting to be sent to the family's sync (see storage/syncing.ts).
  { name: 'syncOutbox', keyPath: 'key', indexes: [] },
];

export type TableName =
  | 'households'
  | 'parents'
  | 'children'
  | 'avatars'
  | 'books'
  | 'readingSessions'
  | 'activities'
  | 'evidence'
  | 'mastery'
  | 'lessonAttempts'
  | 'teacherInteractions'
  | 'rewardUnlocks'
  | 'portfolio'
  | 'media'
  | 'reports'
  | 'meta'
  | 'syncOutbox';

export const CHILD_SCOPED_TABLES: TableName[] = [
  'avatars',
  'books',
  'readingSessions',
  'activities',
  'evidence',
  'mastery',
  'lessonAttempts',
  'teacherInteractions',
  'rewardUnlocks',
  'portfolio',
  'reports',
];

/**
 * Tables shared across the family's devices by family sync. `meta` (this
 * device's own notes, e.g. microphone checks) and the outbox stay local.
 */
export const SYNCED_TABLES = [
  'households',
  'parents',
  'children',
  'avatars',
  'books',
  'readingSessions',
  'activities',
  'evidence',
  'mastery',
  'lessonAttempts',
  'teacherInteractions',
  'rewardUnlocks',
  'portfolio',
  'media',
  'reports',
] as const satisfies readonly TableName[];

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export function isSyncedTable(name: string): name is SyncedTable {
  return (SYNCED_TABLES as readonly string[]).includes(name);
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
