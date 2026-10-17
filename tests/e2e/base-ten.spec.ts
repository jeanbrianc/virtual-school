import { expect, test, type Page } from 'playwright/test';
import { enterSchool, talkTo, unlockParent } from './helpers';

async function openChallenge(page: Page) {
  await talkTo(page, 'digit');
  await page.getByTestId('choose-teacher-activity').click();
  await page.getByTestId('choice-base-ten-mission').click();
  await expect(page.getByText('Optional challenge: numbers 20–99.')).toBeVisible();
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('izzys-classroom');
      r.onsuccess = () => resolve(r.result);
    });
    const read = <T>(table: string) =>
      new Promise<T[]>((resolve) => {
        const r = db.transaction(table).objectStore(table).getAll();
        r.onsuccess = () => resolve(r.result);
      });
    try {
      return {
        lessons: await read<import('../../src/domain/types').LessonAttempt>('lessonAttempts'),
        evidence: await read<import('../../src/domain/types').Evidence>('evidence'),
      };
    } finally {
      db.close();
    }
  });
}
async function correctChoice(page: Page) {
  const line = await page.getByTestId('dialogue-line').locator('.sr-only').textContent();
  const number = Number((await page.locator('.base-ten-number').textContent())!);
  return String(line!.includes('How many tens') ? Math.floor(number / 10) : number % 10);
}

test('optional offline challenge saves support, model and skips exactly once; review stays separate after reload', async ({ page, context, isMobile }) => {
  const width = isMobile ? 375 : 1100;
  if (isMobile) await page.setViewportSize({ width: 375, height: 812 });
  await enterSchool(page);
  page.setDefaultTimeout(30_000);
  await page.getByTestId('discover-ok').click();
  await openChallenge(page);
  expect((await records(page)).lessons.filter((l) => l.lessonId === 'base-ten-mission')).toHaveLength(0);
  await page.getByRole('button', { name: 'Grown-up choices', exact: true }).click();
  await unlockParent(page);
  await page.getByRole('combobox', { name: 'Goal', exact: true }).selectOption('0');
  await page.getByRole('combobox', { name: 'Practice purpose', exact: true }).selectOption('learning');
  await page.getByRole('button', { name: 'Start chosen goal' }).click();
  await context.setOffline(true);
  await expect(page.locator('.base-ten-goal')).toContainText('Round 1 of 5');
  await expect(page.locator('.base-ten-stage h3')).toHaveText(['Tens', 'Ones']);
  await expect(page.getByRole('region', { name: /[0-9]+ tens/ })).toHaveCount(0);
  await page.getByTestId('base-ten-stage').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/base-ten-assessment-${width}.png` });
  let answer = await correctChoice(page);
  if (width === 375) await page.getByTestId(`choice-${answer}`).tap();
  else await page.getByTestId(`choice-${answer}`).press('Enter');
  await page.getByRole('button', { name: 'Try a new number' }).click();
  await page.getByRole('button', { name: 'Show a hint', exact: true }).click();
  await expect(page.locator('.base-ten-stage h3').first()).toHaveText(/^[2-9] tens$/);
  await page.getByTestId('base-ten-stage').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/base-ten-hinted-${width}.png` });
  // The hint replaces the prompt; this is the second round, asking for ones.
  answer = String(Number(await page.locator('.base-ten-number').textContent()) % 10);
  await page.getByTestId(`choice-${answer}`).click();
  await page.getByRole('button', { name: 'Try a new number' }).click();
  await page.getByRole('button', { name: 'Smaller example', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to my number' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to my number' }).click();
  await page.getByRole('button', { name: 'Work it out together', exact: true }).click();
  await page.getByRole('button', { name: 'Try a new number' }).click();
  await page.getByRole('button', { name: 'Skip this round' }).click();
  await page.getByRole('button', { name: 'Try a new number' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  answer = await correctChoice(page);
  await page.getByTestId(`choice-${answer}`).click();
  await page.getByRole('button', { name: 'Finish mission' }).click();
  const saved = await records(page);
  const mission = saved.lessons.filter((l) => l.lessonId === 'base-ten-mission');
  expect(mission).toHaveLength(1);
  expect(mission[0]!.complete).toBe(true);
  expect(mission[0]!.problems.map((p) => p.outcome)).toEqual(['independent', 'supported', 'not_yet', 'skipped', 'independent']);
  const evidence = saved.evidence.filter((e) => e.source.id === mission[0]!.id);
  expect(evidence).toHaveLength(4);
  await page.getByRole('button', { name: 'Review this goal again' }).click();
  await page.getByRole('button', { name: 'Skip this round' }).click();
  await page.getByRole('button', { name: 'Try a new number' }).click();
  if (width === 375) await page.setViewportSize({ width: 667, height: 375 });
  await page.screenshot({ path: `test-results/base-ten-${width}.png` });
  await page.getByTestId('dialogue-close').click();
  const beforeReload = await records(page);
  expect(beforeReload.lessons.filter((l) => l.lessonId === 'base-ten-mission')).toHaveLength(2);
  const review = beforeReload.lessons.find((l) => l.practiceMode === 'review')!;
  expect(review.complete).toBe(false);
  expect(beforeReload.evidence.filter((e) => e.source.id === review.id)).toHaveLength(0);
  await context.setOffline(false);
  await page.reload();
  expect((await records(page)).lessons.filter((l) => l.lessonId === 'base-ten-mission')).toEqual(
    beforeReload.lessons.filter((l) => l.lessonId === 'base-ten-mission'),
  );
  await page.waitForFunction(() => window.__izzy?.game()?.busy === false, null, { timeout: 300_000 });
  await openChallenge(page);
  await page.getByTestId('dialogue-close').click();
  expect((await records(page)).lessons.filter((l) => l.lessonId === 'base-ten-mission')).toHaveLength(2);
});
