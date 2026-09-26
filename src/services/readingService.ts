/**
 * Reading workflows: add books, log reading, and — the core loop — complete a
 * book with Professor Hoot (evidence + shelf placement + rewards).
 */
import { UnitOfWork } from '../data/repositories';
import { getSkill } from '../domain/curriculum';
import { tallyBySkill } from '../domain/lessons/engine';
import type { Problem } from '../domain/lessons/types';
import { getCatalogBook } from '../domain/reading/bookCatalog';
import { generatedCover } from '../domain/reading/bookMetadata';
import type {
  Book,
  Evidence,
  ProblemAttemptRecord,
  ReadingMode,
  ReadingSession,
  TeacherInteraction,
  TranscriptLine,
} from '../domain/types';
import { toDay } from '../domain/util/time';
import { nowIso, type ServiceContext } from './context';
import { finalizeLearning, makeEvidence, type LearningOutcome } from './learningCore';

export interface NewBookInput {
  title: string;
  author?: string;
  catalogId?: string;
  status?: Book['status'];
  readingMode?: ReadingMode;
  totalChapters?: number;
  totalPages?: number;
  tags?: string[];
  needsParentReview?: boolean;
}

export function buildBook(ctx: ServiceContext, childId: string, input: NewBookInput): Book {
  const cat = getCatalogBook(input.catalogId);
  const today = toDay(ctx.clock.now());
  const status = input.status ?? 'up_next';
  const totalChapters = input.totalChapters ?? cat?.totalChapters;
  const totalPages = input.totalPages ?? cat?.totalPages;
  return {
    id: ctx.ids('book'),
    childId,
    title: (cat?.title ?? input.title).trim(),
    author: (input.author ?? cat?.author ?? '').trim(),
    ...(cat ? { catalogId: cat.id } : {}),
    cover: cat?.cover ?? generatedCover(input.title),
    status,
    dateAdded: today,
    ...(status === 'reading' ? { dateStarted: today } : {}),
    ...(totalChapters ? { totalChapters } : {}),
    ...(totalPages ? { totalPages } : {}),
    readingMode: input.readingMode ?? 'independent',
    tags: input.tags ?? cat?.tags ?? [],
    ...(cat ? { difficulty: { band: cat.band } } : {}),
    ...(input.needsParentReview ? { needsParentReview: true } : {}),
  };
}

export async function addBook(ctx: ServiceContext, childId: string, input: NewBookInput): Promise<Book> {
  const book = buildBook(ctx, childId, input);
  await ctx.repos.books.put(book);
  return book;
}

export async function updateBook(ctx: ServiceContext, book: Book): Promise<void> {
  const existing = await ctx.repos.books.get(book.id);
  if (!existing || existing.childId !== book.childId) throw new Error('Book not found for this child');
  await ctx.repos.books.put(book);
}

export interface LogReadingInput {
  bookId: string;
  chaptersRead?: number;
  pagesRead?: number;
  minutes?: number;
  mode?: ReadingMode;
  notes?: string;
  source: ReadingSession['source'];
  date?: string;
}

/** Records a reading session and moves the bookmark forward. */
export async function logReading(ctx: ServiceContext, childId: string, input: LogReadingInput): Promise<{ book: Book; outcome: LearningOutcome }> {
  const book = await ctx.repos.books.get(input.bookId);
  if (!book || book.childId !== childId) throw new Error('Book not found for this child');
  const date = input.date ?? toDay(ctx.clock.now());
  const uow = new UnitOfWork();
  const session: ReadingSession = {
    id: ctx.ids('session'),
    childId,
    bookId: book.id,
    date,
    ...(input.chaptersRead ? { chaptersRead: input.chaptersRead } : {}),
    ...(input.pagesRead ? { pagesRead: input.pagesRead } : {}),
    ...(input.minutes ? { minutes: input.minutes } : {}),
    mode: input.mode ?? book.readingMode,
    ...(input.notes ? { notes: input.notes } : {}),
    source: input.source,
  };
  const chapters = Math.min(book.totalChapters ?? Infinity, (book.chaptersRead ?? 0) + (input.chaptersRead ?? 0));
  const pages = Math.min(book.totalPages ?? Infinity, (book.pagesRead ?? 0) + (input.pagesRead ?? 0));
  const updated: Book = {
    ...book,
    status: book.status === 'completed' ? 'completed' : 'reading',
    dateStarted: book.dateStarted ?? date,
    ...(input.chaptersRead ? { chaptersRead: chapters } : {}),
    ...(input.pagesRead ? { pagesRead: pages } : {}),
  };
  uow.put('readingSessions', session).put('books', updated);
  if ((input.chaptersRead ?? 0) > 0 && (book.totalChapters ?? 0) >= 5) {
    uow.put(
      'evidence',
      makeEvidence(ctx, {
        childId,
        skillId: 'read.chapter-stamina',
        source: { type: 'book', id: book.id, label: book.title },
        kind: 'performance',
        trials: { independent: session.mode === 'independent' ? 1 : 0, supported: session.mode === 'independent' ? 0 : 1, notYet: 0 },
        independence: session.mode === 'independent' ? 'independent' : 'supported',
        statement: `Read ${input.chaptersRead} chapter${input.chaptersRead === 1 ? '' : 's'} of ${book.title}${session.mode === 'independent' ? ' independently' : ' with a reading partner'} (now on chapter ${chapters}).`,
        createdBy: input.source === 'child' ? 'system' : 'parent',
      }),
    );
  }
  const outcome = await finalizeLearning(ctx, childId, uow, `reading:${book.id}`);
  return { book: updated, outcome };
}

export interface CompleteBookInput {
  bookId?: string;
  newBook?: NewBookInput;
  answers: ProblemAttemptRecord[];
  problems?: Map<string, Problem>;
  rating?: number;
  favoritePart?: string;
  feeling?: string;
  narration?: string;
  startedAt: string;
  transcript: TranscriptLine[];
  source: 'child' | 'parent';
}

export interface CompleteBookResult {
  book: Book;
  shelfIndex: number;
  booksCompleted: number;
  evidence: Evidence[];
  interaction: TeacherInteraction;
  outcome: LearningOutcome;
}

const QUESTION_KIND_LABEL: Record<string, string> = {
  'read.key-details': 'key-detail',
  'read.characters': 'character',
  'read.retell': 'sequencing/retelling',
  'read.feelings': 'character-feelings',
  'read.inference': 'inference',
  'read.theme': 'central-message',
  'vocab.context': 'vocabulary-in-context',
};

export async function completeBook(ctx: ServiceContext, childId: string, input: CompleteBookInput): Promise<CompleteBookResult> {
  const now = nowIso(ctx);
  const today = toDay(ctx.clock.now());
  const all = await ctx.repos.forChild(ctx.repos.books, childId);

  let book: Book;
  if (input.bookId) {
    const found = all.find((b) => b.id === input.bookId);
    if (!found) throw new Error('Book not found for this child');
    book = found;
  } else if (input.newBook) {
    book = buildBook(ctx, childId, { ...input.newBook, status: 'reading' });
  } else {
    throw new Error('completeBook needs bookId or newBook');
  }
  if (book.status === 'completed') throw new Error('Book already completed');

  const completedBefore = all.filter((b) => b.status === 'completed');
  const shelfIndex = completedBefore.reduce((max, b) => Math.max(max, b.shelfIndex ?? -1), -1) + 1;

  const completed: Book = {
    ...book,
    status: 'completed',
    dateStarted: book.dateStarted ?? today,
    dateCompleted: today,
    ...(book.totalChapters ? { chaptersRead: book.totalChapters } : {}),
    ...(book.totalPages ? { pagesRead: book.totalPages } : {}),
    ...(input.rating ? { childRating: input.rating } : {}),
    ...(input.favoritePart ? { favoritePart: input.favoritePart } : {}),
    shelfIndex,
  };

  const uow = new UnitOfWork();
  uow.put('books', completed);

  const remainingChapters = book.totalChapters ? book.totalChapters - (book.chaptersRead ?? 0) : undefined;
  uow.put('readingSessions', {
    id: ctx.ids('session'),
    childId,
    bookId: book.id,
    date: today,
    ...(remainingChapters && remainingChapters > 0 ? { chaptersRead: remainingChapters } : {}),
    mode: book.readingMode,
    notes: 'Finished the book',
    source: input.source,
  } satisfies ReadingSession);

  const evidence: Evidence[] = [];
  const source = { type: 'book' as const, id: book.id, label: book.title };

  // Comprehension answers → specific, honest evidence per skill.
  for (const tally of tallyBySkill(input.answers, input.problems)) {
    const skill = getSkill(tally.skillId);
    if (!skill) continue;
    const total = tally.independent + tally.supported + tally.notYet;
    const kindLabel = QUESTION_KIND_LABEL[tally.skillId] ?? skill.name.toLowerCase();
    const parts: string[] = [];
    if (tally.independent) parts.push(`${tally.independent} independently`);
    if (tally.supported) parts.push(`${tally.supported} after a hint`);
    if (tally.notYet) parts.push(`${tally.notYet} not yet (answer modeled)`);
    const prompts = input.answers.filter((a) => a.skillId === tally.skillId).map((a) => `“${a.prompt}”`);
    evidence.push(
      makeEvidence(ctx, {
        childId,
        skillId: tally.skillId,
        source,
        kind: 'performance',
        trials: { independent: tally.independent, supported: tally.supported, notYet: tally.notYet },
        independence: tally.independent === total ? 'independent' : tally.independent + tally.supported > 0 ? 'supported' : 'assisted',
        statement: `Answered ${total} ${kindLabel} question${total === 1 ? '' : 's'} about ${book.title} in conversation with Professor Hoot — ${parts.join(', ')}.`,
        excerpt: prompts.join(' '),
        createdBy: 'system',
        difficulty: skill.difficulty,
      }),
    );
  }

  if ((book.totalChapters ?? 0) >= 5 || (book.totalPages ?? 0) >= 60) {
    const independent = book.readingMode === 'independent';
    evidence.push(
      makeEvidence(ctx, {
        childId,
        skillId: 'read.chapter-stamina',
        source,
        kind: 'performance',
        trials: { independent: independent ? 1 : 0, supported: independent ? 0 : 1, notYet: 0 },
        independence: independent ? 'independent' : 'supported',
        statement: `Finished ${book.title}${book.totalChapters ? ` (${book.totalChapters} chapters)` : ''}${independent ? ' reading independently' : ' with a reading partner'}.`,
        createdBy: 'system',
      }),
    );
  }

  if (input.narration && input.narration.trim().length > 3) {
    evidence.push(
      makeEvidence(ctx, {
        childId,
        skillId: 'read.narration',
        source,
        kind: 'observation',
        trials: { independent: 1, supported: 0, notYet: 0 },
        independence: 'independent',
        statement: `Told Professor Hoot about ${book.title} in her own words: “${input.narration.trim().slice(0, 240)}”`,
        createdBy: 'system',
      }),
    );
  }
  uow.putAll('evidence', evidence);

  uow.put('portfolio', {
    id: ctx.ids('pf'),
    childId,
    date: today,
    kind: 'book',
    title: `Finished ${book.title}`,
    description: [
      book.author ? `by ${book.author}` : '',
      input.rating ? `Izzy’s rating: ${'★'.repeat(input.rating)}` : '',
      input.favoritePart ? `Favorite part: ${input.favoritePart}` : '',
      input.feeling ? `She said it felt ${input.feeling.toLowerCase()}.` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    mediaIds: [],
    skillIds: evidence.map((e) => e.skillId),
    linked: { type: 'book', id: book.id },
    favorite: (input.rating ?? 0) >= 5,
  });

  const interaction: TeacherInteraction = {
    id: ctx.ids('talk'),
    childId,
    teacherId: 'hoot',
    startedAt: input.startedAt,
    endedAt: now,
    context: { bookId: book.id, flow: 'finish-book' },
    transcript: input.transcript,
    outcome: `Finished ${book.title}; ${input.answers.length} story question${input.answers.length === 1 ? '' : 's'}; placed on shelf #${shelfIndex + 1}.`,
  };
  uow.put('teacherInteractions', interaction);

  const outcome = await finalizeLearning(ctx, childId, uow, `book:${book.id}`);
  return {
    book: completed,
    shelfIndex,
    booksCompleted: completedBefore.length + 1,
    evidence,
    interaction,
    outcome,
  };
}
