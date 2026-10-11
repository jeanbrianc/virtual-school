import { UnitOfWork } from '../data/repositories';
import type { LessonAttempt, ProblemAttemptRecord } from '../domain/types';
import { nowIso, type ServiceContext } from './context';

export interface PracticeProgress {
  id: string;
  childId?: string;
  lessonId: 'globe-states' | 'globe-countries';
  startedAt: string;
  problems: ProblemAttemptRecord[];
  complete: boolean;
}

/** Identification remains an observation, not evidence of broad geography mastery. */
function honestProblem(problem: ProblemAttemptRecord): ProblemAttemptRecord {
  return {
    ...problem,
    responses: [...problem.responses],
    scaffolds: [...problem.scaffolds],
    outcome: problem.outcome === 'independent' && (problem.scaffolds.length > 0 || problem.responses.length > 1) ? 'supported' : problem.outcome,
  };
}

/** Save cumulative rounds without allowing a late save or another tab to erase progress. */
export async function recordPractice(ctx: ServiceContext, childId: string, progress: PracticeProgress): Promise<void> {
  if (progress.childId && progress.childId !== childId) throw new Error('Learning session belongs to another child.');
  if (!progress.problems.length) return;
  const key = `practice-revision:${progress.id}`;
  for (let retry = 0; retry < 20; retry++) {
    // Read revision first: an intervening writer then causes our atomic add to fail.
    const revisionRecord = await ctx.repos.meta.get(key);
    const revision = typeof revisionRecord?.value === 'number' ? revisionRecord.value : 0;
    const existing = await ctx.repos.lessonAttempts.get(progress.id);
    if (
      existing &&
      (existing.childId !== childId || existing.lessonId !== progress.lessonId || existing.teacherId !== 'nova' || existing.startedAt !== progress.startedAt)
    ) {
      throw new Error('Learning session belongs to another child or adventure.');
    }
    const rounds = new Map((existing?.problems ?? []).map((p) => [p.problemId, p]));
    for (const supplied of progress.problems) {
      const incoming = honestProblem(supplied);
      const previous = rounds.get(incoming.problemId);
      if (!previous) rounds.set(incoming.problemId, incoming);
      else {
        if (previous.prompt !== incoming.prompt || previous.skillId !== incoming.skillId) throw new Error('Round identity changed.');
        // A solved round is immutable, except newly reported support must never be hidden.
        const supported = previous.outcome === 'supported' || incoming.outcome === 'supported';
        const chosen = previous.outcome === 'not_yet' || (incoming.outcome === 'supported' && previous.outcome === 'independent') ? incoming : previous;
        rounds.set(incoming.problemId, { ...chosen, outcome: supported ? 'supported' : chosen.outcome });
      }
    }
    const problems = [...rounds.values()];
    if (problems.length > 5) throw new Error('An adventure has at most five rounds.');
    const complete = existing?.complete === true || (progress.complete && problems.length === 5);
    if (existing && existing.complete === complete && JSON.stringify(existing.problems) === JSON.stringify(problems)) return;
    const title = progress.lessonId === 'globe-states' ? 'US State Adventure' : 'World Country Adventure';
    const attempt: LessonAttempt = {
      id: progress.id,
      childId,
      lessonId: progress.lessonId,
      teacherId: 'nova',
      startedAt: progress.startedAt,
      completedAt: existing?.complete ? existing.completedAt : nowIso(ctx),
      complete,
      startTier: 0,
      endTier: 0,
      problems,
      summary: `${title}: ${problems.length} rounds saved · ${complete ? 'complete' : 'in progress'}. ${problems.filter((p) => p.outcome === 'independent').length} independent; ${problems.filter((p) => p.outcome === 'supported').length} with visual support, a hint or retry; ${problems.filter((p) => p.outcome === 'not_yet' || p.outcome === 'skipped').length} skipped or not yet. Map identification observations only.`,
    };
    const uow = new UnitOfWork()
      .add('meta', { key: `${key}:${revision + 1}`, value: true })
      .put('meta', { key, value: revision + 1 })
      .put('lessonAttempts', attempt);
    try {
      await ctx.repos.commit(uow.ops);
      return;
    } catch (error) {
      // IndexedDB's transaction error may be generic before its abort event.
      // Only retry when the unique revision was claimed by a competing save.
      const claimed = await ctx.repos.meta.get(`${key}:${revision + 1}`);
      if (!claimed) throw error;
    }
  }
  throw new Error('Adventure save is busy. Please retry.');
}
