import { useMemo } from 'react';
import type { CoverStyle } from '../../domain/types';
import { coverDataUrl } from '../../shared/coverPainter';

/** Renders the same procedural cover used on the 3D shelf. */
export function BookCover({ title, author, cover, width = 120, className = '' }: { title: string; author: string; cover: CoverStyle; width?: number; className?: string }) {
  const src = useMemo(() => coverDataUrl({ title, author, cover }, Math.round(width * 1.6)), [title, author, cover, width]);
  return <img className={`book-cover ${className}`} src={src} width={width} height={Math.round(width * 1.45)} alt={`${title} by ${author}`} draggable={false} />;
}
