import { CHILD_SCOPED_TABLES } from '../data/schema';
import { DEFAULT_AVATAR } from '../domain/avatar';
import { effectiveLevel } from '../domain/mastery/masteryEngine';
import { generateReport } from '../domain/reports/reportGenerator';
import type {
  Avatar,
  AvatarConfig,
  Child,
  Household,
  HouseholdSettings,
  MasteryLevel,
  MasteryRecord,
  MediaRecord,
  ReportAudience,
  ReportPeriodKind,
  ReportRecord,
} from '../domain/types';
import { masteryId } from '../domain/util/ids';
import { normalizeSettings } from '../domain/settings';
import { nowIso, type ServiceContext } from './context';
import { loadChildRecords } from './learningCore';

export { DEFAULT_SETTINGS } from '../domain/settings';

export async function getHousehold(ctx: ServiceContext): Promise<Household | undefined> {
  const all = await ctx.repos.households.all();
  const h = all[0];
  return h ? { ...h, settings: normalizeSettings(h.settings) } : undefined;
}

export async function updateSettings(ctx: ServiceContext, patch: Partial<HouseholdSettings>): Promise<Household> {
  const h = await getHousehold(ctx);
  if (!h) throw new Error('No household');
  const next: Household = {
    ...h,
    settings: {
      ...h.settings,
      ...patch,
      audio: { ...h.settings.audio, ...(patch.audio ?? {}) },
      interpretation: { ...h.settings.interpretation, ...(patch.interpretation ?? {}) },
      teacherAi: { ...h.settings.teacherAi, ...(patch.teacherAi ?? {}) },
    },
  };
  await ctx.repos.households.put(next);
  return next;
}

export async function listChildren(ctx: ServiceContext): Promise<Child[]> {
  const kids = await ctx.repos.children.all();
  return kids.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addChild(ctx: ServiceContext, input: { name: string; birthDate?: string; avatar?: AvatarConfig }): Promise<Child> {
  const h = await getHousehold(ctx);
  if (!h) throw new Error('No household');
  const childId = ctx.ids('child');
  const avatarId = ctx.ids('avatar');
  const child: Child = {
    id: childId,
    householdId: h.id,
    name: input.name.trim(),
    ...(input.birthDate ? { birthDate: input.birthDate } : {}),
    status: 'active',
    avatarId,
    createdAt: nowIso(ctx),
  };
  const avatar: Avatar = { ...(input.avatar ?? DEFAULT_AVATAR), id: avatarId, childId, updatedAt: nowIso(ctx) };
  await ctx.repos.commit([
    { table: 'children', type: 'put', value: child },
    { table: 'avatars', type: 'put', value: avatar },
  ]);
  return child;
}

export async function updateChild(ctx: ServiceContext, child: Child): Promise<void> {
  await ctx.repos.children.put(child);
}

export async function getAvatar(ctx: ServiceContext, childId: string): Promise<Avatar | undefined> {
  const list = await ctx.repos.forChild(ctx.repos.avatars, childId);
  return list[0];
}

export async function saveAvatar(ctx: ServiceContext, avatar: Avatar): Promise<void> {
  await ctx.repos.avatars.put({ ...avatar, updatedAt: nowIso(ctx) });
}

export async function addMedia(
  ctx: ServiceContext,
  input: { blob: Blob; childId?: string; caption?: string; width?: number; height?: number },
): Promise<MediaRecord> {
  const h = await getHousehold(ctx);
  if (!h) throw new Error('No household');
  const rec: MediaRecord = {
    id: ctx.ids('media'),
    householdId: h.id,
    ...(input.childId ? { childId: input.childId } : {}),
    mime: input.blob.type || 'application/octet-stream',
    blob: input.blob,
    ...(input.width ? { width: input.width } : {}),
    ...(input.height ? { height: input.height } : {}),
    ...(input.caption ? { caption: input.caption } : {}),
    createdAt: nowIso(ctx),
  };
  await ctx.repos.media.put(rec);
  return rec;
}

export async function setMasteryOverride(
  ctx: ServiceContext,
  childId: string,
  skillId: string,
  override: { level: MasteryLevel; note: string } | null,
): Promise<MasteryRecord> {
  const id = masteryId(childId, skillId);
  const now = nowIso(ctx);
  const existing =
    (await ctx.repos.mastery.get(id)) ??
    ({
      id,
      childId,
      skillId,
      computedLevel: 'not_started',
      stats: { independent: 0, supported: 0, notYet: 0, exposures: 0, independentDays: 0, recentScore: 0 },
      confidence: 'low',
      needsReview: false,
      history: [],
      updatedAt: now,
    } satisfies MasteryRecord);
  const { override: _drop, ...rest } = existing;
  const next: MasteryRecord = override ? { ...rest, override: { ...override, at: now }, updatedAt: now } : { ...rest, updatedAt: now };
  if (effectiveLevel(next) !== effectiveLevel(existing)) next.history = [...next.history, { at: now, level: effectiveLevel(next) }];
  await ctx.repos.mastery.put(next);
  return next;
}

export async function markRewardsCelebrated(ctx: ServiceContext, childId: string, rewardIds: string[]): Promise<void> {
  const unlocks = await ctx.repos.forChild(ctx.repos.rewardUnlocks, childId);
  const updates = unlocks.filter((u) => rewardIds.includes(u.rewardId) && !u.celebrated).map((u) => ({ ...u, celebrated: true }));
  if (updates.length) await ctx.repos.commit(updates.map((value) => ({ table: 'rewardUnlocks', type: 'put' as const, value })));
}

/** Remembers that the child has discovered something in her school (idempotent). */
export async function markExplored(ctx: ServiceContext, childId: string, ids: string[]): Promise<string[]> {
  const child = await ctx.repos.children.get(childId);
  if (!child) return [];
  const explored = [...new Set([...(child.explored ?? []), ...ids])];
  if (explored.length !== (child.explored ?? []).length) await ctx.repos.children.put({ ...child, explored });
  return explored;
}

export async function setActivePet(ctx: ServiceContext, childId: string, petId: string | null): Promise<void> {
  const child = await ctx.repos.children.get(childId);
  if (!child) return;
  const { activePetId: _old, ...rest } = child;
  await ctx.repos.children.put(petId ? { ...rest, activePetId: petId } : rest);
}

export async function createReport(
  ctx: ServiceContext,
  childId: string,
  req: { audience: ReportAudience; periodKind: ReportPeriodKind; start: string; end: string },
): Promise<ReportRecord> {
  const child = await ctx.repos.children.get(childId);
  if (!child) throw new Error('Unknown child');
  const rec = await loadChildRecords(ctx, childId);
  const content = generateReport(
    {
      child,
      books: rec.books,
      sessions: rec.sessions,
      activities: rec.activities,
      evidence: rec.evidence,
      mastery: rec.mastery,
      lessons: rec.lessons,
      unlocks: rec.unlocks,
      portfolio: rec.portfolio,
    },
    { audience: req.audience, start: req.start, end: req.end, now: nowIso(ctx) },
  );
  const report: ReportRecord = {
    id: ctx.ids('report'),
    childId,
    audience: req.audience,
    periodKind: req.periodKind,
    periodStart: req.start,
    periodEnd: req.end,
    createdAt: nowIso(ctx),
    content,
  };
  await ctx.repos.reports.put(report);
  return report;
}

/** Portable JSON export of one child's records (media referenced by id only). */
export async function exportChildData(ctx: ServiceContext, childId: string): Promise<string> {
  const r = ctx.repos;
  const child = await r.children.get(childId);
  const tables: Record<string, unknown[]> = {};
  for (const name of CHILD_SCOPED_TABLES) tables[name] = await r.db.table(name).where('childId', childId);
  return JSON.stringify({ exportedAt: nowIso(ctx), format: 'izzys-classroom/v1', child, ...tables }, null, 2);
}

export async function deleteChildData(ctx: ServiceContext, childId: string): Promise<void> {
  const ops = [];
  for (const name of [...CHILD_SCOPED_TABLES, 'media' as const]) {
    const rows = (await ctx.repos.db.table<{ id: string; key?: string }>(name).where('childId', childId)) as { id: string }[];
    for (const row of rows) ops.push({ table: name, type: 'delete' as const, key: row.id });
  }
  await ctx.repos.commit(ops);
}
