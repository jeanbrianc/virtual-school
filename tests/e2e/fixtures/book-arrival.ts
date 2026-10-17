import { expect, type Page } from 'playwright/test';
import { Repositories } from '../../../src/data/repositories';
import { DB_NAME, TABLES } from '../../../src/data/schema';
import { seedFreshHousehold } from '../../../src/data/seed/launch';
import { MemoryDatabase } from '../../../src/data/storage/memory';
import { sequentialIds } from '../../../src/domain/util/ids';
import { fixedClock } from '../../../src/domain/util/time';
import { completeBook } from '../../../src/services/readingService';
import { APP } from '../helpers';
const CHILD = 'child_izzy';
/** Build genuinely synthetic learning records through the same reward service as the app. */
async function sampleRecords(count: number) {
  const db = new MemoryDatabase(TABLES);
  const repos = new Repositories(db);
  const clock = fixedClock('2026-06-01T12:00:00.000Z');
  const ctx = { repos, clock, ids: sequentialIds('book-arrival-e2e') };
  await seedFreshHousehold(repos, clock);
  for (const child of await repos.children.all()) {
    const { birthDate: _birthDate, ...sample } = child;
    await repos.children.put({ ...sample, name: child.id === CHILD ? 'Sample' : 'Sample sibling', explored: ['hoot'], isDemo: true });
  }
  for (const parent of await repos.parents.all()) await repos.parents.put({ ...parent, displayName: 'Sample parent' });
  for (const household of await repos.households.all()) {
    await repos.households.put({ ...household, name: 'Synthetic bookshelf fixture', settings: { ...household.settings, talkMode: 'off', demoTools: true } });
  }
  await repos.meta.put({ key: 'seed', value: { kind: 'demo', chosenByParent: true, at: clock.now().toISOString() } });
  for (let i = 0; i < count; i++) {
    await completeBook(ctx, CHILD, {
      newBook: { title: `Sample Shelf Story ${i + 1}`, author: 'Synthetic Author' },
      answers: [],
      startedAt: clock.now().toISOString(),
      transcript: [],
      source: 'parent',
    });
  }
  // Existing achievements are already celebrated; preview tests exercise new celebrations.
  for (const reward of await repos.rewardUnlocks.all()) await repos.rewardUnlocks.put({ ...reward, celebrated: true, isDemo: true });
  for (const book of await repos.books.all()) await repos.books.put({ ...book, isDemo: true });
  return Promise.all(TABLES.map(async ({ name }) => ({ name, rows: await db.table(name).all() })));
}

/** Each test owns a fresh browser context. This never connects to family sync or production data. */
export async function loadBookSample(page: Page, count: number) {
  await page.goto(`${APP}#/`);
  await expect(page.getByTestId('enter-izzy')).toBeVisible();
  await page.evaluate(
    async ({ name, tables }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(
            tables.map((table) => table.name),
            'readwrite',
          );
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
          for (const table of tables) {
            const store = transaction.objectStore(table.name);
            store.clear();
            for (const row of table.rows) store.put(row);
          }
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, tables: await sampleRecords(count) },
  );
  await page.reload();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
}

export async function savedReading(page: Page) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = (table: string) =>
        new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const request = db.transaction(table).objectStore(table).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [books, rewards] = await Promise.all([read('books'), read('rewardUnlocks')]);
      return { books, rewards };
    } finally {
      db.close();
    }
  }, DB_NAME);
}
