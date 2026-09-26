import { useMemo, useState } from 'react';
import { useServices } from '../../../app/services';
import { navigate } from '../../../app/router';
import { prerequisitesMet, recommendNext } from '../../../domain/adaptive/recommendations';
import { DOMAINS, SKILLS, STRANDS, difficultyLabel, getDomain, getSkill, getStrand, type Skill } from '../../../domain/curriculum';
import type { SkillSuggestion } from '../../../domain/interpretation';
import { LESSON_TITLES } from '../../../domain/lessons/registry';
import { TEACHERS, type TeacherId } from '../../../domain/teachers/teachers';
import { MASTERY_LABELS, MASTERY_ORDER, MASTERY_RULES, effectiveLevel, masteryStatement } from '../../../domain/mastery/masteryEngine';
import type { MasteryLevel, MasteryRecord } from '../../../domain/types';
import { dayFromTimestamp, formatDay, toDay } from '../../../domain/util/time';
import { addObservation } from '../../../services/activityService';
import { setMasteryOverride } from '../../../services/householdService';
import { Icon } from '../../shared/Icon';
import { Card, EmptyState, EvidenceItem, LevelBadge, LevelLegend, PageHeader } from '../components';
import type { ParentData } from '../ParentApp';

export function CurriculumPage({ data, param }: { data: ParentData; param?: string }) {
  if (param && !param.startsWith('strand:') && getSkill(param)) return <SkillDetail data={data} skillId={param} />;
  return <CurriculumMap data={data} {...(param?.startsWith('strand:') ? { strandId: param.slice(7) } : {})} />;
}

function CurriculumMap({ data, strandId }: { data: ParentData; strandId?: string }) {
  const { records, child } = data;
  const initialDomain = strandId ? (getStrand(strandId)?.domainId ?? 'reading') : 'reading';
  const [domainId, setDomainId] = useState<string>(initialDomain);
  const [levelFilter, setLevelFilter] = useState<'all' | MasteryLevel>('all');
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(records.mastery.map((m) => [m.skillId, m])), [records.mastery]);
  const levels = useMemo(() => new Map(SKILLS.map((s) => [s.id, effectiveLevel(byId.get(s.id))])), [byId]);
  const evidenceCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of records.evidence) m.set(e.skillId, (m.get(e.skillId) ?? 0) + 1);
    return m;
  }, [records.evidence]);
  const recs = useMemo(() => recommendNext(records.mastery, { limit: 3, domainId }), [records.mastery, domainId]);
  const domain = getDomain(domainId);
  const q = query.trim().toLowerCase();

  const matches = (s: Skill) => {
    if (levelFilter !== 'all' && levels.get(s.id) !== levelFilter) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.can.toLowerCase().includes(q) ||
      s.standards.some((st) => st.code.toLowerCase().includes(q) || st.description.toLowerCase().includes(q))
    );
  };
  const searching = q.length > 0;
  const strands = STRANDS.filter((s) => searching || s.domainId === domainId);

  return (
    <div className="page">
      <PageHeader
        title="Curriculum"
        subtitle={`Skills aligned to Common Core, NGSS and early-learning frameworks. Standards are for your records — ${child.name} never sees codes or grade labels.`}
      />
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Subjects">
          {DOMAINS.map((d) => (
            <button
              key={d.id}
              role="tab"
              type="button"
              aria-selected={d.id === domainId && !searching}
              className={`tab ${d.id === domainId && !searching ? 'active' : ''}`}
              onClick={() => {
                setDomainId(d.id);
                setQuery('');
              }}
            >
              <span className="tab-dot" style={{ background: d.color }} />
              {d.name}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="sr-only" htmlFor="cur-search">
            Search skills or standards
          </label>
          <input id="cur-search" type="search" placeholder="Search skills or standard codes…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="sr-only" htmlFor="cur-level">
            Filter by level
          </label>
          <select id="cur-level" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as 'all' | MasteryLevel)}>
            <option value="all">All levels</option>
            {MASTERY_ORDER.map((l) => (
              <option key={l} value={l}>
                {MASTERY_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!searching && domain && (
        <Card className="domain-intro">
          <div className="domain-intro-row">
            <div>
              <h2 className="domain-title">
                <span className="domain-dot" style={{ background: domain.color }} />
                {domain.name}
              </h2>
              <p className="muted">{domain.description}</p>
            </div>
            <LevelLegend />
          </div>
          {recs.length > 0 && (
            <div className="suggested-strip">
              <strong>Suggested next in {domain.name}:</strong>
              {recs.map((r) => (
                <a key={r.skillId} href={`#/parent/curriculum/${r.skillId}`} className="chip chip-link" title={r.rationale}>
                  {r.skill.name}
                </a>
              ))}
            </div>
          )}
        </Card>
      )}

      {strands.map((strand) => {
        const skills = SKILLS.filter((s) => s.strandId === strand.id && matches(s)).sort((a, b) => a.difficulty - b.difficulty);
        if (skills.length === 0) return null;
        return (
          <Card
            key={strand.id}
            title={searching ? `${getDomain(strand.domainId)?.name} · ${strand.name}` : strand.name}
            className={strand.id === strandId ? 'highlight' : ''}
          >
            <p className="muted small">{strand.description}</p>
            <div className="table-scroll">
              <table className="data-table skill-table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Typical</th>
                    <th>Level</th>
                    <th className="num hide-sm">Evidence</th>
                    <th className="hide-sm">Last seen</th>
                    <th className="hide-sm">Standards</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s) => {
                    const rec = byId.get(s.id);
                    const level = levels.get(s.id) ?? 'not_started';
                    const ready = level === 'not_started' && prerequisitesMet(s, levels);
                    return (
                      <tr key={s.id} className="clickable" onClick={() => navigate({ name: 'parent', section: 'curriculum', param: s.id })}>
                        <td>
                          <a href={`#/parent/curriculum/${s.id}`} onClick={(e) => e.stopPropagation()}>
                            {s.name}
                          </a>
                          <div className="muted small">Can {s.can}</div>
                        </td>
                        <td className="nowrap small">{difficultyLabel(s.difficulty)}</td>
                        <td>
                          <LevelBadge level={level} override={!!rec?.override} />
                          {ready && <span className="ready-tag">ready</span>}
                          {rec?.needsReview && <span className="review-tag">review</span>}
                        </td>
                        <td className="num hide-sm">{evidenceCount.get(s.id) ?? 0}</td>
                        <td className="nowrap small hide-sm">{rec?.stats.lastObservedAt ? formatDay(dayFromTimestamp(rec.stats.lastObservedAt)) : '—'}</td>
                        <td className="small codes hide-sm">{s.standards.map((st) => st.code).join(', ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      {searching && strands.every((st) => SKILLS.filter((s) => s.strandId === st.id && matches(s)).length === 0) && (
        <EmptyState>No skills match “{query}”.</EmptyState>
      )}
    </div>
  );
}

const OUTCOMES: { id: SkillSuggestion['outcome']; label: string }[] = [
  { id: 'demonstrated', label: 'Demonstrated it' },
  { id: 'with_support', label: 'Did it with help' },
  { id: 'exposure', label: 'Was introduced to it' },
  { id: 'not_yet', label: 'Tried — not yet' },
];

function SkillDetail({ data, skillId }: { data: ParentData; skillId: string }) {
  const { ctx } = useServices();
  const { child, records } = data;
  const skill = getSkill(skillId)!;
  const domain = getDomain(skill.domainId);
  const strand = getStrand(skill.strandId);
  const rec: MasteryRecord | undefined = records.mastery.find((m) => m.skillId === skillId);
  const level = effectiveLevel(rec);
  const levels = new Map(records.mastery.map((m) => [m.skillId, effectiveLevel(m)]));
  const evidence = records.evidence.filter((e) => e.skillId === skillId).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const unlocksNext = SKILLS.filter((s) => s.prerequisites.includes(skillId));

  const [obs, setObs] = useState({
    statement: '',
    outcome: 'demonstrated' as SkillSuggestion['outcome'],
    independence: 'independent' as SkillSuggestion['independence'],
    date: toDay(new Date()),
  });
  const [ovr, setOvr] = useState<{ level: MasteryLevel; note: string }>({ level: rec?.override?.level ?? level, note: rec?.override?.note ?? '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveObservation = async () => {
    if (!obs.statement.trim()) return;
    setBusy(true);
    try {
      const out = await addObservation(ctx, child.id, {
        skillId,
        statement: obs.statement.trim(),
        outcome: obs.outcome,
        independence: obs.outcome === 'with_support' ? 'supported' : obs.independence,
        date: obs.date,
      });
      setObs({ ...obs, statement: '' });
      const change = out.masteryChanges.find((c) => c.skillId === skillId);
      const rewards = out.newRewards.map((r) => r.name).join(', ');
      setMsg(
        `Observation saved.${change ? ` Level: ${MASTERY_LABELS[change.from]} → ${MASTERY_LABELS[change.to]}.` : ''}${rewards ? ` Unlocked: ${rewards}!` : ''}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const saveOverride = async (clear = false) => {
    await setMasteryOverride(ctx, child.id, skillId, clear ? null : { level: ovr.level, note: ovr.note.trim() || 'Parent assessment' });
    setMsg(clear ? 'Parent assessment cleared — level follows evidence again.' : 'Parent assessment saved. The evidence-based level is kept alongside it.');
  };

  return (
    <div className="page">
      <a className="back-link" href={`#/parent/curriculum/strand:${skill.strandId}`}>
        <Icon name="back" size={16} /> {domain?.name} · {strand?.name}
      </a>
      <PageHeader
        title={skill.name}
        subtitle={
          <>
            <span className="domain-dot" style={{ background: domain?.color }} /> {domain?.name} · typically introduced around{' '}
            {difficultyLabel(skill.difficulty)} · shown to {child.name} as “{skill.childName}”
          </>
        }
        actions={<LevelBadge level={level} override={!!rec?.override} />}
      />
      {msg && (
        <div className="notice success" role="status">
          <Icon name="check" size={16} /> {msg}
        </div>
      )}
      <div className="grid-2">
        <div className="stack">
          <Card title="Where things stand" icon="chart">
            <p className="lead">{masteryStatement(skill.can, level)}</p>
            {rec ? (
              <dl className="stat-grid">
                <div>
                  <dt>Independent successes</dt>
                  <dd>{rec.stats.independent}</dd>
                </div>
                <div>
                  <dt>With support</dt>
                  <dd>{rec.stats.supported}</dd>
                </div>
                <div>
                  <dt>Not yet</dt>
                  <dd>{rec.stats.notYet}</dd>
                </div>
                <div>
                  <dt>Exposures</dt>
                  <dd>{rec.stats.exposures}</dd>
                </div>
                <div>
                  <dt>Days with independent work</dt>
                  <dd>{rec.stats.independentDays}</dd>
                </div>
                <div>
                  <dt>Recent accuracy</dt>
                  <dd>{Math.round(rec.stats.recentScore * 100)}%</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{rec.confidence}</dd>
                </div>
                <div>
                  <dt>Evidence-based level</dt>
                  <dd>
                    <LevelBadge level={rec.computedLevel} />
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyState>No evidence yet.</EmptyState>
            )}
            <details className="rules">
              <summary>How levels are decided</summary>
              <ul className="small">
                <li>
                  Proficient: ≥{MASTERY_RULES.proficient.independent} independent successes on ≥{MASTERY_RULES.proficient.days} different days, recent accuracy
                  ≥{Math.round(MASTERY_RULES.proficient.score * 100)}%.
                </li>
                <li>
                  Mastered: ≥{MASTERY_RULES.mastered.independent} independent successes on ≥{MASTERY_RULES.mastered.days} days, recent accuracy ≥
                  {Math.round(MASTERY_RULES.mastered.score * 100)}%, and the most recent attempts independent.
                </li>
                <li>Exposure (“we talked about it”) introduces a skill but never counts toward mastery.</li>
              </ul>
            </details>
            {rec && rec.history.length > 0 && (
              <ol className="history">
                {rec.history.map((h, i) => (
                  <li key={i}>
                    <LevelBadge level={h.level} /> <span className="muted small">{formatDay(dayFromTimestamp(h.at))}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Add an observation" icon="pencil">
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void saveObservation();
              }}
            >
              <label className="span-2">
                What did you see?
                <textarea
                  rows={2}
                  value={obs.statement}
                  onChange={(e) => setObs({ ...obs, statement: e.target.value })}
                  placeholder={`e.g. ${child.name} ${skill.can} while…`}
                />
              </label>
              <label>
                Outcome
                <select value={obs.outcome} onChange={(e) => setObs({ ...obs, outcome: e.target.value as SkillSuggestion['outcome'] })}>
                  {OUTCOMES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={obs.date} max={toDay(new Date())} onChange={(e) => setObs({ ...obs, date: e.target.value })} />
              </label>
              <div className="span-2 form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || !obs.statement.trim()}>
                  Save observation
                </button>
              </div>
            </form>
          </Card>

          <Card title="Parent assessment" icon="user">
            <p className="muted small">
              If you know {child.name}’s level better than the evidence shows, record it here. It’s shown with a ✎ and never erases the evidence-based level.
            </p>
            <div className="form-grid">
              <label>
                Level
                <select value={ovr.level} onChange={(e) => setOvr({ ...ovr, level: e.target.value as MasteryLevel })}>
                  {MASTERY_ORDER.map((l) => (
                    <option key={l} value={l}>
                      {MASTERY_LABELS[l]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note
                <input value={ovr.note} onChange={(e) => setOvr({ ...ovr, note: e.target.value })} placeholder="Why?" />
              </label>
              <div className="span-2 form-actions">
                <button type="button" className="btn" onClick={() => void saveOverride()}>
                  Save assessment
                </button>
                {rec?.override && (
                  <button type="button" className="btn btn-ghost" onClick={() => void saveOverride(true)}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Try this" icon="sparkle">
            <p>💡 {skill.activityIdea}</p>
            {skill.lessonIds.map((l) => (
              <p key={l} className="small">
                🎮 In the school: <strong>{LESSON_TITLES[l]?.childTitle ?? l}</strong> with{' '}
                {TEACHERS[(LESSON_TITLES[l]?.teacherId ?? 'hoot') as TeacherId]?.name ?? 'a teacher'}
              </p>
            ))}
          </Card>
          <Card title="Standards alignment" icon="list">
            <ul className="standards">
              {skill.standards.map((s) => (
                <li key={s.code}>
                  <span className="code">
                    {s.framework} {s.code}
                  </span>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Builds on / leads to" icon="arrowRight">
            {skill.prerequisites.length === 0 && unlocksNext.length === 0 && <EmptyState>A starting point.</EmptyState>}
            {skill.prerequisites.length > 0 && (
              <>
                <h3 className="mini-head">Builds on</h3>
                <ul className="link-list">
                  {skill.prerequisites.map((p) => (
                    <li key={p}>
                      <a href={`#/parent/curriculum/${p}`}>{getSkill(p)?.name ?? p}</a> <LevelBadge level={levels.get(p) ?? 'not_started'} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {unlocksNext.length > 0 && (
              <>
                <h3 className="mini-head">Leads to</h3>
                <ul className="link-list">
                  {unlocksNext.map((s) => (
                    <li key={s.id}>
                      <a href={`#/parent/curriculum/${s.id}`}>{s.name}</a> <LevelBadge level={levels.get(s.id) ?? 'not_started'} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <Card title={`Evidence (${evidence.length})`} icon="eye">
            {evidence.length === 0 ? (
              <EmptyState>Nothing recorded yet.</EmptyState>
            ) : (
              <ul className="evidence-list">
                {evidence.map((e) => (
                  <EvidenceItem key={e.id} e={e} showSkill={false} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
