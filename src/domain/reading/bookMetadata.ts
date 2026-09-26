/**
 * BookMetadataService — lookup abstraction for book details.
 *
 * Only the local catalog ships today. A remote provider (e.g. Open Library)
 * would implement the same interface, be disabled by default, and be called
 * only from parent mode — never from the child experience.
 */
import type { CoverMotif, CoverStyle } from '../types';
import { hashString } from '../util/random';
import { BOOK_CATALOG, type CatalogBook } from './bookCatalog';

export interface BookMetadata {
  catalogId?: string;
  title: string;
  author: string;
  totalChapters?: number;
  totalPages?: number;
  band?: string;
  tags: string[];
  cover: CoverStyle;
  source: 'local-catalog' | 'generated';
}

export interface BookMetadataService {
  readonly id: string;
  search(query: string, limit?: number): Promise<BookMetadata[]>;
}

export function catalogToMetadata(b: CatalogBook): BookMetadata {
  return {
    catalogId: b.id,
    title: b.title,
    author: b.author,
    ...(b.totalChapters ? { totalChapters: b.totalChapters } : {}),
    ...(b.totalPages ? { totalPages: b.totalPages } : {}),
    band: b.band,
    tags: b.tags,
    cover: b.cover,
    source: 'local-catalog',
  };
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export class LocalBookCatalogService implements BookMetadataService {
  readonly id = 'local-catalog';

  async search(query: string, limit = 6): Promise<BookMetadata[]> {
    return searchCatalogSync(query, limit).map(catalogToMetadata);
  }
}

export function searchCatalogSync(query: string, limit = 6): CatalogBook[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  return BOOK_CATALOG.map((b) => {
    const title = normalize(b.title);
    const author = normalize(b.author);
    let score = 0;
    if (title === q) score += 100;
    if (title.includes(q)) score += 50;
    for (const w of words) {
      if (w.length < 2) continue;
      if (title.includes(w)) score += 10;
      if (author.includes(w)) score += 6;
    }
    return { b, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.b);
}

/** Finds a catalog book whose title appears in free text (used by the interpreter). */
export function findCatalogTitleInText(text: string): CatalogBook | undefined {
  const t = normalize(text);
  let best: { b: CatalogBook; len: number } | undefined;
  for (const b of BOOK_CATALOG) {
    const variants = [normalize(b.title), normalize(b.title).replace(/^the /, '')];
    const short = normalize(b.title.split(':')[0] ?? b.title);
    variants.push(short);
    for (const v of variants) {
      if (v.length >= 6 && t.includes(v) && (!best || v.length > best.len)) best = { b, len: v.length };
    }
  }
  return best?.b;
}

const MOTIFS: CoverMotif[] = ['star', 'leaf', 'moon', 'fish', 'house', 'heart', 'owl', 'bear'];
const PALETTE: [string, string][] = [
  ['#c8553d', '#fbe9d0'],
  ['#2f7f8a', '#f6e7c1'],
  ['#5f8f4e', '#f7efd8'],
  ['#8a5a9e', '#f5e6f7'],
  ['#b8862f', '#fff3d9'],
  ['#4a6fa5', '#e9f0fb'],
  ['#d0679d', '#fde8f1'],
  ['#7d5a44', '#f4e3cf'],
];

/** Deterministic, pleasant cover for books without catalog art. */
export function generatedCover(title: string): CoverStyle {
  const h = hashString(title);
  const [background, accent] = PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
  return { background, accent, motif: MOTIFS[(h >>> 8) % MOTIFS.length] ?? 'star' };
}
