/**
 * Free conversation with a teacher ("Tell Professor Hoot something").
 *
 * Two interchangeable services implement `TeacherChatService`:
 *  • LocalTeacherChat — on-device understanding of the things a young child
 *    actually says about books ("I read daddy the Goodnight Leelanau book",
 *    "I finished Frog and Toad", "Mommy read me Owl at Home") plus warm,
 *    in-character replies. No network. Always available.
 *  • HttpTeacherChat (./chatRemote.ts) — an AI teacher through the family's
 *    own local helper, used only when a parent turns it on and consents. It
 *    falls back to the local service on any problem.
 *
 * Either way the app only *proposes* actions from a reply (e.g. "put this
 * book on your shelf?"); the child confirms with a tap and the parent sees
 * every word in Teacher talk.
 */
import { BOOK_CATALOG, getCatalogBook } from '../reading/bookCatalog';
import { findCatalogTitleInText, searchCatalogSync } from '../reading/bookMetadata';
import type { BookStatus } from '../types';
import { isTeacherId, TEACHER_REGISTRY } from './registry';
import { personalize, pickLine, TEACHERS, type TeacherId } from './teachers';

export type ChatIntent =
  | 'finished_book'
  | 'reading_book'
  | 'read_to_someone'
  | 'was_read_to'
  | 'read_book'
  | 'share'
  | 'question'
  | 'feeling'
  | 'safety'
  | 'unclear';

export const CHAT_INTENTS: readonly ChatIntent[] = [
  'finished_book',
  'reading_book',
  'read_to_someone',
  'was_read_to',
  'read_book',
  'share',
  'question',
  'feeling',
  'safety',
  'unclear',
];

export interface ChatTurn {
  speaker: 'child' | 'teacher';
  text: string;
}

export interface ChatBookRef {
  title: string;
  author?: string;
  catalogId?: string;
  /** Her own book record, when the title matches one on her list. */
  existingBookId?: string;
}

export interface TeacherChatRequest {
  teacherId: TeacherId;
  childName: string;
  utterance: string;
  /** Recent turns in this conversation (oldest first). */
  history: ChatTurn[];
  /** Her books (titles only are ever sent anywhere). */
  books: { id: string; title: string; status: BookStatus }[];
  /** The book this conversation is about so far (for "yes!" / "not yet" answers). Never sent anywhere. */
  topic?: ChatBookRef;
}

export interface TeacherChatReply {
  reply: string;
  intent: ChatIntent;
  book?: ChatBookRef;
  /** Did she finish the book she mentioned? null = unknown, ask her. */
  finished: boolean | null;
  readTo?: string;
  readBy?: string;
  /** Something a grown-up should know about (shown to parents, never to the child). */
  parentNote?: string;
  source: 'local' | 'ai';
}

export interface TeacherChatService {
  readonly id: string;
  readonly sendsDataOffDevice: boolean;
  respond(req: TeacherChatRequest): Promise<TeacherChatReply>;
}

// ─── Understanding ──────────────────────────────────────────────────────────

const PEOPLE =
  '(?:my\\s+)?(?:mommy|mom|momma|mama|mum|mummy|daddy|dad|dada|papa|pop|grandma|grandpa|granny|gran|nana|nanna|nonna|gigi|grammy|poppy|pop pop|georgia|sister|brother|baby|teddy|friends?|family|auntie\\s+\\w+|aunt\\s+\\w+|uncle\\s+\\w+|everyone|my cat|my dog|the cat|the dog)';
const LEAD = '(?:the|a|an|my|this|that)\\s+';
const BOOK_WORD = '(?:\\s+(?:book|story))';
const TAIL_NOISE =
  /\b(?:today|tonight|yesterday|last night|this morning|this afternoon|at bedtime|before bed|all by myself|by myself|all by herself|with (?:my\s+)?\w+|again|too|and it was \w+.*|it was \w+.*)$/i;
const NOT_TITLES = new Set([
  'my',
  'the',
  'a',
  'an',
  'this',
  'that',
  'it',
  'a book',
  'books',
  'book',
  'a story',
  'the book',
  'my book',
  'stories',
  'something',
  'a lot',
  'lots',
  'that',
  'this',
  'them',
  'him',
  'her',
]);
const SMALL_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'at', 'in', 'on', 'to', 'for', 'with', 'or', 'but', 'from', 'by']);

const SAFETY =
  /\b(?:(?:hurt|hit|hits|kicked|pushed|bit|touched|hurts)\s+me|(?:i\s*(?:'m|am)\s+)(?:scared|hurt|sick|lost|bleeding|very sad|so sad)|(?:my\s+\w+|it)\s+hurts?|help me|i\s+(?:got|feel)\s+hurt|nobody\s+(?:loves|likes)\s+me|i\s+hate\s+myself|don'?t\s+feel\s+(?:good|well)|someone\s+(?:hurt|hit|scared)|bleeding|i\s+fell\s+down)\b/i;

export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function normalizePerson(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const clean = p.trim().replace(/^my\s+/i, '');
  if (!clean) return undefined;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function cleanTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let t = raw
    .trim()
    .replace(/[.!?,;:"“”']+$/g, '')
    .replace(/^["“']+/, '')
    .replace(/^(?:(?:the|a|an|my)\s+)?(?:book|story)\s+(?:called|named)\s+/i, '')
    .replace(/^(?:called|named)\s+/i, '');
  for (let i = 0; i < 3; i++) t = t.replace(TAIL_NOISE, '').trim();
  t = t
    .replace(new RegExp(`${BOOK_WORD}$`, 'i'), '')
    .replace(new RegExp(`^${LEAD}`, 'i'), '')
    .trim();
  t = t.replace(/\s+(?:called|named)$/i, '').trim();
  if (t.length < 2 || t.length > 70 || NOT_TITLES.has(t.toLowerCase())) return undefined;
  return t;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "frog and toad" → "Frog and Toad Are Friends": a spoken title that starts a catalog title. */
function prefixCatalogMatch(title: string) {
  const t = norm(title);
  if (t.split(' ').length < 2) return undefined;
  return searchCatalogSync(title, 3).find((c) => {
    const n = norm(c.title).replace(/^the /, '');
    return n.startsWith(t.replace(/^the /, ''));
  });
}

/** Matches a spoken title against her books first, then the catalog. */
export function resolveBook(title: string | undefined, fullText: string, books: TeacherChatRequest['books']): ChatBookRef | undefined {
  const text = norm(fullText);
  // Her own books mentioned anywhere in what she said.
  const own = books.find((b) => {
    const n = norm(b.title);
    return n.length >= 4 && (text.includes(n) || (title && norm(title) === n));
  });
  if (own) {
    const cat = BOOK_CATALOG.find((c) => norm(c.title) === norm(own.title));
    return { title: own.title, existingBookId: own.id, ...(cat ? { catalogId: cat.id, author: cat.author } : {}) };
  }
  const cat = findCatalogTitleInText(fullText) ?? (title ? (findCatalogTitleInText(title) ?? prefixCatalogMatch(title)) : undefined);
  if (cat) return { title: cat.title, author: cat.author, catalogId: cat.id };
  if (!title) return undefined;
  return { title: titleCase(title) };
}

export interface Understanding {
  intent: ChatIntent;
  title?: string;
  finished: boolean | null;
  readTo?: string;
  readBy?: string;
  likes?: string;
  feeling?: string;
}

/** Understands what a child said (speech-to-text output: often lowercase, unpunctuated). */
export function understand(utterance: string, lastTeacherLine = ''): Understanding {
  const text = utterance.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  if (!text) return { intent: 'unclear', finished: null };
  if (SAFETY.test(lower)) return { intent: 'safety', finished: null };

  // The teacher just asked for a title: the whole answer is the title.
  if (/what (?:is|was) (?:the book|it) called|what(?:'s| is) the (?:name|title)/i.test(lastTeacherLine)) {
    const t = cleanTitle(text.replace(/^(?:it(?:'s| is| was)|the book is|it's called|its called|called)\s+/i, ''));
    if (t) return { intent: 'read_book', title: t, finished: null };
  }

  let m: RegExpMatchArray | null;
  // "I read daddy the Goodnight Leelanau book" / "I read to Mommy the …"
  if ((m = lower.match(new RegExp(`\\bread\\s+(?:to\\s+)?(${PEOPLE})\\s+((?:${LEAD})?.+)$`, 'i')))) {
    const title = cleanTitle(text.slice(text.length - m[2]!.length));
    return { intent: 'read_to_someone', ...(title ? { title } : {}), readTo: normalizePerson(m[1]), finished: null };
  }
  // "I read Frog and Toad to Mommy"
  if ((m = lower.match(new RegExp(`\\bread\\s+(.+?)\\s+to\\s+(${PEOPLE})\\b`, 'i')))) {
    const start = lower.indexOf(m[1]!);
    const title = cleanTitle(text.slice(start, start + m[1]!.length));
    return { intent: 'read_to_someone', ...(title ? { title } : {}), readTo: normalizePerson(m[2]), finished: null };
  }
  // "Daddy read me Owl at Home" / "Mommy read Little Bear to me"
  if (
    (m =
      lower.match(new RegExp(`(${PEOPLE})\\s+read\\s+(?:me|to me|us)\\s+(.+)$`, 'i')) ??
      lower.match(new RegExp(`(${PEOPLE})\\s+read\\s+(.+?)\\s+to\\s+(?:me|us)\\b`, 'i')))
  ) {
    const start = lower.lastIndexOf(m[2]!);
    const title = cleanTitle(text.slice(start, start + m[2]!.length));
    return { intent: 'was_read_to', ...(title ? { title } : {}), readBy: normalizePerson(m[1]), finished: null };
  }
  // "I finished Charlotte's Web" / "I'm done with …" / "I read the whole …"
  if ((m = lower.match(/\b(?:finished|done with|read the whole|read all of|got to the end of)\s+(?:reading\s+)?(.+)$/i))) {
    const start = lower.lastIndexOf(m[1]!);
    const title = cleanTitle(text.slice(start));
    return { intent: 'finished_book', ...(title ? { title } : {}), finished: true };
  }
  if (/\b(?:finished|done)\b.*\b(?:book|story)\b|\bi finished\b|\bthe end\b/i.test(lower)) return { intent: 'finished_book', finished: true };
  // "I'm reading Charlotte's Web" / "I started …"
  if ((m = lower.match(/\b(?:i'?m|i am|we'?re|we are)\s+(?:reading|in the middle of)\s+(.+)$|\b(?:i|we)\s+(?:started|began)\s+(?:reading\s+)?(.+)$/i))) {
    const part = m[1] ?? m[2]!;
    const start = lower.lastIndexOf(part);
    const title = cleanTitle(text.slice(start));
    return { intent: 'reading_book', ...(title ? { title } : {}), finished: false };
  }
  // "I read Owl at Home" (finished or not — ask)
  if ((m = lower.match(/\b(?:i|we)\s+(?:read|listened to)\s+(?:a\s+book\s+called\s+|the\s+book\s+)?(.+)$/i))) {
    const start = lower.lastIndexOf(m[1]!);
    const title = cleanTitle(text.slice(start));
    return { intent: 'read_book', ...(title ? { title } : {}), finished: null };
  }
  if (/\b(?:book|story|read|reading)\b/i.test(lower)) return { intent: 'read_book', finished: null };
  if (/\?$|^(?:why|what|how|where|when|who|can|do|does|is|are)\b/i.test(lower)) return { intent: 'question', finished: null };
  if ((m = lower.match(/\bi\s+(?:feel|am|'m)\s+(happy|sad|tired|excited|silly|mad|angry|grumpy|sleepy|proud|bored|great|good|okay)\b/i))) {
    return { intent: 'feeling', feeling: m[1]!.toLowerCase(), finished: null };
  }
  if ((m = lower.match(/\bi\s+(?:really\s+)?(?:like|love|liked|loved)\s+(.+)$/i))) {
    return { intent: 'share', likes: m[1]!.replace(/[.!?]+$/, '').slice(0, 60), finished: null };
  }
  return { intent: text.split(' ').length <= 1 ? 'unclear' : 'share', finished: null };
}

// ─── Replies (local, in character) ──────────────────────────────────────────

const FEELING_REPLIES: Record<string, string> = {
  happy: 'I’m so glad you feel happy!',
  excited: 'Ooh, excited! That’s the best feeling.',
  proud: 'You should feel proud! I’m proud of you too.',
  sad: 'I’m sorry you feel sad. A hug from Mom or Dad can help — and so can a cozy story.',
  tired: 'Sounds like a cozy-blanket kind of day.',
  sleepy: 'Sounds like a cozy-blanket kind of day.',
  mad: 'It’s okay to feel mad sometimes. Taking big slow breaths can help.',
  angry: 'It’s okay to feel mad sometimes. Taking big slow breaths can help.',
  grumpy: 'Grumpy days happen! Maybe a funny story would help.',
  silly: 'Silly is my favorite!',
  bored: 'Bored? Let’s find something new to explore!',
};

const SAFETY_REPLY = 'Thank you for telling me. That sounds important. Please go tell Mom or Dad about it right now, okay? 💛';

function bookLine(teacher: TeacherId, u: Understanding, book: ChatBookRef | undefined): string {
  const title = book?.title;
  if (teacher !== 'hoot') {
    const t = TEACHERS[teacher].name;
    return title
      ? `${title}! ${teacher === 'digit' ? 'Beep boop — I love that!' : 'Ooh, how fun!'} Professor Hoot would love to hear about it — go tell him so it can go on your shelf!`
      : `${teacher === 'digit' ? 'Beep boop!' : 'Ooh!'} ${t} loves books too. Professor Hoot in the library is the one to tell about books!`;
  }
  if (!title) return u.intent === 'finished_book' ? 'Hoo-ray, you finished a book! What was it called?' : 'Hoo! A book! What was it called?';
  switch (u.intent) {
    case 'read_to_someone':
      return `You read ${title} to ${u.readTo ?? 'someone'}? Hoo-hoo! Reading to someone is a wonderful gift. Did you read the whole book?`;
    case 'was_read_to':
      return `${u.readBy ?? 'Someone'} read you ${title}? How cozy! Did you get all the way to the end?`;
    case 'finished_book':
      return `You finished ${title}? Hoo-ray! Shall we chat about it and put it on your shelf?`;
    case 'reading_book':
      return `Ooh, ${title}! Shall I put a bookmark in it for you?`;
    default:
      return `${title}! Hoo, what a good one. Did you read the whole book?`;
  }
}

function localReply(req: TeacherChatRequest, u: Understanding, book: ChatBookRef | undefined, seed: number): string {
  const t = req.teacherId;
  switch (u.intent) {
    case 'safety':
      return SAFETY_REPLY;
    case 'finished_book':
    case 'reading_book':
    case 'read_to_someone':
    case 'was_read_to':
    case 'read_book':
      return bookLine(t, u, book);
    case 'feeling':
      return FEELING_REPLIES[u.feeling ?? ''] ?? 'Thank you for telling me how you feel.';
    case 'question':
      return pickLine(TEACHER_REGISTRY[t].local.questions, seed);
    case 'share':
      return u.likes ? TEACHER_REGISTRY[t].local.likes.replace('{likes}', u.likes) : pickLine(TEACHER_REGISTRY[t].local.shares, seed);
    default:
      return TEACHER_REGISTRY[t].local.unclear;
  }
}

export class LocalTeacherChat implements TeacherChatService {
  readonly id = 'local';
  readonly sendsDataOffDevice = false;

  respond(req: TeacherChatRequest): Promise<TeacherChatReply> {
    return Promise.resolve(localTeacherReply(req));
  }
}

const ASKED_IF_FINISHED = /whole (?:book|thing|story)|all the way|to the end|finish(?:ed)?(?: it| the book| reading it)?\?|read (?:it )?all|the end\?/i;
const YES =
  /^(?:oh\s+)?(?:yes|yeah|yea|yep|yup|uh[- ]?huh|mm[- ]?hmm|i did|we did|sure|of course|totally|definitely|the whole (?:book|thing)|all of it|every (?:page|word)|i finished|we finished)\b/i;
const NO =
  /^(?:oh\s+)?(?:no|nope|nah|not yet|not all|not the whole|only (?:some|a little|part)|just (?:some|a little|part)|half|i didn'?t|we didn'?t|some of it|a little)\b/i;

/** "yes" / "not yet" right after a teacher asked whether she finished the book. */
export function answerToFinishedQuestion(utterance: string, lastTeacherLine: string): boolean | null {
  if (!ASKED_IF_FINISHED.test(lastTeacherLine)) return null;
  const t = utterance.trim().toLowerCase();
  if (NO.test(t)) return false;
  if (YES.test(t)) return true;
  return null;
}

export function localTeacherReply(req: TeacherChatRequest): TeacherChatReply {
  if (!isTeacherId(req.teacherId))
    return {
      reply: 'This teacher is resting. Choose a teacher in the school, or ask a grown-up for help.',
      intent: 'unclear',
      finished: null,
      source: 'local',
    };
  const lastTeacher = [...req.history].reverse().find((h) => h.speaker === 'teacher')?.text ?? '';
  const answered = req.topic && req.teacherId === 'hoot' ? answerToFinishedQuestion(req.utterance, lastTeacher) : null;
  if (answered !== null && req.topic) {
    const title = req.topic.title;
    return {
      reply: personalize(
        answered
          ? `The whole book? Hoo-ray, {name}! Let’s chat about ${title} and put it on your shelf!`
          : `That’s okay! Every page counts. Shall I put a bookmark in ${title} so you can keep reading?`,
        req.childName,
      ),
      intent: answered ? 'finished_book' : 'reading_book',
      book: req.topic,
      finished: answered,
      source: 'local',
    };
  }
  const u = understand(req.utterance, lastTeacher);
  const bookish = ['finished_book', 'reading_book', 'read_to_someone', 'was_read_to', 'read_book'].includes(u.intent);
  const book = bookish ? resolveBook(u.title, req.utterance, req.books) : undefined;
  let seed = 0;
  for (const ch of req.utterance) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const reply = personalize(localReply(req, u, book, seed), req.childName);
  return {
    reply,
    intent: u.intent,
    ...(book ? { book } : {}),
    finished: u.finished,
    ...(u.readTo ? { readTo: u.readTo } : {}),
    ...(u.readBy ? { readBy: u.readBy } : {}),
    ...(u.intent === 'safety' ? { parentNote: `${req.childName} said: “${req.utterance.trim()}”` } : {}),
    source: 'local',
  };
}

// ─── Conversation state ─────────────────────────────────────────────────────

/** What a conversation has established so far about the book she is talking about. */
export interface ChatTopic {
  book?: ChatBookRef;
  finished: boolean | null;
  readTo?: string;
  readBy?: string;
}

export const EMPTY_TOPIC: ChatTopic = { finished: null };

const sameBook = (a: ChatBookRef | undefined, b: ChatBookRef | undefined) => !!a && !!b && norm(a.title) === norm(b.title);

/** Carries the book (and whether she finished it) across turns. */
export function nextTopic(prev: ChatTopic, reply: TeacherChatReply): ChatTopic {
  if (reply.intent === 'safety') return prev;
  if (reply.book && !sameBook(reply.book, prev.book)) {
    return {
      book: reply.book,
      finished: reply.finished,
      ...(reply.readTo ? { readTo: reply.readTo } : {}),
      ...(reply.readBy ? { readBy: reply.readBy } : {}),
    };
  }
  if (!prev.book) return prev;
  return {
    ...prev,
    ...(reply.book ? { book: { ...prev.book, ...reply.book } } : {}),
    finished: reply.finished ?? prev.finished,
    ...(reply.readTo ? { readTo: reply.readTo } : {}),
    ...(reply.readBy ? { readBy: reply.readBy } : {}),
  };
}

/** A one-line note for the reading log, e.g. "Izzy read it aloud to Daddy". */
export function readingNote(childName: string, topic: ChatTopic): string | undefined {
  if (topic.readTo) return `${childName} read it aloud to ${topic.readTo}`;
  if (topic.readBy) return `${topic.readBy} read it to ${childName}`;
  return undefined;
}

/** Words to help the recognizer: her book titles, well-known titles and family words. */
export function talkPhrases(books: { title: string }[]): string[] {
  const own = books.map((b) => b.title);
  const family = ['Professor Hoot', 'Digit', 'Nova', 'Mommy', 'Daddy', 'Georgia', 'the whole book', 'not yet'];
  const catalog = BOOK_CATALOG.map((b) => b.title);
  return [...new Set([...own, ...family, ...catalog])].slice(0, 50);
}

// ─── Safety net for any reply shown to the child ────────────────────────────

const UNSAFE_REPLY =
  /\b(kill|killing|dead body|blood|gun|knife|weapon|sexy|sex|naked|kiss me|drugs?|alcohol|beer|wine|cigarette|vape|suicide|stupid|idiot|shut up|hate you|secret between us|don'?t tell (?:your|mom|dad|anyone)|keep (?:it|this) (?:a )?secret)\b/i;
const CONTACT = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|\+?\d[\d\s().-]{7,}\d/g;

/** Cleans a teacher reply before a child sees or hears it. Returns null if it must not be shown. */
export function sanitizeTeacherReply(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  let t = text
    .replace(/[*_#`>]+/g, '')
    .replace(CONTACT, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || UNSAFE_REPLY.test(t)) return null;
  if (t.length > 300) {
    const cut = t.slice(0, 300);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > 80 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
  }
  return t;
}

/** Validates an untrusted (AI) reply; anything unusable returns null so callers fall back to local. */
export function validateTeacherReply(raw: unknown, req: TeacherChatRequest): TeacherChatReply | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const reply = sanitizeTeacherReply(r.reply);
  if (!reply) return null;
  const intent = CHAT_INTENTS.includes(r.intent as ChatIntent) ? (r.intent as ChatIntent) : 'share';
  const str = (v: unknown, max = 70) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const bookRaw = typeof r.book === 'object' && r.book !== null ? (r.book as Record<string, unknown>) : null;
  const title = str(bookRaw?.title);
  const book = title ? resolveBook(title, `${req.utterance} ${title}`, req.books) : undefined;
  const readTo = str(r.readTo, 30);
  const readBy = str(r.readBy, 30);
  const parentNote = str(r.parentNote, 400);
  return {
    reply,
    intent,
    ...(book ? { book } : {}),
    finished: typeof r.finished === 'boolean' ? r.finished : null,
    ...(readTo ? { readTo } : {}),
    ...(readBy ? { readBy } : {}),
    ...(parentNote ? { parentNote } : {}),
    source: 'ai',
  };
}

export { getCatalogBook };
