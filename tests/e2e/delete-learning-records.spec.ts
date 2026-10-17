import { expect, test, type Page } from 'playwright/test';
import { DB_NAME } from '../../src/data/schema';
import type { Avatar, Book, Child, MediaRecord } from '../../src/domain/types';
import { APP, unlockParent } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

test.use({ actionTimeout: 30_000 });
test.setTimeout(180_000);

async function records(page: Page) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T>(table: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    try {
      return {
        avatars: await read<Avatar>('avatars'),
        children: await read<Child>('children'),
        books: await read<Book>('books'),
        media: (await read<MediaRecord>('media')).map(({ blob: _blob, ...record }) => record),
      };
    } finally {
      db.close();
    }
  }, DB_NAME);
}

test('explicit learning-history reset retains avatar appearance across reload and leaves sibling records alone', async ({ page }, info) => {
  await useSyntheticHousehold(page);
  await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['avatars', 'books', 'media'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const avatars = tx.objectStore('avatars');
        const request = avatars.getAll();
        request.onsuccess = () => {
          for (const avatar of request.result as Avatar[]) {
            avatars.put({ ...avatar, hairColor: '#123456', outfitColor: '#654321', inspirationMediaId: `photo-${avatar.childId}` });
            tx.objectStore('media').put({
              id: `photo-${avatar.childId}`,
              childId: avatar.childId,
              householdId: 'household_home',
              mime: 'image/png',
              blob: new Blob(['synthetic bytes']),
              createdAt: '2026-01-01T00:00:00Z',
            } satisfies MediaRecord);
            tx.objectStore('books').put({
              id: `book-${avatar.childId}`,
              childId: avatar.childId,
              title: 'Sample story',
              author: 'Sample author',
              cover: { background: '#123456', accent: '#654321', motif: 'star' },
              status: 'up_next',
              dateAdded: '2026-01-01',
              readingMode: 'shared',
              tags: [],
              isDemo: true,
            } satisfies Book);
          }
        };
      });
    } finally {
      db.close();
    }
  }, DB_NAME);
  await page.reload();
  const before = await records(page);
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  const input = page.getByLabel(/Delete Sample’s learning records and photos/);
  const remove = page.getByRole('button', { name: 'Delete records', exact: true });
  await expect(remove).toBeDisabled();
  await input.fill('Different name');
  await expect(remove).toBeDisabled();
  await input.fill('Sample');
  await expect(remove).toBeEnabled();
  await remove.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (info.project.name === 'phone') await remove.tap();
  else {
    await remove.focus();
    await remove.press('Enter');
  }
  await expect(page.getByText('Sample’s learning records were deleted. Their profile and avatar appearance remain.')).toBeVisible();
  const after = await records(page);
  expect(after.children).toEqual(before.children);
  const avatar = after.avatars.find((a) => a.childId === 'child_izzy')!;
  const { inspirationMediaId: _removed, updatedAt: _old, ...appearance } = before.avatars.find((a) => a.childId === 'child_izzy')!;
  const { updatedAt: _updated, ...retained } = avatar;
  expect(retained).toEqual(appearance);
  expect(after.books.filter((b) => b.childId === 'child_izzy')).toHaveLength(0);
  expect(after.media.filter((m) => m.childId === 'child_izzy')).toHaveLength(0);
  expect(after.avatars.find((a) => a.childId === 'child_georgia')).toEqual(before.avatars.find((a) => a.childId === 'child_georgia'));
  expect(after.books.filter((b) => b.childId === 'child_georgia')).toEqual(before.books.filter((b) => b.childId === 'child_georgia'));
  expect(after.media.filter((m) => m.childId === 'child_georgia')).toEqual(before.media.filter((m) => m.childId === 'child_georgia'));
  await input.scrollIntoViewIfNeeded();
  const path = info.outputPath(`retained-avatar-${info.project.name}.png`);
  await page.screenshot({ path });
  await info.attach('Retained avatar reset confirmation, synthetic profiles', { path, contentType: 'image/png' });
  await page.reload();
  expect((await records(page)).avatars).toEqual(after.avatars);
});
