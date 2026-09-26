import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../../app/services';
import type { Avatar, Book, Child, Household } from '../../domain/types';
import type { WorldState } from '../../domain/world/worldState';
import type { ShelfBook } from '../../engine/world/bookshelf';
import type { ChildRecords } from '../../services/learningCore';
import { loadChildRecords, snapshotFromRecords, worldFromRecords } from '../../services/learningCore';
import { getAvatar, getHousehold } from '../../services/householdService';
import type { ProgressSnapshot } from '../../domain/progress/snapshot';

export interface ChildWorldData {
  household: Household;
  child: Child;
  avatar: Avatar;
  records: ChildRecords;
  world: WorldState;
  snapshot: ProgressSnapshot;
  shelfBooks: ShelfBook[];
}

export function shelfBooksFrom(books: Book[]): ShelfBook[] {
  return books
    .filter((b) => b.status === 'completed')
    .map((b) => ({ id: b.id, title: b.title, author: b.author, cover: b.cover, shelfIndex: b.shelfIndex ?? 0 }))
    .sort((a, b) => a.shelfIndex - b.shelfIndex);
}

/** Loads everything the 3D school needs for one child (explicit reloads only). */
export function useChildWorld(childId: string): { data: ChildWorldData | null; error: string | null; reload: () => Promise<ChildWorldData | null> } {
  const { ctx } = useServices();
  const [data, setData] = useState<ChildWorldData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [household, child, avatar, records] = await Promise.all([
      getHousehold(ctx),
      ctx.repos.children.get(childId),
      getAvatar(ctx, childId),
      loadChildRecords(ctx, childId),
    ]);
    if (!household || !child || !avatar) {
      setError('We couldn’t find this learner.');
      return null;
    }
    const next: ChildWorldData = {
      household,
      child,
      avatar,
      records,
      world: worldFromRecords(records),
      snapshot: snapshotFromRecords(records),
      shelfBooks: shelfBooksFrom(records.books),
    };
    setData(next);
    return next;
  }, [ctx, childId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}
