import type { LessonDefinition, Problem } from './types';
import { shuffle, type Rng } from '../util/random';
export const SHAPES = ['circle', 'triangle', 'square'] as const;
export type Shape = (typeof SHAPES)[number];
export const SHAPE_SYMBOLS: Record<Shape, string> = { circle: '●', triangle: '▲', square: '■' };
function problem(rng: Rng, round: number, tier: number): Problem {
  const [a, b] = shuffle(rng, SHAPES) as [Shape, Shape, Shape];
  const create = round === 2;
  const pattern = tier > 0 && !create;
  return {
    id: `shapes:${tier}:${round}`,
    tier,
    difficulty: tier,
    kind: create ? 'create' : 'answer',
    skillId: create ? 'art.shape-design' : pattern ? 'reason.visual-patterns' : 'reason.shape-match',
    prompt: create ? 'Pick a shape for your picture!' : pattern ? 'What comes next?' : 'Tap the same shape!',
    visual: { type: 'pattern', shapes: create ? [] : pattern ? [a, b, a] : [a] },
    choices: shuffle(rng, [a, b]).map((shape) => ({ id: shape, label: shape, shapes: [shape] })),
    answerId: create ? '' : pattern ? b : a,
    hints: [pattern ? `${a}, ${b}, ${a}… now ${b}.` : `Look at the ${a}. Find another ${a}.`, 'Let’s try together.'],
    model: create ? '' : `Here is the ${pattern ? b : a}.`,
    success: create ? 'Your picture, your choice!' : pattern ? 'You found the next shape!' : 'A match! You found it!',
  };
}
export const patternsLesson: LessonDefinition = {
  id: 'patterns-shapes',
  teacherId: 'pippa',
  title: 'Shape matching and optional patterns',
  childTitle: 'Shape Studio',
  completeTitle: 'You played with shapes!',
  intro: ['Let’s find a shape together.'],
  outro: 'You can play again any time!',
  rounds: 3,
  manualProgression: true,
  tiers: [
    { skillId: 'reason.shape-match', label: 'Same-shape matching' },
    { skillId: 'reason.visual-patterns', label: 'Optional two-shape patterns' },
  ],
  ladder: ['hint', 'alternate'],
  generateRound: (tier, rng, round) => [problem(rng, round, tier)],
  generateSimpler: (p) => ({
    ...p,
    id: `${p.id}:simpler`,
    prompt: 'Tap the same shape!',
    visual: { type: 'pattern', shapes: [p.answerId as Shape] },
    skillId: 'reason.shape-match',
  }),
};
