import { expect, test } from 'playwright/test';
import { captureSyntheticSuccess } from './synthetic-household';
import { talkTo } from './helpers';
import { loadRoutineSample } from './fixtures/routineSample';
test.use({ actionTimeout: 30_000 });
test('existing teachers keep their introductions and working offline activities', async ({ page }) => {
  await loadRoutineSample(page);
  expect(
    await page.evaluate(() => {
      const g = window.__izzy!.game() as unknown as { world: { teachers: Map<string, { id: string }> } };
      return [...g.world.teachers].map(([id, model]) => [id, model.id]);
    }),
  ).toEqual([
    ['hoot', 'hoot'],
    ['digit', 'digit'],
    ['pippa', 'pippa'],
    ['nova', 'nova'],
  ]);
  for (const [id, name] of [
    ['hoot', 'Professor Hoot'],
    ['digit', 'Digit'],
    ['nova', 'Nova'],
    ['pippa', 'Pippa'],
  ]) {
    await talkTo(page, id!);
    await expect(page.getByRole('dialog', { name: `Talking with ${name}` })).toBeVisible();
    await expect(page.getByTestId('dialogue-line')).toContainText(name!);
    if (id !== 'hoot') {
      await page.getByTestId('choice-go').click();
      await expect(page.locator('.lesson-play')).toBeVisible();
    } else await expect(page.getByTestId('choice-finish')).toBeVisible();
    await page.getByTestId('dialogue-close').click();
  }
});

test.afterEach(async ({ page }, info) => captureSyntheticSuccess(page, info));
