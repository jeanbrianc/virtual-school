import { expect, type Page, type TestInfo } from 'playwright/test';
import type { Child, Household, Parent } from '../../src/domain/types';
import { CHILD_SCOPED_TABLES, DB_NAME } from '../../src/data/schema';
import { APP } from './helpers';

/** Test-only profiles in the fresh isolated browser context. Never edits the production seed. */
export async function sanitizeSyntheticHousehold(page: Page, primaryName = 'Sample'): Promise<void> {
  const profiles = await page.evaluate(
    async ({ name, primaryName, tables }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const profiles: Child[] = [];
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['children', 'parents', 'households', ...tables], 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          // Only clearly marked demo fixtures are rewritten. IDs and non-demo records are preserved.
          const genericNames = (value: unknown): unknown => {
            if (typeof value === 'string') return value.replace(/\bIzzy\b/g, primaryName).replace(/\bGeorgia\b/g, 'Sample sibling');
            if (Array.isArray(value)) return value.map(genericNames);
            if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, genericNames(item)]));
            return value;
          };
          for (const table of tables) {
            const store = tx.objectStore(table);
            const records = store.getAll();
            records.onsuccess = () => {
              for (const record of records.result as Record<string, unknown>[]) if (record.isDemo === true) store.put(genericNames(record));
            };
          }
          const children = tx.objectStore('children');
          const request = children.getAll();
          request.onsuccess = () => {
            for (const child of request.result as Child[]) {
              const { birthDate: _birthDate, sayName: _sayName, ...rest } = child;
              const sample = { ...rest, name: child.id === 'child_izzy' ? primaryName : 'Sample sibling', isDemo: true };
              profiles.push(sample);
              children.put(sample);
            }
          };
          const parents = tx.objectStore('parents');
          const parentRequest = parents.getAll();
          parentRequest.onsuccess = () => {
            for (const parent of parentRequest.result as Parent[]) parents.put({ ...parent, displayName: 'Sample parent' });
          };
          const households = tx.objectStore('households');
          const householdRequest = households.getAll();
          householdRequest.onsuccess = () => {
            for (const household of householdRequest.result as Household[]) households.put({ ...household, name: 'Synthetic Hoot fixture' });
          };
        });
      } finally {
        db.close();
      }
      return profiles;
    },
    { name: DB_NAME, primaryName, tables: CHILD_SCOPED_TABLES },
  );
  expect(profiles.map((child) => child.name).sort()).toEqual([primaryName, 'Sample sibling'].sort());
  expect(profiles.every((child) => !('birthDate' in child))).toBe(true);
}

/** Opens and reloads the current fixture; internal child IDs and all learning assertions stay unchanged. */
export async function useSyntheticHousehold(page: Page, primaryName = 'Sample'): Promise<void> {
  await page.goto(`${APP}#/`);
  await expect(page.getByTestId('enter-izzy')).toBeVisible();
  await sanitizeSyntheticHousehold(page, primaryName);
  await page.reload();
  await expect(page.getByTestId(`enter-${primaryName.toLowerCase()}`)).toBeVisible();
}

/** Capture only after a passing scenario and a positive generic-profile privacy check. */
export async function captureSyntheticSuccess(page: Page, info: TestInfo): Promise<void> {
  if (info.status !== 'passed' || page.isClosed()) return;
  const profiles = await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Child[]>((resolve, reject) => {
        const request = db.transaction('children').objectStore('children').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, DB_NAME);
  expect(profiles).toHaveLength(2);
  expect(profiles.every((child) => !('birthDate' in child) && ['Sample', 'Sample sibling', 'Isla'].includes(child.name))).toBe(true);
  await expect(page.locator('body')).not.toContainText(/\b(Izzy|Georgia)\b/);
  const path = info.outputPath(`synthetic-success-${info.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach('Successful synthetic profile', { path, contentType: 'image/png' });
}
