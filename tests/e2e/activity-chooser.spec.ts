import { expect, test } from 'playwright/test';
import { enterSchool, talkTo } from './helpers';

for (const viewport of [
  { width: 1100, height: 720 },
  { width: 375, height: 812 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ hasTouch: viewport.width < 500 });
    test(`activity chooser preserves default routes, closes and opens a registered activity at ${viewport.width}px`, async ({ page, context }) => {
      await page.setViewportSize(viewport);
      await enterSchool(page);
      await page.getByTestId('discover-ok').click();
      await context.setOffline(true);
      await talkTo(page, 'nova');
      await expect(page.getByTestId('choice-go')).toBeVisible();
      await page.getByTestId('choose-teacher-activity').click();
      const chooser = page.getByTestId('teacher-activity-chooser');
      await expect(chooser).toBeVisible();
      await expect(page.getByTestId('choice-sink-float')).toBeFocused();
      await page.getByTestId('choice-sink-float').press('Escape');
      await expect(chooser).toHaveCount(0);
      await expect(page.getByTestId('choice-go')).toBeVisible();
      await page.getByTestId('choose-teacher-activity').click();
      if (viewport.width < 500) await page.getByTestId('choice-globe').tap();
      else await page.getByTestId('choice-globe').press('Enter');
      await expect(page.getByRole('button', { name: 'US states', exact: false })).toBeVisible();
      await page.getByTestId('dialogue-close').click();
      await talkTo(page, 'nova');
      await page.getByTestId('choice-go').click();
      await expect(page.locator('.lesson-play')).toBeVisible();
      await expect(page.getByTestId('choose-teacher-activity')).toHaveCount(0);
      await page.getByTestId('dialogue-close').click();
      await talkTo(page, 'digit');
      await page.getByTestId('choice-go').click();
      await expect(page.locator('.lesson-play')).toBeVisible();
    });
  });
}
