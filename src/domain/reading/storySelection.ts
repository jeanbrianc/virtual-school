/** Question history is explicit, child-scoped metadata, never guessed from titles or prose. */
import { BOOK_CATALOG, getCatalogBook } from './bookCatalog';
import type { Book, Evidence } from '../types';

export function storyQuestionMarker(id: string): string {
  return `[story-question:${id}]`;
}

/** Most recently answered first. Old evidence without markers remains unchanged. */
export function recentStoryQuestionIds(books: readonly Book[], evidence: readonly Evidence[]): string[] {
  const byId = new Map(books.map((book) => [book.id, book]));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of [...evidence].sort((a, b) => b.observedAt.localeCompare(a.observedAt))) {
    const book = byId.get(item.source.id);
    if (item.source.type !== 'book' || !book || item.childId !== book.childId || item.createdBy !== 'system') continue;
    const questions = getCatalogBook(book.catalogId)?.questions ?? [];
    for (const match of item.excerpt?.matchAll(/\[story-question:([a-z0-9-]+\.q\d+)\]/g) ?? []) {
      const id = match[1]!;
      if (!seen.has(id) && questions.some((q) => q.id === id && q.skillId === item.skillId)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/** Only the exact built-in question and skill can claim a catalog question ID. */
export function catalogQuestionMarker(id: string, skillId: string, prompt: string, catalogId?: string): string {
  const book = getCatalogBook(catalogId);
  const q = book?.questions.find((q) => q.id === id && q.skillId === skillId && q.prompt === prompt);
  return q ? `${storyQuestionMarker(q.id)} ` : '';
}

/** Useful for validation without exposing text as a history-matching heuristic. */
export const STORY_QUESTION_IDS = new Set(BOOK_CATALOG.flatMap((book) => book.questions.map((q) => q.id)));
