import { useRef, useState } from 'react';
import {
  BASE_TEN_ROUNDS,
  BASE_TEN_TIERS,
  baseTenEntry,
  baseTenProblem,
  type BaseTenMode,
  type BaseTenProgress,
  type BaseTenResponse,
  type BaseTenSupport,
} from '../../../domain/lessons/baseTen';
import type { MasteryRecord } from '../../../domain/types';
import { hashString } from '../../../domain/util/random';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';
import { ParentGate } from '../Overlays';
import { LessonStage } from '../lesson/Stages';

/** An optional challenge, entered by math evidence or a grown-up's choice; no timed answers or reward growth. */
export function BaseTenFlow({
  childId,
  mastery,
  parentPin,
  speech,
  onSave,
  onClose,
  onChooseActivity,
}: {
  childId: string;
  mastery: MasteryRecord[];
  parentPin: string;
  speech: Speech;
  onSave: (progress: BaseTenProgress) => Promise<void>;
  onClose: () => void;
  onChooseActivity: () => void;
}) {
  const entry = baseTenEntry(mastery);
  const [session, setSession] = useState<BaseTenProgress | null>(null);
  const sessionRef = useRef<BaseTenProgress | null>(null);
  const [round, setRound] = useState(0);
  const responses = useRef<string[]>([]);
  const supports = useRef<BaseTenSupport[]>([]);
  const [feedback, setFeedback] = useState('');
  const [simpler, setSimpler] = useState(false);
  const [found, setFound] = useState(false);
  const foundRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const pending = useRef<{ progress: BaseTenProgress; feedback: string } | null>(null);
  const [gate, setGate] = useState(false);
  const [parentChoices, setParentChoices] = useState(false);
  const [chosenTier, setChosenTier] = useState(entry.tier);
  const [chosenMode, setChosenMode] = useState<BaseTenMode>(entry.mode);
  const complete = round === BASE_TEN_ROUNDS;
  const problem = session && !complete ? baseTenProblem(session.seed, session.tier, round) : null;

  const start = (tier: number, mode: BaseTenMode) => {
    if (lock.current) return;
    const id = crypto.randomUUID();
    const next: BaseTenProgress = { id, childId, startedAt: new Date().toISOString(), seed: hashString(id), tier, mode, rounds: [] };
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

  const finish = (record: BaseTenResponse, line: string) => {
    const current = sessionRef.current;
    if (!current || lock.current || found || pending.current) return;
    pending.current = { progress: { ...current, rounds: [...current.rounds, record] }, feedback: line };
    void savePending();
  };
  const support = (kind: BaseTenSupport) => {
    if (!problem || found || lock.current || pending.current) return;
    if (!supports.current.includes(kind)) supports.current.push(kind);
    if (kind === 'model') finish({ responses: [...responses.current], scaffolds: [...supports.current] }, problem.model);
    else if (kind === 'simpler') {
      setSimpler(true);
      setFeedback('Let’s build a smaller example together. Each bundle still means ten.');
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
    ? 'A ten is one bundle of 10. Let’s explore how bundles and extra ones make a number. You can use straws or blocks beside you.'
    : complete
      ? 'Your five rounds are saved. Tell a grown-up how a bundle of ten is different from one. Try a different number together another day.'
      : feedback || problem!.prompt;
  const blocked = saving || !!pending.current;
  const smaller = simpler && session ? baseTenProblem(session.seed, session.tier, round, true) : null;
  return (
    <DialogueShell teacher="digit" line={line} speech={speech} onClose={onClose} closeDisabled={saving} wide={!!session}>
      {!session && (
        <>
          <p className="base-ten-goal">Optional challenge: numbers 20–99.</p>
          <LessonStage visual={{ type: 'base-ten', tens: 1, ones: 3, numeral: 13 }} seed={13} />
          <p>Try it with real objects: tie 10 straws into one bundle and add 3 loose straws. One ten and 3 ones make 13. Now we can try a different number.</p>
          <p className="base-ten-goal">
            {entry.atCeiling
              ? 'These goals are proficient. Review with varied examples; harder arithmetic is not part of this mission.'
              : entry.ready
                ? `Suggested goal: ${BASE_TEN_TIERS[entry.tier]!.label}.`
                : 'Count and build numbers to 20 first. A grown-up can choose whether to try this challenge. Exploring here is review until then.'}
          </p>
          <p className="base-ten-goal">Review saves what you tried separately and does not advance new-skill mastery.</p>
          {parentChoices ? (
            <div className="base-ten-parent" aria-label="Grown-up place-value choices">
              <label>
                Goal
                <select value={chosenTier} onChange={(e) => setChosenTier(Number(e.target.value))}>
                  {BASE_TEN_TIERS.map((goal, i) => (
                    <option key={goal.skillId} value={i}>
                      {goal.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Practice purpose
                <select value={chosenMode} onChange={(e) => setChosenMode(e.target.value as BaseTenMode)}>
                  <option value="learning">New learning: save objective evidence</option>
                  <option value="review">Optional review: dated observations only</option>
                </select>
              </label>
              <p>Choose from the child’s math work, not reading level. Use real bundles first. One session never establishes mastery.</p>
              <button className="btn btn-primary" type="button" onClick={() => start(chosenTier, chosenMode)}>
                Start chosen goal
              </button>
            </div>
          ) : (
            <Choices
              items={[{ id: 'start', label: entry.mode === 'learning' ? 'Try this goal' : 'Explore together · review', icon: '🔢' }]}
              onPick={() => start(entry.tier, entry.mode)}
            />
          )}
          <div className="base-ten-actions">
            <button className="btn" type="button" onClick={() => setGate(true)}>
              Grown-up choices
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
            {BASE_TEN_TIERS[session.tier]!.label} · {session.mode === 'review' ? 'review' : 'learning'} · Round {round + 1} of {BASE_TEN_ROUNDS}
          </p>
          <LessonStage visual={(smaller ?? problem).visual} seed={session.seed + round} />
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
                Back to my number
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
              {round === BASE_TEN_ROUNDS - 1 ? 'Finish mission' : 'Try a new number'}
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
          <p>
            {session.mode === 'review'
              ? 'Review observations saved separately.'
              : 'Your work was saved for this goal. A new goal is suggested only after independent success across days.'}
          </p>
          <div className="base-ten-actions">
            <button type="button" className="btn" onClick={() => start(session.tier, 'review')}>
              Review this goal again
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
