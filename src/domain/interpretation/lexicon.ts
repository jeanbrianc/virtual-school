/**
 * Rule lexicon for the local (on-device) activity interpreter.
 * Each rule maps language cues in one sentence to curriculum skills with a
 * base confidence and a parent-facing statement template.
 */
import type { EvidenceKind, Independence } from '../types';
import { NUMBER_WORD_PATTERN, parseNumber } from './numbers';

export type SentenceContext = 'reading' | 'cooking' | 'nature' | 'art' | 'science' | 'math' | 'general';

export interface SentenceInfo {
  text: string;
  lower: string;
  context: SentenceContext;
  /** Independence explicitly signalled in this sentence (or null). */
  independence: Independence | null;
  exposureOnly: boolean;
  struggled: boolean;
  hedged: boolean;
  affirmed: boolean;
  numbers: number[];
  bookTitle?: string;
  measurementsText?: string;
}

export interface RuleSkill {
  skillId: string;
  confidence: number;
  kind?: EvidenceKind;
  /** Only emit when this extra pattern matches too. */
  when?: RegExp;
  statement: (s: SentenceInfo, m: RegExpMatchArray) => string;
}

export interface Rule {
  id: string;
  pattern: RegExp;
  exclude?: RegExp;
  onlyIn?: SentenceContext[];
  notIn?: SentenceContext[];
  topics?: string[];
  /** Independence to assume when the sentence gives no cue. */
  assume?: Independence;
  /** Human label for activity titles ("Baking", "Nature walk"). */
  label?: (s: SentenceInfo, m: RegExpMatchArray) => string | null;
  skills: RuleSkill[];
}

const NUM = NUMBER_WORD_PATTERN;
const clause = (m: RegExpMatchArray, i = 1) => (m[i] ?? '').trim().replace(/\s+/g, ' ');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function indepPhrase(i: Independence | null): string {
  if (i === 'independent') return ' independently';
  if (i === 'supported') return ' with some support';
  if (i === 'assisted') return ' with adult help';
  return '';
}

function countSkill(n: number): string {
  if (n > 20) return 'math.count-100';
  if (n > 10) return 'math.count-20';
  return 'math.count-10';
}

export const RULES: Rule[] = [
  // ── Reading ─────────────────────────────────────────────────────────────
  {
    id: 'reading.chapters',
    pattern: new RegExp(`\\b(read|reread|finished)\\b[^.]*?\\b(${NUM})\\s+(chapters?|pages?)\\b`, 'i'),
    exclude: /\bread (it |them |aloud |out loud )?to (her|him|them)\b/i,
    label: (s) => (s.bookTitle ? `Reading ${s.bookTitle}` : 'Reading time'),
    skills: [
      {
        skillId: 'read.chapter-stamina',
        confidence: 0.8,
        statement: (s, m) =>
          `Read ${clause(m, 2)} ${clause(m, 3)}${s.bookTitle ? ` of ${s.bookTitle}` : ''}${indepPhrase(s.independence ?? 'independent')}.`,
      },
      {
        skillId: 'read.fluency',
        confidence: 0.5,
        kind: 'observation',
        statement: (s) => `Read connected text${s.bookTitle ? ` (${s.bookTitle})` : ''}${indepPhrase(s.independence ?? 'independent')}.`,
      },
    ],
  },
  {
    id: 'reading.general',
    pattern: /\b(she|izzy|he|they) (read|reread|finished reading|finished)\b/i,
    exclude: /\b(read|reading) (it |them |aloud |out loud )?to (her|him|them)\b|\brecipe|directions|instructions|steps\b/i,
    label: (s) => (s.bookTitle ? `Reading ${s.bookTitle}` : 'Reading time'),
    skills: [
      {
        skillId: 'read.fluency',
        confidence: 0.55,
        kind: 'observation',
        statement: (s) => `Read${s.bookTitle ? ` ${s.bookTitle}` : ' a book'}${indepPhrase(s.independence ?? 'independent')}.`,
      },
    ],
  },
  {
    id: 'reading.readAloud',
    pattern: /\b(read|reading) (it |them |aloud |out loud )?to (her|him|them)\b|\bread-?aloud\b|\bi read\b/i,
    label: (s) => (s.bookTitle ? `Read-aloud: ${s.bookTitle}` : 'Read-aloud'),
    skills: [
      {
        skillId: 'read.listening',
        confidence: 0.7,
        kind: 'exposure',
        statement: (s) => `Listened to ${s.bookTitle ?? 'a story'} read aloud.`,
      },
    ],
  },
  {
    id: 'reading.retell',
    pattern: /\b(summari[sz]ed|summari[sz]e|retold|retell|re-told|told (me|us|her dad|grandma) (what happened|about (it|the (story|chapter|book)))|narrated|recapped|told it back)\b/i,
    notIn: ['cooking'],
    skills: [
      {
        skillId: 'read.retell',
        confidence: 0.85,
        statement: (s) => `Retold/summarized what happened${s.bookTitle ? ` in ${s.bookTitle}` : ' in the story'}${indepPhrase(s.independence)}.`,
      },
      {
        skillId: 'read.narration',
        confidence: 0.8,
        statement: (s) => `Gave an oral narration of the reading${indepPhrase(s.independence)}.`,
      },
    ],
  },
  {
    id: 'reading.explainWhy',
    pattern: /\b(?:explained|explain|understood|figured out|knew|told me|could say|described)\s+(why|how|what)\s+([^.;!?]+?)(?=\s+and\s+(?:she|he|then)\b|[.;!?]|$)/i,
    onlyIn: ['reading'],
    skills: [
      {
        skillId: 'read.inference',
        confidence: 0.7,
        statement: (s, m) => `${s.affirmed ? 'Correctly e' : 'E'}xplained ${clause(m, 1)} ${clause(m, 2)}${indepPhrase(s.independence)} — reasoning beyond literal recall.`,
      },
      {
        skillId: 'read.feelings',
        confidence: 0.75,
        when: /\b(scared|afraid|sad|happy|angry|mad|worried|lonely|excited|jealous|brave|upset|felt|feel|feeling|nervous|proud|frightened)\b/i,
        statement: (s, m) => `Explained a character’s feelings/motivation (${clause(m, 1)} ${clause(m, 2)})${indepPhrase(s.independence)}.`,
      },
    ],
  },
  {
    id: 'reading.predict',
    pattern: /\bpredict(?:ed|s)?\s+(what (?:would|will|might) happen[^.;!?]*)/i,
    onlyIn: ['reading'],
    skills: [
      {
        skillId: 'read.inference',
        confidence: 0.6,
        statement: (s, m) => `Predicted ${clause(m, 1)} using story clues${indepPhrase(s.independence)}.`,
      },
    ],
  },
  {
    id: 'reading.characters',
    pattern: /\b(describ(?:ed|e)|talked about|told me about) (the )?(characters?|setting|main character)\b/i,
    skills: [
      {
        skillId: 'read.characters',
        confidence: 0.7,
        statement: (s) => `Described characters/setting${s.bookTitle ? ` in ${s.bookTitle}` : ''}${indepPhrase(s.independence)}.`,
      },
    ],
  },
  {
    id: 'reading.procedural',
    pattern: /\bread (?:the |several |some |a few |all the |each |every )?(?:\w+ )?(steps|recipe|directions|instructions|label|list)\b/i,
    skills: [
      {
        skillId: 'read.procedural',
        confidence: 0.85,
        statement: (s, m) => `Read ${clause(m, 1) === 'steps' ? 'recipe/procedure steps' : `the ${clause(m, 1)}`} aloud and followed along${indepPhrase(s.independence ?? 'independent')}.`,
      },
      {
        skillId: 'reason.sequencing',
        confidence: 0.55,
        statement: () => 'Followed a multi-step sequence in order.',
      },
    ],
  },
  {
    id: 'reading.phonics',
    pattern: /\b(sound(?:ed)? out|sounding out|phonics|decod(?:ed|ing)|blend(?:ed|ing) (?:the )?sounds|sight words?)\b/i,
    skills: [
      {
        skillId: 'read.phonics-advanced',
        confidence: 0.6,
        statement: (s, m) => `Practiced decoding (${clause(m, 1)})${indepPhrase(s.independence)}.`,
      },
    ],
  },
  {
    id: 'reading.infoText',
    pattern: /\b(nonfiction|non-fiction|fact book|field guide|encyclopedia|informational)\b/i,
    skills: [
      {
        skillId: 'read.info-text',
        confidence: 0.65,
        statement: (s) => `Read informational text to learn facts${indepPhrase(s.independence)}.`,
      },
    ],
  },
  // ── Vocabulary ──────────────────────────────────────────────────────────
  {
    id: 'vocab.context',
    pattern: /\b(?:asked what|figured out what|guessed what|knew what|worked out what)\s+["“]?([\w-]+)["”]?\s+(?:means|meant)\b|\bnew word\b|\bvocabulary\b/i,
    skills: [
      {
        skillId: 'vocab.context',
        confidence: 0.65,
        statement: (s, m) => (m[1] ? `Worked on the meaning of “${clause(m, 1)}”${indepPhrase(s.independence)}.` : `Learned new vocabulary${indepPhrase(s.independence)}.`),
      },
    ],
  },
  {
    id: 'vocab.used',
    pattern: /\bused the word\s+["“]?([\w-]+)["”]?/i,
    skills: [
      {
        skillId: 'vocab.rich-words',
        confidence: 0.75,
        statement: (_s, m) => `Used the word “${clause(m, 1)}” spontaneously and correctly.`,
      },
    ],
  },
  // ── Writing ─────────────────────────────────────────────────────────────
  {
    id: 'writing.name',
    pattern: /\b(wrote|writes|writing|signed|printed) (her|his|their) (own )?name\b/i,
    skills: [{ skillId: 'write.name', confidence: 0.85, statement: (s) => `Wrote her name${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'writing.letters',
    pattern: /\b(handwriting|traced (letters|her letters)|practiced (her )?letters|letter formation|wrote (the )?letters?|copywork)\b/i,
    skills: [{ skillId: 'write.letters', confidence: 0.8, statement: (s) => `Practiced letter formation/handwriting${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'writing.spelling',
    pattern: /\b(spelled|spelling|sounded out how to spell)\b/i,
    skills: [{ skillId: 'write.spelling', confidence: 0.7, statement: (s) => `Spelled words by their sounds${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'writing.compose',
    pattern: /\b(wrote|write|writing|dictated) (a |an |her own |the )?(sentences?|story|note|letter to|card|list|poem|caption|journal)\b/i,
    label: () => 'Writing',
    skills: [
      {
        skillId: 'write.composing',
        confidence: 0.75,
        statement: (s, m) => `Composed a ${clause(m, 3).replace(/ to$/, '')}${m[1]?.toLowerCase() === 'dictated' ? ' by dictation' : ''}${indepPhrase(s.independence)}.`,
      },
      {
        skillId: 'write.sentences',
        confidence: 0.55,
        when: /\b(wrote|write|writing) (a |an |her own |the )?(sentences?|story|note|letter|card|poem|caption|journal)\b/i,
        statement: (s) => `Wrote complete sentences${indepPhrase(s.independence)}.`,
      },
    ],
  },
  // ── Math ────────────────────────────────────────────────────────────────
  {
    id: 'math.count',
    pattern: new RegExp(`\\bcount(?:ed|ing|s)?\\s+(?:out\\s+|up\\s+|to\\s+|all\\s+)?(?:the\\s+)?(${NUM})(?:\\s+([a-z]+))?`, 'i'),
    skills: [
      {
        skillId: 'math.count-10',
        confidence: 0.85,
        statement: (s, m) => `Counted ${clause(m, 1)}${m[2] ? ` ${clause(m, 2)}` : ''}${indepPhrase(s.independence ?? 'independent')} (one-to-one counting).`,
      },
    ],
  },
  {
    id: 'math.skipCount',
    pattern: /\b(skip[- ]count\w*|count(?:ed|ing)? by (tens|10s|fives|5s|twos|2s)|counted to (a hundred|one hundred|100))\b/i,
    skills: [
      { skillId: 'math.count-100', confidence: 0.8, statement: (s, m) => `${cap(clause(m, 1))}${indepPhrase(s.independence)}.` },
    ],
  },
  {
    id: 'math.measure',
    pattern: /\b(measur(?:ed|ing|e)|cups?|tablespoons?|teaspoons?|tbsp|tsp|ruler|tape measure|inches|centimeters|weigh(?:ed|ing)?|kitchen scale)\b/i,
    label: () => null,
    skills: [
      {
        skillId: 'math.measure-units',
        confidence: 0.85,
        statement: (s) => `Measured with standard units${s.measurementsText ? ` (${s.measurementsText})` : ''}${indepPhrase(s.independence ?? 'independent')}.`,
      },
    ],
  },
  {
    id: 'math.compareAttr',
    pattern: /\b(longer|shorter|taller|heavier|lighter|biggest|smallest|compared (the )?(size|length|weight))\b/i,
    notIn: ['reading'],
    skills: [{ skillId: 'math.measure-compare', confidence: 0.6, statement: (s) => `Compared objects by a measurable attribute${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.addSub',
    pattern: /\b(add(?:ed|ing)?|plus|altogether|in all|how many (?:were )?left|subtract\w*|minus|take away|took away|more makes|equals)\b/i,
    skills: [
      {
        skillId: 'math.add-10',
        confidence: 0.7,
        statement: (s, m) => `Solved an addition/subtraction problem (${clause(m, 1)})${indepPhrase(s.independence ?? 'independent')}.`,
      },
    ],
  },
  {
    id: 'math.moreLess',
    pattern: /\b(more than|fewer than|less than|which (?:pile|group|one) had more|the same amount)\b/i,
    notIn: ['reading'],
    skills: [{ skillId: 'math.compare', confidence: 0.55, statement: (s) => `Compared quantities (more/fewer/same)${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.money',
    pattern: /\b(coins?|penn(?:y|ies)|nickels?|dimes?|quarters?|dollars?|cents?|piggy bank|cash register|paid (?:for|the)|play(?:ed)? store)\b/i,
    exclude: /\bquarter (of|past|to)\b/i,
    label: () => 'Money play',
    skills: [
      { skillId: 'math.money', confidence: 0.7, statement: (s) => `Worked with coins/money${indepPhrase(s.independence)}.` },
      { skillId: 'life.money-sense', confidence: 0.55, statement: () => 'Explored buying, saving or sharing money.' },
    ],
  },
  {
    id: 'math.shapes',
    pattern: /\b(shapes?|triangles?|circles?|squares?|rectangles?|hexagons?|ovals?|cubes?|spheres?|cylinders?|pentagons?|diamonds?)\b/i,
    notIn: ['reading'],
    skills: [{ skillId: 'math.shapes', confidence: 0.7, statement: (s, m) => `Identified shapes (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.fractions',
    pattern: /\b(halves|in half|fourths|quarters of|thirds|fractions?|equal (?:parts|pieces|shares))\b/i,
    exclude: /\bhalf an hour|half-hour\b/i,
    skills: [{ skillId: 'math.fractions', confidence: 0.6, statement: (s, m) => `Worked with equal parts (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.patterns',
    pattern: /\b(patterns?|ab pattern|abc pattern|repeating)\b/i,
    skills: [{ skillId: 'math.patterns', confidence: 0.7, statement: (s) => `Recognized/extended a pattern${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.time',
    pattern: /\b(clock|o'?clock|what time it (?:is|was)|telling time|half past)\b/i,
    skills: [{ skillId: 'math.time', confidence: 0.7, statement: (s) => `Read time on a clock${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.sorting',
    pattern: /\b(sort(?:ed|ing)?|tally|graph(?:ed)?|bar chart|categori[sz]ed|grouped (?:them )?by)\b/i,
    skills: [
      { skillId: 'math.data', confidence: 0.65, statement: (s) => `Sorted objects into categories and counted each group${indepPhrase(s.independence)}.` },
      { skillId: 'reason.classifying', confidence: 0.55, statement: () => 'Classified objects by their attributes.' },
    ],
  },
  {
    id: 'math.share',
    pattern: /\b(shared? (?:them |it )?(?:out )?(?:equally|fairly|evenly)|split (?:them |it )?(?:evenly|equally)|even (?:or|and) odd|odd (?:or|and) even|fair shares?)\b/i,
    skills: [{ skillId: 'math.equal-shares', confidence: 0.75, statement: (s, m) => `Shared a quantity equally (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.groups',
    pattern: /\b(groups of|rows of|times|multipl\w+|arrays?)\b/i,
    notIn: ['reading'],
    exclude: /\b(many times|some times|sometimes|two times a|at times|times when)\b/i,
    skills: [{ skillId: 'math.equal-groups', confidence: 0.55, statement: (s, m) => `Worked with equal groups (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'math.placeValue',
    pattern: /\b(tens and ones|place value|bundles? of ten)\b/i,
    skills: [{ skillId: 'math.place-value', confidence: 0.7, statement: (s) => `Worked with tens and ones${indepPhrase(s.independence)}.` }],
  },
  // ── Science ─────────────────────────────────────────────────────────────
  {
    id: 'science.plants',
    pattern: /\b(planted|planting|plants?|seeds?|sprout\w*|garden(?:ed|ing)?|soil|seedlings?|bulbs?|roots|germinat\w*|photosynthesis|watered the)\b/i,
    notIn: ['reading'],
    topics: ['plants'],
    label: (_s, m) => (/garden|plant/i.test(m[1] ?? '') ? 'Gardening' : null),
    skills: [
      { skillId: 'sci.plants', confidence: 0.8, statement: (s, m) => `Explored how plants grow (${clause(m, 1)})${indepPhrase(s.independence)}.` },
    ],
  },
  {
    id: 'science.animals',
    pattern: /\b(birds?|squirrels?|bugs?|insects?|butterfl(?:y|ies)|caterpillars?|worms?|ants?|bees?|spiders?|frogs?|toads?|deer|rabbits?|ducks?|geese|fish|snails?|ladybugs?|beetles?|animals?|chickens?|chipmunks?|owls?|nest|animal tracks|wildlife)\b/i,
    notIn: ['reading', 'cooking'],
    topics: ['animals'],
    skills: [
      { skillId: 'sci.animals', confidence: 0.65, statement: (s, m) => `Observed living things (${clause(m, 1)})${indepPhrase(s.independence)}.` },
    ],
  },
  {
    id: 'science.lifeCycles',
    pattern: /\b(life cycles?|hatch\w*|cocoon|chrysalis|tadpoles?|metamorphosis|larvae?)\b/i,
    notIn: ['cooking'],
    topics: ['animals'],
    skills: [{ skillId: 'sci.life-cycles', confidence: 0.65, statement: (s) => `Learned about life cycles and growth${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.natureWalk',
    pattern: /\b(nature walk|hike|hiked|hiking|trail|woods|forest|pond|creek|stream|meadow|nature center|explored outside|backyard exploring)\b/i,
    topics: ['nature'],
    label: () => 'Nature walk',
    skills: [
      { skillId: 'sci.observe', confidence: 0.65, statement: (s) => `Made careful observations outdoors${indepPhrase(s.independence)}.` },
      { skillId: 'sci.habitats', confidence: 0.45, statement: () => 'Explored a natural habitat and the living things in it.' },
    ],
  },
  {
    id: 'science.dinosaurs',
    pattern: /\b(dinosaurs?|fossils?|t\.? ?rex|tyrannosaurus|triceratops|stegosaurus|brachiosaurus|paleontolog\w*|extinct)\b/i,
    topics: ['dinosaurs'],
    skills: [{ skillId: 'sci.fossils', confidence: 0.7, statement: (s, m) => `Explored fossils and ancient life (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.space',
    pattern: /\b(moon|stars?|planets?|space|astronauts?|telescope|constellations?|solar system|mars|jupiter|saturn|venus|orbit|galaxy|comets?|meteors?|eclipse|planetarium)\b/i,
    exclude: /\bstar stickers?|gold star|star-shaped|star cookies?\b/i,
    notIn: ['reading'],
    topics: ['space'],
    label: () => 'Space exploration',
    skills: [{ skillId: 'sci.sky', confidence: 0.75, statement: (s, m) => `Explored the sky and space (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.weather',
    pattern: /\b(weather|raining|rained|snow(?:ed|ing|man)?|clouds?|windy|thermometer|temperature|seasons?|rainbow|puddles?|thunder|lightning)\b/i,
    notIn: ['reading', 'art'],
    topics: ['weather'],
    skills: [{ skillId: 'sci.weather', confidence: 0.6, statement: (s, m) => `Observed weather (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.changes',
    pattern: /\b(melt(?:ed|ing|s)?|freez(?:e|ing)|froze|boil(?:ed|ing)?|get bigger in the oven|got bigger|rise|rising|rose|dissolv\w*|evaporat\w*|turned (?:into|brown|solid|liquid))\b/i,
    topics: ['changes'],
    skills: [
      { skillId: 'sci.changes', confidence: 0.6, kind: 'exposure', statement: (_s, m) => `Noticed materials changing with heating/cooling (${clause(m, 1)}).` },
    ],
  },
  {
    id: 'science.experiment',
    pattern: /\b(experiment\w*|hypothes\w*|predicted|prediction|tested (?:whether|if|which)|investigat\w*|magnifying glass|microscope|observed|observations?)\b/i,
    label: () => 'Science experiment',
    skills: [
      { skillId: 'sci.predict', confidence: 0.65, when: /\bpredict/i, statement: (s) => `Made a prediction and tested it${indepPhrase(s.independence)}.` },
      { skillId: 'sci.observe', confidence: 0.65, statement: (s) => `Made careful scientific observations${indepPhrase(s.independence)}.` },
    ],
    notIn: ['reading'],
  },
  {
    id: 'science.materials',
    pattern: /\b(sink|sank|sinks|float(?:ed|s|ing)?|magnet(?:s|ic)?|absorb\w*|waterproof|made of (?:wood|metal|plastic|glass))\b/i,
    notIn: ['reading'],
    topics: ['water'],
    skills: [{ skillId: 'sci.materials', confidence: 0.7, statement: (s, m) => `Investigated material properties (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.forces',
    pattern: /\b(ramps?|rolled (?:it |the \w+ )?down|push(?:ed)? and pull|gravity|swings?|slides?|momentum)\b/i,
    notIn: ['reading'],
    skills: [{ skillId: 'sci.forces', confidence: 0.55, statement: (s) => `Explored pushes, pulls and motion${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.soundLight',
    pattern: /\b(shadows?|echo(?:es)?|vibrat\w*|prism|flashlight|rubber-band guitar)\b/i,
    notIn: ['reading'],
    skills: [{ skillId: 'sci.sound-light', confidence: 0.55, statement: (s, m) => `Explored sound or light (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.question',
    pattern: /\b(?:asked|wondered|wanted to know)\s+(?:me\s+|us\s+)?((?:why|how|what|where|whether|if)\b[^.?!;]*)/i,
    notIn: ['reading'],
    skills: [
      { skillId: 'sci.questions', confidence: 0.8, statement: (_s, m) => `Asked a scientific question: “${cap(clause(m, 1))}?”` },
    ],
  },
  {
    id: 'science.earthMaterials',
    pattern: /\b(rocks?|stones?|pebbles?|minerals?|crystals?|sand|mud|soil samples?)\b/i,
    onlyIn: ['nature', 'science'],
    topics: ['nature'],
    skills: [{ skillId: 'sci.earth-materials', confidence: 0.5, statement: (s) => `Examined earth materials (rocks, soil or sand)${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'science.engineer',
    pattern: /\b(built|build(?:ing)?|lego|blocks tower|tower|bridge|fort|designed|engineer\w*|invent\w*|marble run)\b/i,
    notIn: ['reading', 'cooking'],
    label: () => 'Building project',
    skills: [
      { skillId: 'sci.engineer', confidence: 0.65, statement: (s, m) => `Designed and built something (${clause(m, 1)})${indepPhrase(s.independence)}.` },
      { skillId: 'art.making', confidence: 0.4, statement: () => 'Created a three-dimensional construction.' },
    ],
  },
  // ── Life skills ─────────────────────────────────────────────────────────
  {
    id: 'life.cooking',
    pattern: /\b(bak(?:e|ed|ing)|cook(?:ed|ing)?|recipe|kitchen|stirr?(?:ed|ing)?|cracked (?:the )?eggs?|dough|knead\w*|muffins?|bread|cookies|pancakes|made (?:lunch|dinner|breakfast|a snack|soup))\b/i,
    assume: 'supported',
    label: (s) => {
      const dish = s.lower.match(/\b(?:baked|bake|baking|made|cooked|cooking)\s+(?:some\s+|a\s+|the\s+|homemade\s+)?(banana bread|muffins|bread|cookies|pancakes|soup|pizza|cake|cupcakes|biscuits|granola|dinner|lunch)\b/);
      return dish ? `Baking ${dish[1]}` : 'Cooking together';
    },
    skills: [
      { skillId: 'life.cooking', confidence: 0.8, statement: (s) => `Helped prepare food in the kitchen${indepPhrase(s.independence ?? 'supported')}.` },
    ],
  },
  {
    id: 'life.chores',
    pattern: /\b(chores?|laundry|set the table|clean(?:ed)? (?:up|her room)|tid(?:y|ied) (?:up)?|folded|swept|vacuum\w*|fed the (?:dog|cat|fish|chickens)|unloaded the dishwasher)\b/i,
    label: () => 'Helping at home',
    skills: [{ skillId: 'life.chores', confidence: 0.75, statement: (s, m) => `Contributed to the household (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'life.selfCare',
    pattern: /\b(dressed herself|got dressed|brushed (?:her )?teeth|tied (?:her )?shoes|buttoned|zipped (?:up )?(?:her )?(?:coat|jacket)|washed (?:her )?hands)\b/i,
    skills: [{ skillId: 'life.self-care', confidence: 0.8, statement: (s, m) => `Self-care: ${clause(m, 1)}${indepPhrase(s.independence ?? 'independent')}.` }],
  },
  {
    id: 'life.emotions',
    pattern: /\b(frustrated|calm(?:ed)? (?:herself )?down|deep breaths?|named (?:her )?feelings?|proud of herself|felt nervous|big feelings)\b/i,
    notIn: ['reading'],
    skills: [{ skillId: 'life.emotions', confidence: 0.6, statement: (_s, m) => `Worked through feelings (${clause(m, 1)}).` }],
  },
  {
    id: 'life.kindness',
    pattern: /\b(helped (?:her |his )?(?:sister|brother|friend|georgia|grandma|grandpa|neighbor)|comforted|made a card for|thank-you note|shared (?:her |his )?(?:toys?|snack|crayons))\b/i,
    skills: [{ skillId: 'life.kindness', confidence: 0.65, statement: (_s, m) => `Showed kindness (${clause(m, 1)}).` }],
  },
  // ── Creativity ──────────────────────────────────────────────────────────
  {
    id: 'art.drawing',
    pattern: /\b(paint(?:ed|ing)?|drew|draw(?:ing)?|colou?red|crayons?|markers|watercolou?rs?|sketch(?:ed|ing)?|artwork|self-portrait|portrait)\b/i,
    notIn: ['reading'],
    topics: ['art'],
    label: (_s, m) => (/paint|watercolou?r/i.test(m[1] ?? '') ? 'Painting' : 'Drawing'),
    skills: [{ skillId: 'art.drawing', confidence: 0.8, statement: (s, m) => `Created art (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'art.color',
    pattern: /\b(mix(?:ed|ing)? (?:the )?(?:paint )?colou?rs?|made (?:purple|green|orange|brown|pink)|colou?r mixing)\b/i,
    topics: ['art'],
    skills: [{ skillId: 'art.color', confidence: 0.75, statement: (s, m) => `Explored color mixing (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'art.making',
    pattern: /\b(craft(?:ed|s|ing)?|glued?|scissors|cut out|collage|clay|sculpt\w*|play-?doh|papier|origami)\b/i,
    topics: ['art'],
    label: () => 'Craft project',
    skills: [{ skillId: 'art.making', confidence: 0.65, statement: (s, m) => `Made a craft (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'art.music',
    pattern: /\b(sang|sing(?:ing)?|songs?|music|piano|drums?|drummed|instruments?|rhythm|kept the beat|danc(?:ed|ing))\b/i,
    label: () => 'Music',
    skills: [{ skillId: 'art.music', confidence: 0.75, statement: (s, m) => `Made music (${clause(m, 1)})${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'art.storytelling',
    pattern: /\b(made up (?:a|her own) story|told (?:me |us )?(?:a|her own) story|invented a story|puppet show|acted out)\b/i,
    skills: [{ skillId: 'art.storytelling', confidence: 0.7, statement: (_s, m) => `Invented and told an original story (${clause(m, 1)}).` }],
  },
  // ── Reasoning ───────────────────────────────────────────────────────────
  {
    id: 'reason.sequence',
    pattern: /\b(in order|put (?:the )?\w+ in order|sequenc\w*|first,? .{2,40}? then)\b/i,
    skills: [{ skillId: 'reason.sequencing', confidence: 0.55, statement: (s) => `Put events or steps in order${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'reason.puzzles',
    pattern: /\b(puzzles?|mazes?|riddles?|logic game|tangrams?)\b/i,
    label: () => 'Puzzles',
    skills: [{ skillId: 'reason.persistence', confidence: 0.6, statement: (s, m) => `Worked through ${clause(m, 1)}${indepPhrase(s.independence)}.` }],
  },
  {
    id: 'reason.persistence',
    pattern: /\b(kept trying|didn'?t give up|tried again|persever\w*|stuck with it|tried (?:a )?different (?:way|strategy))\b/i,
    skills: [{ skillId: 'reason.persistence', confidence: 0.8, statement: (_s, m) => `Showed persistence (${clause(m, 1)}).` }],
  },
  {
    id: 'reason.causeEffect',
    pattern: /\b(because|what would happen if|so that|that'?s why)\b/i,
    onlyIn: ['science', 'nature', 'cooking'],
    skills: [{ skillId: 'reason.cause-effect', confidence: 0.45, statement: (s) => `Reasoned about cause and effect${indepPhrase(s.independence)}.` }],
  },
  // ── Field trips (topics & labels only) ──────────────────────────────────
  {
    id: 'trip.place',
    pattern: /\b(museum|zoo|aquarium|library|farm|science center|planetarium|botanical garden|arboretum)\b/i,
    notIn: ['reading'],
    label: (_s, m) => `Trip to the ${clause(m, 1)}`,
    topics: [],
    skills: [
      { skillId: 'sci.observe', confidence: 0.45, when: /\b(zoo|aquarium|farm|science center|planetarium|botanical|arboretum|museum)\b/i, statement: (_s, m) => `Made observations on a trip to the ${clause(m, 1)}.` },
    ],
  },
];

export const TRIP_TOPICS: Record<string, string[]> = {
  zoo: ['animals'],
  aquarium: ['animals', 'ocean'],
  farm: ['animals'],
  planetarium: ['space'],
  'botanical garden': ['plants'],
  arboretum: ['plants', 'nature'],
};

/** Refines a counting suggestion by magnitude (10 / 20 / 100). */
export function refineCountSkill(m: RegExpMatchArray): string {
  const n = parseNumber(m[1] ?? '') ?? 0;
  return countSkill(n);
}

export const NATURE_ITEMS: [RegExp, string][] = [
  [/\b(leaf|leaves)\b/i, 'leaf'],
  [/\bacorns?\b/i, 'acorn'],
  [/\bpine ?cones?\b/i, 'pinecone'],
  [/\bfeathers?\b/i, 'feather'],
  [/\b(rocks?|stones?|pebbles?)\b/i, 'rock'],
  [/\b(sea)?shells?\b/i, 'shell'],
  [/\b(flowers?|wildflowers?|dandelions?)\b/i, 'flower'],
  [/\b(sticks?|twigs?)\b/i, 'stick'],
  [/\bmushrooms?\b/i, 'mushroom'],
  [/\b(seed pods?|seeds?|milkweed)\b/i, 'seed'],
  [/\bmoss\b/i, 'moss'],
  [/\bberr(y|ies)\b/i, 'berry'],
  [/\bbark\b/i, 'bark'],
];

export const FOLLOW_UPS: Record<string, string> = {
  'sci.changes': 'Try a yeast balloon: warm water, sugar and yeast in a bottle with a balloon on top. Watch gas inflate it — the same thing that makes dough rise.',
  'sci.questions': 'Add today’s question to a “wonder wall” and investigate it together this week.',
  'math.measure-units': 'Next time, double the recipe together — 2 cups becomes 4 cups (early multiplication hiding in the kitchen).',
  'math.count-20': 'Count objects into groups of ten (egg cartons work great) to bridge toward place value.',
  'math.count-10': 'Play “grab and count”: grab a handful of pasta and count to check a guess.',
  'math.money': 'Set up a pretend store with price tags under 20¢ and real coins.',
  'read.retell': 'Keep a narration notebook: write down her retelling after each chapter and reread it together later.',
  'read.inference': 'Ask one “why do you think…?” question per chapter whose answer isn’t written on the page.',
  'read.feelings': 'Make a feelings chart for the main character as the story unfolds.',
  'read.chapter-stamina': 'Before each chapter, have her recap where the story left off (a quick oral narration).',
  'read.procedural': 'Let her read the next recipe from start to finish and be “head chef” for the steps.',
  'sci.plants': 'Start a bean-in-a-jar experiment so she can watch roots and shoots grow day by day.',
  'sci.observe': 'Bring a magnifying glass and a small sketchbook on the next walk to draw one discovery in detail.',
  'sci.habitats': 'Compare two habitats — lawn vs. woods — by counting different living things in a hula-hoop patch.',
  'sci.sky': 'Start a moon journal: sketch the moon each clear night for two weeks.',
  'sci.fossils': 'Make salt-dough “fossils” with shells and leaves, then dig them out of a sand bin.',
  'art.drawing': 'Hang today’s artwork and ask her to tell the story behind it — a great narration moment.',
  'sci.engineer': 'Challenge: build a bridge from 20 blocks that can hold a toy car.',
  'life.cooking': 'Give her one “real job” in every meal this week: washing, measuring or stirring.',
  'write.composing': 'Mail a dictated letter to a grandparent — real audiences make writing meaningful.',
};
