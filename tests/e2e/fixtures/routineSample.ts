import { expect, type Page } from 'playwright/test';
import { Repositories } from '../../../src/data/repositories';
import { DB_NAME, TABLES } from '../../../src/data/schema';
import { seedFreshHousehold } from '../../../src/data/seed/launch';
import { MemoryDatabase } from '../../../src/data/storage/memory';
import { fixedClock } from '../../../src/domain/util/time';
import { APP, enterSchool } from '../helpers';

export async function loadRoutineSample(page: Page) {
  await page.addInitScript(() => {
    // Deliberately unavailable optional voice capabilities. Picture/touch participation must still work.
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        speak() {
          throw new Error('Voice is unavailable in this synthetic test');
        },
      },
    });
  });
  const db = new MemoryDatabase(TABLES);
  const repos = new Repositories(db);
  const clock = fixedClock('2026-06-01T12:00:00Z');
  await seedFreshHousehold(repos, clock);
  for (const child of await repos.children.all()) {
    const { birthDate: _birthday, sayName: _sayName, ...sample } = child;
    await repos.children.put({ ...sample, name: child.id === 'child_izzy' ? 'Sample' : 'Sample sibling', status: 'active', explored: ['nova'], isDemo: true });
  }
  for (const parent of await repos.parents.all()) await repos.parents.put({ ...parent, displayName: 'Sample parent' });
  for (const household of await repos.households.all())
    await repos.households.put({
      ...household,
      name: 'Synthetic routine fixture',
      settings: { ...household.settings, talkMode: 'off', readAloud: false, audio: { ...household.settings.audio, muted: true } },
    });
  await repos.meta.put({ key: 'seed', value: { kind: 'demo', chosenByParent: true, at: clock.now().toISOString() } });
  await page.goto(`${APP}#/`);
  await expect(page.getByTestId('enter-izzy')).toBeVisible();
  await page.evaluate(
    async ({ name, tables }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            tables.map((t) => t.name),
            'readwrite',
          );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          for (const table of tables) {
            const store = tx.objectStore(table.name);
            store.clear();
            for (const row of table.rows) store.put(row);
          }
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, tables: await Promise.all(TABLES.map(async ({ name }) => ({ name, rows: await db.table(name).all() }))) },
  );
  await page.reload();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
  await enterSchool(page, 'sample');
  if (await page.getByTestId('discover-ok').count()) await page.getByTestId('discover-ok').click();
}
