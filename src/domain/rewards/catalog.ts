/**
 * Reward catalog. Rewards celebrate genuine learning — every rule is tied to
 * completed books, lessons, recorded activities or demonstrated mastery.
 * There are no currencies, random drops, timers or streak penalties.
 */
export type RewardKind = 'pet' | 'shelf' | 'room' | 'trophy' | 'exhibit' | 'decor' | 'effect';

export type RewardRule =
  | { type: 'books'; count: number }
  | { type: 'topic'; topic: string; count: number }
  | { type: 'lesson'; lessonId: string; count: number }
  | { type: 'artworks'; count: number }
  | { type: 'masteredInDomain'; domainId: string; count: number };

export interface RewardDefinition {
  id: string;
  kind: RewardKind;
  /** Parent-facing name. */
  name: string;
  /** Child-facing celebration headline. */
  childTitle: string;
  childMessage: string;
  /** Short hint for what earns it (child-friendly). */
  hint: string;
  rule: RewardRule;
  icon: string;
  celebration: 'grand' | 'normal';
}

export const REWARDS: RewardDefinition[] = [
  // ── Reading milestones ──────────────────────────────────────────────────
  {
    id: 'pet.bookworm',
    kind: 'pet',
    name: 'Pip the Bookworm (companion)',
    childTitle: 'Pip the Bookworm!',
    childMessage: 'A tiny bookworm wiggled out of your very first book. Pip will follow you everywhere!',
    hint: 'Finish your first book',
    rule: { type: 'books', count: 1 },
    icon: '🐛',
    celebration: 'normal',
  },
  {
    id: 'decor.reading-lamp',
    kind: 'decor',
    name: 'Golden Reading Lamp',
    childTitle: 'A Golden Reading Lamp!',
    childMessage: 'Five books! A warm golden lamp now glows by your reading chair.',
    hint: 'Read 5 books',
    rule: { type: 'books', count: 5 },
    icon: '💡',
    celebration: 'normal',
  },
  {
    id: 'shelf.2',
    kind: 'shelf',
    name: 'Bookshelf expansion (shelf 2)',
    childTitle: 'Your bookshelf is growing!',
    childMessage: 'Your first shelf is completely full — so a brand-new bookshelf appeared for your next adventures!',
    hint: 'Fill your first bookshelf (10 books)',
    rule: { type: 'books', count: 10 },
    icon: '📚',
    celebration: 'grand',
  },
  {
    id: 'trophy.books-10',
    kind: 'trophy',
    name: 'Ten-Book Trophy',
    childTitle: 'Ten-Book Trophy!',
    childMessage: 'You read ten whole books. That deserves a shiny trophy!',
    hint: 'Read 10 books',
    rule: { type: 'books', count: 10 },
    icon: '🏆',
    celebration: 'normal',
  },
  {
    id: 'effect.story-stars',
    kind: 'effect',
    name: 'Story Stars (library ceiling)',
    childTitle: 'Story Stars!',
    childMessage: 'Glowing paper stars now float above your library — one for every story you’ve loved.',
    hint: 'Read 15 books',
    rule: { type: 'books', count: 15 },
    icon: '⭐',
    celebration: 'normal',
  },
  {
    id: 'room.reading-nook',
    kind: 'room',
    name: 'Reading Nook',
    childTitle: 'The Reading Nook is open!',
    childMessage: 'The curtain opened! A cozy nook with pillows and twinkly lights is waiting for you.',
    hint: 'Read 25 books',
    rule: { type: 'books', count: 25 },
    icon: '🏕️',
    celebration: 'grand',
  },
  {
    id: 'shelf.3',
    kind: 'shelf',
    name: 'Bookshelf expansion (shelf 3)',
    childTitle: 'Another new bookshelf!',
    childMessage: 'Two full shelves! A third bookshelf is ready for more stories.',
    hint: 'Read 25 books',
    rule: { type: 'books', count: 25 },
    icon: '📚',
    celebration: 'normal',
  },
  {
    id: 'trophy.books-25',
    kind: 'trophy',
    name: 'Twenty-Five Book Trophy',
    childTitle: 'Silver Book Trophy!',
    childMessage: 'Twenty-five books! Your trophy shelf is sparkling.',
    hint: 'Read 25 books',
    rule: { type: 'books', count: 25 },
    icon: '🥈',
    celebration: 'normal',
  },
  {
    id: 'room.grand-library',
    kind: 'room',
    name: 'Grand Library (shelf 4, ladder & chandelier)',
    childTitle: 'The Grand Library!',
    childMessage: 'Fifty books! Your library grew all the way to the ceiling — with a rolling ladder!',
    hint: 'Read 50 books',
    rule: { type: 'books', count: 50 },
    icon: '🏛️',
    celebration: 'grand',
  },
  {
    id: 'trophy.books-50',
    kind: 'trophy',
    name: 'Fifty-Book Trophy',
    childTitle: 'Gold Book Trophy!',
    childMessage: 'Fifty books — a golden trophy for a golden reader!',
    hint: 'Read 50 books',
    rule: { type: 'books', count: 50 },
    icon: '🥇',
    celebration: 'normal',
  },
  {
    id: 'pet.dragon',
    kind: 'pet',
    name: 'Ember the Book Dragon (companion)',
    childTitle: 'Ember the Book Dragon!',
    childMessage: 'ONE HUNDRED BOOKS! A little dragon hatched from the magic of every story you read. Ember is yours forever!',
    hint: 'Read 100 books',
    rule: { type: 'books', count: 100 },
    icon: '🐉',
    celebration: 'grand',
  },
  {
    id: 'trophy.books-100',
    kind: 'trophy',
    name: 'Hundred-Book Crown Trophy',
    childTitle: 'The Hundred-Book Crown!',
    childMessage: 'The rarest trophy in the whole school. You earned it, one page at a time.',
    hint: 'Read 100 books',
    rule: { type: 'books', count: 100 },
    icon: '👑',
    celebration: 'normal',
  },
  // ── Science & nature ────────────────────────────────────────────────────
  {
    id: 'room.greenhouse',
    kind: 'room',
    name: 'Greenhouse',
    childTitle: 'The Greenhouse is open!',
    childMessage: 'You learned so much about plants that the greenhouse doors swung open. Go explore!',
    hint: 'Make 3 plant discoveries',
    rule: { type: 'topic', topic: 'plants', count: 3 },
    icon: '🌱',
    celebration: 'grand',
  },
  {
    id: 'exhibit.fossil',
    kind: 'exhibit',
    name: 'Fossil Display',
    childTitle: 'A real-looking fossil!',
    childMessage: 'Your dinosaur learning dug up an ancient fossil for your museum corner.',
    hint: 'Learn about dinosaurs',
    rule: { type: 'topic', topic: 'dinosaurs', count: 1 },
    icon: '🦴',
    celebration: 'normal',
  },
  {
    id: 'exhibit.dino-skeleton',
    kind: 'exhibit',
    name: 'Dinosaur Skeleton Exhibit',
    childTitle: 'A dinosaur skeleton!',
    childMessage: 'Your dinosaur discoveries assembled a whole skeleton. ROAR!',
    hint: 'Make 3 dinosaur discoveries',
    rule: { type: 'topic', topic: 'dinosaurs', count: 3 },
    icon: '🦖',
    celebration: 'grand',
  },
  {
    id: 'decor.telescope',
    kind: 'decor',
    name: 'Stargazing Telescope',
    childTitle: 'A brass telescope!',
    childMessage: 'A telescope appeared by the big window. The stars are waiting!',
    hint: 'Make 2 space discoveries',
    rule: { type: 'topic', topic: 'space', count: 2 },
    icon: '🔭',
    celebration: 'normal',
  },
  {
    id: 'effect.planets',
    kind: 'effect',
    name: 'Planet Mobile',
    childTitle: 'The planets are here!',
    childMessage: 'A glowing planet mobile now spins across the ceiling.',
    hint: 'Make 3 space discoveries',
    rule: { type: 'topic', topic: 'space', count: 3 },
    icon: '🪐',
    celebration: 'normal',
  },
  {
    id: 'exhibit.nature-table',
    kind: 'exhibit',
    name: 'Nature Exhibit Table',
    childTitle: 'Your Nature Museum!',
    childMessage: 'Treasures from your nature walks now have their own display table.',
    hint: 'Go on a nature walk',
    rule: { type: 'topic', topic: 'nature', count: 1 },
    icon: '🍂',
    celebration: 'normal',
  },
  {
    id: 'pet.hedgehog',
    kind: 'pet',
    name: 'Bramble the Hedgehog (companion)',
    childTitle: 'Bramble the Hedgehog!',
    childMessage: 'Nova’s curious hedgehog friend wants to explore with you after all those experiments!',
    hint: 'Do 3 science experiments with Nova',
    rule: { type: 'lesson', lessonId: 'sink-float', count: 3 },
    icon: '🦔',
    celebration: 'normal',
  },
  // ── Math ────────────────────────────────────────────────────────────────
  {
    id: 'decor.rocket',
    kind: 'decor',
    name: 'Digit’s Moon Rocket',
    childTitle: 'A rocket is being built!',
    childMessage: 'Every moon-rock mission helps Digit build the rocket. Look in the math corner!',
    hint: 'Help Digit with a moon-rock mission',
    rule: { type: 'lesson', lessonId: 'moon-rocks', count: 1 },
    icon: '🚀',
    celebration: 'normal',
  },
  {
    id: 'effect.rocket-launchpad',
    kind: 'effect',
    name: 'Rocket Launch Pad',
    childTitle: 'Rocket ready for launch!',
    childMessage: 'Five missions! The rocket is finished and the launch pad lights are glowing.',
    hint: 'Finish 5 moon-rock missions',
    rule: { type: 'lesson', lessonId: 'moon-rocks', count: 5 },
    icon: '✨',
    celebration: 'grand',
  },
  {
    id: 'trophy.number-star',
    kind: 'trophy',
    name: 'Number Star Trophy',
    childTitle: 'Number Star!',
    childMessage: 'You know three kinds of math by heart. Digit made you a star trophy!',
    hint: 'Master 3 math skills',
    rule: { type: 'masteredInDomain', domainId: 'math', count: 3 },
    icon: '🌟',
    celebration: 'normal',
  },
  // ── Art ─────────────────────────────────────────────────────────────────
  {
    id: 'decor.art-line',
    kind: 'decor',
    name: 'Classroom Art Line',
    childTitle: 'Your art is on the wall!',
    childMessage: 'Your artwork is hanging in your classroom for everyone to see.',
    hint: 'Make a piece of art',
    rule: { type: 'artworks', count: 1 },
    icon: '🎨',
    celebration: 'normal',
  },
  {
    id: 'room.art-studio',
    kind: 'room',
    name: 'Art Studio',
    childTitle: 'The Art Studio is open!',
    childMessage: 'Five artworks! The Art Studio door opened, full of easels and paint.',
    hint: 'Make 5 artworks',
    rule: { type: 'artworks', count: 5 },
    icon: '🖌️',
    celebration: 'grand',
  },
];

const rewardIndex = new Map(REWARDS.map((r) => [r.id, r]));

export function getReward(id: string): RewardDefinition | undefined {
  return rewardIndex.get(id);
}

/** Bookshelf capacities in the order shelves unlock (cumulative 10/25/50/100). */
export const SHELF_CAPACITIES = [10, 15, 25, 50] as const;
