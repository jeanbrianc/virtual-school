import type { Repositories } from '../data/repositories';
import type { IdFactory } from '../domain/util/ids';
import type { Clock } from '../domain/util/time';

/** Dependencies shared by all application services (injected; swappable in tests). */
export interface ServiceContext {
  repos: Repositories;
  clock: Clock;
  ids: IdFactory;
}

export function nowIso(ctx: ServiceContext): string {
  return ctx.clock.now().toISOString();
}
