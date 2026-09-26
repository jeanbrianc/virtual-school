import type { WorldState } from '../domain/world/worldState';
import type { ShelfBook } from '../engine/world/bookshelf';
import { createStore } from './store';

/** A hypothetical world shown in child mode without touching saved progress. */
export interface PreviewState {
  label: string;
  world: WorldState;
  books: ShelfBook[];
  celebrate: string[];
}

export interface AppState {
  preview: PreviewState | null;
  /** Set after the parent gate succeeds; cleared when returning to child mode. */
  parentUnlocked: boolean;
}

export const appStore = createStore<AppState>({ preview: null, parentUnlocked: false });
