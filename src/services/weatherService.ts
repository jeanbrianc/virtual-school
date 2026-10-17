import type { WeatherRun } from '../domain/lessons/weather';
import type { TranscriptLine } from '../domain/types';
import type { ServiceContext } from './context';
import { recordLesson } from './lessonService';

/** Keep the existing atomic/idempotent save, adding a strict child-bound entry point. */
export async function recordWeatherLesson(ctx: ServiceContext, childId: string, run: WeatherRun, startedAt: string, transcript: TranscriptLine[]) {
  if (run.childId !== childId) throw new Error('Weather run belongs to another child');
  if (!(await ctx.repos.children.get(childId))) throw new Error('Unknown weather learner');
  if (run.definition.id !== 'weather-pictures') throw new Error('Expected a weather picture run');
  return recordLesson(ctx, childId, run, startedAt, transcript);
}
