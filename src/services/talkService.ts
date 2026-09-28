import { SPEECH_PROBE_KEY, type OnDeviceAnswer, type SpeechProbeRecord } from '../domain/talk';
import { nowIso, type ServiceContext } from './context';

export async function getSpeechProbe(ctx: ServiceContext): Promise<SpeechProbeRecord | undefined> {
  return (await ctx.repos.meta.get(SPEECH_PROBE_KEY))?.value as SpeechProbeRecord | undefined;
}

async function save(ctx: ServiceContext, record: SpeechProbeRecord): Promise<void> {
  await ctx.repos.meta.put({ key: SPEECH_PROBE_KEY, value: record });
}

/**
 * Asks the browser about on-device recognition with a crash marker saved first
 * (see domain/talk.ts). Call only from a parent's click.
 */
export async function runSpeechProbe(ctx: ServiceContext, browser: string, ask: () => Promise<OnDeviceAnswer>): Promise<OnDeviceAnswer> {
  await save(ctx, { answer: 'pending', browser, at: nowIso(ctx) });
  const answer = await ask();
  await save(ctx, { answer: answer === 'unknown' ? 'unavailable' : answer, browser, at: nowIso(ctx) });
  return answer;
}

/** A marker still 'pending' when nothing is asking means the last attempt crashed the tab. */
export async function settleInterruptedProbe(ctx: ServiceContext): Promise<SpeechProbeRecord | undefined> {
  const rec = await getSpeechProbe(ctx);
  if (rec?.answer !== 'pending') return rec;
  const crashed: SpeechProbeRecord = { ...rec, answer: 'crashed', at: nowIso(ctx) };
  await save(ctx, crashed);
  return crashed;
}
