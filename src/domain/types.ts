/**
 * Core entity types for the household learning model.
 *
 * Household → Parents → Children → (independent) Books, Activities, Evidence,
 * Mastery, Rewards, Portfolio, Reports, Teacher interactions, Avatar.
 *
 * Every child-scoped entity carries `childId` and is only ever queried through
 * that key, which is what keeps siblings' progress separable.
 */

export type ID = string;
/** Calendar day in local time, `YYYY-MM-DD`. */
export type DayString = string;
/** Full ISO-8601 timestamp. */
export type Timestamp = string;

// ─── Household ────────────────────────────────────────────────────────────────

export type GraphicsQuality = 'high' | 'balanced' | 'low';

export interface AudioSettings {
  master: number; // 0..1
  effects: number; // 0..1
  ambience: number; // 0..1
  voice: number; // 0..1
  muted: boolean;
}

export interface InterpretationSettings {
  /** `local` = on-device heuristics (default). `http` = parent-configured AI endpoint. */
  provider: 'local' | 'http';
  endpoint?: string;
  /** Parent must explicitly opt in before any narrative leaves the device. */
  consentToSend: boolean;
}

export interface TeacherAiSettings {
  enabled: boolean;
  /** The family's helper, normally http://127.0.0.1:8787 (see scripts/ai-helper). */
  endpoint: string;
  /** Parent understands her words (not audio) are sent to the AI service. */
  consentToSend: boolean;
}

export interface HouseholdSettings {
  parentPin: string;
  audio: AudioSettings;
  readAloud: boolean;
  /** The built-in voice teachers read with (its name on this device); '' or unset = pick automatically. */
  voiceName?: string;
  /**
   * Talking to teachers by voice: 'off', 'device' (on-device recognition only —
   * audio never leaves the computer) or 'browser' (the browser's speech service
   * may be used when on-device isn't available).
   */
  talkMode: 'off' | 'device' | 'browser';
  graphicsQuality: GraphicsQuality;
  interpretation: InterpretationSettings;
  /** Optional AI teachers through the family's local helper (off until a parent consents). */
  teacherAi: TeacherAiSettings;
  /** Shows demo tooling (milestone previews, demo banners). */
  demoTools: boolean;
}

export interface Household {
  id: ID;
  name: string;
  createdAt: Timestamp;
  settings: HouseholdSettings;
  schemaVersion: number;
}

export interface Parent {
  id: ID;
  householdId: ID;
  displayName: string;
  role: 'admin' | 'caregiver';
  createdAt: Timestamp;
}

export interface Child {
  id: ID;
  householdId: ID;
  name: string;
  /** Optional — used only to phrase age-relative notes for parents. */
  birthDate?: DayString;
  /**
   * How the read-aloud voices should say her name — a respelling such as
   * "Izzee" (see domain/pronounce.ts). Used only for speech; never shown.
   */
  sayName?: string;
  status: 'active' | 'inactive';
  avatarId: ID;
  createdAt: Timestamp;
  /** Currently following pet companion (reward id). */
  activePetId?: string;
  /** Things in the school she has already discovered (interactable ids). */
  explored?: string[];
  isDemo?: boolean;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export type HairStyle = 'pigtails' | 'bob' | 'ponytail' | 'curls' | 'long' | 'buns' | 'short';
export type OutfitStyle = 'overalls' | 'dress' | 'tee' | 'sweater' | 'labcoat';
export type Accessory = 'none' | 'bow' | 'glasses' | 'flowerCrown' | 'headband' | 'backpack' | 'starClips';

export interface AvatarConfig {
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  outfit: OutfitStyle;
  outfitColor: string;
  accentColor: string;
  accessory: Accessory;
  shoeColor: string;
}

export interface Avatar extends AvatarConfig {
  id: ID;
  childId: ID;
  /** Parent-uploaded inspiration photo (stored locally only). */
  inspirationMediaId?: ID;
  updatedAt: Timestamp;
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export type BookStatus = 'up_next' | 'reading' | 'completed' | 'paused';
export type ReadingMode = 'independent' | 'shared' | 'read_aloud' | 'mixed';

export interface BookDifficulty {
  /** Free-form band like "Grades 2–3" (parent-facing only). */
  band?: string;
  lexile?: number;
  notes?: string;
}

export interface CoverStyle {
  background: string;
  accent: string;
  motif: CoverMotif;
}

export type CoverMotif =
  | 'rabbit'
  | 'frog'
  | 'caterpillar'
  | 'pig'
  | 'dog'
  | 'bear'
  | 'owl'
  | 'dino'
  | 'spider'
  | 'dragon'
  | 'boxcar'
  | 'magnifier'
  | 'star'
  | 'leaf'
  | 'moon'
  | 'fish'
  | 'house'
  | 'heart';

export interface Book {
  id: ID;
  childId: ID;
  title: string;
  author: string;
  catalogId?: string;
  cover: CoverStyle;
  coverMediaId?: ID;
  status: BookStatus;
  dateAdded: DayString;
  dateStarted?: DayString;
  dateCompleted?: DayString;
  totalChapters?: number;
  totalPages?: number;
  chaptersRead?: number;
  pagesRead?: number;
  childRating?: number; // 1..5
  favoritePart?: string;
  parentNotes?: string;
  comprehensionNotes?: string;
  workSampleMediaId?: ID;
  readingMode: ReadingMode;
  tags: string[];
  difficulty?: BookDifficulty;
  /** Position on the 3D shelf; assigned at completion, stable forever after. */
  shelfIndex?: number;
  /** Set when the child added the title herself — parents can tidy it up. */
  needsParentReview?: boolean;
  isDemo?: boolean;
}

export interface ReadingSession {
  id: ID;
  childId: ID;
  bookId: ID;
  date: DayString;
  chaptersRead?: number;
  pagesRead?: number;
  minutes?: number;
  mode: ReadingMode;
  notes?: string;
  source: 'child' | 'parent' | 'interpreter';
  isDemo?: boolean;
}

// ─── Evidence & mastery ───────────────────────────────────────────────────────

export type EvidenceSourceType = 'lesson' | 'book' | 'activity' | 'observation' | 'assessment';
export type EvidenceKind = 'performance' | 'observation' | 'exposure';
export type Independence = 'independent' | 'supported' | 'assisted';

export interface EvidenceTrials {
  /** Correct / demonstrated without help. */
  independent: number;
  /** Correct after a hint, visual, or prompt. */
  supported: number;
  /** Attempted but not yet successful (never shown to the child as failure). */
  notYet: number;
}

export interface Evidence {
  id: ID;
  childId: ID;
  skillId: string;
  observedAt: Timestamp;
  source: { type: EvidenceSourceType; id: ID; label: string };
  kind: EvidenceKind;
  trials: EvidenceTrials;
  independence: Independence;
  /** Internal difficulty (see curriculum difficulty scale). */
  difficulty?: number;
  /** Parent-facing, specific evidence statement. */
  statement: string;
  /** Source text the statement came from (e.g. the parent's narrative). */
  excerpt?: string;
  createdBy: 'system' | 'parent' | 'interpreter';
  /** Topic tags that drive world growth (plants, space, dinosaurs, art…). */
  topics: string[];
  isDemo?: boolean;
}

export type MasteryLevel = 'not_started' | 'introduced' | 'developing' | 'proficient' | 'mastered';

export interface MasteryStats {
  independent: number;
  supported: number;
  notYet: number;
  exposures: number;
  independentDays: number;
  recentScore: number; // 0..1 over the recent window
  lastObservedAt?: Timestamp;
}

export interface MasteryRecord {
  /** `${childId}:${skillId}` */
  id: string;
  childId: ID;
  skillId: string;
  computedLevel: MasteryLevel;
  override?: { level: MasteryLevel; note: string; at: Timestamp };
  stats: MasteryStats;
  confidence: 'low' | 'medium' | 'high';
  needsReview: boolean;
  history: { at: Timestamp; level: MasteryLevel }[];
  updatedAt: Timestamp;
}

// ─── Activities & portfolio ───────────────────────────────────────────────────

export interface Activity {
  id: ID;
  childId: ID;
  date: DayString;
  title: string;
  narrative: string;
  durationMinutes?: number;
  domains: string[];
  skillIds: string[];
  topics: string[];
  mediaIds: ID[];
  parentObservation?: string;
  childReflection?: string;
  natureItems?: string[];
  interpretation?: { provider: string; version: string; acceptedSuggestions: number; totalSuggestions: number };
  createdAt: Timestamp;
  isDemo?: boolean;
}

export type PortfolioKind = 'photo' | 'artwork' | 'project' | 'work_sample' | 'book' | 'assessment' | 'observation' | 'nature';

export interface PortfolioItem {
  id: ID;
  childId: ID;
  date: DayString;
  kind: PortfolioKind;
  title: string;
  description: string;
  mediaIds: ID[];
  skillIds: string[];
  linked?: { type: 'activity' | 'book' | 'lesson'; id: ID };
  /** Parent-starred: shown in the family showcase. */
  favorite: boolean;
  /** Procedural art seed/colour used when no photo exists. */
  artSeed?: number;
  isDemo?: boolean;
}

export interface MediaRecord {
  id: ID;
  householdId: ID;
  childId?: ID;
  mime: string;
  blob: Blob;
  width?: number;
  height?: number;
  caption?: string;
  createdAt: Timestamp;
}

// ─── Lessons & teachers ───────────────────────────────────────────────────────

export interface ProblemAttemptRecord {
  problemId: string;
  skillId: string;
  tier: number;
  prompt: string;
  responses: string[];
  scaffolds: string[];
  outcome: 'independent' | 'supported' | 'not_yet';
}

export interface LessonAttempt {
  id: ID;
  childId: ID;
  lessonId: string;
  teacherId: string;
  startedAt: Timestamp;
  completedAt: Timestamp;
  startTier: number;
  endTier: number;
  problems: ProblemAttemptRecord[];
  summary: string;
  isDemo?: boolean;
}

export interface TranscriptLine {
  speaker: 'teacher' | 'child' | 'system';
  text: string;
  at: Timestamp;
  /** 'voice': she said it (speech-to-text); 'typed': typed in free talk; 'ai': an AI teacher wrote it. */
  via?: 'voice' | 'typed' | 'ai';
}

export interface TeacherInteraction {
  id: ID;
  childId: ID;
  teacherId: string;
  startedAt: Timestamp;
  endedAt: Timestamp;
  context: { lessonId?: string; bookId?: ID; flow: string };
  transcript: TranscriptLine[];
  outcome: string;
  /** Things she said that a grown-up should know about (never shown to her). */
  parentNotes?: string[];
  /** Set when a parent has read the notes. */
  notesSeen?: boolean;
  isDemo?: boolean;
}

// ─── Rewards ──────────────────────────────────────────────────────────────────

export interface RewardUnlock {
  id: ID;
  childId: ID;
  rewardId: string;
  unlockedAt: Timestamp;
  /** Whether the child has seen the celebration yet. */
  celebrated: boolean;
  trigger: string;
  isDemo?: boolean;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export type ReportAudience = 'parent' | 'family';
export type ReportPeriodKind = 'week' | 'month' | 'semester' | 'year' | 'custom';

export interface ReportRecord {
  id: ID;
  childId: ID;
  audience: ReportAudience;
  periodKind: ReportPeriodKind;
  periodStart: DayString;
  periodEnd: DayString;
  createdAt: Timestamp;
  /** Immutable snapshot of the generated report. */
  content: import('./reports/reportTypes').ReportContent;
}
