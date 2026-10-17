/** Print source-derived inventory; this is content availability, never learner proficiency. */
import { DOMAINS, SKILLS, STRANDS, validateCatalog } from '../src/domain/curriculum';
import { COUNTRY_TARGETS } from '../src/domain/geography/objectives';
import maps from '../src/domain/geography/maps.json';
import { ALPHABET, trailLetters } from '../src/domain/lessons/keyboardTrail';
import { LESSONS, LESSON_TITLES } from '../src/domain/lessons/registry';
import { TEST_OBJECTS } from '../src/domain/lessons/sinkFloat';
import { STATIONS, DANCE_MOVE_IDS } from '../src/domain/play/circuit';
import { BOOK_CATALOG } from '../src/domain/reading/bookCatalog';
import { REWARDS, SHELF_CAPACITIES } from '../src/domain/rewards/catalog';
import { TEACHER_IDS, TEACHER_REGISTRY } from '../src/domain/teachers/registry';

const errors = validateCatalog();
for (const [id, lesson] of Object.entries(LESSONS)) {
  if (!LESSON_TITLES[id]) errors.push(`Missing registered title for ${id}`);
  if (!TEACHER_IDS.some((teacher) => teacher === lesson.teacherId)) errors.push(`Unknown teacher for ${id}`);
}
if (errors.length) throw new Error(errors.join('\n'));
const readingThresholds = [...new Set(REWARDS.flatMap((reward) => (reward.rule.type === 'books' ? [reward.rule.count] : [])))].sort((a, b) => a - b);
console.info(
  JSON.stringify(
    {
      meaning: 'Source content and registration inventory; not learner progress or a curriculum-completeness claim.',
      curriculum: { skills: SKILLS.length, domains: DOMAINS.length, strands: STRANDS.length },
      teachers: TEACHER_IDS.map((id) => ({ id, defaultActivity: TEACHER_REGISTRY[id].activity })),
      registeredActivityTitles: Object.keys(LESSON_TITLES),
      directLessons: Object.values(LESSONS).map((lesson) => ({ id: lesson.id, rounds: lesson.rounds, tiers: lesson.tiers.map((tier) => tier.label) })),
      reading: {
        catalogTitles: BOOK_CATALOG.length,
        originalQuestions: BOOK_CATALOG.reduce((count, book) => count + book.questions.length, 0),
        rewardThresholds: readingThresholds,
        shelfCapacities: SHELF_CAPACITIES,
        shelfCapacityTotal: SHELF_CAPACITIES.reduce((total, count) => total + count, 0),
      },
      science: { sinkFloatObjects: TEST_OBJECTS.length },
      keyboard: { alphabet: ALPHABET, firstPool: ALPHABET.slice(0, 5), promptsPerTrail: trailLetters(0, 1).length },
      globe: { usStates: maps.states.length, introductoryCountries: COUNTRY_TARGETS.length },
      circuit: { stations: STATIONS, availableAvatarMoves: DANCE_MOVE_IDS.length },
    },
    null,
    2,
  ),
);
