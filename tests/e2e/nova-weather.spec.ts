import { expect, test, type Page, type TestInfo, type Locator } from 'playwright/test';
import type { Child, Household, Evidence, LessonAttempt } from '../../src/domain/types';
import { DB_NAME } from '../../src/data/schema';
import { APP, enterSchool, talkTo } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

test.use({ actionTimeout: 30_000 });
test.setTimeout(360_000);
async function loadSample(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        speak() {
          throw new Error('Synthetic unavailable voice');
        },
      },
    });
  });
  await useSyntheticHousehold(page);
  await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['households', 'children'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        const households = tx.objectStore('households'),
          children = tx.objectStore('children');
        const hr = households.getAll();
        hr.onsuccess = () => {
          for (const h of hr.result as Household[])
            households.put({ ...h, settings: { ...h.settings, talkMode: 'off', readAloud: true, audio: { ...h.settings.audio, muted: false } } });
        };
        const cr = children.getAll();
        cr.onsuccess = () => {
          for (const c of cr.result as Child[]) children.put({ ...c, status: 'active', explored: ['nova'] });
        };
      });
    } finally {
      db.close();
    }
  }, DB_NAME);
  await page.reload();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
  await enterSchool(page, 'sample');
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
async function activate(button: Locator, info: TestInfo) {
  await expect(button).toBeEnabled();
  if (info.project.name === 'phone') await button.tap();
  else {
    await button.focus();
    await button.press('Enter');
  }
}
async function openLab(page: Page, info: TestInfo, tier = 0) {
  await talkTo(page, 'nova');
  await expect(page.getByTestId('choose-teacher-activity')).toBeVisible();
  await activate(page.getByTestId('choose-teacher-activity'), info);
  await activate(page.getByTestId('choice-weather-pictures'), info);
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toHaveCount(0);
  await activate(page.getByTestId(`choice-weather-level-${tier}`), info);
}
async function answerId(page: Page) {
  const pictures = (await page.locator('.weather-stage').getAttribute('data-pictures'))!.split(',');
  return [...new Set(pictures)].sort((a, b) => pictures.filter((p) => p === b).length - pictures.filter((p) => p === a).length)[0]!;
}
async function solve(page: Page, info: TestInfo, round: number) {
  await expect(page.locator('.weather-progress')).toHaveAttribute('aria-label', `Round ${round + 1} of 4`);
  await activate(page.getByTestId(`weather-choice-${await answerId(page)}`), info);
  await activate(page.getByTestId('weather-next'), info);
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('body')).not.toContainText('Izzy');
  const path = info.outputPath(`${name}-${info.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function geometry(page: Page) {
  const box = await page.locator('.weather-choice').first().boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(100);
  expect(box!.height).toBeGreaterThanOrEqual(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
}

test('both offline levels, keyboard/phone tap, save-before-switch, repeated finish, reload and sibling scope', async ({ page, context }, info) => {
  const providerCalls: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/(?:chat|speech|transcribe)/.test(r.url())) providerCalls.push(r.url());
  });
  await loadSample(page);
  await context.setOffline(true);
  await openLab(page, info);
  await expect(page.locator('.weather-choice')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Read it to me' })).toHaveCount(0);
  await geometry(page);
  await screenshot(page, info, 'weather-matching');
  for (let round = 0; round < 4; round++) await solve(page, info, round);
  await activate(page.getByTestId('choice-weather-level'), info);
  await expect(page.getByLabel('Made-up weather picture chart')).toBeVisible();
  expect((await records(page)).lessons).toHaveLength(1);
  await geometry(page);
  await screenshot(page, info, 'weather-fictional-chart');
  for (let round = 0; round < 4; round++) await solve(page, info, round);
  await expect(page.locator('.weather-ceiling')).toContainText('does not record real weather observations');
  await screenshot(page, info, 'weather-ceiling');
  await page.getByTestId('choice-weather-finish').dblclick();
  await expect(page.getByTestId('dialogue-close')).toHaveCount(0);
  const saved = await records(page);
  expect(saved.lessons).toHaveLength(2);
  expect(saved.lessons.every((l) => l.childId === 'child_izzy' && l.lessonId === 'weather-pictures')).toBeTruthy();
  expect(
    saved.evidence
      .filter((e) => e.skillId.startsWith('sci.'))
      .map((e) => e.skillId)
      .sort(),
  ).toEqual(['sci.weather-chart-compare', 'sci.weather-picture-match']);
  await context.setOffline(false);
  await page.reload();
  expect((await records(page)).lessons).toHaveLength(2);
  await page.goto(`${APP}#/`);
  await enterSchool(page, 'sample sibling');
  expect((await records(page)).evidence.filter((e) => e.childId === 'child_georgia')).toHaveLength(0);
  expect(providerCalls).toEqual([]);
});

test('retry, repeated hints/model, skip, blur, discard/cancel/reopen, replay and both older Nova labs', async ({ page, context }, info) => {
  await loadSample(page);
  await context.setOffline(true);
  await openLab(page, info, 1);
  const answer = await answerId(page);
  // Select by the exact attribute rather than relying on symbol order.
  await activate(page.locator(`.weather-choice:not([data-testid="weather-choice-${answer}"])`), info);
  await activate(page.getByRole('button', { name: /Hint/ }), info);
  await activate(page.getByRole('button', { name: /Hint/ }), info);
  await activate(page.getByRole('button', { name: /Show the model/ }), info);
  await expect(page.getByLabel('Worked sky picture model')).toBeVisible();
  await screenshot(page, info, 'weather-supported-chart');
  await solve(page, info, 0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await activate(page.getByRole('button', { name: 'Skip this round', exact: true }), info);
  await activate(page.getByRole('button', { name: /Change level/ }), info);
  await expect(page.getByTestId('dialogue-line')).toContainText('discarded');
  await activate(page.getByTestId('choice-weather-keep'), info);
  await expect(page.locator('.weather-progress')).toHaveAttribute('aria-label', 'Round 3 of 4');
  await activate(page.getByRole('button', { name: /Change level/ }), info);
  await activate(page.getByTestId('choice-weather-discard'), info);
  await expect(page.getByLabel('Made-up sky picture', { exact: true })).toBeVisible();
  expect((await records(page)).lessons).toHaveLength(0);
  await page.getByTestId('dialogue-close').click();
  await activate(page.getByTestId('choice-weather-discard'), info);
  await openLab(page, info);
  await activate(page.getByRole('button', { name: /Show the model/ }), info);
  await solve(page, info, 0);
  await activate(page.getByRole('button', { name: 'Skip this round', exact: true }), info);
  await solve(page, info, 2);
  await solve(page, info, 3);
  await activate(page.getByTestId('choice-weather-replay'), info);
  await expect(page.locator('.weather-progress')).toHaveAttribute('aria-label', 'Round 1 of 4');
  const saved = await records(page);
  expect(saved.lessons).toHaveLength(1);
  expect(saved.evidence.find((e) => e.skillId === 'sci.weather-picture-match')!.trials).toEqual({ independent: 2, supported: 1, notYet: 0 });
  await page.getByTestId('dialogue-close').click();
  await activate(page.getByTestId('choice-weather-discard'), info);
  await talkTo(page, 'nova');
  await activate(page.getByTestId('choice-go'), info);
  await expect(page.locator('.tank-stage')).toBeVisible();
  await page.getByTestId('dialogue-close').click();
  await talkTo(page, 'nova');
  await activate(page.getByTestId('choose-teacher-activity'), info);
  await activate(page.getByTestId('choice-life-cycle'), info);
  await activate(page.getByTestId('choice-go'), info);
  await expect(page.locator('.life-stage')).toBeVisible();
  await page.getByTestId('dialogue-close').click();
  expect((await records(page)).lessons).toHaveLength(1);
});
