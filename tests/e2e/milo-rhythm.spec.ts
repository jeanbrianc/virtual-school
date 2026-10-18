import { isTeacherAvailable } from '../../src/domain/teachers/registry';
import { hiddenTeacherTests, restoredTeacherTest } from './fixtures/hiddenTeacher';
import type { PerspectiveCamera, Vector3 } from 'three';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo, type Locator } from 'playwright/test';
import { Repositories } from '../../src/data/repositories';
import { DB_NAME, TABLES } from '../../src/data/schema';
import { seedFreshHousehold } from '../../src/data/seed/launch';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { fixedClock } from '../../src/domain/util/time';
import type { Evidence, LessonAttempt } from '../../src/domain/types';
import { APP, enterSchool, talkTo, unlockParent } from './helpers';

type SyntheticInputTiming = { kind: string; timeStamp: number; receivedAt: number; queueMs: number };
type TimingWindow = Window & { __rhythmTiming?: SyntheticInputTiming[]; __rhythmWorldAdvanced?: boolean };
type RhythmGame = {
  busy: boolean;
  teleport(x: number, z: number): void;
  renderer: { info: { render: { frame: number } } };
  interaction: {
    pick(point: { x: number; y: number }, camera: PerspectiveCamera): { id: string } | null;
    pickFloor(point: { x: number; y: number }, camera: PerspectiveCamera): Vector3 | null;
  };
  input: { enabled: boolean };
  tweens: { wait(seconds: number): Promise<void> };
  player: {
    position: Vector3;
    isWalkingPath: boolean;
    walkTo(x: number, z: number): boolean;
  };
  rig: {
    camera: PerspectiveCamera;
    yaw: number;
    inCinematic: boolean;
    snapTo(position: Vector3): void;
    shot(position: Vector3, lookAt: Vector3, duration: number): Promise<void>;
    release(duration: number): Promise<void>;
  };
  world: {
    currentState: { readingNookOpen: boolean; preview: boolean };
    structure: { collisions: { has(id: string): boolean; blocked(x: number, z: number, radius: number): boolean } };
    interactables: { id: string; enabled: boolean }[];
  };
};

async function waitForSchool(page: Page) {
  await expect(page.getByTestId('hud-books')).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('.loading-screen')).toHaveCount(0);
  await expect(page.getByTestId('child-mode')).toHaveClass(/\bready\b/);
  await page.waitForFunction(
    () => {
      const game = window.__izzy?.game() as unknown as RhythmGame | null;
      return game && !game.busy && game.renderer.info.render.frame > 0;
    },
    null,
    { timeout: 300_000, polling: 100 },
  );
}

/** A dismissed celebration still needs to release the camera and restore input. */
async function waitForPlayable(page: Page) {
  await waitForSchool(page);
  await page.waitForFunction(
    () => {
      const game = window.__izzy?.game() as unknown as RhythmGame | null;
      return game && game.input.enabled && !game.busy && !game.rig.inCinematic && !window.__izzy!.performing() && !window.__izzy!.overlay();
    },
    null,
    { timeout: 180_000, polling: 100 },
  );
}

/** Fixed sleeps can finish before SwiftShader has rendered even one new frame. */
async function waitForRenderedFrame(page: Page, previous: number) {
  await page.waitForFunction((frame) => (window.__izzy!.game() as unknown as RhythmGame).renderer.info.render.frame > frame, previous, {
    timeout: 90_000,
    polling: 100,
  });
}

/** Use actual mouse/touch input and the floor picker, rather than teleporting through the gate. */
async function tapFloor(page: Page, point: { x: number; z: number }, touch: boolean) {
  await waitForPlayable(page);
  // Set a useful view before each tap; a point behind the learner can be off-screen.
  const frame = await page.evaluate(({ x, z }) => {
    const game = window.__izzy!.game() as unknown as RhythmGame;
    game.rig.yaw = Math.atan2(game.player.position.x - x, game.player.position.z - z);
    game.rig.snapTo(game.player.position);
    return game.renderer.info.render.frame;
  }, point);
  await waitForRenderedFrame(page, frame);
  const position = await page.evaluate(({ x, z }) => {
    const game = window.__izzy!.game() as unknown as RhythmGame;
    const projected = game.player.position.clone().set(x, 0, z).project(game.rig.camera);
    const canvas = document.querySelector('canvas.game-canvas')!;
    const bounds = canvas.getBoundingClientRect();
    const screen = { x: bounds.left + ((projected.x + 1) / 2) * bounds.width, y: bounds.top + ((1 - projected.y) / 2) * bounds.height };
    const picked = game.interaction.pick(projected, game.rig.camera);
    const floor = game.interaction.pickFloor(projected, game.rig.camera);
    return {
      ...screen,
      onCanvas: document.elementFromPoint(screen.x, screen.y) === canvas,
      picked: picked?.id ?? null,
      floorError: floor ? Math.hypot(floor.x - x, floor.z - z) : null,
      inputEnabled: game.input.enabled,
      cinematic: game.busy || game.rig.inCinematic,
    };
  }, point);
  const viewport = page.viewportSize()!;
  expect(position.x).toBeGreaterThan(0);
  expect(position.x).toBeLessThan(viewport.width);
  expect(position.y).toBeGreaterThan(0);
  expect(position.y).toBeLessThan(viewport.height);
  expect(position.onCanvas, 'the floor target must not be covered by an overlay').toBe(true);
  expect(position.picked, 'the floor target must not select a teacher or object').toBeNull();
  expect(position.floorError, 'projection and floor-picking matrices must agree').not.toBeNull();
  expect(position.floorError!).toBeLessThan(0.01);
  expect(position.inputEnabled).toBe(true);
  expect(position.cinematic).toBe(false);
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
  await expect
    .poll(
      () =>
        page.evaluate(({ x, z }) => {
          const game = window.__izzy!.game() as unknown as RhythmGame;
          return Math.hypot(game.player.position.x - x, game.player.position.z - z);
        }, point),
      { timeout: 90_000 },
    )
    .toBeLessThan(0.4);
  await expect.poll(() => page.evaluate(() => (window.__izzy!.game() as unknown as RhythmGame).player.isWalkingPath)).toBe(false);
}

test.use({ actionTimeout: 30_000 });
test.setTimeout(360_000);
async function loadSample(page: Page, sound = false) {
  await page.addInitScript(() => {
    const timing: SyntheticInputTiming[] = [];
    (window as TimingWindow).__rhythmTiming = timing;
    for (const kind of ['click', 'keydown']) {
      document.addEventListener(
        kind,
        (event) => {
          if (!(event.target instanceof Element) || !event.target.closest('[data-testid="rhythm-tap"]')) return;
          const receivedAt = performance.now();
          timing.push({ kind, timeStamp: event.timeStamp, receivedAt, queueMs: receivedAt - event.timeStamp });
        },
        true,
      );
    }
    // Deliberately unavailable optional voice capabilities. Picture/touch participation must still work.
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
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
    const { birthDate: _birthday, sayName: _sayName, ...sample } = child;
    await repos.children.put({
      ...sample,
      name: child.id === 'child_izzy' ? 'Sample' : 'Sample sibling',
      status: 'active',
      explored: ['milo', 'nova', 'pippa', 'digit', 'hoot'],
      isDemo: true,
    });
  }
  for (const parent of await repos.parents.all()) await repos.parents.put({ ...parent, displayName: 'Sample parent' });
  for (const household of await repos.households.all())
    await repos.households.put({
      ...household,
      name: 'Synthetic rhythm fixture',
      settings: { ...household.settings, talkMode: 'off', readAloud: false, audio: { ...household.settings.audio, muted: !sound } },
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
test.afterEach(async ({ page }, info) => {
  await saveInputTiming(page, info, 'end-of-test');
});
async function saveInputTiming(page: Page, info: TestInfo, label: string) {
  // Synthetic browser-fixture diagnostics only; never added to application records.
  const timing = await page.evaluate(() => (window as TimingWindow).__rhythmTiming ?? []).catch(() => ({ unavailable: 'Page closed before capture' }));
  const path = info.outputPath(`synthetic-input-${label}-${info.project.name}.json`);
  writeFileSync(path, JSON.stringify(timing, null, 2));
  await info.attach(`synthetic-input-${label}`, { path, contentType: 'application/json' });
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
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}-${info.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function watch(page: Page, info: TestInfo, round: number) {
  await activate(page.getByRole('button', { name: 'Play / watch pattern', exact: true }), info);
  const next = page.getByRole('button', { name: round === 0 ? 'Try together' : 'Try this pattern', exact: true });
  await expect(next).toBeEnabled();
  await activate(next, info);
}
async function finishRound(page: Page, info: TestInfo, round: number) {
  await activate(page.getByRole('button', { name: round === 0 ? 'Explore a fresh pattern' : 'Finish visit', exact: true }), info);
}
async function copyTwoBeats(page: Page, info: TestInfo, gap: number) {
  const pad = page.getByTestId('rhythm-tap');
  await expect(pad).toBeVisible();
  await expect(pad).toBeEnabled();
  await pad.scrollIntoViewIfNeeded();
  await expect(pad).toBeInViewport({ ratio: 1 });
  const box = (await pad.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await pad.evaluate((element, p) => element.contains(document.elementFromPoint(p.x, p.y)), point)).toBe(true);
  const originalPad = (await pad.elementHandle())!;
  if (info.project.name !== 'phone') await pad.focus();
  // Validate visibility and focus before the first beat. Locator.tap() waits
  // for stable rendered frames, which can add seconds to a musical gap under
  // SwiftShader. Native touchscreen/keyboard dispatch still exercises real
  // input without inserting actionability waits between the two beats.
  const tap = () => (info.project.name === 'phone' ? page.touchscreen.tap(point.x, point.y) : page.keyboard.press('Enter'));
  try {
    await tap();
    await page.waitForTimeout(gap);
    expect(
      await originalPad.evaluate((element, p) => element.isConnected && element.contains(document.elementFromPoint(p.x, p.y)), point),
      'The original pad must still own this point; never tap a reflowed feedback/Next button after an unreliable input.',
    ).toBe(true);
    await tap();
  } finally {
    // Save before a later reload resets this synthetic page's diagnostics.
    await saveInputTiming(page, info, `gap-${gap}ms`);
  }
}

const run = restoredTeacherTest('milo');
run('muted keyboard/touch copy, fresh independent pattern, parent evidence, dedup and sibling isolation', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadSample(page);
  await context.setOffline(true);
  await talkTo(page, 'milo');
  const suspendedFrame = await page.evaluate(() => (window.__izzy!.game() as unknown as RhythmGame).renderer.info.render.frame);
  // inCinematic stays true while the teacher shot is held. A frame-driven
  // sentinel instead proves that world/camera tween updates keep advancing.
  await page.evaluate(() => {
    (window as TimingWindow).__rhythmWorldAdvanced = false;
    void (window.__izzy!.game() as unknown as RhythmGame).tweens.wait(0.1).then(() => {
      (window as TimingWindow).__rhythmWorldAdvanced = true;
    });
  });
  await page.waitForFunction(() => (window as TimingWindow).__rhythmWorldAdvanced === true);
  await expect(page.getByRole('img', { name: 'Milo the otter' })).toBeVisible();
  await screenshot(page, info, 'milo-introduction');
  await activate(page.getByRole('button', { name: 'Tap a rhythm', exact: true }), info);
  await activate(page.getByRole('button', { name: 'Skip warm-up' }), info);
  for (let round = 0; round < 2; round++) {
    await watch(page, info, round);
    const pad = page.getByTestId('rhythm-tap');
    const box = await pad.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(100);
    expect(box!.width).toBeGreaterThanOrEqual(250);
    await screenshot(page, info, round === 0 ? 'guided-copy' : 'fresh-independent-copy');
    await copyTwoBeats(page, info, round === 0 ? 800 : 2400);
    await expect(page.getByText('You made a beat-and-pause pattern!', { exact: true })).toBeVisible();
    if (round === 1) await screenshot(page, info, 'independent-copy-feedback');
    await finishRound(page, info, round);
  }
  await page.getByRole('button', { name: 'Save visit', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Visit saved' })).toBeVisible();
  const saved = await records(page);
  expect(saved.lessons).toHaveLength(1);
  expect(saved.evidence).toHaveLength(2);
  expect(saved.evidence.map((e) => e.skillId)).toEqual(['art.rhythm-copy', 'art.rhythm-copy']);
  expect(saved.evidence.map((e) => e.independence)).toEqual(['supported', 'independent']);
  expect(saved.evidence.every((e) => e.statement.includes('visual-only'))).toBeTruthy();
  expect(saved.evidence.every((e) => e.statement.includes(info.project.name === 'phone' ? 'pointer-or-touch' : 'keyboard-or-assistive'))).toBeTruthy();
  await screenshot(page, info, 'copy-complete');
  expect(await page.evaluate(() => (window.__izzy!.game() as unknown as RhythmGame).renderer.info.render.frame)).toBe(suspendedFrame);
  await activate(page.getByRole('button', { name: 'Back to school', exact: true }), info);
  await waitForRenderedFrame(page, suspendedFrame);
  await waitForPlayable(page);
  await context.setOffline(false);
  await page.reload();
  expect((await records(page)).lessons).toHaveLength(1);
  await page.goto(`${APP}#/parent/curriculum/art.rhythm-copy`);
  await unlockParent(page);
  await page.getByLabel('Viewing learner').selectOption('child_izzy');
  await expect(page.getByText(/Copied beat-and-pause intervals/).first()).toBeVisible();
  await screenshot(page, info, 'parent-copy-evidence');
  await page.goto(`${APP}#/`);
  await enterSchool(page, 'sample sibling');
  expect((await records(page)).evidence.filter((e) => e.childId === 'child_georgia')).toHaveLength(0);
  expect(errors).toEqual([]);
});

run('untimed recognition, hints, four beats chosen by parent, and existing teacher regressions', async ({ page, context }, info) => {
  await loadSample(page);
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  await page.getByLabel('Viewing learner').selectOption('child_izzy');
  await page.getByLabel('Beats per pattern for Sample', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Save music setting' }).click();
  await expect(page.getByText('Saved for the next music visit.')).toBeVisible();
  await screenshot(page, info, 'parent-four-beats');
  await enterSchool(page, 'sample');
  await context.setOffline(true);
  await talkTo(page, 'milo');
  await expect(page.locator('.rhythm-step')).toContainText('4 beats');
  await activate(page.getByRole('button', { name: 'Choose matching pictures', exact: true }), info);
  await activate(page.getByRole('button', { name: 'Try together', exact: true }), info);
  await activate(page.getByTestId('rhythm-choice-a'), info);
  await finishRound(page, info, 0);
  await activate(page.getByRole('button', { name: 'Try this pattern', exact: true }), info);
  await activate(page.getByRole('button', { name: 'Hint: show the spaces', exact: true }), info);
  await screenshot(page, info, 'untimed-four-beat-recognition');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await activate(page.getByTestId('rhythm-choice-b'), info);
  await finishRound(page, info, 1);
  await activate(page.getByRole('button', { name: 'Save visit', exact: true }), info);
  await expect(page.getByRole('button', { name: 'Visit saved' })).toBeVisible();
  const saved = await records(page);
  expect(saved.evidence).toHaveLength(2);
  expect(saved.evidence.every((e) => e.skillId === 'art.rhythm-recognize' && e.independence === 'supported')).toBeTruthy();
  expect(saved.evidence.every((e) => e.statement.includes('Visual pattern recognition only'))).toBeTruthy();
  await activate(page.getByRole('button', { name: 'Play again', exact: true }), info);
  await expect(page.getByRole('button', { name: 'Try together', exact: true })).toBeEnabled();
  await activate(page.getByRole('button', { name: 'Close without saving', exact: true }), info);
  expect((await records(page)).lessons).toHaveLength(1);
  for (const id of ['pippa', 'digit', 'nova']) {
    await talkTo(page, id);
    await page.getByTestId('choice-go').click();
    await expect(page.locator('.lesson-play')).toBeVisible();
    await page.getByTestId('dialogue-close').click();
  }
});

run('audio fallback, mute mid-play, blur, skip, Escape, reload and focus restore never save unfinished input', async ({ page, context }, info) => {
  await loadSample(page, true);
  await context.setOffline(true);
  await talkTo(page, 'milo');
  await activate(page.getByRole('button', { name: 'Tap a rhythm', exact: true }), info);
  await activate(page.getByRole('button', { name: 'Skip warm-up' }), info);
  await activate(page.getByRole('button', { name: 'Play / watch pattern', exact: true }), info);
  await page.getByLabel('Visual only / sound off').check();
  await expect(page.getByRole('button', { name: 'Try together', exact: true })).toBeDisabled();
  await watch(page, info, 0);
  await activate(page.getByTestId('rhythm-tap'), info);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: 'Resume rhythm' })).toBeVisible();
  await screenshot(page, info, 'paused-copy');
  await activate(page.getByRole('button', { name: 'Resume rhythm' }), info);
  await expect(page.getByRole('button', { name: 'Try together', exact: true })).toBeDisabled();
  await page.getByLabel('Visual only / sound off').uncheck();
  // Existing game audio is already initialized; only the new lesson output is unavailable.
  await page.evaluate(() => Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined }));
  // Close disposes the lesson's previous audio context, and reopening exercises fallback.
  await page.getByRole('button', { name: 'Close without saving', exact: true }).click();
  await talkTo(page, 'milo');
  await page.getByRole('button', { name: 'Tap a rhythm', exact: true }).click();
  await page.getByRole('button', { name: 'Skip warm-up' }).click();
  await watch(page, info, 0);
  await activate(page.getByRole('button', { name: 'Skip this pattern' }), info);
  await finishRound(page, info, 0);
  await watch(page, info, 1);
  await activate(page.getByRole('button', { name: 'Replay the model with help' }), info);
  await page.getByRole('button', { name: 'Play / watch pattern', exact: true }).click();
  const beforeEscape = await page.evaluate(() => (window.__izzy!.game() as unknown as RhythmGame).renderer.info.render.frame);
  await page.getByRole('button', { name: 'Close without saving', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rhythm-flow')).toHaveCount(0);
  await waitForRenderedFrame(page, beforeEscape);
  await waitForPlayable(page);
  expect((await records(page)).lessons).toHaveLength(0);
  await context.setOffline(false);
  await page.reload();
  await waitForPlayable(page);
  await talkTo(page, 'milo');
  await page.getByRole('button', { name: 'Tap a rhythm', exact: true }).click();
  await page.getByTestId('rhythm-tap').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="rhythm-flow"]'))).toBeTruthy();
  await page.reload();
  expect((await records(page)).lessons).toHaveLength(0);
});

run('Milo is reachable through real floor taps with a visible model and touch/keyboard interaction affordance', async ({ page }, info) => {
  await loadSample(page);
  for (const point of [
    { x: -4.9, z: 6.8 },
    { x: -5.3, z: 3.3 },
    { x: -5.3, z: 0 },
    { x: -5.3, z: -3.0 },
    { x: -5.5, z: -5.8 },
  ]) {
    expect(await page.evaluate(({ x, z }) => (window.__izzy!.game() as unknown as RhythmGame).world.structure.collisions.blocked(x, z, 0.3), point)).toBe(
      false,
    );
    await tapFloor(page, point, info.project.name === 'phone');
  }
  await expect(page.getByTestId('interact-prompt')).toContainText('Milo');
  await screenshot(page, info, 'milo-world-reachable');
  await activate(page.getByTestId('interact-prompt'), info);
  await expect(page.getByTestId('rhythm-flow')).toBeVisible();
  await activate(page.getByRole('button', { name: 'Close without saving', exact: true }), info);
  await waitForPlayable(page);
  expect((await records(page)).lessons).toHaveLength(0);
});

// Hidden defaults run positive regression assertions, with no skipped test results.
if (!isTeacherAvailable('milo')) hiddenTeacherTests('milo');
