import { expect, test, type Page } from 'playwright/test';
import { APP, enterSchool, talkTo, unlockParent } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

test.beforeEach(async ({ page }) => useSyntheticHousehold(page));
async function openWorkshop(page: Page) {
  await talkTo(page, 'digit');
  await page.getByTestId('choose-teacher-activity').click();
  await page.getByTestId('choice-base-ten-arithmetic').click();
  await expect(page.getByText('Optional Base-ten Workshop · no trading · 4 rounds.')).toBeVisible();
}
async function choose(page: Page, tier: '0' | '1', mode: 'learning' | 'review') {
  await page.getByRole('button', { name: 'Grown-up: choose challenge', exact: true }).click();
  await unlockParent(page);
  await page.getByRole('combobox', { name: 'Practice purpose', exact: true }).selectOption(mode);
  await page.getByTestId(`choice-${tier}`).click();
  if (tier === '1') await page.getByRole('button', { name: 'See the taking-away example next' }).click();
  await page.getByRole('button', { name: 'Try four fresh problems' }).click();
}
async function answer(page: Page) {
  const equation = await page.locator('.arithmetic-equation').textContent();
  const match = /(\d+)\s*([+−])\s*(\d+)/.exec(equation!)!;
  return String(match[2] === '+' ? Number(match[1]) + Number(match[3]) : Number(match[1]) - Number(match[3]));
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

test('offline arithmetic keeps independent, supported, modeled and skipped rounds distinct on desktop and touch', async ({ page, context, isMobile }) => {
  await enterSchool(page, 'sample');
  page.setDefaultTimeout(30_000);
  await page.getByTestId('discover-ok').click();
  // A nearby Digit place-value record must not replace the arithmetic run in parent details.
  await talkTo(page, 'digit');
  await page.getByTestId('choose-teacher-activity').click();
  await page.getByTestId('choice-base-ten-mission').click();
  await page.getByTestId('choice-start').click();
  await page.getByRole('button', { name: 'Skip this round' }).click();
  await page.getByTestId('dialogue-close').click();
  await openWorkshop(page);
  await expect(page.getByTestId('choice-0')).toHaveCount(0);
  await expect(page.locator('.arithmetic-equation')).toContainText('23 + 14 = 37');
  await page.getByRole('button', { name: 'See taking-away model' }).click();
  await expect(page.locator('.arithmetic-equation')).toContainText('46 − 12 = 34');
  await page.screenshot({ path: `test-results/arithmetic-model-${isMobile ? 'phone' : 'desktop'}.png` });
  await choose(page, '1', 'learning');
  const outgoing: string[] = [];
  page.on('request', (request) => {
    if (/\/v1\/(teacher|speak|listen|interpret)/.test(request.url())) outgoing.push(request.url());
  });
  await context.setOffline(true);
  await expect(page.locator('.base-ten-goal')).toContainText('Round 1 of 4');
  await expect(page.locator('.arithmetic-equation')).toContainText('= ?');
  await expect(page.locator('.arithmetic-result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Listen|Read aloud|microphone/i })).toHaveCount(0);
  await page.getByTestId('arithmetic-stage').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/arithmetic-assessment-${isMobile ? 'phone' : 'desktop'}.png` });
  let correct = await answer(page);
  if (isMobile) await page.getByTestId(`choice-${correct}`).tap();
  else await page.getByTestId(`choice-${correct}`).press('Enter');
  await page.getByRole('button', { name: 'Try a fresh problem' }).click();
  await expect(page.locator('.arithmetic-equation')).toContainText('−');
  correct = await answer(page);
  await page.getByRole('button', { name: 'Show a hint', exact: true }).click();
  await expect(page.locator('.arithmetic-result')).toHaveCount(0);
  await page.getByTestId(`choice-${correct}`).click();
  await page.getByRole('button', { name: 'Try a fresh problem' }).click();
  await page.getByRole('button', { name: 'Smaller example', exact: true }).click();
  await expect(page.locator('.arithmetic-equation')).toContainText('11 + 12 = 23');
  await page.getByRole('button', { name: 'Back to my problem' }).click();
  await expect(page.locator('.arithmetic-equation')).toContainText('= ?');
  await page.getByRole('button', { name: 'Work it out together', exact: true }).click();
  await page.getByTestId('arithmetic-stage').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/arithmetic-worked-${isMobile ? 'phone' : 'desktop'}.png` });
  await page.getByRole('button', { name: 'Try a fresh problem' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: 'Skip this round' }).click();
  await page.getByRole('button', { name: 'Finish mission' }).click();
  const saved = await records(page);
  const mission = saved.lessons.filter((l) => l.lessonId === 'base-ten-arithmetic');
  expect(mission).toHaveLength(1);
  expect(mission[0]!.problems.map((p) => p.outcome)).toEqual(['independent', 'supported', 'model_only', 'skipped']);
  expect(saved.evidence.filter((e) => e.source.id === mission[0]!.id)).toHaveLength(2);
  expect(mission[0]!.complete).toBe(true);
  await page.getByRole('button', { name: 'Fresh-item review again' }).click();
  await page.getByRole('button', { name: 'Skip this round' }).click();
  await page.getByRole('button', { name: 'Try a fresh problem' }).click();
  if (isMobile) await page.setViewportSize({ width: 667, height: 375 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/arithmetic-revisit-${isMobile ? 'phone' : 'desktop'}.png` });
  await page.getByTestId('dialogue-close').click();
  expect(outgoing).toEqual([]);
  const before = await records(page);
  const review = before.lessons.find((l) => l.lessonId === 'base-ten-arithmetic' && l.practiceMode === 'review')!;
  expect(review.complete).toBe(false);
  expect(before.evidence.filter((e) => e.source.id === review.id)).toHaveLength(0);
  await context.setOffline(false);
  await page.reload();
  expect((await records(page)).lessons).toEqual(before.lessons);
  await page.waitForFunction(() => window.__izzy?.game()?.busy === false, null, { timeout: 300_000 });
  await openWorkshop(page);
  await page.getByTestId('dialogue-close').click();
  expect((await records(page)).lessons).toEqual(before.lessons);
  if (isMobile) await page.setViewportSize({ width: 393, height: 851 });
  await page.goto(`${APP}#/parent/conversations`);
  await unlockParent(page);
  const arithmeticCard = page.locator('.convo').filter({ hasText: '1 model-only (ungraded)' });
  await expect(arithmeticCard).toHaveCount(1);
  await arithmeticCard.locator('.convo-head').click();
  await expect(arithmeticCard.locator('.lesson-detail')).toContainText(mission[0]!.problems[2]!.prompt);
  await expect(arithmeticCard.getByText('Viewed model · ungraded', { exact: true })).toBeVisible();
  await expect(arithmeticCard.locator('.lesson-detail')).not.toContainText('Identify tens and ones');
  await arithmeticCard.getByText('Viewed model · ungraded', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/arithmetic-parent-record-${isMobile ? 'phone' : 'desktop'}.png` });
});

test('cancelled parent choice and cancelled fresh attempt save nothing; addition choice stays addition only', async ({ page }) => {
  await enterSchool(page, 'sample');
  page.setDefaultTimeout(30_000);
  await page.getByTestId('discover-ok').click();
  await openWorkshop(page);
  await page.getByRole('button', { name: 'Grown-up: choose challenge' }).click();
  await page.getByRole('dialog', { name: 'Grown-ups only' }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('choice-0')).toHaveCount(0);
  await choose(page, '0', 'review');
  await expect(page.locator('.arithmetic-equation')).toContainText('+');
  await page.getByTestId('dialogue-close').click();
  expect((await records(page)).lessons.filter((l) => l.lessonId === 'base-ten-arithmetic')).toHaveLength(0);
  await openWorkshop(page);
  await choose(page, '0', 'review');
  for (let round = 0; round < 4; round++) {
    await expect(page.locator('.arithmetic-equation')).toContainText('+');
    await page.getByTestId(`choice-${await answer(page)}`).click();
    await page.getByRole('button', { name: round === 3 ? 'Finish mission' : 'Try a fresh problem' }).click();
  }
  const saved = await records(page);
  expect(saved.lessons.filter((l) => l.lessonId === 'base-ten-arithmetic')).toHaveLength(1);
  expect(saved.evidence.filter((e) => e.skillId.includes('no-regroup-answer'))).toHaveLength(0);
});
