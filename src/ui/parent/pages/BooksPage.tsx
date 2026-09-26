import { useMemo, useState } from 'react';
import { navigate } from '../../../app/router';
import { useServices } from '../../../app/services';
import { getCatalogBook } from '../../../domain/reading/bookCatalog';
import { searchCatalogSync } from '../../../domain/reading/bookMetadata';
import type { Book, BookStatus, ReadingMode } from '../../../domain/types';
import { formatDay } from '../../../domain/util/time';
import { addMedia } from '../../../services/householdService';
import { addBook, completeBook, logReading, updateBook } from '../../../services/readingService';
import { BookCover } from '../../shared/BookCover';
import { Icon } from '../../shared/Icon';
import { Card, EmptyState, EvidenceItem, MediaImage, PageHeader, prepareImage } from '../components';
import type { ParentData } from '../ParentApp';

const STATUS_LABEL: Record<BookStatus, string> = { reading: 'Reading', up_next: 'Up next', completed: 'Finished', paused: 'Paused' };
const MODE_LABEL: Record<ReadingMode, string> = {
  independent: 'Read independently',
  shared: 'Shared reading',
  read_aloud: 'Read aloud to her',
  mixed: 'Mixed',
};

export function BooksPage({ data, param }: { data: ParentData; param?: string }) {
  const book = param ? data.records.books.find((b) => b.id === param) : undefined;
  if (book) return <BookDetail data={data} book={book} />;
  return <BookList data={data} />;
}

function BookList({ data }: { data: ParentData }) {
  const { ctx } = useServices();
  const [tab, setTab] = useState<'reading' | 'up_next' | 'completed' | 'all'>('reading');
  const [adding, setAdding] = useState(false);
  const books = data.records.books;
  const counts = {
    reading: books.filter((b) => b.status === 'reading').length,
    up_next: books.filter((b) => b.status === 'up_next').length,
    completed: books.filter((b) => b.status === 'completed').length,
    all: books.length,
  };
  const list = books
    .filter((b) => tab === 'all' || b.status === tab)
    .sort((a, b) => (b.dateCompleted ?? b.dateStarted ?? b.dateAdded).localeCompare(a.dateCompleted ?? a.dateStarted ?? a.dateAdded));

  return (
    <div className="page">
      <PageHeader
        title="Books"
        subtitle={`${counts.completed} finished · every finished book appears on ${data.child.name}’s 3D bookshelf`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(!adding)} data-testid="add-book-toggle">
            <Icon name="plus" size={16} /> Add a book
          </button>
        }
      />
      {adding && <AddBookForm childId={data.child.id} onDone={() => setAdding(false)} ctxReady={!!ctx} />}
      <div className="tabs" role="tablist">
        {(['reading', 'up_next', 'completed', 'all'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'all' ? 'All' : STATUS_LABEL[t]} <span className="tab-count">{counts[t]}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState>No books here yet.</EmptyState>
      ) : (
        <div className="book-grid">
          {list.map((b) => (
            <a key={b.id} className="book-card" href={`#/parent/books/${b.id}`}>
              <BookCover title={b.title} author={b.author} cover={b.cover} width={72} />
              <div className="book-card-body">
                <strong>{b.title}</strong>
                <span className="muted small">{b.author}</span>
                <span className={`status status-${b.status}`}>{STATUS_LABEL[b.status]}</span>
                {b.status === 'reading' && b.totalChapters ? (
                  <div className="meter" aria-label={`Chapter ${b.chaptersRead ?? 0} of ${b.totalChapters}`}>
                    <span style={{ width: `${Math.round(((b.chaptersRead ?? 0) / b.totalChapters) * 100)}%` }} />
                  </div>
                ) : null}
                {b.childRating ? <span className="stars-small">{'★'.repeat(b.childRating)}</span> : null}
                {b.dateCompleted && <span className="muted small">Finished {formatDay(b.dateCompleted)}</span>}
                {b.needsParentReview && <span className="notice-inline">Added by {data.child.name} — check details</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function AddBookForm({ childId, onDone }: { childId: string; onDone: () => void; ctxReady: boolean }) {
  const { ctx } = useServices();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [catalogId, setCatalogId] = useState<string | undefined>();
  const [status, setStatus] = useState<BookStatus>('up_next');
  const [chapters, setChapters] = useState('');
  const [pages, setPages] = useState('');
  const [mode, setMode] = useState<ReadingMode>('independent');
  const suggestions = useMemo(() => (title.length >= 3 && !catalogId ? searchCatalogSync(title, 4) : []), [title, catalogId]);
  return (
    <Card title="Add a book">
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await addBook(ctx, childId, {
            title,
            ...(author ? { author } : {}),
            ...(catalogId ? { catalogId } : {}),
            status,
            readingMode: mode,
            ...(Number(chapters) ? { totalChapters: Number(chapters) } : {}),
            ...(Number(pages) ? { totalPages: Number(pages) } : {}),
          });
          onDone();
        }}
      >
        <label className="span-2">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setCatalogId(undefined);
            }}
            required
            data-testid="add-book-title"
          />
          {suggestions.length > 0 && (
            <div className="suggest-list">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="suggest-item"
                  onClick={() => {
                    setTitle(s.title);
                    setAuthor(s.author);
                    setCatalogId(s.id);
                    setChapters(s.totalChapters ? String(s.totalChapters) : '');
                    setPages(s.totalPages ? String(s.totalPages) : '');
                  }}
                >
                  <BookCover title={s.title} author={s.author} cover={s.cover} width={28} /> {s.title}{' '}
                  <span className="muted small">— {s.author} · has story questions</span>
                </button>
              ))}
            </div>
          )}
        </label>
        <label>
          Author
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
            <option value="up_next">Up next</option>
            <option value="reading">Reading now</option>
          </select>
        </label>
        <label>
          Chapters
          <input type="number" min={0} value={chapters} onChange={(e) => setChapters(e.target.value)} />
        </label>
        <label>
          Pages
          <input type="number" min={0} value={pages} onChange={(e) => setPages(e.target.value)} />
        </label>
        <label>
          Reading mode
          <select value={mode} onChange={(e) => setMode(e.target.value as ReadingMode)}>
            {Object.entries(MODE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions span-2">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" data-testid="add-book-save">
            Add to {status === 'reading' ? 'reading now' : 'up next'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function BookDetail({ data, book }: { data: ParentData; book: Book }) {
  const { ctx } = useServices();
  const [draft, setDraft] = useState<Book>(book);
  const [saved, setSaved] = useState(false);
  const [logCh, setLogCh] = useState('1');
  const [logMin, setLogMin] = useState('');
  const [busy, setBusy] = useState(false);
  const sessions = data.records.sessions.filter((s) => s.bookId === book.id).sort((a, b) => b.date.localeCompare(a.date));
  const evidence = data.records.evidence.filter((e) => e.source.type === 'book' && e.source.id === book.id);
  const cat = getCatalogBook(book.catalogId);
  const set = (patch: Partial<Book>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };

  return (
    <div className="page">
      <a className="back-link" href="#/parent/books">
        <Icon name="back" size={16} /> All books
      </a>
      <div className="book-hero">
        {book.coverMediaId ? (
          <MediaImage id={book.coverMediaId} alt={book.title} className="cover-photo" />
        ) : (
          <BookCover title={book.title} author={book.author} cover={book.cover} width={130} />
        )}
        <div>
          <h1 className="serif">{book.title}</h1>
          <p className="muted">
            {book.author} · {STATUS_LABEL[book.status]}
            {book.shelfIndex !== undefined ? ` · shelf spot #${book.shelfIndex + 1}` : ''}
          </p>
          {cat && (
            <p className="small muted">
              In the story-question library: {cat.questions.length} questions for Professor Hoot · {cat.band}
            </p>
          )}
          <div className="row-actions">
            {book.status !== 'completed' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await completeBook(ctx, data.child.id, {
                    bookId: book.id,
                    answers: [],
                    ...(draft.childRating ? { rating: draft.childRating } : {}),
                    ...(draft.favoritePart ? { favoritePart: draft.favoritePart } : {}),
                    startedAt: new Date().toISOString(),
                    transcript: [{ speaker: 'system', text: 'Marked finished by a parent', at: new Date().toISOString() }],
                    source: 'parent',
                  });
                  setBusy(false);
                }}
              >
                <Icon name="check" size={16} /> Mark finished (adds to her shelf)
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Details" icon="pencil">
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const { needsParentReview: _n, ...rest } = draft;
              await updateBook(ctx, rest);
              setSaved(true);
            }}
          >
            <label className="span-2">
              Title
              <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="span-2">
              Author
              <input value={draft.author} onChange={(e) => set({ author: e.target.value })} />
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(e) => set({ status: e.target.value as BookStatus })} disabled={book.status === 'completed'}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k} disabled={k === 'completed' && book.status !== 'completed'}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reading mode
              <select value={draft.readingMode} onChange={(e) => set({ readingMode: e.target.value as ReadingMode })}>
                {Object.entries(MODE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Started
              <input type="date" value={draft.dateStarted ?? ''} onChange={(e) => set({ dateStarted: e.target.value })} />
            </label>
            <label>
              Finished
              <input
                type="date"
                value={draft.dateCompleted ?? ''}
                onChange={(e) => set({ dateCompleted: e.target.value })}
                disabled={book.status !== 'completed'}
              />
            </label>
            <label>
              Chapters (read / total)
              <span className="pair">
                <input type="number" min={0} value={draft.chaptersRead ?? ''} onChange={(e) => set({ chaptersRead: Number(e.target.value) })} />
                <input type="number" min={0} value={draft.totalChapters ?? ''} onChange={(e) => set({ totalChapters: Number(e.target.value) })} />
              </span>
            </label>
            <label>
              Pages (read / total)
              <span className="pair">
                <input type="number" min={0} value={draft.pagesRead ?? ''} onChange={(e) => set({ pagesRead: Number(e.target.value) })} />
                <input type="number" min={0} value={draft.totalPages ?? ''} onChange={(e) => set({ totalPages: Number(e.target.value) })} />
              </span>
            </label>
            <label>
              {data.child.name}’s rating
              <select value={draft.childRating ?? 0} onChange={(e) => set({ childRating: Number(e.target.value) || undefined })}>
                <option value={0}>—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {'★'.repeat(n)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulty band (parents only)
              <input
                value={draft.difficulty?.band ?? ''}
                onChange={(e) => set({ difficulty: { ...draft.difficulty, band: e.target.value } })}
                placeholder="e.g. Grades 2–3"
              />
            </label>
            <label className="span-2">
              Favorite part
              <input value={draft.favoritePart ?? ''} onChange={(e) => set({ favoritePart: e.target.value })} />
            </label>
            <label className="span-2">
              Comprehension notes
              <textarea
                rows={2}
                value={draft.comprehensionNotes ?? ''}
                onChange={(e) => set({ comprehensionNotes: e.target.value })}
                placeholder="What did she understand? Inferences, predictions, vocabulary…"
              />
            </label>
            <label className="span-2">
              Parent notes
              <textarea rows={2} value={draft.parentNotes ?? ''} onChange={(e) => set({ parentNotes: e.target.value })} />
            </label>
            <label className="span-2">
              Tags (comma-separated)
              <input
                value={draft.tags.join(', ')}
                onChange={(e) =>
                  set({
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <div className="span-2 photo-fields">
              <label className="upload">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const img = await prepareImage(f);
                    const m = await addMedia(ctx, { blob: img.blob, childId: data.child.id, caption: `${book.title} cover` });
                    set({ coverMediaId: m.id });
                  }}
                />
                <Icon name="photo" size={16} /> Cover photo
              </label>
              <label className="upload">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const img = await prepareImage(f);
                    const m = await addMedia(ctx, { blob: img.blob, childId: data.child.id, caption: `${book.title} work sample` });
                    set({ workSampleMediaId: m.id });
                  }}
                />
                <Icon name="upload" size={16} /> Drawing / work sample
              </label>
              {draft.workSampleMediaId && <MediaImage id={draft.workSampleMediaId} alt="Work sample" className="thumb-img" />}
            </div>
            <div className="form-actions span-2">
              {saved && <span className="saved-note">Saved ✓</span>}
              <button type="submit" className="btn btn-primary">
                Save details
              </button>
            </div>
          </form>
        </Card>
        <div className="stack">
          {book.status !== 'completed' && (
            <Card title="Log reading" icon="book">
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await logReading(ctx, data.child.id, {
                    bookId: book.id,
                    ...(book.totalChapters ? { chaptersRead: Number(logCh) } : { pagesRead: Number(logCh) }),
                    ...(Number(logMin) ? { minutes: Number(logMin) } : {}),
                    source: 'parent',
                  });
                  setLogMin('');
                }}
              >
                <label>
                  {book.totalChapters ? 'Chapters' : 'Pages'}
                  <input type="number" min={1} value={logCh} onChange={(e) => setLogCh(e.target.value)} />
                </label>
                <label>
                  Minutes
                  <input type="number" min={0} value={logMin} onChange={(e) => setLogMin(e.target.value)} />
                </label>
                <button type="submit" className="btn">
                  Log
                </button>
              </form>
            </Card>
          )}
          <Card title="Reading sessions" icon="calendar">
            {sessions.length === 0 ? (
              <EmptyState>No sessions logged.</EmptyState>
            ) : (
              <ul className="simple-list">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <strong>{formatDay(s.date)}</strong> — {s.chaptersRead ? `${s.chaptersRead} ch.` : s.pagesRead ? `${s.pagesRead} pp.` : ''}{' '}
                    {s.minutes ? `· ${s.minutes} min` : ''} · {MODE_LABEL[s.mode]}{' '}
                    <span className="muted small">
                      ({s.source === 'child' ? 'with Professor Hoot' : s.source === 'interpreter' ? 'from a logged activity' : 'parent'})
                    </span>
                    {s.notes && s.notes !== 'Finished the book' && <div className="muted small">{s.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Comprehension evidence" icon="check">
            {evidence.length === 0 ? (
              <EmptyState>No evidence yet — story chats with Professor Hoot add it automatically.</EmptyState>
            ) : (
              <ul className="evidence-list">
                {evidence.map((e) => (
                  <EvidenceItem key={e.id} e={e} />
                ))}
              </ul>
            )}
          </Card>
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'parent', section: 'books' })}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
