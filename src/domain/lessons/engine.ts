/**
 * Adaptive lesson runner (pure, deterministic given a seed).
 *
 *  • First-try success → independent; two in a row steps difficulty up.
 *  • A not-yet answer walks a gentle scaffold ladder (hint + manipulatives →
 *    simpler stepping-stone problem → alternate explanation). Success after a
 *    scaffold counts as supported.
 *  • If the ladder is exhausted we model the answer together, record
 *    "not yet", and step difficulty down. No penalties, no lost points.
 */
import { randomIds } from '../util/ids';
import type { ProblemAttemptRecord } from '../types';
import { createRng, type Rng } from '../util/random';
import type { LessonDefinition, Problem, ScaffoldType } from './types';

export interface ActiveScaffold {
  type: ScaffoldType | 'model';
  text: string;
  /** Show touchable manipulatives (tap-to-count rocks, etc.). */
  manipulatives: boolean;
}

export interface LessonFeedback {
  /** Whether the answer was right (predict problems are always "right"). */
  correct: boolean;
  /** Warm message for the teacher to say. */
  message: string;
  scaffold: ActiveScaffold | null;
  /** The main problem finished (moving to the next problem or completion). */
  problemFinished: boolean;
  outcome?: ProblemAttemptRecord['outcome'];
  tierChange: 'up' | 'down' | null;
  lessonComplete: boolean;
}

interface MainState {
  problem: Problem;
  responses: string[];
  scaffolds: string[];
  ladderStep: number;
}

export const ENCOURAGEMENTS_RETRY = ['Almost! Let’s try another way.', 'Good thinking — let’s look again together.', 'Ooh, close! Let’s use a clue.'] as const;

export class LessonRun {
  readonly id = randomIds('run');
  readonly definition: LessonDefinition;
  readonly startTier: number;
  private tier: number;
  private readonly rng: Rng;
  private round = 0;
  private queue: Problem[] = [];
  private main: MainState | null = null;
  /** A simpler stepping-stone problem currently being attempted. */
  private stepping: Problem | null = null;
  private streak = 0;
  private readonly records: ProblemAttemptRecord[] = [];
  private readonly problems = new Map<string, Problem>();
  private complete = false;

  constructor(definition: LessonDefinition, startTier: number, seed: number) {
    this.definition = definition;
    this.startTier = clampTier(startTier, definition);
    this.tier = this.startTier;
    this.rng = createRng(seed);
    this.loadRound();
  }

  get currentTier(): number {
    return this.tier;
  }

  get roundIndex(): number {
    return this.round;
  }

  get isComplete(): boolean {
    return this.complete;
  }

  get attempts(): readonly ProblemAttemptRecord[] {
    return this.records;
  }

  /** Every main problem generated so far, by id (for evidence tallies). */
  get problemIndex(): Map<string, Problem> {
    return this.problems;
  }

  /** The problem the child should be looking at right now. */
  currentProblem(): Problem | null {
    if (this.complete) return null;
    return this.stepping ?? this.main?.problem ?? null;
  }

  isSteppingStone(): boolean {
    return this.stepping !== null;
  }

  answer(choiceId: string): LessonFeedback {
    if (this.complete || !this.main) throw new Error('Lesson is not active');

    // ── Stepping-stone problem ──────────────────────────────────────────
    if (this.stepping) {
      const stone = this.stepping;
      const right = choiceId === stone.answerId;
      this.stepping = null;
      this.main.scaffolds.push(right ? 'simpler:solved' : 'simpler:modeled');
      return {
        correct: right,
        message: right ? `${stone.success} Now let’s try the first one again.` : `${stone.model} Now let’s try the first one again.`,
        scaffold: {
          type: 'alternate',
          text: this.main.problem.hints[1] ?? this.main.problem.hints[0] ?? '',
          manipulatives: true,
        },
        problemFinished: false,
        tierChange: null,
        lessonComplete: false,
      };
    }

    const state = this.main;
    const problem = state.problem;

    // Predictions are never wrong — making one is the skill.
    if (problem.kind === 'create') {
      if (!/^(circle|triangle|square)( (circle|triangle|square)){0,3}$/.test(choiceId)) throw new Error('Choose one to four shapes');
      state.responses.push(choiceId);
      return this.finishProblem('independent', problem.success);
    }
    state.responses.push(choiceId);
    if (problem.kind === 'predict') {
      return this.finishProblem('independent', problem.success);
    }

    if (choiceId === problem.answerId) {
      const outcome = state.scaffolds.length === 0 ? 'independent' : 'supported';
      return this.finishProblem(outcome, problem.success);
    }

    // Not yet — walk the ladder.
    const ladder = this.definition.ladder;
    const step = ladder[state.ladderStep];
    state.ladderStep += 1;
    const retryLine = ENCOURAGEMENTS_RETRY[(state.responses.length - 1) % ENCOURAGEMENTS_RETRY.length] ?? '';

    if (step === 'hint') {
      state.scaffolds.push('hint');
      return this.retry(`${retryLine} ${problem.hints[0] ?? ''}`, {
        type: 'hint',
        text: problem.hints[0] ?? '',
        manipulatives: true,
      });
    }
    if (step === 'simpler' && this.definition.generateSimpler) {
      state.scaffolds.push('simpler');
      this.stepping = this.definition.generateSimpler(problem, this.rng);
      return this.retry(`Let’s warm up with a smaller one first.`, {
        type: 'simpler',
        text: this.stepping.prompt,
        manipulatives: true,
      });
    }
    if (step === 'alternate' || (step === 'simpler' && !this.definition.generateSimpler)) {
      state.scaffolds.push('alternate');
      const text = problem.hints[1] ?? problem.hints[0] ?? '';
      return this.retry(`${retryLine} ${text}`, { type: 'alternate', text, manipulatives: true });
    }

    // Ladder exhausted: model it kindly and move on.
    state.scaffolds.push('model');
    return this.finishProblem('not_yet', problem.model, { type: 'model', text: problem.model, manipulatives: true });
  }

  hint(): LessonFeedback {
    if (!this.main || this.complete) throw new Error('Lesson is not active');
    this.main.scaffolds.push('hint');
    this.main.ladderStep = Math.max(1, this.main.ladderStep);
    return this.retry(this.main.problem.hints[0] ?? 'Let’s look together.', { type: 'hint', text: this.main.problem.hints[0] ?? '', manipulatives: true });
  }

  skip(): LessonFeedback {
    if (!this.main || this.complete) throw new Error('Lesson is not active');
    this.stepping = null;
    this.main.scaffolds.push('skipped');
    return this.finishProblem('not_yet', 'We can try that another time.');
  }

  private retry(message: string, scaffold: ActiveScaffold): LessonFeedback {
    return { correct: false, message, scaffold, problemFinished: false, tierChange: null, lessonComplete: false };
  }

  private finishProblem(outcome: ProblemAttemptRecord['outcome'], message: string, scaffold: ActiveScaffold | null = null): LessonFeedback {
    const state = this.main;
    if (!state) throw new Error('No active problem');
    const p = state.problem;
    this.records.push({
      problemId: p.id,
      skillId: p.skillId,
      tier: p.tier,
      prompt: p.prompt,
      responses: state.responses.map((id) => p.choices.find((c) => c.id === id)?.label ?? id),
      scaffolds: state.scaffolds,
      outcome,
    });

    let tierChange: LessonFeedback['tierChange'] = null;
    if (p.kind !== 'predict' && p.kind !== 'create' && !this.definition.manualProgression) {
      if (outcome === 'independent') {
        this.streak += 1;
        if (this.streak >= 2 && this.tier < this.definition.tiers.length - 1) {
          this.tier += 1;
          this.streak = 0;
          tierChange = 'up';
        }
      } else {
        this.streak = 0;
        if (outcome === 'not_yet' && this.tier > 0) {
          this.tier -= 1;
          tierChange = 'down';
        }
      }
    }

    this.main = null;
    this.advance();
    return {
      correct: outcome !== 'not_yet',
      message,
      scaffold,
      problemFinished: true,
      outcome,
      tierChange,
      lessonComplete: this.complete,
    };
  }

  private advance() {
    if (this.queue.length === 0) {
      this.round += 1;
      if (this.round >= this.definition.rounds) {
        this.complete = true;
        return;
      }
      this.loadRound();
      return;
    }
    const next = this.queue.shift();
    if (next) this.main = { problem: next, responses: [], scaffolds: [], ladderStep: 0 };
  }

  private loadRound() {
    this.queue = this.definition.generateRound(this.tier, this.rng, this.round);
    for (const p of this.queue) this.problems.set(p.id, p);
    const first = this.queue.shift();
    if (!first) {
      this.complete = true;
      return;
    }
    this.main = { problem: first, responses: [], scaffolds: [], ladderStep: 0 };
  }
}

function clampTier(t: number, def: LessonDefinition): number {
  return Math.max(0, Math.min(def.tiers.length - 1, Math.round(t)));
}

// ─── Results → evidence ─────────────────────────────────────────────────────

export interface SkillTally {
  skillId: string;
  independent: number;
  supported: number;
  notYet: number;
  maxTier: number;
}

export function tallyBySkill(records: readonly ProblemAttemptRecord[], problems?: Map<string, Problem>): SkillTally[] {
  const map = new Map<string, SkillTally>();
  const bump = (skillId: string, outcome: ProblemAttemptRecord['outcome'], tier: number) => {
    const t = map.get(skillId) ?? { skillId, independent: 0, supported: 0, notYet: 0, maxTier: 0 };
    if (outcome === 'independent') t.independent += 1;
    else if (outcome === 'supported') t.supported += 1;
    else t.notYet += 1;
    t.maxTier = Math.max(t.maxTier, tier);
    map.set(skillId, t);
  };
  for (const r of records) {
    if (problems?.get(r.problemId)?.kind === 'create' || r.scaffolds.includes('skipped')) continue;
    bump(r.skillId, r.outcome, r.tier);
    for (const extra of problems?.get(r.problemId)?.alsoSkills ?? []) bump(extra, r.outcome, r.tier);
  }
  return [...map.values()];
}

/** Persistence evidence: succeeding after support shows perseverance. */
export function persistenceTrials(records: readonly ProblemAttemptRecord[]): number {
  return records.filter((r) => r.outcome === 'supported').length;
}
