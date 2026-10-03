import type { Shape } from './patterns';
import type { Rng } from '../util/random';

export interface LessonChoice {
  id: string;
  label: string;
  /** Optional emoji/pictogram to support pre-readers and quick scanning. */
  icon?: string;
}

export type LessonVisual =
  | { type: 'pattern'; shapes: readonly Shape[] }
  | { type: 'none' }
  | { type: 'rocks'; groups: number[]; removed?: number }
  | { type: 'compare'; left: number; right: number }
  | { type: 'share'; total: number; groups: number }
  | { type: 'arrays'; groups: number; each: number }
  | { type: 'object'; objectId: string; showResult?: boolean; floats?: boolean }
  | { type: 'objects'; objectIds: string[] }
  | { type: 'book'; bookId: string };

export type ProblemKind = 'answer' | 'predict' | 'create';

export interface Problem {
  id: string;
  skillId: string;
  /** Other skills this problem also provides evidence for. */
  alsoSkills?: string[];
  tier: number;
  kind: ProblemKind;
  prompt: string;
  visual: LessonVisual;
  choices: LessonChoice[];
  /** Correct choice id (ignored for `predict` problems, where any answer is valid). */
  answerId: string;
  /** Scaffolds in ladder order: [hint, alternate explanation]. */
  hints: string[];
  /** Worked answer shown gently when the child still needs help. */
  model: string;
  /** Warm, specific praise for a correct answer. */
  success: string;
  difficulty: number;
  /** Arbitrary data the UI may use (e.g. the object being tested). */
  meta?: Record<string, string | number | boolean>;
}

export interface LessonTier {
  /** Primary skill this tier exercises (used to pick the start tier). */
  skillId: string;
  label: string;
}

export interface LessonDefinition {
  id: string;
  teacherId: string;
  /** Parent-facing title. */
  title: string;
  /** Kid-facing title. */
  childTitle: string;
  completeTitle: string;
  intro: string[];
  outro: string;
  rounds: number;
  tiers: LessonTier[];
  /** Scaffold ladder used after each not-yet answer. */
  ladder: ScaffoldType[];
  /** Produces the problems for one round at a tier (usually 1, or predict+explain). */
  generateRound(tier: number, rng: Rng, round: number): Problem[];
  /** A smaller stepping-stone problem for the `simpler` scaffold. */
  generateSimpler?(problem: Problem, rng: Rng): Problem;
}

export type ScaffoldType = 'hint' | 'simpler' | 'alternate';
