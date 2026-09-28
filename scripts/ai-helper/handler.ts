/**
 * The family's local AI helper — request handling (no sockets, so it's testable).
 *
 * Why a helper at all: an API key must never live in a web page. This tiny
 * server runs on the same computer as the app, keeps the key in .env.local,
 * builds every prompt itself (the page can't change the safety rules), and
 * only answers pages served from this computer.
 */
import { buildInterpretRequest, buildTeacherRequest, DEFAULT_AI_MODEL, parseTeacherAiInput, toolInputFrom } from '../../src/domain/teachers/aiPrompt';

export interface HelperConfig {
  apiKey: string | undefined;
  model?: string;
  /** Extra allowed page origins besides http(s)://localhost / 127.0.0.1 on any port. */
  extraOrigins?: string[];
  perMinute?: number;
  perDay?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: (msg: string) => void;
}

export interface HelperRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string;
}

export interface HelperResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const LOCAL_ORIGIN = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/;
const MAX_BODY = 32 * 1024;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function createHelper(config: HelperConfig) {
  const model = config.model || DEFAULT_AI_MODEL;
  const fetchImpl = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = config.now ?? (() => Date.now());
  const log = config.log ?? (() => undefined);
  const perMinute = config.perMinute ?? 20;
  const perDay = config.perDay ?? 300;
  const recent: number[] = [];
  let day = new Date(now()).toDateString();
  let dayCount = 0;

  const originAllowed = (origin: string | undefined) => !origin || LOCAL_ORIGIN.test(origin) || (config.extraOrigins ?? []).includes(origin);

  const respond = (status: number, body: unknown, origin?: string): HelperResponse => ({
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(origin && originAllowed(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    },
    body: JSON.stringify(body),
  });

  const underLimit = (): boolean => {
    const t = now();
    const today = new Date(t).toDateString();
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
    while (recent.length && t - recent[0]! > 60_000) recent.shift();
    if (recent.length >= perMinute || dayCount >= perDay) return false;
    recent.push(t);
    dayCount += 1;
    return true;
  };

  async function callClaude(
    body: Record<string, unknown>,
    toolName: string,
  ): Promise<{ ok: true; input: unknown } | { ok: false; status: number; error: string }> {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': config.apiKey ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const status = res.status === 401 || res.status === 403 ? 502 : res.status === 429 ? 429 : 502;
      return { ok: false, status, error: res.status === 401 ? 'The API key was rejected.' : `The AI service answered ${res.status}.` };
    }
    const input = toolInputFrom(await res.json(), toolName);
    return input ? { ok: true, input } : { ok: false, status: 502, error: 'The AI service returned no reply.' };
  }

  return async function handle(req: HelperRequest): Promise<HelperResponse> {
    const origin = req.headers['origin'];
    if (req.method === 'OPTIONS') {
      if (!originAllowed(origin)) return { status: 403, headers: {}, body: '' };
      return {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type, X-Izzy-Classroom',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        },
        body: '',
      };
    }
    // Only pages from this computer, and only our app (the custom header forces a CORS preflight).
    if (!originAllowed(origin)) return respond(403, { error: 'This helper only answers pages on this computer.' });
    if (req.headers['x-izzy-classroom'] !== '1') return respond(400, { error: 'Missing X-Izzy-Classroom header.' }, origin);

    if (req.method === 'GET' && req.path === '/health') return respond(200, { ok: true, keyConfigured: !!config.apiKey, model }, origin);
    if (req.method !== 'POST' || (req.path !== '/v1/teacher' && req.path !== '/v1/interpret')) return respond(404, { error: 'Not found' }, origin);
    if (!config.apiKey) return respond(503, { error: 'No API key configured.' }, origin);
    if ((req.body?.length ?? 0) > MAX_BODY) return respond(413, { error: 'Too large.' }, origin);

    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body ?? '');
    } catch {
      return respond(400, { error: 'Invalid JSON.' }, origin);
    }
    if (!underLimit()) return respond(429, { error: 'Daily or per-minute limit reached.' }, origin);

    try {
      if (req.path === '/v1/teacher') {
        const input = parseTeacherAiInput(parsed);
        if (!input) return respond(400, { error: 'Invalid teacher request.' }, origin);
        const result = await callClaude(buildTeacherRequest(input, model), 'teacher_reply');
        log(`teacher reply (${input.teacherId}) ${result.ok ? 'ok' : 'failed'} — ${dayCount} today`);
        return result.ok ? respond(200, result.input, origin) : respond(result.status, { error: result.error }, origin);
      }
      const b = parsed as { narrative?: unknown; childFirstName?: unknown; today?: unknown };
      if (typeof b.narrative !== 'string' || !b.narrative.trim()) return respond(400, { error: 'Missing narrative.' }, origin);
      const result = await callClaude(
        buildInterpretRequest(
          b.narrative,
          typeof b.childFirstName === 'string' ? b.childFirstName : 'the child',
          typeof b.today === 'string' ? b.today : new Date(now()).toISOString().slice(0, 10),
          model,
        ),
        'record_learning',
      );
      log(`activity interpretation ${result.ok ? 'ok' : 'failed'} — ${dayCount} today`);
      return result.ok ? respond(200, result.input, origin) : respond(result.status, { error: result.error }, origin);
    } catch {
      return respond(502, { error: 'Could not reach the AI service.' }, origin);
    }
  };
}
