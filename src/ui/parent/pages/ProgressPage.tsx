import { useMemo, useState } from 'react';
import { buildDomainProfiles, type DomainProfile } from '../../../domain/adaptive/profile';
import { getSkill } from '../../../domain/curriculum';
import { MASTERY_LABELS, masteryRank } from '../../../domain/mastery/masteryEngine';
import { getReward } from '../../../domain/rewards/catalog';
import type { MasteryLevel } from '../../../domain/types';
import { addDays, ageAt, dayFromTimestamp, formatDay, monthName, startOfMonth, startOfWeek, toDay } from '../../../domain/util/time';
import { Card, EmptyState, LevelBadge, LevelBar, LevelLegend, PageHeader, StatTile, WeeklyBars } from '../components';
import type { ParentData } from '../ParentApp';

const DESCRIPTOR_NOTE: Record<string, string> = {
  'not yet explored': 'No evidence recorded yet.',
  emerging: 'Introduced — early exposure.',
  developing: 'Practicing with growing independence.',
  strong: 'Solid, independent work at the expected level.',
  advanced: 'Working well beyond typical for her age.',
};

export function ProgressPage({ data }: { data: ParentData }) {
  const { child, records } = data;
  const today = toDay(new Date());
  const age = child.birthDate ? ageAt(child.birthDate, today) : null;
  const profiles = useMemo(() => buildDomainProfiles(records.mastery, age ? age.years + age.months / 12 : null), [records.mastery, age?.years, age?.months]);
  const [open, setOpen] = useState<string | null>('reading');

  const weeks = useMemo(() => {
    const out: { label: string; start: string; independent: number; supported: number; exposure: number }[] = [];
    const thisWeek = startOfWeek(today);
    for (let i = 7; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      out.push({ label: formatDay(start).replace(/,.*$/, ''), start, independent: 0, supported: 0, exposure: 0 });
    }
    for (const e of records.evidence) {
      const d = dayFromTimestamp(e.observedAt);
      const w = [...out].reverse().find((x) => d >= x.start);
      if (!w || d > addDays(w.start, 6)) continue;
      if (e.kind === 'exposure') w.exposure += 1;
      else if (e.independence === 'independent') w.independent += 1;
      else w.supported += 1;
    }
    return out;
  }, [records.evidence, today]);

  const changes = useMemo(() => {
    const since = addDays(today, -30);
    const out: { at: string; skillId: string; from: MasteryLevel; to: MasteryLevel }[] = [];
    for (const m of records.mastery) {
      m.history.forEach((h, i) => {
        if (dayFromTimestamp(h.at) < since) return;
        const prev = m.history[i - 1]?.level ?? 'not_started';
        if (masteryRank(h.level) > masteryRank(prev)) out.push({ at: h.at, skillId: m.skillId, from: prev, to: h.level });
      });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [records.mastery, today]);

  const booksByMonth = useMemo(() => {
    const months: { key: string; label: string; count: number }[] = [];
    let cursor = startOfMonth(today);
    for (let i = 0; i < 6; i++) {
      months.unshift({ key: cursor.slice(0, 7), label: monthName(cursor).slice(0, 3), count: 0 });
      cursor = startOfMonth(addDays(cursor, -1));
    }
    for (const b of records.books) {
      const m = months.find((x) => b.dateCompleted?.startsWith(x.key));
      if (m) m.count += 1;
    }
    return months;
  }, [records.books, today]);

  const completed = records.books.filter((b) => b.status === 'completed');
  const chapters = records.sessions.reduce((s, x) => s + (x.chaptersRead ?? 0), 0);
  const independentShare = (() => {
    const perf = records.evidence.filter((e) => e.kind !== 'exposure');
    if (perf.length === 0) return '—';
    return `${Math.round((perf.filter((e) => e.independence === 'independent').length / perf.length) * 100)}%`;
  })();
  const milestones = [...records.unlocks].sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));

  return (
    <div className="page">
      <PageHeader
        title="Progress"
        subtitle={<>Each subject has its own level — {child.name} can be advanced in reading while still exploring early math. There’s no single “grade.”</>}
      />

      <div className="stat-row">
        <StatTile label="Books finished" value={completed.length} detail={`${chapters} chapters logged`} />
        <StatTile
          label="Skills proficient or mastered"
          value={records.mastery.filter((m) => masteryRank(m.override?.level ?? m.computedLevel) >= masteryRank('proficient')).length}
          detail="across all subjects"
        />
        <StatTile label="Independent evidence" value={independentShare} detail="of performance records done without help" />
        <StatTile label="Rewards unlocked" value={records.unlocks.length} detail="each earned by real learning" />
      </div>

      <Card title="Subjects" icon="chart" action={<LevelLegend />}>
        <div className="domain-list">
          {profiles.map((p) => (
            <DomainRow key={p.domainId} p={p} open={open === p.domainId} onToggle={() => setOpen(open === p.domainId ? null : p.domainId)} />
          ))}
        </div>
        <p className="muted small method-note">
          Levels come from recorded evidence: <strong>Introduced</strong> = seen it; <strong>Developing</strong> = practicing, often with support;{' '}
          <strong>Proficient</strong> = 3+ independent successes on 2+ days; <strong>Mastered</strong> = 6+ independent successes across 3+ days with recent
          work at 85%+. Exposure alone never counts as mastery.
        </p>
      </Card>

      <div className="grid-2">
        <Card title="Learning evidence by week" icon="calendar">
          <WeeklyBars weeks={weeks} />
          <details className="table-toggle">
            <summary>Show as table</summary>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Independent</th>
                  <th>With support</th>
                  <th>Exposure</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start}>
                    <td>{w.label}</td>
                    <td>{w.independent}</td>
                    <td>{w.supported}</td>
                    <td>{w.exposure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <Card title="Books finished by month" icon="book">
          <div className="month-bars" role="img" aria-label={booksByMonth.map((m) => `${m.label}: ${m.count}`).join(', ')}>
            {booksByMonth.map((m) => {
              const max = Math.max(4, ...booksByMonth.map((x) => x.count));
              return (
                <div key={m.key} className="month-bar" title={`${m.label}: ${m.count} book${m.count === 1 ? '' : 's'}`}>
                  <span className="month-value">{m.count || ''}</span>
                  <span className="month-fill" style={{ height: `${(m.count / max) * 100}%` }} />
                  <span className="month-label">{m.label}</span>
                </div>
              );
            })}
          </div>
          <p className="muted small">Reading growth is shown by the books themselves — see the Books page for levels and notes.</p>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Recent level changes" icon="sparkle">
          {changes.length === 0 ? (
            <EmptyState>No level changes in the last 30 days.</EmptyState>
          ) : (
            <ul className="change-list">
              {changes.map((c, i) => {
                const skill = getSkill(c.skillId);
                return (
                  <li key={i}>
                    <a href={`#/parent/curriculum/${c.skillId}`}>{skill?.name ?? c.skillId}</a>
                    <span className="change-arrow">
                      <LevelBadge level={c.from} /> → <LevelBadge level={c.to} />
                    </span>
                    <span className="muted small">{formatDay(dayFromTimestamp(c.at))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Milestones" icon="star">
          {milestones.length === 0 ? (
            <EmptyState>Milestones appear as {child.name} learns.</EmptyState>
          ) : (
            <ul className="milestone-list">
              {milestones.map((u) => {
                const r = getReward(u.rewardId);
                return (
                  <li key={u.id}>
                    <span className="milestone-icon">{r?.icon ?? '⭐'}</span>
                    <div>
                      <strong>{r?.name ?? u.rewardId}</strong>
                      <div className="muted small">
                        {formatDay(dayFromTimestamp(u.unlockedAt))} · {r?.hint ?? ''}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function DomainRow({ p, open, onToggle }: { p: DomainProfile; open: boolean; onToggle: () => void }) {
  const active = p.counts.introduced + p.counts.developing + p.counts.proficient + p.counts.mastered;
  return (
    <div className={`domain-row ${open ? 'open' : ''}`}>
      <button type="button" className="domain-head" onClick={onToggle} aria-expanded={open}>
        <span className="domain-dot" style={{ background: p.color }} />
        <span className="domain-name">{p.name}</span>
        <span className={`descriptor d-${p.descriptor.replace(/\s/g, '-')}`}>{p.descriptor}</span>
        <span className="domain-working muted small">{p.workingLabel}</span>
        <span className="domain-bar">
          <LevelBar counts={p.counts} total={p.skillCount} />
        </span>
        <span className="domain-count muted small">
          {active}/{p.skillCount} skills active
        </span>
      </button>
      {open && (
        <div className="strand-list">
          <p className="muted small">{DESCRIPTOR_NOTE[p.descriptor]}</p>
          <div className="table-scroll">
            <table className="data-table strand-table">
              <thead>
                <tr>
                  <th>Strand</th>
                  <th>Where she’s working</th>
                  <th className="hide-sm">Picture</th>
                  <th className="num">{MASTERY_LABELS.mastered}</th>
                  <th className="num">{MASTERY_LABELS.proficient}</th>
                  <th className="num">{MASTERY_LABELS.developing}</th>
                </tr>
              </thead>
              <tbody>
                {p.strands.map((s) => (
                  <tr key={s.strandId}>
                    <td>
                      <a href={`#/parent/curriculum/strand:${s.strandId}`}>{s.name}</a>
                      <div className={`descriptor small d-${s.descriptor.replace(/\s/g, '-')}`}>{s.descriptor}</div>
                    </td>
                    <td>{s.workingLabel}</td>
                    <td className="strand-bar hide-sm">
                      <LevelBar counts={s.counts} total={s.skillCount} />
                    </td>
                    <td className="num">{s.counts.mastered}</td>
                    <td className="num">{s.counts.proficient}</td>
                    <td className="num">{s.counts.developing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
