/**
 * First-day discovery: every interactive thing in the school starts "new"
 * (marked with a sparkle). The first time the child touches it, it explains
 * itself in one short, read-aloud-friendly card. Teachers introduce
 * themselves in their own dialogue instead of a card.
 *
 * Pure data + text so it can be tested and reused (no UI, no engine).
 */
import type { ProgressSnapshot } from './progress/snapshot';
import { getReward } from './rewards/catalog';
import { ruleProgress } from './rewards/engine';
import type { WorldState } from './world/worldState';

export const TEACHER_DISCOVERIES = ['hoot', 'digit', 'nova'] as const;

/** Everything a child can discover, in the order a guide would show them. */
export const DISCOVERABLE_IDS = [
  'hoot',
  'bookshelf',
  'circuit',
  'digit',
  'rocket',
  'nova',
  'tank',
  'museum',
  'trophies',
  'nature',
  'greenhouse',
  'artStudio',
  'nook',
] as const;

export interface DiscoveryContext {
  name: string;
  world: WorldState;
  snapshot: ProgressSnapshot;
}

export interface Discovery {
  id: string;
  icon: string;
  title: string;
  text: string;
  /** Progress toward opening a locked room. */
  progress?: { current: number; target: number };
  /** Optional follow-up button (e.g. "Help Digit"). `target` is an interactable id. */
  action?: { label: string; target: string; icon: string };
}

export function isTeacherDiscovery(id: string): boolean {
  return (TEACHER_DISCOVERIES as readonly string[]).includes(id);
}

function lockProgress(rewardId: string, snapshot: ProgressSnapshot): { current: number; target: number } | undefined {
  const reward = getReward(rewardId);
  if (!reward) return undefined;
  const p = ruleProgress(reward.rule, snapshot);
  return { current: p.current, target: p.target };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The one-time explanation for an object (null for teachers and unknown ids). */
export function describeDiscovery(id: string, ctx: DiscoveryContext): Discovery | null {
  const { name, world, snapshot } = ctx;
  switch (id) {
    case 'bookshelf':
      return {
        id,
        icon: '📚',
        title: 'My Bookshelf',
        text:
          snapshot.booksCompleted === 0
            ? `This is YOUR bookshelf, ${name}! It’s empty right now. When you finish a book, tell Professor Hoot all about it — and the book will fly right onto this shelf!`
            : `This is YOUR bookshelf, ${name}! It has ${plural(snapshot.booksCompleted, 'book')} on it. Every book you finish with Professor Hoot flies onto this shelf.`,
        action: { label: 'Find Professor Hoot', target: 'hoot', icon: '🦉' },
      };
    case 'circuit':
      return {
        id,
        icon: '🤸',
        title: 'The Dance Circuit',
        text: `The numbers on the rug are dance and gym stations, ${name}! Hop onto a number and you do a move — a twirl, a star jump, even a backflip! Go 1, 2, 3… all the way to 10 to finish the whole circuit.`,
        action: { label: 'Start the circuit', target: 'circuit', icon: '🤸' },
      };
    case 'tank':
      return {
        id,
        icon: '💧',
        title: 'The Water Tank',
        text: 'A tank full of water for experiments! Some things sink to the bottom and some things float on top. Nova the scientist tests things here.',
        action: { label: 'Try it with Nova', target: 'tank', icon: '🔬' },
      };
    case 'rocket':
      return {
        id,
        icon: '🚀',
        title: 'Digit’s Launch Pad',
        text:
          world.rocketStage === 0
            ? 'Digit wants to build a rocket to the moon, but first the moon rocks need rescuing! Every math mission you do with Digit adds a new piece to the rocket.'
            : `Digit’s rocket is being built! It has ${plural(world.rocketStage, 'piece')} so far. Every math mission adds more.`,
        action: { label: 'Help Digit', target: 'digit', icon: '🤖' },
      };
    case 'museum':
      return {
        id,
        icon: '🏛️',
        title: 'My Learning Museum',
        text: 'This board opens your very own museum! Your family can visit it to see your books, your art and all the things you learn.',
        action: { label: 'Visit my museum', target: 'museum', icon: '🏛️' },
      };
    case 'trophies':
      return {
        id,
        icon: '🏆',
        title: 'My Treasure Shelf',
        text:
          world.trophies.length === 0
            ? 'Trophies and special treasures you earn by learning go on this shelf. It’s empty now — but not for long!'
            : `Your treasures live here! You have ${plural(world.trophies.length, 'trophy')} so far.`,
      };
    case 'nature':
      return {
        id,
        icon: '🍂',
        title: 'The Nature Table',
        text: 'Treasures from nature walks live here — acorns, feathers, pinecones and more. Ask a grown-up to add what you find outside!',
      };
    case 'greenhouse':
      return world.greenhouseOpen
        ? { id, icon: '🌱', title: 'The Greenhouse', text: 'The greenhouse is open! Every plant in here grew from something you learned about plants.' }
        : {
            id,
            icon: '🌱',
            title: 'The Greenhouse',
            text: 'The greenhouse doors are locked! Learning about plants — planting seeds, reading about them, watching them grow — will open them.',
            ...optionalProgress(lockProgress('room.greenhouse', snapshot)),
          };
    case 'artStudio':
      return world.artStudioOpen
        ? { id, icon: '🎨', title: 'The Art Studio', text: 'Your very own art studio, with easels ready for your next masterpiece!' }
        : {
            id,
            icon: '🎨',
            title: 'The Art Studio',
            text: 'An art studio is hiding behind this door! Every picture you make — and a grown-up saves — helps open it.',
            ...optionalProgress(lockProgress('room.art-studio', snapshot)),
          };
    case 'nook':
      return world.readingNookOpen
        ? { id, icon: '🏕️', title: 'The Reading Nook', text: 'The coziest corner in the whole school — made for reading.' }
        : {
            id,
            icon: '🏕️',
            title: 'The Secret Reading Nook',
            text: 'Shh… a cozy reading nook is hiding behind this curtain. It opens when your bookshelf has 25 books!',
            ...optionalProgress(lockProgress('room.reading-nook', snapshot)),
          };
    default:
      return null;
  }
}

function optionalProgress(p: { current: number; target: number } | undefined): { progress?: { current: number; target: number } } {
  return p ? { progress: p } : {};
}

/** Shown the very first time a child enters her school. */
export function welcomeDiscovery(name: string): Discovery {
  return {
    id: '__welcome',
    icon: '🏫',
    title: `Welcome to your school, ${name}!`,
    text: 'This is your very own school. Things with a ✨ sparkle are new — walk over (or tap them) to find out what they do. Professor Hoot, Digit and Nova can’t wait to meet you!',
    action: { label: 'Meet Professor Hoot', target: 'hoot', icon: '🦉' },
  };
}

export const EXPLORER_CELEBRATION = {
  icon: '🧭',
  title: 'School Explorer!',
  message: 'You found every corner of your school. Now the real adventures can begin!',
};

/** Which of the currently available things are still undiscovered. */
export function undiscovered(available: readonly string[], explored: readonly string[]): string[] {
  const seen = new Set(explored);
  return available.filter((id) => (DISCOVERABLE_IDS as readonly string[]).includes(id) && !seen.has(id));
}
