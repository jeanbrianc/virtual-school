/**
 * OpenAI request bodies for the AI helper — pure, so they're unit-tested
 * without a network. The helper (never the browser) builds every request, so a
 * page can't change the prompts, the safety rules, the voices or the models.
 *
 *  • Replies / activity interpretation: Responses API, a forced function call
 *    for structured output, no reasoning (fast), and store:false.
 *  • Teacher voices: /v1/audio/speech (gpt-4o-mini-tts) with a per-teacher
 *    voice and performance note.
 *  • Listening: /v1/audio/transcriptions (gpt-transcribe) with her book titles
 *    and the teachers' names as keyword hints.
 */
import { SKILLS } from '../../src/domain/curriculum';
import { INTERPRETATION_JSON_SCHEMA, INTERPRETATION_SYSTEM_PROMPT } from '../../src/domain/interpretation/remoteInterpreter';
import { TEACHER_REPLY_TOOL, teacherSystemPrompt, type TeacherAiInput } from '../../src/domain/teachers/aiPrompt';
import { isTeacherId } from '../../src/domain/teachers/registry';
import { TEACHERS, type TeacherId } from '../../src/domain/teachers/teachers';

export const OPENAI_API = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';
export const DEFAULT_OPENAI_VOICE_MODEL = 'gpt-4o-mini-tts';
export const DEFAULT_OPENAI_LISTEN_MODEL = 'gpt-transcribe';

/** Longest line a teacher speaks in one request (the TTS model takes up to 2,000 tokens). */
export const MAX_SPEAK_CHARS = 1200;
/** Largest recording we accept (about a minute of compressed speech; she talks for at most ~12 s). */
export const MAX_AUDIO_BYTES = 1_500_000;

const clampText = (s: string, max: number) => s.replace(/[\u0000-\u001f]+/g, ' ').slice(0, max);

function functionTool(name: string, description: string, parameters: unknown) {
  // strict:false — our schemas have optional fields, which strict mode doesn't allow.
  return { type: 'function', name, description, parameters, strict: false };
}

/** Responses API body for one teacher reply. */
export function buildOpenAiTeacherRequest(input: TeacherAiInput, model = DEFAULT_OPENAI_MODEL): Record<string, unknown> {
  const messages: { role: 'user' | 'assistant'; content: string }[] = input.history.map((turn) => ({
    role: turn.speaker === 'teacher' ? 'assistant' : 'user',
    content: turn.text,
  }));
  messages.push({ role: 'user', content: input.utterance });
  return {
    model,
    instructions: teacherSystemPrompt(input),
    input: messages,
    tools: [functionTool(TEACHER_REPLY_TOOL.name, TEACHER_REPLY_TOOL.description, TEACHER_REPLY_TOOL.input_schema)],
    tool_choice: { type: 'function', name: TEACHER_REPLY_TOOL.name },
    reasoning: { effort: 'none' },
    max_output_tokens: 400,
    store: false,
  };
}

/** Responses API body for organizing a parent's narrative into learning evidence. */
export function buildOpenAiInterpretRequest(narrative: string, childFirstName: string, today: string, model = DEFAULT_OPENAI_MODEL): Record<string, unknown> {
  const catalog = SKILLS.map((s) => `${s.id} — ${s.name}: can ${s.can}`).join('\n');
  return {
    model,
    instructions: `${INTERPRETATION_SYSTEM_PROMPT}\nToday is ${today}. The child is ${clampText(childFirstName, 30)}.\nSkill catalog (id — name):\n${catalog}\nAnswer by calling the record_learning function.`,
    input: [{ role: 'user', content: clampText(narrative, 4000) }],
    tools: [functionTool('record_learning', 'Record the organized learning evidence.', INTERPRETATION_JSON_SCHEMA)],
    tool_choice: { type: 'function', name: 'record_learning' },
    reasoning: { effort: 'none' },
    max_output_tokens: 2000,
    store: false,
  };
}

/** The arguments of the named function call in a Responses API result (null if absent or not JSON). */
export function functionArgsFrom(response: unknown, name: string): unknown {
  if (typeof response !== 'object' || response === null) return null;
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  const call = output.find(
    (o) => typeof o === 'object' && o !== null && (o as { type?: string }).type === 'function_call' && (o as { name?: string }).name === name,
  ) as { arguments?: unknown } | undefined;
  if (!call || typeof call.arguments !== 'string') return null;
  try {
    const args: unknown = JSON.parse(call.arguments);
    return typeof args === 'object' && args !== null ? args : null;
  } catch {
    return null;
  }
}

/** What the browser may ask to have spoken. */
export interface SpeakInput {
  teacherId: TeacherId;
  text: string;
}

export function parseSpeakInput(body: unknown): SpeakInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const teacherId = b.teacherId ?? 'hoot';
  if (!isTeacherId(teacherId)) return null;
  if (typeof b.text !== 'string') return null;
  const text = clampText(b.text, MAX_SPEAK_CHARS).trim();
  return text ? { teacherId, text } : null;
}

/** /v1/audio/speech body: the teacher's own voice and way of speaking. */
export function buildSpeechRequest(input: SpeakInput, model = DEFAULT_OPENAI_VOICE_MODEL): Record<string, unknown> {
  const v = TEACHERS[input.teacherId].naturalVoice;
  return { model, voice: v.voice, input: input.text, instructions: v.style, response_format: 'mp3' };
}

/** What the browser may send to be turned into words. */
export interface ListenInput {
  audio: Uint8Array<ArrayBuffer>;
  mime: string;
  keywords: string[];
  childName: string;
}

const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
};

/** Keyword hints must be one line each, without < or > (OpenAI's rule). */
export function cleanKeyword(k: string): string {
  return k
    .replace(/[<>\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function parseListenInput(body: unknown): ListenInput | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const mime = typeof b.mime === 'string' ? b.mime.split(';')[0]!.trim().toLowerCase() : '';
  if (!AUDIO_TYPES[mime]) return { error: 'Unsupported audio type.' };
  if (typeof b.audio !== 'string' || !b.audio) return { error: 'Missing audio.' };
  const audio = new Uint8Array(Buffer.from(b.audio, 'base64'));
  if (audio.length < 200) return { error: 'Recording too short.' };
  if (audio.length > MAX_AUDIO_BYTES) return { error: 'Recording too long.' };
  const keywords = Array.isArray(b.keywords)
    ? [
        ...new Set(
          b.keywords
            .filter((k): k is string => typeof k === 'string')
            .map(cleanKeyword)
            .filter(Boolean),
        ),
      ].slice(0, 40)
    : [];
  const childName = typeof b.childName === 'string' ? b.childName.replace(/[^\p{L}\p{M}' -]/gu, '').slice(0, 30) : '';
  return { audio, mime, keywords, childName };
}

/** Multipart form for /v1/audio/transcriptions. */
export function buildTranscriptionForm(input: ListenInput, model = DEFAULT_OPENAI_LISTEN_MODEL): FormData {
  const form = new FormData();
  const ext = AUDIO_TYPES[input.mime] ?? 'webm';
  form.append('file', new Blob([input.audio], { type: input.mime }), `speech.${ext}`);
  form.append('model', model);
  const who = input.childName || 'A young child';
  form.append(
    'prompt',
    `${who}, a three-year-old girl, is talking to a teacher in a pretend school game (Professor Hoot the owl, Digit the robot or Nova the red panda) about books, numbers or science. Short, simple sentences.`,
  );
  const names = ['Professor Hoot', 'Hoot', 'Digit', 'Nova', 'Mommy', 'Daddy'];
  const keywords = [...new Set([...(input.childName ? [input.childName] : []), ...names, ...input.keywords])].slice(0, 40);
  if (model === 'gpt-transcribe') {
    for (const k of keywords) form.append('keywords[]', k);
    form.append('languages[]', 'en');
  } else {
    form.append('language', 'en');
  }
  form.append('response_format', 'json');
  return form;
}

/** The words from a transcription result. */
export function transcriptFrom(response: unknown): string | null {
  if (typeof response !== 'object' || response === null) return null;
  const text = (response as { text?: unknown }).text;
  return typeof text === 'string' ? text.trim().slice(0, 600) : null;
}
