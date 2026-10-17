import { expect, test, type Page, type TestInfo, type Locator } from 'playwright/test';
import { DB_NAME } from '../../src/data/schema';
import type { Evidence, LessonAttempt } from '../../src/domain/types';
import { APP, enterSchool, talkTo, unlockParent } from './helpers';
import { loadRoutineSample } from './fixtures/routineSample';

test.use({ actionTimeout: 30_000 });
test.setTimeout(420_000);
async function activate(button: Locator, info: TestInfo) {
  await expect(button).toBeEnabled();
  if (info.project.name === 'phone') await button.tap();
  else {
    await button.focus();
    await button.press('Enter');
  }
}
async function records(page: Page) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const read = <T>(table: string) =>
      new Promise<T[]>((resolve, reject) => {
        const r = db.transaction(table).objectStore(table).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    try {
      return { lessons: await read<LessonAttempt>('lessonAttempts'), evidence: await read<Evidence>('evidence') };
    } finally {
      db.close();
    }
  }, DB_NAME);
}
async function open(page: Page, info: TestInfo, size = 2) {
  await page.waitForFunction(() => window.__izzy?.game()?.busy === false, null, { timeout: 180_000 });
  await talkTo(page, 'tavi');
  await expect(page.getByTestId('routine-start-2')).toBeVisible();
  if (size !== 2) await activate(page.getByRole('button', { name: 'Learner / grown-up level choice' }), info);
  await activate(page.getByTestId(`routine-start-${size}`), info);
}
async function arrange(page: Page, info: TestInfo, order: string[]) {
  for (let i = 0; i < order.length; i++) {
    await activate(page.getByTestId(`routine-card-${order[i]}`), info);
    await activate(page.getByTestId(`routine-slot-${i}`), info);
  }
}
async function solve(page: Page, info: TestInfo, size = 2, alternate = false) {
  const order =
    size === 2 ? ['open', 'first'] : size === 3 ? ['open', 'first', 'close'] : ['open', ...(alternate ? ['second', 'first'] : ['first', 'second']), 'close'];
  await arrange(page, info, order);
  await activate(page.getByTestId('routine-check'), info);
  await expect(page.getByTestId('routine-next')).toBeVisible();
  await activate(page.getByTestId('routine-next'), info);
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}-${info.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('offline tap/keyboard steps, explicit 2→3→4 offers, valid alternative orders, duplicate saves and parent evidence', async ({ page, context }, info) => {
  await loadRoutineSample(page);
  await context.setOffline(true);
  await open(page, info);
  await expect(page.getByRole('dialog', { name: 'Talking with Tavi' })).toBeVisible();
  expect(await page.evaluate(() => window.__izzy!.explored())).toContain('tavi');
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toHaveCount(0);
  await screenshot(page, info, 'two-picture-start');
  // Select and move a placed card, using the same controls with real touch or keyboard.
  await arrange(page, info, ['first', 'open']);
  await activate(page.getByTestId('routine-card-open'), info);
  await activate(page.getByTestId('routine-slot-0'), info);
  await expect(page.getByTestId('routine-slot-1')).toHaveAccessibleName(/Put paper/);
  await activate(page.getByTestId('routine-check'), info);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('routine-round')).toContainText('Round 1 of 2');
  await activate(page.getByTestId('routine-next'), info);
  await solve(page, info);
  await activate(page.getByTestId('routine-next-level'), info);
  await expect(page.getByTestId('routine-round')).toContainText('3 pictures');
  expect((await records(page)).lessons).toHaveLength(1);
  await solve(page, info, 3);
  await solve(page, info, 3);
  await activate(page.getByTestId('routine-next-level'), info);
  await expect(page.getByTestId('routine-round')).toContainText('4 pictures');
  await screenshot(page, info, 'four-picture-choice');
  await solve(page, info, 4);
  await solve(page, info, 4, true);
  await expect(page.getByTestId('routine-next-level')).toHaveCount(0);
  await activate(page.getByRole('button', { name: 'I noticed more than one order can work.' }), info);
  await screenshot(page, info, 'completed-reflection');
  await page.getByTestId('routine-save').dblclick();
  await expect.poll(async () => (await records(page)).lessons.length).toBe(3);
  const saved = await records(page);
  expect(saved.lessons.every((l) => l.childId === 'child_izzy' && l.lessonId === 'everyday-sequencing')).toBeTruthy();
  expect(saved.evidence).toHaveLength(12);
  expect(
    saved.evidence.every(
      (e) => e.childId === 'child_izzy' && e.trials.independent === 1 && ['reason.routine-constraints', 'life.fictional-routine'].includes(e.skillId),
    ),
  ).toBeTruthy();
  expect(saved.lessons.every((l) => l.summary.includes(info.project.name === 'phone' ? 'touch' : 'keyboard-or-assistive'))).toBeTruthy();
  await context.setOffline(false);
  await page.goto(`${APP}#/parent/conversations`);
  await unlockParent(page);
  await expect(page.getByText('Fictional picture ordering only', { exact: false }).first()).toBeVisible();
  await screenshot(page, info, 'parent-record');
  await page.reload();
  expect((await records(page)).lessons).toHaveLength(3);
  await enterSchool(page, 'sample sibling');
  expect((await records(page)).evidence.filter((e) => e.childId === 'child_georgia')).toHaveLength(0);
});

test('incomplete, invalid, model, simpler, interruption, skip, replay, cancel and reload are gentle and honest', async ({ page, context }, info) => {
  await loadRoutineSample(page);
  await context.setOffline(true);
  await open(page, info, 4);
  await activate(page.getByTestId('routine-check'), info);
  await expect(page.getByTestId('dialogue-line')).toContainText('each space');
  await arrange(page, info, ['close', 'first', 'second', 'open']);
  await activate(page.getByTestId('routine-check'), info);
  await expect(page.getByLabel('Before and after picture clue')).toBeVisible();
  await activate(page.getByRole('button', { name: /Show a model/ }), info);
  await expect(page.getByLabel('One valid picture model')).toBeVisible();
  await screenshot(page, info, 'supported-model');
  await activate(page.getByRole('button', { name: 'Simpler · restart this round' }), info);
  await expect(page.getByTestId('routine-round')).toContainText('2 pictures');
  await solve(page, info);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('routine-check')).toBeDisabled();
  await activate(page.getByRole('button', { name: 'Resume pictures' }), info);
  await activate(page.getByRole('button', { name: 'Skip this round' }), info);
  await activate(page.getByTestId('routine-next'), info);
  await expect(page.getByTestId('routine-next-level')).toHaveCount(0);
  await activate(page.getByRole('button', { name: 'Save & play again' }), info);
  const saved = await records(page);
  expect(saved.lessons).toHaveLength(1);
  expect(saved.evidence).toHaveLength(2);
  expect(saved.evidence.every((e) => e.trials.supported === 1 && e.statement.includes('2 fictional'))).toBeTruthy();
  await expect(page.getByTestId('routine-round')).toContainText('4 pictures');
  await activate(page.getByRole('button', { name: 'Replay · discard this run' }), info);
  await page.getByTestId('dialogue-close').click();
  expect((await records(page)).lessons).toHaveLength(1);
  await open(page, info);
  await solve(page, info);
  await page.getByTestId('dialogue-close').click();
  await context.setOffline(false);
  await page.reload();
  await page.waitForFunction(() => window.__izzy?.game()?.busy === false, null, { timeout: 180_000 });
  expect((await records(page)).lessons).toHaveLength(1);
  await open(page, info);
  await expect(page.getByTestId('routine-round')).toContainText('Round 1 of 2');
  await page.getByTestId('dialogue-close').press('Escape');
  await expect(page.getByTestId('routine-flow')).toHaveCount(0);
});

test('new teacher placement leaves existing teachers, globe, dance, keyboard and bookshelf usable', async ({ page }, info) => {
  await loadRoutineSample(page);
  await screenshot(page, info, 'school-with-tavi');
  for (const id of ['hoot', 'digit', 'nova', 'pippa']) {
    await talkTo(page, id);
    await expect(page.locator(`[data-teacher="${id}"]`)).toBeVisible();
    if (id !== 'hoot') {
      await page.getByTestId('choice-go').click();
      await expect(page.locator('.lesson-play')).toBeVisible();
    }
    await page.getByTestId('dialogue-close').click();
    await page.waitForFunction(() => window.__izzy?.game()?.busy === false, null, { timeout: 180_000 });
  }
  await talkTo(page, 'globe');
  if (await page.getByTestId('discover-ok').count()) {
    await page.getByTestId('discover-ok').click();
    await talkTo(page, 'globe');
  }
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('dialogue-close').click();
  await talkTo(page, 'alphabet');
  if (await page.getByTestId('discover-ok').count()) {
    await page.getByTestId('discover-ok').click();
    await talkTo(page, 'alphabet');
  }
  await expect(page.getByTestId('keyboard-trail')).toBeVisible();
  await page.getByRole('button', { name: 'Back to school' }).click();
  await page.evaluate(() => window.__izzy!.stepOn(1));
  await expect(page.getByTestId('circuit-hud')).toBeVisible();
  await page.getByRole('button', { name: 'Stop the circuit' }).click();
  await talkTo(page, 'bookshelf');
  if (await page.getByTestId('discover-ok').count()) {
    await page.getByTestId('discover-ok').click();
    await talkTo(page, 'bookshelf');
  }
  await expect(page.getByRole('dialog')).toBeVisible();
});
