import { writeFileSync } from 'node:fs';
import { expect, test, type Locator } from 'playwright/test';
import { talkTo } from './helpers';

import { loadRoutineSample } from './fixtures/routineSample';
test.use({ actionTimeout: 30_000 });

async function expectCardsToContainTheirText(chooser: Locator) {
  const cards = chooser.locator('.choice');
  expect(await cards.count()).toBeGreaterThan(0);
  const evidence = [];
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    const bounds = await card.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const inside = (child: DOMRect) =>
        child.left >= rect.left - 1 && child.right <= rect.right + 1 && child.top >= rect.top - 1 && child.bottom <= rect.bottom + 1;
      const children = [...button.querySelectorAll('.choice-icon, .choice-label, .choice-hint')];
      return {
        label: button.textContent,
        minimumTarget: rect.width >= 44 && rect.height >= 44,
        noHorizontalOverflow: button.scrollWidth <= button.clientWidth + 1,
        childrenInside: children.every((child) => inside(child.getBoundingClientRect())),
        textInside: children.every((child) => {
          const range = document.createRange();
          range.selectNodeContents(child);
          return [...range.getClientRects()].every(inside);
        }),
      };
    });
    expect(bounds, `All visible text remains within its own activity card: ${bounds.label}`).toMatchObject({
      minimumTarget: true,
      noHorizontalOverflow: true,
      childrenInside: true,
      textInside: true,
    });
    evidence.push(bounds);
  }
  await chooser.locator('.choice').first().scrollIntoViewIfNeeded();
  return evidence;
}

for (const viewport of [
  { width: 1100, height: 720 },
  { width: 375, height: 812 },
  { width: 320, height: 740 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ hasTouch: viewport.width < 500 });
    test(`activity chooser preserves default routes, closes and opens a registered activity at ${viewport.width}px`, async ({ page, context }, info) => {
      await page.setViewportSize(viewport);
      await loadRoutineSample(page);
      await context.setOffline(true);
      await talkTo(page, 'nova');
      await expect(page.getByTestId('choice-go')).toBeVisible();
      await page.getByTestId('choose-teacher-activity').click();
      const chooser = page.getByTestId('teacher-activity-chooser');
      await expect(chooser.getByRole('dialog')).toBeVisible();
      const evidence = { nova: await expectCardsToContainTheirText(chooser), digit: [] as unknown[], pippa: [] as unknown[] };
      await page.screenshot({ path: `test-results/teacher-chooser-${viewport.width}.png` });
      await expect(page.getByTestId('choice-sink-float')).toBeFocused();
      await page.getByTestId('choice-sink-float').press('Escape');
      await expect(chooser).toHaveCount(0);
      await expect(page.getByTestId('choice-go')).toBeVisible();
      await page.getByTestId('choose-teacher-activity').click();
      if (viewport.width < 500) await page.getByTestId('choice-globe').tap();
      else await page.getByTestId('choice-globe').press('Enter');
      await expect(
        page
          .getByRole('button', { name: 'US states', exact: false })
          .or(page.getByRole('group', { name: 'Three state shapes', exact: true }))
          .first(),
      ).toBeVisible();
      await page.getByTestId('dialogue-close').click();
      await page.waitForFunction(() => !(window.__izzy!.game() as unknown as { rig: { inCinematic: boolean } }).rig.inCinematic);
      await talkTo(page, 'nova');
      await page.getByTestId('choice-go').click();
      await expect(page.locator('.lesson-play')).toBeVisible();
      await expect(page.getByTestId('choose-teacher-activity')).toHaveCount(0);
      await page.getByTestId('dialogue-close').click();
      await talkTo(page, 'digit');
      await page.getByTestId('choice-go').click();
      await expect(page.locator('.lesson-play')).toBeVisible();
      await page.getByTestId('dialogue-close').click();
      for (const teacher of ['digit', 'pippa'] as const) {
        await page.waitForFunction(() => !(window.__izzy!.game() as unknown as { rig: { inCinematic: boolean } }).rig.inCinematic);
        await talkTo(page, teacher);
        await page.getByTestId('choose-teacher-activity').click();
        await expect(chooser.getByRole('dialog')).toBeVisible();
        evidence[teacher] = await expectCardsToContainTheirText(chooser);
        await page.screenshot({ path: `test-results/teacher-chooser-${teacher}-${viewport.width}.png` });
        await expect(chooser.locator('.choice').first()).toBeFocused();
        await chooser.locator('.choice').first().press('Escape');
        await expect(chooser).toHaveCount(0);
        await expect(page.getByTestId('choice-go')).toBeVisible();
        await page.getByTestId('dialogue-close').click();
      }
      const proof = info.outputPath(`teacher-chooser-${viewport.width}-bounds.json`);
      writeFileSync(proof, JSON.stringify({ viewport, cards: evidence }, null, 2));
      await info.attach('Chooser text and touch-target bounds', { path: proof, contentType: 'application/json' });
    });
  });
}
