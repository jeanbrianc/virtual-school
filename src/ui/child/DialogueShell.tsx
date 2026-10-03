import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TEACHERS, type TeacherId } from '../../domain/teachers/teachers';
import { Icon } from '../shared/Icon';
import { TeacherPortrait } from './TeacherPortrait';

export interface Speech {
  speak(text: string): void;
  canSpeak: boolean;
  /** Read each new line aloud automatically (parent setting). */
  auto: boolean;
}

/**
 * Bottom-sheet conversation panel: portrait, name, typewriter speech and a
 * content slot for big, few-at-a-time choices.
 */
export function DialogueShell({
  teacher,
  line,
  mood = 'happy',
  children,
  onClose,
  speech,
  wide = false,
  closeDisabled = false,
}: {
  teacher: TeacherId;
  line: string;
  mood?: 'happy' | 'thinking' | 'cheer';
  children?: ReactNode;
  onClose: () => void;
  speech: Speech;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  const t = TEACHERS[teacher];
  const [shown, setShown] = useState('');
  const lastLine = useRef('');

  useEffect(() => {
    if (line === lastLine.current) return;
    lastLine.current = line;
    if (speech.auto) speech.speak(line);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(line);
      return;
    }
    let i = 0;
    setShown('');
    const timer = window.setInterval(() => {
      i += 2;
      setShown(line.slice(0, i));
      if (i >= line.length) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  return (
    <div className={`dialogue ${wide ? 'dialogue-wide' : ''}`} role="dialog" aria-label={`Talking with ${t.name}`} data-teacher={teacher}>
      <div className="dialogue-portrait" style={{ ['--teacher-color' as string]: t.accent }}>
        <TeacherPortrait id={teacher} mood={mood} size={112} />
      </div>
      <div className="dialogue-body">
        <div className="dialogue-head">
          <span className="dialogue-name" style={{ background: t.color }}>
            {t.name}
          </span>
          <div className="dialogue-tools">
            {speech.canSpeak && (
              <button type="button" className="icon-btn" onClick={() => speech.speak(line)} aria-label="Read it to me">
                <Icon name="speaker" size={22} />
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} disabled={closeDisabled} aria-label="Close" data-testid="dialogue-close">
              <Icon name="close" size={22} />
            </button>
          </div>
        </div>
        <p className="dialogue-line" aria-live="polite" data-testid="dialogue-line">
          {shown}
          <span className="sr-only">{line}</span>
        </p>
        {children && <div className="dialogue-content">{children}</div>}
      </div>
    </div>
  );
}

export interface ChoiceItem {
  id: string;
  label: string;
  icon?: string;
  hint?: string;
  tone?: 'primary' | 'plain';
}

export function Choices({
  items,
  onPick,
  state,
  columns,
}: {
  items: ChoiceItem[];
  onPick: (id: string) => void;
  state?: Record<string, 'right' | 'soft' | 'disabled'>;
  columns?: number;
}) {
  return (
    <div className="choices" style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`choice ${c.tone === 'primary' ? 'choice-primary' : ''} ${state?.[c.id] ? `choice-${state[c.id]}` : ''}`}
          onClick={() => onPick(c.id)}
          disabled={state?.[c.id] === 'disabled'}
          data-testid={`choice-${c.id}`}
        >
          {c.icon && <span className="choice-icon">{c.icon}</span>}
          <span className="choice-label">{c.label}</span>
          {c.hint && <span className="choice-hint">{c.hint}</span>}
          {state?.[c.id] === 'right' && (
            <span className="choice-check">
              <Icon name="check" size={22} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
