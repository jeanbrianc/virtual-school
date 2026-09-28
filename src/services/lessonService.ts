import { UnitOfWork } from '../data/repositories';
import { chooseStartTier } from '../domain/adaptive/recommendations';
import { getSkill } from '../domain/curriculum';
import { persistenceTrials, tallyBySkill, type LessonRun } from '../domain/lessons/engine';
import type { LessonDefinition } from '../domain/lessons/types';
import type { Evidence, LessonAttempt, TeacherInteraction, TranscriptLine } from '../domain/types';
import { nowIso, type ServiceContext } from './context';
import { finalizeLearning, makeEvidence, type LearningOutcome } from './learningCore';

export async function startTierFor(ctx: ServiceContext, childId: string, lesson: LessonDefinition): Promise<number> {
  const mastery = await ctx.repos.forChild(ctx.repos.mastery, childId);
  return chooseStartTier(
    lesson.tiers.map((t) => t.skillId),
    mastery,
  );
}

export interface RecordLessonResult {
  attempt: LessonAttempt;
  evidence: Evidence[];
  outcome: LearningOutcome;
}

export async function recordLesson(
  ctx: ServiceContext,
  childId: string,
  run: LessonRun,
  startedAt: string,
  transcript: TranscriptLine[],
  parentNotes: string[] = [],
): Promise<RecordLessonResult> {
  const def = run.definition;
  const now = nowIso(ctx);
  const records = [...run.attempts];
  const tallies = tallyBySkill(records, run.problemIndex);

  const independentCount = records.filter((r) => r.outcome === 'independent').length;
  const graded = records.filter((r) => !r.problemId.includes('predict'));
  const summary = `${def.childTitle}: ${graded.filter((r) => r.outcome === 'independent').length} of ${graded.length} solved on the first try, ${graded.filter((r) => r.outcome === 'supported').length} with a hint; ${def.tiers[run.startTier]?.label ?? ''} → ${def.tiers[run.currentTier]?.label ?? ''}.`;

  const attempt: LessonAttempt = {
    id: ctx.ids('lesson'),
    childId,
    lessonId: def.id,
    teacherId: def.teacherId,
    startedAt,
    completedAt: now,
    startTier: run.startTier,
    endTier: run.currentTier,
    problems: records,
    summary,
  };

  const source = { type: 'lesson' as const, id: attempt.id, label: def.childTitle };
  const evidence: Evidence[] = tallies.map((t) => {
    const skill = getSkill(t.skillId);
    const total = t.independent + t.supported + t.notYet;
    const detail = [
      t.independent ? `${t.independent} independently` : '',
      t.supported ? `${t.supported} with a hint or visual` : '',
      t.notYet ? `${t.notYet} not yet (worked through together)` : '',
    ]
      .filter(Boolean)
      .join(', ');
    return makeEvidence(ctx, {
      childId,
      skillId: t.skillId,
      source,
      kind: 'performance',
      trials: { independent: t.independent, supported: t.supported, notYet: t.notYet },
      independence: t.independent === total ? 'independent' : t.independent + t.supported > 0 ? 'supported' : 'assisted',
      statement:
        t.skillId === 'sci.predict'
          ? `Made ${total} prediction${total === 1 ? '' : 's'} before testing in ${def.childTitle} with ${teacherName(def.teacherId)}.`
          : `${def.childTitle}: ${total} ${skill?.name.toLowerCase() ?? t.skillId} problem${total === 1 ? '' : 's'} — ${detail}.`,
      createdBy: 'system',
      ...(skill ? { difficulty: skill.difficulty } : {}),
    });
  });

  const persisted = persistenceTrials(records);
  if (persisted > 0) {
    evidence.push(
      makeEvidence(ctx, {
        childId,
        skillId: 'reason.persistence',
        source,
        kind: 'observation',
        trials: { independent: persisted, supported: 0, notYet: 0 },
        independence: 'independent',
        statement: `Kept going after a hint and solved ${persisted} problem${persisted === 1 ? '' : 's'} in ${def.childTitle}.`,
        createdBy: 'system',
      }),
    );
  }

  const interaction: TeacherInteraction = {
    id: ctx.ids('talk'),
    childId,
    teacherId: def.teacherId,
    startedAt,
    endedAt: now,
    context: { lessonId: def.id, flow: 'lesson' },
    transcript,
    outcome: summary,
    ...(parentNotes.length ? { parentNotes } : {}),
  };

  const uow = new UnitOfWork();
  uow.put('lessonAttempts', attempt).putAll('evidence', evidence).put('teacherInteractions', interaction);
  if (independentCount === 0 && records.length === 0) throw new Error('Nothing to record');
  const outcome = await finalizeLearning(ctx, childId, uow, `lesson:${def.id}`);
  return { attempt, evidence, outcome };
}

export async function recordConversation(
  ctx: ServiceContext,
  childId: string,
  teacherId: string,
  flow: string,
  startedAt: string,
  transcript: TranscriptLine[],
  outcome: string,
  parentNotes: string[] = [],
): Promise<void> {
  if (transcript.length === 0) return;
  await ctx.repos.teacherInteractions.put({
    id: ctx.ids('talk'),
    childId,
    teacherId,
    startedAt,
    endedAt: nowIso(ctx),
    context: { flow },
    transcript,
    outcome,
    ...(parentNotes.length ? { parentNotes } : {}),
  });
}

/** A parent has read the notes on a conversation. */
export async function markNotesSeen(ctx: ServiceContext, interactionId: string): Promise<void> {
  const i = await ctx.repos.teacherInteractions.get(interactionId);
  if (i) await ctx.repos.teacherInteractions.put({ ...i, notesSeen: true });
}

function teacherName(id: string): string {
  return id === 'hoot' ? 'Professor Hoot' : id === 'digit' ? 'Digit' : id === 'nova' ? 'Nova' : id;
}
