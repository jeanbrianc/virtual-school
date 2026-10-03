import { useEffect, useRef, useState } from 'react';
import { ALPHABET, acceptedLetter, answerTrail, skipTrail, trailLetters, type KeyboardTrail } from '../../../domain/lessons/keyboardTrail';
import { DialogueShell, type Speech } from '../DialogueShell';

export function KeyboardFlow({
  speech,
  completed,
  onSave,
  onClose,
}: {
  speech: Speech;
  completed: number;
  onSave: (run: KeyboardTrail) => Promise<void>;
  onClose: () => void;
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
  const line = target ? `Find the letter ${target}. Press ${target} on your keyboard.` : 'You explored five letters!';
  const refresh = () => render((n) => n + 1);
  const close = () => {
    if (saveBusy.current) return;
    run.current.cancelled = true;
    onClose();
  };
  useEffect(() => {
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
      setMessage(answerTrail(run.current, letter, 'physical') ? 'You found it!' : 'Look for the letter in the prompt. Take your time.');
      refresh();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', key);
    return () => {
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
      <DialogueShell
        teacher="hoot"
        line={paused && target ? 'Paused. Come back when you are ready.' : line}
        speech={speech}
        onClose={close}
        closeDisabled={save === 'saving'}
        wide
      >
        <p>Latin A–Z keys, using your keyboard layout. Shift and Caps Lock work. Or tap a letter below.</p>
        <div className="keyboard-letters" aria-label="Alphabet">
          {[...ALPHABET].map((letter) => (
            <button
              type="button"
              key={letter}
              aria-label={`Touch letter ${letter}`}
              className={run.current.hinted && target === letter ? 'key-target' : ''}
              disabled={!target || paused}
              onClick={() => {
                setMessage(answerTrail(run.current, letter, 'touch') ? 'You found it by touch!' : 'Look for the letter in the prompt.');
                refresh();
              }}
            >
              {letter}
            </button>
          ))}
        </div>
        <p role="status">{message}</p>
        {paused && target ? (
          <button
            type="button"
            className="choice"
            onClick={() => {
              pausedRef.current = false;
              setPaused(false);
              panel.current?.focus();
            }}
          >
            Resume trail
          </button>
        ) : target ? (
          <div className="choices">
            <button type="button" className="choice" onClick={() => speech.speak(line)}>
              Repeat prompt
            </button>
            <button
              type="button"
              className="choice"
              onClick={() => {
                run.current.hinted = true;
                refresh();
              }}
            >
              Show a hint
            </button>
            <button
              type="button"
              className="choice"
              onClick={() => {
                skipTrail(run.current);
                refresh();
              }}
            >
              Skip letter
            </button>
          </div>
        ) : (
          <div className="choices">
            <button type="button" className="choice" disabled={save === 'saving' || save === 'saved'} onClick={() => void finish()}>
              {save === 'saved' ? 'Saved' : save === 'error' ? 'Retry save' : 'Save trail'}
            </button>
            <button
              type="button"
              className="choice"
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
        <button type="button" className="choice" disabled={save === 'saving'} onClick={close}>
          Back to school
        </button>
      </DialogueShell>
    </div>
  );
}
