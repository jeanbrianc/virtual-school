import { useEffect, useRef, useState } from 'react';
import { ALPHABET, acceptedLetter, answerTrail, skipTrail, trailLetters, type KeyboardTrail } from '../../../domain/lessons/keyboardTrail';
import { type Speech } from '../DialogueShell';

export function KeyboardFlow({
  speech,
  completed,
  onSave,
  onClose,
  onScene,
  onSceneEnd,
}: {
  speech: Speech;
  completed: number;
  onSave: (run: KeyboardTrail) => Promise<void>;
  onClose: () => void;
  onScene: (letter: string | null, found: string[]) => void;
  onSceneEnd: () => void;
}) {
  const makeRun = (seed: number): KeyboardTrail => ({
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    letters: trailLetters(completed, seed),
    trials: [],
    hinted: false,
    cancelled: false,
  });
  const seed = useRef(completed + 31);
  const run = useRef(makeRun(seed.current));
  const panel = useRef<HTMLDivElement>(null);
  const [, render] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [message, setMessage] = useState('');
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveBusy = useRef(false);
  const target = run.current.letters[run.current.trials.length];
  const line = target ? `Find ${target}` : 'You made a letter rainbow!';
  useEffect(() => {
    onScene(
      target ?? null,
      run.current.trials.filter((t) => t.modality !== 'skipped').map((t) => t.letter),
    );
    if (speech.auto) speech.speak(line);
  }, [target]);
  const refresh = () => render((n) => n + 1);
  const close = () => {
    if (saveBusy.current) return;
    run.current.cancelled = true;
    onClose();
  };
  useEffect(() => {
    const resize = () =>
      onScene(
        run.current.letters[run.current.trials.length] ?? null,
        run.current.trials.filter((t) => t.modality !== 'skipped').map((t) => t.letter),
      );
    window.addEventListener('resize', resize);
    panel.current?.focus();
    const blur = () => {
      pausedRef.current = true;
      setPaused(true);
    };
    const key = (e: KeyboardEvent) => {
      if (!panel.current?.contains(document.activeElement) || pausedRef.current || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;
      if (e.key === 'Escape' && !e.isComposing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        close();
        return;
      }
      const letter = acceptedLetter(e);
      if (!letter || !run.current.letters[run.current.trials.length]) return;
      e.preventDefault();
      e.stopPropagation();
      setMessage(
        answerTrail(run.current, letter, 'physical')
          ? `${letter}! You found it! ✨`
          : `Find ${run.current.letters[run.current.trials.length]}. Take your time.`,
      );
      refresh();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', key);
    return () => {
      onSceneEnd();
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', key);
    };
  }, []);
  const finish = async () => {
    if (saveBusy.current || save === 'saved') return;
    saveBusy.current = true;
    setSave('saving');
    try {
      await onSave(run.current);
      setSave('saved');
    } catch {
      setSave('error');
    } finally {
      saveBusy.current = false;
    }
  };
  return (
    <div
      ref={panel}
      tabIndex={-1}
      className="keyboard-trail"
      data-testid="keyboard-trail"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          pausedRef.current = true;
          setPaused(true);
        }
      }}
    >
      <section className="letter-coach" role="dialog" aria-label="Letter rainbow">
        <div className="letter-coach-main">
          <div className="letter-goal" aria-hidden="true">
            {target ?? '🌈'}
          </div>
          <div>
            <p className="letter-instruction" aria-live="polite" aria-atomic="true" data-testid="dialogue-line">
              {paused && target ? 'Ready when you are' : line}
              <span className="sr-only">{paused && target ? 'Paused. Come back when you are ready.' : line}</span>
            </p>
            <div className="letter-stars" aria-label={`${run.current.trials.length} of 5 letters`}>
              {run.current.letters.map((l, i) => (
                <span key={l} className={i < run.current.trials.length ? 'letter-earned' : ''} aria-hidden="true">
                  {i < run.current.trials.length ? '★' : '☆'}
                </span>
              ))}
            </div>
            <p className="letter-response" role="status">
              {message || 'Press a key — or tap a letter.'}
            </p>
          </div>
        </div>
        {target && !paused && (
          <div className="letter-touch" aria-label="Touch letters">
            {[target, [...ALPHABET].find((l) => l !== target)!]
              .sort((a, b) => (run.current.trials.length % 2 ? a.localeCompare(b) : b.localeCompare(a)))
              .map((letter) => (
                <button
                  type="button"
                  key={letter}
                  aria-label={`Touch letter ${letter}`}
                  className={run.current.hinted && target === letter ? 'key-target' : ''}
                  onClick={() => {
                    setMessage(answerTrail(run.current, letter, 'touch') ? `${letter}! You found it by touch! ✨` : `Find ${target}. Take your time.`);
                    panel.current?.focus();
                    refresh();
                  }}
                >
                  {letter}
                </button>
              ))}
          </div>
        )}
        {paused && target ? (
          <button
            type="button"
            className="letter-tool"
            onClick={() => {
              pausedRef.current = false;
              setPaused(false);
              panel.current?.focus();
            }}
          >
            Resume trail
          </button>
        ) : target ? (
          <div className="letter-tools">
            <button type="button" className="letter-tool" aria-label="Hear letter" onClick={() => speech.speak(line)}>
              🔊 Hear
            </button>
            <button
              type="button"
              className="letter-tool"
              aria-label="Help me"
              onClick={() => {
                run.current.hinted = true;
                refresh();
              }}
            >
              ✨ Help
            </button>
            <button
              type="button"
              className="letter-tool"
              aria-label="Skip letter"
              onClick={() => {
                skipTrail(run.current);
                refresh();
              }}
            >
              Skip
            </button>
          </div>
        ) : (
          <div className="letter-tools">
            <button type="button" className="letter-tool letter-exit" disabled={save === 'saving' || save === 'saved'} onClick={() => void finish()}>
              {save === 'saved' ? 'Saved' : save === 'error' ? 'Retry save' : 'Save trail'}
            </button>
            <button
              type="button"
              className="letter-tool"
              disabled={save === 'saving'}
              onClick={() => {
                seed.current += 1;
                run.current = makeRun(seed.current);
                setSave('idle');
                setMessage('');
                pausedRef.current = false;
                setPaused(false);
                panel.current?.focus();
                refresh();
              }}
            >
              Replay trail
            </button>
          </div>
        )}
        <button type="button" className="letter-tool letter-exit" disabled={save === 'saving'} onClick={close}>
          Back to school
        </button>
      </section>
    </div>
  );
}
