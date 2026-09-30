/**
 * AI teachers through the family's own helper (scripts/ai-helper — on this
 * computer, or /api on the family's site), which uses OpenAI or Anthropic.
 *
 * Used only when a parent turns it on in Settings and consents. The browser
 * sends: which teacher, her first name, what she just said, the last few
 * turns, and her book titles. Never audio, photos, birthdays or records.
 * Safety concerns are handled on-device first, replies are validated and
 * sanitized, and any problem falls back to the on-device teacher.
 */
import type { TeacherAiSettings } from '../types';
import {
  answerToFinishedQuestion,
  LocalTeacherChat,
  localTeacherReply,
  understand,
  validateTeacherReply,
  type TeacherChatReply,
  type TeacherChatRequest,
  type TeacherChatService,
} from './chat';

/** Same-site paths ("/api"), loopback helpers over plain http, or any https address. */
export function isAllowedHelperUrl(endpoint: string): boolean {
  if (/^\/(?!\/)/.test(endpoint)) return true;
  try {
    const u = new URL(endpoint);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]');
  } catch {
    return false;
  }
}

export const HELPER_HEADER = 'X-Izzy-Classroom';

export class HttpTeacherChat implements TeacherChatService {
  readonly id = 'ai-helper';
  readonly sendsDataOffDevice = true;
  private readonly local = new LocalTeacherChat();

  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 12_000,
  ) {}

  async respond(req: TeacherChatRequest): Promise<TeacherChatReply> {
    // Safety first, on-device: a worried child gets the same careful answer every time.
    const lastTeacher = [...req.history].reverse().find((h) => h.speaker === 'teacher')?.text ?? '';
    if (understand(req.utterance, lastTeacher).intent === 'safety') return this.local.respond(req);
    if (!isAllowedHelperUrl(this.endpoint)) return this.local.respond(req);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.endpoint.replace(/\/+$/, '')}/v1/teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [HELPER_HEADER]: '1' },
        body: JSON.stringify({
          teacherId: req.teacherId,
          childName: req.childName,
          utterance: req.utterance,
          history: req.history.slice(-8),
          bookTitles: req.books.map((b) => b.title).slice(0, 20),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reply = validateTeacherReply(await res.json(), req);
      if (!reply) throw new Error('Invalid reply');
      // Fill gaps from the on-device reading: the book she named, and a plain
      // "yes" / "not yet" to "did you read the whole book?".
      const local = localTeacherReply(req);
      const answered = req.topic ? answerToFinishedQuestion(req.utterance, lastTeacher) : null;
      return {
        ...reply,
        ...(!reply.book && local.book && reply.intent !== 'share' && reply.intent !== 'unclear' ? { book: local.book } : {}),
        ...(reply.finished === null && answered !== null ? { finished: answered } : {}),
      };
    } catch {
      return this.local.respond(req);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** What the helper said about itself. */
export interface HelperStatus {
  ok: boolean;
  message: string;
  model?: string;
  provider?: 'openai' | 'anthropic';
  /** Natural teacher voices available (OpenAI). */
  voices: boolean;
  /** Listening (her recording → words) available (OpenAI). */
  listening: boolean;
}

export const PROVIDER_NAMES = { openai: 'OpenAI', anthropic: 'Anthropic' } as const;

/** Asks the helper whether it's running, which AI service it uses, and what it can do. */
export async function checkHelper(endpoint: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): Promise<HelperStatus> {
  const off = { voices: false, listening: false };
  if (!isAllowedHelperUrl(endpoint))
    return { ok: false, ...off, message: 'Use /api for this website’s helper, http://127.0.0.1:… for a helper on this computer, or an https:// address.' };
  const hosted = endpoint.startsWith('/');
  try {
    const res = await fetchImpl(`${endpoint.replace(/\/+$/, '')}/health`, { headers: { [HELPER_HEADER]: '1' } });
    const body = (await res.json()) as { ok?: boolean; model?: string; keyConfigured?: boolean; provider?: unknown; voices?: unknown; listening?: unknown };
    if (!body.keyConfigured)
      return {
        ok: false,
        ...off,
        message: hosted
          ? 'This website’s AI helper has no API key yet. Run npm run deploy:aws -- --openai-secret <secret ARN> (or -- --api-key for Anthropic).'
          : 'The helper is running but has no API key. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) to .env.local and restart npm run dev.',
      };
    const provider = body.provider === 'openai' || body.provider === 'anthropic' ? body.provider : undefined;
    const voices = body.voices === true;
    const listening = body.listening === true;
    const who = provider ? `${PROVIDER_NAMES[provider]}${body.model ? ` (${body.model})` : ''}` : (body.model ?? 'the AI service');
    const extras = voices && listening ? ' Natural voices and listening are configured; not tested.' : '';
    return {
      ok: !!body.ok,
      voices,
      listening,
      ...(provider ? { provider } : {}),
      ...(body.model ? { model: body.model } : {}),
      message: `Connected to helper — ${who} is configured; provider requests are not tested.${extras}`,
    };
  } catch {
    return {
      ok: false,
      ...off,
      message: hosted
        ? 'Can’t reach this website’s AI helper. See docs/DEPLOY.md (the AWS stack deploys it).'
        : 'Can’t reach the helper. Start the app with npm run dev after adding your API key to .env.local.',
    };
  }
}

/** Natural teacher voices: a parent turned them on and the helper address is valid. */
export function naturalVoicesOn(settings: TeacherAiSettings | undefined): boolean {
  return !!settings?.naturalVoices && isAllowedHelperUrl(settings.endpoint);
}

/** On-device teachers unless a parent turned AI teachers on, consented, and gave a valid helper address. */
export function createTeacherChat(settings: TeacherAiSettings | undefined): TeacherChatService {
  if (settings?.enabled && settings.consentToSend && isAllowedHelperUrl(settings.endpoint)) return new HttpTeacherChat(settings.endpoint);
  return new LocalTeacherChat();
}

/** Parent-triggered nonpersonal sample; never called by a passive connection check. */
export async function testNaturalVoice(endpoint: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): Promise<{ message: string; audio?: Blob }> {
  if (!isAllowedHelperUrl(endpoint)) return { message: 'Choose a valid helper address before testing.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetchImpl(`${endpoint.replace(/\/+$/, '')}/v1/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [HELPER_HEADER]: '1' },
      body: JSON.stringify({ teacherId: 'hoot', text: 'Hoo-hoo! This is a teacher voice test.' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: unknown };
      return { message: typeof body.error === 'string' ? body.error : 'Voice test failed. Built-in voices still work.' };
    }
    const audio = await res.blob();
    if (!audio.type.startsWith('audio/') || audio.size < 100) throw new Error('invalid audio');
    return { message: 'Voice generation passed. Press play to check the sound on this device.', audio };
  } catch {
    return { message: 'Could not complete the voice test. Built-in voices still work.' };
  } finally {
    clearTimeout(timer);
  }
}
