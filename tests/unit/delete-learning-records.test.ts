import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHILD_SCOPED_TABLES, SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { Repositories } from '../../src/data/repositories';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { SyncingDatabase, shareable, type RecordChange } from '../../src/data/storage/syncing';
import type { Database } from '../../src/data/storage/types';
import { DEFAULT_AVATAR } from '../../src/domain/avatar';
import type { Avatar, Child } from '../../src/domain/types';
import { deleteChildData, exportChildData } from '../../src/services/householdService';
import { makeContext } from './helpers';

async function fixture(db: Database) {
  const { ctx } = makeContext();
  ctx.repos = new Repositories(db);
  for (const id of ['sample', 'sibling']) {
    const child: Child = { id, householdId: 'sample-household', name: id, status: 'active', avatarId: `avatar-${id}`, createdAt: '2026-01-01T00:00:00Z' };
    await ctx.repos.children.put(child);
    const avatar: Avatar = {
      ...DEFAULT_AVATAR,
      hairColor: '#123456',
      outfitColor: '#654321',
      id: child.avatarId,
      childId: id,
      inspirationMediaId: `photo-${id}`,
      updatedAt: child.createdAt,
    };
    await ctx.repos.avatars.put(avatar);
    await ctx.repos.media.put({
      id: `photo-${id}`,
      householdId: child.householdId,
      childId: id,
      mime: 'image/png',
      blob: new Blob(['synthetic-image']),
      createdAt: child.createdAt,
    });
    for (const name of CHILD_SCOPED_TABLES.filter((table) => table !== 'avatars')) {
      // Only ownership and IDs are used by deletion; no real learner records are read.
      await db.table(name).put({ id: `${name}-${id}`, childId: id });
    }
  }
  return ctx;
}

for (const adapter of ['memory', 'indexeddb'] as const) {
  test(`${adapter}: reset keeps profile/custom avatar, removes learning rows/photos/reference, and preserves sibling on repeat/reload`, async () => {
    let idb = adapter === 'indexeddb' ? await IndexedDbDatabase.open(`delete-learning-${adapter}`, SCHEMA_VERSION, TABLES) : null;
    const ctx = await fixture(idb ?? new MemoryDatabase(TABLES));
    const child = await ctx.repos.children.get('sample');
    const originalAvatar = (await ctx.repos.avatars.get('avatar-sample'))!;
    const siblingExport = await exportChildData(ctx, 'sibling');
    const siblingPhoto = (await ctx.repos.media.get('photo-sibling'))!;
    try {
      await deleteChildData(ctx, 'sample');
      const avatar = (await ctx.repos.avatars.get('avatar-sample'))!;
      const { inspirationMediaId: _removed, updatedAt: _oldTime, ...appearance } = originalAvatar;
      const { updatedAt: _newTime, ...retained } = avatar;
      assert.deepEqual(retained, appearance);
      assert.deepEqual(await ctx.repos.children.get('sample'), child);
      assert.equal(await ctx.repos.media.get('photo-sample'), undefined);
      for (const name of CHILD_SCOPED_TABLES.filter((table) => table !== 'avatars'))
        assert.equal((await ctx.repos.db.table(name).where('childId', 'sample')).length, 0, name);
      assert.equal(await exportChildData(ctx, 'sibling'), siblingExport);
      assert.equal(await (await ctx.repos.media.get('photo-sibling'))!.blob.text(), await siblingPhoto.blob.text());
      await deleteChildData(ctx, 'sample');
      assert.deepEqual(await ctx.repos.avatars.get('avatar-sample'), avatar);
      if (idb) {
        idb.close();
        idb = await IndexedDbDatabase.open(`delete-learning-${adapter}`, SCHEMA_VERSION, TABLES);
        ctx.repos = new Repositories(idb);
      }
      assert.deepEqual(await ctx.repos.avatars.get('avatar-sample'), avatar);
      assert.deepEqual(await ctx.repos.children.get('sample'), child);
    } finally {
      idb?.close();
    }
  });
}

test('sync reset sends record/photo tombstones and an avatar reference update, never a profile/avatar deletion', async () => {
  const source = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-device');
  const target = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-second-device');
  const ctx = await fixture(source);
  const changes = async (): Promise<RecordChange[]> =>
    Promise.all(
      (await source.outbox()).map(async (row) => ({
        table: row.table,
        id: row.id,
        mod: row.mod,
        ...(row.deleted ? { deleted: true } : { data: shareable(row.table, await source.table(row.table).get(row.id)) }),
      })),
    );
  await target.applyRemote(await changes());
  await deleteChildData(ctx, 'sample');
  const reset = await changes();
  assert.ok(reset.some((row) => row.table === 'media' && row.id === 'photo-sample' && row.deleted));
  assert.ok(!reset.some((row) => ['avatars', 'children'].includes(row.table) && row.deleted));
  await target.applyRemote(reset);
  await target.applyRemote(reset);
  const repos = new Repositories(target);
  assert.equal((await repos.avatars.get('avatar-sample'))!.hairColor, '#123456');
  assert.equal((await repos.avatars.get('avatar-sample'))!.inspirationMediaId, undefined);
  assert.ok(await repos.children.get('sample'));
  assert.ok(await repos.avatars.get('avatar-sibling'));
  assert.equal(await repos.media.get('photo-sample'), undefined);
});

test('reset does not alter an avatar without a deleted inspiration photo or remove another child’s media', async () => {
  const ctx = await fixture(new MemoryDatabase(TABLES));
  const avatar = (await ctx.repos.avatars.get('avatar-sample'))!;
  const sharedReference = { ...avatar, inspirationMediaId: 'photo-sibling' };
  await ctx.repos.avatars.put(sharedReference);
  await deleteChildData(ctx, 'sample');
  assert.deepEqual(await ctx.repos.avatars.get('avatar-sample'), sharedReference);
  assert.ok(await ctx.repos.media.get('photo-sibling'));
});
