import type { Book } from '../types';

export type BookHistoryStatus = 'ready' | 'loading' | 'unavailable';

/** Absence of loaded history is never evidence of a first completed book. */
export function finishedBookGreeting(books: Pick<Book, 'status'>[], status: BookHistoryStatus = 'ready'): string {
  if (status !== 'ready') return 'Hoo-ray, you finished a book!';
  return books.some((book) => book.status === 'completed') ? 'Hoo-ray, another book for your shelf!' : 'Hoo-ray, your first book for this shelf!';
}
