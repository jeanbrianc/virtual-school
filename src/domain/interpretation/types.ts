/**
 * Activity interpretation contract.
 *
 * Parent types one narrative → a service proposes structured learning
 * evidence → the parent reviews/edits → the app saves it. Any provider
 * (local heuristics today, an LLM later) must return this exact shape;
 * `validateInterpretation` enforces it for untrusted (remote) output.
 */
import type { DomainId } from '../curriculum';
import type { BookStatus, DayString, EvidenceKind, Independence } from '../types';

export interface InterpretationContext {
  childName: string;
  /** Pronoun used in generated statements. */
  pronoun: 'she' | 'he' | 'they';
  today: DayString;
  knownBooks: {
    id: string;
    title: string;
    author: string;
    status: BookStatus;
    chaptersRead?: number;
    totalChapters?: number;
    catalogId?: string;
  }[];
}

export type SuggestionOutcome = 'demonstrated' | 'with_support' | 'exposure' | 'not_yet';

export interface SkillSuggestion {
  skillId: string;
  /** 0..1 — how sure the interpreter is that this skill was exercised. */
  confidence: number;
  kind: EvidenceKind;
  independence: Independence;
  outcome: SuggestionOutcome;
  /** Parent-facing, specific evidence statement (editable in review). */
  statement: string;
  /** The sentence(s) this came from. */
  excerpt: string;
  topics: string[];
  /** Pre-selected in the review UI when confidence is high enough. */
  accepted: boolean;
}

export interface BookMention {
  title: string;
  author?: string;
  catalogId?: string;
  existingBookId?: string;
  chaptersRead?: number;
  pagesRead?: number;
  completed: boolean;
  mode: 'independent' | 'shared' | 'read_aloud';
  excerpt: string;
}

export interface Measurement {
  quantity: number;
  unit: string;
  item?: string;
  text: string;
}

export interface ActivityInterpretation {
  title: string;
  date: DayString;
  durationMinutes?: number;
  domains: DomainId[];
  skills: SkillSuggestion[];
  topics: string[];
  books: BookMention[];
  measurements: Measurement[];
  natureItems: string[];
  childQuotes: string[];
  questionsAsked: string[];
  followUps: string[];
  provider: { id: string; version: string; label: string };
  notes: string[];
}

export interface ActivityInterpretationService {
  readonly id: string;
  readonly label: string;
  /** True when narratives leave the device (requires explicit parent consent). */
  readonly sendsDataOffDevice: boolean;
  interpret(narrative: string, context: InterpretationContext): Promise<ActivityInterpretation>;
}

export const ACCEPT_THRESHOLD = 0.5;
