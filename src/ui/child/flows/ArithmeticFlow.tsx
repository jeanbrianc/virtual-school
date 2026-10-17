import { useRef, useState } from 'react';
import {
  ARITHMETIC_ROUNDS,
  ARITHMETIC_CHALLENGES,
  arithmeticEntry,
  arithmeticProblem,
  type ArithmeticMode,
  type ArithmeticProgress,
  type ArithmeticResponse,
  type ArithmeticSupport,
} from '../../../domain/lessons/baseTenArithmetic';
import type { MasteryRecord } from '../../../domain/types';
import { hashString } from '../../../domain/util/random';
import { Choices, DialogueShell } from '../DialogueShell';
import { ParentGate } from '../Overlays';
import { ArithmeticStage } from '../lesson/ArithmeticStage';
import { arithmeticModel } from '../../../domain/lessons/baseTenArithmetic';

const silentSpeech = { auto: false, canSpeak: false, speak() {} };

/** An optional challenge, entered by math evidence or a grown-up's choice; no timed answers or reward growth. */
export function ArithmeticFlow({
  childId,
  mastery,
  parentPin,
  onSave,
  onClose,
  onChooseActivity,
}: {
  childId: string;
  mastery: MasteryRecord[];
  parentPin: string;
  onSave: (progress: ArithmeticProgress) => Promise<void>;
  onClose: () => void;
  onChooseActivity: () => void;
}) {
  const entry = arithmeticEntry(mastery);
  const [session, setSession] = useState<ArithmeticProgress | null>(null);
  const sessionRef = useRef<ArithmeticProgress | null>(null);
  const [round, setRound] = useState(0);
  const responses = useRef<string[]>([]);
  const supports = useRef<ArithmeticSupport[]>([]);
  const [feedback, setFeedback] = useState('');
  const [simpler, setSimpler] = useState(false);
  const [found, setFound] = useState(false);
  const foundRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const pending = useRef<{ progress: ArithmeticProgress; feedback: string } | null>(null);
  const [gate, setGate] = useState(false);
  const [parentChoices, setParentChoices] = useState(false);
  const [prepared, setPrepared] = useState<{ tier: number; mode: ArithmeticMode } | null>(null);
  const [modelKind, setModelKind] = useState<'add' | 'subtract'>('add');
  const [chosenMode, setChosenMode] = useState<ArithmeticMode>('review');
  const complete = round === ARITHMETIC_ROUNDS;
  const problem = session && !complete ? arithmeticProblem(session.seed, session.tier, round) : null;

  const start = (tier: number, mode: ArithmeticMode) => {
    if (lock.current) return;
    const id = crypto.randomUUID();
    const next: ArithmeticProgress = { id, childId, startedAt: new Date().toISOString(), seed: hashString(id), tier, mode, rounds: [] };
    sessionRef.current = next;
    setSession(next);
    setRound(0);
    responses.current = [];
    supports.current = [];
    setFeedback('');
    setSimpler(false);
    foundRef.current = false;
    setFound(false);
    setError('');
    pending.current = null;
    setParentChoices(false);
    setPrepared(null);
  };

  const savePending = async () => {
    const next = pending.current;
    if (!next || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(next.progress);
      sessionRef.current = next.progress;
      setSession(next.progress);
      foundRef.current = true;
      setFound(true);
      setSimpler(false);
      setFeedback(next.feedback);
      pending.current = null;
    } catch {
      setError('This round has not saved. Try saving again. Closing keeps only the rounds already saved.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const finish = (record: ArithmeticResponse, line: string) => {
    const current = sessionRef.current;
    if (!current || lock.current || foundRef.current || pending.current) return;
    pending.current = { progress: { ...current, rounds: [...current.rounds, record] }, feedback: line };
    void savePending();
  };
  const support = (kind: ArithmeticSupport) => {
    if (!problem || found || lock.current || pending.current) return;
    if (!supports.current.includes(kind)) supports.current.push(kind);
    if (kind === 'model')
      finish(
        { responses: [...responses.current], scaffolds: [...supports.current] },
        `${responses.current.length === 0 ? 'Let’s look together. No answer was graded. ' : ''}${problem.model}`,
      );
    else if (kind === 'simpler') {
      setSimpler(true);
      setFeedback('Let’s try a smaller worked example. Each bundle still means ten.');
    } else setFeedback(problem.hints[0] ?? 'Look at the tens and ones.');
  };
  const answer = (id: string) => {
    if (!problem || found || lock.current || pending.current || !problem.choices.some((choice) => choice.id === id)) return;
    responses.current.push(id);
    if (id === problem.answerId) {
      finish({ responses: [...responses.current], scaffolds: [...supports.current] }, problem.success);
    } else if (responses.current.length >= 3) support('model');
    else if (responses.current.length === 2) support('simpler');
    else {
      supports.current.push('hint');
      setFeedback(`Let’s look again. ${problem.hints[0]}`);
    }
  };
  const next = () => {
    if (!foundRef.current || lock.current) return;
    setRound((n) => n + 1);
    foundRef.current = false;
    setFound(false);
    setFeedback('');
    setSimpler(false);
    responses.current = [];
    supports.current = [];
  };
  if (gate)
    return (
      <ParentGate
        pin={parentPin}
        showHint={false}
        onClose={() => setGate(false)}
        onPass={() => {
          setGate(false);
          setParentChoices(true);
        }}
      />
    );

  const line = !session
    ? 'Let’s join tens and ones, or take some away. A grown-up can help choose this challenge.'
    : complete
      ? 'Saved! Try making a fresh example with real bundles. You can practise again another day.'
      : feedback || problem!.prompt;
  const blocked = saving || !!pending.current;
  const smaller = simpler && session ? arithmeticProblem(session.seed, session.tier, round, true) : null;
  const shown = smaller ?? problem;
  return (
    <DialogueShell teacher="digit" line={line} speech={silentSpeech} onClose={onClose} closeDisabled={saving} wide={!!session}>
      {!session && (
        <>
          <p className="base-ten-goal">Optional Base-ten Workshop · no trading · 4 rounds.</p>
          <div className="base-ten-actions" role="group" aria-label="Worked examples">
            <button className="btn" type="button" onClick={() => setModelKind('add')}>
              See adding model
            </button>
            <button className="btn" type="button" onClick={() => setModelKind('subtract')}>
              See taking-away model
            </button>
          </div>
          <ArithmeticStage left={modelKind === 'add' ? 23 : 46} right={modelKind === 'add' ? 14 : 12} operation={modelKind} showResult />
          <p>{arithmeticModel(modelKind === 'add' ? 23 : 46, modelKind === 'add' ? 14 : 12, modelKind)}</p>
          {parentChoices && (
            <div className="base-ten-parent" aria-label="Grown-up arithmetic choices">
              <p>
                Choose from math readiness: comfortably build, read and take apart tens and ones, then solve smaller addition. For mixed practice, check smaller
                subtraction too. Advanced reading and age do not establish math readiness.
              </p>
              <p>
                {entry.atCeiling
                  ? 'Both answer-choice goals have proficient evidence. Fresh-item review is available; this mission has no harder level.'
                  : entry.readyAdd
                    ? 'Earlier recorded math evidence supports trying addition. Check comfort with real objects today.'
                    : 'The earlier math evidence is not yet sufficient for a suggestion. Try tens and ones or smaller sums first; you can still choose to explore together.'}
              </p>
              <p>
                {entry.readyMixed ? 'Earlier subtraction evidence is also present.' : 'Before mixed practice, observe taking away with smaller amounts.'} These
                are suggestions, never locks.
              </p>
              <p>
                Use tied bundles of ten straws and loose straws. Model 23 + 14, then offer a different problem. Watch the child join or remove objects and
                explain what happened. App answer selection does not observe those actions or prove an algorithm.
              </p>
              <label>
                Practice purpose
                <select value={chosenMode} onChange={(e) => setChosenMode(e.target.value as ArithmeticMode)}>
                  <option value="review">Fresh-item review: dated observations only</option>
                  <option value="learning">New learning: save arithmetic-answer evidence</option>
                </select>
              </label>
              <p>
                Only a first correct answer without an item hint or retry is independent answer-choice evidence. Viewing a worked answer before trying is
                ungraded. A model after an unsuccessful answer is not yet independent. Review does not advance new-skill mastery.
              </p>
              <Choices
                items={ARITHMETIC_CHALLENGES.map((goal, index) => ({ id: String(index), label: goal.label, icon: index === 0 ? '➕' : '➖' }))}
                onPick={(id) => {
                  if (id === '0' || id === '1') {
                    setPrepared({ tier: Number(id), mode: chosenMode });
                    setModelKind('add');
                    setParentChoices(false);
                  }
                }}
              />
            </div>
          )}
          {prepared && (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                if (prepared.tier === 1 && modelKind === 'add') setModelKind('subtract');
                else start(prepared.tier, prepared.mode);
              }}
            >
              {prepared.tier === 1 && modelKind === 'add' ? 'See the taking-away example next' : 'Try four fresh problems'}
            </button>
          )}
          <div className="base-ten-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setPrepared(null);
                setGate(true);
              }}
            >
              Grown-up: choose challenge
            </button>
            <button className="btn" type="button" onClick={onChooseActivity}>
              Choose an activity
            </button>
          </div>
        </>
      )}
      {session && !complete && problem && (
        <div className="lesson-play">
          <p className="base-ten-goal">
            {ARITHMETIC_CHALLENGES[session.tier]!.label} · {session.mode === 'review' ? 'review' : 'learning'} · Round {round + 1} of {ARITHMETIC_ROUNDS}
          </p>
          {shown && <ArithmeticStage left={shown.left} right={shown.right} operation={shown.operation} showResult={!!smaller || found} />}
          {smaller ? (
            <>
              <p>{smaller.model}</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSimpler(false);
                  setFeedback(problem.prompt);
                }}
              >
                Back to my problem
              </button>
            </>
          ) : (
            !found && (
              <Choices
                items={problem.choices}
                onPick={answer}
                state={blocked ? Object.fromEntries(problem.choices.map((choice) => [choice.id, 'disabled' as const])) : {}}
              />
            )
          )}
          {!found && !simpler && (
            <div className="base-ten-actions">
              <button type="button" className="btn" disabled={blocked} onClick={() => support('hint')}>
                Show a hint
              </button>
              <button type="button" className="btn" disabled={blocked} onClick={() => support('simpler')}>
                Smaller example
              </button>
              <button type="button" className="btn" disabled={blocked} onClick={() => support('model')}>
                Work it out together
              </button>
              <button
                type="button"
                className="btn"
                disabled={blocked}
                onClick={() =>
                  finish(
                    { responses: [...responses.current], scaffolds: [...supports.current], skipped: true },
                    'Skipped. We can try this another day; it is not scored.',
                  )
                }
              >
                Skip this round
              </button>
            </div>
          )}
          {found && (
            <button className="btn btn-primary" type="button" onClick={next}>
              {round === ARITHMETIC_ROUNDS - 1 ? 'Finish mission' : 'Try a fresh problem'}
            </button>
          )}
          {saving && <p role="status">Saving this round…</p>}
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button className="btn" type="button" disabled={saving} onClick={() => void savePending()}>
                Try saving again
              </button>
            </div>
          )}
        </div>
      )}
      {session && complete && (
        <>
          <p>{session.mode === 'review' ? 'Your fresh-item review is saved. This does not establish delayed retention.' : 'Your work is saved.'}</p>
          <div className="base-ten-actions">
            <button type="button" className="btn" onClick={() => start(session.tier, 'review')}>
              Fresh-item review again
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Back to school
            </button>
          </div>
        </>
      )}
    </DialogueShell>
  );
}
