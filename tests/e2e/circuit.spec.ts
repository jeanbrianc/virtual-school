/**
 * The dance & gym circuit on the classroom rug: a grown-up matches the
 * stations to her classes, every number makes Izzy do its move, and hopping
 * 1 → 10 in order finishes the circuit (which the Parent Studio then shows).
 */
import { expect, test, type Page } from 'playwright/test';
import { APP, enterSchool, unlockParent } from './helpers';

/** Puts her on number n, checks the callout, and waits for the move to play out. */
async function hop(page: Page, n: number, says?: string): Promise<void> {
  await page.evaluate((k) => window.__izzy!.stepOn(k), n);
  await page.waitForFunction(() => window.__izzy!.performing(), null, { timeout: 120_000 });
  await expect(page.getByTestId('circuit-callout')).toContainText(says ?? String(n), { timeout: 60_000 });
  await page.waitForFunction(() => !window.__izzy!.performing(), null, { timeout: 180_000 });
}

async function openAvatarPage(page: Page): Promise<void> {
  await page.goto(`${APP}#/parent/avatar`);
  const pin = page.getByTestId('pin-1');
  await pin.or(page.getByTestId('circuit-save')).first().waitFor();
  if (await pin.isVisible()) await unlockParent(page);
  await expect(page.getByTestId('circuit-save')).toBeVisible();
}

test('dance circuit: stations from her classes, a move on every number, 1 → 10 finishes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // A grown-up matches the stations to her classes (and previews a move).
  await openAvatarPage(page);
  await page.getByTestId('circuit-move-2').selectOption('frogJump');
  await page.getByTestId('circuit-name-3').fill('sunshine arms');
  await page.getByTestId('circuit-try-3').click();
  await page.getByTestId('circuit-save').click();
  await expect(page.getByTestId('circuit-save')).toContainText('Saved');
  await expect(page.getByTestId('circuit-save')).toBeDisabled();

  await enterSchool(page);
  await page.getByTestId('discover-ok').click();

  // The start flag explains the game the first time, then starts the circuit.
  await page.evaluate(() => window.__izzy!.teleportTo('circuit'));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__izzy!.interact('circuit'));
  await expect(page.getByTestId('discover-card')).toContainText('Dance Circuit');
  await page.getByTestId('discover-action').click();
  await expect(page.getByTestId('circuit-hud')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.__izzy!.circuit())).toEqual({ next: 1 });

  // Any number does its move (with her name for it); out of order, the circuit waits for 1.
  await page.evaluate(() => window.__izzy!.stepOn(3));
  await expect(page.getByTestId('circuit-callout')).toContainText('sunshine arms', { timeout: 60_000 });
  await page.waitForFunction(() => !window.__izzy!.performing(), null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.__izzy!.circuit())).toEqual({ next: 1 });

  // 1 → 10 in order.
  for (let n = 1; n <= 10; n++) {
    await hop(page, n, n === 2 ? 'Frog jump' : undefined);
    if (n < 10) expect(await page.evaluate(() => window.__izzy!.circuit())).toEqual({ next: n + 1 });
  }
  await expect(page.getByTestId('circuit-callout')).toContainText('The whole circuit!', { timeout: 60_000 });
  await expect(page.getByTestId('circuit-hud')).toBeHidden();
  expect(await page.evaluate(() => window.__izzy!.circuit())).toBeNull();
  expect(await page.evaluate(() => window.__izzy!.explored())).toContain('circuit');

  // The Parent Studio shows it (saved to her record).
  await page.waitForTimeout(1500);
  await openAvatarPage(page);
  await expect(page.getByTestId('circuits-done')).toContainText('1 time');
  await expect(page.getByTestId('circuit-name-3')).toHaveValue('sunshine arms');

  expect(errors).toEqual([]);
});
