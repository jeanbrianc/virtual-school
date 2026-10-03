/**
 * Digit's and Nova's playful lessons. The adaptive LessonRun decides what
 * comes next; this component turns it into a friendly conversation with
 * touchable manipulatives, gentle scaffolds and a celebratory finish.
 */
import { useEffect, useRef, useState } from 'react';
import { TEACHER_REGISTRY, type TeacherId } from '../../../domain/teachers/registry';
import { LessonRun } from '../../../domain/lessons/engine';
import type { LessonDefinition } from '../../../domain/lessons/types';
import { TEACHERS, personalize, pickLine, teacherOpening } from '../../../domain/teachers/teachers';
import type { TranscriptLine } from '../../../domain/types';
import { hashString } from '../../../domain/util/random';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';
import { TalkBar, useTeacherTalk, type TalkKit } from '../Talk';
import { LessonStage, PatternMaker } from '../lesson/Stages';

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
  speech: Speech;
  playSfx: (name: 'correct' | 'tryAgain' | 'click' | 'sparkle' | 'splash' | 'plop') => void;
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
  const startedAt = useRef(new Date().toISOString());
  const transcript = useRef<TranscriptLine[]>([]);
  const seed = useRef(hashString(startedAt.current + lesson.id));
  const runRef = useRef<LessonRun | null>(null);
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
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const [saving, setSaving] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, delay: number) => {
    timers.current.push(window.setTimeout(fn, delay));
  };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const [, force] = useState(0);
  const [stars, setStars] = useState(0);

  const log = (speaker: TranscriptLine['speaker'], text: string, via?: TranscriptLine['via']) =>
    transcript.current.push({ speaker, text, at: new Date().toISOString(), ...(via ? { via } : {}) });
  const say = (text: string, m: typeof mood = 'happy', via?: TranscriptLine['via']) => {
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

  const close = () => props.onClose(transcript.current, startedAt.current, talk.notes);

  const start = () => {
    runRef.current = new LessonRun(lesson, props.startTier, seed.current);
    setPhase('play');
    const p = runRef.current.currentProblem();
    say(p?.prompt ?? '', 'thinking');
  };

  const advance = (run: LessonRun) => {
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
    if (!run || !p || busy) return;
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
      force((n) => n + 1);
      return;
    }
    setBusy(true);
    later(() => {
      setBusy(false);
      advance(run);
    }, 2200);
  };

  const run = runRef.current;
  const problem = run?.currentProblem();

  return (
    <DialogueShell teacher={teacher} line={line} mood={mood} onClose={close} closeDisabled={saving} speech={speech} wide={phase === 'play'}>
      {phase === 'intro' && (
        <>
          <Choices
            items={[
              { id: 'go', label: TEACHER_REGISTRY[teacher].startLabel, icon: TEACHER_REGISTRY[teacher].celebration.icon, tone: 'primary' },
              { id: 'later', label: 'Maybe later', icon: '👋' },
            ]}
            onPick={(id) => {
              playSfx('click');
              log('child', id === 'go' ? 'Let’s go!' : 'Maybe later');
              if (id === 'go') start();
              else close();
            }}
          />
          <TalkBar kit={props.talk} teacherName={TEACHERS[teacher].name} busy={talk.thinking} onSay={(t, via) => void tell(t, via)} />
        </>
      )}
      {phase === 'play' && problem && (
        <div className="lesson-play">
          <div className="lesson-progress" aria-label={`Round ${(run?.roundIndex ?? 0) + 1} of ${lesson.rounds}`}>
            {Array.from({ length: lesson.rounds }, (_, i) => (
              <span key={i} className={`pip ${i < (run?.roundIndex ?? 0) ? 'done' : i === (run?.roundIndex ?? 0) ? 'now' : ''}`} />
            ))}
          </div>
          <LessonStage visual={problem.visual} seed={hashString(problem.id)} dropping={dropping} />
          {problem.kind === 'create' ? (
            <PatternMaker key={problem.id} onFinish={answer} disabled={busy} />
          ) : (
            <Choices items={problem.choices} onPick={answer} state={choiceState} columns={problem.choices.length > 3 ? 2 : problem.choices.length} />
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
          <div className="lesson-stars" aria-label={`${stars} solved`}>
            {Array.from({ length: Math.max(1, stars) }, (_, i) => (
              <span key={i} className="lesson-star" style={{ animationDelay: `${i * 0.12}s` }}>
                {TEACHER_REGISTRY[teacher].completionIcon}
              </span>
            ))}
          </div>
          <Choices
            items={[
              { id: 'yay', label: 'Yay!', icon: '🎉', tone: 'primary' },
              ...(lesson.id === 'patterns-shapes' ? [{ id: 'replay', label: 'Play again', icon: '🎨' }] : []),
            ]}
            onPick={(id) => {
              if (submitted.current) return;
              if (id === 'replay') {
                startedAt.current = new Date().toISOString();
                seed.current = hashString(startedAt.current + lesson.id);
                transcript.current = [];
                start();
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
