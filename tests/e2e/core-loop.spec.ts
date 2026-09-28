/**
 * The first day, end to end:
 * a brand-new school → welcome card → meet Professor Hoot (introduction) →
 * finish her first book (adaptive questions with scaffolding) → the book flies
 * onto the empty shelf → first reward → reload (persistence) → the parent sees
 * the evidence and the conversation.
 */
import { expect, test } from 'playwright/test';
import { APP, dismissCelebrations, enterSchool, unlockParent } from './helpers';

test('first day: discover the school and put the first book on the shelf', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await enterSchool(page);
  // Fresh school: nothing on the shelf, everything waiting to be discovered.
  await expect(page.getByTestId('hud-books')).toContainText('0');
  expect(await page.evaluate(() => window.__izzy!.booksOnShelf())).toBe(0);
  const welcome = page.getByTestId('discover-card');
  await expect(welcome).toContainText('Welcome to your school, Izzy!');
  await expect(page.getByTestId('hud-discoveries')).toContainText('0');

  // "Meet Professor Hoot" walks her over; Hoot introduces himself (first meeting).
  await page.getByTestId('discover-action').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('you must be Izzy', { timeout: 120_000 });
  await expect(page.getByTestId('dialogue-line')).not.toContainText(/welcome back|again/i);

  // Her first book: no books exist yet, so she names it herself.
  await page.getByTestId('choice-finish').click();
  await page.getByTestId('new-book-title').fill('Charlotte');
  await page.getByTestId('suggest-charlottes-web').click();

  // Story questions (and the feeling question). Wrong taps get a gentle scaffold.
  for (let i = 0; i < 20 && !(await page.getByTestId('star-5').count()); i++) {
    const choice = page.locator('.choices .choice:not([disabled])').first();
    if (await choice.count()) await choice.click();
    await page.waitForTimeout(1200);
  }
  await expect(page.getByTestId('dialogue-line')).not.toContainText(/wrong|incorrect/i);
  await page.getByTestId('star-5').click();
  await page.locator('.choices .choice').first().click(); // favorite part

  // The book flies onto the empty shelf; the first book earns Pip the Bookworm.
  await expect(page.getByTestId('celebration')).toBeVisible({ timeout: 180_000 });
  const cards = await dismissCelebrations(page);
  expect(cards.join(' ')).toMatch(/On your shelf!/);
  expect(cards.join(' ')).toMatch(/Bookworm/);
  await expect(page.getByTestId('hud-books')).toContainText('1');
  expect(await page.evaluate(() => window.__izzy!.booksOnShelf())).toBe(1);
  expect(await page.evaluate(() => window.__izzy!.explored())).toContain('hoot');

  // Persistence: reload and re-enter — no welcome card the second time.
  await page.reload();
  await enterSchool(page);
  await expect(page.getByTestId('hud-books')).toContainText('1');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__izzy!.overlay())).not.toBe('discover');

  // The parent sees the new evidence, the conversation, and the first-week checklist.
  await page.goto(`${APP}#/parent/today`);
  await unlockParent(page);
  await expect(page.getByTestId('today-feed')).toContainText('Finished Charlotte’s Web');
  await expect(page.getByText('Getting started')).toBeVisible();
  await page.getByTestId('nav-conversations').click();
  await expect(page.getByText('Professor Hoot').first()).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
