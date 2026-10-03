import { createRng } from '../util/random';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export type KeyModality = 'physical' | 'touch';
export interface LetterTrial {
  letter: string;
  outcome: 'independent' | 'supported' | 'not_yet';
  modality: KeyModality | 'skipped';
}
export interface KeyboardTrail {
  id: string;
  startedAt: string;
  letters: string[];
  trials: LetterTrial[];
  hinted: boolean;
  cancelled: boolean;
}

/** Five distinct prompts. Start with A–E; later rounds expand toward all Latin A–Z. */
export function trailLetters(completed: number, seed: number): string[] {
  const rng = createRng(seed);
  const letters = [...ALPHABET.slice(0, Math.min(26, 5 + Math.max(0, completed) * 5))];
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [letters[i], letters[j]] = [letters[j]!, letters[i]!];
  }
  return letters.slice(0, 5);
}

/** KeyboardEvent.key follows the user's layout; Shift/Caps Lock uppercase is supported. */
export function acceptedLetter(e: Pick<KeyboardEvent, 'key' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing'>): string | null {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.isComposing || !/^[a-z]$/i.test(e.key)) return null;
  return e.key.toUpperCase();
}

export function answerTrail(run: KeyboardTrail, letter: string, modality: KeyModality): boolean {
  if (run.cancelled || run.trials.length >= run.letters.length || letter !== run.letters[run.trials.length]) return false;
  run.trials.push({ letter, modality, outcome: run.hinted ? 'supported' : 'independent' });
  run.hinted = false;
  return true;
}
export function skipTrail(run: KeyboardTrail): void {
  const letter = run.letters[run.trials.length];
  if (!letter || run.cancelled) return;
  run.trials.push({ letter, modality: 'skipped', outcome: 'not_yet' });
  run.hinted = false;
}
