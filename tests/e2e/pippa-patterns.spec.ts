import { expect, test, type Page } from 'playwright/test';
import { enterSchool, talkTo, dismissCelebrations, unlockParent } from './helpers';
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('izzys-classroom');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<{ lessonId: string; summary: string }[]>((resolve) => {
        const r = db.transaction('lessonAttempts').objectStore('lessonAttempts').getAll();
        r.onsuccess = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
}
async function complete(page: Page, pattern = false) {
  for (let i = 0; i < 2; i++) {
    await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', `Round ${i + 1} of 3`);
    await expect(page.locator('.shape-choice').first()).toBeEnabled();
    await expect(page.locator('.shape-model')).toHaveCount(pattern ? 3 : 1);
    const shape = await page
      .locator('.shape-model')
      .nth(pattern ? 1 : 0)
      .getAttribute('data-shape');
    const button = page.getByTestId(`choice-${shape}`);
    await expect(button).toBeEnabled();
    await button.focus();
    await button.press('Enter');
    await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', `Round ${i + 2} of 3`);
  }
  await expect(page.locator('.shape-paper')).toBeVisible();
  const free = page.locator('.shape-choice').first();
  await expect(free).toBeEnabled();
  await free.click();
  await expect(page.getByTestId('choice-yay')).toBeVisible();
}
test('novice shape match preserves baseline before optional pattern challenge and saves once', async ({ page }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'pippa');
  await page.getByTestId('choice-go').click();
  await complete(page);
  await expect(page.getByTestId('choice-pattern')).toBeVisible();
  await page.getByTestId('choice-pattern').dblclick();
  await expect(page.locator('.shape-model')).toHaveCount(3);
  expect(await records(page)).toHaveLength(1);
  expect((await records(page))[0]!.summary).toContain('Same-shape matching');
  await complete(page, true);
  await page.getByTestId('choice-yay').dblclick();
  await expect.poll(() => records(page)).toHaveLength(2);
  await dismissCelebrations(page);
  await page.goto('/#/parent/today');
  await unlockParent(page);
  await expect(page.getByText(/Created a shape picture \(observed, not graded\)/).first()).toBeVisible();
  await page.reload();
  expect(await records(page)).toHaveLength(2);
});
test('phone shapes support hints, skip, replay and cancel without recording unfinished play', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'pippa');
  await page.getByTestId('choice-go').click();
  await page.getByRole('button', { name: /Show me/ }).click();
  await expect(page.locator('.shape-hint')).toHaveCount(1);
  await page.getByRole('button', { name: 'Skip this round' }).click();
  await page.getByTestId('dialogue-close').click();
  expect(await records(page)).toHaveLength(0);
  await talkTo(page, 'pippa');
  await page.getByTestId('choice-go').click();
  await complete(page);
  await page.getByTestId('choice-replay').click();
  expect(await records(page)).toHaveLength(0);
  await expect(page.locator('.shape-model')).toHaveCount(1);
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Skip this round' }).click();
  const free = page.locator('.shape-choice').first();
  const box = await free.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(120);
  expect(box!.height).toBeGreaterThanOrEqual(120);
  await free.click();
  await expect(page.getByTestId('choice-pattern')).toHaveCount(0);
  await page.getByTestId('choice-yay').click();
  await expect.poll(() => records(page)).toHaveLength(1);
  expect((await records(page))[0]!.summary).toContain('Skipped 2 rounds');
});
