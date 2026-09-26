/**
 * Deterministic DEMO data so the product feels alive on first launch.
 *
 * Everything here is illustrative sample history (flagged `isDemo`) — it is
 * not a real assessment of any child. Dates are relative to the clock so the
 * "Today" and "This week" views always have content. Mastery is *computed*
 * by replaying the seeded evidence through the real mastery engine.
 */
import { DEFAULT_AVATAR, GEORGIA_AVATAR } from '../../domain/avatar';
import { getSkill } from '../../domain/curriculum';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import { updateMasteryRecord } from '../../domain/mastery/masteryEngine';
import { buildSnapshot } from '../../domain/progress/snapshot';
import { getCatalogBook } from '../../domain/reading/bookCatalog';
import { evaluateNewRewards } from '../../domain/rewards/engine';
import type {
  Activity,
  Avatar,
  Book,
  Child,
  Evidence,
  EvidenceTrials,
  Household,
  Independence,
  LessonAttempt,
  MasteryRecord,
  Parent,
  PortfolioItem,
  ReadingSession,
  RewardUnlock,
  TeacherInteraction,
} from '../../domain/types';
import { sequentialIds } from '../../domain/util/ids';
import { addDays, timestampAt, toDay, type Clock } from '../../domain/util/time';
import type { Repositories } from '../repositories';
import { SCHEMA_VERSION } from '../schema';
import type { WriteOp } from '../storage/types';

export const DEMO_CHILD_ID = 'child_izzy';
export const DEMO_SIBLING_ID = 'child_georgia';

interface SeedResult {
  childId: string;
  counts: Record<string, number>;
}

export async function seedDemoData(repos: Repositories, clock: Clock): Promise<SeedResult> {
  const ids = sequentialIds('demo');
  const today = toDay(clock.now());
  const day = (ago: number) => addDays(today, -ago);
  const at = (ago: number, hour = 10, minute = 0) => timestampAt(day(ago), hour, minute);
  const createdAt = at(60, 9);

  const household: Household = {
    id: 'household_demo',
    name: 'Our Family School',
    createdAt,
    settings: DEFAULT_SETTINGS,
    schemaVersion: SCHEMA_VERSION,
  };
  const parents: Parent[] = [
    { id: 'parent_mom', householdId: household.id, displayName: 'Mom', role: 'admin', createdAt },
    { id: 'parent_dad', householdId: household.id, displayName: 'Dad', role: 'caregiver', createdAt },
  ];
  const izzy: Child = {
    id: DEMO_CHILD_ID,
    householdId: household.id,
    name: 'Izzy',
    birthDate: '2023-01-01',
    status: 'active',
    avatarId: 'avatar_izzy',
    createdAt,
    activePetId: 'pet.bookworm',
    isDemo: true,
  };
  const georgia: Child = {
    id: DEMO_SIBLING_ID,
    householdId: household.id,
    name: 'Georgia',
    birthDate: '2025-03-14',
    status: 'inactive',
    avatarId: 'avatar_georgia',
    createdAt: at(59, 9),
    isDemo: true,
  };
  const avatars: Avatar[] = [
    { ...DEFAULT_AVATAR, id: 'avatar_izzy', childId: izzy.id, updatedAt: createdAt },
    { ...GEORGIA_AVATAR, id: 'avatar_georgia', childId: georgia.id, updatedAt: createdAt },
  ];

  // ── Books ─────────────────────────────────────────────────────────────
  const books: Book[] = [];
  const sessions: ReadingSession[] = [];
  const evidence: Evidence[] = [];
  const portfolio: PortfolioItem[] = [];
  const interactions: TeacherInteraction[] = [];

  const ev = (
    skillId: string,
    ago: number,
    trials: Partial<EvidenceTrials>,
    source: Evidence['source'],
    statement: string,
    opts: { kind?: Evidence['kind']; independence?: Independence; hour?: number; topics?: string[] } = {},
  ) => {
    const t = { independent: 0, supported: 0, notYet: 0, ...trials };
    const skill = getSkill(skillId);
    if (!skill) throw new Error(`Seed references unknown skill ${skillId}`);
    evidence.push({
      id: ids('ev'),
      childId: izzy.id,
      skillId,
      observedAt: at(ago, opts.hour ?? 11),
      source,
      kind: opts.kind ?? 'performance',
      trials: t,
      independence: opts.independence ?? (t.independent > 0 && t.supported + t.notYet === 0 ? 'independent' : 'supported'),
      difficulty: skill.difficulty,
      statement,
      createdBy: source.type === 'book' || source.type === 'lesson' ? 'system' : 'parent',
      topics: [...new Set([...(opts.topics ?? []), ...skill.topics])],
      isDemo: true,
    });
  };

  const completedPlan: {
    catalogId: string;
    ago: number;
    rating: number;
    mode: Book['readingMode'];
    fav: number;
    results: ('i' | 's')[];
  }[] = [
    { catalogId: 'peter-rabbit', ago: 54, rating: 4, mode: 'independent', fav: 1, results: ['i', 'i'] },
    { catalogId: 'hungry-caterpillar', ago: 49, rating: 5, mode: 'independent', fav: 3, results: ['i'] },
    { catalogId: 'little-bear', ago: 44, rating: 5, mode: 'independent', fav: 2, results: ['i', 's'] },
    { catalogId: 'frog-and-toad', ago: 38, rating: 5, mode: 'independent', fav: 3, results: ['i', 'i'] },
    { catalogId: 'owl-at-home', ago: 31, rating: 4, mode: 'independent', fav: 1, results: ['i'] },
    { catalogId: 'henry-and-mudge', ago: 25, rating: 4, mode: 'independent', fav: 2, results: ['i', 'i'] },
    { catalogId: 'amelia-bedelia', ago: 18, rating: 5, mode: 'independent', fav: 0, results: ['i', 's'] },
    { catalogId: 'mercy-watson', ago: 12, rating: 5, mode: 'independent', fav: 3, results: ['i', 'i'] },
    { catalogId: 'dinosaurs-before-dark', ago: 7, rating: 5, mode: 'independent', fav: 2, results: ['i', 'i'] },
  ];

  completedPlan.forEach((p, index) => {
    const cat = getCatalogBook(p.catalogId);
    if (!cat) throw new Error(`Missing catalog book ${p.catalogId}`);
    const id = `book_${p.catalogId}`;
    const started = p.ago + (cat.totalChapters && cat.totalChapters > 5 ? 6 : 2);
    books.push({
      id,
      childId: izzy.id,
      title: cat.title,
      author: cat.author,
      catalogId: cat.id,
      cover: cat.cover,
      status: 'completed',
      dateAdded: day(started + 2),
      dateStarted: day(started),
      dateCompleted: day(p.ago),
      ...(cat.totalChapters ? { totalChapters: cat.totalChapters, chaptersRead: cat.totalChapters } : {}),
      ...(cat.totalPages ? { totalPages: cat.totalPages, pagesRead: cat.totalPages } : {}),
      childRating: p.rating,
      favoritePart: cat.moments[p.fav] ?? cat.moments[0] ?? '',
      readingMode: p.mode,
      tags: cat.tags,
      difficulty: { band: cat.band },
      shelfIndex: index,
      ...(p.catalogId === 'mercy-watson' ? { parentNotes: 'Laughed out loud at the toast parts — read it twice.' } : {}),
      ...(p.catalogId === 'frog-and-toad'
        ? { comprehensionNotes: 'Explained why Toad was sad without prompting; connected it to waiting for Grandma’s letters.' }
        : {}),
      isDemo: true,
    });
    sessions.push({
      id: ids('session'),
      childId: izzy.id,
      bookId: id,
      date: day(p.ago),
      mode: p.mode,
      notes: 'Finished the book',
      source: 'child',
      isDemo: true,
    });
    const source = { type: 'book' as const, id, label: cat.title };
    cat.questions.slice(0, p.results.length).forEach((q, qi) => {
      const r = p.results[qi];
      ev(
        q.skillId,
        p.ago,
        r === 'i' ? { independent: 1 } : { supported: 1 },
        source,
        `Answered a story question about ${cat.title} with Professor Hoot${r === 'i' ? ' independently' : ' after a hint'}: “${q.prompt}”`,
        { hour: 15 },
      );
    });
    if ((cat.totalChapters ?? 0) >= 5 || (cat.totalPages ?? 0) >= 60) {
      ev('read.chapter-stamina', p.ago, { independent: 1 }, source, `Finished ${cat.title} reading independently.`, { hour: 15 });
    }
    portfolio.push({
      id: ids('pf'),
      childId: izzy.id,
      date: day(p.ago),
      kind: 'book',
      title: `Finished ${cat.title}`,
      description: `by ${cat.author} · Izzy’s rating: ${'★'.repeat(p.rating)} · Favorite part: ${cat.moments[p.fav] ?? ''}`,
      mediaIds: [],
      skillIds: cat.questions.slice(0, p.results.length).map((q) => q.skillId),
      linked: { type: 'book', id },
      favorite: p.rating === 5,
      isDemo: true,
    });
  });

  // In-progress: Charlotte's Web (chapter 14 of 22).
  const cw = getCatalogBook('charlottes-web');
  if (cw) {
    books.push({
      id: 'book_charlottes-web',
      childId: izzy.id,
      title: cw.title,
      author: cw.author,
      catalogId: cw.id,
      cover: cw.cover,
      status: 'reading',
      dateAdded: day(16),
      dateStarted: day(14),
      totalChapters: 22,
      totalPages: cw.totalPages ?? 184,
      chaptersRead: 14,
      readingMode: 'independent',
      tags: cw.tags,
      difficulty: { band: cw.band, notes: 'Stretch text — we discuss vocabulary together.' },
      isDemo: true,
    });
    [
      [14, 3],
      [11, 3],
      [8, 2],
      [5, 3],
      [2, 3],
    ].forEach(([ago, ch]) => {
      sessions.push({
        id: ids('session'),
        childId: izzy.id,
        bookId: 'book_charlottes-web',
        date: day(ago ?? 0),
        chaptersRead: ch ?? 0,
        minutes: 25,
        mode: 'independent',
        source: 'parent',
        isDemo: true,
      });
      ev(
        'read.chapter-stamina',
        ago ?? 0,
        { independent: 1 },
        { type: 'book', id: 'book_charlottes-web', label: cw.title },
        `Read ${ch} chapters of Charlotte’s Web independently.`,
        { hour: 9 },
      );
    });
  }

  // Up next (parent-queued).
  ['my-fathers-dragon', 'velveteen-rabbit', 'winnie-the-pooh', 'nate-the-great', 'boxcar-children'].forEach((cid, i) => {
    const cat = getCatalogBook(cid);
    if (!cat) return;
    books.push({
      id: `book_${cid}`,
      childId: izzy.id,
      title: cat.title,
      author: cat.author,
      catalogId: cid,
      cover: cat.cover,
      status: 'up_next',
      dateAdded: day(10 - i),
      ...(cat.totalChapters ? { totalChapters: cat.totalChapters } : {}),
      ...(cat.totalPages ? { totalPages: cat.totalPages } : {}),
      readingMode: 'independent',
      tags: cat.tags,
      difficulty: { band: cat.band },
      isDemo: true,
    });
  });

  // ── Parent observations & a reading assessment ─────────────────────────
  const obs = (label: string, ago: number) => ({ type: 'observation' as const, id: `obs_${ago}_${label.length}`, label });
  for (const ago of [56, 47, 35, 24, 13]) {
    ev('read.letter-sounds', ago, { independent: 2 }, obs('Reading lesson', ago), 'Named sounds for all consonants and short vowels without help.');
    ev('read.decode-cvc', ago, { independent: 2 }, obs('Reading lesson', ago), 'Decoded CVC words fluently.');
  }
  for (const ago of [46, 33, 20, 9]) {
    ev('read.phonics-advanced', ago, { independent: 1 }, obs('Reading lesson', ago), 'Decoded words with vowel teams (ai, ee, oa) independently.');
  }
  ev('read.multisyllable', 16, { supported: 1 }, obs('Reading lesson', 16), 'Decoded three-syllable words with a syllable-clap prompt.');
  ev(
    'read.multisyllable',
    4,
    { independent: 1, supported: 1 },
    obs('Reading lesson', 4),
    'Split “caterpillar” into syllables herself; needed help with “especially”.',
  );
  const assessment = { type: 'assessment' as const, id: 'assess_running_record', label: 'Running record (Grade 2–3 passage)' };
  ev('read.fluency', 17, { independent: 1 }, assessment, 'Running record on a Grade 2–3 passage: 97% word accuracy with natural phrasing.', { hour: 10 });
  ev('read.fluency', 3, { independent: 1 }, obs('Read-aloud to Dad', 3), 'Read two pages of Charlotte’s Web aloud with expression and character voices.');
  ev('read.fluency', 30, { independent: 1 }, obs('Reading lesson', 30), 'Read a new picture book aloud with only two self-corrected errors.');
  ev('read.retell', 17, { independent: 2 }, assessment, 'Retold beginning, middle and end of the passage in order without prompts.');
  ev('read.inference', 17, { independent: 2 }, assessment, 'Answered 2 of 2 inference questions correctly (why the character changed her mind).');
  ev('read.key-details', 17, { independent: 2, notYet: 1 }, assessment, 'Answered 2 of 3 literal questions; missed one detail about the setting.');
  ev('read.narration', 22, { independent: 1 }, obs('Narration', 22), 'Narrated a chapter of Charlotte’s Web in her own words at lunch.');
  ev('read.narration', 8, { independent: 1 }, obs('Narration', 8), 'Told Grandma the whole plot of Mercy Watson over the phone.');
  ev('read.narration', 36, { independent: 1 }, obs('Narration', 36), 'Retold Frog and Toad “The Letter” using her stuffed animals.');
  ev('vocab.rich-words', 26, { independent: 1 }, obs('Conversation', 26), 'Used the word “enormous” correctly to describe Mudge.');
  ev('vocab.rich-words', 10, { independent: 1 }, obs('Conversation', 10), 'Used “humble” after reading about Wilbur.');
  ev('write.name', 40, { independent: 1 }, obs('Handwriting', 40), 'Wrote her name on her painting.');
  ev('write.name', 28, { independent: 1 }, obs('Handwriting', 28), 'Wrote her name with correct letter order.');
  ev('write.name', 12, { independent: 1 }, obs('Handwriting', 12), 'Signed her card to Grandma.');
  ev('write.letters', 20, { supported: 1 }, obs('Handwriting', 20), 'Traced lowercase letters a–h with reminders about starting points.');
  ev('write.letters', 6, { independent: 1, supported: 1 }, obs('Handwriting', 6), 'Formed b, d and p correctly; reversed q.');
  ev('math.count-10', 55, { independent: 2 }, obs('Math play', 55), 'Counted 8 blocks one-to-one.');
  ev('math.count-10', 41, { independent: 2 }, obs('Math play', 41), 'Counted snack crackers accurately.');
  ev('math.count-10', 29, { independent: 2 }, obs('Math play', 29), 'Counted stairs to 10.');
  ev('math.count-20', 34, { independent: 1 }, obs('Math play', 34), 'Counted 17 buttons into a jar.');
  ev('math.count-20', 19, { independent: 2 }, obs('Math play', 19), 'Counted 14 and 18 acorns accurately.');
  ev('math.patterns', 50, { independent: 2 }, obs('Math play', 50), 'Extended an ABB bead pattern.');
  ev('math.patterns', 37, { independent: 2 }, obs('Math play', 37), 'Created her own ABC pattern with stickers.');
  ev('math.patterns', 23, { independent: 2 }, obs('Math play', 23), 'Spotted the pattern in the kitchen tiles.');
  ev('math.shapes', 42, { independent: 2 }, obs('Shape hunt', 42), 'Named circles, triangles, rectangles and a hexagon on a walk.');
  ev('math.shapes', 26, { independent: 1 }, obs('Shape hunt', 26), 'Identified cylinders and cubes in the pantry.');
  ev('math.compare', 30, { independent: 2 }, obs('Math play', 30), 'Compared two piles of cards and said which had more.');
  ev('math.compare', 16, { independent: 2 }, obs('Math play', 16), 'Told which jar had fewer marbles and by how many.');
  ev('math.add-10', 32, { supported: 1 }, obs('Math play', 32), 'Added 3 + 4 with fingers after a prompt.');
  ev('math.add-10', 21, { independent: 2 }, obs('Math play', 21), 'Solved two story problems within 10 with counters.');
  ev('sci.questions', 48, { independent: 2 }, obs('Wonder wall', 48), 'Asked why the moon changes shape.');
  ev('sci.questions', 34, { independent: 2 }, obs('Wonder wall', 34), 'Asked where rain comes from and how birds know where to fly.');
  ev('sci.questions', 19, { independent: 2 }, obs('Wonder wall', 19), 'Asked why leaves change color.');
  ev('sci.animals', 27, { independent: 1 }, obs('Backyard', 27), 'Described what the backyard birds were eating.');

  // ── Activities (natural-language entries, already reviewed) ─────────────
  const activities: Activity[] = [];
  const addActivity = (
    a: Omit<Activity, 'id' | 'childId' | 'createdAt' | 'mediaIds' | 'isDemo' | 'interpretation'>,
    ago: number,
    items: [string, Partial<EvidenceTrials>, string, Evidence['kind']?][],
    portfolioKind: PortfolioItem['kind'],
    favorite = false,
    artSeed?: number,
  ) => {
    const id = ids('act');
    activities.push({
      ...a,
      id,
      childId: izzy.id,
      createdAt: at(ago, 18),
      mediaIds: [],
      interpretation: { provider: 'local-heuristic', version: 'demo', acceptedSuggestions: items.length, totalSuggestions: items.length + 1 },
      isDemo: true,
    });
    const source = { type: 'activity' as const, id, label: a.title };
    for (const [skillId, trials, statement, kind] of items) ev(skillId, ago, trials, source, statement, { kind: kind ?? 'performance', topics: a.topics });
    portfolio.push({
      id: ids('pf'),
      childId: izzy.id,
      date: a.date,
      kind: portfolioKind,
      title: a.title,
      description: a.parentObservation ?? a.narrative,
      mediaIds: [],
      skillIds: items.map((i) => i[0]),
      linked: { type: 'activity', id },
      favorite,
      ...(artSeed !== undefined ? { artSeed } : {}),
      isDemo: true,
    });
  };

  addActivity(
    {
      date: day(20),
      title: 'Trip to the natural history museum',
      narrative:
        'We went to the natural history museum. Izzy spent a long time at the Triceratops skeleton and asked how they know what color dinosaurs were. She matched fossils to pictures with a little help.',
      durationMinutes: 120,
      domains: ['science'],
      skillIds: ['sci.fossils', 'sci.questions', 'sci.observe'],
      topics: ['dinosaurs'],
      parentObservation: 'Very focused on the fossil hall. Understood that fossils are old bones turned to rock.',
      childReflection: 'The Triceratops had three horns and a frill like a shield!',
    },
    20,
    [
      ['sci.fossils', { supported: 1 }, 'Matched fossils to the animals they came from with a little help.'],
      ['sci.observe', { independent: 1 }, 'Made detailed observations of the Triceratops skeleton (horns, frill).'],
    ],
    'photo',
    true,
  );
  addActivity(
    {
      date: day(12),
      title: 'Planting fall garlic',
      narrative:
        'We planted garlic cloves in the garden bed. Izzy dug the holes, planted them pointy side up, and explained that roots grow down and the shoot grows up toward the sun.',
      durationMinutes: 40,
      domains: ['science', 'lifeSkills'],
      skillIds: ['sci.plants', 'life.chores'],
      topics: ['plants'],
      parentObservation: 'Remembered from last spring that plants need sun and water.',
    },
    12,
    [
      ['sci.plants', { independent: 1 }, 'Explained that roots grow down and shoots grow up toward the sun.'],
      ['life.chores', { independent: 1 }, 'Dug planting holes and watered the bed herself.'],
    ],
    'project',
  );
  addActivity(
    {
      date: day(10),
      title: 'Painting sunflowers',
      narrative: 'Izzy painted the sunflowers from the garden with watercolors. She mixed yellow and red to make orange for the centers.',
      durationMinutes: 35,
      domains: ['creativity'],
      skillIds: ['art.drawing', 'art.color'],
      topics: ['art'],
      childReflection: 'I made the petals go all the way around like the sun.',
    },
    10,
    [
      ['art.drawing', { independent: 1 }, 'Painted sunflowers from observation with watercolors.'],
      ['art.color', { independent: 1 }, 'Mixed yellow and red to make orange on purpose.'],
    ],
    'artwork',
    true,
    12, // kid-art seed % 4 === 0 → sunflowers
  );
  addActivity(
    {
      date: day(8),
      title: 'Baking banana bread',
      narrative:
        'Izzy and I baked banana bread. She mashed the bananas, counted 3 eggs, measured 1 cup of sugar with help, and read the recipe steps aloud to me.',
      durationMinutes: 50,
      domains: ['lifeSkills', 'math', 'reading'],
      skillIds: ['life.cooking', 'math.measure-units', 'read.procedural', 'math.count-10'],
      topics: ['changes'],
      parentObservation: 'Read every step of the recipe herself; needed help leveling the measuring cup.',
    },
    8,
    [
      ['life.cooking', { supported: 1 }, 'Helped prepare banana bread (mashing, mixing) with some support.'],
      ['math.measure-units', { supported: 1 }, 'Measured 1 cup of sugar with help leveling the cup.'],
      ['read.procedural', { independent: 1 }, 'Read the recipe steps aloud in order without help.'],
      ['math.count-10', { independent: 1 }, 'Counted 3 eggs.'],
    ],
    'photo',
  );
  addActivity(
    {
      date: day(5),
      title: 'Nature walk at Riverside Park',
      narrative:
        'We went on a nature walk at Riverside Park. Izzy collected two acorns, a maple leaf, a pinecone and a blue jay feather. She noticed moss growing on the shady side of a tree and watched a woodpecker.',
      durationMinutes: 60,
      domains: ['science'],
      skillIds: ['sci.observe', 'sci.animals', 'sci.plants', 'sci.habitats'],
      topics: ['nature', 'plants', 'animals'],
      natureItems: ['acorn', 'acorn', 'leaf', 'pinecone', 'feather'],
      parentObservation: 'Great eye for detail — she noticed the moss without any hint.',
      childReflection: 'The woodpecker goes tap tap tap to find bugs!',
    },
    5,
    [
      ['sci.observe', { independent: 1 }, 'Noticed moss growing on the shady side of a tree without prompting.'],
      ['sci.animals', { independent: 1 }, 'Watched a woodpecker and explained it taps to find insects.'],
      ['sci.plants', { independent: 1 }, 'Connected moss growth to shade and moisture.'],
      ['sci.habitats', { supported: 1 }, 'Talked about which animals live in the park woods.'],
    ],
    'nature',
    true,
  );
  addActivity(
    {
      date: day(3),
      title: 'Drawing a map of our house',
      narrative: 'Izzy drew a map of our house with a key for the doors and windows. She labeled the kitchen and her room by sounding out the words.',
      durationMinutes: 30,
      domains: ['creativity', 'writing'],
      skillIds: ['art.drawing', 'write.spelling'],
      topics: ['art'],
    },
    3,
    [
      ['art.drawing', { independent: 1 }, 'Drew a map of the house with a simple key.'],
      ['write.spelling', { independent: 1 }, 'Labeled rooms using phonetic spelling (“kichen”).'],
    ],
    'artwork',
    false,
    31, // kid-art seed % 4 === 3 → map
  );
  addActivity(
    {
      date: day(15),
      title: 'Moon watching',
      narrative: 'We looked at the moon with binoculars after dinner. Izzy drew the crescent shape and asked why the moon changes.',
      durationMinutes: 20,
      domains: ['science'],
      skillIds: ['sci.sky'],
      topics: ['space'],
    },
    15,
    [['sci.sky', { supported: 1 }, 'Observed and drew the crescent moon; discussed why it changes shape.']],
    'observation',
  );
  portfolio.push({
    id: ids('pf'),
    childId: izzy.id,
    date: day(17),
    kind: 'assessment',
    title: 'Reading assessment: running record',
    description: 'Grade 2–3 passage. 97% accuracy, natural phrasing, retold in sequence, 2/2 inference and 2/3 literal questions.',
    mediaIds: [],
    skillIds: ['read.fluency', 'read.retell', 'read.inference', 'read.key-details'],
    favorite: false,
    isDemo: true,
  });

  // ── In-app lessons ─────────────────────────────────────────────────────
  const lessons: LessonAttempt[] = [];
  const lesson = (
    lessonId: string,
    teacherId: string,
    ago: number,
    problems: LessonAttempt['problems'],
    startTier: number,
    endTier: number,
    summary: string,
  ) => {
    const id = ids('lesson');
    lessons.push({
      id,
      childId: izzy.id,
      lessonId,
      teacherId,
      startedAt: at(ago, 14),
      completedAt: at(ago, 14, 12),
      startTier,
      endTier,
      problems,
      summary,
      isDemo: true,
    });
    interactions.push({
      id: ids('talk'),
      childId: izzy.id,
      teacherId,
      startedAt: at(ago, 14),
      endedAt: at(ago, 14, 12),
      context: { lessonId, flow: 'lesson' },
      transcript: problems.flatMap((p) => [
        { speaker: 'teacher' as const, text: p.prompt, at: at(ago, 14, 2) },
        ...p.responses.map((r) => ({ speaker: 'child' as const, text: r, at: at(ago, 14, 3) })),
      ]),
      outcome: summary,
      isDemo: true,
    });
    return { id, label: lessonId === 'moon-rocks' ? 'Moon Rock Rescue' : 'Sink or Float?' };
  };
  const p = (
    skillId: string,
    tier: number,
    prompt: string,
    responses: string[],
    outcome: 'independent' | 'supported' | 'not_yet',
    scaffolds: string[] = [],
  ) => ({
    problemId: `${skillId}-${prompt.length}-${tier}`,
    skillId,
    tier,
    prompt,
    responses,
    scaffolds,
    outcome,
  });
  const m1 = lesson(
    'moon-rocks',
    'digit',
    6,
    [
      p('math.add-10', 3, 'I have 4 moon rocks. Nova found 3 more! How many do we have now?', ['7'], 'independent'),
      p('math.add-10', 3, 'I have 5 moon rocks. Nova found 4 more! How many do we have now?', ['9'], 'independent'),
      p('math.add-20', 4, 'I have 8 moon rocks. Nova found 5 more! How many do we have now?', ['12', '13'], 'supported', ['hint']),
      p('math.add-20', 4, 'I have 7 moon rocks. Nova found 6 more! How many do we have now?', ['13'], 'independent'),
      p('math.add-20', 4, 'Oh no! I had 15 moon rocks, and 6 rolled away. How many are left?', ['8', '10', '9'], 'supported', ['hint', 'simpler:solved']),
    ],
    3,
    4,
    'Moon Rock Rescue: 3 of 5 solved on the first try, 2 with a hint; Add within 10 → Add & subtract within 20.',
  );
  ev('math.add-10', 6, { independent: 2 }, { type: 'lesson', ...m1 }, 'Moon Rock Rescue: 2 adding-within-10 problems — 2 independently.');
  ev(
    'math.add-20',
    6,
    { independent: 1, supported: 2 },
    { type: 'lesson', ...m1 },
    'Moon Rock Rescue: 3 adding & subtracting within 20 problems — 1 independently, 2 with a hint or visual.',
  );
  ev(
    'math.word-problems',
    6,
    { independent: 3, supported: 2 },
    { type: 'lesson', ...m1 },
    'Moon Rock Rescue: 5 story problems — 3 independently, 2 with a hint.',
  );
  ev('reason.persistence', 6, { independent: 2 }, { type: 'lesson', ...m1 }, 'Kept going after a hint and solved 2 problems in Moon Rock Rescue.', {
    kind: 'observation',
  });
  const m2 = lesson(
    'moon-rocks',
    'digit',
    2,
    [
      p('math.add-20', 4, 'I have 9 moon rocks. Nova found 4 more! How many do we have now?', ['13'], 'independent'),
      p('math.add-20', 4, 'I have 6 moon rocks. Nova found 7 more! How many do we have now?', ['12', '13'], 'supported', ['hint']),
      p('math.equal-shares', 5, 'Let’s share 14 moon rocks equally between 2 rockets. How many in each rocket?', ['6', '7'], 'supported', ['hint']),
      p(
        'math.equal-shares',
        5,
        'Can 11 moon rocks be shared fairly between 2 rockets, with none left over?',
        ['Yes, it’s fair!', 'One is left over'],
        'supported',
        ['hint'],
      ),
      p('math.add-20', 4, 'I have 8 moon rocks. Nova found 8 more! How many do we have now?', ['15', '16'], 'supported', ['hint']),
    ],
    4,
    4,
    'Moon Rock Rescue: 1 of 5 solved on the first try, 4 with a hint; stayed at Add & subtract within 20.',
  );
  ev(
    'math.add-20',
    2,
    { independent: 1, supported: 2 },
    { type: 'lesson', ...m2 },
    'Moon Rock Rescue: 3 adding-within-20 problems — 1 independently, 2 with a “make a ten” hint.',
  );
  ev(
    'math.equal-shares',
    2,
    { supported: 2 },
    { type: 'lesson', ...m2 },
    'Moon Rock Rescue: 2 equal-sharing problems — 2 with a hint (dealing rocks one by one).',
  );
  const s1 = lesson(
    'sink-float',
    'nova',
    4,
    [
      p('sci.predict', 1, 'Here’s a wooden block. What do you predict — will it sink or float?', ['Float'], 'independent'),
      p('sci.materials', 1, 'It floated! Why do you think that happened?', ['It’s made of wood, and wood is light for its size.'], 'independent'),
      p('sci.predict', 1, 'Here’s a metal key. What do you predict — will it sink or float?', ['Sink'], 'independent'),
      p('sci.materials', 1, 'It sank! Why do you think that happened?', ['Because it is small.', 'Metal is heavy for its size.'], 'supported', ['hint']),
    ],
    1,
    1,
    'Sink or Float?: 1 of 2 explained on the first try, 1 with a hint.',
  );
  ev('sci.predict', 4, { independent: 2 }, { type: 'lesson', ...s1 }, 'Made 2 predictions before testing in Sink or Float? with Nova.');
  ev(
    'sci.materials',
    4,
    { independent: 1, supported: 1 },
    { type: 'lesson', ...s1 },
    'Sink or Float?: explained floating/sinking by material — 1 independently, 1 after a hint.',
  );
  ev(
    'sci.explain',
    4,
    { independent: 1, supported: 1 },
    { type: 'lesson', ...s1 },
    'Used material evidence to explain results — 1 independently, 1 after a hint.',
  );

  interactions.push({
    id: ids('talk'),
    childId: izzy.id,
    teacherId: 'hoot',
    startedAt: at(7, 15),
    endedAt: at(7, 15, 6),
    context: { bookId: 'book_dinosaurs-before-dark', flow: 'finish-book' },
    transcript: [
      { speaker: 'teacher', text: 'Hoo-hoo! Welcome to the library, Izzy!', at: at(7, 15) },
      { speaker: 'child', text: 'I finished a book!', at: at(7, 15, 1) },
      { speaker: 'teacher', text: 'Who are the brother and sister who find the magic tree house?', at: at(7, 15, 2) },
      { speaker: 'child', text: 'Jack and Annie', at: at(7, 15, 2) },
      { speaker: 'teacher', text: 'Which flying creature helped Jack escape?', at: at(7, 15, 3) },
      { speaker: 'child', text: 'A Pteranodon', at: at(7, 15, 3) },
      { speaker: 'child', text: 'Rating: ★★★★★', at: at(7, 15, 4) },
    ],
    outcome: 'Finished Dinosaurs Before Dark; 2 story questions; placed on shelf #9.',
    isDemo: true,
  });

  // ── Georgia (inactive future profile) — kept completely separate ───────
  books.push({
    id: 'book_georgia_goodnight',
    childId: georgia.id,
    title: 'Goodnight Moon',
    author: 'Margaret Wise Brown',
    cover: { background: '#2f5d50', accent: '#f4d35e', motif: 'moon' },
    status: 'completed',
    dateAdded: day(30),
    dateStarted: day(30),
    dateCompleted: day(30),
    readingMode: 'read_aloud',
    tags: ['bedtime'],
    shelfIndex: 0,
    isDemo: true,
  });

  // ── Mastery: replay evidence chronologically through the real engine ───
  const mastery: MasteryRecord[] = [];
  const bySkill = new Map<string, Evidence[]>();
  for (const e of evidence) bySkill.set(e.skillId, [...(bySkill.get(e.skillId) ?? []), e]);
  for (const [skillId, list] of bySkill) {
    const sorted = [...list].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    let rec: MasteryRecord | undefined;
    for (let i = 0; i < sorted.length; i++) {
      rec = updateMasteryRecord(rec, izzy.id, skillId, sorted.slice(0, i + 1), sorted[i]?.observedAt ?? createdAt);
    }
    if (rec) mastery.push(rec);
  }

  // ── Rewards earned by the seeded progress (evaluated, not hand-picked) ─
  const snapshot = buildSnapshot(
    { books: books.filter((b) => b.childId === izzy.id), evidence, activities, lessons, portfolio, mastery },
    (id) => getSkill(id)?.domainId,
  );
  const earned = evaluateNewRewards(snapshot, new Set());
  const unlocks: RewardUnlock[] = earned.map((r, i) => ({
    id: ids('unlock'),
    childId: izzy.id,
    rewardId: r.id,
    unlockedAt: at(Math.max(1, 50 - i * 8), 16),
    celebrated: true,
    trigger: 'demo-seed',
    isDemo: true,
  }));

  const ops: WriteOp[] = [];
  const put = (table: string, values: unknown[]) => values.forEach((value) => ops.push({ table, type: 'put', value }));
  put('households', [household]);
  put('parents', parents);
  put('children', [izzy, georgia]);
  put('avatars', avatars);
  put('books', books);
  put('readingSessions', sessions);
  put('activities', activities);
  put('evidence', evidence);
  put('mastery', mastery);
  put('lessonAttempts', lessons);
  put('teacherInteractions', interactions);
  put('rewardUnlocks', unlocks);
  put('portfolio', portfolio);
  put('meta', [{ key: 'demoSeededAt', value: clock.now().toISOString() }]);
  await repos.commit(ops);

  return {
    childId: izzy.id,
    counts: {
      books: books.length,
      evidence: evidence.length,
      activities: activities.length,
      mastery: mastery.length,
      unlocks: unlocks.length,
    },
  };
}

export async function resetToDemo(repos: Repositories, clock: Clock): Promise<SeedResult> {
  await repos.db.wipe();
  return seedDemoData(repos, clock);
}
