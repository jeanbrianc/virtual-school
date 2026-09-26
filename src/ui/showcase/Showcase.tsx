/**
 * The Learning Museum: a warm, family-facing gallery of a child's learning —
 * books on the shelf, starred work, highlights and milestones. Uses
 * kid-friendly subject names and never shows mastery jargon or standards.
 * A guided "tour" mode presents it as big, auto-advancing cards (TV-friendly).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { useLiveQuery, useServices } from '../../app/services';
import { getDomain, getSkill } from '../../domain/curriculum';
import { getReward } from '../../domain/rewards/catalog';
import type { Avatar, Book, Child, Evidence, PortfolioItem } from '../../domain/types';
import { dayFromTimestamp, formatDay, monthName, toDay } from '../../domain/util/time';
import { getHousehold } from '../../services/householdService';
import { loadChildRecords, type ChildRecords } from '../../services/learningCore';
import { AvatarPortrait } from '../shared/AvatarPortrait';
import { BookCover } from '../shared/BookCover';
import { Icon } from '../shared/Icon';
import { PortfolioThumb } from '../parent/pages/PortfolioPage';

interface MuseumData {
  child: Child;
  avatar: Avatar | undefined;
  records: ChildRecords;
  schoolName: string;
}

const NATURE_EMOJI: Record<string, string> = {
  acorn: '🌰',
  acorns: '🌰',
  feather: '🪶',
  pinecone: '🌲',
  leaf: '🍂',
  leaves: '🍂',
  shell: '🐚',
  rock: '🪨',
  stone: '🪨',
  flower: '🌼',
  mushroom: '🍄',
  stick: '🪵',
  seed: '🌱',
  butterfly: '🦋',
};

function natureEmoji(item: string): string {
  const k = item.toLowerCase().replace(/s$/, '');
  return NATURE_EMOJI[item.toLowerCase()] ?? NATURE_EMOJI[k] ?? '✨';
}

/** Independent, specific evidence phrased for family (subject names are the kid-facing ones). */
function familyHighlights(evidence: Evidence[], limit: number): { text: string; subject: string; color: string; date: string }[] {
  const seen = new Set<string>();
  return [...evidence]
    .filter((e) => e.kind !== 'exposure' && e.independence === 'independent')
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .filter((e) => {
      const k = e.statement.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit)
    .map((e) => {
      const d = getDomain(getSkill(e.skillId)?.domainId ?? '');
      return { text: e.statement, subject: d?.childName ?? '', color: d?.color ?? '#c8955e', date: dayFromTimestamp(e.observedAt) };
    });
}

export function Showcase({ childId, tour }: { childId: string; tour: boolean }) {
  const { ctx } = useServices();
  const data = useLiveQuery<MuseumData | null>(async () => {
    const child = await ctx.repos.children.get(childId);
    if (!child) return null;
    const [records, avatars, household] = await Promise.all([
      loadChildRecords(ctx, childId),
      ctx.repos.forChild(ctx.repos.avatars, childId),
      getHousehold(ctx),
    ]);
    return { child, avatar: avatars[0], records, schoolName: household?.name ?? 'Our Family School' };
  }, [childId]);

  if (data === undefined) return <div className="museum-loading">Opening the museum…</div>;
  if (data === null)
    return (
      <div className="museum-loading">
        <p>We couldn’t find that museum.</p>
        <button type="button" className="btn" onClick={() => navigate({ name: 'home' })}>
          Home
        </button>
      </div>
    );
  return tour ? <MuseumTour data={data} /> : <MuseumGallery data={data} />;
}

function useMuseumContent(data: MuseumData) {
  const { records } = data;
  return useMemo(() => {
    const books = records.books.filter((b) => b.status === 'completed').sort((a, b) => (a.shelfIndex ?? 0) - (b.shelfIndex ?? 0));
    const favoriteBook = [...books].sort(
      (a, b) => (b.childRating ?? 0) - (a.childRating ?? 0) || (b.dateCompleted ?? '').localeCompare(a.dateCompleted ?? ''),
    )[0];
    // Books already live on the shelf above, so the gallery shows everything else she made.
    const starred = records.portfolio.filter((p) => p.favorite && p.kind !== 'book').sort((a, b) => b.date.localeCompare(a.date));
    const highlights = familyHighlights(records.evidence, 8);
    const nature = [...new Set(records.activities.flatMap((a) => a.natureItems ?? []))];
    const milestones = [...records.unlocks]
      .sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt))
      .map((u) => ({ reward: getReward(u.rewardId), date: dayFromTimestamp(u.unlockedAt) }))
      .filter((m): m is { reward: NonNullable<typeof m.reward>; date: string } => !!m.reward);
    const reading = records.books.filter((b) => b.status === 'reading');
    const adventures = records.activities.length + records.lessons.length;
    const subjects = [...new Set(records.evidence.map((e) => getSkill(e.skillId)?.domainId).filter((x): x is NonNullable<typeof x> => !!x))]
      .map((id) => getDomain(id)!)
      .filter(Boolean);
    const quotes = records.activities
      .flatMap((a) => (a.childReflection ? [{ text: a.childReflection, date: a.date }] : []))
      .concat(books.filter((b) => b.favoritePart).map((b) => ({ text: `My favorite part of ${b.title}: ${b.favoritePart}`, date: b.dateCompleted ?? '' })));
    return { books, favoriteBook, starred, highlights, nature, milestones, reading, adventures, subjects, quotes };
  }, [records]);
}

function MuseumGallery({ data }: { data: MuseumData }) {
  const { child, avatar, schoolName } = data;
  const c = useMuseumContent(data);
  const [openBook, setOpenBook] = useState<Book | null>(null);
  const [openItem, setOpenItem] = useState<PortfolioItem | null>(null);

  return (
    <div className="museum">
      <header className="museum-top">
        <button type="button" className="icon-btn" onClick={() => navigate({ name: 'home' })} aria-label="Home">
          <Icon name="home" />
        </button>
        <span className="museum-top-title">{schoolName}</span>
        <button
          type="button"
          className="btn btn-primary museum-tour-btn"
          onClick={() => navigate({ name: 'museum', childId: child.id, tour: true })}
          data-testid="museum-tour"
        >
          <Icon name="play" size={18} /> Guided tour
        </button>
      </header>

      <section className="museum-hero">
        <div className="museum-hero-portrait">
          <AvatarPortrait avatar={avatar} size={200} framing="full" />
        </div>
        <div className="museum-hero-text">
          <span className="museum-kicker">Welcome to</span>
          <h1>{child.name}’s Learning Museum</h1>
          <p>Everything here was earned by reading, exploring, building and wondering.</p>
          <div className="museum-stats">
            <div>
              <strong>{c.books.length}</strong>
              <span>books read</span>
            </div>
            <div>
              <strong>{c.adventures}</strong>
              <span>adventures</span>
            </div>
            <div>
              <strong>{c.milestones.length}</strong>
              <span>surprises unlocked</span>
            </div>
            <div>
              <strong>{c.subjects.length}</strong>
              <span>subjects explored</span>
            </div>
          </div>
        </div>
      </section>

      <section className="museum-section">
        <h2>
          <span aria-hidden="true">📚</span> The Bookshelf
        </h2>
        {c.books.length === 0 ? (
          <p className="museum-empty">The shelf is waiting for its first book!</p>
        ) : (
          <div className="museum-shelf" data-testid="museum-shelf">
            {c.books.map((b) => (
              <button key={b.id} type="button" className="museum-book" onClick={() => setOpenBook(b)} aria-label={`${b.title} by ${b.author}`}>
                <BookCover title={b.title} author={b.author} cover={b.cover} width={110} />
                {b.childRating ? <span className="museum-stars">{'★'.repeat(b.childRating)}</span> : null}
              </button>
            ))}
          </div>
        )}
        {c.reading.length > 0 && (
          <p className="museum-now">
            Reading now: {c.reading.map((b) => <strong key={b.id}>{b.title}</strong>).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}
          </p>
        )}
      </section>

      {c.starred.length > 0 && (
        <section className="museum-section">
          <h2>
            <span aria-hidden="true">🎨</span> Favorite work
          </h2>
          <div className="museum-gallery">
            {c.starred.map((p) => (
              <button key={p.id} type="button" className="museum-frame" onClick={() => setOpenItem(p)}>
                <PortfolioThumb item={p} childName={child.name} books={data.records.books} />
                <span className="museum-caption">
                  {p.title}
                  <small>{formatDay(p.date)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {c.highlights.length > 0 && (
        <section className="museum-section">
          <h2>
            <span aria-hidden="true">🌟</span> Things {child.name} can do
          </h2>
          <ul className="museum-highlights">
            {c.highlights.map((h, i) => (
              <li key={i} style={{ ['--hc' as string]: h.color }}>
                <span className="museum-subject">{h.subject}</span>
                {h.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.quotes.length > 0 && (
        <section className="museum-section">
          <h2>
            <span aria-hidden="true">💬</span> In {child.name}’s words
          </h2>
          <div className="museum-quotes">
            {c.quotes.slice(0, 4).map((q, i) => (
              <blockquote key={i}>“{q.text}”</blockquote>
            ))}
          </div>
        </section>
      )}

      <div className="museum-two">
        {c.nature.length > 0 && (
          <section className="museum-section">
            <h2>
              <span aria-hidden="true">🍂</span> Nature collection
            </h2>
            <ul className="museum-nature">
              {c.nature.map((n) => (
                <li key={n}>
                  <span aria-hidden="true">{natureEmoji(n)}</span> {n}
                </li>
              ))}
            </ul>
          </section>
        )}
        {c.milestones.length > 0 && (
          <section className="museum-section">
            <h2>
              <span aria-hidden="true">🏆</span> Milestones
            </h2>
            <ol className="museum-timeline">
              {c.milestones.map((m) => (
                <li key={m.reward.id}>
                  <span className="museum-ms-icon">{m.reward.icon}</span>
                  <div>
                    <strong>{m.reward.childTitle.replace(/!$/, '')}</strong>
                    <small>
                      {monthName(m.date)} {Number(m.date.slice(8))}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="museum-foot">
        Made with love at {schoolName} · {formatDay(toDay(new Date()), 'long')}
      </footer>

      {openBook && (
        <div className="museum-modal" role="dialog" aria-modal="true" aria-label={openBook.title} onClick={() => setOpenBook(null)}>
          <div className="museum-modal-card" onClick={(e) => e.stopPropagation()}>
            <BookCover title={openBook.title} author={openBook.author} cover={openBook.cover} width={170} />
            <div>
              <h3>{openBook.title}</h3>
              <p className="museum-muted">by {openBook.author}</p>
              {openBook.childRating ? <p className="museum-stars big">{'★'.repeat(openBook.childRating)}</p> : null}
              {openBook.favoritePart && <p>Favorite part: “{openBook.favoritePart}”</p>}
              {openBook.dateCompleted && <p className="museum-muted">Finished {formatDay(openBook.dateCompleted, 'long')}</p>}
              <button type="button" className="btn" onClick={() => setOpenBook(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {openItem && (
        <div className="museum-modal" role="dialog" aria-modal="true" aria-label={openItem.title} onClick={() => setOpenItem(null)}>
          <div className="museum-modal-card wide" onClick={(e) => e.stopPropagation()}>
            <div className="museum-modal-media">
              <PortfolioThumb item={openItem} childName={child.name} books={data.records.books} />
            </div>
            <div>
              <h3>{openItem.title}</h3>
              <p>{openItem.description}</p>
              <p className="museum-muted">{formatDay(openItem.date, 'long')}</p>
              <button type="button" className="btn" onClick={() => setOpenItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Guided tour ─────────────────────────────────────────────────────────────

interface Slide {
  key: string;
  render: () => ReactNode;
}

function MuseumTour({ data }: { data: MuseumData }) {
  const { child, avatar } = data;
  const c = useMuseumContent(data);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(!reduce);

  const slides: Slide[] = useMemo(() => {
    const s: Slide[] = [
      {
        key: 'intro',
        render: () => (
          <div className="tour-intro">
            <AvatarPortrait avatar={avatar} size={260} framing="full" />
            <h1>Welcome to {child.name}’s Learning Museum!</h1>
            <p>Let’s take a little tour.</p>
          </div>
        ),
      },
    ];
    if (c.books.length)
      s.push({
        key: 'books',
        render: () => (
          <div className="tour-books">
            <h1>
              {child.name} has read <em>{c.books.length}</em> {c.books.length === 1 ? 'book' : 'books'}!
            </h1>
            <div className="tour-cover-row">
              {c.books.slice(-8).map((b, k) => (
                <span key={b.id} className="tour-cover" style={{ ['--k' as string]: k }}>
                  <BookCover title={b.title} author={b.author} cover={b.cover} width={120} />
                </span>
              ))}
            </div>
          </div>
        ),
      });
    if (c.favoriteBook)
      s.push({
        key: 'fav',
        render: () => (
          <div className="tour-split">
            <BookCover title={c.favoriteBook!.title} author={c.favoriteBook!.author} cover={c.favoriteBook!.cover} width={220} />
            <div>
              <span className="museum-kicker">A favorite</span>
              <h1>{c.favoriteBook!.title}</h1>
              {c.favoriteBook!.childRating ? <p className="museum-stars big">{'★'.repeat(c.favoriteBook!.childRating)}</p> : null}
              {c.favoriteBook!.favoritePart && <p className="tour-quote">“{c.favoriteBook!.favoritePart}”</p>}
            </div>
          </div>
        ),
      });
    for (const p of c.starred.slice(0, 3))
      s.push({
        key: `art-${p.id}`,
        render: () => (
          <div className="tour-art">
            <div className="tour-art-frame">
              <PortfolioThumb item={p} childName={child.name} books={data.records.books} />
            </div>
            <h1>{p.title}</h1>
            {p.description && <p>{p.description}</p>}
          </div>
        ),
      });
    if (c.highlights.length)
      s.push({
        key: 'can',
        render: () => (
          <div className="tour-list">
            <h1>Look what {child.name} can do!</h1>
            <ul>
              {c.highlights.slice(0, 4).map((h, k) => (
                <li key={k} style={{ ['--hc' as string]: h.color, ['--k' as string]: k }}>
                  <span className="museum-subject">{h.subject}</span>
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
        ),
      });
    if (c.milestones.length)
      s.push({
        key: 'ms',
        render: () => (
          <div className="tour-list">
            <h1>Surprises unlocked</h1>
            <div className="tour-badges">
              {c.milestones.slice(-6).map((m, k) => (
                <div key={m.reward.id} className="tour-badge" style={{ ['--k' as string]: k }}>
                  <span>{m.reward.icon}</span>
                  <strong>{m.reward.childTitle.replace(/!$/, '')}</strong>
                </div>
              ))}
            </div>
          </div>
        ),
      });
    s.push({
      key: 'end',
      render: () => (
        <div className="tour-intro">
          <h1>Keep reading, keep wondering!</h1>
          <p>Thanks for visiting, from {child.name} 💛</p>
          <div className="tour-end-actions">
            <button type="button" className="btn btn-big" onClick={() => setI(0)}>
              Watch again
            </button>
            <button type="button" className="btn btn-big btn-primary" onClick={() => navigate({ name: 'museum', childId: child.id, tour: false })}>
              Explore the museum
            </button>
          </div>
        </div>
      ),
    });
    return s;
  }, [c, child, avatar, data.records.books]);

  const next = useCallback(() => setI((x) => Math.min(slides.length - 1, x + 1)), [slides.length]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    if (!playing || i >= slides.length - 1) return;
    const t = window.setTimeout(next, 6500);
    return () => window.clearTimeout(t);
  }, [playing, i, slides.length, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') navigate({ name: 'museum', childId: child.id, tour: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, child.id]);

  const slide = slides[i] ?? slides[0]!;
  return (
    <div className="tour" data-testid="museum-tour-view">
      <div className="tour-stage" key={slide.key} aria-live="polite">
        {slide.render()}
      </div>
      <div className="tour-controls">
        <button type="button" className="icon-btn big" onClick={() => navigate({ name: 'museum', childId: child.id, tour: false })} aria-label="Exit tour">
          <Icon name="close" />
        </button>
        <button type="button" className="icon-btn big" onClick={prev} disabled={i === 0} aria-label="Previous">
          <Icon name="back" />
        </button>
        <div className="tour-dots" aria-label={`Slide ${i + 1} of ${slides.length}`}>
          {slides.map((s, k) => (
            <button key={s.key} type="button" className={`tour-dot ${k === i ? 'on' : ''}`} onClick={() => setI(k)} aria-label={`Go to slide ${k + 1}`} />
          ))}
        </div>
        <button type="button" className="icon-btn big" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button type="button" className="icon-btn big" onClick={next} disabled={i === slides.length - 1} aria-label="Next">
          <Icon name="arrowRight" />
        </button>
      </div>
    </div>
  );
}
