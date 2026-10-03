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
async function complete(page: Page) {
  await page.getByTestId('choice-copy').click();
  await expect(page.getByTestId('dialogue-line').locator('.sr-only')).toContainText('Which shape comes next?');
  const shape = await page.locator('.pattern-shape').first().getAttribute('data-shape');
  await page.getByTestId(`choice-${shape}`).click();
  await expect(page.getByRole('button', { name: 'Add circle' })).toBeVisible();
  for (const shape of ['circle', 'triangle', 'square', 'circle']) {
    const button = page.getByRole('button', { name: `Add ${shape}` });
    await expect(button).toBeEnabled();
    await button.focus();
    await button.press('Enter');
  }
  await expect(page.getByRole('button', { name: 'Finish my design' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo shape' }).click();
  await expect(page.getByRole('button', { name: 'Finish my design' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add square' }).click();
  await page.getByRole('button', { name: 'Finish my design' }).click();
  await expect(page.getByTestId('choice-yay')).toBeVisible();
  await page.screenshot({ path: '../pippa-desktop.png' });
}
test('Pippa completes offline with keyboard design, replay and a persistent parent observation', async ({ page }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'pippa');
  await expect(page.getByRole('dialog', { name: 'Talking with Pippa' })).toBeVisible();
  await page.getByTestId('choice-go').click();
  await complete(page);
  await page.getByTestId('choice-replay').click();
  expect(await records(page)).toHaveLength(0);
  await complete(page);
  await page.getByTestId('choice-yay').dblclick();
  await expect.poll(() => records(page)).toHaveLength(1);
  await dismissCelebrations(page);
  await page.goto('/#/parent');
  await unlockParent(page);
  await expect(page.getByText(/Created a four-shape design \(observed, not graded\)/).first()).toBeVisible();
  await page.reload();
  expect(await records(page)).toHaveLength(1);
});
test('phone touch supports hints, skips, and cancel without recording an incomplete lesson', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'pippa');
  await page.getByTestId('choice-go').click();
  await page.getByTestId('choice-paired').click();
  await expect(page.getByTestId('dialogue-line').locator('.sr-only')).toContainText('repeating pair');
  await page.getByRole('button', { name: 'Skip this round' }).click();
  await page.getByTestId('dialogue-close').click();
  expect(await records(page)).toHaveLength(0);
  await talkTo(page, 'pippa');
  await page.getByTestId('choice-go').click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Skip this round' }).click();
  for (const shape of ['square', 'square', 'circle', 'triangle']) {
    const button = page.getByRole('button', { name: `Add ${shape}` });
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(64);
    await button.click();
  }
  await page.screenshot({ path: '../pippa-phone.png' });
  await page.getByRole('button', { name: 'Finish my design' }).click();
  await page.getByTestId('choice-yay').click();
  await expect.poll(() => records(page)).toHaveLength(1);
  expect((await records(page))[0]!.summary).toContain('square square circle triangle');
});
