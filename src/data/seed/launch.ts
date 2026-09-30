/**
 * How the database starts life.
 *
 *  • First launch → a fresh household: Izzy (active) and Georgia (not started
 *    yet), default avatars, and NO books, evidence, rewards or history. Izzy
 *    discovers her school and adds her own books.
 *  • "Load sample data" (parent's explicit choice) → the labeled demo history.
 *  • "Start fresh" → erase learning records but keep names, avatars, parents
 *    and settings.
 *
 * Older builds seeded the demo automatically. On startup, an automatically
 * seeded demo that contains nothing a parent or child actually recorded is
 * upgraded to a fresh start (names, avatars and settings are kept).
 */
import { DEFAULT_AVATAR, GEORGIA_AVATAR } from '../../domain/avatar';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import type { Avatar, Child, Household, Parent } from '../../domain/types';
import type { Clock } from '../../domain/util/time';
import type { Repositories } from '../repositories';
import { SCHEMA_VERSION, type TableName } from '../schema';
import type { WriteOp } from '../storage/types';
import { DEMO_CHILD_ID, DEMO_SIBLING_ID, seedDemoData } from './demoSeed';

export const SEED_META_KEY = 'seed';

export interface SeedMeta {
  kind: 'fresh' | 'demo';
  /** True when a parent explicitly chose sample data in Settings. */
  chosenByParent: boolean;
  at: string;
}

/** Records a person actually created (derived tables like mastery/reports don't count). */
export const AUTHORED_TABLES: TableName[] = [
  'books',
  'readingSessions',
  'activities',
  'evidence',
  'lessonAttempts',
  'teacherInteractions',
  'portfolio',
  'media',
];

export type LaunchResult = 'seeded-fresh' | 'upgraded-to-fresh' | 'existing';

export async function prepareDatabase(repos: Repositories, clock: Clock): Promise<LaunchResult> {
  const households = await repos.households.all();
  if (households.length === 0) {
    await seedFreshHousehold(repos, clock);
    return 'seeded-fresh';
  }
  const meta = (await repos.meta.get(SEED_META_KEY))?.value as SeedMeta | undefined;
  const legacyAutoDemo = !meta && !!(await repos.meta.get('demoSeededAt'));
  const autoDemo = legacyAutoDemo || (meta?.kind === 'demo' && !meta.chosenByParent);
  if (autoDemo && (await onlySampleRecords(repos))) {
    await startFresh(repos, clock, { resetDemoIdentities: true });
    return 'upgraded-to-fresh';
  }
  return 'existing';
}

async function onlySampleRecords(repos: Repositories): Promise<boolean> {
  for (const name of AUTHORED_TABLES) {
    const rows = await repos.db.table<{ isDemo?: boolean }>(name).all();
    // Media has no demo flag; the sample never includes photos, so any media is real.
    if (name === 'media' ? rows.length > 0 : rows.some((r) => !r.isDemo)) return false;
  }
  return true;
}

function baseHousehold(clock: Clock): { household: Household; parents: Parent[]; children: Child[]; avatars: Avatar[] } {
  const createdAt = clock.now().toISOString();
  const household: Household = { id: 'household_home', name: 'Our Family School', createdAt, settings: DEFAULT_SETTINGS, schemaVersion: SCHEMA_VERSION };
  return {
    household,
    parents: [
      { id: 'parent_mom', householdId: household.id, displayName: 'Mom', role: 'admin', createdAt },
      { id: 'parent_dad', householdId: household.id, displayName: 'Dad', role: 'admin', createdAt },
    ],
    children: [
      // Izzy turns 4 on January 1.
      { id: DEMO_CHILD_ID, householdId: household.id, name: 'Izzy', birthDate: '2023-01-01', status: 'active', avatarId: 'avatar_izzy', createdAt },
      { id: DEMO_SIBLING_ID, householdId: household.id, name: 'Georgia', status: 'inactive', avatarId: 'avatar_georgia', createdAt },
    ],
    avatars: [
      { ...DEFAULT_AVATAR, id: 'avatar_izzy', childId: DEMO_CHILD_ID, updatedAt: createdAt },
      { ...GEORGIA_AVATAR, id: 'avatar_georgia', childId: DEMO_SIBLING_ID, updatedAt: createdAt },
    ],
  };
}

const seedMetaOp = (kind: SeedMeta['kind'], chosenByParent: boolean, clock: Clock): WriteOp => ({
  table: 'meta',
  type: 'put',
  value: { key: SEED_META_KEY, value: { kind, chosenByParent, at: clock.now().toISOString() } satisfies SeedMeta },
});

/** A brand-new household with an empty school. */
export async function seedFreshHousehold(repos: Repositories, clock: Clock): Promise<void> {
  const base = baseHousehold(clock);
  await repos.commit([
    { table: 'households', type: 'put', value: base.household },
    ...base.parents.map((value) => ({ table: 'parents' as const, type: 'put' as const, value })),
    ...base.children.map((value) => ({ table: 'children' as const, type: 'put' as const, value })),
    ...base.avatars.map((value) => ({ table: 'avatars' as const, type: 'put' as const, value })),
    seedMetaOp('fresh', false, clock),
  ]);
}

/**
 * Clears every learning record and keeps who the family is: household name
 * and settings, parents, children (names, birthdays, status) and avatars.
 */
export async function startFresh(repos: Repositories, clock: Clock, opts: { resetDemoIdentities?: boolean } = {}): Promise<void> {
  const [households, parents, children, avatars] = await Promise.all([repos.households.all(), repos.parents.all(), repos.children.all(), repos.avatars.all()]);
  if (households.length === 0) {
    await seedFreshHousehold(repos, clock);
    return;
  }
  const defaults = baseHousehold(clock);
  const keptChildren = children.map((c) => {
    const { activePetId: _pet, explored: _explored, isDemo, ...rest } = c;
    // Sample-data children carried an invented birthday for Georgia; use the real defaults instead.
    if (isDemo && opts.resetDemoIdentities) {
      const d = defaults.children.find((x) => x.id === c.id);
      const { birthDate: _b, ...noBirth } = rest;
      return d?.birthDate ? { ...noBirth, birthDate: d.birthDate } : noBirth;
    }
    return rest;
  });
  await repos.db.wipe();
  await repos.commit([
    ...households.map((value) => ({ table: 'households' as const, type: 'put' as const, value })),
    ...parents.map((value) => ({ table: 'parents' as const, type: 'put' as const, value })),
    ...keptChildren.map((value) => ({ table: 'children' as const, type: 'put' as const, value })),
    ...avatars.map((value) => ({ table: 'avatars' as const, type: 'put' as const, value })),
    seedMetaOp('fresh', false, clock),
  ]);
}

/** Replaces everything with the clearly labeled sample history (parent's choice). */
export async function loadSampleData(repos: Repositories, clock: Clock): Promise<void> {
  await repos.db.wipe();
  await seedDemoData(repos, clock);
  await repos.commit([seedMetaOp('demo', true, clock)]);
}
