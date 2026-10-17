import { UnitOfWork } from '../data/repositories';
import { getSkill } from '../domain/curriculum';
import { BASE_TEN_ID, BASE_TEN_ROUNDS, BASE_TEN_TIERS, baseTenRecord, type BaseTenProgress } from '../domain/lessons/baseTen';
import type { Evidence, LessonAttempt } from '../domain/types';
import { nowIso, type ServiceContext } from './context';
import { finalizeLearning, makeEvidence } from './learningCore';

/** Atomic, child-scoped, append-only round saves. Review remains dated observations, not new-skill evidence. */
export async function recordBaseTen(ctx: ServiceContext, childId: string, progress: BaseTenProgress): Promise<void> {
  if (progress.childId !== childId || !(await ctx.repos.children.get(childId))) throw new Error('Learning session belongs to another child.');
  if (!progress.id || !Number.isInteger(progress.seed) || !Number.isFinite(Date.parse(progress.startedAt))) throw new Error('Invalid learning session.');
  if (!['learning', 'review'].includes(progress.mode) || progress.rounds.length > BASE_TEN_ROUNDS) throw new Error('Invalid practice mode or round count.');
  const goal = BASE_TEN_TIERS[progress.tier];
  if (!goal || !Number.isInteger(progress.tier)) throw new Error('Unknown place-value goal.');
  if (!progress.rounds.length) return;
  const problems = progress.rounds.map((response, i) => baseTenRecord(progress.seed, progress.tier, i, response));
  const id = `base-ten:${childId}:${progress.id}`;
  const revisionKey = `base-ten-revision:${id}`;
  for (let retry = 0; retry < 20; retry++) {
    const revisionRecord = await ctx.repos.meta.get(revisionKey);
    const revision = typeof revisionRecord?.value === 'number' ? revisionRecord.value : 0;
    const existing = await ctx.repos.lessonAttempts.get(id);
    if (existing) {
      if (
        existing.childId !== childId ||
        existing.lessonId !== BASE_TEN_ID ||
        existing.teacherId !== 'digit' ||
        existing.startedAt !== progress.startedAt ||
        existing.startTier !== progress.tier ||
        existing.practiceMode !== progress.mode
      )
        throw new Error('Learning session identity changed.');
      for (let i = 0; i < Math.min(existing.problems.length, problems.length); i++) {
        if (JSON.stringify(existing.problems[i]) !== JSON.stringify(problems[i])) throw new Error('A saved round cannot change.');
      }
      if (existing.problems.length >= problems.length) return;
    }
    const complete = problems.length === BASE_TEN_ROUNDS;
    const counts = {
      independent: problems.filter((p) => p.outcome === 'independent').length,
      supported: problems.filter((p) => p.outcome === 'supported').length,
      notYet: problems.filter((p) => p.outcome === 'not_yet').length,
      skipped: problems.filter((p) => p.outcome === 'skipped').length,
    };
    const summary = `${goal.label} · ${progress.mode === 'review' ? 'optional review observations' : 'new learning'}: ${counts.independent} independent, ${counts.supported} supported, ${counts.notYet} not yet, ${counts.skipped} skipped. ${problems.length}/${BASE_TEN_ROUNDS} rounds saved. ${progress.mode === 'review' ? 'Review does not advance new-skill mastery.' : 'Only attempted, graded rounds contribute evidence; skips do not.'}`;
    const attempt: LessonAttempt = {
      id,
      childId,
      lessonId: BASE_TEN_ID,
      teacherId: 'digit',
      practiceMode: progress.mode,
      startedAt: progress.startedAt,
      completedAt: nowIso(ctx),
      complete,
      startTier: progress.tier,
      endTier: progress.tier,
      problems,
      summary,
    };
    const evidence: Evidence[] =
      progress.mode === 'review'
        ? []
        : problems.flatMap((problem, i) => {
            if (problem.outcome === 'skipped') return [];
            const item = makeEvidence(ctx, {
              childId,
              skillId: problem.skillId,
              source: { type: 'lesson', id, label: goal.label },
              kind: 'performance',
              trials: {
                independent: Number(problem.outcome === 'independent'),
                supported: Number(problem.outcome === 'supported'),
                notYet: Number(problem.outcome === 'not_yet'),
              },
              independence: problem.outcome === 'independent' ? 'independent' : problem.outcome === 'supported' ? 'supported' : 'assisted',
              statement: `${problem.prompt} ${problem.outcome === 'independent' ? 'Answered independently.' : problem.outcome === 'supported' ? 'Answered after support or a retry.' : 'Worked model shown; not yet independent.'}`,
              createdBy: 'system',
              difficulty: getSkill(problem.skillId)!.difficulty,
            });
            item.id = `${id}:round:${i}`;
            // Preserve the actual observation day on retries and later cumulative saves.
            return [item];
          });
    for (const item of evidence) {
      const previous = await ctx.repos.evidence.get(item.id);
      if (previous) item.observedAt = previous.observedAt;
    }
    const uow = new UnitOfWork()
      .add('meta', { key: `${revisionKey}:${revision + 1}`, value: true })
      .put('meta', { key: revisionKey, value: revision + 1 })
      .put('lessonAttempts', attempt)
      .putAll('evidence', evidence)
      .put('teacherInteractions', {
        id: `${id}:talk`,
        childId,
        teacherId: 'digit',
        startedAt: progress.startedAt,
        endedAt: nowIso(ctx),
        context: { lessonId: BASE_TEN_ID, flow: 'lesson' },
        transcript: [],
        outcome: summary,
      });
    try {
      await finalizeLearning(ctx, childId, uow, `lesson:${BASE_TEN_ID}`);
      return;
    } catch (error) {
      if (!(await ctx.repos.meta.get(`${revisionKey}:${revision + 1}`))) throw error;
    }
  }
  throw new Error('Learning save is busy. Please retry.');
}
