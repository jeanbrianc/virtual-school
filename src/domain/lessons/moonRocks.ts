/**
 * Moon Rock Rescue — Digit's adaptive math mission.
 * Tiers climb from counting to early multiplication; the child only ever
 * sees a playful story about helping Digit load rockets.
 */
import { randInt, shuffle, type Rng } from '../util/random';
import type { LessonChoice, LessonDefinition, Problem } from './types';

const TIERS = [
  { skillId: 'math.count-10', label: 'Count to 10' },
  { skillId: 'math.count-20', label: 'Count to 20' },
  { skillId: 'math.compare', label: 'Compare groups' },
  { skillId: 'math.add-10', label: 'Add within 10' },
  { skillId: 'math.add-20', label: 'Add & subtract within 20' },
  { skillId: 'math.equal-shares', label: 'Equal sharing' },
  { skillId: 'math.equal-groups', label: 'Equal groups' },
] as const;

const pid = (rng: Rng, tier: number) => `moon-${tier}-${Math.floor(rng() * 0xffffff).toString(36)}`;

/** Three distinct, positive numeric choices including the answer. */
export function numberChoices(rng: Rng, answer: number, spread = 2): LessonChoice[] {
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < 3 && guard++ < 50) {
    const delta = randInt(rng, 1, spread) * (rng() < 0.5 ? -1 : 1);
    const v = answer + delta;
    if (v >= 0) set.add(v);
  }
  let filler = answer + 3;
  while (set.size < 3) set.add(filler++);
  return shuffle(rng, [...set]).map((n) => ({ id: String(n), label: String(n) }));
}

function countProblem(rng: Rng, tier: number, min: number, max: number): Problem {
  const n = randInt(rng, min, max);
  return {
    id: pid(rng, tier),
    skillId: tier === 0 ? 'math.count-10' : 'math.count-20',
    tier,
    kind: 'answer',
    prompt: `Beep boop! My moon-rock basket spilled. How many moon rocks do you see?`,
    visual: { type: 'rocks', groups: [n] },
    choices: numberChoices(rng, n, n > 10 ? 2 : 1),
    answerId: String(n),
    hints: [
      'Tap each rock as you count it — they light up so you don’t count one twice!',
      n > 10 ? 'Count the first row of 5, then keep counting on: 6, 7, 8…' : 'Touch and count slowly: 1… 2… 3…',
    ],
    model: `Let’s count together: ${Array.from({ length: Math.min(n, 5) }, (_, i) => i + 1).join(', ')}${n > 5 ? ` … all the way to ${n}` : ''}. There are ${n} moon rocks!`,
    success: `Yes! ${n} moon rocks, all safe in the basket!`,
    difficulty: tier === 0 ? 0 : 1,
  };
}

function compareProblem(rng: Rng, tier: number): Problem {
  let left = randInt(rng, 3, 12);
  let right = randInt(rng, 3, 12);
  if (rng() < 0.15) right = left;
  while (Math.abs(left - right) === 1 && rng() < 0.5) left = randInt(rng, 3, 12);
  const answerId = left > right ? 'left' : right > left ? 'right' : 'same';
  return {
    id: pid(rng, tier),
    skillId: 'math.compare',
    tier,
    kind: 'answer',
    prompt: 'Two craters are full of moon rocks. Which crater has MORE?',
    visual: { type: 'compare', left, right },
    choices: [
      { id: 'left', label: 'This crater', icon: '⬅️' },
      { id: 'same', label: 'They’re the same', icon: '⚖️' },
      { id: 'right', label: 'That crater', icon: '➡️' },
    ],
    answerId,
    hints: ['Count each crater. Which number is bigger?', 'Imagine lining the rocks up in two rows — which row is longer?'],
    model: `This crater has ${left} and that one has ${right}. ${answerId === 'same' ? 'They’re the same!' : `${Math.max(left, right)} is more than ${Math.min(left, right)}.`}`,
    success: answerId === 'same' ? 'Exactly the same — a perfectly balanced moon!' : `Right! ${Math.max(left, right)} is more than ${Math.min(left, right)}.`,
    difficulty: 1,
  };
}

function addProblem(rng: Rng, tier: number, within: 10 | 20): Problem {
  let a: number;
  let b: number;
  if (within === 10) {
    a = randInt(rng, 2, 7);
    b = randInt(rng, 1, 10 - a);
  } else {
    a = randInt(rng, 6, 9);
    b = randInt(rng, 11 - a, Math.min(9, 20 - a));
  }
  const sum = a + b;
  const toTen = 10 - a;
  return {
    id: pid(rng, tier),
    skillId: within === 10 ? 'math.add-10' : 'math.add-20',
    alsoSkills: ['math.word-problems'],
    tier,
    kind: 'answer',
    prompt: `I have ${a} moon rocks. Nova found ${b} more! How many do we have now?`,
    visual: { type: 'rocks', groups: [a, b] },
    choices: numberChoices(rng, sum),
    answerId: String(sum),
    hints:
      within === 20
        ? [`Make a ten! ${a} needs ${toTen} more to make 10. Then add what’s left.`, `Start at ${Math.max(a, b)} and count on ${Math.min(a, b)} more.`]
        : ['Push the two groups together and count them all.', `Start at ${Math.max(a, b)} and count on: ${Array.from({ length: Math.min(a, b) }, (_, i) => Math.max(a, b) + i + 1).join(', ')}.`],
    model: `${a} and ${b} more makes ${sum}. ${within === 20 ? `(${a} + ${toTen} = 10, then ${b - toTen} more makes ${sum}.)` : ''}`.trim(),
    success: `${sum}! Rocket loaded. Beep-beep hooray!`,
    difficulty: within === 10 ? 1 : 2,
  };
}

function subtractProblem(rng: Rng, tier: number): Problem {
  const total = randInt(rng, 11, 18);
  const away = randInt(rng, 3, 9);
  const left = total - away;
  return {
    id: pid(rng, tier),
    skillId: 'math.add-20',
    alsoSkills: ['math.word-problems'],
    tier,
    kind: 'answer',
    prompt: `Oh no! I had ${total} moon rocks, and ${away} rolled away down a crater. How many are left?`,
    visual: { type: 'rocks', groups: [total], removed: away },
    choices: numberChoices(rng, left),
    answerId: String(left),
    hints: [`Tap ${away} rocks to roll them away, then count what’s left.`, `Count back from ${total}: ${total - 1}, ${total - 2}…`],
    model: `${total} take away ${away} leaves ${left}.`,
    success: `${left} rocks saved! Great rescuing!`,
    difficulty: 2,
  };
}

function shareProblem(rng: Rng, tier: number): Problem {
  if (rng() < 0.35) {
    const total = randInt(rng, 7, 19);
    const even = total % 2 === 0;
    return {
      id: pid(rng, tier),
      skillId: 'math.equal-shares',
      tier,
      kind: 'answer',
      prompt: `Can ${total} moon rocks be shared fairly between 2 rockets, with none left over?`,
      visual: { type: 'share', total, groups: 2 },
      choices: [
        { id: 'yes', label: 'Yes, it’s fair!', icon: '✅' },
        { id: 'no', label: 'One is left over', icon: '1️⃣' },
      ],
      answerId: even ? 'yes' : 'no',
      hints: ['Give one rock to each rocket, then another, and another… is one left?', 'Numbers that end in 0, 2, 4, 6 or 8 share evenly into 2.'],
      model: even ? `${total} is even — each rocket gets ${total / 2}.` : `${total} is odd — each rocket gets ${(total - 1) / 2} and one is left over.`,
      success: even ? `Yes! ${total} is even — ${total / 2} each.` : `Right! ${total} is odd, so one rock is left over.`,
      difficulty: 3,
    };
  }
  const each = randInt(rng, 3, 9);
  const total = each * 2;
  return {
    id: pid(rng, tier),
    skillId: 'math.equal-shares',
    tier,
    kind: 'answer',
    prompt: `Let’s share ${total} moon rocks equally between 2 rockets. How many in each rocket?`,
    visual: { type: 'share', total, groups: 2 },
    choices: numberChoices(rng, each),
    answerId: String(each),
    hints: ['Deal them out: one for this rocket, one for that rocket…', `What number plus itself makes ${total}?`],
    model: `${each} and ${each} make ${total}, so each rocket gets ${each}.`,
    success: `${each} each — perfectly fair!`,
    difficulty: 3,
  };
}

function groupsProblem(rng: Rng, tier: number): Problem {
  const groups = randInt(rng, 2, 4);
  const each = randInt(rng, 2, 5);
  const total = groups * each;
  return {
    id: pid(rng, tier),
    skillId: 'math.equal-groups',
    tier,
    kind: 'answer',
    prompt: `${groups} rockets each carry ${each} moon rocks. How many moon rocks altogether?`,
    visual: { type: 'arrays', groups, each },
    choices: numberChoices(rng, total, 3),
    answerId: String(total),
    hints: [`Skip-count by ${each}s: ${Array.from({ length: groups }, (_, i) => each * (i + 1)).join(', ')}…`, `Add the groups: ${Array(groups).fill(each).join(' + ')}.`],
    model: `${groups} groups of ${each} is ${total}.`,
    success: `${total}! You’re a galaxy-class mathematician!`,
    difficulty: 4,
  };
}

export function generateMoonProblem(tier: number, rng: Rng): Problem {
  switch (tier) {
    case 0:
      return countProblem(rng, 0, 3, 10);
    case 1:
      return countProblem(rng, 1, 11, 20);
    case 2:
      return compareProblem(rng, 2);
    case 3:
      return addProblem(rng, 3, 10);
    case 4:
      return rng() < 0.6 ? addProblem(rng, 4, 20) : subtractProblem(rng, 4);
    case 5:
      return shareProblem(rng, 5);
    default:
      return groupsProblem(rng, 6);
  }
}

export const moonRocksLesson: LessonDefinition = {
  id: 'moon-rocks',
  teacherId: 'digit',
  title: 'Moon Rock Rescue (adaptive number sense & operations)',
  childTitle: 'Moon Rock Rescue',
  completeTitle: 'Rocket Rescue Complete! 🚀',
  intro: [
    'Beep boop, Izzy! Emergency on the moon!',
    'My moon rocks are everywhere and my rocket can’t launch without them. Will you help me count and load them?',
  ],
  outro: 'Every rock is safe! My rocket is one step closer to launch. You’re a super space helper!',
  rounds: 5,
  tiers: TIERS.map((t) => ({ skillId: t.skillId, label: t.label })),
  ladder: ['hint', 'simpler', 'alternate'],
  generateRound: (tier, rng) => [generateMoonProblem(tier, rng)],
  generateSimpler: (problem, rng) => {
    const easier = generateMoonProblem(Math.max(0, problem.tier - 1), rng);
    return problem.tier === 0 ? countProblem(rng, 0, 2, 5) : easier;
  },
};
