/** Shared fixtures for unit tests: in-memory database, controllable clock, evidence builder. */
import { Repositories } from '../../src/data/repositories';
import { TABLES } from '../../src/data/schema';
import { MemoryDatabase } from '../../src/data/storage/memory';
import type { Child, Evidence, EvidenceTrials, Household } from '../../src/domain/types';
import { sequentialIds } from '../../src/domain/util/ids';
import type { Clock } from '../../src/domain/util/time';
import type { ServiceContext } from '../../src/services/context';
import { DEFAULT_SETTINGS } from '../../src/services/householdService';

export interface MutableClock extends Clock {
  set(iso: string): void;
  advanceDays(n: number): void;
}

export function mutableClock(iso = '2026-09-26T15:00:00.000Z'): MutableClock {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    set: (next) => {
      t = new Date(next).getTime();
    },
    advanceDays: (n) => {
      t += n * 86_400_000;
    },
  };
}

export function makeContext(iso?: string): { ctx: ServiceContext; db: MemoryDatabase; repos: Repositories; clock: MutableClock } {
  const db = new MemoryDatabase(TABLES);
  const repos = new Repositories(db);
  const clock = mutableClock(iso);
  return { ctx: { repos, clock, ids: sequentialIds('t') }, db, repos, clock };
}

/** A household with one or more children (no demo data). */
export async function makeFamily(ctx: ServiceContext, names: string[] = ['Izzy']): Promise<{ household: Household; children: Child[] }> {
  const household: Household = { id: 'hh_1', name: 'Test School', createdAt: '2026-01-01T00:00:00.000Z', settings: DEFAULT_SETTINGS, schemaVersion: 1 };
  await ctx.repos.households.put(household);
  const children: Child[] = names.map((name, i) => ({
    id: `child_${name.toLowerCase()}`,
    householdId: household.id,
    name,
    birthDate: '2023-01-01',
    status: 'active',
    avatarId: `avatar_${i}`,
    createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
  }));
  for (const c of children) await ctx.repos.children.put(c);
  return { household, children };
}

let evSeq = 0;
export function ev(
  skillId: string,
  day: string,
  trials: Partial<EvidenceTrials>,
  opts: { kind?: Evidence['kind']; childId?: string; topics?: string[] } = {},
): Evidence {
  const t = { independent: 0, supported: 0, notYet: 0, ...trials };
  evSeq += 1;
  return {
    id: `ev_${evSeq}`,
    childId: opts.childId ?? 'child_izzy',
    skillId,
    observedAt: `${day}T10:00:00.000Z`,
    source: { type: 'observation', id: `src_${evSeq}`, label: 'Test' },
    kind: opts.kind ?? 'performance',
    trials: t,
    independence: t.independent ? 'independent' : t.supported ? 'supported' : 'assisted',
    statement: `Test evidence for ${skillId}`,
    createdBy: 'system',
    topics: opts.topics ?? [],
  };
}
