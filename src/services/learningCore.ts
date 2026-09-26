/**
 * Shared "learning happened" pipeline used by books, lessons and activities:
 * stage new records → recompute mastery for touched skills → rebuild the
 * progress snapshot → unlock newly earned rewards → commit atomically.
 */
import { UnitOfWork } from '../data/repositories';
import { getSkill } from '../domain/curriculum';
import { effectiveLevel, updateMasteryRecord } from '../domain/mastery/masteryEngine';
import { buildSnapshot, type ProgressSnapshot } from '../domain/progress/snapshot';
import type { RewardDefinition } from '../domain/rewards/catalog';
import { evaluateNewRewards } from '../domain/rewards/engine';
import type {
  Activity,
  Book,
  Evidence,
  LessonAttempt,
  MasteryLevel,
  MasteryRecord,
  PortfolioItem,
  ReadingSession,
  RewardUnlock,
  TeacherInteraction,
} from '../domain/types';
import { masteryId } from '../domain/util/ids';
import { deriveWorldState, type WorldState } from '../domain/world/worldState';
import { nowIso, type ServiceContext } from './context';

export interface ChildRecords {
  books: Book[];
  sessions: ReadingSession[];
  activities: Activity[];
  evidence: Evidence[];
  mastery: MasteryRecord[];
  lessons: LessonAttempt[];
  unlocks: RewardUnlock[];
  portfolio: PortfolioItem[];
  interactions: TeacherInteraction[];
}

export async function loadChildRecords(ctx: ServiceContext, childId: string): Promise<ChildRecords> {
  const r = ctx.repos;
  const [books, sessions, activities, evidence, mastery, lessons, unlocks, portfolio, interactions] = await Promise.all([
    r.forChild(r.books, childId),
    r.forChild(r.readingSessions, childId),
    r.forChild(r.activities, childId),
    r.forChild(r.evidence, childId),
    r.forChild(r.mastery, childId),
    r.forChild(r.lessonAttempts, childId),
    r.forChild(r.rewardUnlocks, childId),
    r.forChild(r.portfolio, childId),
    r.forChild(r.teacherInteractions, childId),
  ]);
  return { books, sessions, activities, evidence, mastery, lessons, unlocks, portfolio, interactions };
}

const skillDomain = (id: string) => getSkill(id)?.domainId;

export function snapshotFromRecords(rec: ChildRecords): ProgressSnapshot {
  return buildSnapshot(
    {
      books: rec.books,
      evidence: rec.evidence,
      activities: rec.activities,
      lessons: rec.lessons,
      portfolio: rec.portfolio,
      mastery: rec.mastery,
    },
    skillDomain,
  );
}

export function worldFromRecords(rec: ChildRecords, preview = false): WorldState {
  return deriveWorldState(snapshotFromRecords(rec), new Set(rec.unlocks.map((u) => u.rewardId)), preview);
}

/** Replaces or appends records by id. */
function mergeById<T extends { id: string }>(base: T[], staged: T[]): T[] {
  if (staged.length === 0) return base;
  const map = new Map(base.map((x) => [x.id, x]));
  for (const s of staged) map.set(s.id, s);
  return [...map.values()];
}

export interface MasteryChange {
  skillId: string;
  from: MasteryLevel;
  to: MasteryLevel;
}

export interface LearningOutcome {
  newRewards: RewardDefinition[];
  unlocks: RewardUnlock[];
  masteryChanges: MasteryChange[];
  snapshot: ProgressSnapshot;
  world: WorldState;
}

/**
 * Finalizes a unit of work that contains new learning records for a child.
 * Adds mastery updates and reward unlocks to the same atomic commit.
 */
export async function finalizeLearning(ctx: ServiceContext, childId: string, uow: UnitOfWork, trigger: string): Promise<LearningOutcome> {
  const existing = await loadChildRecords(ctx, childId);
  const merged: ChildRecords = {
    books: mergeById(existing.books, uow.staged<Book>('books')),
    sessions: mergeById(existing.sessions, uow.staged<ReadingSession>('readingSessions')),
    activities: mergeById(existing.activities, uow.staged<Activity>('activities')),
    evidence: mergeById(existing.evidence, uow.staged<Evidence>('evidence')),
    mastery: existing.mastery,
    lessons: mergeById(existing.lessons, uow.staged<LessonAttempt>('lessonAttempts')),
    unlocks: existing.unlocks,
    portfolio: mergeById(existing.portfolio, uow.staged<PortfolioItem>('portfolio')),
    interactions: existing.interactions,
  };

  // Guard: everything staged must belong to this child.
  for (const op of uow.ops) {
    const v = op.value as { childId?: string } | undefined;
    if (op.type === 'put' && v && 'childId' in v && v.childId !== childId) {
      throw new Error(`Refusing to write ${op.table} for another child`);
    }
  }

  const now = nowIso(ctx);
  const touched = new Set(uow.staged<Evidence>('evidence').map((e) => e.skillId));
  const masteryById = new Map(existing.mastery.map((m) => [m.id, m]));
  const changes: MasteryChange[] = [];
  for (const skillId of touched) {
    const prev = masteryById.get(masteryId(childId, skillId));
    const next = updateMasteryRecord(
      prev,
      childId,
      skillId,
      merged.evidence.filter((e) => e.skillId === skillId),
      now,
    );
    masteryById.set(next.id, next);
    uow.put('mastery', next);
    const from = effectiveLevel(prev);
    const to = effectiveLevel(next);
    if (from !== to) changes.push({ skillId, from, to });
  }
  merged.mastery = [...masteryById.values()];

  const snapshot = snapshotFromRecords(merged);
  const unlockedIds = new Set(existing.unlocks.map((u) => u.rewardId));
  const newRewards = evaluateNewRewards(snapshot, unlockedIds);
  const unlocks: RewardUnlock[] = newRewards.map((r) => ({
    id: ctx.ids('unlock'),
    childId,
    rewardId: r.id,
    unlockedAt: now,
    celebrated: false,
    trigger,
  }));
  uow.putAll('rewardUnlocks', unlocks);

  await ctx.repos.commit(uow.ops);

  const allUnlocked = new Set([...unlockedIds, ...newRewards.map((r) => r.id)]);
  return {
    newRewards,
    unlocks,
    masteryChanges: changes,
    snapshot,
    world: deriveWorldState(snapshot, allUnlocked),
  };
}

/** Converts a trial summary into an Evidence record. */
export function makeEvidence(
  ctx: ServiceContext,
  input: Omit<Evidence, 'id' | 'observedAt' | 'topics'> & { observedAt?: string; topics?: string[] },
): Evidence {
  const skill = getSkill(input.skillId);
  return {
    ...input,
    id: ctx.ids('ev'),
    observedAt: input.observedAt ?? nowIso(ctx),
    topics: [...new Set([...(input.topics ?? []), ...(skill?.topics ?? [])])],
    ...(input.difficulty === undefined && skill ? { difficulty: skill.difficulty } : {}),
  };
}
