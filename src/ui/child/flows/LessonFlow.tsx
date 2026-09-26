/**
 * Digit's and Nova's playful lessons. The adaptive LessonRun decides what
 * comes next; this component turns it into a friendly conversation with
 * touchable manipulatives, gentle scaffolds and a celebratory finish.
 */
import { useEffect, useRef, useState } from 'react';
import { LessonRun } from '../../../domain/lessons/engine';
import type { LessonDefinition } from '../../../domain/lessons/types';
import { TEACHERS, pickLine, teacherOpening } from '../../../domain/teachers/teachers';
import type { TranscriptLine } from '../../../domain/types';
import { hashString } from '../../../domain/util/random';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';
import { LessonStage } from '../lesson/Stages';

type Phase = 'intro' | 'play' | 'complete';

export interface LessonFlowProps {
  teacher: 'digit' | 'nova';
  lesson: LessonDefinition;
  startTier: number;
  visitsToday: number;
  lastSummary?: string;
  speech: Speech;
  playSfx: (name: 'correct' | 'tryAgain' | 'click' | 'sparkle' | 'splash' | 'plop') => void;
  onComplete: (run: LessonRun, transcript: TranscriptLine[], startedAt: string) => void;
  onClose: (transcript: TranscriptLine[], startedAt: string) => void;
}

export function LessonFlow(props: LessonFlowProps) {
  const { teacher, lesson, speech, playSfx } = props;
  const startedAt = useRef(new Date().toISOString());
  const transcript = useRef<TranscriptLine[]>([]);
  const seed = useRef(hashString(startedAt.current + lesson.id));
  const runRef = useRef<LessonRun | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [line, setLine] = useState(() => {
    const open = teacherOpening(teacher, { visitsToday: props.visitsToday, booksCompleted: 0, ...(props.lastSummary ? { lastLessonSummary: props.lastSummary } : {}) }, seed.current);
    return [...open, ...lesson.intro].join(' ');
  });
  const [mood, setMood] = useState<'happy' | 'thinking' | 'cheer'>('happy');
  const [choiceState, setChoiceState] = useState<Record<string, 'right' | 'soft' | 'disabled'>>({});
  const [dropping, setDropping] = useState<{ floats: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const [stars, setStars] = useState(0);

  const log = (speaker: TranscriptLine['speaker'], text: string) => transcript.current.push({ speaker, text, at: new Date().toISOString() });
  const say = (text: string, m: typeof mood = 'happy') => {
    setLine(text);
    setMood(m);
    log('teacher', text);
  };

  useEffect(() => {
    log('teacher', line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => props.onClose(transcript.current, startedAt.current);

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
      const solved = run.attempts.filter((a) => a.outcome !== 'not_yet').length;
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

    if (p.kind === 'predict') {
      // Watch the test, then talk about what happened.
      const floats = p.meta?.floats === true;
      setBusy(true);
      setChoiceState({ [choiceId]: 'right' });
      say(fb.message, 'happy');
      playSfx('click');
      window.setTimeout(() => {
        setDropping({ floats });
        playSfx(floats ? 'plop' : 'splash');
      }, 700);
      window.setTimeout(() => {
        const matched = (choiceId === 'float') === floats;
        say(matched ? `It ${floats ? 'floated' : 'sank'} — just like you predicted!` : `Ooh, a surprise! It ${floats ? 'floated' : 'sank'}. Scientists love surprises!`, 'cheer');
        playSfx(matched ? 'correct' : 'sparkle');
      }, 2600);
      window.setTimeout(() => {
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
    window.setTimeout(() => {
      setBusy(false);
      advance(run);
    }, 2200);
  };

  const run = runRef.current;
  const problem = run?.currentProblem();

  return (
    <DialogueShell teacher={teacher} line={line} mood={mood} onClose={close} speech={speech} wide={phase === 'play'}>
      {phase === 'intro' && (
        <Choices
          items={[
            { id: 'go', label: teacher === 'digit' ? 'Let’s rescue them!' : 'Let’s investigate!', icon: teacher === 'digit' ? '🚀' : '🔬', tone: 'primary' },
            { id: 'later', label: 'Maybe later', icon: '👋' },
          ]}
          onPick={(id) => {
            playSfx('click');
            log('child', id === 'go' ? 'Let’s go!' : 'Maybe later');
            if (id === 'go') start();
            else close();
          }}
        />
      )}
      {phase === 'play' && problem && (
        <div className="lesson-play">
          <div className="lesson-progress" aria-label={`Round ${(run?.roundIndex ?? 0) + 1} of ${lesson.rounds}`}>
            {Array.from({ length: lesson.rounds }, (_, i) => (
              <span key={i} className={`pip ${i < (run?.roundIndex ?? 0) ? 'done' : i === (run?.roundIndex ?? 0) ? 'now' : ''}`} />
            ))}
          </div>
          <LessonStage visual={problem.visual} seed={hashString(problem.id)} dropping={dropping} />
          <Choices items={problem.choices} onPick={answer} state={choiceState} columns={problem.choices.length > 3 ? 2 : problem.choices.length} />
        </div>
      )}
      {phase === 'complete' && (
        <div className="lesson-complete">
          <div className="lesson-complete-title">{lesson.completeTitle}</div>
          <div className="lesson-stars" aria-label={`${stars} solved`}>
            {Array.from({ length: Math.max(1, stars) }, (_, i) => (
              <span key={i} className="lesson-star" style={{ animationDelay: `${i * 0.12}s` }}>
                {teacher === 'digit' ? '🪨' : '💧'}
              </span>
            ))}
          </div>
          <Choices
            items={[{ id: 'yay', label: 'Yay!', icon: '🎉', tone: 'primary' }]}
            onPick={() => {
              playSfx('click');
              if (run) props.onComplete(run, transcript.current, startedAt.current);
            }}
          />
        </div>
      )}
    </DialogueShell>
  );
}
