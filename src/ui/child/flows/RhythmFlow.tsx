import { useEffect, useRef, useState } from 'react';
import { RhythmPlayer } from '../../../audio/RhythmPlayer';
import {
  beatCount,
  comfortablePulse,
  DEFAULT_PULSE_MS,
  matchRhythm,
  rhythmGaps,
  rhythmLabel,
  type BeatCount,
  type RhythmInput,
  type RhythmMode,
  type RhythmPresentation,
  type RhythmRun,
  type RhythmOutcome,
} from '../../../domain/music/rhythm';
import { TeacherPortrait } from '../TeacherPortrait';

type Stage = 'intro' | 'calibrate' | 'watch' | 'attempt' | 'feedback' | 'complete';
function Pattern({ beats, pattern, pulse = -1 }: { beats: BeatCount; pattern: 'a' | 'b'; pulse?: number }) {
  return (
    <div className="rhythm-pattern" role="img" aria-label={rhythmLabel(beats, pattern)}>
      {Array.from({ length: beats }, (_, i) => (
        <span className="rhythm-part" key={i}>
          {i > 0 && (
            <span className={`rhythm-gap gap-${rhythmGaps(beats, pattern)[i - 1]}`} aria-hidden="true">
              {rhythmGaps(beats, pattern)[i - 1] === 1 ? 'short' : 'long'}
            </span>
          )}
          <span className={`rhythm-beat ${pulse === i ? 'active' : ''}`} aria-hidden="true">
            {i + 1}
          </span>
        </span>
      ))}
    </div>
  );
}

/** No teacher-chat, microphone or remote speech dependency. All input remains in this visit. */
export function RhythmFlow({
  childId,
  beats: configuredBeats,
  muted,
  volume,
  onSave,
  onClose,
}: {
  childId: string;
  beats?: number;
  muted: boolean;
  volume: number;
  onSave: (run: RhythmRun) => Promise<void>;
  onClose: () => void;
}) {
  const beats = beatCount(configuredBeats);
  const makeRun = (mode: RhythmMode): RhythmRun => ({
    id: crypto.randomUUID(),
    childId,
    startedAt: new Date().toISOString(),
    beats,
    mode,
    trials: [],
    cancelled: false,
  });
  const run = useRef(makeRun('copy'));
  const [stage, setStage] = useState<Stage>('intro');
  const [round, setRound] = useState(0);
  const [mode, setMode] = useState<RhythmMode>('copy');
  const [pulse, setPulse] = useState(DEFAULT_PULSE_MS);
  const [pulseIndex, setPulseIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [watched, setWatched] = useState(false);
  const [visualOnly, setVisualOnly] = useState(muted);
  const [paused, setPaused] = useState(false);
  const [supported, setSupported] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [message, setMessage] = useState('');
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const presentation = useRef<RhythmPresentation>('visual-only');
  const input = useRef<RhythmInput | null>(null);
  const taps = useRef<number[]>([]);
  const player = useRef(new RhythmPlayer());
  const panel = useRef<HTMLDivElement>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const saving = useRef(false);
  const saved = useRef(false);
  const closed = useRef(false);
  const finished = useRef(false);
  const pausedRef = useRef(false);
  const stateRef = useRef({ stage, round, supported, mode });
  stateRef.current = { stage, round, supported, mode };
  const pattern = round === 0 ? 'a' : 'b';
  const cancelPlayback = () => {
    epoch.current++;
    player.current.stop();
    setPlaying(false);
    setPulseIndex(-1);
  };
  const clearTaps = () => {
    taps.current = [];
    input.current = null;
    setTapCount(0);
    finished.current = false;
  };
  const pause = () => {
    if (!['watch', 'attempt', 'calibrate'].includes(stateRef.current.stage) || saving.current) return;
    pausedRef.current = true;
    cancelPlayback();
    clearTaps();
    setWatched(false);
    setPaused(true);
    setMessage('Paused. Any unfinished taps were set aside. Come back when you are ready.');
  };
  useEffect(() => {
    mounted.current = true;
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      epoch.current++;
      player.current.dispose();
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    panel.current?.focus();
  }, [stage, paused, round]);
  useEffect(() => {
    if (muted) {
      setVisualOnly(true);
      if (stateRef.current.stage === 'watch' || stateRef.current.stage === 'attempt') pause();
    }
  }, [muted]);
  const close = () => {
    if (saving.current) return;
    closed.current = true;
    run.current.cancelled = true;
    cancelPlayback();
    onClose();
  };
  const begin = (nextMode: RhythmMode) => {
    if (closed.current || saving.current || (run.current.trials.length === 2 && !saved.current)) return;
    saved.current = false;
    cancelPlayback();
    clearTaps();
    setRound(0);
    setMode(nextMode);
    run.current = makeRun(nextMode);
    setSave('idle');
    setSupported(false);
    setWatched(false);
    setPaused(false);
    pausedRef.current = false;
    setMessage('');
    setStage(nextMode === 'copy' ? 'calibrate' : 'watch');
  };
  const play = async () => {
    if (playing || pausedRef.current || closed.current) return;
    const generation = ++epoch.current;
    setPlaying(true);
    setWatched(false);
    setMessage('Watch the numbered beats. A long pause leaves more space.');
    const result = await player.current.play(beats, pattern, pulse, !muted && !visualOnly && volume > 0, volume, (index) => {
      if (mounted.current && generation === epoch.current) setPulseIndex(index);
    });
    if (!mounted.current || generation !== epoch.current) return;
    setPlaying(false);
    setPulseIndex(-1);
    presentation.current = result.presentation;
    setWatched(result.reliable);
    setMessage(
      result.reliable
        ? 'Ready whenever you are. You can replay or continue.'
        : 'The playback was interrupted. Replay when you are ready, or choose a picture without timing.',
    );
  };
  const record = (outcome: RhythmOutcome, kind: RhythmInput) => {
    if (finished.current || pausedRef.current || closed.current) return;
    finished.current = true;
    cancelPlayback();
    run.current.trials.push({
      stage: round === 0 ? 'guided' : 'independent',
      pattern,
      outcome,
      supported: round === 0 || supported,
      input: kind,
      presentation: mode === 'recognize' ? 'visual-only' : presentation.current,
    });
    setMessage(
      outcome === 'matched'
        ? mode === 'copy'
          ? 'You made a beat-and-pause pattern!'
          : 'Those beat-and-pause pictures match!'
        : outcome === 'skipped'
          ? 'You can explore another way whenever you like.'
          : 'Thank you for exploring. Devices and ways of tapping can feel different. You can also choose pictures without timing.',
    );
    setStage('feedback');
  };
  const tap = (kind: 'keyboard-or-assistive' | 'pointer-or-touch', eventTime: number) => {
    if (pausedRef.current || finished.current) return;
    const current = stateRef.current.stage;
    if (current !== 'calibrate' && current !== 'attempt') return;
    const now = performance.now();
    if (current === 'attempt' && (eventTime > now + 20 || now - eventTime > 250)) {
      record('explored', kind);
      return;
    }
    input.current = input.current && input.current !== kind ? 'mixed' : kind;
    taps.current.push(now);
    setTapCount(taps.current.length);
    if (current === 'calibrate' && taps.current.length === 3) {
      const pace = comfortablePulse(taps.current);
      setPulse(pace ?? DEFAULT_PULSE_MS);
      clearTaps();
      setMessage(
        pace
          ? 'We’ll use your comfortable pace. This warm-up is never scored or saved.'
          : 'We’ll use a gentle starting pace. You can choose pictures without timing at any point.',
      );
      setStage('watch');
    } else if (current === 'attempt' && taps.current.length === beats)
      record(matchRhythm(beats, pattern, pulse, taps.current) ? 'matched' : 'explored', input.current ?? kind);
  };
  const saveVisit = async () => {
    if (saving.current || save === 'saved' || closed.current || run.current.cancelled) return;
    saving.current = true;
    setSave('saving');
    try {
      await onSave(structuredClone(run.current));
      saved.current = true;
      if (mounted.current) setSave('saved');
    } catch {
      if (mounted.current) setSave('error');
    } finally {
      saving.current = false;
    }
  };
  return (
    <div className="rhythm-overlay">
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rhythm-title"
        className="rhythm-panel"
        data-testid="rhythm-flow"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) pause();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
          if (event.key === 'Tab') {
            const buttons = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
            const i = buttons.indexOf(document.activeElement as HTMLElement);
            if ((event.shiftKey && i <= 0) || (!event.shiftKey && i === buttons.length - 1)) {
              event.preventDefault();
              buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
            }
          }
        }}
      >
        <header className="rhythm-header">
          <TeacherPortrait id="milo" size={76} />
          <div>
            <p className="rhythm-eyebrow">Milo’s music garden</p>
            <h2 id="rhythm-title">Beats and little pauses</h2>
          </div>
        </header>
        <p className="rhythm-step">
          {beats} beats · {mode === 'copy' ? 'Copy a rhythm' : 'Match a picture, no timing'}
          {!['intro', 'calibrate', 'complete'].includes(stage) ? ` · ${round === 0 ? 'Try together' : 'A fresh pattern'}` : ''}
        </p>
        <div className="rhythm-options">
          <label>
            <input
              type="checkbox"
              checked={visualOnly || muted}
              disabled={muted || save === 'saving'}
              onChange={(e) => {
                setVisualOnly(e.target.checked);
                if (stage === 'watch' || stage === 'attempt') {
                  cancelPlayback();
                  clearTaps();
                  setWatched(false);
                  if (stage === 'attempt') setSupported(true);
                  setStage('watch');
                  setMessage('Sound changed. Look at or replay the pattern before continuing.');
                }
              }}
            />{' '}
            Visual only / sound off
          </label>
          <span>{muted ? 'School sound is muted.' : 'No headphones needed.'}</span>
        </div>
        {paused ? (
          <div className="rhythm-body">
            <h3>Ready when you are</h3>
            <p>{message}</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                pausedRef.current = false;
                setPaused(false);
                clearTaps();
                setWatched(false);
                setStage(stage === 'calibrate' ? 'calibrate' : 'watch');
                setMessage('Replay the model before continuing.');
              }}
            >
              Resume rhythm
            </button>
          </div>
        ) : (
          <div className="rhythm-body">
            {stage === 'intro' && (
              <>
                <p>Hello! I’m Milo, an otter who likes gentle beats. We’ll watch, try together, then explore a different pattern. You can leave at any time.</p>
                <div className="rhythm-actions">
                  <button className="btn btn-primary" onClick={() => begin('copy')}>
                    Tap a rhythm
                  </button>
                  <button className="btn" onClick={() => begin('recognize')}>
                    Choose matching pictures
                  </button>
                </div>
              </>
            )}
            {stage === 'calibrate' && (
              <>
                <h3>Find a comfortable pace</h3>
                <p>Tap three times with a comfortable pause between taps. There’s no hurry. This only changes playback pace; it isn’t a test.</p>
              </>
            )}
            {stage === 'watch' && (
              <>
                <h3>{round === 0 ? 'Listen or watch with me' : 'Here’s a different pattern'}</h3>
                <p>A short pause is one space. A long pause is three spaces. The numbers light up without moving.</p>
                <Pattern beats={beats} pattern={pattern} pulse={pulseIndex} />
                <div className="rhythm-actions">
                  <button className="btn btn-primary" disabled={playing} onClick={() => void play()}>
                    {watched ? 'Replay pattern' : 'Play / watch pattern'}
                  </button>
                  {playing && (
                    <button
                      className="btn"
                      onClick={() => {
                        cancelPlayback();
                        setWatched(false);
                        setMessage('Stopped. Replay whenever you are ready.');
                      }}
                    >
                      Stop playback
                    </button>
                  )}
                  <button
                    className="btn"
                    disabled={(mode === 'copy' && !watched) || playing}
                    onClick={() => {
                      clearTaps();
                      setStage('attempt');
                      setMessage('');
                    }}
                  >
                    {round === 0 ? 'Try together' : 'Try this pattern'}
                  </button>
                </div>
              </>
            )}
            {stage === 'attempt' && (
              <>
                <h3>{mode === 'recognize' ? 'Which picture matches?' : round === 0 ? 'Copy the spaces between beats' : 'Your turn, in your own time'}</h3>
                {(round === 0 || supported || mode === 'recognize') && <Pattern beats={beats} pattern={pattern} />}
                {mode === 'copy' ? (
                  <p>Start with your own first tap. Leave the short or long pauses between taps. There is no start deadline.</p>
                ) : (
                  <>
                    <p>Match the picture above. Take as long as you like.</p>
                    <div className="rhythm-choices">
                      {(round === 0 ? ['b', 'a'] : ['a', 'b']).map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          aria-label={`Choose ${rhythmLabel(beats, choice as 'a' | 'b')}`}
                          data-testid={`rhythm-choice-${choice}`}
                          onClick={() => record(choice === pattern ? 'matched' : 'explored', 'choice')}
                        >
                          <Pattern beats={beats} pattern={choice as 'a' | 'b'} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {(stage === 'calibrate' || (stage === 'attempt' && mode === 'copy')) && (
              <button
                className="rhythm-tap"
                type="button"
                data-testid="rhythm-tap"
                onKeyDown={(event) => {
                  if ((event.key === ' ' || event.key === 'Enter') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (!event.repeat) tap('keyboard-or-assistive', event.timeStamp);
                  }
                }}
                onClick={(event) => tap(event.detail === 0 ? 'keyboard-or-assistive' : 'pointer-or-touch', event.timeStamp)}
              >
                Tap beat{' '}
                <span>
                  {tapCount} / {stage === 'calibrate' ? 3 : beats}
                </span>
                <small>Touch, Enter, Space or your access switch</small>
              </button>
            )}
            {stage === 'calibrate' && (
              <button
                className="btn"
                onClick={() => {
                  clearTaps();
                  setPulse(DEFAULT_PULSE_MS);
                  setStage('watch');
                }}
              >
                Skip warm-up
              </button>
            )}
            {stage === 'attempt' && (
              <div className="rhythm-actions">
                <button
                  className="btn"
                  onClick={() => {
                    setSupported(true);
                    clearTaps();
                    setMessage('Notice the short and long spaces. We can use the model together.');
                  }}
                >
                  Hint: show the spaces
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setSupported(true);
                    clearTaps();
                    setWatched(false);
                    setStage('watch');
                  }}
                >
                  Replay the model with help
                </button>
                <button className="btn" onClick={() => record('skipped', input.current ?? 'none')}>
                  Skip this pattern
                </button>
              </div>
            )}
            {stage === 'feedback' && (
              <>
                <p className="rhythm-feedback">{message}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    clearTaps();
                    setSupported(false);
                    setWatched(false);
                    setMessage('');
                    if (round === 0) {
                      setRound(1);
                      setStage('watch');
                    } else setStage('complete');
                  }}
                >
                  {round === 0 ? 'Explore a fresh pattern' : 'Finish visit'}
                </button>
              </>
            )}
            {stage === 'complete' && (
              <>
                <h3>Thanks for making music with me!</h3>
                <p>
                  {mode === 'recognize'
                    ? 'You explored beat-and-pause pictures. This records picture matching, not timed rhythm copying.'
                    : 'You explored beat-and-pause copying. Device timing and ways of tapping never mean low ability.'}
                </p>
                <div className="rhythm-actions">
                  <button className="btn btn-primary" disabled={save === 'saving' || save === 'saved'} onClick={() => void saveVisit()}>
                    {save === 'saved' ? 'Visit saved' : save === 'saving' ? 'Saving…' : save === 'error' ? 'Retry save' : 'Save visit'}
                  </button>
                  <button className="btn" disabled={save !== 'saved'} onClick={() => begin(mode)}>
                    Play again
                  </button>
                </div>
                {save === 'error' && <p role="alert">Your visit could not be saved yet. Retry keeps the same visit.</p>}
              </>
            )}
            {!['intro', 'feedback', 'complete'].includes(stage) && message && <p role="status">{message}</p>}
            {mode === 'copy' && run.current.trials.length < 2 && !['intro', 'complete'].includes(stage) && (
              <button className="btn rhythm-alternative" onClick={() => begin('recognize')}>
                Choose pictures instead, no timing
              </button>
            )}
          </div>
        )}
        <footer>
          <button className="btn" disabled={save === 'saving'} onClick={close}>
            {save === 'saved' ? 'Back to school' : 'Close without saving'}
          </button>
        </footer>
      </section>
    </div>
  );
}
