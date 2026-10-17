/** Safe response metadata; no request content or identifiers, and no analytics sink. */
import { USAGE_HEADER, usageModel } from '../../src/domain/usage';
export function usageHeaders(provider: 'openai' | 'anthropic', model: string, response?: unknown): Record<string, string> {
  const usage = response && typeof response === 'object' ? (response as { usage?: unknown }).usage : null;
  const u = usage && typeof usage === 'object' ? (usage as Record<string, unknown>) : {};
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  return {
    [USAGE_HEADER]: JSON.stringify({
      provider,
      model: usageModel(model),
      ...(valid(u.input_tokens) && valid(u.output_tokens) ? { inputTokens: u.input_tokens, outputTokens: u.output_tokens } : {}),
    }),
    'Access-Control-Expose-Headers': USAGE_HEADER,
  };
}
