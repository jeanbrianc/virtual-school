/**
 * ProgressSnapshot: the minimal aggregate that drives rewards and world growth.
 * Built from persisted records by pure functions so it is trivially testable
 * and can be "faked" for milestone previews without touching real data.
 */
import type { Activity, Book, Evidence, LessonAttempt, MasteryRecord, PortfolioItem } from '../types';
import { effectiveLevel } from '../mastery/masteryEngine';

export interface ProgressSnapshot {
  booksCompleted: number;
  /** Distinct learning sources (activity, lesson, book) per topic tag. */
  topicCounts: Record<string, number>;
  lessonCompletions: Record<string, number>;
  totalLessons: number;
  artworks: number;
  natureItems: string[];
  masteredSkills: number;
  proficientSkills: number;
  masteredByDomain: Record<string, number>;
}

export interface SnapshotInputs {
  books: Book[];
  evidence: Evidence[];
  activities: Activity[];
  lessons: LessonAttempt[];
  portfolio: PortfolioItem[];
  mastery: MasteryRecord[];
}

export const emptySnapshot = (): ProgressSnapshot => ({
  booksCompleted: 0,
  topicCounts: {},
  lessonCompletions: {},
  totalLessons: 0,
  artworks: 0,
  natureItems: [],
  masteredSkills: 0,
  proficientSkills: 0,
  masteredByDomain: {},
});

export function buildSnapshot(input: SnapshotInputs, skillDomain: (skillId: string) => string | undefined): ProgressSnapshot {
  const snap = emptySnapshot();
  const completed = input.books.filter((b) => b.status === 'completed');
  snap.booksCompleted = completed.length;

  const topicSources = new Map<string, Set<string>>();
  const addTopic = (topic: string, source: string) => {
    const t = topic.toLowerCase();
    if (!topicSources.has(t)) topicSources.set(t, new Set());
    topicSources.get(t)?.add(source);
  };
  for (const e of input.evidence) for (const t of e.topics) addTopic(t, `${e.source.type}:${e.source.id}`);
  for (const a of input.activities) for (const t of a.topics) addTopic(t, `activity:${a.id}`);
  for (const b of completed) for (const t of b.tags) addTopic(t, `book:${b.id}`);
  for (const [topic, sources] of topicSources) snap.topicCounts[topic] = sources.size;

  for (const l of input.lessons) {
    snap.lessonCompletions[l.lessonId] = (snap.lessonCompletions[l.lessonId] ?? 0) + 1;
    snap.totalLessons += 1;
  }

  snap.artworks = input.portfolio.filter((p) => p.kind === 'artwork').length;

  const items: string[] = [];
  for (const a of [...input.activities].sort((x, y) => x.date.localeCompare(y.date))) {
    for (const item of a.natureItems ?? []) items.push(item);
  }
  snap.natureItems = items;

  for (const m of input.mastery) {
    const level = effectiveLevel(m);
    if (level === 'mastered') {
      snap.masteredSkills += 1;
      const d = skillDomain(m.skillId);
      if (d) snap.masteredByDomain[d] = (snap.masteredByDomain[d] ?? 0) + 1;
    }
    if (level === 'proficient' || level === 'mastered') snap.proficientSkills += 1;
  }
  return snap;
}
