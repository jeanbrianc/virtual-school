/** Fictional picture routines: only stated precedence matters, never household habits. */
import { createRng, shuffle } from '../util/random';
import { randomIds } from '../util/ids';

export type RoutineSize = 2 | 3 | 4;
export type RoutineTheme = 'art' | 'toys';
export type RoutineModality = 'touch' | 'pointer' | 'keyboard-or-assistive';
export type RoutinePicture = 'open-box' | 'paper' | 'crayons' | 'close-box' | 'open-bag' | 'block' | 'ball' | 'close-bag';
export interface RoutineCard {
  id: string;
  label: string;
  picture: RoutinePicture;
}
export interface RoutineTask {
  id: string;
  theme: RoutineTheme;
  size: RoutineSize;
  title: string;
  instruction: string;
  cards: readonly RoutineCard[];
  edges: readonly (readonly [string, string])[];
}
export const ROUTINE_TITLE = 'What comes next?';
export const ROUTINE_LESSON_ID = 'everyday-sequencing';
export const ROUTINE_SKILLS = ['reason.routine-constraints', 'life.fictional-routine'] as const;
export const REFLECTIONS = {
  pictures: 'I used the pictures.',
  before: 'I thought about what needed to happen first.',
  different: 'I noticed more than one order can work.',
} as const;
export type RoutineReflection = keyof typeof REFLECTIONS;

export function routineTask(size: RoutineSize, round: number, seed: number): RoutineTask {
  const theme = round % 2 === 0 ? 'art' : 'toys';
  const cards: RoutineCard[] =
    theme === 'art'
      ? [
          { id: 'open', label: 'Open the art box', picture: 'open-box' },
          { id: 'first', label: 'Put paper in the box', picture: 'paper' },
          { id: 'second', label: 'Put crayons in the box', picture: 'crayons' },
          { id: 'close', label: 'Close the art box', picture: 'close-box' },
        ]
      : [
          { id: 'open', label: 'Open the toy bag', picture: 'open-bag' },
          { id: 'first', label: 'Put the block in the bag', picture: 'block' },
          { id: 'second', label: 'Put the ball in the bag', picture: 'ball' },
          { id: 'close', label: 'Close the toy bag', picture: 'close-bag' },
        ];
  const included = size === 2 ? cards.slice(0, 2) : size === 3 ? [cards[0]!, cards[1]!, cards[3]!] : cards;
  const edges: [string, string][] = [['open', 'first']];
  if (size > 2) edges.push(['first', 'close']);
  if (size === 4) edges.push(['open', 'second'], ['second', 'close']);
  return {
    id: `${theme}-${size}-${round}-${seed}`,
    theme,
    size,
    title: theme === 'art' ? 'Pack a pretend art box' : 'A little change: pack a pretend toy bag',
    instruction: `Open the ${theme === 'art' ? 'box' : 'bag'} before putting things inside.${size > 2 ? ' Put everything inside before closing it.' : ''}${size === 4 ? ' The two things can go in either order.' : ''}`,
    cards: shuffle(createRng(seed + round), included),
    edges,
  };
}

export function validateRoutineOrder(task: RoutineTask, order: readonly (string | null)[]): 'valid' | 'incomplete' | 'invalid' {
  if (order.length !== task.size || order.some((id) => id === null)) return 'incomplete';
  if (new Set(order).size !== task.size || order.some((id) => !task.cards.some((card) => card.id === id))) return 'invalid';
  return task.edges.every(([before, after]) => order.indexOf(before) < order.indexOf(after)) ? 'valid' : 'invalid';
}

/** A worked example, not the grading key. Independent nodes remain interchangeable. */
export function modelRoutineOrder(task: RoutineTask): string[] {
  const remaining = [...task.cards].sort((a, b) => a.id.localeCompare(b.id)).map((c) => c.id);
  const order: string[] = [];
  while (remaining.length) {
    const index = remaining.findIndex((id) => task.edges.every(([before, after]) => after !== id || order.includes(before)));
    if (index < 0) throw new Error('Routine precedence cycle');
    order.push(remaining.splice(index, 1)[0]!);
  }
  return order;
}

/** Move to a position or swap two placed cards. Displaced pool cards return to the pool. */
export function placeRoutineCard(task: RoutineTask, order: readonly (string | null)[], id: string, position: number): (string | null)[] {
  if (!task.cards.some((c) => c.id === id) || position < 0 || position >= task.size || !Number.isInteger(position)) return [...order];
  const next = [...order];
  const previous = next.indexOf(id);
  if (previous >= 0) next[previous] = next[position] ?? null;
  next[position] = id;
  return next;
}

export interface RoutineTrial {
  task: RoutineTask;
  orders: string[][];
  scaffolds: string[];
  modalities: RoutineModality[];
  outcome: 'independent' | 'supported' | 'skipped';
}
export class RoutineRun {
  readonly id = randomIds('routine');
  readonly trials: RoutineTrial[] = [];
  readonly startedAt: string;
  readonly childId: string;
  readonly size: RoutineSize;
  readonly seed: number;
  private task: RoutineTask;
  private orders: string[][] = [];
  private scaffolds: string[] = [];
  private modalities = new Set<RoutineModality>();
  cancelled = false;
  reflection: RoutineReflection | null = null;
  constructor(childId: string, size: RoutineSize, seed: number, startedAt = new Date().toISOString()) {
    this.childId = childId;
    this.size = size;
    this.seed = seed;
    this.startedAt = startedAt;
    this.task = routineTask(size, 0, seed);
  }
  get complete(): boolean {
    return this.trials.length === 2 && !this.cancelled;
  }
  get current(): RoutineTask | null {
    return this.complete || this.cancelled ? null : this.task;
  }
  get suggestedSize(): RoutineSize | null {
    return this.complete && this.size < 4 && this.trials.every((t) => t.outcome === 'independent' && t.task.size === this.size)
      ? ((this.size + 1) as RoutineSize)
      : null;
  }
  noteModality(modality: RoutineModality) {
    if (this.current) this.modalities.add(modality);
  }
  support(kind: 'hint' | 'model' | 'grown-up') {
    if (this.current && !this.scaffolds.includes(kind)) this.scaffolds.push(kind);
  }
  simpler(): RoutineTask | null {
    if (!this.current) return null;
    if (!this.scaffolds.includes('simpler')) this.scaffolds.push('simpler');
    this.task = routineTask(2, this.trials.length, this.seed);
    this.orders = []; // Larger task attempts are not evidence for the smaller task.
    return this.task;
  }
  submit(order: readonly (string | null)[]): 'valid' | 'incomplete' | 'invalid' | 'inactive' {
    if (!this.current) return 'inactive';
    const result = validateRoutineOrder(this.task, order);
    if (result === 'incomplete') return result;
    this.orders.push(order.filter((id): id is string => id !== null));
    if (result === 'invalid') {
      if (!this.scaffolds.includes('retry')) this.scaffolds.push('retry');
      return result;
    }
    this.finish(this.scaffolds.length ? 'supported' : 'independent');
    return result;
  }
  skip() {
    if (this.current) this.finish('skipped');
  }
  private finish(outcome: RoutineTrial['outcome']) {
    this.trials.push({
      task: this.task,
      orders: this.orders.map((order) => [...order]),
      scaffolds: [...this.scaffolds],
      modalities: [...this.modalities].sort(),
      outcome,
    });
    this.orders = [];
    this.scaffolds = [];
    this.modalities = new Set();
    if (!this.complete) this.task = routineTask(this.size, this.trials.length, this.seed);
  }
}
