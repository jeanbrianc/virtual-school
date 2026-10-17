/** Original bounded shape patterns; evidence ceiling: docs/pippa-pattern-progression-review.md. */
import { SHAPES, type Shape } from './patterns';
import { shuffle } from '../util/random';
import type { LessonDefinition } from './types';

export const PATTERN_RULES = ['match', 'AB', 'AAB', 'ABB', 'ABC'] as const;
export type PatternRule = (typeof PATTERN_RULES)[number];
export const PATTERN_UNITS: Record<PatternRule, readonly number[]> = {
  match: [0],
  AB: [0, 1],
  AAB: [0, 0, 1],
  ABB: [0, 1, 1],
  ABC: [0, 1, 2],
};
export const PATTERN_SKILLS = [
  'reason.shape-match',
  'reason.pattern-continue-ab',
  'reason.pattern-continue-aab',
  'reason.pattern-continue-abb',
  'reason.pattern-continue-abc',
] as const;

export const patternProgressionLesson: LessonDefinition = {
  id: 'pattern-progression',
  teacherId: 'pippa',
  title: 'Shape pattern lab (matching and one-next-shape continuation)',
  childTitle: 'Pattern playground',
  completeTitle: 'You explored shapes!',
  intro: ['Choose matching, or pick a pattern to explore. You can start over with matching at any time.'],
  outro: 'You can replay or choose another pattern. A pattern repeats a little group.',
  rounds: 4,
  manualProgression: true,
  tiers: [
    { skillId: PATTERN_SKILLS[0], label: 'Match shapes' },
    { skillId: PATTERN_SKILLS[1], label: 'AB · two shapes repeat' },
    { skillId: PATTERN_SKILLS[2], label: 'AAB · first shape twice' },
    { skillId: PATTERN_SKILLS[3], label: 'ABB · second shape twice' },
    { skillId: PATTERN_SKILLS[4], label: 'ABC · three shapes repeat' },
  ],
  ladder: ['hint', 'alternate'],
  generateRound(tier, rng, round) {
    const rule = PATTERN_RULES[tier] ?? 'match';
    const matching = rule === 'match';
    const palette = matching
      ? [
          SHAPES[round % SHAPES.length]!,
          ...shuffle(
            rng,
            SHAPES.filter((shape) => shape !== SHAPES[round % SHAPES.length]),
          ),
        ]
      : shuffle(rng, SHAPES);
    const unit = PATTERN_UNITS[rule].map((index) => palette[index]!);
    // Two full repeats plus a varying partial repeat. Never infer difficulty from other subjects.
    const length = matching ? 1 : unit.length * 2 + round;
    const shapes: Shape[] = Array.from({ length }, (_, index) => unit[index % unit.length]!);
    const answer = matching ? unit[0]! : unit[length % unit.length]!;
    const candidates = matching ? [answer, palette[1]!] : [...SHAPES];
    const model = matching
      ? `The ${answer} matches the ${answer}. Look at its outline.`
      : `The little group is ${unit.join(', ')}. It repeats in the same order. The next shape here is ${answer}.`;
    return [
      {
        id: `pattern-${rule}-${round}-${Math.floor(rng() * 0xffffff).toString(36)}`,
        kind: 'answer',
        tier,
        skillId: PATTERN_SKILLS[tier] ?? PATTERN_SKILLS[0],
        difficulty: matching || rule === 'AB' ? 0 : 1,
        prompt: matching ? 'Which shape matches?' : 'The little group repeats. Which shape comes next?',
        visual: { type: 'pattern-progression', shapes, unitLength: unit.length, matching },
        choices: shuffle(rng, candidates).map((shape) => ({ id: shape, label: shape, shapes: [shape] })),
        answerId: answer,
        hints: [matching ? `Look for another ${answer}.` : `Look at the first little group: ${unit.join(', ')}. Follow the same order again.`, model],
        model,
        success: matching ? `You matched the ${answer}.` : `Yes, ${answer} comes next. The group ${unit.join(', ')} repeats.`,
        meta: { rule, task: matching ? 'matching' : 'continuation' },
      },
    ];
  },
};
