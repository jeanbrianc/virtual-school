/**
 * Natural-language activity logging: interpret → parent review → save.
 */
import { UnitOfWork } from '../data/repositories';
import { getSkill } from '../domain/curriculum';
import type {
  ActivityInterpretation,
  ActivityInterpretationService,
  BookMention,
  InterpretationContext,
  SkillSuggestion,
} from '../domain/interpretation';
import type { Activity, Book, Evidence, EvidenceTrials, PortfolioKind, ReadingSession } from '../domain/types';
import { timestampAt, toDay } from '../domain/util/time';
import { nowIso, type ServiceContext } from './context';
import { finalizeLearning, makeEvidence, type LearningOutcome } from './learningCore';
import { buildBook } from './readingService';

export async function buildInterpretationContext(ctx: ServiceContext, childId: string): Promise<InterpretationContext> {
  const child = await ctx.repos.children.get(childId);
  const books = await ctx.repos.forChild(ctx.repos.books, childId);
  return {
    childName: child?.name ?? 'Your child',
    pronoun: 'she',
    today: toDay(ctx.clock.now()),
    knownBooks: books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      status: b.status,
      ...(b.chaptersRead !== undefined ? { chaptersRead: b.chaptersRead } : {}),
      ...(b.totalChapters !== undefined ? { totalChapters: b.totalChapters } : {}),
      ...(b.catalogId ? { catalogId: b.catalogId } : {}),
    })),
  };
}

export async function interpretActivity(
  ctx: ServiceContext,
  service: ActivityInterpretationService,
  childId: string,
  narrative: string,
): Promise<ActivityInterpretation> {
  const context = await buildInterpretationContext(ctx, childId);
  return service.interpret(narrative, context);
}

export interface ReviewedActivity {
  narrative: string;
  title: string;
  date: string;
  durationMinutes?: number;
  skills: SkillSuggestion[];
  books: BookMention[];
  topics: string[];
  natureItems: string[];
  parentObservation?: string;
  childReflection?: string;
  mediaIds: string[];
  portfolioKind?: PortfolioKind;
  favorite?: boolean;
  interpretation: ActivityInterpretation['provider'] & { totalSuggestions: number };
}

export interface SaveActivityResult {
  activity: Activity;
  evidence: Evidence[];
  booksTouched: Book[];
  outcome: LearningOutcome;
}

export function trialsFor(s: SkillSuggestion): { trials: EvidenceTrials; kind: Evidence['kind'] } {
  switch (s.outcome) {
    case 'demonstrated':
      return { trials: { independent: 1, supported: 0, notYet: 0 }, kind: s.kind === 'exposure' ? 'observation' : s.kind };
    case 'with_support':
      return { trials: { independent: 0, supported: 1, notYet: 0 }, kind: s.kind === 'exposure' ? 'observation' : s.kind };
    case 'not_yet':
      return { trials: { independent: 0, supported: 0, notYet: 1 }, kind: 'performance' };
    default:
      return { trials: { independent: 0, supported: 0, notYet: 0 }, kind: 'exposure' };
  }
}

function derivePortfolioKind(r: ReviewedActivity): PortfolioKind {
  if (r.portfolioKind) return r.portfolioKind;
  if (r.topics.includes('art')) return 'artwork';
  if (r.natureItems.length > 0) return 'nature';
  if (r.mediaIds.length > 0) return 'photo';
  if (r.skills.some((s) => s.skillId === 'sci.engineer' || s.skillId === 'art.making')) return 'project';
  return 'observation';
}

export async function saveActivity(ctx: ServiceContext, childId: string, reviewed: ReviewedActivity): Promise<SaveActivityResult> {
  const accepted = reviewed.skills.filter((s) => s.accepted && getSkill(s.skillId));
  const observedAt = timestampAt(reviewed.date, 12);
  const activityId = ctx.ids('act');
  const uow = new UnitOfWork();

  const domains = [...new Set(accepted.map((s) => getSkill(s.skillId)?.domainId).filter((d): d is NonNullable<typeof d> => !!d))];
  const topics = [...new Set([...reviewed.topics, ...accepted.flatMap((s) => s.topics)])];

  const activity: Activity = {
    id: activityId,
    childId,
    date: reviewed.date,
    title: reviewed.title.trim() || 'Learning moment',
    narrative: reviewed.narrative.trim(),
    ...(reviewed.durationMinutes ? { durationMinutes: reviewed.durationMinutes } : {}),
    domains,
    skillIds: accepted.map((s) => s.skillId),
    topics,
    mediaIds: reviewed.mediaIds,
    ...(reviewed.parentObservation?.trim() ? { parentObservation: reviewed.parentObservation.trim() } : {}),
    ...(reviewed.childReflection?.trim() ? { childReflection: reviewed.childReflection.trim() } : {}),
    ...(reviewed.natureItems.length ? { natureItems: reviewed.natureItems } : {}),
    interpretation: {
      provider: reviewed.interpretation.id,
      version: reviewed.interpretation.version,
      acceptedSuggestions: accepted.length,
      totalSuggestions: reviewed.interpretation.totalSuggestions,
    },
    createdAt: nowIso(ctx),
  };
  uow.put('activities', activity);

  const evidence = accepted.map((s) => {
    const { trials, kind } = trialsFor(s);
    return makeEvidence(ctx, {
      childId,
      skillId: s.skillId,
      observedAt,
      source: { type: 'activity', id: activityId, label: activity.title },
      kind,
      trials,
      independence: s.independence,
      statement: s.statement,
      excerpt: s.excerpt,
      createdBy: 'parent',
      topics: s.topics,
    });
  });
  uow.putAll('evidence', evidence);

  // Books mentioned in the narrative.
  const booksTouched: Book[] = [];
  const existingBooks = await ctx.repos.forChild(ctx.repos.books, childId);
  let nextShelf = existingBooks.filter((b) => b.status === 'completed').reduce((m, b) => Math.max(m, b.shelfIndex ?? -1), -1) + 1;
  for (const mention of reviewed.books) {
    const existing = mention.existingBookId ? existingBooks.find((b) => b.id === mention.existingBookId) : undefined;
    const base =
      existing ??
      buildBook(ctx, childId, {
        title: mention.title,
        ...(mention.author ? { author: mention.author } : {}),
        ...(mention.catalogId ? { catalogId: mention.catalogId } : {}),
        status: 'reading',
        readingMode: mention.mode === 'read_aloud' ? 'read_aloud' : mention.mode === 'shared' ? 'shared' : 'independent',
      });
    const chapters = mention.chaptersRead
      ? Math.min(base.totalChapters ?? Infinity, (base.chaptersRead ?? 0) + mention.chaptersRead)
      : base.chaptersRead;
    const completing = mention.completed && base.status !== 'completed';
    const updated: Book = {
      ...base,
      status: completing ? 'completed' : base.status === 'up_next' ? 'reading' : base.status,
      dateStarted: base.dateStarted ?? reviewed.date,
      ...(chapters !== undefined ? { chaptersRead: completing && base.totalChapters ? base.totalChapters : chapters } : {}),
      ...(completing ? { dateCompleted: reviewed.date, shelfIndex: nextShelf++ } : {}),
    };
    uow.put('books', updated);
    uow.put('readingSessions', {
      id: ctx.ids('session'),
      childId,
      bookId: updated.id,
      date: reviewed.date,
      ...(mention.chaptersRead ? { chaptersRead: mention.chaptersRead } : {}),
      ...(mention.pagesRead ? { pagesRead: mention.pagesRead } : {}),
      mode: mention.mode,
      notes: mention.excerpt.slice(0, 280),
      source: 'interpreter',
    } satisfies ReadingSession);
    booksTouched.push(updated);
  }

  const kind = derivePortfolioKind(reviewed);
  uow.put('portfolio', {
    id: ctx.ids('pf'),
    childId,
    date: reviewed.date,
    kind,
    title: activity.title,
    description: activity.parentObservation ?? activity.narrative.slice(0, 280),
    mediaIds: reviewed.mediaIds,
    skillIds: activity.skillIds,
    linked: { type: 'activity', id: activityId },
    favorite: reviewed.favorite ?? false,
    artSeed: activityId.length * 7919,
  });

  const outcome = await finalizeLearning(ctx, childId, uow, `activity:${activityId}`);
  return { activity, evidence, booksTouched, outcome };
}

/** Parent observation for a single skill (quick-add from the curriculum view). */
export async function addObservation(
  ctx: ServiceContext,
  childId: string,
  input: { skillId: string; statement: string; outcome: SkillSuggestion['outcome']; independence: SkillSuggestion['independence']; date?: string },
): Promise<LearningOutcome> {
  const skill = getSkill(input.skillId);
  if (!skill) throw new Error('Unknown skill');
  const s: SkillSuggestion = {
    skillId: input.skillId,
    confidence: 1,
    kind: 'observation',
    independence: input.independence,
    outcome: input.outcome,
    statement: input.statement,
    excerpt: '',
    topics: skill.topics,
    accepted: true,
  };
  const { trials, kind } = trialsFor(s);
  const uow = new UnitOfWork();
  const id = ctx.ids('obs');
  uow.put(
    'evidence',
    makeEvidence(ctx, {
      childId,
      skillId: input.skillId,
      observedAt: input.date ? timestampAt(input.date, 12) : nowIso(ctx),
      source: { type: 'observation', id, label: 'Parent observation' },
      kind,
      trials,
      independence: input.independence,
      statement: input.statement,
      createdBy: 'parent',
    }),
  );
  return finalizeLearning(ctx, childId, uow, `observation:${id}`);
}
