import { useMemo, useState } from 'react';
import { useServices } from '../../../app/services';
import { getSkill } from '../../../domain/curriculum';
import type { PortfolioItem, PortfolioKind } from '../../../domain/types';
import { formatDay, toDay } from '../../../domain/util/time';
import { finalizeLearning } from '../../../services/learningCore';
import { UnitOfWork } from '../../../data/repositories';
import { addMedia } from '../../../services/householdService';
import { kidArtDataUrl } from '../../../shared/kidArtPainter';
import { BookCover } from '../../shared/BookCover';
import { Icon } from '../../shared/Icon';
import { Card, EmptyState, MediaImage, PageHeader, prepareImage } from '../components';
import type { ParentData } from '../ParentApp';

export const KIND_LABELS: Record<PortfolioKind, string> = {
  photo: 'Photo',
  artwork: 'Artwork',
  project: 'Project',
  work_sample: 'Work sample',
  book: 'Book',
  assessment: 'Assessment',
  observation: 'Observation',
  nature: 'Nature find',
};
const KIND_ICON: Record<PortfolioKind, string> = {
  photo: '📷',
  artwork: '🎨',
  project: '🛠️',
  work_sample: '✏️',
  book: '📖',
  assessment: '📋',
  observation: '👀',
  nature: '🍂',
};

/** Thumbnail for a portfolio item: photo if present, else book cover or procedural drawing. */
export function PortfolioThumb({ item, childName, books }: { item: PortfolioItem; childName: string; books: ParentData['records']['books'] }) {
  const media = item.mediaIds[0];
  if (media) return <MediaImage id={media} alt={item.title} className="pf-img" />;
  if (item.linked?.type === 'book') {
    const b = books.find((x) => x.id === item.linked?.id);
    if (b)
      return (
        <div className="pf-cover">
          <BookCover title={b.title} author={b.author} cover={b.cover} width={96} />
        </div>
      );
  }
  if (item.kind === 'artwork' || item.artSeed !== undefined)
    return <img className="pf-img" src={kidArtDataUrl(item.artSeed ?? 1, childName)} alt={`${item.title} (illustration)`} />;
  return (
    <div className="pf-placeholder" aria-hidden="true">
      {KIND_ICON[item.kind]}
    </div>
  );
}

export function PortfolioPage({ data }: { data: ParentData }) {
  const { ctx } = useServices();
  const { child, records } = data;
  const [kind, setKind] = useState<'all' | PortfolioKind>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const items = useMemo(
    () =>
      [...records.portfolio].filter((p) => (kind === 'all' || p.kind === kind) && (!favoritesOnly || p.favorite)).sort((a, b) => b.date.localeCompare(a.date)),
    [records.portfolio, kind, favoritesOnly],
  );
  const counts = useMemo(() => {
    const c: Partial<Record<PortfolioKind, number>> = {};
    for (const p of records.portfolio) c[p.kind] = (c[p.kind] ?? 0) + 1;
    return c;
  }, [records.portfolio]);
  const current = records.portfolio.find((p) => p.id === selected) ?? null;

  const toggleFavorite = async (p: PortfolioItem) => {
    await ctx.repos.portfolio.put({ ...p, favorite: !p.favorite });
  };

  return (
    <div className="page">
      <PageHeader
        title="Portfolio"
        subtitle={`${child.name}’s work, photos and projects. Starred items appear in the family Learning Museum.`}
        actions={
          <>
            <a className="btn" href={`#/museum/${child.id}`}>
              <Icon name="museum" size={16} /> Open Learning Museum
            </a>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(!adding)} data-testid="pf-add-toggle">
              <Icon name="plus" size={16} /> Add item
            </button>
          </>
        }
      />
      {adding && <AddPortfolioForm data={data} onDone={() => setAdding(false)} />}
      <div className="toolbar">
        <div className="chip-row">
          <button type="button" className={`chip ${kind === 'all' ? 'active' : ''}`} onClick={() => setKind('all')}>
            All ({records.portfolio.length})
          </button>
          {(Object.keys(KIND_LABELS) as PortfolioKind[])
            .filter((k) => counts[k])
            .map((k) => (
              <button key={k} type="button" className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                {KIND_ICON[k]} {KIND_LABELS[k]} ({counts[k]})
              </button>
            ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /> Starred only
        </label>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState>Nothing here yet. Add a photo of a drawing, a worksheet or a project — or log an activity with a photo.</EmptyState>
        </Card>
      ) : (
        <div className="pf-grid">
          {items.map((p) => (
            <article key={p.id} className="pf-card">
              <button type="button" className="pf-thumb" onClick={() => setSelected(p.id)} aria-label={`Open ${p.title}`}>
                <PortfolioThumb item={p} childName={child.name} books={records.books} />
              </button>
              <div className="pf-body">
                <div className="pf-title-row">
                  <strong className="pf-title">{p.title}</strong>
                  <button
                    type="button"
                    className={`star-btn ${p.favorite ? 'on' : ''}`}
                    onClick={() => void toggleFavorite(p)}
                    aria-pressed={p.favorite}
                    aria-label={p.favorite ? 'Unstar' : 'Star for the museum'}
                  >
                    <Icon name={p.favorite ? 'star' : 'starOutline'} size={18} />
                  </button>
                </div>
                <div className="muted small">
                  {KIND_ICON[p.kind]} {KIND_LABELS[p.kind]} · {formatDay(p.date)}
                  {p.isDemo && <span className="demo-tag">demo</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {current && <PortfolioDetail item={current} data={data} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PortfolioDetail({ item, data, onClose }: { item: PortfolioItem; data: ParentData; onClose: () => void }) {
  const { ctx } = useServices();
  const [edit, setEdit] = useState({ title: item.title, description: item.description });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = async () => {
    await ctx.repos.portfolio.put({ ...item, title: edit.title.trim() || item.title, description: edit.description });
    onClose();
  };
  const remove = async () => {
    await ctx.repos.commit([
      { table: 'portfolio', type: 'delete', key: item.id },
      ...item.mediaIds.map((id) => ({ table: 'media' as const, type: 'delete' as const, key: id })),
    ]);
    onClose();
  };
  return (
    <div className="p-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="p-modal" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn p-modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <div className="pf-detail">
          <div className="pf-detail-media">
            <PortfolioThumb item={item} childName={data.child.name} books={data.records.books} />
            {item.mediaIds.slice(1).map((m) => (
              <MediaImage key={m} id={m} alt={item.title} className="pf-img" />
            ))}
          </div>
          <div className="pf-detail-body">
            <label>
              Title
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </label>
            <label>
              Notes
              <textarea rows={4} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </label>
            <p className="muted small">
              {KIND_LABELS[item.kind]} · {formatDay(item.date, 'long')}
            </p>
            {item.skillIds.length > 0 && (
              <div className="chip-row">
                {item.skillIds.map((s) => (
                  <a key={s} className="chip chip-link" href={`#/parent/curriculum/${s}`}>
                    {getSkill(s)?.name ?? s}
                  </a>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={() => void save()}>
                Save
              </button>
              {!confirmDelete ? (
                <button type="button" className="btn btn-ghost danger" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={16} /> Delete
                </button>
              ) : (
                <button type="button" className="btn btn-danger" onClick={() => void remove()}>
                  Really delete (and its photos)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddPortfolioForm({ data, onDone }: { data: ParentData; onDone: () => void }) {
  const { ctx } = useServices();
  const { child } = data;
  const [form, setForm] = useState({ title: '', kind: 'artwork' as PortfolioKind, date: toDay(new Date()), description: '', favorite: true });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const mediaIds: string[] = [];
      for (const f of files) {
        const img = await prepareImage(f);
        const m = await addMedia(ctx, { blob: img.blob, childId: child.id, caption: form.title, width: img.width, height: img.height });
        mediaIds.push(m.id);
      }
      const item: PortfolioItem = {
        id: ctx.ids('pf'),
        childId: child.id,
        date: form.date,
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim(),
        mediaIds,
        skillIds: [],
        favorite: form.favorite,
        ...(mediaIds.length === 0 && form.kind === 'artwork' ? { artSeed: Math.floor(Math.random() * 1000) } : {}),
      };
      // Artwork counts toward the art line / art studio rewards, so go through the learning pipeline.
      const uow = new UnitOfWork();
      uow.put('portfolio', item);
      await finalizeLearning(ctx, child.id, uow, `portfolio:${item.id}`);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add to portfolio" icon="plus">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Rainbow painting"
            data-testid="pf-title"
            required
          />
        </label>
        <label>
          Kind
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PortfolioKind })}>
            {(Object.keys(KIND_LABELS) as PortfolioKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={form.date} max={toDay(new Date())} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label>
          Photos <span className="muted small">(stay on this device)</span>
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <label className="span-2">
          Notes
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What she said about it, materials, how long she worked…"
          />
        </label>
        <label className="check span-2">
          <input type="checkbox" checked={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} /> Show in the Learning Museum
        </label>
        <div className="span-2 form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !form.title.trim()} data-testid="pf-save">
            {busy ? 'Saving…' : 'Save to portfolio'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
