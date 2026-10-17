/** Small, original beat patterns. Times are transient, never persisted. */
export type BeatCount = 2 | 3 | 4;
export type RhythmMode = 'copy' | 'recognize';
export type RhythmInput = 'keyboard' | 'touch' | 'mixed' | 'choice';
export type RhythmPresentation = 'visual-only' | 'sound-and-visual';
export type RhythmOutcome = 'matched' | 'explored' | 'skipped';
export interface RhythmTrial {
  stage: 'guided' | 'independent';
  pattern: 'a' | 'b';
  outcome: RhythmOutcome;
  supported: boolean;
  input: RhythmInput;
  presentation: RhythmPresentation;
}
export interface RhythmRun {
  id: string;
  /** Bound when the visit opens; never reassigned by an active-child switch. */
  childId: string;
  startedAt: string;
  beats: BeatCount;
  mode: RhythmMode;
  trials: RhythmTrial[];
  cancelled: boolean;
}
export const DEFAULT_PULSE_MS = 800;
export function beatCount(value: unknown): BeatCount {
  return value === 3 || value === 4 ? value : 2;
}
/** Long pauses are three pulses, leaving a gap between accepted short/long windows. */
export function rhythmGaps(beats: BeatCount, pattern: 'a' | 'b'): number[] {
  return Array.from({ length: beats - 1 }, (_, i) => (i % 2 === (pattern === 'a' ? 0 : 1) ? 1 : 3));
}
export function rhythmLabel(beats: BeatCount, pattern: 'a' | 'b'): string {
  return ['Beat', ...rhythmGaps(beats, pattern).flatMap((gap) => [gap === 1 ? 'short pause' : 'long pause', 'beat'])].join(' · ');
}
export function beatOffsets(beats: BeatCount, pattern: 'a' | 'b', pulseMs: number): number[] {
  const offsets = [0];
  for (const gap of rhythmGaps(beats, pattern)) offsets.push(offsets[offsets.length - 1]! + gap * pulseMs);
  return offsets;
}
/** Three self-paced taps calibrate comfortable playback pace, not musical ability. */
export function comfortablePulse(taps: readonly number[]): number | null {
  if (taps.length !== 3 || taps.some((t) => !Number.isFinite(t))) return null;
  const a = taps[1]! - taps[0]!,
    b = taps[2]! - taps[1]!;
  if (a <= 0 || b <= 0 || a > 30_000 || b > 30_000) return null;
  return Math.max(DEFAULT_PULSE_MS, (a + b) / 2);
}
/** Constant onset/input latency cancels in intervals. Never interpret a miss as low ability. */
export function matchRhythm(beats: BeatCount, pattern: 'a' | 'b', pulseMs: number, taps: readonly number[]): boolean {
  if (!Number.isFinite(pulseMs) || pulseMs < DEFAULT_PULSE_MS || pulseMs > 30_000 || taps.length !== beats || taps.some((t) => !Number.isFinite(t)))
    return false;
  return rhythmGaps(beats, pattern).every((gap, i) => {
    const observed = taps[i + 1]! - taps[i]!,
      target = gap * pulseMs;
    return observed > 0 && Math.abs(observed - target) <= Math.max(400, target * 0.45);
  });
}
export function validRhythmRun(run: RhythmRun): boolean {
  return (
    !!run.id &&
    !!run.childId &&
    Number.isFinite(Date.parse(run.startedAt)) &&
    !run.cancelled &&
    [2, 3, 4].includes(run.beats) &&
    ['copy', 'recognize'].includes(run.mode) &&
    run.trials.length === 2 &&
    run.trials.every(
      (t, i) =>
        t.stage === (i === 0 ? 'guided' : 'independent') &&
        t.pattern === (i === 0 ? 'a' : 'b') &&
        ['matched', 'explored', 'skipped'].includes(t.outcome) &&
        typeof t.supported === 'boolean' &&
        (i !== 0 || t.supported) &&
        ['visual-only', 'sound-and-visual'].includes(t.presentation) &&
        (run.mode === 'recognize' ? t.input === 'choice' : ['keyboard', 'touch', 'mixed'].includes(t.input)),
    )
  );
}
