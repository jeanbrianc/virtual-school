import { expect, test, type Page, type TestInfo, type Locator } from 'playwright/test';
import { Repositories } from '../../src/data/repositories';
import { DB_NAME, TABLES } from '../../src/data/schema';
import { seedFreshHousehold } from '../../src/data/seed/launch';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { fixedClock } from '../../src/domain/util/time';
import { PATTERN_SKILLS } from '../../src/domain/lessons/patternProgression';
import type { Evidence, LessonAttempt } from '../../src/domain/types';
import { APP, dismissCelebrations, enterSchool, talkTo } from './helpers';

test.use({ actionTimeout: 30_000 });
test.setTimeout(360_000);

async function loadSample(page: Page) {
  await page.addInitScript(() => {
    // Deliberately unavailable optional voice capabilities. Picture/touch participation must still work.
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        speak() {
          throw new Error('Voice is unavailable in this synthetic test');
        },
      },
    });
  });
  const db = new MemoryDatabase(TABLES);
  const repos = new Repositories(db);
  const clock = fixedClock('2026-06-01T12:00:00Z');
  await seedFreshHousehold(repos, clock);
  for (const child of await repos.children.all()) {
    const { birthDate: _birthday, sayName: _spokenName, ...sample } = child;
    await repos.children.put({
      ...sample,
      name: child.id === 'child_izzy' ? 'Sample' : 'Sample sibling',
      status: 'active',
      explored: ['pippa', 'nova'],
      isDemo: true,
    });
  }
  for (const parent of await repos.parents.all()) await repos.parents.put({ ...parent, displayName: 'Sample parent' });
  for (const household of await repos.households.all())
    await repos.households.put({
      ...household,
      name: 'Synthetic pattern fixture',
      settings: { ...household.settings, talkMode: 'off', readAloud: false, audio: { ...household.settings.audio, muted: true } },
    });
  await repos.meta.put({ key: 'seed', value: { kind: 'demo', chosenByParent: true, at: clock.now().toISOString() } });
  await page.goto(`${APP}#/`);
  await expect(page.getByTestId('enter-izzy')).toBeVisible();
  await page.evaluate(
    async ({ name, tables }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            tables.map((t) => t.name),
            'readwrite',
          );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          for (const table of tables) {
            const store = tx.objectStore(table.name);
            store.clear();
            for (const row of table.rows) store.put(row);
          }
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, tables: await Promise.all(TABLES.map(async ({ name }) => ({ name, rows: await db.table(name).all() }))) },
  );
  await page.reload();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
  await enterSchool(page, 'sample');
  if (await page.getByTestId('discover-ok').count()) await page.getByTestId('discover-ok').click();
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
      return {
        lessons: await read<LessonAttempt>('lessonAttempts'),
        evidence: await read<Evidence>('evidence'),
        portfolio: await read<{ kind: string }>('portfolio'),
      };
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
async function readyToTalk(page: Page) {
  await page.waitForFunction(() => !!window.__izzy?.game() && window.__izzy.game()!.busy === false, null, { timeout: 180_000 });
}
async function openLab(page: Page, info: TestInfo, tier = 0) {
  await readyToTalk(page);
  await talkTo(page, 'pippa');
  await page.getByTestId('choose-teacher-activity').click();
  await activate(page.getByTestId('choice-pattern-progression'), info);
  await expect(page.getByTestId('pattern-level-0')).toBeVisible();
  await activate(page.getByTestId(`pattern-level-${tier}`), info);
}
async function correctChoice(page: Page) {
  const stage = page.locator('.pattern-playground-stage');
  const shapes = await stage.locator('[data-shape]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-shape')!));
  const unitLength = Number(await stage.getAttribute('data-unit-length'));
  return page.getByTestId(`choice-${shapes[shapes.length % unitLength]}`);
}
async function solveRound(page: Page, info: TestInfo, round: number) {
  await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', `Round ${round + 1} of 4`);
  await activate(await correctChoice(page), info);
  await activate(page.getByTestId('pattern-next'), info);
  if (round < 3) await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', `Round ${round + 2} of 4`);
  else await expect(page.getByTestId('choice-yay')).toBeVisible();
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}-${info.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function completeLegacy(page: Page, info: TestInfo, pattern = false) {
  for (let round = 0; round < 2; round++) {
    await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', `Round ${round + 1} of 3`);
    await expect(page.locator('.shape-model')).toHaveCount(pattern ? 3 : 1);
    const shape = await page
      .locator('.shape-model')
      .nth(pattern ? 1 : 0)
      .getAttribute('data-shape');
    await activate(page.getByTestId(`choice-${shape}`), info);
    await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', `Round ${round + 2} of 3`);
  }
  await expect(page.locator('.shape-paper')).toBeVisible();
  await activate(page.locator('.shape-choice').first(), info);
  await expect(page.getByTestId('choice-yay')).toBeVisible();
}

test('all five explicit levels work offline, save once, and preserve narrow evidence on reload and sibling access', async ({ page, context }, info) => {
  await loadSample(page);
  await context.setOffline(true);
  await openLab(page, info);
  await expect(page.locator('.pattern-playground-stage')).toHaveAttribute('data-matching', 'true');
  await expect(page.locator('.pattern-playground-choice')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Speak' })).toHaveCount(0);
  await screenshot(page, info, 'matching');
  for (let tier = 0; tier < 5; tier++) {
    if (tier > 0) {
      await activate(page.getByTestId(`pattern-level-${tier}`), info);
      await expect(page.locator('.pattern-playground-choice')).toHaveCount(3);
      const box = await page.locator('.pattern-playground-choice').first().boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(64);
      expect(box!.height).toBeGreaterThanOrEqual(120);
      await screenshot(page, info, `pattern-${tier}`);
    }
    for (let round = 0; round < 4; round++) await solveRound(page, info, round);
    if (tier < 4) {
      await page.getByTestId('choice-choose-pattern').dblclick();
      await expect(page.getByTestId('pattern-level-0')).toBeVisible();
      expect((await records(page)).lessons).toHaveLength(tier + 1);
    }
  }
  await page.getByText('Grown-ups: what was practiced?').click();
  await expect(page.locator('.pattern-ceiling')).toContainText('Copying and describing a rule were not assessed');
  await screenshot(page, info, 'completed-scope');
  await page.getByTestId('choice-yay').dblclick();
  await expect.poll(async () => (await records(page)).lessons.length).toBe(5);
  const saved = await records(page);
  expect(saved.lessons.every((l) => l.childId === 'child_izzy' && l.lessonId === 'pattern-progression')).toBeTruthy();
  expect(saved.evidence.map((e) => e.skillId).sort()).toEqual([...PATTERN_SKILLS].sort());
  expect(saved.evidence.every((e) => e.childId === 'child_izzy')).toBeTruthy();
  expect(saved.portfolio).toHaveLength(0);
  await dismissCelebrations(page);
  await context.setOffline(false);
  await page.reload();
  expect((await records(page)).lessons).toHaveLength(5);
  await page.goto(`${APP}#/`);
  await enterSchool(page, 'sample sibling');
  expect((await records(page)).evidence.filter((e) => e.childId === 'child_georgia')).toHaveLength(0);
  await openLab(page, info);
  await expect(page.locator('.pattern-playground-stage')).toHaveAttribute('data-matching', 'true');
});

test('hint, model, skip, blur, close and replay preserve support and discard unfinished challenge on return to matching', async ({ page, context }, info) => {
  await loadSample(page);
  await context.setOffline(true);
  await openLab(page, info, 2);
  await activate(page.getByRole('button', { name: /Hint/ }), info);
  await activate(page.getByRole('button', { name: /Show the model/ }), info);
  await expect(page.getByLabel('Worked shape pattern model')).toBeVisible();
  await screenshot(page, info, 'supported-aab-model');
  await activate(await correctChoice(page), info);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('pattern-next')).toBeVisible();
  await activate(page.getByTestId('pattern-return-matching'), info);
  await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', 'Round 1 of 4');
  await expect(page.locator('.pattern-playground-stage')).toHaveAttribute('data-matching', 'true');
  expect((await records(page)).lessons).toHaveLength(0);
  await page.getByTestId('dialogue-close').click();
  await openLab(page, info, 3);
  await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', 'Round 1 of 4');
  await activate(page.getByRole('button', { name: /Show the model/ }), info);
  await solveRound(page, info, 0);
  await activate(page.getByRole('button', { name: 'Skip this round' }), info);
  await solveRound(page, info, 2);
  await solveRound(page, info, 3);
  await activate(page.getByTestId('choice-replay'), info);
  await expect(page.locator('.lesson-progress')).toHaveAttribute('aria-label', 'Round 1 of 4');
  const saved = await records(page);
  expect(saved.lessons).toHaveLength(1);
  expect(saved.evidence.find((e) => e.skillId === 'reason.pattern-continue-abb')!.trials).toEqual({ independent: 2, supported: 1, notYet: 0 });
  expect(saved.evidence.find((e) => e.skillId === 'reason.pattern-continue-aab')).toBeUndefined();
  expect(saved.portfolio).toHaveLength(0);
  await page.getByTestId('dialogue-close').click();
  expect((await records(page)).lessons).toHaveLength(1);
});

test('original Pippa matching, optional AB and free-design observations retain their IDs and zero artwork trials', async ({ page, context }, info) => {
  await loadSample(page);
  await context.setOffline(true);
  await readyToTalk(page);
  await talkTo(page, 'pippa');
  await activate(page.getByTestId('choice-go'), info);
  await expect(page.locator('.shape-model')).toHaveCount(1);
  await completeLegacy(page, info);
  await activate(page.getByTestId('choice-pattern'), info);
  await completeLegacy(page, info, true);
  await activate(page.getByTestId('choice-yay'), info);
  await expect.poll(async () => (await records(page)).lessons.length).toBe(2);
  const saved = await records(page);
  expect(saved.lessons.every((l) => l.lessonId === 'patterns-shapes')).toBeTruthy();
  expect(saved.evidence.some((e) => e.skillId === 'reason.visual-patterns')).toBeTruthy();
  const designs = saved.evidence.filter((e) => e.skillId === 'art.shape-design');
  expect(designs).toHaveLength(2);
  expect(designs.every((e) => e.kind === 'observation' && Object.values(e.trials).every((n) => n === 0))).toBeTruthy();
  expect(saved.portfolio).toHaveLength(0);
});
