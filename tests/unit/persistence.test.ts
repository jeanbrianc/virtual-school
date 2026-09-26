/**
 * Persistence: the IndexedDB adapter (exercised with fake-indexeddb, a
 * spec-compliant in-memory IndexedDB) and the in-memory fallback share one
 * contract — data survives a close/reopen, commits are atomic, queries are
 * child-scoped.
 */
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Repositories } from '../../src/data/repositories';
import { seedDemoData } from '../../src/data/seed/demoSeed';
import { DB_NAME, SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { MemoryDatabase } from '../../src/data/storage/memory';
import type { Database } from '../../src/data/storage/types';
import { sequentialIds } from '../../src/domain/util/ids';
import { loadChildRecords, snapshotFromRecords } from '../../src/services/learningCore';
import { completeBook } from '../../src/services/readingService';
import { makeFamily, mutableClock } from './helpers';

const open: Database[] = [];
after(() => {
  for (const db of open) db.close();
});

async function openIdb(name: string): Promise<IndexedDbDatabase> {
  const db = await IndexedDbDatabase.open(name, SCHEMA_VERSION, TABLES);
  open.push(db);
  return db;
}

for (const kind of ['indexeddb', 'memory'] as const) {
  describe(`storage contract (${kind})`, () => {
    const make = async (name: string) => (kind === 'indexeddb' ? openIdb(name) : new MemoryDatabase(TABLES));

    it('put/get/where/delete and change notifications', async () => {
      const db = await make(`contract-${kind}-1`);
      const repos = new Repositories(db);
      const changes: string[][] = [];
      const unsub = db.subscribe((t) => changes.push(t));
      await repos.books.put({ id: 'b1', childId: 'c1', title: 'A' } as never);
      await repos.books.put({ id: 'b2', childId: 'c2', title: 'B' } as never);
      assert.equal(((await repos.books.get('b1')) as { title: string }).title, 'A');
      assert.deepEqual(
        (await repos.forChild(repos.books, 'c2')).map((b) => b.id),
        ['b2'],
      );
      await repos.books.delete('b1');
      assert.equal(await repos.books.get('b1'), undefined);
      unsub();
      assert.ok(changes.length >= 3 && changes.every((c) => c.includes('books')));
    });

    it('multi-table commits are atomic', async () => {
      const db = await make(`contract-${kind}-2`);
      const repos = new Repositories(db);
      await repos.commit([
        { table: 'books', type: 'put', value: { id: 'b1', childId: 'c1' } },
        { table: 'evidence', type: 'put', value: { id: 'e1', childId: 'c1', skillId: 'x' } },
      ]);
      assert.ok(await repos.books.get('b1'));
      assert.ok(await repos.evidence.get('e1'));
      // A write to a missing table must not leave a partial commit behind.
      await assert.rejects(() =>
        repos.commit([
          { table: 'books', type: 'put', value: { id: 'b2', childId: 'c1' } },
          { table: 'nope' as never, type: 'put', value: { id: 'x' } },
        ]),
      );
      assert.equal(await repos.books.get('b2'), undefined);
    });
  });
}

describe('IndexedDB persistence across reloads', () => {
  it('a finished book and its unlocks are still there after reopening the database', async () => {
    const name = `${DB_NAME}-reload-test`;
    const clock = mutableClock('2026-09-26T15:00:00.000Z');
    const db1 = await openIdb(name);
    const ctx1 = { repos: new Repositories(db1), clock, ids: sequentialIds('p') };
    const { children } = await makeFamily(ctx1);
    await completeBook(ctx1, children[0]!.id, {
      newBook: { title: 'Owl at Home' },
      answers: [],
      rating: 4,
      startedAt: clock.now().toISOString(),
      transcript: [],
      source: 'child',
    });
    db1.close();

    const db2 = await openIdb(name); // "reload"
    const ctx2 = { repos: new Repositories(db2), clock, ids: sequentialIds('q') };
    const rec = await loadChildRecords(ctx2, children[0]!.id);
    assert.equal(snapshotFromRecords(rec).booksCompleted, 1);
    assert.equal(rec.books[0]!.childRating, 4);
    assert.deepEqual(
      rec.unlocks.map((u) => u.rewardId),
      ['pet.bookworm'],
    );
  });

  it('the full demo seed round-trips through IndexedDB', async () => {
    const db = await openIdb(`${DB_NAME}-seed-test`);
    const repos = new Repositories(db);
    const clock = mutableClock();
    await seedDemoData(repos, clock);
    const rec = await loadChildRecords({ repos, clock, ids: sequentialIds('s') }, 'child_izzy');
    assert.equal(snapshotFromRecords(rec).booksCompleted, 9);
    assert.ok(rec.evidence.length > 40);
    assert.ok(rec.mastery.length > 20);
  });
});
