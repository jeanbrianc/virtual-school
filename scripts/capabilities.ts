/** Print source-derived inventory; this is content availability, never learner proficiency. */
import { DOMAINS, SKILLS, STRANDS, validateCatalog } from '../src/domain/curriculum';
import { COUNTRY_TARGETS } from '../src/domain/geography/objectives';
import { STARTER_STATES, stateShapeAdventure } from '../src/domain/geography/stateChoices';
import maps from '../src/domain/geography/maps.json';
import { ALPHABET, trailLetters } from '../src/domain/lessons/keyboardTrail';
import { LIFE_CYCLES } from '../src/domain/lessons/lifeCycle';
import { LESSONS, LESSON_TITLES } from '../src/domain/lessons/registry';
import { TEST_OBJECTS } from '../src/domain/lessons/sinkFloat';
import { STATIONS, DANCE_MOVE_IDS } from '../src/domain/play/circuit';
import { BOOK_CATALOG } from '../src/domain/reading/bookCatalog';
import { REWARDS, SHELF_CAPACITIES } from '../src/domain/rewards/catalog';
import { TEACHER_IDS, TEACHER_REGISTRY } from '../src/domain/teachers/registry';
import { createRng } from '../src/domain/util/random';

const errors = validateCatalog();
for (const [id, lesson] of Object.entries(LESSONS)) {
  if (!LESSON_TITLES[id]) errors.push(`Missing registered title for ${id}`);
  if (!TEACHER_IDS.some((teacher) => teacher === lesson.teacherId)) errors.push(`Unknown teacher for ${id}`);
}
for (const teacher of TEACHER_IDS) {
  for (const choice of TEACHER_REGISTRY[teacher].activities) {
    if (choice.activity.kind !== 'lesson') continue;
    const lesson = LESSONS[choice.activity.lessonId];
    if (!lesson || lesson.teacherId !== teacher) errors.push(`Invalid lesson route ${teacher}/${choice.id}`);
  }
}
if (errors.length) throw new Error(errors.join('\n'));
const starterAdventure = stateShapeAdventure(createRng(1));
const readingThresholds = [...new Set(REWARDS.flatMap((reward) => (reward.rule.type === 'books' ? [reward.rule.count] : [])))].sort((a, b) => a - b);
console.info(
  JSON.stringify(
    {
      meaning: 'Source content and registration inventory; not learner progress or a curriculum-completeness claim.',
      curriculum: { skills: SKILLS.length, domains: DOMAINS.length, strands: STRANDS.length },
      teachers: TEACHER_IDS.map((id) => ({
        id,
        defaultActivity: TEACHER_REGISTRY[id].activity,
        registeredChoices: TEACHER_REGISTRY[id].activities.map((choice) => ({ id: choice.id, activity: choice.activity })),
      })),
      registeredActivityTitles: Object.keys(LESSON_TITLES),
      directLessons: Object.values(LESSONS).map((lesson) => ({
        id: lesson.id,
        rounds: lesson.rounds,
        tiers: lesson.tiers.map((tier) => tier.label),
        skillIds: lesson.tiers.map((tier) => tier.skillId),
      })),
      reading: {
        catalogTitles: BOOK_CATALOG.length,
        originalQuestions: BOOK_CATALOG.reduce((count, book) => count + book.questions.length, 0),
        questionBanks: BOOK_CATALOG.map((book) => ({ id: book.id, questions: book.questions.length })),
        rewardThresholds: readingThresholds,
        shelfCapacities: SHELF_CAPACITIES,
        shelfCapacityTotal: SHELF_CAPACITIES.reduce((total, count) => total + count, 0),
      },
      science: {
        sinkFloatObjects: TEST_OBJECTS.length,
        lifeCycleModels: Object.entries(LIFE_CYCLES).map(([id, stages]) => ({ id, stages: [...stages] })),
      },
      keyboard: { alphabet: ALPHABET, firstPool: ALPHABET.slice(0, 5), promptsPerTrail: trailLetters(0, 1).length },
      globe: {
        usStates: maps.states.length,
        introductoryCountries: COUNTRY_TARGETS.length,
        starterStates: [...STARTER_STATES],
        starterRounds: starterAdventure.length,
        starterChoicesPerRound: [...new Set(starterAdventure.map((round) => round.choices.length))],
      },
      circuit: { stations: STATIONS, availableAvatarMoves: DANCE_MOVE_IDS.length },
    },
    null,
    2,
  ),
);
