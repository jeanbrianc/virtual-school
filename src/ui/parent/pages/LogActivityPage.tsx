/**
 * Natural-language activity logging: type one thing → the interpreter
 * proposes subjects, skills and evidence → review/edit → save.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../../app/router';
import { useServices } from '../../../app/services';
import { DOMAINS, SKILLS, getDomain, getSkill } from '../../../domain/curriculum';
import { ACCEPT_THRESHOLD, type ActivityInterpretation, type BookMention, type SkillSuggestion } from '../../../domain/interpretation';
import { MASTERY_LABELS } from '../../../domain/mastery/masteryEngine';
import { getReward, type RewardDefinition } from '../../../domain/rewards/catalog';
import { ruleProgress } from '../../../domain/rewards/engine';
import type { Independence, PortfolioKind } from '../../../domain/types';
import { toDay } from '../../../domain/util/time';
import { interpretActivity, saveActivity, type SaveActivityResult } from '../../../services/activityService';
import { addMedia } from '../../../services/householdService';
import { snapshotFromRecords } from '../../../services/learningCore';
import { useStore } from '../../../state/store';
import { BookCover } from '../../shared/BookCover';
import { Icon } from '../../shared/Icon';
import { Card, PageHeader, prepareImage } from '../components';
import { logDraftStore, SAMPLE_NARRATIVES } from '../drafts';
import type { ParentData } from '../ParentApp';

type Phase = 'compose' | 'interpreting' | 'review' | 'saving' | 'saved';

const OUTCOMES: { id: SkillSuggestion['outcome']; label: string }[] = [
  { id: 'demonstrated', label: 'Demonstrated' },
  { id: 'with_support', label: 'With support' },
  { id: 'exposure', label: 'Exposure only' },
  { id: 'not_yet', label: 'Not yet' },
];
const INDEPENDENCE: { id: Independence; label: string }[] = [
  { id: 'independent', label: 'Independent' },
  { id: 'supported', label: 'With support' },
  { id: 'assisted', label: 'Adult-assisted' },
];
const KINDS: { id: PortfolioKind; label: string }[] = [
  { id: 'observation', label: 'Observation' },
  { id: 'photo', label: 'Photo' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'project', label: 'Project' },
  { id: 'work_sample', label: 'Work sample' },
  { id: 'nature', label: 'Nature find' },
];

const TOPIC_REWARD: Record<string, string> = {
  plants: 'room.greenhouse',
  space: 'decor.telescope',
  dinosaurs: 'exhibit.dino-skeleton',
  nature: 'exhibit.nature-table',
};

export function LogActivityPage({ data }: { data: ParentData }) {
  const services = useServices();
  const { ctx } = services;
  const draftState = useStore(logDraftStore, (s) => s);
  const [text, setText] = useState(draftState.text);
  const [phase, setPhase] = useState<Phase>('compose');
  const [interp, setInterp] = useState<ActivityInterpretation | null>(null);
  const [skills, setSkills] = useState<SkillSuggestion[]>([]);
  const [books, setBooks] = useState<(BookMention & { include: boolean })[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDay(new Date()));
  const [duration, setDuration] = useState<string>('');
  const [observation, setObservation] = useState('');
  const [reflection, setReflection] = useState('');
  const [nature, setNature] = useState<string[]>([]);
  const [kind, setKind] = useState<PortfolioKind | ''>('');
  const [favorite, setFavorite] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [addSkill, setAddSkill] = useState('');
  const [result, setResult] = useState<SaveActivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const interpreter = services.interpreter(data.household);

  const run = async (narrative: string) => {
    if (!narrative.trim()) return;
    setPhase('interpreting');
    setError(null);
    try {
      const r = await interpretActivity(ctx, interpreter, data.child.id, narrative);
      setInterp(r);
      setSkills(r.skills);
      setBooks(r.books.map((b) => ({ ...b, include: true })));
      setTitle(r.title);
      setDate(r.date);
      setDuration(r.durationMinutes ? String(r.durationMinutes) : '');
      setReflection(r.childQuotes[0] ?? '');
      setNature(r.natureItems);
      setKind('');
      setPhase('review');
      window.setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not interpret that.');
      setPhase('compose');
    }
  };

  useEffect(() => {
    if (draftState.autoInterpret && draftState.text) {
      logDraftStore.set({ text: '', autoInterpret: false });
      void run(draftState.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (i: number, patch: Partial<SkillSuggestion>) => setSkills((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const accepted = skills.filter((s) => s.accepted);
  const snapshot = useMemo(() => snapshotFromRecords(data.records), [data.records]);
  const topics = useMemo(() => [...new Set([...(interp?.topics ?? []), ...accepted.flatMap((s) => s.topics)])], [interp, accepted]);

  const save = async () => {
    if (!interp) return;
    setPhase('saving');
    try {
      const mediaIds: string[] = [];
      for (const f of photos) {
        const img = await prepareImage(f);
        const rec = await addMedia(ctx, { blob: img.blob, childId: data.child.id, caption: title, width: img.width, height: img.height });
        mediaIds.push(rec.id);
      }
      const res = await saveActivity(ctx, data.child.id, {
        narrative: text,
        title,
        date,
        ...(Number(duration) > 0 ? { durationMinutes: Number(duration) } : {}),
        skills,
        books: books.filter((b) => b.include),
        topics,
        natureItems: nature,
        parentObservation: observation,
        childReflection: reflection,
        mediaIds,
        ...(kind ? { portfolioKind: kind } : {}),
        favorite,
        interpretation: { ...interp.provider, totalSuggestions: interp.skills.length },
      });
      setResult(res);
      setPhase('saved');
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed.');
      setPhase('review');
    }
  };

  const reset = () => {
    setText('');
    setInterp(null);
    setSkills([]);
    setBooks([]);
    setObservation('');
    setReflection('');
    setPhotos([]);
    setFavorite(false);
    setResult(null);
    setPhase('compose');
  };

  if (phase === 'saved' && result) return <SavedPanel result={result} childName={data.child.name} onAnother={reset} />;

  return (
    <div className="page">
      <PageHeader
        title="Log a learning moment"
        subtitle="Describe what happened in your own words. We’ll suggest subjects, skills and evidence — you stay in charge of what’s saved."
      />
      <Card>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void run(text);
          }}
        >
          <label htmlFor="log-text" className="composer-label">
            What did {data.child.name} do?
          </label>
          <textarea id="log-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE_NARRATIVES[1]} data-testid="log-text" />
          <div className="composer-row">
            <div className="chip-row">
              <span className="muted small">Examples:</span>
              {['Reading + baking', 'Muffins', 'Bean sprouts', 'Nature walk', 'Painting'].map((l, i) => (
                <button key={l} type="button" className="chip" onClick={() => setText(SAMPLE_NARRATIVES[i] ?? '')} data-testid={`example-${i}`}>
                  {l}
                </button>
              ))}
            </div>
            <button type="submit" className="btn btn-primary" disabled={!text.trim() || phase === 'interpreting'} data-testid="log-interpret">
              <Icon name="sparkle" size={16} /> {phase === 'interpreting' ? 'Organizing…' : interp ? 'Re-organize' : 'Organize this'}
            </button>
          </div>
          <p className="privacy-line">
            <Icon name="lock" size={14} />{' '}
            {interpreter.sendsDataOffDevice
              ? `Using ${interpreter.label} — your narrative is sent to your configured endpoint.`
              : 'Organized on this device. Nothing is sent anywhere.'}
          </p>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Card>

      {interp && phase !== 'compose' && (
        <div ref={reviewRef} className="review" data-testid="review">
          <Card title="Review & save" icon="check">
            <div className="form-grid">
              <label>
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="review-title" />
              </label>
              <label>
                Date
                <input type="date" value={date} max={toDay(new Date())} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Minutes (optional)
                <input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </label>
            </div>
            {interp.notes.map((n) => (
              <p key={n} className="notice">
                <Icon name="info" size={16} /> {n}
              </p>
            ))}
          </Card>

          <Card title={`Skills & evidence (${accepted.length} selected)`} icon="list">
            <p className="muted small">
              Checked items become evidence records. Exposure never counts toward mastery; “with support” counts toward developing only.
            </p>
            <ul className="suggestions" data-testid="suggestions">
              {skills.map((s, i) => {
                const skill = getSkill(s.skillId);
                const domain = skill ? getDomain(skill.domainId) : undefined;
                return (
                  <li key={s.skillId} className={`suggestion ${s.accepted ? 'on' : ''}`} data-skill={s.skillId}>
                    <label className="suggestion-check">
                      <input
                        type="checkbox"
                        checked={s.accepted}
                        onChange={(e) => update(i, { accepted: e.target.checked })}
                        aria-label={`Include ${skill?.name}`}
                      />
                    </label>
                    <div className="suggestion-main">
                      <div className="suggestion-head">
                        <span className="tag" style={{ borderColor: domain?.color }}>
                          <span className="tag-dot" style={{ background: domain?.color }} />
                          {domain?.name}
                        </span>
                        <strong>{skill?.name}</strong>
                        <span className="confidence" title="How sure the interpreter is">
                          <span className="meter tiny">
                            <span style={{ width: `${Math.round(s.confidence * 100)}%` }} />
                          </span>
                          {Math.round(s.confidence * 100)}%
                        </span>
                      </div>
                      <input
                        className="statement-input"
                        value={s.statement}
                        onChange={(e) => update(i, { statement: e.target.value })}
                        aria-label="Evidence statement"
                      />
                      <div className="suggestion-controls">
                        <select value={s.outcome} onChange={(e) => update(i, { outcome: e.target.value as SkillSuggestion['outcome'] })} aria-label="Outcome">
                          {OUTCOMES.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <select value={s.independence} onChange={(e) => update(i, { independence: e.target.value as Independence })} aria-label="Independence">
                          {INDEPENDENCE.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {s.excerpt && <span className="excerpt">“{s.excerpt.length > 110 ? `${s.excerpt.slice(0, 110)}…` : s.excerpt}”</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="add-skill">
              <select value={addSkill} onChange={(e) => setAddSkill(e.target.value)} aria-label="Add another skill">
                <option value="">Add another skill…</option>
                {DOMAINS.map((d) => (
                  <optgroup key={d.id} label={d.name}>
                    {SKILLS.filter((s) => s.domainId === d.id && !skills.some((x) => x.skillId === s.id)).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                disabled={!addSkill}
                onClick={() => {
                  const sk = getSkill(addSkill);
                  if (!sk) return;
                  setSkills((l) => [
                    ...l,
                    {
                      skillId: sk.id,
                      confidence: 1,
                      kind: 'observation',
                      independence: 'independent',
                      outcome: 'demonstrated',
                      statement: `Can ${sk.can}.`,
                      excerpt: '',
                      topics: sk.topics,
                      accepted: true,
                    },
                  ]);
                  setAddSkill('');
                }}
              >
                <Icon name="plus" size={16} /> Add
              </button>
            </div>
          </Card>

          {books.length > 0 && (
            <Card title="Books mentioned" icon="book">
              {books.map((b, i) => (
                <div key={b.title} className="book-mention">
                  <input
                    type="checkbox"
                    checked={b.include}
                    onChange={(e) => setBooks((l) => l.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    aria-label={`Update ${b.title}`}
                  />
                  <BookCover
                    title={b.title}
                    author={b.author ?? ''}
                    cover={data.records.books.find((x) => x.id === b.existingBookId)?.cover ?? { background: '#d8c3a5', accent: '#8e5b3a', motif: 'star' }}
                    width={40}
                  />
                  <div>
                    <strong>{b.title}</strong>{' '}
                    {b.existingBookId ? <span className="muted small">(on her list)</span> : <span className="muted small">(new — will be added)</span>}
                    <div className="inline-fields">
                      <label>
                        Chapters read
                        <input
                          type="number"
                          min={0}
                          value={b.chaptersRead ?? ''}
                          onChange={(e) =>
                            setBooks((l) => l.map((x, j) => (j === i ? { ...x, chaptersRead: Number(e.target.value) || undefined } : x)) as typeof books)
                          }
                        />
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={b.completed}
                          onChange={(e) => setBooks((l) => l.map((x, j) => (j === i ? { ...x, completed: e.target.checked } : x)))}
                        />{' '}
                        Finished it (adds to her 3D shelf)
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div className="grid-2">
            <Card title="Notes & reflections" icon="pencil">
              <label className="block">
                Your observation (optional)
                <textarea
                  rows={3}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="What stood out? Any struggles or breakthroughs?"
                />
              </label>
              <label className="block">
                In {data.child.name}’s words (optional)
                <textarea rows={2} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="Something she said about it" />
              </label>
              {interp.questionsAsked.length > 0 && (
                <p className="small">
                  <strong>Questions she asked:</strong> {interp.questionsAsked.join(' · ')}
                </p>
              )}
              {interp.measurements.length > 0 && (
                <p className="small">
                  <strong>Measurements:</strong> {interp.measurements.map((m) => m.text).join(', ')}
                </p>
              )}
            </Card>
            <Card title="Photos & portfolio" icon="photo">
              <label className="upload">
                <input type="file" accept="image/*" multiple onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? [])].slice(0, 6))} />
                <Icon name="upload" size={18} /> Add photos of her work (stored only on this device)
              </label>
              {photos.length > 0 && (
                <div className="thumbs">
                  {photos.map((p, i) => (
                    <PhotoThumb key={`${p.name}-${i}`} file={p} onRemove={() => setPhotos(photos.filter((_, j) => j !== i))} />
                  ))}
                </div>
              )}
              <div className="form-grid two">
                <label>
                  Portfolio type
                  <select value={kind} onChange={(e) => setKind(e.target.value as PortfolioKind)}>
                    <option value="">Automatic</option>
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Feature in her Learning Museum
                </label>
              </div>
              {nature.length > 0 && (
                <div className="chip-row">
                  <span className="small muted">Nature finds for her museum table:</span>
                  {nature.map((n, i) => (
                    <button key={`${n}-${i}`} type="button" className="chip" onClick={() => setNature(nature.filter((_, j) => j !== i))} title="Remove">
                      {n} ✕
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {topics.length > 0 && (
            <Card title="How this grows her school" icon="leaf">
              <div className="chip-row">
                {topics.map((t) => {
                  const rewardId = TOPIC_REWARD[t];
                  const reward = rewardId ? getReward(rewardId) : undefined;
                  const unlocked = rewardId ? data.records.unlocks.some((u) => u.rewardId === rewardId) : false;
                  const prog = reward ? ruleProgress(reward.rule, snapshot) : null;
                  return (
                    <span key={t} className="topic-chip">
                      #{t}
                      {reward && prog && !unlocked ? (
                        <span className="muted small">
                          {' '}
                          → {reward.icon} {reward.name} {Math.min(prog.target, prog.current + 1)}/{prog.target}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </Card>
          )}

          {interp.followUps.length > 0 && (
            <Card title="Ideas to follow up" icon="sparkle">
              <ul className="followups">
                {interp.followUps.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="save-bar">
            <span className="muted small">
              {accepted.length} evidence record{accepted.length === 1 ? '' : 's'} · {books.filter((b) => b.include).length} book update
              {books.filter((b) => b.include).length === 1 ? '' : 's'} · organized by {interp.provider.label} v{interp.provider.version}
            </span>
            <button type="button" className="btn" onClick={reset}>
              Discard
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={phase === 'saving' || !title.trim()} data-testid="log-save">
              <Icon name="check" size={16} /> {phase === 'saving' ? 'Saving…' : 'Save to portfolio'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="thumb">
      {url && <img src={url} alt={file.name} />}
      <button type="button" className="thumb-x" onClick={onRemove} aria-label={`Remove ${file.name}`}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

function SavedPanel({ result, childName, onAnother }: { result: SaveActivityResult; childName: string; onAnother: () => void }) {
  const rewards = result.outcome.newRewards;
  return (
    <div className="page">
      <PageHeader title="Saved!" subtitle={result.activity.title} />
      <Card className="saved-card">
        <div className="saved-grid" data-testid="saved">
          <div>
            <div className="saved-big">{result.evidence.length}</div>
            <div className="muted">evidence records added</div>
          </div>
          <div>
            <div className="saved-big">{result.outcome.masteryChanges.length}</div>
            <div className="muted">skill levels changed</div>
          </div>
          <div>
            <div className="saved-big">{result.booksTouched.length}</div>
            <div className="muted">books updated</div>
          </div>
        </div>
        {result.outcome.masteryChanges.length > 0 && (
          <ul className="changes">
            {result.outcome.masteryChanges.map((c) => (
              <li key={c.skillId}>
                <strong>{getSkill(c.skillId)?.name}</strong>: {MASTERY_LABELS[c.from]} → {MASTERY_LABELS[c.to]}
              </li>
            ))}
          </ul>
        )}
        {rewards.length > 0 && (
          <div className="reward-callout" data-testid="saved-rewards">
            <strong>{childName}’s school just grew!</strong>
            {rewards.map((r: RewardDefinition) => (
              <div key={r.id}>
                {r.icon} {r.name}
              </div>
            ))}
            <span className="muted small">She’ll see the celebration next time she enters her school.</span>
          </div>
        )}
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={onAnother} data-testid="log-another">
            <Icon name="plus" size={16} /> Log another
          </button>
          <button type="button" className="btn" onClick={() => navigate({ name: 'parent', section: 'portfolio' })}>
            View portfolio
          </button>
          <button type="button" className="btn" onClick={() => navigate({ name: 'parent', section: 'today' })}>
            Back to Today
          </button>
        </div>
      </Card>
    </div>
  );
}

export { ACCEPT_THRESHOLD };
