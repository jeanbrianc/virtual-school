import { useEffect, useState } from 'react';
import { usageJournal, type UsageService } from '../../../domain/usage';
import { Card } from '../components';

const LABELS: Record<UsageService, string> = {
  teacher: 'Teacher replies',
  interpretation: 'Activity interpretation',
  speech: 'Natural speech (including parent tests)',
  listening: 'Helper listening',
};

/** Mounted only inside the existing PIN-gated Parent Studio, with no reporting endpoint. */
export function UsageCard({ warningAt, onWarning }: { warningAt: number; onWarning: (count: number) => void }) {
  const [view, setView] = useState(() => usageJournal.snapshot());
  useEffect(() => usageJournal.subscribe(() => setView(usageJournal.snapshot())), []);
  const attempts = view.rows.reduce((n, r) => n + r.attempted, 0);
  const refresh = () => setView(usageJournal.snapshot());
  const exportView = () => {
    const snapshot = usageJournal.snapshot();
    setView(snapshot);
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              ...snapshot,
              scope:
                'Partial current UTC day in this tab since load or clear. Excludes other tabs, devices, earlier loads, helper workers and provider-side retries. Request outcomes are browser observations, not bills.',
              estimatedApiCost: null,
              verifiedProviderBilling: null,
              hostingCost: null,
              pricingVersion: null,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'classroom-tab-usage.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Card title="AI usage and costs" icon="chart">
      <div data-testid="usage-view">
        <p className="small">
          <strong>This tab only, partial day.</strong> Source: browser memory. Window: {view.windowStart} to {view.refreshedAt}. Timezone: UTC. Refresh time:{' '}
          {view.refreshedAt}.
        </p>
        <p className="muted small">
          Resets at UTC midnight, reload, or Clear. Excludes other tabs, devices, previous page loads, helper workers and cold starts. These are observed
          requests to the helper, not provider totals. A failed or cancelled request may still be billed.
        </p>
        <p className="small" data-testid="usage-attempts">
          {attempts} observed request attempts
        </p>
        {!view.rows.length && <p className="muted small">No requests observed in this window. Earlier usage is unknown.</p>}
        {view.rows.map((r) => (
          <section key={`${r.service}:${r.provider}:${r.model}`} className="small" aria-label={`${LABELS[r.service]} usage`}>
            <strong>{LABELS[r.service]}</strong>
            <p>
              Provider: {r.provider}. Model: {r.model}.
            </p>
            <p>
              Attempts: {r.attempted}; successful: {r.succeeded}; failed: {r.failed}; cancelled: {r.cancelled}; pending: {r.pending}. Cache hits: {r.cacheHits};
              built-in fallbacks: {r.fallbacks}.
            </p>
            <p>
              Provider-reported tokens:{' '}
              {r.reportedRequests ? `${r.inputTokens} input, ${r.outputTokens} output across ${r.reportedRequests} requests` : 'unknown'}. Usage units missing
              for {r.unknownUsage} completed requests. Pending usage is unknown. Cache and fallback events have no reported model.
            </p>
          </section>
        ))}
        <p className="small">
          Estimated API cost: unknown (no complete units or versioned pricing configured). Verified provider billing: unavailable. Hosting cost: unavailable.
          Token counts can omit billable categories; they are not an invoice.
        </p>
        <label>
          Warn in this view after observed attempts
          <select value={warningAt} onChange={(e) => onWarning(Number(e.target.value))} data-testid="usage-warning">
            <option value={0}>Off</option>
            <option value={10}>10 requests</option>
            <option value={50}>50 requests</option>
            <option value={100}>100 requests</option>
            <option value={300}>300 requests</option>
          </select>
        </label>
        {warningAt > 0 && attempts >= warningAt && (
          <p role="status">The {warningAt}-request warning has been reached in this tab. Review optional AI settings if you want to pause paid use.</p>
        )}
        <p className="muted small">
          This warning does not stop requests. Existing helper limits are per-process request throttles and reset on restart; they are not a durable household
          limit or a dollar spending cap. Built-in speech and offline lessons stay available.
        </p>
        <div className="form-actions">
          <button type="button" className="btn btn-small" onClick={refresh}>
            Refresh local usage
          </button>
          <button type="button" className="btn btn-small" onClick={exportView}>
            Export local usage
          </button>
          <button type="button" className="btn btn-small" onClick={() => usageJournal.clear()}>
            Clear local usage
          </button>
        </div>
        <p className="muted small">
          Only aggregate counters and allowlisted service/model labels are kept in memory. No names, book titles, prompts, transcripts, recordings or learner
          IDs are included. Nothing here is sent to analytics or synced. Export contains only these aggregates; Clear does not delete provider records or reset
          helper throttles. The Parent PIN is a child-facing gate, not protection from adults with device access.
        </p>
      </div>
    </Card>
  );
}
