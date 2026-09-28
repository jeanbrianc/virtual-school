/**
 * AI teachers through the family's own local helper (scripts/ai-helper.ts).
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

/** Asks the helper whether it's running and has a key. */
export async function checkHelper(
  endpoint: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<{ ok: boolean; model?: string; message: string }> {
  if (!isAllowedHelperUrl(endpoint))
    return { ok: false, message: 'Use /api for this website’s helper, http://127.0.0.1:… for a helper on this computer, or an https:// address.' };
  const hosted = endpoint.startsWith('/');
  try {
    const res = await fetchImpl(`${endpoint.replace(/\/+$/, '')}/health`, { headers: { [HELPER_HEADER]: '1' } });
    const body = (await res.json()) as { ok?: boolean; model?: string; keyConfigured?: boolean };
    if (!body.keyConfigured)
      return {
        ok: false,
        message: hosted
          ? 'This website’s AI helper has no API key yet. Run scripts/deploy/aws-deploy.sh again and paste your key when it asks.'
          : 'The helper is running but has no API key. Add ANTHROPIC_API_KEY to .env.local and restart npm run dev.',
      };
    return { ok: !!body.ok, ...(body.model ? { model: body.model } : {}), message: `Connected — AI teachers are using ${body.model ?? 'Claude'}.` };
  } catch {
    return {
      ok: false,
      message: hosted
        ? 'Can’t reach this website’s AI helper. See docs/DEPLOY.md (the AWS stack deploys it).'
        : 'Can’t reach the helper. Start the app with npm run dev after adding your API key to .env.local.',
    };
  }
}

/** On-device teachers unless a parent turned AI teachers on, consented, and gave a valid helper address. */
export function createTeacherChat(settings: TeacherAiSettings | undefined): TeacherChatService {
  if (settings?.enabled && settings.consentToSend && isAllowedHelperUrl(settings.endpoint)) return new HttpTeacherChat(settings.endpoint);
  return new LocalTeacherChat();
}
