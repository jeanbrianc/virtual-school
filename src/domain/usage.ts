/** Content-free, tab-memory observations. Never a provider ledger or a spending cap. */
export type UsageService = 'teacher' | 'interpretation' | 'speech' | 'listening';
export type UsageOutcome = 'succeeded' | 'failed' | 'cancelled';
export const USAGE_HEADER = 'X-Classroom-Usage';
const MODELS = [
  'gpt-6-luna',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'gpt-4o-mini-tts',
  'gpt-4o-mini-tts-2025-03-20',
  'gpt-4o-mini-tts-2025-12-15',
  'gpt-transcribe',
  'gpt-realtime-2.1-mini',
] as const;
export interface UsageReceipt {
  provider: 'openai' | 'anthropic' | 'unreported';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}
export const usageModel = (value: unknown): string => (typeof value === 'string' && MODELS.includes(value as (typeof MODELS)[number]) ? value : 'unreported');
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
/** Allowlisted numbers/labels only, even when an advanced custom endpoint returns arbitrary headers. */
export function readUsageReceipt(header: string | null): UsageReceipt {
  const unknown: UsageReceipt = { provider: 'unreported', model: 'unreported' };
  if (!header || header.length > 512) return unknown;
  try {
    const value = JSON.parse(header) as Record<string, unknown>;
    if (!value || typeof value !== 'object') return unknown;
    return {
      provider: value.provider === 'openai' || value.provider === 'anthropic' ? value.provider : 'unreported',
      model: usageModel(value.model),
      ...(count(value.inputTokens) ? { inputTokens: value.inputTokens } : {}),
      ...(count(value.outputTokens) ? { outputTokens: value.outputTokens } : {}),
    };
  } catch {
    return unknown;
  }
}
export interface UsageRow extends UsageReceipt {
  service: UsageService;
  attempted: number;
  pending: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  cacheHits: number;
  fallbacks: number;
  reportedRequests: number;
  unknownUsage: number;
}
export function createUsageJournal(now = () => Date.now()) {
  let start = now();
  let day = new Date(start).toISOString().slice(0, 10);
  let epoch = 0;
  const rows = new Map<string, UsageRow>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const current = () => {
    const next = new Date(now()).toISOString().slice(0, 10);
    if (next !== day) {
      day = next;
      start = now();
      rows.clear();
      epoch += 1;
    }
  };
  const row = (service: UsageService, receipt: UsageReceipt = { provider: 'unreported', model: 'unreported' }) => {
    const key = `${service}:${receipt.provider}:${receipt.model}`;
    if (!rows.has(key))
      rows.set(key, {
        service,
        provider: receipt.provider,
        model: receipt.model,
        attempted: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        cacheHits: 0,
        fallbacks: 0,
        reportedRequests: 0,
        unknownUsage: 0,
      });
    return rows.get(key)!;
  };
  return {
    begin(service: UsageService) {
      current();
      const generation = epoch;
      const initial = row(service);
      initial.attempted += 1;
      initial.pending += 1;
      notify();
      let finished = false;
      return (outcome: UsageOutcome, header: string | null = null) => {
        if (finished) return;
        finished = true;
        current();
        // Cleared/previous-day observations cannot repopulate the new window.
        if (generation !== epoch) return;
        const receipt = readUsageReceipt(header);
        const final = row(service, receipt);
        initial.attempted -= 1;
        initial.pending -= 1;
        final.attempted += 1;
        final[outcome] += 1;
        if (receipt.inputTokens !== undefined && receipt.outputTokens !== undefined) {
          final.reportedRequests += 1;
          final.inputTokens = (final.inputTokens ?? 0) + receipt.inputTokens;
          final.outputTokens = (final.outputTokens ?? 0) + receipt.outputTokens;
        } else final.unknownUsage += 1;
        notify();
      };
    },
    event(service: UsageService, event: 'cacheHits' | 'fallbacks') {
      current();
      row(service)[event] += 1;
      notify();
    },
    snapshot() {
      current();
      return {
        version: 1,
        source: 'this-tab-memory',
        timezone: 'UTC',
        windowStart: new Date(start).toISOString(),
        refreshedAt: new Date(now()).toISOString(),
        rows: [...rows.values()].filter((r) => r.attempted || r.cacheHits || r.fallbacks).map((r) => ({ ...r })),
      };
    },
    clear() {
      rows.clear();
      start = now();
      day = new Date(start).toISOString().slice(0, 10);
      epoch += 1;
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export const usageJournal = createUsageJournal();
