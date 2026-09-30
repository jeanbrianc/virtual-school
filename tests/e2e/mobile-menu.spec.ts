import { expect, test } from 'playwright/test';
import { APP, unlockParent } from './helpers';

test('school menu stays reachable on narrow phones and opens the parent studio', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${APP}#/`);
  await page.getByTestId('enter-izzy').click();
  await expect(page.getByTestId('hud-grownups')).toBeVisible({ timeout: 300_000 });
  await page.getByTestId('discover-ok').click();
  for (const width of [320, 375, 412, 667]) {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 740 });
    for (const name of ['Turn sound off', 'My treasures', 'My learning museum', 'Grown-ups', 'Home']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByTestId('hud-grownups').click();
  await unlockParent(page);
  await expect(page.getByRole('heading', { name: /Today with Izzy/ })).toBeVisible();
});
