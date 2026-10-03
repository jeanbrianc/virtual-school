import type { LessonDefinition, Problem } from './types';
import { shuffle, type Rng } from '../util/random';
export const SHAPES = ['circle', 'triangle', 'square'] as const;
export type Shape = (typeof SHAPES)[number];
export const SHAPE_SYMBOLS: Record<Shape, string> = { circle: '●', triangle: '▲', square: '■' };
const label = (s: readonly Shape[]) => s.map((x) => `${SHAPE_SYMBOLS[x]} ${x}`).join(' · ');
function problem(rng: Rng, round: number): Problem {
  const [a, b] = shuffle(rng, SHAPES) as [Shape, Shape, Shape];
  const common = {
    id: `patterns:${round}`,
    tier: 0,
    difficulty: 0,
    hints: [`Look at the repeating pair: ${a}, then ${b}.`, `Say the shapes in order: ${a}, ${b}, ${a}, ${b}.`],
    model: `The repeating pair is ${a}, ${b}.`,
    success: 'You noticed how the shapes repeat!',
    skillId: 'reason.visual-patterns',
  };
  if (round === 2)
    return {
      ...common,
      skillId: 'art.shape-design',
      kind: 'create',
      prompt: 'Make your own variation. Choose four shapes in any order. Every design is welcome!',
      visual: { type: 'pattern', shapes: [a, b, a, b] },
      choices: [],
      answerId: '',
      success: 'You made your own design! There is no right or wrong design.',
    };
  const choices =
    round === 0
      ? [
          { id: 'copy', label: label([a, b, a, b]) },
          { id: 'paired', label: label([a, a, b, b]) },
          { id: 'swapped', label: label([b, a, b, a]) },
        ]
      : SHAPES.map((s) => ({ id: s, label: `${SHAPE_SYMBOLS[s]} ${s}` }));
  return {
    ...common,
    kind: 'answer',
    prompt: round === 0 ? 'Copy this pattern. Choose the row with the same shapes in the same order.' : 'Look at the repeating shapes. Which shape comes next?',
    visual: { type: 'pattern', shapes: [a, b, a, b] },
    choices: shuffle(rng, choices),
    answerId: round === 0 ? 'copy' : a,
  };
}
export const patternsLesson: LessonDefinition = {
  id: 'patterns-shapes',
  teacherId: 'pippa',
  title: 'Patterns and shape design',
  childTitle: 'Shape Studio',
  completeTitle: 'Your shape studio adventure!',
  intro: ['Let’s copy a pattern, find what comes next, and make a design of your own.'],
  outro: 'Keep noticing shapes in the world!',
  rounds: 3,
  tiers: [{ skillId: 'reason.visual-patterns', label: 'Two-shape patterns' }],
  ladder: ['hint', 'simpler', 'alternate'],
  generateRound: (_tier, rng, round) => [problem(rng, round)],
  generateSimpler: (p) => {
    const shapes = p.visual.type === 'pattern' ? p.visual.shapes : (['circle', 'triangle'] as const);
    const a = shapes[0]!,
      b = shapes[1]!;
    return {
      ...p,
      id: `${p.id}:simpler`,
      kind: 'answer',
      prompt: `Start with the repeating pair: ${a}, ${b}. Which row copies it?`,
      visual: { type: 'pattern', shapes: [a, b] },
      choices: [
        { id: 'pair', label: label([a, b]) },
        { id: 'reverse', label: label([b, a]) },
      ],
      answerId: 'pair',
      model: `The pair is ${a}, ${b}.`,
    };
  },
};
