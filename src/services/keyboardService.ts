import { UnitOfWork } from '../data/repositories';
import type { KeyboardTrail } from '../domain/lessons/keyboardTrail';
import type { LessonAttempt } from '../domain/types';
import { nowIso, type ServiceContext } from './context';
import { finalizeLearning, makeEvidence } from './learningCore';

export async function recordKeyboardTrail(ctx: ServiceContext, childId: string, run: KeyboardTrail): Promise<LessonAttempt> {
  if (
    run.cancelled ||
    run.trials.length !== 5 ||
    run.letters.length !== 5 ||
    new Set(run.letters).size !== 5 ||
    run.trials.some((t, i) => t.letter !== run.letters[i] || !/^[A-Z]$/.test(t.letter))
  )
    throw new Error('Incomplete keyboard trail');
  const id = `keyboard:${childId}:${run.id}`;
  const existing = await ctx.repos.lessonAttempts.get(id);
  if (existing) return existing;
  const summary = `Keyboard trail: ${run.trials.map((t) => `${t.letter}: ${t.modality}, ${t.outcome}`).join('; ')}. Letter/key familiarity only.`;
  const attempt: LessonAttempt = {
    id,
    childId,
    lessonId: 'keyboard-trail',
    teacherId: 'hoot',
    startedAt: run.startedAt,
    completedAt: nowIso(ctx),
    startTier: 0,
    endTier: 0,
    problems: run.trials.map((t, i) => ({
      problemId: `${id}:${i}`,
      skillId: t.modality === 'physical' ? 'reason.keyboard-match' : 'reason.letter-match',
      tier: 0,
      prompt: `Find ${t.letter}`,
      responses: t.modality === 'skipped' ? [] : [`${t.modality}:${t.letter}`],
      scaffolds: t.outcome === 'supported' ? ['highlight'] : [],
      outcome: t.outcome,
    })),
    summary,
  };
  const evidence = run.trials.flatMap((t, i) =>
    t.modality === 'skipped'
      ? []
      : [
          {
            ...makeEvidence(ctx, {
              childId,
              skillId: t.modality === 'physical' ? 'reason.keyboard-match' : 'reason.letter-match',
              source: { type: 'lesson', id, label: 'Keyboard trail' },
              kind: 'performance',
              independence: t.outcome === 'independent' ? 'independent' : 'supported',
              trials: { independent: t.outcome === 'independent' ? 1 : 0, supported: t.outcome === 'supported' ? 1 : 0, notYet: 0 },
              statement: `Matched ${t.letter} using ${t.modality === 'physical' ? 'a physical key' : 'a touch letter choice'} ${t.outcome === 'supported' ? 'after a hint' : 'independently'}.`,
              createdBy: 'system',
            }),
            id: `${id}:evidence:${i}`,
          },
        ],
  );
  const uow = new UnitOfWork().add('lessonAttempts', attempt).putAll('evidence', evidence);
  try {
    await finalizeLearning(ctx, childId, uow, 'lesson:keyboard-trail');
  } catch (err) {
    const saved = await ctx.repos.lessonAttempts.get(id);
    if (saved) return saved;
    throw err;
  }
  return attempt;
}
