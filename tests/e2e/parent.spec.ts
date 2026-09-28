/**
 * Parent studio: natural-language entry → review → save → reward, reports,
 * the family museum, and a responsive layout (also run on a phone viewport).
 */
import { expect, test } from 'playwright/test';
import { APP, unlockParent } from './helpers';

test('log a learning moment, unlock the greenhouse, generate a family report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Start from the labeled sample history (a parent's explicit choice).
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  await page.getByTestId('load-sample').click();
  await page.getByTestId('confirm-reset').click();
  await expect(page.getByText('Sample data loaded')).toBeVisible();
  await page.goto(`${APP}#/parent/today`);
  await expect(page.getByRole('heading', { name: /Today with Izzy/ })).toBeVisible();
  await expect(page.getByText(/sample demo data/)).toBeVisible();

  // Natural-language entry from the Today composer.
  await page
    .getByTestId('today-composer')
    .fill(
      'We planted bean seeds in cups and put one in the dark closet to compare. Izzy predicted the one in the dark would not grow and watered them herself.',
    );
  await page.getByTestId('today-interpret').click();
  await expect(page.getByTestId('review')).toBeVisible();
  const suggestions = page.getByTestId('suggestions');
  await expect(suggestions.locator('[data-skill="sci.plants"]')).toBeVisible();
  await expect(suggestions.locator('[data-skill="sci.predict"]')).toBeVisible();
  await expect(suggestions.locator('[data-skill="math.measure-units"]')).toHaveCount(0);
  await page.getByTestId('log-save').click();
  await expect(page.getByTestId('saved')).toBeVisible();
  await expect(page.getByTestId('saved-rewards')).toContainText('Greenhouse');

  // Progress & curriculum reflect it.
  await page.goto(`${APP}#/parent/curriculum/sci.plants`);
  await expect(page.getByText(/Explored how plants grow/).first()).toBeVisible();
  await expect(page.getByText(/bean seeds/i).first()).toBeVisible(); // provenance: the parent's own words

  // Family report.
  await page.goto(`${APP}#/parent/reports`);
  await page.getByTestId('aud-family').check();
  await page.getByTestId('report-generate').click();
  const doc = page.getByTestId('report-doc');
  await expect(doc).toBeVisible();
  await expect(doc).toContainText('learning adventures');
  await expect(doc).not.toContainText(/CCSS|NGSS|RL\.\d/);

  // Learning Museum (family showcase).
  await page.goto(`${APP}#/museum/child_izzy`);
  await expect(page.getByTestId('museum-shelf').locator('.museum-book')).toHaveCount(9);
  await page.getByTestId('museum-tour').click();
  await expect(page.getByTestId('museum-tour-view')).toBeVisible();

  // No horizontal overflow on the parent pages (responsive check).
  for (const section of ['today', 'progress', 'curriculum', 'reports']) {
    await page.goto(`${APP}#/parent/${section}`);
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${section} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
