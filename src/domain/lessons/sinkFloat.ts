/**
 * Sink or Float? — Nova's investigation lab.
 * Each round: predict (the practice of predicting is always valued), watch
 * the test, then explain or generalize at the child's tier.
 */
import { pick, shuffle, type Rng } from '../util/random';
import type { LessonDefinition, Problem } from './types';

export type FloatReason = 'wood' | 'air' | 'metal' | 'dense' | 'light';

export interface TestObject {
  id: string;
  name: string;
  label: string;
  icon: string;
  floats: boolean;
  reason: FloatReason;
  color: string;
}

export const TEST_OBJECTS: TestObject[] = [
  { id: 'apple', name: 'an apple', label: 'Apple', icon: '🍎', floats: true, reason: 'air', color: '#d84a3a' },
  { id: 'rock', name: 'a rock', label: 'Rock', icon: '🪨', floats: false, reason: 'dense', color: '#8d8a84' },
  { id: 'duck', name: 'a rubber duck', label: 'Rubber duck', icon: '🦆', floats: true, reason: 'air', color: '#f5c542' },
  { id: 'key', name: 'a metal key', label: 'Metal key', icon: '🔑', floats: false, reason: 'metal', color: '#c9a646' },
  { id: 'cork', name: 'a cork', label: 'Cork', icon: '🍾', floats: true, reason: 'light', color: '#b98a5a' },
  { id: 'block', name: 'a wooden block', label: 'Wooden block', icon: '🧱', floats: true, reason: 'wood', color: '#c68e4e' },
  { id: 'coin', name: 'a coin', label: 'Coin', icon: '🪙', floats: false, reason: 'metal', color: '#c7a24c' },
  { id: 'marble', name: 'a glass marble', label: 'Marble', icon: '🔵', floats: false, reason: 'dense', color: '#4f8fd6' },
  { id: 'leaf', name: 'a leaf', label: 'Leaf', icon: '🍃', floats: true, reason: 'light', color: '#6aa84f' },
  { id: 'spoon', name: 'a metal spoon', label: 'Spoon', icon: '🥄', floats: false, reason: 'metal', color: '#b8c2cc' },
  { id: 'pinecone', name: 'a pinecone', label: 'Pinecone', icon: '🌰', floats: true, reason: 'wood', color: '#8a5a33' },
  { id: 'sponge', name: 'a dry sponge', label: 'Sponge', icon: '🧽', floats: true, reason: 'air', color: '#f2d15c' },
];

export const REASON_TEXT: Record<FloatReason, string> = {
  wood: 'It’s made of wood, and wood is light for its size.',
  air: 'It has lots of air inside it.',
  metal: 'Metal is heavy for its size.',
  dense: 'It’s packed tight — heavy for its size.',
  light: 'It’s made of very light stuff.',
};

const DISTRACTORS = ['Because of its color.', 'Because it is small.', 'Because it is big.', 'Because it wanted to.', 'Because it is shiny.'];

export function getTestObject(id: string): TestObject | undefined {
  return TEST_OBJECTS.find((o) => o.id === id);
}

const pid = (rng: Rng, kind: string) => `sf-${kind}-${Math.floor(rng() * 0xffffff).toString(36)}`;

function predictProblem(obj: TestObject, rng: Rng, tier: number): Problem {
  return {
    id: pid(rng, 'predict'),
    skillId: 'sci.predict',
    tier,
    kind: 'predict',
    prompt: `Here’s ${obj.name}. What do you predict — will it sink or float?`,
    visual: { type: 'object', objectId: obj.id },
    choices: [
      { id: 'float', label: 'Float', icon: '🛟' },
      { id: 'sink', label: 'Sink', icon: '⚓' },
    ],
    answerId: obj.floats ? 'float' : 'sink',
    hints: [],
    model: '',
    success: 'Great prediction! Let’s test it…',
    difficulty: 1,
    meta: { objectId: obj.id, floats: obj.floats },
  };
}

function observeProblem(obj: TestObject, rng: Rng, tier: number): Problem {
  return {
    id: pid(rng, 'observe'),
    skillId: 'sci.observe',
    tier,
    kind: 'answer',
    prompt: `We watched carefully. What did ${obj.name} do?`,
    visual: { type: 'object', objectId: obj.id, showResult: true, floats: obj.floats },
    choices: [
      { id: 'float', label: 'It floated', icon: '🛟' },
      { id: 'sink', label: 'It sank', icon: '⚓' },
    ],
    answerId: obj.floats ? 'float' : 'sink',
    hints: ['Look at the tank — is it at the top of the water, or down at the bottom?', 'Things that float stay up where the air is.'],
    model: `${capitalize(obj.name)} ${obj.floats ? 'floated at the top' : 'sank to the bottom'}.`,
    success: `Sharp eyes! It ${obj.floats ? 'floated' : 'sank'}.`,
    difficulty: 0,
    meta: { objectId: obj.id, floats: obj.floats },
  };
}

function explainProblem(obj: TestObject, rng: Rng, tier: number): Problem {
  const right = REASON_TEXT[obj.reason];
  const wrong = shuffle(rng, DISTRACTORS).slice(0, 2);
  const choices = shuffle(rng, [right, ...wrong]).map((label, i) => ({ id: label === right ? 'right' : `d${i}`, label }));
  return {
    id: pid(rng, 'explain'),
    skillId: 'sci.materials',
    alsoSkills: ['sci.explain'],
    tier,
    kind: 'answer',
    prompt: `It ${obj.floats ? 'floated' : 'sank'}! Why do you think that happened?`,
    visual: { type: 'object', objectId: obj.id, showResult: true, floats: obj.floats },
    choices,
    answerId: 'right',
    hints: ['Think about what it’s made of — not its color or size.', 'A giant log floats but a tiny pebble sinks, so size alone can’t be the reason!'],
    model: `${right} That’s why it ${obj.floats ? 'floats' : 'sinks'}.`,
    success: `Yes! ${right} Spoken like a real scientist.`,
    difficulty: 3,
    meta: { objectId: obj.id, floats: obj.floats },
  };
}

function generalizeProblem(obj: TestObject, rng: Rng, tier: number): Problem {
  const same = TEST_OBJECTS.filter((o) => o.id !== obj.id && o.floats === obj.floats && o.reason === obj.reason);
  const sameBehavior = same.length ? same : TEST_OBJECTS.filter((o) => o.id !== obj.id && o.floats === obj.floats);
  const answer = pick(rng, sameBehavior);
  const others = shuffle(
    rng,
    TEST_OBJECTS.filter((o) => o.floats !== obj.floats),
  ).slice(0, 2);
  const choices = shuffle(rng, [answer, ...others]).map((o) => ({ id: o.id, label: o.label, icon: o.icon }));
  return {
    id: pid(rng, 'general'),
    skillId: 'sci.materials',
    alsoSkills: ['sci.explain'],
    tier,
    kind: 'answer',
    prompt: `${capitalize(obj.name)} ${obj.floats ? 'floated' : 'sank'}. Which of these do you think would ALSO ${obj.floats ? 'float' : 'sink'}?`,
    visual: { type: 'objects', objectIds: choices.map((c) => c.id) },
    choices,
    answerId: answer.id,
    hints: [`Which one is made of something similar? ${REASON_TEXT[obj.reason]}`, `Think about metal, wood, and things with air inside.`],
    model: `${answer.label}! ${REASON_TEXT[answer.reason]}`,
    success: `Brilliant! ${answer.label} would ${obj.floats ? 'float' : 'sink'} too. You used evidence to predict!`,
    difficulty: 3,
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const sinkFloatLesson: LessonDefinition = {
  id: 'sink-float',
  teacherId: 'nova',
  title: 'Sink or Float? (predict, observe, explain — material properties)',
  childTitle: 'Sink or Float?',
  completeTitle: 'Lab Investigation Complete! 🔬',
  intro: ['I have a mystery for us, {name}.', 'Some things sink and some things float. But WHY? Let’s investigate like real scientists!'],
  outro: 'What an investigation! Scientists predict, test, and explain — and you did all three.',
  rounds: 4,
  tiers: [
    { skillId: 'sci.observe', label: 'Predict & observe' },
    { skillId: 'sci.materials', label: 'Explain with materials' },
    { skillId: 'sci.explain', label: 'Generalize from evidence' },
  ],
  ladder: ['hint', 'alternate'],
  generateRound: (tier, rng, round) => {
    // Alternate floaters and sinkers so the lab stays surprising.
    const pool = TEST_OBJECTS.filter((o) => o.floats === (round % 2 === 0));
    const obj = pick(rng, pool);
    const follow = tier === 0 ? observeProblem(obj, rng, tier) : tier === 1 ? explainProblem(obj, rng, tier) : generalizeProblem(obj, rng, tier);
    return [predictProblem(obj, rng, tier), follow];
  },
};
