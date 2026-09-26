/**
 * Derives what the 3D school should look like from learning progress.
 * The engine renders a WorldState; it never reads the database directly.
 * Milestone previews simply pass a hypothetical snapshot here.
 */
import type { ProgressSnapshot } from '../progress/snapshot';
import { SHELF_CAPACITIES } from '../rewards/catalog';

export interface WorldState {
  shelfUnits: number;
  shelfCapacities: number[];
  booksOnShelves: number;
  readingLamp: boolean;
  storyStars: boolean;
  readingNookOpen: boolean;
  grandLibrary: boolean;
  greenhouseOpen: boolean;
  /** Number of plants growing in the greenhouse/windowsill (0..16). */
  plantCount: number;
  fossilDisplay: boolean;
  dinoSkeleton: boolean;
  telescope: boolean;
  planetMobile: boolean;
  natureTable: boolean;
  natureItems: string[];
  artLine: boolean;
  artworkCount: number;
  artStudioOpen: boolean;
  /** 0 = none, 1 = launch base, 2 = body, 3 = nose cone, 4 = launch-ready. */
  rocketStage: number;
  aquariumFish: number;
  pets: string[];
  trophies: string[];
  preview: boolean;
}

export const MAX_PLANTS = 16;
export const MAX_FISH = 8;

export function deriveWorldState(snap: ProgressSnapshot, unlocked: ReadonlySet<string>, preview = false): WorldState {
  const has = (id: string) => unlocked.has(id);
  const shelfUnits = 1 + (['shelf.2', 'shelf.3', 'room.grand-library'] as const).filter(has).length;
  const moonMissions = snap.lessonCompletions['moon-rocks'] ?? 0;
  const rocketStage = moonMissions === 0 ? 0 : has('effect.rocket-launchpad') ? 4 : Math.min(3, moonMissions);

  return {
    shelfUnits,
    shelfCapacities: SHELF_CAPACITIES.slice(0, shelfUnits),
    booksOnShelves: snap.booksCompleted,
    readingLamp: has('decor.reading-lamp'),
    storyStars: has('effect.story-stars'),
    readingNookOpen: has('room.reading-nook'),
    grandLibrary: has('room.grand-library'),
    greenhouseOpen: has('room.greenhouse'),
    plantCount: Math.min(MAX_PLANTS, snap.topicCounts['plants'] ?? 0),
    fossilDisplay: has('exhibit.fossil'),
    dinoSkeleton: has('exhibit.dino-skeleton'),
    telescope: has('decor.telescope'),
    planetMobile: has('effect.planets'),
    natureTable: has('exhibit.nature-table'),
    natureItems: snap.natureItems.slice(-12),
    artLine: has('decor.art-line'),
    artworkCount: snap.artworks,
    artStudioOpen: has('room.art-studio'),
    rocketStage,
    aquariumFish: Math.min(MAX_FISH, 2 + (snap.lessonCompletions['sink-float'] ?? 0)),
    pets: ['pet.bookworm', 'pet.hedgehog', 'pet.dragon'].filter(has),
    trophies: [...unlocked].filter((id) => id.startsWith('trophy.')).sort(),
    preview,
  };
}

/** Which shelf unit and slot a book with a given shelf index lands in. */
export function shelfSlot(index: number, capacities: readonly number[] = SHELF_CAPACITIES): { unit: number; slot: number } {
  let remaining = index;
  for (let unit = 0; unit < capacities.length; unit++) {
    const cap = capacities[unit] ?? 0;
    if (remaining < cap) return { unit, slot: remaining };
    remaining -= cap;
  }
  // Beyond all shelves: overflow stack beside the last shelf.
  return { unit: capacities.length, slot: remaining };
}
