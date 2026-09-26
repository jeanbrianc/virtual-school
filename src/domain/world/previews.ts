/**
 * Milestone previews let a parent peek at how the school will grow ("what
 * does 100 books look like?") without touching saved progress. They are
 * built from a hypothetical ProgressSnapshot that is never persisted, and the
 * child UI shows a clear "Preview — nothing here is saved" ribbon.
 */
import type { ProgressSnapshot } from '../progress/snapshot';
import { generatedCover } from '../reading/bookMetadata';
import { evaluateNewRewards } from '../rewards/engine';
import type { CoverStyle } from '../types';
import { deriveWorldState, type WorldState } from './worldState';

export type MilestonePreviewId = 'books-10' | 'books-25' | 'books-50' | 'books-100' | 'greenhouse' | 'museum' | 'space' | 'art' | 'everything';

export interface MilestonePreviewDef {
  id: MilestonePreviewId;
  label: string;
  description: string;
  icon: string;
}

export const MILESTONE_PREVIEWS: MilestonePreviewDef[] = [
  { id: 'books-10', label: '10 books', description: 'Second bookshelf + first reading trophy', icon: '📚' },
  { id: 'books-25', label: '25 books', description: 'Cozy reading nook opens', icon: '🛋️' },
  { id: 'books-50', label: '50 books', description: 'Grand library shelves', icon: '🏛️' },
  { id: 'books-100', label: '100 books', description: 'Sparkle the reading dragon', icon: '🐉' },
  { id: 'greenhouse', label: 'Plant study', description: 'Greenhouse full of seedlings', icon: '🌱' },
  { id: 'museum', label: 'Dinosaurs & nature', description: 'Fossil, skeleton & nature table', icon: '🦕' },
  { id: 'space', label: 'Space & rockets', description: 'Telescope, planets, launch-ready rocket', icon: '🚀' },
  { id: 'art', label: 'Five artworks', description: 'Art line + art studio', icon: '🎨' },
  { id: 'everything', label: 'Everything', description: 'Every unlock at once', icon: '✨' },
];

export interface PreviewShelfBook {
  id: string;
  title: string;
  author: string;
  cover: CoverStyle;
  shelfIndex: number;
}

export interface MilestonePreview {
  label: string;
  snapshot: ProgressSnapshot;
  unlocked: Set<string>;
  world: WorldState;
  books: PreviewShelfBook[];
  /** Rewards that would be newly earned (celebrated in the preview). */
  celebrate: string[];
}

/** Public-domain titles used to fill preview shelves (clearly a preview, never saved). */
const FILLER_TITLES: [string, string][] = [
  ['The Tale of Squirrel Nutkin', 'Beatrix Potter'],
  ['Aesop’s Fables', 'Aesop'],
  ['The Wind in the Willows', 'Kenneth Grahame'],
  ['Alice’s Adventures in Wonderland', 'Lewis Carroll'],
  ['The Secret Garden', 'Frances Hodgson Burnett'],
  ['Just So Stories', 'Rudyard Kipling'],
  ['The Wonderful Wizard of Oz', 'L. Frank Baum'],
  ['Peter Pan', 'J. M. Barrie'],
  ['Heidi', 'Johanna Spyri'],
  ['The Tale of Jemima Puddle-Duck', 'Beatrix Potter'],
  ['The Real Mother Goose', 'Traditional'],
  ['Pinocchio', 'Carlo Collodi'],
  ['The Jungle Book', 'Rudyard Kipling'],
  ['Black Beauty', 'Anna Sewell'],
  ['The Little Red Hen', 'Traditional'],
  ['The Story of Doctor Dolittle', 'Hugh Lofting'],
  ['Grimms’ Fairy Tales', 'Brothers Grimm'],
  ['The Princess and the Goblin', 'George MacDonald'],
  ['The Tale of Benjamin Bunny', 'Beatrix Potter'],
  ['Little Women', 'Louisa May Alcott'],
];

function fillerBook(index: number, shelfIndex: number): PreviewShelfBook {
  const base = FILLER_TITLES[index % FILLER_TITLES.length] ?? ['A Future Favorite', 'Someone Wonderful'];
  const round = Math.floor(index / FILLER_TITLES.length);
  const title = round === 0 ? base[0] : `${base[0]} (${['', 'II', 'III', 'IV', 'V', 'VI'][round] ?? round + 1})`;
  return { id: `preview-${index}`, title, author: base[1], cover: generatedCover(title), shelfIndex };
}

function boost(snap: ProgressSnapshot, id: MilestonePreviewId): ProgressSnapshot {
  const next: ProgressSnapshot = {
    ...snap,
    topicCounts: { ...snap.topicCounts },
    lessonCompletions: { ...snap.lessonCompletions },
    masteredByDomain: { ...snap.masteredByDomain },
    natureItems: [...snap.natureItems],
  };
  const atLeast = (rec: Record<string, number>, key: string, n: number) => {
    rec[key] = Math.max(rec[key] ?? 0, n);
  };
  const books = (n: number) => {
    next.booksCompleted = Math.max(next.booksCompleted, n);
  };
  const all = id === 'everything';
  if (id === 'books-10') books(10);
  if (id === 'books-25') books(25);
  if (id === 'books-50') books(50);
  if (id === 'books-100' || all) books(100);
  if (id === 'greenhouse' || all) atLeast(next.topicCounts, 'plants', 10);
  if (id === 'museum' || all) {
    atLeast(next.topicCounts, 'dinosaurs', 3);
    atLeast(next.topicCounts, 'nature', 2);
    for (const item of ['acorn', 'feather', 'pinecone', 'shell', 'leaf', 'rock']) if (!next.natureItems.includes(item)) next.natureItems.push(item);
  }
  if (id === 'space' || all) {
    atLeast(next.topicCounts, 'space', 3);
    atLeast(next.lessonCompletions, 'moon-rocks', 5);
  }
  if (id === 'art' || all) next.artworks = Math.max(next.artworks, 5);
  if (all) {
    atLeast(next.lessonCompletions, 'sink-float', 3);
    atLeast(next.masteredByDomain, 'math', 3);
  }
  next.totalLessons = Object.values(next.lessonCompletions).reduce((a, b) => a + b, 0);
  return next;
}

export function buildMilestonePreview(
  id: MilestonePreviewId,
  current: ProgressSnapshot,
  unlocked: ReadonlySet<string>,
  currentBooks: PreviewShelfBook[],
): MilestonePreview {
  const def = MILESTONE_PREVIEWS.find((p) => p.id === id);
  const snapshot = boost(current, id);
  const fresh = evaluateNewRewards(snapshot, unlocked).map((r) => r.id);
  const all = new Set([...unlocked, ...fresh]);
  const books = [...currentBooks].sort((a, b) => a.shelfIndex - b.shelfIndex);
  let filler = 0;
  while (books.length < snapshot.booksCompleted) books.push(fillerBook(filler++, books.length));
  return {
    label: def?.label ?? id,
    snapshot,
    unlocked: all,
    world: deriveWorldState(snapshot, all, true),
    books,
    celebrate: fresh,
  };
}
