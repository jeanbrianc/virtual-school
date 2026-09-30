/**
 * The family's AI helper — request handling (no sockets, so it's testable).
 *
 * Why a helper at all: an API key must never live in a web page. This small
 * server (on this computer, or the Lambda behind the family's site) holds the
 * key, builds every prompt itself (the page can't change the safety rules),
 * and only answers the family's own pages.
 *
 * Providers: OpenAI when an OpenAI key is configured (replies, natural teacher
 * voices, listening), otherwise Anthropic (replies only).
 *
 *   GET  /health         which features work (no key needed to ask)
 *   POST /v1/teacher     a teacher's reply to what she said          (JSON → JSON)
 *   POST /v1/interpret   a parent's narrative → learning evidence    (JSON → JSON)
 *   POST /v1/speak       a teacher line in that teacher's voice      (JSON → audio/mpeg)
 *   POST /v1/listen      her recording → words                       (JSON with base64 audio → JSON)
 */
import { buildInterpretRequest, buildTeacherRequest, DEFAULT_AI_MODEL, parseTeacherAiInput, toolInputFrom } from '../../src/domain/teachers/aiPrompt';
import {
  buildOpenAiInterpretRequest,
  buildOpenAiTeacherRequest,
  buildSpeechRequest,
  buildTranscriptionForm,
  DEFAULT_OPENAI_LISTEN_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_VOICE_MODEL,
  functionArgsFrom,
  MAX_AUDIO_BYTES,
  OPENAI_API,
  parseListenInput,
  parseSpeakInput,
  transcriptFrom,
} from './openai';
import { syncRoutes, type SyncStore } from './sync';

/** A key, or a function that fetches it (e.g. from AWS Secrets Manager) — called only when needed. */
export type KeySource = string | undefined | (() => Promise<string | undefined>);

export interface HelperConfig {
  /** Anthropic API key (replies only). */
  apiKey?: KeySource;
  /** OpenAI API key: replies, natural voices and listening. Used instead of Anthropic when present. */
  openaiKey?: KeySource;
  /** Reply models per provider (defaults: gpt-6-luna / claude-haiku-4-5). */
  models?: { openai?: string; anthropic?: string };
  voiceModel?: string;
  listenModel?: string;
  /** Extra allowed page origins besides http(s)://localhost / 127.0.0.1 on any port. */
  extraOrigins?: string[];
  /** Replies (and activity interpretations) per minute / per day. */
  perMinute?: number;
  perDay?: number;
  /** Spoken lines per day and recordings turned into words per day. */
  speakPerDay?: number;
  listenPerDay?: number;
  /** Family sync storage (DynamoDB + S3 on AWS). Without it, /v1/sync… answers 404. */
  syncStore?: SyncStore;
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
  /** Text (JSON) or audio bytes. */
  body: string | Uint8Array;
}

export type Provider = 'openai' | 'anthropic';

const LOCAL_ORIGIN = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/;
const MAX_JSON_BODY = 32 * 1024;
/** Base64 grows audio by a third, plus a little JSON. */
export const MAX_LISTEN_BODY = Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 8 * 1024;
/** A sync batch or a photo (base64) — under Lambda's 6 MB request limit. */
export const MAX_SYNC_BODY = 5_700_000;
/** The largest request any route accepts (for servers that read the body first). */
export const MAX_BODY = Math.max(MAX_LISTEN_BODY, MAX_SYNC_BODY);
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** A sliding per-minute window plus a daily count. */
function limiter(perMinute: number, perDay: number, now: () => number) {
  const recent: number[] = [];
  let day = new Date(now()).toDateString();
  let count = 0;
  return {
    take(): boolean {
      const t = now();
      const today = new Date(t).toDateString();
      if (today !== day) {
        day = today;
        count = 0;
      }
      while (recent.length && t - recent[0]! > 60_000) recent.shift();
      if (recent.length >= perMinute || count >= perDay) return false;
      recent.push(t);
      count += 1;
      return true;
    },
    get today() {
      return count;
    },
  };
}

function keyGetter(source: KeySource, log: (m: string) => void): () => Promise<string | undefined> {
  if (typeof source !== 'function') return async () => source || undefined;
  return async () => {
    try {
      return (await source()) || undefined;
    } catch (err) {
      log(`couldn't load an API key: ${err instanceof Error ? err.message : 'unknown error'}`);
      return undefined;
    }
  };
}

function upstreamError(status: number): { status: number; error: string } {
  if (status === 401 || status === 403) return { status: 502, error: 'The API key was rejected.' };
  if (status === 429) return { status: 429, error: 'The AI service is busy or out of credit. Try again later.' };
  return { status: 502, error: `The AI service answered ${status}.` };
}

/** Only allowlisted categories leave the provider boundary; never forward its body. */
async function voiceFailure(res: Response, now: number) {
  let code = '';
  try {
    const body = (await res.json()) as { error?: { code?: unknown; type?: unknown } };
    const values = [body.error?.code, body.error?.type];
    if (values.includes('insufficient_quota') || values.includes('billing_hard_limit_reached')) code = 'provider_quota';
    else if (values.includes('rate_limit_exceeded')) code = 'provider_rate_limit';
  } catch {
    /* Unknown upstream body stays unknown. */
  }
  const category = res.status === 429 ? code || 'provider_429' : res.status === 401 || res.status === 403 ? 'provider_auth' : 'provider_error';
  const retry = res.headers.get('retry-after');
  const seconds = retry ? (/^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) : (Date.parse(retry) - now) / 1000) : 60;
  const retryAfterSeconds = category === 'provider_quota' ? 900 : Math.max(1, Math.min(900, Number.isFinite(seconds) ? Math.ceil(seconds) : 60));
  const error =
    category === 'provider_quota'
      ? 'OpenAI voice quota or credit is exhausted. Check the OpenAI project billing and budget, then test again. Built-in voices still work.'
      : category === 'provider_rate_limit'
        ? 'OpenAI voices are temporarily rate limited. Wait a moment, then test again. Built-in voices still work.'
        : category === 'provider_429'
          ? 'OpenAI rejected the voice request with 429; the cause is unknown. Check project credit and rate limits. Built-in voices still work.'
          : upstreamError(res.status).error;
  const requestId = res.headers.get('x-request-id');
  return {
    status: res.status === 429 ? 429 : 502,
    category,
    error,
    retryAfterSeconds,
    ...(requestId && /^req_[A-Za-z0-9_-]{1,100}$/.test(requestId) ? { requestId } : {}),
  };
}

export function createHelper(config: HelperConfig) {
  const fetchImpl = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = config.now ?? (() => Date.now());
  const log = config.log ?? (() => undefined);
  const anthropicKey = keyGetter(config.apiKey, log);
  const openaiKey = keyGetter(config.openaiKey, log);
  const replies = limiter(config.perMinute ?? 20, config.perDay ?? 300, now);
  let voiceCooldown: { until: number; failure: Awaited<ReturnType<typeof voiceFailure>> } | null = null;
  const speaking = limiter(60, config.speakPerDay ?? 1500, now);
  const syncing = limiter(240, 50_000, now);
  const sync = config.syncStore ? syncRoutes(config.syncStore, now) : null;
  const listening = limiter(20, config.listenPerDay ?? 500, now);

  /** The provider in use right now (OpenAI wins when both keys exist). */
  async function provider(): Promise<{ provider: Provider; key: string } | null> {
    const o = await openaiKey();
    if (o) return { provider: 'openai', key: o };
    const a = await anthropicKey();
    return a ? { provider: 'anthropic', key: a } : null;
  }
  const replyModel = (p: Provider) => (p === 'openai' ? config.models?.openai || DEFAULT_OPENAI_MODEL : config.models?.anthropic || DEFAULT_AI_MODEL);

  const originAllowed = (origin: string | undefined) => !origin || LOCAL_ORIGIN.test(origin) || (config.extraOrigins ?? []).includes(origin);
  const cors = (origin?: string): Record<string, string> => (origin && originAllowed(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});

  const respond = (status: number, body: unknown, origin?: string): HelperResponse => ({
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) },
    body: JSON.stringify(body),
  });

  async function callClaude(key: string, body: Record<string, unknown>, toolName: string): Promise<Result<unknown>> {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, ...upstreamError(res.status) };
    const input = toolInputFrom(await res.json(), toolName);
    return input ? { ok: true, value: input } : { ok: false, status: 502, error: 'The AI service returned no reply.' };
  }

  async function callOpenAiFunction(key: string, body: Record<string, unknown>, fnName: string): Promise<Result<unknown>> {
    const res = await fetchImpl(`${OPENAI_API}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, ...upstreamError(res.status) };
    const args = functionArgsFrom(await res.json(), fnName);
    return args ? { ok: true, value: args } : { ok: false, status: 502, error: 'The AI service returned no reply.' };
  }

  async function health(origin?: string): Promise<HelperResponse> {
    const p = await provider();
    const openai = p?.provider === 'openai';
    return respond(
      200,
      {
        ok: true,
        keyConfigured: !!p,
        provider: p?.provider ?? null,
        model: p ? replyModel(p.provider) : null,
        voices: openai,
        listening: openai,
        sync: !!sync,
        ...(openai ? { voiceModel: config.voiceModel || DEFAULT_OPENAI_VOICE_MODEL, listenModel: config.listenModel || DEFAULT_OPENAI_LISTEN_MODEL } : {}),
      },
      origin,
    );
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
    // Only the family's pages, and only our app (the custom header forces a CORS preflight).
    if (!originAllowed(origin)) return respond(403, { error: 'This helper only answers the family’s own pages.' });
    if (req.headers['x-izzy-classroom'] !== '1') return respond(400, { error: 'Missing X-Izzy-Classroom header.' }, origin);

    if (req.method === 'GET' && req.path === '/health') return health(origin);

    // ── Family sync (works without any AI key) ─────────────────────────────
    if (req.path === '/v1/sync' || req.path.startsWith('/v1/sync/')) {
      if (!sync) return respond(404, { error: 'Family sync isn’t set up on this helper.' }, origin);
      if ((req.body?.length ?? 0) > MAX_SYNC_BODY) return respond(413, { error: 'Too large.' }, origin);
      if (!syncing.take()) return respond(429, { error: 'Syncing too often — try again in a minute.' }, origin);
      let bad = false;
      const parsed = () => {
        try {
          return JSON.parse(req.body ?? '') as unknown;
        } catch {
          bad = true;
          return null;
        }
      };
      try {
        const reply = await sync(req.method, req.path, parsed);
        if (bad) return respond(400, { error: 'Invalid JSON.' }, origin);
        if (!reply) return respond(404, { error: 'Not found' }, origin);
        if (reply.bytes) {
          return {
            status: reply.status,
            headers: { 'Content-Type': reply.bytes.type, 'Cache-Control': 'private, max-age=31536000, immutable', ...cors(origin) },
            body: reply.bytes.data,
          };
        }
        return respond(reply.status, reply.json, origin);
      } catch (err) {
        log(`sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        return respond(502, { error: 'Couldn’t reach the family’s saved school. Try again in a minute.' }, origin);
      }
    }
    const routes = ['/v1/teacher', '/v1/interpret', '/v1/speak', '/v1/listen'];
    if (req.method !== 'POST' || !routes.includes(req.path)) return respond(404, { error: 'Not found' }, origin);
    const maxBody = req.path === '/v1/listen' ? MAX_LISTEN_BODY : MAX_JSON_BODY;
    if ((req.body?.length ?? 0) > maxBody) return respond(413, { error: 'Too large.' }, origin);

    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body ?? '');
    } catch {
      return respond(400, { error: 'Invalid JSON.' }, origin);
    }

    const p = await provider();
    if (!p) return respond(503, { error: 'No API key configured.' }, origin);

    try {
      // ── Natural voices ───────────────────────────────────────────────────
      if (req.path === '/v1/speak') {
        if (p.provider !== 'openai') return respond(501, { error: 'Natural voices need an OpenAI key.' }, origin);
        const input = parseSpeakInput(parsed);
        if (!input) return respond(400, { error: 'Invalid speak request.' }, origin);
        if (voiceCooldown && voiceCooldown.until > now()) {
          return respond(
            voiceCooldown.failure.status,
            { ...voiceCooldown.failure, retryAfterSeconds: Math.ceil((voiceCooldown.until - now()) / 1000) },
            origin,
          );
        }
        if (!speaking.take())
          return respond(
            429,
            { error: 'Daily or per-minute voice limit reached. Built-in voices still work.', category: 'helper_limit', retryAfterSeconds: 60 },
            origin,
          );
        const res = await fetchImpl(`${OPENAI_API}/audio/speech`, {
          method: 'POST',
          headers: { authorization: `Bearer ${p.key}`, 'content-type': 'application/json' },
          body: JSON.stringify(buildSpeechRequest(input, config.voiceModel || DEFAULT_OPENAI_VOICE_MODEL)),
        });
        if (!res.ok) {
          const e = await voiceFailure(res, now());
          if (res.status === 429) voiceCooldown = { until: now() + e.retryAfterSeconds * 1000, failure: e };
          log(`voice failed status=${res.status} category=${e.category}${e.requestId ? ` request_id=${e.requestId}` : ''}`);
          return respond(e.status, e, origin);
        }
        const audio = new Uint8Array(await res.arrayBuffer());
        log(`voice (${input.teacherId}) ${input.text.length} chars — ${speaking.today} today`);
        return {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', ...cors(origin) },
          body: audio,
        };
      }

      // ── Listening ────────────────────────────────────────────────────────
      if (req.path === '/v1/listen') {
        if (p.provider !== 'openai') return respond(501, { error: 'Listening needs an OpenAI key.' }, origin);
        const input = parseListenInput(parsed);
        if ('error' in input) return respond(400, { error: input.error }, origin);
        if (!listening.take()) return respond(429, { error: 'Daily or per-minute listening limit reached.' }, origin);
        const res = await fetchImpl(`${OPENAI_API}/audio/transcriptions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${p.key}` },
          body: buildTranscriptionForm(input, config.listenModel || DEFAULT_OPENAI_LISTEN_MODEL),
        });
        if (!res.ok) {
          const e = upstreamError(res.status);
          log(`listening failed ${res.status}`);
          return respond(e.status, { error: e.error }, origin);
        }
        const text = transcriptFrom(await res.json());
        log(`listening ${text ? 'ok' : 'empty'} — ${listening.today} today`);
        return respond(200, { text: text ?? '' }, origin);
      }

      // ── Replies ──────────────────────────────────────────────────────────
      if (!replies.take()) return respond(429, { error: 'Daily or per-minute limit reached.' }, origin);
      const model = replyModel(p.provider);
      if (req.path === '/v1/teacher') {
        const input = parseTeacherAiInput(parsed);
        if (!input) return respond(400, { error: 'Invalid teacher request.' }, origin);
        const result =
          p.provider === 'openai'
            ? await callOpenAiFunction(p.key, buildOpenAiTeacherRequest(input, model), 'teacher_reply')
            : await callClaude(p.key, buildTeacherRequest(input, model), 'teacher_reply');
        log(`teacher reply (${input.teacherId}, ${p.provider}) ${result.ok ? 'ok' : 'failed'} — ${replies.today} today`);
        return result.ok ? respond(200, result.value, origin) : respond(result.status, { error: result.error }, origin);
      }
      const b = parsed as { narrative?: unknown; childFirstName?: unknown; today?: unknown };
      if (typeof b.narrative !== 'string' || !b.narrative.trim()) return respond(400, { error: 'Missing narrative.' }, origin);
      const name = typeof b.childFirstName === 'string' ? b.childFirstName : 'the child';
      const today = typeof b.today === 'string' ? b.today : new Date(now()).toISOString().slice(0, 10);
      const result =
        p.provider === 'openai'
          ? await callOpenAiFunction(p.key, buildOpenAiInterpretRequest(b.narrative, name, today, model), 'record_learning')
          : await callClaude(p.key, buildInterpretRequest(b.narrative, name, today, model), 'record_learning');
      log(`activity interpretation (${p.provider}) ${result.ok ? 'ok' : 'failed'} — ${replies.today} today`);
      return result.ok ? respond(200, result.value, origin) : respond(result.status, { error: result.error }, origin);
    } catch {
      return respond(502, { error: 'Could not reach the AI service.' }, origin);
    }
  };
}
