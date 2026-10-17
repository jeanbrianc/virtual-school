import { isProficientOrAbove } from '../adaptive/recommendations';
import { effectiveLevel } from '../mastery/masteryEngine';
import type { MasteryRecord, ProblemAttemptRecord } from '../types';
import { createRng, shuffle } from '../util/random';
import type { LessonDefinition, Problem } from './types';

export const ARITHMETIC_ID = 'base-ten-arithmetic';
export const ARITHMETIC_ROUNDS = 4;
export const ARITHMETIC_CHALLENGES = [
  { skillId: 'math.add-100-no-regroup-answer', label: 'Add within 100' },
  { skillId: 'math.subtract-100-no-regroup-answer', label: 'Add and subtract within 100' },
] as const;
export type ArithmeticMode = 'learning' | 'review';
export type ArithmeticSupport = 'hint' | 'simpler' | 'model';
export interface ArithmeticResponse {
  responses: string[];
  scaffolds: ArithmeticSupport[];
  skipped?: boolean;
}
export interface ArithmeticProgress {
  id: string;
  childId: string;
  startedAt: string;
  seed: number;
  tier: number;
  mode: ArithmeticMode;
  rounds: ArithmeticResponse[];
}
export interface ArithmeticProblem extends Problem {
  left: number;
  right: number;
  operation: 'add' | 'subtract';
}

/** Evidence informs a parent's choice, never automatic age/reading placement or a hard unlock. */
export function arithmeticEntry(records: MasteryRecord[]) {
  const bySkill = new Map(records.map((record) => [record.skillId, record]));
  const proficient = (id: string) => isProficientOrAbove(effectiveLevel(bySkill.get(id))) && !bySkill.get(id)?.needsReview;
  const readyAdd = ['math.tens-ones-20-99', 'math.compose-20-99', 'math.decompose-20-99', 'math.add-20'].every(proficient);
  const readyMixed = readyAdd && proficient('math.sub-10');
  const atCeiling = ARITHMETIC_CHALLENGES.every((goal) => proficient(goal.skillId));
  return { readyAdd, readyMixed, atCeiling };
}

export function arithmeticModel(left: number, right: number, operation: ArithmeticProblem['operation']): string {
  const lt = Math.floor(left / 10),
    lo = left % 10,
    rt = Math.floor(right / 10),
    ro = right % 10;
  const sign = operation === 'add' ? '+' : '−';
  const tens = operation === 'add' ? lt + rt : lt - rt;
  const ones = operation === 'add' ? lo + ro : lo - ro;
  const total = tens * 10 + ones;
  return `${left} has ${lt} tens and ${lo} ones. ${operation === 'add' ? 'Join' : 'Take away'} ${rt} tens and ${ro} ones. Tens: ${lt} ${sign} ${rt} = ${tens}. Ones: ${lo} ${sign} ${ro} = ${ones}. ${tens} tens and ${ones} ones make ${total}. ${left} ${sign} ${right} = ${total}. No trading is needed.`;
}

const teachingAnswers = new Set([13, 23, 34, 37]);
function pool(operation: ArithmeticProblem['operation']) {
  const values: { left: number; right: number; answer: number }[] = [];
  for (let left = 20; left <= 89; left++)
    for (let right = 10; right <= 89; right++) {
      const answer = operation === 'add' ? left + right : left - right;
      const valid = operation === 'add' ? (left % 10) + (right % 10) < 10 : left % 10 >= right % 10;
      if (valid && answer >= 0 && answer <= 99 && !teachingAnswers.has(answer)) values.push({ left, right, answer });
    }
  return values;
}
const addPool = pool('add');
const subtractPool = pool('subtract');

/** Four unique answer values; every target differs from all introductory/smaller worked examples. */
export function arithmeticProblem(seed: number, tier: number, round: number, simpler = false): ArithmeticProblem {
  if (!Number.isInteger(seed)) throw new Error('Invalid arithmetic seed.');
  if (!Number.isInteger(tier) || tier < 0 || tier >= ARITHMETIC_CHALLENGES.length) throw new Error('Unknown arithmetic challenge.');
  if (!Number.isInteger(round) || round < 0 || round >= ARITHMETIC_ROUNDS) throw new Error('Unknown arithmetic round.');
  const rng = createRng(seed);
  const used = new Set<number>();
  let chosen = { left: 23, right: 14, answer: 37 };
  let operation: ArithmeticProblem['operation'] = 'add';
  for (let i = 0; i <= round; i++) {
    operation = tier === 1 && i % 2 === 1 ? 'subtract' : 'add';
    const candidates = operation === 'add' ? addPool : subtractPool;
    const start = Math.floor(rng() * candidates.length);
    chosen = candidates[start]!;
    for (let offset = 1; used.has(chosen.answer); offset++) chosen = candidates[(start + offset) % candidates.length]!;
    used.add(chosen.answer);
  }
  if (simpler) chosen = operation === 'add' ? { left: 11, right: 12, answer: 23 } : { left: 24, right: 11, answer: 13 };
  const { left, right, answer } = chosen;
  // Seeded mixed error families: nearby counts, tens mistakes and combined digit errors.
  // No fixed one-tens/one-ones pairing, numerical rank or digit-intersection answer cue.
  const candidates = shuffle(rng, [-20, -11, -10, -9, -2, -1, 1, 2, 9, 10, 11, 20])
    .map((offset) => answer + offset)
    .filter((value) => value >= 0 && value <= 99);
  const first = candidates[0]!;
  const second = candidates.slice(1).find((value) => first % 10 !== answer % 10 || value % 10 !== answer % 10)!;
  const choices = [answer, first, second];
  const model = arithmeticModel(left, right, operation);
  return {
    id: `${ARITHMETIC_ID}:${seed}:${tier}:${round}${simpler ? ':simpler' : ''}`,
    skillId: ARITHMETIC_CHALLENGES[operation === 'add' ? 0 : 1].skillId,
    tier,
    kind: 'answer',
    left,
    right,
    operation,
    prompt: operation === 'add' ? `Join ${left} and ${right}. How many altogether?` : `Start with ${left}. Take away ${right}. How many remain?`,
    visual: { type: 'none' },
    choices: shuffle(rng, [...choices]).map((value) => ({ id: String(value), label: String(value) })),
    answerId: String(answer),
    hints: [
      operation === 'add'
        ? 'Join the tens with tens, and the ones with ones. Count what you have altogether.'
        : 'Take away the shown tens and ones from the starting amount. Count what remains.',
      model,
    ],
    model,
    success: `Yes. ${model}`,
    difficulty: 3,
    meta: { left, right, operation, answer },
  };
}

export function arithmeticRecord(seed: number, tier: number, round: number, input: ArithmeticResponse): ProblemAttemptRecord {
  const p = arithmeticProblem(seed, tier, round);
  if (input.responses.length > 3 || !input.responses.every((id) => p.choices.some((choice) => choice.id === id))) throw new Error('Unknown or excess answer.');
  if (input.responses.slice(0, -1).includes(p.answerId)) throw new Error('A finished answer cannot be retried.');
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
    outcome: input.skipped
      ? 'skipped'
      : input.scaffolds.includes('model')
        ? input.responses.length === 0
          ? 'model_only'
          : 'not_yet'
        : supported
          ? 'supported'
          : 'independent',
  };
}

export const arithmeticLesson: LessonDefinition = {
  id: ARITHMETIC_ID,
  teacherId: 'digit',
  title: 'Two-digit arithmetic answers without regrouping',
  childTitle: 'Base-ten Workshop',
  completeTitle: 'You explored two-digit numbers!',
  intro: ['Join tens and ones, or take some away.'],
  outro: 'Try a fresh example with real bundles another day.',
  rounds: ARITHMETIC_ROUNDS,
  manualProgression: true,
  tiers: [...ARITHMETIC_CHALLENGES],
  ladder: ['hint', 'simpler', 'alternate'],
  generateRound: (tier, rng, round) => [arithmeticProblem(Math.floor(rng() * 0xffffffff), tier, round)],
};
