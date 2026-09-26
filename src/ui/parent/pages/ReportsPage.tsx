import { useRef, useState } from 'react';
import { navigate } from '../../../app/router';
import { useLiveQuery, useServices } from '../../../app/services';
import type { ReportAudience, ReportPeriodKind, ReportRecord } from '../../../domain/types';
import { addDays, dayFromTimestamp, endOfMonth, formatDay, startOfMonth, startOfWeek, toDay } from '../../../domain/util/time';
import { createReport } from '../../../services/householdService';
import { Icon } from '../../shared/Icon';
import { Card, EmptyState, PageHeader } from '../components';
import type { ParentData } from '../ParentApp';
import { exportReportHtml, ReportDocument } from '../report/ReportDocument';

type PeriodChoice = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'last-3-months' | 'custom';

const PERIODS: { id: PeriodChoice; label: string }[] = [
  { id: 'this-week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-3-months', label: 'Last 3 months' },
  { id: 'custom', label: 'Custom dates' },
];

export function resolvePeriod(
  choice: PeriodChoice,
  today: string,
  custom: { start: string; end: string },
): { start: string; end: string; kind: ReportPeriodKind } {
  switch (choice) {
    case 'this-week':
      return { start: startOfWeek(today), end: today, kind: 'week' };
    case 'last-week': {
      const s = addDays(startOfWeek(today), -7);
      return { start: s, end: addDays(s, 6), kind: 'week' };
    }
    case 'this-month':
      return { start: startOfMonth(today), end: today, kind: 'month' };
    case 'last-month': {
      const s = startOfMonth(addDays(startOfMonth(today), -1));
      return { start: s, end: endOfMonth(s), kind: 'month' };
    }
    case 'last-3-months': {
      // The current month plus the two before it.
      const prev = startOfMonth(addDays(startOfMonth(today), -1));
      return { start: startOfMonth(addDays(prev, -1)), end: today, kind: 'custom' };
    }
    default:
      return { start: custom.start <= custom.end ? custom.start : custom.end, end: custom.start <= custom.end ? custom.end : custom.start, kind: 'custom' };
  }
}

export function ReportsPage({ data, param }: { data: ParentData; param?: string }) {
  const { ctx } = useServices();
  const reports = useLiveQuery(
    () => ctx.repos.forChild(ctx.repos.reports, data.child.id).then((r) => r.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [data.child.id],
    ['reports'],
  );
  if (param) {
    const report = reports?.find((r) => r.id === param);
    if (!reports) return <div className="p-loading">Loading…</div>;
    if (!report) return <EmptyState>That report wasn’t found.</EmptyState>;
    return <ReportView report={report} data={data} />;
  }
  return <ReportsHome data={data} reports={reports ?? []} />;
}

function ReportsHome({ data, reports }: { data: ParentData; reports: ReportRecord[] }) {
  const { ctx } = useServices();
  const today = toDay(new Date());
  const [audience, setAudience] = useState<ReportAudience>('parent');
  const [period, setPeriod] = useState<PeriodChoice>('this-month');
  const [custom, setCustom] = useState({ start: addDays(today, -30), end: today });
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const p = resolvePeriod(period, today, custom);
      const r = await createReport(ctx, data.child.id, { audience, periodKind: p.kind, start: p.start, end: p.end });
      navigate({ name: 'parent', section: 'reports', param: r.id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Reports" subtitle="Generated on this device from your records. Each saved report is a snapshot — later changes don’t alter it." />
      <Card title="Create a report" icon="report">
        <div className="report-form">
          <fieldset className="audience-pick">
            <legend>Who is it for?</legend>
            <label className={`audience-card ${audience === 'parent' ? 'selected' : ''}`}>
              <input type="radio" name="aud" value="parent" checked={audience === 'parent'} onChange={() => setAudience('parent')} />
              <strong>📋 Homeschool record</strong>
              <span className="muted small">Detailed evidence, mastery levels and standards alignment — for your files, evaluators or portfolio reviews.</span>
            </label>
            <label className={`audience-card ${audience === 'family' ? 'selected' : ''}`}>
              <input type="radio" name="aud" value="family" checked={audience === 'family'} onChange={() => setAudience('family')} data-testid="aud-family" />
              <strong>💌 Family update</strong>
              <span className="muted small">Warm, photo-friendly, no jargon — perfect for grandparents.</span>
            </label>
          </fieldset>
          <div className="period-pick">
            <label htmlFor="period">Period</label>
            <select id="period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodChoice)} data-testid="report-period">
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {period === 'custom' && (
              <div className="date-range">
                <input type="date" value={custom.start} max={today} onChange={(e) => setCustom({ ...custom, start: e.target.value })} aria-label="Start date" />
                <span>to</span>
                <input type="date" value={custom.end} max={today} onChange={(e) => setCustom({ ...custom, end: e.target.value })} aria-label="End date" />
              </div>
            )}
            <p className="muted small">
              {(() => {
                const p = resolvePeriod(period, today, custom);
                return `${formatDay(p.start, 'long')} – ${formatDay(p.end, 'long')}`;
              })()}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={busy} data-testid="report-generate">
              <Icon name="sparkle" size={16} /> {busy ? 'Writing…' : 'Generate report'}
            </button>
          </div>
        </div>
      </Card>

      <Card title="Saved reports" icon="list">
        {reports.length === 0 ? (
          <EmptyState>No reports yet.</EmptyState>
        ) : (
          <ul className="report-list">
            {reports.map((r) => (
              <li key={r.id}>
                <a href={`#/parent/reports/${r.id}`}>
                  <span className="report-icon">{r.audience === 'family' ? '💌' : '📋'}</span>
                  <span>
                    <strong>{r.content.headline}</strong>
                    <span className="muted small">
                      {r.audience === 'family' ? 'Family update' : 'Homeschool record'} · created {formatDay(dayFromTimestamp(r.createdAt))}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ReportView({ report, data }: { report: ReportRecord; data: ParentData }) {
  const { ctx } = useServices();
  const docRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const download = async () => {
    const el = docRef.current?.querySelector<HTMLElement>('.report-doc');
    if (!el) return;
    const blob = await exportReportHtml(el, report.content.headline, (id) => ctx.repos.media.get(id).then((m) => m?.blob));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.child.name}-${report.audience}-report-${report.periodStart}.html`.replace(/\s+/g, '-').toLowerCase();
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    setMsg('Downloaded a self-contained web page — it opens in any browser and can be attached to an email.');
  };

  const copyText = async () => {
    const c = report.content;
    const text = [
      c.headline,
      c.periodLabel,
      '',
      ...c.narrative,
      '',
      ...(c.reading.completed.length ? ['Books:', ...c.reading.completed.map((b) => `• ${b.title} — ${b.author}`)] : []),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Summary copied — paste it into an email or message.');
    } catch {
      setMsg('Copy isn’t available in this browser.');
    }
  };

  return (
    <div className="page report-page">
      <div className="report-toolbar no-print">
        <a className="back-link" href="#/parent/reports">
          <Icon name="back" size={16} /> All reports
        </a>
        <div className="report-actions">
          <button type="button" className="btn" onClick={() => window.print()}>
            <Icon name="print" size={16} /> Print / PDF
          </button>
          <button type="button" className="btn" onClick={() => void download()} data-testid="report-download">
            <Icon name="download" size={16} /> Download
          </button>
          <button type="button" className="btn" onClick={() => void copyText()}>
            <Icon name="pencil" size={16} /> Copy text
          </button>
          {!confirm ? (
            <button type="button" className="btn btn-ghost danger" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={16} /> Delete
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                void ctx.repos.reports.delete(report.id).then(() => navigate({ name: 'parent', section: 'reports' }));
              }}
            >
              Confirm delete
            </button>
          )}
        </div>
      </div>
      {msg && (
        <div className="notice success no-print" role="status">
          <Icon name="check" size={16} /> {msg}
        </div>
      )}
      <div ref={docRef}>
        <ReportDocument content={report.content} books={data.records.books} avatar={data.avatar} />
      </div>
    </div>
  );
}
