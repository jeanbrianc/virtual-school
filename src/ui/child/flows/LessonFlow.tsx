/**
 * Digit's and Nova's playful lessons. The adaptive LessonRun decides what
 * comes next; this component turns it into a friendly conversation with
 * touchable manipulatives, gentle scaffolds and a celebratory finish.
 */
import { useEffect, useRef, useState } from 'react';
import { TEACHER_REGISTRY, type TeacherId } from '../../../domain/teachers/registry';
import { LessonRun } from '../../../domain/lessons/engine';
import type { LessonDefinition, Problem } from '../../../domain/lessons/types';
import { TEACHERS, personalize, pickLine, teacherOpening } from '../../../domain/teachers/teachers';
import type { TranscriptLine } from '../../../domain/types';
import { hashString } from '../../../domain/util/random';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';
import { TalkBar, useTeacherTalk, type TalkKit } from '../Talk';
import { PatternLevelChoices, PatternProgressionChoices, PatternWorkedModel } from '../lesson/PatternProgression';
import { ShapePicture } from '../lesson/ShapePicture';
import { LifeCycleModel, LifeCyclePicture } from '../lesson/LifeCyclePicture';
import { LessonStage } from '../lesson/Stages';

type Phase = 'intro' | 'play' | 'complete';

export interface LessonFlowProps {
  teacher: TeacherId;
  lesson: LessonDefinition;
  startTier: number;
  visitsToday: number;
  childName: string;
  /** True until she has had a conversation with this teacher. */
  firstMeeting: boolean;
  lastSummary?: string;
  /** Available only before this run begins. */
  onChooseActivity?: () => void;
  speech: Speech;
  playSfx: (name: 'correct' | 'tryAgain' | 'click' | 'sparkle' | 'splash' | 'plop') => void;
  onSaveContinue?: (run: LessonRun, transcript: TranscriptLine[], startedAt: string, parentNotes: string[]) => Promise<void>;
  onComplete: (run: LessonRun, transcript: TranscriptLine[], startedAt: string, parentNotes: string[]) => void;
  onClose: (transcript: TranscriptLine[], startedAt: string, parentNotes: string[]) => void;
  /** Microphone and conversation service for chatting before the lesson. */
  talk: TalkKit;
}

/** "yes" / "let's go" / "ready" — she wants to start. */
const START_WORDS = /^(?:yes|yeah|yep|ok|okay|sure|ready|let'?s (?:go|do it|start|rescue|investigate|play)|go|start|i'?m ready)\b/i;
const LATER_WORDS = /^(?:no|nope|maybe later|later|not now|bye|goodbye)\b/i;

export function LessonFlow(props: LessonFlowProps) {
  const { teacher, lesson, speech, playSfx } = props;
  const lifeCycle = lesson.id === 'life-cycle';
  const patternLab = lesson.id === 'pattern-progression';
  const childPaced = lifeCycle || patternLab;
  const active = useRef(true);
  const [showModel, setShowModel] = useState(false);
  const [nextReady, setNextReady] = useState(false);
  const nextReadyRef = useRef(false);
  const startedAt = useRef(new Date().toISOString());
  const transcript = useRef<TranscriptLine[]>([]);
  const seed = useRef(hashString(startedAt.current + lesson.id));
  const runRef = useRef<LessonRun | null>(null);
  const [shownProblem, setShownProblem] = useState<Problem | null>(null);
  const [shownRound, setShownRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [line, setLine] = useState(() => {
    const open = teacherOpening(
      teacher,
      {
        childName: props.childName,
        firstMeeting: props.firstMeeting,
        visitsToday: props.visitsToday,
        booksCompleted: 0,
        ...(props.lastSummary ? { lastLessonSummary: props.lastSummary } : {}),
      },
      seed.current,
    );
    return [...open, ...lesson.intro.map((l) => personalize(l, props.childName))].join(' ');
  });
  const [mood, setMood] = useState<'happy' | 'thinking' | 'cheer'>('happy');
  const [choiceState, setChoiceState] = useState<Record<string, 'right' | 'soft' | 'disabled'>>({});
  const [dropping, setDropping] = useState<{ floats: boolean } | null>(null);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (value: boolean) => {
    busyRef.current = value;
    setBusyState(value);
  };
  const submitted = useRef(false);
  const [saving, setSaving] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, delay: number) => {
    timers.current.push(window.setTimeout(fn, delay));
  };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      timers.current.forEach(window.clearTimeout);
    };
  }, []);
  const [, force] = useState(0);
  const [stars, setStars] = useState(0);

  const log = (speaker: TranscriptLine['speaker'], text: string, via?: TranscriptLine['via']) =>
    transcript.current.push({ speaker, text, at: new Date().toISOString(), ...(via ? { via } : {}) });
  const say = (text: string, m: typeof mood = 'happy', via?: TranscriptLine['via']) => {
    if (!active.current) return;
    setLine(text);
    setMood(m);
    log('teacher', text, via);
  };
  const talk = useTeacherTalk({
    teacher,
    childName: props.childName,
    books: [],
    kit: props.talk,
    transcript: () => transcript.current,
    log,
  });

  /** She said something before the lesson: start, leave, or just chat. */
  const tell = async (text: string, via: 'voice' | 'typed') => {
    if (START_WORDS.test(text.trim())) {
      log('child', text, via);
      start();
      return;
    }
    if (LATER_WORDS.test(text.trim())) {
      log('child', text, via);
      close();
      return;
    }
    const reply = await talk.send(text, via);
    say(reply.reply, reply.intent === 'question' ? 'thinking' : 'happy', reply.source === 'ai' ? 'ai' : undefined);
  };

  useEffect(() => {
    log('teacher', line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (!active.current || saving) return;
    active.current = false;
    timers.current.forEach(window.clearTimeout);
    busyRef.current = true;
    props.onClose(transcript.current, startedAt.current, talk.notes);
  };

  const start = (chosenTier?: number) => {
    if (!active.current) return;
    runRef.current = new LessonRun(lesson, lesson.id === 'patterns-shapes' || childPaced ? (chosenTier ?? 0) : props.startTier, seed.current);
    setShowModel(false);
    setNextReady(false);
    nextReadyRef.current = false;
    setChoiceState({});
    setPhase('play');
    const p = runRef.current.currentProblem();
    setShownProblem(p);
    setShownRound(0);
    setBusy(false);
    say(p?.prompt ?? '', 'thinking');
  };

  const advance = (run: LessonRun) => {
    if (!active.current) return;
    setShowModel(false);
    setNextReady(false);
    nextReadyRef.current = false;
    setShownProblem(run.currentProblem());
    setShownRound(run.roundIndex);
    setChoiceState({});
    setDropping(null);
    if (run.isComplete) {
      setPhase('complete');
      const solved = run.attempts.filter((a) => a.outcome !== 'not_yet' && run.problemIndex.get(a.problemId)?.kind !== 'create').length;
      setStars(solved);
      say(`${lesson.completeTitle} ${lesson.outro}`, 'cheer');
      playSfx('sparkle');
    } else {
      say(run.currentProblem()?.prompt ?? '', 'thinking');
    }
    force((n) => n + 1);
  };

  const answer = (choiceId: string) => {
    const run = runRef.current;
    const p = run?.currentProblem();
    if (!active.current || !run || !p || busyRef.current) return;
    const label = p.choices.find((c) => c.id === choiceId)?.label ?? choiceId;
    log('child', label);
    const wasStone = run.isSteppingStone();
    const fb = run.answer(choiceId);

    if (p.kind === 'create') {
      advance(run);
      return;
    }
    if (p.kind === 'predict') {
      // Watch the test, then talk about what happened.
      const floats = p.meta?.floats === true;
      setBusy(true);
      setChoiceState({ [choiceId]: 'right' });
      say(fb.message, 'happy');
      playSfx('click');
      later(() => {
        setDropping({ floats });
        playSfx(floats ? 'plop' : 'splash');
      }, 700);
      later(() => {
        const matched = (choiceId === 'float') === floats;
        say(
          matched
            ? `It ${floats ? 'floated' : 'sank'} — just like you predicted!`
            : `Ooh, a surprise! It ${floats ? 'floated' : 'sank'}. Scientists love surprises!`,
          'cheer',
        );
        playSfx(matched ? 'correct' : 'sparkle');
      }, 2600);
      later(() => {
        setBusy(false);
        advance(run);
      }, 4600);
      return;
    }

    if (fb.correct && fb.problemFinished) {
      playSfx('correct');
      setChoiceState({ [choiceId]: 'right' });
      say(`${fb.message}${fb.tierChange === 'up' ? ` ${pickLine(TEACHERS[teacher].praise, run.attempts.length)} Let’s try a trickier one!` : ''}`, 'cheer');
    } else if (fb.problemFinished) {
      playSfx('tryAgain');
      setChoiceState({ [p.answerId]: 'right' });
      say(fb.message, 'happy');
    } else {
      // Not finished yet: a stepping-stone result, or a gentle scaffold.
      if (wasStone) {
        playSfx(fb.correct ? 'correct' : 'tryAgain');
        setChoiceState({});
        say(fb.message, 'thinking');
      } else if (fb.scaffold?.type === 'simpler') {
        playSfx('tryAgain');
        setChoiceState({});
        say(`${fb.message} ${run.currentProblem()?.prompt ?? ''}`, 'thinking');
      } else {
        playSfx('tryAgain');
        setChoiceState((s) => ({ ...s, [choiceId]: 'disabled' }));
        say(fb.message, 'thinking');
      }
      setShownProblem(run.currentProblem());
      force((n) => n + 1);
      return;
    }
    setBusy(true);
    if (childPaced) {
      nextReadyRef.current = true;
      setNextReady(true);
      return;
    }
    later(() => {
      setBusy(false);
      advance(run);
    }, 2200);
  };

  const run = runRef.current;
  const problem = shownProblem;

  return (
    <DialogueShell teacher={teacher} line={line} mood={mood} onClose={close} closeDisabled={saving} speech={speech} wide={phase === 'play'}>
      {phase === 'intro' && (
        <>
          {patternLab && (
            <PatternLevelChoices
              onStart={(tier) => {
                log('child', lesson.tiers[tier]!.label);
                start(tier);
              }}
            />
          )}
          <Choices
            items={[
              ...(patternLab
                ? []
                : lifeCycle
                  ? [
                      { id: 'go', label: lesson.tiers[0]!.label, icon: '🌱', tone: 'primary' as const },
                      { id: 'challenge', label: lesson.tiers[1]!.label, icon: '🦋' },
                    ]
                  : [{ id: 'go', label: TEACHER_REGISTRY[teacher].startLabel, icon: TEACHER_REGISTRY[teacher].celebration.icon, tone: 'primary' as const }]),
              { id: 'later', label: 'Maybe later', icon: '👋' },
            ]}
            onPick={(id) => {
              playSfx('click');
              log('child', id === 'challenge' ? lesson.tiers[1]!.label : id === 'go' ? (lifeCycle ? lesson.tiers[0]!.label : 'Let’s go!') : 'Maybe later');
              if (id === 'go' || id === 'challenge') start(id === 'challenge' ? 1 : undefined);
              else close();
            }}
          />
          {props.onChooseActivity && (
            <button type="button" className="btn" onClick={props.onChooseActivity} data-testid="choose-teacher-activity">
              Choose an activity
            </button>
          )}
          <TalkBar kit={props.talk} teacherName={TEACHERS[teacher].name} busy={talk.thinking} onSay={(t, via) => void tell(t, via)} />
        </>
      )}
      {phase === 'play' && problem && (
        <div className="lesson-play">
          <div className="lesson-progress" aria-label={`Round ${shownRound + 1} of ${lesson.rounds}`}>
            {Array.from({ length: lesson.rounds }, (_, i) => (
              <span key={i} className={`pip ${i < shownRound ? 'done' : i === shownRound ? 'now' : ''}`} />
            ))}
          </div>
          <LessonStage visual={problem.visual} seed={hashString(problem.id)} dropping={dropping} />
          {childPaced ? (
            <>
              {patternLab ? (
                <PatternProgressionChoices problem={problem} busy={busy} state={choiceState} answer={answer} />
              ) : (
                <div className="life-choices" aria-label="Life-cycle picture choices">
                  {problem.choices.map((choice) => (
                    <button
                      type="button"
                      key={choice.id}
                      data-testid={`choice-${choice.id}`}
                      aria-label={`Choose ${choice.label}`}
                      disabled={busy || choiceState[choice.id] === 'disabled'}
                      className={`life-choice ${choiceState[choice.id] === 'right' ? 'life-selected' : choiceState[choice.id] === 'soft' ? 'life-supported' : ''}`}
                      onClick={() => answer(choice.id)}
                    >
                      {choice.lifeStage && <LifeCyclePicture stage={choice.lifeStage} />}
                      <span>{choice.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {showModel && patternLab && <PatternWorkedModel problem={problem} />}
              {showModel && problem.visual.type === 'life-cycle' && <LifeCycleModel cycle={problem.visual.cycle} />}
              {nextReady && (
                <button
                  type="button"
                  className={`btn btn-primary ${patternLab ? 'pattern-next' : 'life-next'}`}
                  data-testid={patternLab ? 'pattern-next' : 'life-next'}
                  onClick={() => {
                    if (!active.current || !nextReadyRef.current || !run || run !== runRef.current) return;
                    nextReadyRef.current = false;
                    setBusy(false);
                    advance(run);
                  }}
                >
                  {patternLab ? 'Next round →' : 'Next picture →'}
                </button>
              )}
              <div className={patternLab ? 'pattern-controls' : 'life-controls'}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    if (active.current && !busyRef.current && run && run === runRef.current && run.currentProblem() === problem) say(run.hint().message);
                  }}
                >
                  💡 Hint
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    if (active.current && !busyRef.current && run && run === runRef.current && run.currentProblem() === problem) {
                      say(run.model().message);
                      setShowModel(true);
                      setChoiceState({ [problem.answerId]: 'soft' });
                    }
                  }}
                >
                  👀 Show the model
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    if (active.current && !busyRef.current && run && run === runRef.current && run.currentProblem() === problem) {
                      run.skip();
                      advance(run);
                    }
                  }}
                >
                  Skip this round
                </button>
              </div>
              {patternLab && run && !run.isComplete && run.startTier > 0 && (
                <div className="pattern-controls">
                  <button
                    type="button"
                    className="btn"
                    data-testid="pattern-return-matching"
                    onClick={() => {
                      if (!active.current || run !== runRef.current || run.isComplete) return;
                      startedAt.current = new Date().toISOString();
                      seed.current = hashString(startedAt.current + lesson.id);
                      transcript.current = [];
                      log('child', 'Started over with matching; unfinished pattern run was not saved.');
                      start(0);
                    }}
                  >
                    Start over with matching
                  </button>
                  <small>Restarts without saving this unfinished run.</small>
                </div>
              )}
            </>
          ) : lesson.id === 'patterns-shapes' ? (
            <div className="shape-choices">
              {problem.choices.map((choice) => (
                <button
                  type="button"
                  key={choice.id}
                  data-testid={`choice-${choice.id}`}
                  aria-label={`Choose ${choice.label}`}
                  disabled={busy || choiceState[choice.id] === 'disabled'}
                  className={`shape-choice ${choiceState[choice.id] === 'right' ? 'shape-chosen' : choiceState[choice.id] === 'soft' ? 'shape-hint' : ''}`}
                  onClick={() => answer(choice.id)}
                >
                  {choice.shapes?.map((shape, i) => (
                    <ShapePicture key={i} shape={shape} />
                  ))}
                  <span className="sr-only">{choice.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <Choices items={problem.choices} onPick={answer} state={choiceState} columns={problem.choices.length > 3 ? 2 : problem.choices.length} />
          )}
          {lesson.id === 'patterns-shapes' && problem.kind !== 'create' && (
            <button
              type="button"
              className="pattern-skip"
              disabled={busy}
              onClick={() => {
                if (run) {
                  const fb = run.hint();
                  say(fb.message, 'happy');
                  setChoiceState({ [problem.answerId]: 'soft' });
                }
              }}
            >
              ✨ Show me
            </button>
          )}
          {lesson.id === 'patterns-shapes' && (
            <button
              type="button"
              className="pattern-skip"
              disabled={busy}
              onClick={() => {
                if (run) {
                  run.skip();
                  advance(run);
                }
              }}
            >
              Skip this round
            </button>
          )}
        </div>
      )}
      {phase === 'complete' && (
        <div className="lesson-complete">
          <div className="lesson-complete-title">{lesson.completeTitle}</div>
          {patternLab && (
            <details className="pattern-ceiling">
              <summary>Grown-ups: what was practiced?</summary>
              <p>
                Matching or choosing one next shape from visible grouped repeats. Copying and describing a rule were not assessed. Pattern play creates no saved
                artwork; creative designs in Shape Studio remain ungraded observations.
              </p>
            </details>
          )}
          {lifeCycle && (
            <p className="life-ceiling">
              You explored two picture models. Picture-and-label matching and next-stage choices are the only skills recorded here. Next: look at a real plant
              with a grown-up. Aquarium friends celebrate visits, not science proficiency.
            </p>
          )}
          <div className="lesson-stars" aria-label={childPaced ? 'Exploration finished' : `${stars} solved`}>
            {Array.from({ length: patternLab ? 1 : Math.max(1, stars) }, (_, i) => (
              <span key={i} className="lesson-star" style={{ animationDelay: `${i * 0.12}s` }}>
                {lifeCycle ? '🌱' : TEACHER_REGISTRY[teacher].completionIcon}
              </span>
            ))}
          </div>
          <Choices
            items={[
              { id: 'yay', label: childPaced ? 'Save & finish' : 'Yay!', icon: '🎉', tone: 'primary' },
              ...(lifeCycle
                ? [
                    { id: 'replay', label: 'Save & play again', icon: '🌱' },
                    { id: 'switch-level', label: run?.startTier === 0 ? 'Save & try next stage' : 'Save & try matching', icon: '🦋' },
                  ]
                : []),
              ...(patternLab
                ? [
                    { id: 'replay', label: 'Save & play again', icon: '🔷' },
                    { id: 'choose-pattern', label: 'Save & choose a pattern', icon: '🎨' },
                    ...(run?.startTier ? [{ id: 'match', label: 'Save & try matching', icon: '🔵' }] : []),
                  ]
                : []),
              ...(lesson.id === 'patterns-shapes'
                ? [
                    { id: 'replay', label: 'Play again', icon: '🎨' },
                    ...(run?.startTier === 0 &&
                    run.attempts.filter((a) => a.outcome === 'independent' && run.problemIndex.get(a.problemId)?.kind === 'answer').length === 2
                      ? [{ id: 'pattern', label: 'Try a little pattern', icon: '⭐' }]
                      : []),
                  ]
                : []),
            ]}
            onPick={async (id) => {
              if (submitted.current || !active.current || run !== runRef.current) return;
              if ((id === 'pattern' || (childPaced && ['replay', 'switch-level', 'choose-pattern', 'match'].includes(id))) && run) {
                if (!props.onSaveContinue) return;
                submitted.current = true;
                setSaving(true);
                try {
                  await props.onSaveContinue(run, transcript.current, startedAt.current, talk.notes);
                } catch {
                  say('Let’s try saving that again.');
                  return;
                } finally {
                  submitted.current = false;
                  setSaving(false);
                }
              }
              if (!active.current) return;
              if (id === 'replay' || id === 'pattern' || id === 'switch-level' || id === 'choose-pattern' || id === 'match') {
                startedAt.current = new Date().toISOString();
                seed.current = hashString(startedAt.current + lesson.id);
                transcript.current = [];
                if (id === 'choose-pattern') {
                  runRef.current = null;
                  setPhase('intro');
                  say(lesson.intro.map((l) => personalize(l, props.childName)).join(' '));
                  return;
                }
                start(id === 'match' ? 0 : id === 'pattern' ? 1 : id === 'switch-level' ? (run?.startTier === 0 ? 1 : 0) : run?.startTier);
                return;
              }
              playSfx('click');
              submitted.current = true;
              setSaving(true);
              if (run) props.onComplete(run, transcript.current, startedAt.current, talk.notes);
            }}
          />
        </div>
      )}
    </DialogueShell>
  );
}
