import { expect, type Page } from 'playwright/test';
import type { Child, Household, Parent } from '../../src/domain/types';
import { DB_NAME } from '../../src/data/schema';
import { APP } from './helpers';

/** Test-only profiles in the fresh isolated browser context. Never edits the production seed. */
export async function useSyntheticHousehold(page: Page): Promise<void> {
  await page.goto(`${APP}#/`);
  await expect(page.getByTestId('enter-izzy')).toBeVisible();
  const profiles = await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const profiles: Child[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['children', 'parents', 'households'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        const children = tx.objectStore('children');
        const request = children.getAll();
        request.onsuccess = () => {
          for (const child of request.result as Child[]) {
            const { birthDate: _birthDate, sayName: _sayName, ...rest } = child;
            const sample = { ...rest, name: child.id === 'child_izzy' ? 'Sample' : 'Sample sibling', isDemo: true };
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
  }, DB_NAME);
  expect(profiles.map((child) => child.name).sort()).toEqual(['Sample', 'Sample sibling']);
  expect(profiles.every((child) => !('birthDate' in child))).toBe(true);
  await page.reload();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
}
