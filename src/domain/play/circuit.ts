/**
 * The dance & gym circuit on the classroom's 1–10 floor mat.
 *
 * Like the stations in her dance and gymnastics classes: each number on the
 * mat is a station with a move (a sunshine twirl, a plié, a curtsey, a bunny
 * hop, a backflip…). Hopping onto a number makes her avatar do that move.
 * Going 1 → 10 in order is "the circuit" — counting practice she can feel —
 * and finishing it earns a big celebration.
 *
 * Pure data + rules (no engine, no UI), so it's unit-tested and shared by the
 * school, the Parent Studio editor and the avatar preview.
 */

export type DanceMoveId =
  | 'plie'
  | 'bunnyHop'
  | 'sunshineTwirl'
  | 'starJump'
  | 'curtsey'
  | 'arabesque'
  | 'cartwheel'
  | 'frogJump'
  | 'backflip'
  | 'tada'
  | 'pirouette'
  | 'forwardRoll'
  | 'flamingo'
  | 'wiggle'
  | 'bow'
  | 'jumpingJacks'
  | 'splitLeap';

export interface DanceMove {
  id: DanceMoveId;
  name: string;
  emoji: string;
  kind: 'dance' | 'gym';
  /** What the coach says to show how (short, for a preschooler). */
  cue: string;
}

export const DANCE_MOVES: Record<DanceMoveId, DanceMove> = {
  plie: { id: 'plie', name: 'Plié', emoji: '🩰', kind: 'dance', cue: 'Heels together, bend your knees, and rise up tall.' },
  bunnyHop: { id: 'bunnyHop', name: 'Bunny hops', emoji: '🐰', kind: 'gym', cue: 'Bunny ears up — hop, hop, hop!' },
  sunshineTwirl: { id: 'sunshineTwirl', name: 'Sunshine twirl', emoji: '☀️', kind: 'dance', cue: 'Arms up big like the sun, and twirl around!' },
  starJump: { id: 'starJump', name: 'Star jump', emoji: '⭐', kind: 'gym', cue: 'Crouch down, then jump up big like a star!' },
  curtsey: { id: 'curtsey', name: 'Curtsey', emoji: '👗', kind: 'dance', cue: 'One foot behind, a little bend, and a smile.' },
  arabesque: { id: 'arabesque', name: 'Arabesque', emoji: '🦢', kind: 'dance', cue: 'Arms out, one leg back, balance like a swan.' },
  cartwheel: { id: 'cartwheel', name: 'Cartwheel', emoji: '🤸', kind: 'gym', cue: 'Hands up high, then over you go like a wheel!' },
  frogJump: { id: 'frogJump', name: 'Frog jump', emoji: '🐸', kind: 'gym', cue: 'Squat down low like a frog, then leap!' },
  backflip: { id: 'backflip', name: 'Backflip', emoji: '🔄', kind: 'gym', cue: 'Arms up, jump, and flip all the way around!' },
  tada: { id: 'tada', name: 'Ta-da!', emoji: '🙌', kind: 'gym', cue: 'Arms up high in a V — you did it!' },
  pirouette: { id: 'pirouette', name: 'Pirouette', emoji: '💫', kind: 'dance', cue: 'Arms round like a crown, up on your toes, and spin.' },
  forwardRoll: { id: 'forwardRoll', name: 'Forward roll', emoji: '🌀', kind: 'gym', cue: 'Tuck your chin and roll like a ball.' },
  flamingo: { id: 'flamingo', name: 'Flamingo balance', emoji: '🦩', kind: 'gym', cue: 'Stand on one foot like a flamingo. Wobble, wobble!' },
  wiggle: { id: 'wiggle', name: 'Wiggle dance', emoji: '🎶', kind: 'dance', cue: 'Wiggle your hips and wave your arms!' },
  bow: { id: 'bow', name: 'Bow', emoji: '🎭', kind: 'dance', cue: 'Hands by your sides and a big bow.' },
  jumpingJacks: { id: 'jumpingJacks', name: 'Jumping jacks', emoji: '💪', kind: 'gym', cue: 'Out and in, out and in — jump, jump, jump!' },
  splitLeap: { id: 'splitLeap', name: 'Split leap', emoji: '🦌', kind: 'dance', cue: 'Run, run, and leap with one leg front and one back!' },
};

export const DANCE_MOVE_IDS = Object.keys(DANCE_MOVES) as DanceMoveId[];

/** Numbers 1–10, in order: a warm-up, the big tricks in the middle, and a "ta-da" to finish. */
export const DEFAULT_CIRCUIT: readonly DanceMoveId[] = [
  'plie',
  'bunnyHop',
  'sunshineTwirl',
  'starJump',
  'curtsey',
  'arabesque',
  'cartwheel',
  'frogJump',
  'backflip',
  'tada',
];

export const STATIONS = 10;

/** One number on the mat: a move, and optionally what she calls it in her class. */
export interface CircuitStation {
  move: DanceMoveId;
  /** Her own name for it ("sunshine arms", "bunny jumps"…); the move's name when absent. */
  name?: string;
}

export function isDanceMove(id: unknown): id is DanceMoveId {
  return typeof id === 'string' && id in DANCE_MOVES;
}

/** Cleans a custom station name: short, plain text. */
export function cleanStationName(name: string): string {
  return name
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[<>{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

/** The 10 stations for a child — her family's choices where set, the default elsewhere. */
export function circuitFor(child: { circuit?: CircuitStation[] | undefined } | null | undefined): CircuitStation[] {
  return Array.from({ length: STATIONS }, (_, i) => {
    const s = child?.circuit?.[i];
    const move = s && isDanceMove(s.move) ? s.move : DEFAULT_CIRCUIT[i]!;
    const name = s?.name ? cleanStationName(s.name) : '';
    return name ? { move, name } : { move };
  });
}

export function stationLabel(s: CircuitStation): string {
  return s.name || DANCE_MOVES[s.move].name;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Playing the circuit ─────────────────────────────────────────────────────

/** A circuit in progress: the next number to find. */
export interface CircuitRun {
  next: number;
}

export type StepEvent =
  /** Stepped on 1: a new circuit starts. */
  | 'start'
  /** The right next number. */
  | 'next'
  /** Number 10 after 9: the whole circuit is done. */
  | 'complete'
  /** A different number during a circuit (the move still happens). */
  | 'other'
  /** Any number with no circuit going: just the move. */
  | 'free';

/** What stepping on number `n` does to the circuit. */
export function stepOn(run: CircuitRun | null, n: number): { run: CircuitRun | null; event: StepEvent } {
  if (n === 1) return { run: { next: 2 }, event: 'start' };
  if (!run) return { run: null, event: 'free' };
  if (n !== run.next) return { run, event: 'other' };
  if (n === STATIONS) return { run: null, event: 'complete' };
  return { run: { next: n + 1 }, event: 'next' };
}

/** A circuit started from the flag: find number 1 first. */
export function freshRun(): CircuitRun {
  return { next: 1 };
}

/** What the coach says when she lands on a number. */
export function stationLine(n: number, station: CircuitStation, event: StepEvent, run: CircuitRun | null): string {
  const label = stationLabel(station);
  const base = `${cap(numberWord(n))}! ${label}!`;
  if (event === 'start') return `${base} Now find number two!`;
  if (event === 'other' && run) return `${base} Now, where’s number ${numberWord(run.next)}?`;
  if (event === 'next' && run) return `${base} Next, number ${numberWord(run.next)}!`;
  return base;
}

export const CIRCUIT_DONE_LINE = 'You did the whole circuit! One, two, three, four, five, six, seven, eight, nine, ten — ta-da!';
export const CIRCUIT_START_LINE = 'Circuit time! Hop onto number one!';
