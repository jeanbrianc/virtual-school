/**
 * Deterministic mastery engine.
 *
 * Mastery is derived *only* from evidence — never from time spent or from
 * exposure alone — so the parent view can't be inflated:
 *
 *   not_started  no evidence at all
 *   introduced   exposure or attempts, but no success yet
 *   developing   at least one success (with or without support)
 *   proficient   ≥ PROFICIENT.independent independent successes on
 *                ≥ PROFICIENT.days separate days and a recent score ≥ PROFICIENT.score
 *   mastered     ≥ MASTERED.independent independent successes on ≥ MASTERED.days days,
 *                recent score ≥ MASTERED.score, and the last MASTERED.streak trials
 *                were all independent successes
 *
 * Supported (hinted) successes count toward "developing" and half-credit in the
 * recent score, but never toward the independent thresholds.
 */
import type { Evidence, MasteryLevel, MasteryRecord, MasteryStats, Timestamp } from '../types';
import { masteryId } from '../util/ids';
import { dayFromTimestamp } from '../util/time';

export const MASTERY_ORDER: MasteryLevel[] = ['not_started', 'introduced', 'developing', 'proficient', 'mastered'];

export const MASTERY_RULES = {
  recentWindow: 10,
  proficient: { independent: 3, days: 2, score: 0.7 },
  mastered: { independent: 6, days: 3, score: 0.85, streak: 3 },
  /** Recent score below this after reaching proficiency flags "needs review". */
  reviewScore: 0.5,
  confidence: { medium: 4, high: 8 },
} as const;

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  not_started: 'Not started',
  introduced: 'Introduced',
  developing: 'Developing',
  proficient: 'Proficient',
  mastered: 'Mastered',
};

export function masteryRank(level: MasteryLevel): number {
  return MASTERY_ORDER.indexOf(level);
}

export function maxLevel(a: MasteryLevel, b: MasteryLevel): MasteryLevel {
  return masteryRank(a) >= masteryRank(b) ? a : b;
}

type TrialOutcome = 'independent' | 'supported' | 'notYet';

/** Expands evidence into an ordered per-trial sequence (oldest first). */
function trialSequence(evidence: Evidence[]): { outcome: TrialOutcome; day: string }[] {
  const sorted = [...evidence].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const seq: { outcome: TrialOutcome; day: string }[] = [];
  for (const e of sorted) {
    const day = dayFromTimestamp(e.observedAt);
    // Within one piece of evidence we assume learning moves forward:
    // not-yet attempts, then supported successes, then independent ones.
    for (let i = 0; i < e.trials.notYet; i++) seq.push({ outcome: 'notYet', day });
    for (let i = 0; i < e.trials.supported; i++) seq.push({ outcome: 'supported', day });
    for (let i = 0; i < e.trials.independent; i++) seq.push({ outcome: 'independent', day });
  }
  return seq;
}

const TRIAL_SCORE: Record<TrialOutcome, number> = { independent: 1, supported: 0.5, notYet: 0 };

export interface MasteryComputation {
  level: MasteryLevel;
  stats: MasteryStats;
  confidence: MasteryRecord['confidence'];
}

export function computeMastery(evidence: Evidence[]): MasteryComputation {
  const seq = trialSequence(evidence);
  const exposures = evidence.filter((e) => e.kind === 'exposure').length;
  const independent = seq.filter((t) => t.outcome === 'independent').length;
  const supported = seq.filter((t) => t.outcome === 'supported').length;
  const notYet = seq.filter((t) => t.outcome === 'notYet').length;
  const independentDays = new Set(seq.filter((t) => t.outcome === 'independent').map((t) => t.day)).size;
  const recent = seq.slice(-MASTERY_RULES.recentWindow);
  const recentScore = recent.length ? recent.reduce((sum, t) => sum + TRIAL_SCORE[t.outcome], 0) / recent.length : 0;
  const lastObservedAt = evidence.reduce<Timestamp | undefined>(
    (latest, e) => (!latest || e.observedAt > latest ? e.observedAt : latest),
    undefined,
  );

  const stats: MasteryStats = {
    independent,
    supported,
    notYet,
    exposures,
    independentDays,
    recentScore: Math.round(recentScore * 100) / 100,
    ...(lastObservedAt ? { lastObservedAt } : {}),
  };

  let level: MasteryLevel = 'not_started';
  if (evidence.length > 0) level = 'introduced';
  if (independent + supported > 0) level = 'developing';
  const P = MASTERY_RULES.proficient;
  if (independent >= P.independent && independentDays >= P.days && recentScore >= P.score) level = 'proficient';
  const M = MASTERY_RULES.mastered;
  const lastStreak = seq.slice(-M.streak);
  if (
    independent >= M.independent &&
    independentDays >= M.days &&
    recentScore >= M.score &&
    lastStreak.length === M.streak &&
    lastStreak.every((t) => t.outcome === 'independent')
  ) {
    level = 'mastered';
  }

  const trials = seq.length;
  const confidence: MasteryComputation['confidence'] =
    trials >= MASTERY_RULES.confidence.high ? 'high' : trials >= MASTERY_RULES.confidence.medium ? 'medium' : 'low';

  return { level, stats, confidence };
}

/**
 * Produces the next persisted mastery record from evidence, preserving
 * history and any parent override.
 */
export function updateMasteryRecord(
  previous: MasteryRecord | undefined,
  childId: string,
  skillId: string,
  evidence: Evidence[],
  now: Timestamp,
): MasteryRecord {
  const { level, stats, confidence } = computeMastery(evidence);
  const history = [...(previous?.history ?? [])];
  if (!previous || previous.computedLevel !== level) history.push({ at: now, level });
  const peak = history.reduce<MasteryLevel>((p, h) => maxLevel(p, h.level), 'not_started');
  const needsReview =
    masteryRank(peak) >= masteryRank('proficient') &&
    masteryRank(level) < masteryRank(peak) &&
    stats.recentScore < MASTERY_RULES.reviewScore;
  return {
    id: masteryId(childId, skillId),
    childId,
    skillId,
    computedLevel: level,
    ...(previous?.override ? { override: previous.override } : {}),
    stats,
    confidence,
    needsReview,
    history,
    updatedAt: now,
  };
}

/** The level parents see: a parent assessment wins, but both are kept. */
export function effectiveLevel(record: MasteryRecord | undefined): MasteryLevel {
  if (!record) return 'not_started';
  return record.override?.level ?? record.computedLevel;
}

/** Parent-facing summary sentence for a skill at a level. */
export function masteryStatement(can: string, level: MasteryLevel): string {
  switch (level) {
    case 'mastered':
      return `Consistently able to ${can} independently, across many days.`;
    case 'proficient':
      return `Demonstrates the ability to ${can} independently.`;
    case 'developing':
      return `Can ${can} with some support; building independence.`;
    case 'introduced':
      return `Has been introduced to how to ${can}.`;
    default:
      return `Not yet started: ${can}.`;
  }
}
