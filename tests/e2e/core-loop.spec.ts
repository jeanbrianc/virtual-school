/**
 * The core loop, end to end:
 * enter school → walk to the library → Professor Hoot → finish a book →
 * comprehension questions (with scaffolding) → rating → the book flies to the
 * shelf → progress + reward → reload (persistence) → parent sees the evidence.
 */
import { expect, test } from 'playwright/test';
import { APP, dismissCelebrations, enterSchool, talkTo, unlockParent } from './helpers';

test('finish a book with Professor Hoot and see it everywhere', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await enterSchool(page);
  await expect(page.getByTestId('hud-books')).toContainText('9');
  expect(await page.evaluate(() => window.__izzy!.booksOnShelf())).toBe(9);

  await talkTo(page, 'hoot');
  await page.getByTestId('choice-finish').click();
  await page.getByTestId('pick-book-charlottes-web').click();

  // Answer story questions (and the feeling question). Wrong taps get a gentle
  // scaffold and the conversation always moves forward.
  for (let i = 0; i < 20 && !(await page.getByTestId('star-5').count()); i++) {
    const choice = page.locator('.choices .choice:not([disabled])').first();
    if (await choice.count()) await choice.click();
    await page.waitForTimeout(1200);
  }
  await expect(page.getByTestId('dialogue-line')).not.toContainText(/wrong|incorrect/i);
  await page.getByTestId('star-5').click();
  await page.locator('.choices .choice').first().click(); // favorite part

  // Book flies to the shelf; the 10th book grows a second shelf.
  await expect(page.getByTestId('celebration')).toBeVisible({ timeout: 180_000 });
  const cards = await dismissCelebrations(page);
  expect(cards.join(' ')).toMatch(/Book number 10|10/);
  await expect(page.getByTestId('hud-books')).toContainText('10');
  expect(await page.evaluate(() => window.__izzy!.booksOnShelf())).toBe(10);

  // Persistence: reload and re-enter.
  await page.reload();
  await enterSchool(page);
  await expect(page.getByTestId('hud-books')).toContainText('10');

  // Parent mode shows the new evidence.
  await page.goto(`${APP}#/parent/today`);
  await unlockParent(page);
  await expect(page.getByTestId('today-feed')).toContainText('Finished Charlotte’s Web');
  await page.getByTestId('nav-conversations').click();
  await expect(page.getByText('Professor Hoot').first()).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
