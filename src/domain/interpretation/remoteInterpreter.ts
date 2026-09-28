/**
 * Optional AI-backed interpreter.
 *
 * Disabled unless a parent (1) enters an endpoint in Settings and (2) gives
 * explicit consent to send narratives off the device. The endpoint is
 * expected to be the family's own small proxy that calls an LLM with
 * INTERPRETATION_SYSTEM_PROMPT + the JSON schema below, and returns an
 * ActivityInterpretation. Output is validated; anything invalid falls back to
 * the local interpreter so the workflow never breaks.
 */
import { SKILLS, getSkill } from '../curriculum';
import type { DomainId } from '../curriculum';
import { interpretLocally } from './localInterpreter';
import { ACCEPT_THRESHOLD, type ActivityInterpretation, type ActivityInterpretationService, type InterpretationContext, type SkillSuggestion } from './types';

export const INTERPRETATION_SYSTEM_PROMPT = `You organize a homeschooling parent's short narrative into learning evidence.
Return ONLY JSON matching the provided schema. Use only skill ids from the provided catalog.
Be conservative: exposure is not mastery; mark independence only when the narrative says so.
Never invent events that are not in the narrative. Write parent-facing statements that are specific and factual.`;

/** Loose JSON schema description shared with the proxy (documented in README). */
export const INTERPRETATION_JSON_SCHEMA = {
  type: 'object',
  required: ['title', 'date', 'skills'],
  properties: {
    title: { type: 'string' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    durationMinutes: { type: 'number' },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        required: ['skillId', 'confidence', 'kind', 'independence', 'outcome', 'statement', 'excerpt'],
        properties: {
          skillId: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          kind: { enum: ['performance', 'observation', 'exposure'] },
          independence: { enum: ['independent', 'supported', 'assisted'] },
          outcome: { enum: ['demonstrated', 'with_support', 'exposure', 'not_yet'] },
          statement: { type: 'string' },
          excerpt: { type: 'string' },
        },
      },
    },
    topics: { type: 'array', items: { type: 'string' } },
    natureItems: { type: 'array', items: { type: 'string' } },
    followUps: { type: 'array', items: { type: 'string' } },
  },
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.slice(0, 500) : fallback);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 300)) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Validates and sanitizes untrusted interpreter output. Unknown skills are
 * dropped; values are clamped; strings truncated. Returns null if unusable.
 */
export function validateInterpretation(raw: unknown, context: InterpretationContext, providerId: string): ActivityInterpretation | null {
  if (!isObj(raw) || !Array.isArray(raw.skills)) return null;
  const skills: SkillSuggestion[] = [];
  for (const item of raw.skills) {
    if (!isObj(item)) continue;
    const skillId = str(item.skillId);
    const skill = getSkill(skillId);
    if (!skill) continue;
    const confidence = Math.max(0, Math.min(1, typeof item.confidence === 'number' ? item.confidence : 0));
    skills.push({
      skillId,
      confidence,
      kind: oneOf(item.kind, ['performance', 'observation', 'exposure'] as const, 'observation'),
      independence: oneOf(item.independence, ['independent', 'supported', 'assisted'] as const, 'supported'),
      outcome: oneOf(item.outcome, ['demonstrated', 'with_support', 'exposure', 'not_yet'] as const, 'exposure'),
      statement: str(item.statement, skill.name),
      excerpt: str(item.excerpt),
      topics: skill.topics,
      accepted: confidence >= ACCEPT_THRESHOLD,
    });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(raw.date)) ? str(raw.date) : context.today;
  const domains: DomainId[] = [];
  for (const s of skills) {
    const d = getSkill(s.skillId)?.domainId;
    if (d && !domains.includes(d)) domains.push(d);
  }
  const duration = typeof raw.durationMinutes === 'number' && raw.durationMinutes > 0 ? Math.round(raw.durationMinutes) : undefined;
  return {
    title: str(raw.title, 'Learning moment') || 'Learning moment',
    date,
    ...(duration ? { durationMinutes: duration } : {}),
    domains,
    skills,
    topics: strArr(raw.topics),
    books: [],
    measurements: [],
    natureItems: strArr(raw.natureItems),
    childQuotes: strArr(raw.childQuotes),
    questionsAsked: strArr(raw.questionsAsked),
    followUps: strArr(raw.followUps).slice(0, 5),
    provider: { id: providerId, version: 'remote', label: 'AI interpreter (parent-enabled)' },
    notes: [],
  };
}

export class HttpInterpretationService implements ActivityInterpretationService {
  readonly id = 'http-ai';
  readonly label = 'AI interpreter (your endpoint)';
  readonly sendsDataOffDevice = true;

  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 15_000,
  ) {}

  async interpret(narrative: string, context: InterpretationContext): Promise<ActivityInterpretation> {
    // Local structure is always computed: books/measurements come from it, and
    // it is the fallback if the remote call fails or returns invalid data.
    const local = interpretLocally(narrative, context);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        // The custom header lets the family's local helper recognize this app (and forces a CORS preflight).
        headers: { 'Content-Type': 'application/json', 'X-Izzy-Classroom': '1' },
        // Only the narrative, first name and date are sent (plus the public skill
        // catalog so the model can pick valid ids) — no ids, photos or history.
        body: JSON.stringify({
          system: INTERPRETATION_SYSTEM_PROMPT,
          schema: INTERPRETATION_JSON_SCHEMA,
          catalog: SKILLS.map((k) => ({ id: k.id, domain: k.domainId, name: k.name, can: k.can })),
          narrative,
          childFirstName: context.childName,
          today: context.today,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const validated = validateInterpretation(await res.json(), context, this.id);
      if (!validated || validated.skills.length === 0) throw new Error('Invalid interpretation payload');
      return { ...validated, books: local.books, measurements: local.measurements };
    } catch (err) {
      return {
        ...local,
        notes: [...local.notes, `AI interpreter unavailable (${err instanceof Error ? err.message : 'error'}); used on-device interpreter instead.`],
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
