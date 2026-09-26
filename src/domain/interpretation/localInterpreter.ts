/**
 * LocalHeuristicInterpreter — on-device, deterministic narrative → evidence.
 *
 * Pipeline: split sentences → detect context (reading/cooking/nature…) with
 * carry-over → detect independence/struggle/hedge cues → run the rule lexicon
 * → extract books, measurements, nature finds, questions, quotes, duration and
 * date → merge per skill → compose title and follow-ups.
 *
 * It is intentionally conservative: every suggestion is shown to the parent
 * for review before anything is saved.
 */
import { getSkill, type DomainId } from '../curriculum';
import { findCatalogTitleInText } from '../reading/bookMetadata';
import type { Independence } from '../types';
import { addDays, parseDay, toDay } from '../util/time';
import {
  FOLLOW_UPS,
  NATURE_ITEMS,
  RULES,
  TRIP_TOPICS,
  refineAddSubSkill,
  refineCountSkill,
  type Rule,
  type SentenceContext,
  type SentenceInfo,
} from './lexicon';
import { NUMBER_WORD_PATTERN, numbersIn, parseNumber } from './numbers';
import {
  ACCEPT_THRESHOLD,
  type ActivityInterpretation,
  type ActivityInterpretationService,
  type BookMention,
  type InterpretationContext,
  type Measurement,
  type SkillSuggestion,
  type SuggestionOutcome,
} from './types';

export const LOCAL_INTERPRETER_VERSION = '1.2.0';

const CONTEXT_CUES: [SentenceContext, RegExp][] = [
  ['cooking', /\b(bak(e|ed|ing)|cook(ed|ing)?|recipe|kitchen|muffins?|bread|cookies|dough|oven|flour|pancakes)\b/i],
  ['nature', /\b(nature walk|hike|hiked|hiking|trail|woods|forest|park|backyard|pond|creek|outside|garden(ing)?)\b/i],
  ['art', /\b(paint(ed|ing)?|drew|draw(ing)?|craft|collage|clay|watercolou?r)\b/i],
  ['science', /\b(experiment\w*|science|investigat\w*|magnif\w*|microscope|sink|float)\b/i],
  ['math', /\b(math|count(ed|ing)?|add(ed|ing)?|subtract\w*|numbers?|coins?|shapes?|measur\w*)\b/i],
  ['reading', /\b(read|reading|reread|chapters?|book|story|stories|pages?)\b/i],
];

const INDEPENDENT_CUES =
  /\b(by herself|by himself|on her own|on his own|independently|without (?:any )?help|all by herself|herself|himself|without prompting|without hints?|unprompted)\b/i;
const SUPPORTED_CUES =
  /\b(with (?:a little |some |a bit of )?help|with (?:some )?prompting|with (?:a )?hints?|with support|i helped (?:her|him)|we helped|helped her (?:sound|count|read|measure)|together|with me)\b/i;
const ASSISTED_CUES = /\b(i read (?:it |them )?(?:aloud )?to (?:her|him)|hand over hand|i did most|she watched me|he watched me)\b/i;
const EXPOSURE_CUES = /\b(talked about|learned about|watched (?:a )?(?:video|show|documentary)|listened to|we discussed|showed her|showed him)\b/i;
const STRUGGLE_CUES =
  /\b(struggled|had trouble|found it hard|wasn'?t able|couldn'?t(?: yet)?|could not|not yet able|got frustrated|got stuck|was stuck|stuck on|gave up|didn'?t get it|mixed up|was confused|needed lots of help)\b/i;
const HEDGE_CUES = /\b(tried to|sort of|kind of|almost|a little bit|partly|mostly)\b/i;
const AFFIRM_CUES = /\b(correctly|accurately|perfectly|exactly right|got it right|right away)\b/i;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=["“A-Z0-9])|;\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function detectContext(lower: string, previous: SentenceContext): SentenceContext {
  // Procedural reading (recipes) belongs to the cooking context.
  if (/\bread\b[^.]*\b(recipe|steps|directions|instructions)\b/.test(lower)) return 'cooking';
  for (const [ctx, re] of CONTEXT_CUES) if (re.test(lower)) return ctx;
  return previous;
}

function detectIndependence(lower: string): Independence | null {
  if (ASSISTED_CUES.test(lower)) return 'assisted';
  if (INDEPENDENT_CUES.test(lower)) return 'independent';
  if (SUPPORTED_CUES.test(lower)) return 'supported';
  return null;
}

const MEASURE_RE = new RegExp(
  `\\b(${NUMBER_WORD_PATTERN})\\s+(cups?|tablespoons?|tbsps?|teaspoons?|tsps?|inches|inch|feet|foot|ounces?|oz|pounds?|lbs?|grams?|liters?|milliliters?|ml|centimeters?|cm|meters?)\\b(?:\\s+of)?(?:\\s+(?:the\\s+)?([a-z]+))?`,
  'gi',
);

function extractMeasurements(text: string): Measurement[] {
  const out: Measurement[] = [];
  for (const m of text.matchAll(MEASURE_RE)) {
    const q = parseNumber(m[1] ?? '');
    if (q === null) continue;
    // "counted 12 cups" is counting, not measuring.
    const before = text.slice(Math.max(0, (m.index ?? 0) - 14), m.index ?? 0).toLowerCase();
    if (/count(ed|ing|s)?\s+(out\s+|up\s+|all\s+)?(the\s+)?$/.test(before)) continue;
    const item = m[3] && !/^(and|then|with|to|in|for|she|he|it)$/.test(m[3]) ? m[3] : undefined;
    out.push({ quantity: q, unit: (m[2] ?? '').toLowerCase(), ...(item ? { item } : {}), text: m[0].replace(/\s+(and|then)$/, '') });
  }
  return out;
}

function extractDuration(text: string): number | undefined {
  const lower = text.toLowerCase();
  if (/\bhalf an hour\b/.test(lower)) return 30;
  const m = lower.match(new RegExp(`\\b(?:for|about|around|spent|took|nearly|almost)\\s+(${NUMBER_WORD_PATTERN})\\s*(hours?|hrs?|minutes?|mins?)\\b`));
  if (m) {
    const n = parseNumber(m[1] ?? '');
    if (n !== null) return Math.round(/^h/.test(m[2] ?? '') ? n * 60 : n);
  }
  if (/\b(an|one) hour\b/.test(lower)) return 60;
  return undefined;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function extractDate(text: string, today: string): string {
  const lower = text.toLowerCase();
  if (/\b(yesterday|last night)\b/.test(lower)) return addDays(today, -1);
  const wd = lower.match(/\b(?:on|last) (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1] ?? '');
    const d = parseDay(today);
    let delta = (d.getDay() - target + 7) % 7;
    if (delta === 0 && lower.includes('last ')) delta = 7;
    d.setDate(d.getDate() - delta);
    return toDay(d);
  }
  return today;
}

function extractNatureItems(sentences: SentenceInfo[]): string[] {
  const items: string[] = [];
  for (const s of sentences) {
    const natureish = s.context === 'nature' || /\b(collected|found|picked up|gathered|brought home)\b/i.test(s.lower);
    if (!natureish) continue;
    for (const [re, id] of NATURE_ITEMS) {
      const m = s.text.match(new RegExp(`\\b(${NUMBER_WORD_PATTERN})?\\s*${re.source}`, 'i'));
      if (!m) continue;
      const n = m[1] ? Math.min(3, Math.max(1, Math.round(parseNumber(m[1]) ?? 1))) : 1;
      for (let i = 0; i < n; i++) items.push(id);
    }
  }
  return items.slice(0, 12);
}

function extractQuotes(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:said|asked|told (?:me|us)|exclaimed|announced|shouted|whispered)[,:]?\s*["“]([^"”]{3,160})["”]/gi)) {
    if (m[1]) out.add(m[1].trim());
  }
  for (const m of text.matchAll(/["“]([^"”]{3,160})["”],?\s*(?:she|he|izzy|georgia) (?:said|asked|told)/gi)) {
    if (m[1]) out.add(m[1].trim());
  }
  return [...out];
}

function extractQuestions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:asked|wondered|wanted to know)\s+(?:me\s+|us\s+)?((?:why|how|what|where|whether|if)\b[^.?!;]*)/gi)) {
    const q = (m[1] ?? '').trim();
    if (q.length > 4) out.push(q.charAt(0).toUpperCase() + q.slice(1) + '?');
  }
  return out;
}

function extractBooks(sentences: SentenceInfo[], context: InterpretationContext): BookMention[] {
  const mentions = new Map<string, BookMention>();
  const known = context.knownBooks;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (const s of sentences) {
    const lowerNorm = norm(s.text);
    let title: string | undefined;
    let author: string | undefined;
    let catalogId: string | undefined;
    let existingBookId: string | undefined;

    const knownHit = known
      .filter((b) => {
        const t = norm(b.title);
        const shortT = t.replace(/^the /, '');
        return (t.length >= 5 && lowerNorm.includes(t)) || (shortT.length >= 8 && lowerNorm.includes(shortT));
      })
      .sort((a, b) => b.title.length - a.title.length)[0];
    if (knownHit) {
      title = knownHit.title;
      author = knownHit.author;
      existingBookId = knownHit.id;
      catalogId = knownHit.catalogId;
    } else {
      const cat = findCatalogTitleInText(s.text);
      if (cat) {
        title = cat.title;
        author = cat.author;
        catalogId = cat.id;
      } else {
        const quoted = s.text.match(/\bread(?:ing)?\s+(?:the book\s+|a book called\s+)?["“]([^"”]{3,80})["”]/i);
        const titled = s.text.match(
          /\bread(?:ing)?\s+(?:the book\s+|a book called\s+)?((?:[A-Z][\w’'!?-]*)(?:\s+(?:[A-Z][\w’'!?-]*|of|the|and|a|an|to|in|on|at))*\s+[A-Z][\w’'!?-]*)/,
        );
        title = quoted?.[1] ?? titled?.[1];
      }
    }
    if (!title) continue;
    s.bookTitle = title;

    const chapters = s.text.match(new RegExp(`\\b(${NUMBER_WORD_PATTERN})\\s+chapters?\\b`, 'i'));
    const pages = s.text.match(new RegExp(`\\b(${NUMBER_WORD_PATTERN})\\s+pages?\\b`, 'i'));
    const completed = /\b(finished|completed|read the (?:whole|entire|last)|reached the end|the last chapter)\b/i.test(s.text);
    const mode: BookMention['mode'] = /\b(read|reading) (?:it |them |aloud |out loud )?to (?:her|him)\b|\bi read\b/i.test(s.text)
      ? 'read_aloud'
      : /\b(we read|together|took turns)\b/i.test(s.text)
        ? 'shared'
        : 'independent';

    const key = title.toLowerCase();
    const prev = mentions.get(key);
    const chaptersRead = chapters ? (parseNumber(chapters[1] ?? '') ?? undefined) : prev?.chaptersRead;
    const pagesRead = pages ? (parseNumber(pages[1] ?? '') ?? undefined) : prev?.pagesRead;
    mentions.set(key, {
      title,
      ...(author ? { author } : {}),
      ...(catalogId ? { catalogId } : {}),
      ...(existingBookId ? { existingBookId } : {}),
      ...(chaptersRead !== undefined ? { chaptersRead: Math.round(chaptersRead) } : {}),
      ...(pagesRead !== undefined ? { pagesRead: Math.round(pagesRead) } : {}),
      completed: completed || prev?.completed === true,
      mode: prev?.mode ?? mode,
      excerpt: prev ? `${prev.excerpt} ${s.text}` : s.text,
    });
  }
  return [...mentions.values()];
}

/** Independence cue in the clause containing a match (clauses split on commas / "and she"). */
function clauseIndependence(sentence: string, index: number): Independence | null {
  const bounds = [0];
  for (const m of sentence.matchAll(/,\s*(?:and\s+|then\s+)?|\s+and\s+(?=(?:she|he|then|later|we|i)\b)|\s+then\s+/gi)) {
    bounds.push((m.index ?? 0) + m[0].length);
  }
  bounds.push(sentence.length + 1);
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i] ?? 0;
    const end = bounds[i + 1] ?? sentence.length;
    if (index >= start && index < end) return detectIndependence(sentence.slice(start, end).toLowerCase());
  }
  return null;
}

/**
 * "Read a book about how seeds sprout" is reading *to learn about* a topic, so
 * topic rules (plants, space, dinosaurs…) may fire even in a reading context.
 * Plain story sentences ("Wilbur was scared") still don't trigger them.
 */
const LEARNING_ABOUT = /\b(?:books?|stor(?:y|ies)|read|reading|video|documentary|learned|learning)\s+(?:all\s+|a lot\s+)?about\b|\bnon-?fiction\b/i;

function ruleApplies(rule: Rule, s: SentenceInfo): RegExpMatchArray | null {
  if (rule.onlyIn && !rule.onlyIn.includes(s.context)) return null;
  const aboutTopic = s.context === 'reading' && !!rule.topics?.length && LEARNING_ABOUT.test(s.text);
  if (rule.notIn && rule.notIn.includes(s.context) && !aboutTopic) return null;
  if (rule.exclude && rule.exclude.test(s.text)) return null;
  return s.text.match(rule.pattern);
}

function outcomeFor(kind: SkillSuggestion['kind'], independence: Independence, struggled: boolean, helpedAfter = false): SuggestionOutcome {
  if (kind === 'exposure') return 'exposure';
  // "Got stuck, so we used blocks together" → succeeded with support, not mastery.
  if (struggled) return helpedAfter ? 'with_support' : 'not_yet';
  if (independence === 'independent') return 'demonstrated';
  if (independence === 'assisted') return 'exposure';
  return 'with_support';
}

export class LocalHeuristicInterpreter implements ActivityInterpretationService {
  readonly id = 'local-heuristic';
  readonly label = 'On-device interpreter';
  readonly sendsDataOffDevice = false;

  async interpret(narrative: string, context: InterpretationContext): Promise<ActivityInterpretation> {
    return interpretLocally(narrative, context);
  }
}

export function interpretLocally(narrative: string, context: InterpretationContext): ActivityInterpretation {
  const text = narrative.trim();
  const rawSentences = splitSentences(text);
  const measurements = extractMeasurements(text);

  // 1. Sentence analysis with context carry-over.
  let prevContext: SentenceContext = 'general';
  const sentences: SentenceInfo[] = rawSentences.map((sentence) => {
    const lower = sentence.toLowerCase();
    const ctx = detectContext(lower, prevContext);
    prevContext = ctx;
    const localMeasures = measurements.filter((m) => sentence.includes(m.text)).map((m) => m.text);
    return {
      text: sentence,
      lower,
      context: ctx,
      independence: detectIndependence(lower),
      exposureOnly: EXPOSURE_CUES.test(lower) && !/\b(she|he|izzy) (read|counted|measured|wrote|built|drew|painted)\b/i.test(lower),
      struggled: STRUGGLE_CUES.test(lower),
      hedged: HEDGE_CUES.test(lower),
      affirmed: AFFIRM_CUES.test(lower),
      numbers: numbersIn(lower),
      ...(localMeasures.length ? { measurementsText: localMeasures.join(', ') } : {}),
    };
  });

  // Carry a book title forward within a reading passage.
  const books = extractBooks(sentences, context);
  let carryTitle: string | undefined;
  for (const s of sentences) {
    if (s.bookTitle) carryTitle = s.bookTitle;
    else if (s.context === 'reading' && carryTitle) s.bookTitle = carryTitle;
    else if (s.context !== 'reading') carryTitle = undefined;
  }

  // 2. Rules → raw suggestions.
  const bySkill = new Map<string, SkillSuggestion>();
  const topics = new Set<string>();
  const labels: string[] = [];
  const labelledRules = new Set<string>();

  for (const s of sentences) {
    for (const rule of RULES) {
      const m = ruleApplies(rule, s);
      if (!m) continue;
      for (const t of rule.topics ?? []) topics.add(t);
      if (rule.id === 'trip.place') for (const t of TRIP_TOPICS[(m[1] ?? '').toLowerCase()] ?? []) topics.add(t);
      const label = labelledRules.has(rule.id) ? null : rule.label?.(s, m);
      if (label && !labels.includes(label)) {
        labels.push(label);
        labelledRules.add(rule.id);
      }

      for (const rs of rule.skills) {
        if (rs.when && !rs.when.test(s.text)) continue;
        const skillId = rule.id === 'math.count' ? refineCountSkill(m) : rule.id === 'math.addSub' ? refineAddSubSkill(s.text) : rs.skillId;
        const skill = getSkill(skillId);
        if (!skill) continue;
        const kind = s.exposureOnly ? 'exposure' : (rs.kind ?? 'performance');
        // Prefer the cue in the matching clause; whole-sentence cues only when
        // the sentence has a single clause (keeps "measured it herself" from
        // leaking onto "and we baked").
        const clauseCue = clauseIndependence(s.text, m.index ?? 0);
        const cue = clauseCue ?? (s.text.includes(',') || / and (she|he|we|i) /i.test(s.text) ? null : s.independence);
        const independence: Independence =
          cue ?? rule.assume ?? (s.struggled ? (SUPPORTED_CUES.test(s.lower) ? 'supported' : 'assisted') : kind === 'exposure' ? 'assisted' : 'independent');
        let confidence = rs.confidence;
        if (cue) confidence += 0.05;
        if (s.affirmed) confidence += 0.05;
        if (s.hedged) confidence -= 0.15;
        confidence = Math.max(0.05, Math.min(0.97, confidence));

        const outcome = outcomeFor(kind, independence, s.struggled, SUPPORTED_CUES.test(s.lower));
        let statement = rs.statement({ ...s, independence: cue ?? rule.assume ?? null }, m);
        // Keep the statement consistent with the outcome — never claim independence that wasn't there.
        if (outcome === 'not_yet') statement = `Working on ${skill.name.toLowerCase()} — not yet: “${s.text.replace(/[.!]+$/, '')}.”`;
        else if (outcome === 'with_support') statement = statement.replace(/ independently\b/, ' with support');
        const suggestion: SkillSuggestion = {
          skillId,
          confidence: Math.round(confidence * 100) / 100,
          kind,
          independence,
          outcome,
          statement,
          excerpt: s.text,
          topics: [...new Set([...(rule.topics ?? []), ...skill.topics])],
          accepted: confidence >= ACCEPT_THRESHOLD,
        };
        const existing = bySkill.get(skillId);
        if (!existing) bySkill.set(skillId, suggestion);
        else {
          const better = suggestion.confidence > existing.confidence ? suggestion : existing;
          bySkill.set(skillId, {
            ...better,
            confidence: Math.round(Math.min(0.97, Math.max(existing.confidence, suggestion.confidence) + 0.05) * 100) / 100,
            excerpt: existing.excerpt === suggestion.excerpt ? existing.excerpt : `${existing.excerpt} … ${suggestion.excerpt}`,
            topics: [...new Set([...existing.topics, ...suggestion.topics])],
            accepted: true,
          });
        }
      }
    }
  }

  // Books imply reading evidence even when phrasing is unusual.
  for (const b of books) {
    if (b.mode === 'read_aloud') continue;
    if (!bySkill.has('read.chapter-stamina') && (b.chaptersRead || b.completed)) {
      bySkill.set('read.chapter-stamina', {
        skillId: 'read.chapter-stamina',
        confidence: 0.7,
        kind: 'performance',
        independence: b.mode === 'independent' ? 'independent' : 'supported',
        outcome: b.mode === 'independent' ? 'demonstrated' : 'with_support',
        statement: `${b.completed ? 'Finished' : 'Read'} ${b.chaptersRead ? `${b.chaptersRead} chapters of ` : ''}${b.title}${b.mode === 'independent' ? ' independently' : ' with a reading partner'}.`,
        excerpt: b.excerpt,
        topics: [],
        accepted: true,
      });
    }
  }

  const skills = [...bySkill.values()].sort((a, b) => b.confidence - a.confidence);

  // 3. Domains (in order of first appearance by confidence).
  const domains: DomainId[] = [];
  for (const s of skills) {
    if (!s.accepted) continue;
    const d = getSkill(s.skillId)?.domainId;
    if (d && !domains.includes(d)) domains.push(d);
  }

  const natureItems = extractNatureItems(sentences);
  if (natureItems.length) topics.add('nature');
  for (const s of skills) for (const t of s.topics) topics.add(t);

  // 4. Title & follow-ups.
  const bookLabel = books[0] && !labels.some((l) => l.includes(books[0]?.title ?? '')) ? `Reading ${books[0].title}` : null;
  const orderedLabels = [...(bookLabel ? [bookLabel] : []), ...labels].filter(
    (l, i, arr) => arr.indexOf(l) === i && !(l === 'Reading time' && arr.some((x) => x.startsWith('Reading '))),
  );
  const title = orderedLabels.slice(0, 2).join(' & ') || fallbackTitle(skills);

  const followUps: string[] = [];
  for (const s of skills) {
    const f = FOLLOW_UPS[s.skillId];
    if (f && !followUps.includes(f)) followUps.push(f);
    if (followUps.length >= 3) break;
  }

  const notes: string[] = [];
  if (skills.length === 0) notes.push('No specific skills recognized — add more detail about what she did, or pick skills manually.');
  if (skills.some((s) => !s.accepted)) notes.push('Lower-confidence suggestions are unchecked — include them if they fit.');

  const duration = extractDuration(text);
  return {
    title,
    date: extractDate(text, context.today),
    ...(duration !== undefined ? { durationMinutes: duration } : {}),
    domains,
    skills,
    topics: [...topics].sort(),
    books,
    measurements,
    natureItems,
    childQuotes: extractQuotes(text),
    questionsAsked: extractQuestions(text),
    followUps,
    provider: { id: 'local-heuristic', version: LOCAL_INTERPRETER_VERSION, label: 'On-device interpreter' },
    notes,
  };
}

function fallbackTitle(skills: SkillSuggestion[]): string {
  const first = skills[0] ? getSkill(skills[0].skillId) : undefined;
  return first ? `${first.name}` : 'Learning moment';
}
