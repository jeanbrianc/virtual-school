import { expect, test, type Page } from 'playwright/test';
import { enterSchool, talkTo } from './helpers';
async function openGlobe(page: Page) {
  await talkTo(page, 'globe');
  if (await page.getByTestId('discover-ok').count()) {
    await page.getByRole('button', { name: 'Explore with Nova', exact: false }).click();
  }
  await expect(page.getByRole('button', { name: 'US states', exact: false })).toBeVisible();
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('izzys-classroom');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<import('../../src/domain/types').LessonAttempt[]>((resolve) => {
        const r = db.transaction('lessonAttempts').objectStore('lessonAttempts').getAll();
        r.onsuccess = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
}
test('five offline rounds retain retries, hint and skipped outcomes under Nova after reload', async ({ page, context }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await openGlobe(page);
  await page.getByRole('button', { name: 'US states', exact: false }).click();
  await context.setOffline(true);
  await page.getByLabel('Pick a place on the map').selectOption('Ohio');
  await expect(page.getByTestId('dialogue-line')).toContainText('That’s Ohio');
  await page.getByRole('button', { name: 'Show me a hint', exact: false }).click();
  await page.getByRole('button', { name: 'Michigan', exact: true }).press('Enter');
  await expect(page.getByTestId('dialogue-line')).toContainText('Yes!');
  await page.getByRole('button', { name: 'Next place!', exact: false }).click();
  await page.getByRole('button', { name: 'Skip this place', exact: false }).click();
  await expect(page.getByTestId('dialogue-line')).toContainText('We skipped');
  await page.getByRole('button', { name: 'Next place!', exact: false }).click();
  for (let i = 2; i < 5; i++) {
    const line = await page.getByTestId('dialogue-line').locator('.sr-only').textContent();
    const target = /Can you find (.*?)\?/.exec(line!)![1]!;
    await page.getByLabel('Pick a place on the map').selectOption(target);
    await expect(page.getByTestId('dialogue-line')).toContainText('Yes!');
    await page.getByRole('button', { name: i === 4 ? 'Finish exploring!' : 'Next place!', exact: false }).click();
  }
  const saved = (await records(page)).filter((r) => r.lessonId === 'globe-states');
  expect(saved).toHaveLength(1);
  expect(saved[0]!.teacherId).toBe('nova');
  expect(saved[0]!.complete).toBe(true);
  expect(saved[0]!.problems.map((p) => p.outcome)).toEqual(['supported', 'skipped', 'independent', 'independent', 'independent']);
  await context.setOffline(false);
  await page.reload();
  expect((await records(page)).filter((r) => r.lessonId === 'globe-states')).toEqual(saved);
});
test('phone portrait and narrow landscape offer countries, cancel/reopen and no save from exposure', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await openGlobe(page);
  await page.getByRole('button', { name: 'World countries', exact: false }).click();
  await expect(page.getByLabel('Pick a place on the map')).toBeVisible();
  expect(await page.getByLabel('Pick a place on the map').locator('option').count()).toBe(12);
  await page.getByTestId('dialogue-close').click();
  expect(await records(page)).toHaveLength(0);
  await page.setViewportSize({ width: 667, height: 375 });
  await openGlobe(page);
  await page.getByRole('button', { name: 'US states', exact: false }).click();
  await expect(page.getByLabel('Pick a place on the map')).toBeVisible();
  await page.getByTestId('dialogue-close').click();
  expect(await records(page)).toHaveLength(0);
});

test('two live tabs save a synthetic globe session once', async ({ page, context }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  const other = await context.newPage();
  await enterSchool(other);
  const run = {
    id: 'synthetic-globe-race',
    lessonId: 'globe-states' as const,
    startedAt: '2026-01-01T00:00:00.000Z',
    complete: true,
    problems: ['Michigan', 'Ohio', 'Alabama', 'Alaska', 'Hawaii'].map((name, i) => ({
      problemId: `round-${i}`,
      skillId: 'geography.states',
      tier: 0,
      prompt: `Find ${name}`,
      responses: [name],
      scaffolds: [],
      outcome: 'independent' as const,
    })),
  };
  await Promise.all(
    [page, other].map((tab) =>
      tab.evaluate(async (input) => {
        await window.__izzy!.savePractice(input);
      }, run),
    ),
  );
  expect((await records(page)).filter((r) => r.id === run.id)).toHaveLength(1);
  await page.reload();
  expect((await records(page)).filter((r) => r.id === run.id)).toHaveLength(1);
  await other.close();
});
