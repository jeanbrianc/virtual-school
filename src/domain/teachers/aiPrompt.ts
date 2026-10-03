/**
 * Prompts and request bodies for the optional AI teachers and the optional AI
 * activity interpreter. These are built ON THE FAMILY'S LOCAL HELPER
 * (scripts/ai-helper.ts), never taken from the browser, so the rules below
 * can't be changed by a page. Pure functions — unit-tested without a network.
 */
import { SKILLS } from '../curriculum';
import { INTERPRETATION_JSON_SCHEMA, INTERPRETATION_SYSTEM_PROMPT } from '../interpretation/remoteInterpreter';
import { CHAT_INTENTS, type ChatTurn } from './chat';
import { isTeacherId, TEACHER_REGISTRY } from './registry';
import { TEACHERS, type TeacherId } from './teachers';

export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

/** What the browser is allowed to send to the helper for a teacher reply. */
export interface TeacherAiInput {
  teacherId: TeacherId;
  childName: string;
  utterance: string;
  history: ChatTurn[];
  bookTitles: string[];
}

export function teacherSystemPrompt(input: Pick<TeacherAiInput, 'teacherId' | 'childName' | 'bookTitles'>): string {
  const t = TEACHERS[input.teacherId];
  const name = input.childName.replace(/[^\p{L}\p{M}' -]/gu, '').slice(0, 30) || 'the child';
  const books = input.bookTitles
    .slice(0, 20)
    .map((b) => `- ${b.replace(/[\r\n]+/g, ' ').slice(0, 80)}`)
    .join('\n');
  return `You are ${t.name}, a ${t.species.toLowerCase()} who teaches ${t.subject.toLowerCase()} in a cozy pretend school inside a learning game. You are talking with ${name}, a young learner. Your spot in the school is ${TEACHER_REGISTRY[input.teacherId].room}.
Personality: ${t.personality}

She talks to you out loud; her words reach you through speech-to-text, so they may be lowercase, run together, or slightly misheard. Guess kindly what she meant (for example a book title that sounds like a real one).

How to reply:
- 1 to 3 short sentences, under 45 words, that a 4-year-old understands. Warm, playful, encouraging. Use her name now and then.
- Answer exactly what she said. If she mentions a book, say its title back so she knows you heard it, and ask one simple question about it.
- Ask at most one question per reply.
- Stay with learning, books, stories, words, numbers, shapes, science, nature, art, feelings and her day.
- Only state book facts you are sure of. If you don't know a book, be curious instead of guessing.
- ${input.teacherId === 'hoot' ? 'When she has finished a book or read one to someone, cheer and ask whether she read the whole book.' : 'If she wants to talk about a book, cheer and suggest telling Professor Hoot in the library so it can go on her shelf.'}

Safety rules (always, no exceptions):
- Never ask for or repeat personal details: last names, address, town, school, phone numbers, passwords, where she is right now, or photos.
- Never tell her to go anywhere, open or click anything, buy anything, or keep a secret. No links, brands, or websites.
- Nothing scary, violent, romantic, rude or grown-up. No medical, legal or safety instructions beyond "tell a grown-up".
- You are a pretend character in a game. Don't claim to be a real person, and don't claim to see or hear anything around her.
- If she says she is hurt, sick, scared of someone, unsafe, lost, or very sad: reply briefly and kindly, tell her to tell Mom or Dad right now, and set parentNote to a short factual summary of what she said.
- If she asks about something outside these rules, gently steer back to learning.
${books ? `\nBooks on her list (titles only):\n${books}\n` : ''}
Always answer by calling the teacher_reply tool.`;
}

export const TEACHER_REPLY_TOOL = {
  name: 'teacher_reply',
  description: 'Say one reply to the child and record what she was talking about.',
  input_schema: {
    type: 'object',
    required: ['reply', 'intent'],
    properties: {
      reply: { type: 'string', description: 'What the teacher says out loud (1–3 short sentences).' },
      intent: { type: 'string', enum: [...CHAT_INTENTS] },
      book: {
        type: ['object', 'null'],
        description: 'The book she talked about, if any.',
        properties: { title: { type: 'string' }, author: { type: 'string' } },
      },
      finished: { type: ['boolean', 'null'], description: 'Did she say she finished the book? null if unknown.' },
      readTo: { type: ['string', 'null'], description: 'Who she read the book to (e.g. "Daddy"), if she said.' },
      readBy: { type: ['string', 'null'], description: 'Who read the book to her, if she said.' },
      parentNote: { type: ['string', 'null'], description: 'Only for safety or wellbeing concerns a parent must know about.' },
    },
  },
} as const;

const clampText = (s: string, max: number) => s.replace(/[\u0000-\u001f]+/g, ' ').slice(0, max);

/** Validates the browser's request body; returns null if it isn't a well-formed teacher request. */
export function parseTeacherAiInput(body: unknown): TeacherAiInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const teacherId = b.teacherId;
  if (!isTeacherId(teacherId)) return null;
  if (typeof b.utterance !== 'string' || !b.utterance.trim()) return null;
  const history = Array.isArray(b.history)
    ? b.history
        .filter((h): h is { speaker: string; text: string } => typeof h === 'object' && h !== null && typeof (h as ChatTurn).text === 'string')
        .slice(-8)
        .map((h) => ({ speaker: h.speaker === 'teacher' ? ('teacher' as const) : ('child' as const), text: clampText(h.text, 400) }))
    : [];
  const bookTitles = Array.isArray(b.bookTitles) ? b.bookTitles.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  return {
    teacherId,
    childName: typeof b.childName === 'string' ? clampText(b.childName, 30) : 'the child',
    utterance: clampText(b.utterance, 400),
    history,
    bookTitles,
  };
}

/** Anthropic Messages API body for one teacher reply (tool use forces structured output). */
export function buildTeacherRequest(input: TeacherAiInput, model = DEFAULT_AI_MODEL): Record<string, unknown> {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const turn of input.history) {
    const role = turn.speaker === 'teacher' ? 'assistant' : 'user';
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n${turn.text}`;
    else messages.push({ role, content: turn.text });
  }
  // The conversation must start with the child and alternate.
  while (messages[0]?.role === 'assistant') messages.shift();
  const last = messages[messages.length - 1];
  if (last?.role === 'user') last.content += `\n${input.utterance}`;
  else messages.push({ role: 'user', content: input.utterance });
  return {
    model,
    max_tokens: 400,
    temperature: 0.7,
    system: teacherSystemPrompt(input),
    tools: [TEACHER_REPLY_TOOL],
    tool_choice: { type: 'tool', name: TEACHER_REPLY_TOOL.name },
    messages,
  };
}

/** Anthropic Messages API body for organizing a parent's narrative into learning evidence. */
export function buildInterpretRequest(narrative: string, childFirstName: string, today: string, model = DEFAULT_AI_MODEL): Record<string, unknown> {
  const catalog = SKILLS.map((s) => `${s.id} — ${s.name}: can ${s.can}`).join('\n');
  return {
    model,
    max_tokens: 2000,
    temperature: 0,
    system: `${INTERPRETATION_SYSTEM_PROMPT}\nToday is ${today}. The child is ${clampText(childFirstName, 30)}.\nSkill catalog (id — name):\n${catalog}\nAnswer by calling the record_learning tool.`,
    tools: [{ name: 'record_learning', description: 'Record the organized learning evidence.', input_schema: INTERPRETATION_JSON_SCHEMA }],
    tool_choice: { type: 'tool', name: 'record_learning' },
    messages: [{ role: 'user', content: clampText(narrative, 4000) }],
  };
}

/** Pulls the tool input out of an Anthropic Messages API response. */
export function toolInputFrom(response: unknown, toolName: string): unknown {
  if (typeof response !== 'object' || response === null) return null;
  const content = (response as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const block = content.find(
    (c) => typeof c === 'object' && c !== null && (c as { type?: string }).type === 'tool_use' && (c as { name?: string }).name === toolName,
  );
  return block ? ((block as { input?: unknown }).input ?? null) : null;
}
