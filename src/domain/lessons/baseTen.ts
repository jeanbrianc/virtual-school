import { isProficientOrAbove } from '../adaptive/recommendations';
import { effectiveLevel } from '../mastery/masteryEngine';
import type { MasteryRecord, ProblemAttemptRecord } from '../types';
import { createRng, randInt, shuffle } from '../util/random';
import type { LessonDefinition, Problem } from './types';

export const BASE_TEN_ID = 'base-ten-mission';
export const BASE_TEN_ROUNDS = 5;
export const BASE_TEN_TIERS = [
  { skillId: 'math.tens-ones-20-99', label: 'Identify tens and ones in 20–99' },
  { skillId: 'math.compose-20-99', label: 'Compose 20–99 from tens and ones' },
  { skillId: 'math.decompose-20-99', label: 'Decompose 20–99 into tens and ones' },
] as const;
export type BaseTenMode = 'learning' | 'review';
export type BaseTenSupport = 'hint' | 'simpler' | 'model';
export interface BaseTenResponse {
  responses: string[];
  scaffolds: BaseTenSupport[];
  skipped?: boolean;
}
export interface BaseTenProgress {
  id: string;
  childId: string;
  startedAt: string;
  seed: number;
  tier: number;
  mode: BaseTenMode;
  rounds: BaseTenResponse[];
}

export function baseTenEntry(records: MasteryRecord[]) {
  const bySkill = new Map(records.map((record) => [record.skillId, record]));
  const ready = isProficientOrAbove(effectiveLevel(bySkill.get('math.count-20')));
  const next = BASE_TEN_TIERS.findIndex((tier) => !isProficientOrAbove(effectiveLevel(bySkill.get(tier.skillId))));
  const review = BASE_TEN_TIERS.findIndex((tier) => bySkill.get(tier.skillId)?.needsReview);
  const atCeiling = next < 0;
  return {
    ready,
    atCeiling,
    tier: review >= 0 ? review : Math.max(0, next),
    mode: (!ready || atCeiling || review >= 0 ? 'review' : 'learning') as BaseTenMode,
  };
}

/** Five distinct values per session; a fixed seed reproduces every target and choice. */
export function baseTenProblem(seed: number, tier: number, round: number, simpler = false): Problem {
  if (!Number.isInteger(tier) || tier < 0 || tier >= BASE_TEN_TIERS.length) throw new Error('Unknown place-value goal.');
  if (!Number.isInteger(round) || round < 0 || round >= BASE_TEN_ROUNDS) throw new Error('Unknown place-value round.');
  const rng = createRng(seed);
  const values = shuffle(
    rng,
    Array.from({ length: 80 }, (_, i) => 20 + i),
  );
  const value = simpler ? 20 + (round % 5) : values[round]!;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const part = round % 2 === 0 ? 'tens' : 'ones';
  const model = `${value} is ${tens} tens and ${ones} ones. Each ten is a bundle of 10: ${tens} × 10 = ${tens * 10}. ${tens * 10} + ${ones} = ${value}.${ones === 0 ? ' There are no extra ones; the ones digit is 0.' : ''}`;
  const answer = tier === 0 ? (part === 'tens' ? tens : ones) : value;
  const candidates = new Set<number>([answer]);
  while (candidates.size < 3) candidates.add(tier === 0 ? randInt(rng, part === 'tens' ? 2 : 0, 9) : randInt(rng, 20, 99));
  const choices = shuffle(rng, [...candidates]).map((n) => ({
    id: String(n),
    label: tier === 2 ? `${Math.floor(n / 10)} tens and ${n % 10} ones` : String(n),
  }));
  return {
    id: `base-ten:${tier}:${round}${simpler ? ':simpler' : ''}`,
    skillId: BASE_TEN_TIERS[tier]!.skillId,
    tier,
    kind: 'answer',
    prompt:
      tier === 0
        ? `Look at ${value}. How many ${part} does it have?`
        : tier === 1
          ? `What number is ${tens} tens and ${ones} ones?`
          : `Which tens and ones make ${value}?`,
    visual: { type: 'base-ten', tens, ones, numeral: tier === 1 ? null : value },
    choices,
    answerId: String(answer),
    hints: [
      tier === 0
        ? `The left digit counts bundles of ten. The right digit counts extra ones. Look at the ${part === 'tens' ? 'left' : 'right'} digit.`
        : 'Count each bundle as ten, then count the extra ones. Match the tens first, then the ones.',
      model,
    ],
    model,
    success: `Yes! ${model}`,
    difficulty: 2,
    meta: { value, tens, ones, part },
  };
}

/** Rebuild stored observations from reviewed targets; skipped rounds never become failures. */
export function baseTenRecord(seed: number, tier: number, round: number, input: BaseTenResponse): ProblemAttemptRecord {
  const p = baseTenProblem(seed, tier, round);
  if (!input.responses.every((id) => p.choices.some((choice) => choice.id === id))) throw new Error('Unknown answer.');
  if (!input.scaffolds.every((s) => ['hint', 'simpler', 'model'].includes(s))) throw new Error('Unknown support.');
  const right = input.responses.at(-1) === p.answerId;
  if (!input.skipped && !right && !input.scaffolds.includes('model')) throw new Error('Round is not finished.');
  const supported = input.scaffolds.length > 0 || input.responses.length > 1;
  return {
    problemId: p.id,
    skillId: p.skillId,
    tier,
    prompt: p.prompt,
    responses: input.responses.map((id) => p.choices.find((choice) => choice.id === id)!.label),
    scaffolds: [...new Set([...input.scaffolds, ...(input.skipped ? ['skipped'] : [])])],
    outcome: input.skipped ? 'skipped' : input.scaffolds.includes('model') ? 'not_yet' : right ? (supported ? 'supported' : 'independent') : 'not_yet',
  };
}

/** Registered for safe teacher routing; the dedicated flow saves each finished round. */
export const baseTenLesson: LessonDefinition = {
  id: BASE_TEN_ID,
  teacherId: 'digit',
  title: 'Base-ten mission: tens and ones, 20–99',
  childTitle: 'Tens and ones mission',
  completeTitle: 'You explored tens and ones!',
  intro: ['A bundle of ten and some extra ones can build a number.'],
  outro: 'We can practise another day to see what you remember.',
  rounds: BASE_TEN_ROUNDS,
  manualProgression: true,
  tiers: [...BASE_TEN_TIERS],
  ladder: ['hint', 'simpler', 'alternate'],
  generateRound: (tier, rng, round) => [baseTenProblem(Math.floor(rng() * 0xffffffff), tier, round)],
};
