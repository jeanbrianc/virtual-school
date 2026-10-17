import { UnitOfWork } from '../data/repositories';
import { validRhythmRun, type RhythmRun } from '../domain/music/rhythm';
import type { LessonAttempt } from '../domain/types';
import { nowIso, type ServiceContext } from './context';
import { finalizeLearning, makeEvidence } from './learningCore';

/** Narrow evidence only: no input timestamps, pace, latency or failed-timing ability inference. */
export async function recordRhythm(ctx: ServiceContext, childId: string, run: RhythmRun): Promise<LessonAttempt> {
  if (!validRhythmRun(run)) throw new Error('Incomplete rhythm visit');
  if (run.childId !== childId) throw new Error('Rhythm visit belongs to another child');
  if (!(await ctx.repos.children.get(childId))) throw new Error('Unknown rhythm learner');
  const id = `rhythm:${childId}:${run.id}`;
  const existing = await ctx.repos.lessonAttempts.get(id);
  if (existing) return existing;
  const skillId = run.mode === 'copy' ? 'art.rhythm-copy' : 'art.rhythm-recognize';
  const task = run.mode === 'copy' ? 'Copied beat-and-pause intervals' : 'Matched a beat-and-pause picture without timing';
  const summary = `${run.beats}-beat ${run.mode === 'copy' ? 'copy' : 'untimed picture recognition'}: ${run.trials.map((t) => `${t.stage}: ${t.outcome}, ${t.supported ? 'supported' : 'without hints'}, ${t.input}, ${t.presentation}`).join('; ')}. Exploration is not a low-ability result. No general music proficiency inferred.`;
  const attempt: LessonAttempt = {
    id,
    childId,
    lessonId: 'rhythm-garden',
    teacherId: 'milo',
    startedAt: run.startedAt,
    completedAt: nowIso(ctx),
    startTier: 0,
    endTier: 0,
    problems: run.trials.map((t, i) => ({
      problemId: `${id}:${i}`,
      skillId,
      tier: 0,
      prompt: `${t.stage}: ${run.beats}-beat pattern ${t.pattern}`,
      responses: t.outcome === 'skipped' ? [] : [`${t.outcome}; ${t.input}; ${t.presentation}`],
      scaffolds: t.supported ? ['model'] : [],
      // The legacy problem enum has no exploratory state. Do not mislabel an unverified timing sample as not_yet.
      outcome: t.outcome !== 'matched' ? 'skipped' : t.supported ? 'supported' : 'independent',
    })),
    summary,
  };
  const evidence = run.trials.flatMap((t, i) =>
    t.outcome !== 'matched'
      ? []
      : [
          {
            ...makeEvidence(ctx, {
              childId,
              skillId,
              source: { type: 'lesson', id, label: 'Milo’s rhythm garden' },
              kind: 'performance',
              independence: t.supported ? 'supported' : 'independent',
              trials: { independent: t.supported ? 0 : 1, supported: t.supported ? 1 : 0, notYet: 0 },
              statement: `${task} in a ${run.beats}-beat original pattern ${t.supported ? 'with a model or hint' : 'without a hint on a fresh pattern'} using ${t.input} and ${t.presentation}. ${run.mode === 'copy' ? 'Generous interval tolerance; no speed, hearing, or general musical-ability claim.' : 'Visual pattern recognition only; not evidence of timed rhythm reproduction or listening.'}`,
              createdBy: 'system',
            }),
            id: `${id}:evidence:${i}`,
          },
        ],
  );
  const uow = new UnitOfWork().add('lessonAttempts', attempt).putAll('evidence', evidence);
  try {
    await finalizeLearning(ctx, childId, uow, 'lesson:rhythm-garden');
  } catch (error) {
    const saved = await ctx.repos.lessonAttempts.get(id);
    if (saved) return saved;
    throw error;
  }
  return attempt;
}
