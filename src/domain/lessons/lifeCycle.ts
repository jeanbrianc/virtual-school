/** Small, reviewed picture models. Sources and evidence ceiling: docs/nova-life-cycle-review.md. */
import { shuffle, type Rng } from '../util/random';
import type { LessonDefinition, Problem } from './types';

export type LifeStage = 'seed' | 'seedling' | 'flower' | 'fruit' | 'egg' | 'caterpillar' | 'chrysalis' | 'butterfly';
export type LifeCycle = 'plant' | 'butterfly';
export const LIFE_CYCLES: Record<LifeCycle, readonly LifeStage[]> = {
  plant: ['seed', 'seedling', 'flower', 'fruit'],
  butterfly: ['egg', 'caterpillar', 'chrysalis', 'butterfly'],
};
export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  seed: 'Seed',
  seedling: 'Seedling',
  flower: 'Flowering plant',
  fruit: 'Fruit with seeds',
  egg: 'Egg',
  caterpillar: 'Caterpillar (larva)',
  chrysalis: 'Chrysalis (pupa)',
  butterfly: 'Adult butterfly',
};
const NOTICES: Record<LifeStage, string> = {
  seed: 'Look at the little seed. Match its shape.',
  seedling: 'Notice the little stem and leaves.',
  flower: 'Notice the open flower on the plant.',
  fruit: 'Look inside the fruit. Can you see seeds?',
  egg: 'Notice the tiny egg on the leaf.',
  caterpillar: 'Notice the long body on the leaf.',
  chrysalis: 'Notice the chrysalis hanging from the twig.',
  butterfly: 'Notice the adult butterfly’s wings.',
};
const NEXT: Record<LifeStage, string> = {
  seed: 'With suitable conditions, a seed germinates and grows into a seedling.',
  seedling: 'As this flowering plant grows, it can make flowers.',
  flower: 'After pollination and fertilization, a flower can develop into a fruit with seeds.',
  fruit: 'Seeds can leave the fruit. A seed can begin a new plant; the old plant does not turn back into a seed.',
  egg: 'A caterpillar hatches from the egg.',
  caterpillar: 'After growing, a caterpillar becomes a pupa called a chrysalis.',
  chrysalis: 'The butterfly develops inside the chrysalis. An adult butterfly emerges.',
  butterfly: 'An adult female can lay eggs. Eggs begin a new generation; the adult does not turn into an egg.',
};

export const lifeCycleLesson: LessonDefinition = {
  id: 'life-cycle',
  teacherId: 'nova',
  title: 'Life-cycle picture lab (picture-and-label matching and next-stage sequencing)',
  childTitle: 'Growing and changing',
  completeTitle: 'Life-cycle picture lab complete!',
  intro: ['Let’s look at a flowering plant and a butterfly, {name}. Choose matching pictures or try the next-stage challenge.'],
  outro:
    'We explored two simple picture models. Try another level, or notice changes in a real plant with a grown-up. Pictures do not show every detail of life.',
  rounds: 4,
  manualProgression: true,
  tiers: [
    { skillId: 'sci.life-picture-match', label: 'Notice & match · 2 pictures' },
    { skillId: 'sci.life-next-stage', label: 'What comes next? · 3 pictures' },
  ],
  ladder: ['hint', 'alternate'],
  generateRound(tier: number, rng: Rng, round: number): Problem[] {
    const cycle: LifeCycle = round % 2 === 0 ? 'plant' : 'butterfly';
    const stages = LIFE_CYCLES[cycle];
    // Each run covers both organisms, with earlier and later stages. Seeded choice/order vary.
    const index = (round < 2 ? 0 : 2) + Math.floor(rng() * 2);
    const stage = stages[index]!;
    const answer = tier === 0 ? stage : stages[(index + 1) % stages.length]!;
    const distractors = shuffle(
      rng,
      stages.filter((s) => s !== answer),
    ).slice(0, tier === 0 ? 1 : 2);
    const choices = shuffle(rng, [answer, ...distractors]).map((s) => ({ id: s, label: LIFE_STAGE_LABELS[s], lifeStage: s }));
    const model = tier === 0 ? `${NOTICES[stage]} This picture shows: ${LIFE_STAGE_LABELS[stage]}.` : NEXT[stage];
    return [
      {
        id: `lc-${round}-${Math.floor(rng() * 0xffffff).toString(36)}`,
        skillId: tier === 0 ? 'sci.life-picture-match' : 'sci.life-next-stage',
        tier,
        kind: 'answer',
        prompt: tier === 0 ? 'Look closely. Which picture matches?' : 'Which picture comes next in this life-cycle model?',
        visual: { type: 'life-cycle', cycle, stage, next: tier > 0 },
        choices,
        answerId: answer,
        hints: [tier === 0 ? NOTICES[stage] : `Think about the stage after ${LIFE_STAGE_LABELS[stage].toLowerCase()}. You can ask to see the model.`, model],
        model,
        success: tier === 0 ? `You matched the ${LIFE_STAGE_LABELS[stage].toLowerCase()}.` : NEXT[stage],
        difficulty: tier === 0 ? 0 : 2,
        meta: { cycle, stage },
      },
    ];
  },
};
