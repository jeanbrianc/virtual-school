import { expect, test } from 'playwright/test';
import { enterSchool, talkTo, dismissCelebrations } from './helpers';

test.use({ viewport: { width: 320, height: 740 }, permissions: [] });
test('Hoot completes without microphone, cancels safely, and remembers returning readers', async ({ page }) => {
  await enterSchool(page);
  await page.getByTestId('discover-action').click();
  await page.getByTestId('choice-finish').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('first book');
  await page.getByTestId('new-book-title').fill('Synthetic moon story');
  await page.getByTestId('new-book-save').click();
  const feelings = page.locator('.choices-emoji button');
  await expect(feelings).toHaveCount(6);
  for (const button of await feelings.all()) {
    expect(await button.getAttribute('aria-label')).toBeTruthy();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(72);
  }
  await feelings.first().click();
  await expect(feelings.first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  for (let n = 1; n <= 5; n++) {
    const button = page.getByTestId(`star-${n}`);
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await page.screenshot({ path: 'test-results/hoot-rating-320.png' });
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByTestId('hud-books')).toContainText('0');
  await page.getByTestId('choice-finish').click();
  await page.getByTestId('new-book-title').fill('Synthetic moon story');
  await page.getByTestId('new-book-save').click();
  await page.locator('.choices-emoji button').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByTestId('star-5').click();
  await page.getByTestId('rating-next').dblclick();
  await expect(page.getByTestId('celebration')).toBeVisible();
  await dismissCelebrations(page);
  await expect(page.getByTestId('hud-books')).toContainText('1');
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('izzys-classroom');
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<import('../../src/domain/types').Book[]>((resolve) => {
        const request = db.transaction('books').objectStore('books').getAll();
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      db.close();
    }
  });
  const synthetic = saved.filter((book) => book.title === 'Synthetic moon story');
  expect(synthetic).toHaveLength(1);
  expect(synthetic[0]!.childRating).toBe(5);
  await page.reload();
  await enterSchool(page);
  await talkTo(page, 'hoot');
  await page.getByTestId('choice-finish').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('another book');
  await expect(page.getByTestId('dialogue-line')).not.toContainText('first');
});

test('Hoot cancels a pending save and offers an unrated completion on repeat open', async ({ page }) => {
  await enterSchool(page);
  await page.getByTestId('discover-action').click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByTestId('choice-finish').click();
    await page.getByTestId('new-book-title').fill('Synthetic skipped rating');
    await page.getByTestId('new-book-save').click();
    await page.getByRole('button', { name: 'Not sure', exact: true }).click();
    await page.getByTestId('rating-skip').click();
    if (attempt === 0) {
      await page.getByTestId('dialogue-close').click();
      await page.waitForTimeout(1200);
      await expect(page.getByTestId('hud-books')).toContainText('0');
      await talkTo(page, 'hoot');
    }
  }
  await expect(page.getByTestId('celebration')).toBeVisible();
  await dismissCelebrations(page);
  await expect(page.getByTestId('hud-books')).toContainText('1');
});
