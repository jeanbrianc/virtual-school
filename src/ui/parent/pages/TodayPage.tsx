import { useMemo, useState } from 'react';
import { navigate } from '../../../app/router';
import { recommendNext } from '../../../domain/adaptive/recommendations';
import { LESSON_TITLES } from '../../../domain/lessons/registry';
import { getReward } from '../../../domain/rewards/catalog';
import { upcomingRewards } from '../../../domain/rewards/engine';
import type { DayString } from '../../../domain/types';
import { addDays, ageAt, ageLabel, dayFromTimestamp, formatDay, relativeDay, startOfMonth, toDay } from '../../../domain/util/time';
import { snapshotFromRecords } from '../../../services/learningCore';
import { BookCover } from '../../shared/BookCover';
import { Icon } from '../../shared/Icon';
import { Card, EmptyState, LevelBadge, PageHeader, StatTile } from '../components';
import { logDraftStore, SAMPLE_NARRATIVES } from '../drafts';
import type { ParentData } from '../ParentApp';

interface FeedItem {
  day: DayString;
  at: string;
  icon: string;
  title: string;
  detail: string;
  evidence: string[];
  href?: string;
}

export function TodayPage({ data }: { data: ParentData }) {
  const { child, records } = data;
  const today = toDay(new Date());
  const [draft, setDraft] = useState('');
  const weekAgo = addDays(today, -6);

  const feed = useMemo(() => {
    const items: FeedItem[] = [];
    const evFor = (type: string, id: string) =>
      records.evidence
        .filter((e) => e.source.type === type && e.source.id === id)
        .map((e) => e.statement)
        .slice(0, 3);
    for (const b of records.books) {
      if (b.dateCompleted && b.dateCompleted >= weekAgo) {
        items.push({
          day: b.dateCompleted,
          at: `${b.dateCompleted}T15`,
          icon: '📖',
          title: `Finished ${b.title}`,
          detail: `${b.author}${b.childRating ? ` · rated ${'★'.repeat(b.childRating)}` : ''}${b.favoritePart ? ` · favorite part: ${b.favoritePart}` : ''}`,
          evidence: evFor('book', b.id),
          href: `#/parent/books/${b.id}`,
        });
      }
    }
    for (const a of records.activities) {
      if (a.date >= weekAgo) items.push({ day: a.date, at: a.createdAt, icon: '🏡', title: a.title, detail: a.narrative, evidence: evFor('activity', a.id) });
    }
    for (const l of records.lessons) {
      const d = dayFromTimestamp(l.completedAt);
      if (d >= weekAgo)
        items.push({
          day: d,
          at: l.completedAt,
          icon: l.lessonId === 'moon-rocks' ? '🚀' : '🔬',
          title: LESSON_TITLES[l.lessonId]?.childTitle ?? l.lessonId,
          detail: l.summary,
          evidence: evFor('lesson', l.id),
        });
    }
    for (const s of records.sessions) {
      if (s.date >= weekAgo && s.source === 'child' && s.notes !== 'Finished the book') {
        const b = records.books.find((x) => x.id === s.bookId);
        items.push({
          day: s.date,
          at: `${s.date}T12`,
          icon: '🔖',
          title: `Read more of ${b?.title ?? 'a book'}`,
          detail: `${s.chaptersRead ? `${s.chaptersRead} chapters` : s.pagesRead ? `${s.pagesRead} pages` : ''} logged with Professor Hoot`,
          evidence: [],
        });
      }
    }
    for (const u of records.unlocks) {
      const d = dayFromTimestamp(u.unlockedAt);
      const r = getReward(u.rewardId);
      if (d >= weekAgo && r)
        items.push({
          day: d,
          at: u.unlockedAt,
          icon: r.icon,
          title: `Unlocked: ${r.name}`,
          detail: u.celebrated ? 'Celebrated in the school.' : 'Waiting to be celebrated next time she enters her school.',
          evidence: [],
        });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [records, weekAgo]);

  const recs = useMemo(() => recommendNext(records.mastery, { limit: 4, perDomain: 1 }), [records.mastery]);
  const snapshot = useMemo(() => snapshotFromRecords(records), [records]);
  const next = upcomingRewards(snapshot, new Set(records.unlocks.map((u) => u.rewardId)), 3);
  const monthStart = startOfMonth(today);
  const booksThisMonth = records.books.filter((b) => b.dateCompleted && b.dateCompleted >= monthStart).length;
  const evidenceWeek = records.evidence.filter((e) => dayFromTimestamp(e.observedAt) >= weekAgo).length;
  const advancing = records.mastery.filter((m) => m.history.some((h) => dayFromTimestamp(h.at) >= monthStart)).length;
  const reading = records.books.filter((b) => b.status === 'reading');
  const review = records.books.filter((b) => b.needsParentReview);
  const age = child.birthDate ? ageAt(child.birthDate, today) : null;

  const interpret = (text: string) => {
    logDraftStore.set({ text, autoInterpret: true });
    navigate({ name: 'parent', section: 'log' });
  };

  return (
    <div className="page">
      <PageHeader
        title={`Today with ${child.name}`}
        subtitle={
          <>
            {formatDay(today, 'weekday')}
            {age ? ` · ${ageLabel(age)}` : ''}
          </>
        }
      />

      <Card className="composer-card">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) interpret(draft.trim());
          }}
        >
          <label htmlFor="today-composer" className="composer-label">
            What did {child.name} learn today? <span className="muted">Just describe it — we’ll organize it.</span>
          </label>
          <textarea
            id="today-composer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={`e.g. “${SAMPLE_NARRATIVES[0]?.slice(0, 110)}…”`}
            data-testid="today-composer"
          />
          <div className="composer-row">
            <div className="chip-row">
              <span className="muted small">Try an example:</span>
              {['Charlotte’s Web + bread', 'Baking muffins', 'Bean experiment'].map((label, i) => (
                <button key={label} type="button" className="chip" onClick={() => setDraft(SAMPLE_NARRATIVES[i] ?? '')}>
                  {label}
                </button>
              ))}
            </div>
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()} data-testid="today-interpret">
              <Icon name="sparkle" size={16} /> Organize this
            </button>
          </div>
        </form>
      </Card>

      <div className="stat-row">
        <StatTile
          label="Books finished this month"
          value={booksThisMonth}
          detail={`${records.books.filter((b) => b.status === 'completed').length} on her shelf`}
        />
        <StatTile label="Evidence this week" value={evidenceWeek} detail="records from lessons, books & activities" />
        <StatTile label="Skills moving this month" value={advancing} detail="level changes from evidence" />
        <StatTile
          label="Next surprise"
          value={next[0] ? `${next[0].progress.current}/${next[0].progress.target}` : '—'}
          detail={next[0]?.reward.name ?? 'All caught up!'}
        />
      </div>

      <div className="grid-2">
        <Card title="This week" icon="calendar">
          {feed.length === 0 ? (
            <EmptyState>No learning recorded this week yet. Log a moment above, or let {child.name} visit her teachers.</EmptyState>
          ) : (
            <ol className="feed" data-testid="today-feed">
              {feed.map((f, i) => (
                <li key={i} className="feed-item">
                  <span className="feed-icon">{f.icon}</span>
                  <div className="feed-body">
                    <div className="feed-title">
                      {f.href ? <a href={f.href}>{f.title}</a> : f.title}
                      <span className="feed-day">{relativeDay(f.day, today)}</span>
                    </div>
                    <div className="feed-detail">{f.detail}</div>
                    {f.evidence.length > 0 && (
                      <ul className="feed-evidence">
                        {f.evidence.map((e, j) => (
                          <li key={j}>
                            <Icon name="check" size={14} /> {e}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="stack">
          <Card title="Reading now" icon="book" action={<a href="#/parent/books">All books</a>}>
            {reading.length === 0 ? (
              <EmptyState>Nothing in progress.</EmptyState>
            ) : (
              reading.map((b) => (
                <a key={b.id} className="reading-row" href={`#/parent/books/${b.id}`}>
                  <BookCover title={b.title} author={b.author} cover={b.cover} width={44} />
                  <div className="reading-info">
                    <strong>{b.title}</strong>
                    <span className="muted">
                      {b.totalChapters
                        ? `Chapter ${b.chaptersRead ?? 0} of ${b.totalChapters}`
                        : b.totalPages
                          ? `Page ${b.pagesRead ?? 0} of ${b.totalPages}`
                          : 'In progress'}
                    </span>
                    {b.totalChapters ? (
                      <div className="meter" aria-hidden="true">
                        <span style={{ width: `${Math.round(((b.chaptersRead ?? 0) / b.totalChapters) * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                </a>
              ))
            )}
            {review.length > 0 && (
              <div className="notice">
                <Icon name="info" size={16} /> {child.name} added {review.length} book{review.length > 1 ? 's' : ''} herself —{' '}
                <a href="#/parent/books">tidy up the details</a>.
              </div>
            )}
          </Card>

          <Card title="Suggested next" icon="sparkle" action={<a href="#/parent/curriculum">Curriculum</a>}>
            <ul className="rec-list">
              {recs.map((r) => (
                <li key={r.skillId}>
                  <div className="rec-head">
                    <strong>{r.skill.name}</strong>
                    <span className={`rec-reason reason-${r.reason}`}>
                      {r.reason === 'continue' ? 'Keep practicing' : r.reason === 'ready' ? 'Ready to learn' : r.reason === 'review' ? 'Review' : 'Consolidate'}
                    </span>
                  </div>
                  <p className="muted small">{r.rationale}</p>
                  <p className="rec-idea">💡 {r.activityIdea}</p>
                  {r.lessonId && LESSON_TITLES[r.lessonId] && <p className="small">🎮 In the school: {LESSON_TITLES[r.lessonId]!.childTitle}</p>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Close to unlocking" icon="star">
            <ul className="unlock-list">
              {next.map((n) => (
                <li key={n.reward.id}>
                  <span className="unlock-icon">{n.reward.icon}</span>
                  <div>
                    <strong>{n.reward.name}</strong>
                    <div className="muted small">{n.reward.hint}</div>
                    <div className="meter" aria-label={`${n.progress.current} of ${n.progress.target}`}>
                      <span style={{ width: `${Math.round(n.progress.fraction * 100)}%` }} />
                    </div>
                  </div>
                  <span className="muted small">
                    {n.progress.current}/{n.progress.target}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      {records.mastery.some((m) => m.needsReview) && (
        <Card title="Needs a gentle review" icon="info">
          {records.mastery
            .filter((m) => m.needsReview)
            .map((m) => (
              <div key={m.id}>
                {m.skillId} <LevelBadge level={m.computedLevel} />
              </div>
            ))}
        </Card>
      )}
    </div>
  );
}
