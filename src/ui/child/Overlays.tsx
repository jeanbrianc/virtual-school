/** Child-mode overlays: celebration, bookshelf, treasures, hints, parent gate. */
import { useEffect, useMemo, useState } from 'react';
import { getReward, type RewardDefinition } from '../../domain/rewards/catalog';
import { upcomingRewards } from '../../domain/rewards/engine';
import type { Discovery } from '../../domain/discovery';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import type { ProgressSnapshot } from '../../domain/progress/snapshot';
import type { Book, RewardUnlock } from '../../domain/types';
import { formatDay } from '../../domain/util/time';
import { BookCover } from '../shared/BookCover';
import { Icon } from '../shared/Icon';

// ─── Celebration ────────────────────────────────────────────────────────────

export interface CelebrationItem {
  key: string;
  icon: string;
  title: string;
  message: string;
  grand?: boolean;
  cover?: { title: string; author: string; cover: Book['cover'] };
}

export function rewardToCelebration(r: RewardDefinition): CelebrationItem {
  return { key: r.id, icon: r.icon, title: r.childTitle, message: r.childMessage, grand: r.celebration === 'grand' };
}

export function Celebration({ items, onDone }: { items: CelebrationItem[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  const confetti = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 97) % 100,
        delay: (i % 12) * 0.12,
        color: ['#e07a5f', '#f2cc8f', '#81b29a', '#3d85c6', '#f15bb5', '#ffd166'][i % 6],
        rot: (i * 47) % 360,
      })),
    [],
  );
  if (!item) return null;
  const next = () => (index < items.length - 1 ? setIndex(index + 1) : onDone());
  return (
    <div className="celebrate-backdrop" role="dialog" aria-label="Celebration" data-testid="celebration">
      <div className="confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: c.color, transform: `rotate(${c.rot}deg)` }} />
        ))}
      </div>
      <div className={`celebrate-card ${item.grand ? 'grand' : ''}`} key={item.key}>
        {item.cover ? (
          <div className="celebrate-cover">
            <BookCover {...item.cover} width={120} />
          </div>
        ) : (
          <div className="celebrate-icon">{item.icon}</div>
        )}
        <h2 className="celebrate-title">{item.title}</h2>
        <p className="celebrate-message">{item.message}</p>
        <button type="button" className="btn btn-primary btn-big" onClick={next} autoFocus data-testid="celebrate-next">
          {index < items.length - 1 ? 'What else?' : 'Hooray!'} <Icon name="sparkle" />
        </button>
        {items.length > 1 && (
          <div className="celebrate-dots">
            {items.map((it, i) => (
              <span key={it.key} className={i === index ? 'on' : ''} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bookshelf viewer ───────────────────────────────────────────────────────

export function BookshelfViewer({ books, onClose }: { books: Book[]; onClose: () => void }) {
  const done = books.filter((b) => b.status === 'completed').sort((a, b) => (a.shelfIndex ?? 0) - (b.shelfIndex ?? 0));
  const reading = books.filter((b) => b.status === 'reading');
  const [selected, setSelected] = useState<Book | null>(null);
  return (
    <div className="sheet-backdrop" role="dialog" aria-label="My bookshelf">
      <div className="sheet sheet-shelf">
        <header className="sheet-head">
          <h2>
            📚 My Bookshelf <span className="count-badge">{done.length}</span>
          </h2>
          <button type="button" className="icon-btn big" onClick={onClose} aria-label="Close">
            <Icon name="close" size={28} />
          </button>
        </header>
        {selected ? (
          <div className="book-detail">
            <BookCover title={selected.title} author={selected.author} cover={selected.cover} width={150} />
            <div>
              <h3>{selected.title}</h3>
              <p className="muted">by {selected.author}</p>
              {selected.childRating ? <p className="stars-inline">{'★'.repeat(selected.childRating)}</p> : null}
              {selected.favoritePart && <p>Favorite part: {selected.favoritePart}</p>}
              {selected.dateCompleted && <p className="muted">Finished {formatDay(selected.dateCompleted, 'long')}</p>}
              <button type="button" className="btn" onClick={() => setSelected(null)}>
                <Icon name="back" /> All my books
              </button>
            </div>
          </div>
        ) : (
          <>
            {reading.length > 0 && (
              <>
                <h3 className="shelf-sub">Reading now</h3>
                <div className="cover-row">
                  {reading.map((b) => (
                    <div key={b.id} className="cover-tile reading">
                      <BookCover title={b.title} author={b.author} cover={b.cover} width={92} />
                      {b.totalChapters ? (
                        <div className="progress-mini">
                          <span style={{ width: `${Math.round(((b.chaptersRead ?? 0) / b.totalChapters) * 100)}%` }} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
            <h3 className="shelf-sub">Books I finished</h3>
            {done.length === 0 && <p className="shelf-empty">No books yet! Finish a book, tell Professor Hoot about it, and it will fly right here. 🦉</p>}
            <div className="cover-grid">
              {done.map((b) => (
                <button key={b.id} type="button" className="cover-tile" onClick={() => setSelected(b)}>
                  <BookCover title={b.title} author={b.author} cover={b.cover} width={92} />
                  {b.childRating ? <span className="tile-stars">{'★'.repeat(b.childRating)}</span> : null}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Treasures ──────────────────────────────────────────────────────────────

const PET_NAMES: Record<string, string> = {
  'pet.bookworm': 'Pip',
  'pet.hedgehog': 'Bramble',
  'pet.dragon': 'Ember',
};

export function Treasures({
  unlocks,
  snapshot,
  activePet,
  onPickPet,
  onClose,
}: {
  unlocks: RewardUnlock[];
  snapshot: ProgressSnapshot;
  activePet: string | undefined;
  onPickPet: (id: string) => void;
  onClose: () => void;
}) {
  const unlockedIds = new Set(unlocks.map((u) => u.rewardId));
  const rewards = unlocks.map((u) => getReward(u.rewardId)).filter((r): r is RewardDefinition => !!r);
  const pets = rewards.filter((r) => r.kind === 'pet');
  const others = rewards.filter((r) => r.kind !== 'pet');
  const next = upcomingRewards(snapshot, unlockedIds, 3);
  return (
    <div className="sheet-backdrop" role="dialog" aria-label="My treasures">
      <div className="sheet">
        <header className="sheet-head">
          <h2>🎒 My Treasures</h2>
          <button type="button" className="icon-btn big" onClick={onClose} aria-label="Close">
            <Icon name="close" size={28} />
          </button>
        </header>
        {pets.length > 0 && (
          <section>
            <h3 className="shelf-sub">My pets</h3>
            <div className="treasure-grid">
              {pets.map((p) => (
                <button key={p.id} type="button" className={`treasure pet ${activePet === p.id ? 'on' : ''}`} onClick={() => onPickPet(p.id)}>
                  <span className="treasure-icon">{p.icon}</span>
                  <span className="treasure-name">{PET_NAMES[p.id] ?? p.childTitle}</span>
                  <span className="treasure-note">{activePet === p.id ? 'Walking with me!' : 'Tap to walk together'}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <section>
          <h3 className="shelf-sub">Things I unlocked</h3>
          <div className="treasure-grid">
            {others.map((r) => (
              <div key={r.id} className="treasure">
                <span className="treasure-icon">{r.icon}</span>
                <span className="treasure-name">{r.childTitle.replace(/!$/, '')}</span>
              </div>
            ))}
          </div>
        </section>
        {next.length > 0 && (
          <section>
            <h3 className="shelf-sub">Surprises coming soon…</h3>
            <div className="next-list">
              {next.map((n) => (
                <div key={n.reward.id} className="next-item">
                  <span className="treasure-icon small">🎁</span>
                  <div>
                    <div className="next-hint">{n.reward.hint}</div>
                    <div className="dots" aria-label={`${n.progress.current} of ${n.progress.target}`}>
                      {Array.from({ length: Math.min(n.progress.target, 12) }, (_, i) => (
                        <span key={i} className={i < Math.round((n.progress.current / n.progress.target) * Math.min(n.progress.target, 12)) ? 'on' : ''} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Friendly hint bubble (locked doors, exhibits) ─────────────────────────

export function HintCard({
  icon,
  title,
  text,
  progress,
  onClose,
}: {
  icon: string;
  title: string;
  text: string;
  progress?: { current: number; target: number };
  onClose: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 9000);
    return () => window.clearTimeout(t);
  }, [onClose]);
  return (
    <div className="hint-card" role="status" data-testid="hint-card">
      <span className="hint-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
        {progress && (
          <div className="dots big" aria-label={`${progress.current} of ${progress.target}`}>
            {Array.from({ length: Math.min(progress.target, 12) }, (_, i) => (
              <span key={i} className={i < Math.round((progress.current / progress.target) * Math.min(progress.target, 12)) ? 'on' : ''} />
            ))}
          </div>
        )}
      </div>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
        <Icon name="close" />
      </button>
    </div>
  );
}

// ─── Discovery card ─────────────────────────────────────────────────────────

/** "What's this?" — the one-time explanation shown when a child first touches something. */
export function DiscoveryCard({
  discovery,
  found,
  total,
  speak,
  autoSpeak,
  onClose,
  onAction,
}: {
  discovery: Discovery;
  found: number;
  total: number;
  speak?: (text: string) => void;
  autoSpeak: boolean;
  onClose: () => void;
  onAction?: (target: string) => void;
}) {
  useEffect(() => {
    if (autoSpeak && speak) speak(`${discovery.title}. ${discovery.text}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery.id]);
  const p = discovery.progress;
  return (
    <div className="discover-backdrop" role="presentation" onClick={onClose}>
      <div
        className="discover-card"
        role="dialog"
        aria-modal="true"
        aria-label={discovery.title}
        data-testid="discover-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="discover-stamp" aria-hidden="true">
          <span>{discovery.icon}</span>
        </div>
        {discovery.id !== '__welcome' && <div className="discover-kicker">✨ You discovered…</div>}
        <h2 className="discover-title">{discovery.title}</h2>
        <p className="discover-text">{discovery.text}</p>
        {p && (
          <div className="discover-progress" aria-label={`${p.current} of ${p.target}`}>
            {Array.from({ length: Math.min(p.target, 10) }, (_, i) => (
              <span key={i} className={i < Math.round((p.current / p.target) * Math.min(p.target, 10)) ? 'on' : ''} />
            ))}
          </div>
        )}
        <div className="discover-actions">
          {speak && (
            <button type="button" className="icon-btn big" onClick={() => speak(`${discovery.title}. ${discovery.text}`)} aria-label="Read it to me">
              <Icon name="speaker" size={26} />
            </button>
          )}
          {discovery.action && onAction && (
            <button type="button" className="btn btn-big" onClick={() => onAction(discovery.action!.target)} data-testid="discover-action">
              <span aria-hidden="true">{discovery.action.icon}</span> {discovery.action.label}
            </button>
          )}
          <button type="button" className="btn btn-big btn-primary" onClick={onClose} data-testid="discover-ok">
            Got it!
          </button>
        </div>
        {total > 0 && (
          <div className="discover-count">
            🧭 {found} of {total} discovered
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Parent gate ────────────────────────────────────────────────────────────

export function ParentGate({ pin, showHint, onPass, onClose }: { pin: string; showHint: boolean; onPass: () => void; onClose: () => void }) {
  const [entry, setEntry] = useState('');
  const [shake, setShake] = useState(false);
  const press = (d: string) => {
    const next = (entry + d).slice(0, 8);
    setEntry(next);
    if (next.length >= pin.length) {
      if (next === pin) onPass();
      else {
        setShake(true);
        window.setTimeout(() => {
          setShake(false);
          setEntry('');
        }, 500);
      }
    }
  };
  return (
    <div className="sheet-backdrop" role="dialog" aria-label="Grown-ups only">
      <div className={`gate ${shake ? 'shake' : ''}`}>
        <header className="sheet-head">
          <h2>
            <Icon name="lock" size={24} /> Grown-ups only
          </h2>
          <button type="button" className="icon-btn big" onClick={onClose} aria-label="Close">
            <Icon name="close" size={28} />
          </button>
        </header>
        <p className="muted">Enter the family PIN to open the Parent Studio.</p>
        <div className="pin-dots" aria-live="polite">
          {Array.from({ length: pin.length }, (_, i) => (
            <span key={i} className={i < entry.length ? 'on' : ''} />
          ))}
        </div>
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
            k === '' ? (
              <span key={i} />
            ) : (
              <button key={i} type="button" className="key" onClick={() => (k === '⌫' ? setEntry(entry.slice(0, -1)) : press(k))} data-testid={`pin-${k}`}>
                {k}
              </button>
            ),
          )}
        </div>
        {showHint && pin === DEFAULT_SETTINGS.parentPin && <p className="demo-hint">Grown-ups: the starting PIN is {pin}. Change it in Settings.</p>}
      </div>
    </div>
  );
}
