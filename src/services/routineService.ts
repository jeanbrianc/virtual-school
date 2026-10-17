import { UnitOfWork } from '../data/repositories';
import { REFLECTIONS, ROUTINE_LESSON_ID, ROUTINE_SKILLS, ROUTINE_TITLE, validateRoutineOrder, type RoutineRun } from '../domain/lessons/routine';
import type { LessonAttempt, TeacherInteraction } from '../domain/types';
import { nowIso, type ServiceContext } from './context';
import { finalizeLearning, makeEvidence } from './learningCore';

/** Stable completion ID + insert guard: attempt, evidence, transcript, mastery and sync outbox commit together. */
export async function recordRoutine(ctx: ServiceContext, childId: string, run: RoutineRun): Promise<LessonAttempt> {
  if (
    run.childId !== childId ||
    !run.complete ||
    run.trials.length !== 2 ||
    run.trials.some((t) => t.outcome !== 'skipped' && validateRoutineOrder(t.task, t.orders.at(-1) ?? []) !== 'valid')
  )
    throw new Error('Incomplete or wrong-child routine');
  const id = `routine:${childId}:${run.id}`;
  const existing = await ctx.repos.lessonAttempts.get(id);
  if (existing) return existing;
  const now = nowIso(ctx);
  const solved = run.trials.filter((t) => t.outcome !== 'skipped');
  const independent = solved.filter((t) => t.outcome === 'independent').length;
  const summary = `${ROUTINE_TITLE}: ${independent} independent, ${solved.length - independent} supported, ${2 - solved.length} skipped. ${run.trials.map((t) => `${t.task.size} cards: ${t.outcome}, input ${t.modalities.join(' + ') || 'none'}`).join('; ')}. Fictional picture ordering only; no claim about real-life habits, reading or motor skill.${run.reflection ? ` Optional reflection (descriptive, not graded): ${REFLECTIONS[run.reflection]}` : ''}`;
  const attempt: LessonAttempt = {
    id,
    childId,
    lessonId: ROUTINE_LESSON_ID,
    teacherId: 'tavi',
    startedAt: run.startedAt,
    completedAt: now,
    startTier: run.size - 2,
    endTier: (run.trials.at(-1)?.task.size ?? run.size) - 2,
    problems: run.trials.map((t, i) => ({
      problemId: `${id}:${i}`,
      skillId: ROUTINE_SKILLS[0],
      tier: t.task.size - 2,
      prompt: `${t.task.title}. ${t.task.instruction}`,
      responses: t.orders.map((order) => order.map((key) => t.task.cards.find((c) => c.id === key)?.label ?? key).join(' → ')),
      scaffolds: [...t.scaffolds, ...t.modalities.map((m) => `input:${m}`)],
      outcome: t.outcome,
    })),
    summary,
  };
  const evidence = solved.flatMap((trial, i) =>
    ROUTINE_SKILLS.map((skillId) => ({
      ...makeEvidence(ctx, {
        childId,
        skillId,
        source: { type: 'lesson', id, label: ROUTINE_TITLE },
        kind: 'performance',
        independence: trial.outcome === 'independent' ? 'independent' : 'supported',
        trials: { independent: trial.outcome === 'independent' ? 1 : 0, supported: trial.outcome === 'supported' ? 1 : 0, notYet: 0 },
        statement: `Ordered ${trial.task.size} fictional ${trial.task.theme} picture cards within the stated before/after constraints; ${trial.outcome}. Input: ${trial.modalities.join(', ') || 'not observed'}. Support: ${trial.scaffolds.join(', ') || 'none'}. Alternative valid orders accepted. No inference about real routines, reading, explanation or motor proficiency.`,
        createdBy: 'system',
      }),
      id: `${id}:evidence:${i}:${skillId}`,
    })),
  );
  const interaction: TeacherInteraction = {
    id: `${id}:talk`,
    childId,
    teacherId: 'tavi',
    startedAt: run.startedAt,
    endedAt: now,
    context: { flow: 'routine', lessonId: ROUTINE_LESSON_ID },
    transcript: run.reflection ? [{ speaker: 'child', text: REFLECTIONS[run.reflection], at: now }] : [],
    outcome: summary,
  };
  const uow = new UnitOfWork().add('lessonAttempts', attempt).putAll('evidence', evidence).put('teacherInteractions', interaction);
  try {
    await finalizeLearning(ctx, childId, uow, `lesson:${ROUTINE_LESSON_ID}`);
  } catch (error) {
    const saved = await ctx.repos.lessonAttempts.get(id);
    if (saved) return saved;
    throw error;
  }
  return attempt;
}
