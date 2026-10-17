/** Garden reading nook: milestone boundary, navigation, persistence and preview cleanup. */
import { expect, test, type Page, type TestInfo } from 'playwright/test';
import type { PerspectiveCamera, Vector3 } from 'three';
import { Repositories } from '../../src/data/repositories';
import { DB_NAME, TABLES } from '../../src/data/schema';
import { seedFreshHousehold } from '../../src/data/seed/launch';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { sequentialIds } from '../../src/domain/util/ids';
import { fixedClock } from '../../src/domain/util/time';
import { LAYOUT } from '../../src/engine/palette';
import { completeBook } from '../../src/services/readingService';
import { APP, dismissCelebrations, enterSchool, talkTo, unlockParent } from './helpers';

const CHILD = 'child_izzy';
const INSIDE = { x: (LAYOUT.nook.minX + LAYOUT.nook.maxX) / 2, z: LAYOUT.nook.doorZ - 0.5 };
const OUTSIDE = { x: LAYOUT.nook.maxX + 1.5, z: LAYOUT.nook.doorZ - 0.5 };

type NookGame = {
  busy: boolean;
  teleport(x: number, z: number): void;
  renderer: { info: { render: { frame: number } } };
  interaction: {
    pick(point: { x: number; y: number }, camera: PerspectiveCamera): { id: string } | null;
    pickFloor(point: { x: number; y: number }, camera: PerspectiveCamera): Vector3 | null;
  };
  input: { enabled: boolean };
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

/** Build genuinely synthetic learning records through the same reward service as the app. */
async function sampleRecords(count: number) {
  const db = new MemoryDatabase(TABLES);
  const repos = new Repositories(db);
  const clock = fixedClock('2026-06-01T12:00:00.000Z');
  const ctx = { repos, clock, ids: sequentialIds('garden-nook-e2e') };
  await seedFreshHousehold(repos, clock);
  for (const child of await repos.children.all()) {
    const { birthDate: _birthDate, ...sample } = child;
    await repos.children.put({ ...sample, name: child.id === CHILD ? 'Sample' : 'Sample sibling', explored: ['hoot'], isDemo: true });
  }
  for (const parent of await repos.parents.all()) await repos.parents.put({ ...parent, displayName: 'Sample parent' });
  for (const household of await repos.households.all()) {
    await repos.households.put({ ...household, name: 'Synthetic garden fixture', settings: { ...household.settings, talkMode: 'off', demoTools: true } });
  }
  await repos.meta.put({ key: 'seed', value: { kind: 'demo', chosenByParent: true, at: clock.now().toISOString() } });
  for (let i = 0; i < count; i++) {
    await completeBook(ctx, CHILD, {
      newBook: { title: `Sample Garden Story ${i + 1}`, author: 'Synthetic Author' },
      answers: [],
      startedAt: clock.now().toISOString(),
      transcript: [],
      source: 'parent',
    });
  }
  // Existing achievements are already celebrated; preview tests exercise new celebrations.
  for (const reward of await repos.rewardUnlocks.all()) await repos.rewardUnlocks.put({ ...reward, celebrated: true, isDemo: true });
  for (const book of await repos.books.all()) await repos.books.put({ ...book, isDemo: true });
  return Promise.all(TABLES.map(async ({ name }) => ({ name, rows: await db.table(name).all() })));
}

/** Each test owns a fresh browser context. This never connects to family sync or production data. */
async function loadSample(page: Page, count: number) {
  await page.goto(`${APP}#/`);
  await expect(page.getByTestId('enter-izzy')).toBeVisible();
  await page.evaluate(
    async ({ name, tables }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(
            tables.map((table) => table.name),
            'readwrite',
          );
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
          for (const table of tables) {
            const store = transaction.objectStore(table.name);
            store.clear();
            for (const row of table.rows) store.put(row);
          }
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, tables: await sampleRecords(count) },
  );
  await page.reload();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
}

async function savedReading(page: Page) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = (table: string) =>
        new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const request = db.transaction(table).objectStore(table).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [books, rewards] = await Promise.all([read('books'), read('rewardUnlocks')]);
      return { books, rewards };
    } finally {
      db.close();
    }
  }, DB_NAME);
}

async function expectNook(page: Page, open: boolean, preview = false) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = window.__izzy!.game() as unknown as NookGame;
        return {
          open: game.world.currentState.readingNookOpen,
          preview: game.world.currentState.preview,
          blocked: game.world.structure.collisions.has('nook-curtain'),
          lockedInteraction: game.world.interactables.find((item) => item.id === 'nook')?.enabled,
        };
      }),
    )
    .toEqual({ open, preview, blocked: !open, lockedInteraction: !open });
}

async function waitForSchool(page: Page) {
  await expect(page.getByTestId('hud-books')).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('.loading-screen')).toHaveCount(0);
  await expect(page.getByTestId('child-mode')).toHaveClass(/\bready\b/);
  await page.waitForFunction(
    () => {
      const game = window.__izzy?.game() as unknown as NookGame | null;
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
      const game = window.__izzy?.game() as unknown as NookGame | null;
      return game && game.input.enabled && !game.busy && !game.rig.inCinematic && !window.__izzy!.performing() && !window.__izzy!.overlay();
    },
    null,
    { timeout: 180_000, polling: 100 },
  );
}

/** Fixed sleeps can finish before SwiftShader has rendered even one new frame. */
async function waitForRenderedFrame(page: Page, previous: number) {
  await page.waitForFunction((frame) => (window.__izzy!.game() as unknown as NookGame).renderer.info.render.frame > frame, previous, {
    timeout: 90_000,
    polling: 100,
  });
}

async function standOutside(page: Page) {
  await waitForPlayable(page);
  const frame = await page.evaluate(({ x, z }) => {
    const game = window.__izzy!.game() as unknown as NookGame;
    game.teleport(x, z);
    // Face the entrance so the same floor targets are visible on portrait phones.
    game.rig.yaw = Math.PI / 2;
    game.rig.snapTo(game.player.position);
    return game.renderer.info.render.frame;
  }, OUTSIDE);
  await waitForRenderedFrame(page, frame);
  await expect
    .poll(() =>
      page.evaluate(({ x, z }) => {
        const position = (window.__izzy!.game() as unknown as NookGame).player.position;
        return Math.hypot(position.x - x, position.z - z);
      }, OUTSIDE),
    )
    .toBeLessThan(0.01);
}

async function attachRoomView(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(`${name} (synthetic Sample profile)`, { path, contentType: 'image/png' });
}

/** Use actual mouse/touch input and the floor picker, rather than teleporting through the gate. */
async function tapFloor(page: Page, point: { x: number; z: number }, touch: boolean) {
  await waitForPlayable(page);
  // Set a useful view before each tap; a point behind the learner can be off-screen.
  const frame = await page.evaluate(({ x, z }) => {
    const game = window.__izzy!.game() as unknown as NookGame;
    game.rig.yaw = Math.atan2(game.player.position.x - x, game.player.position.z - z);
    game.rig.snapTo(game.player.position);
    return game.renderer.info.render.frame;
  }, point);
  await waitForRenderedFrame(page, frame);
  const position = await page.evaluate(({ x, z }) => {
    const game = window.__izzy!.game() as unknown as NookGame;
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
          const game = window.__izzy!.game() as unknown as NookGame;
          return Math.hypot(game.player.position.x - x, game.player.position.z - z);
        }, point),
      { timeout: 90_000 },
    )
    .toBeLessThan(0.4);
  await expect.poll(() => page.evaluate(() => (window.__izzy!.game() as unknown as NookGame).player.isWalkingPath)).toBe(false);
}

test('24 books keep the garden nook locked through repeat discovery and reload', async ({ page }) => {
  await loadSample(page, 24);
  await enterSchool(page, 'sample');
  await expect(page.getByTestId('hud-books')).toHaveText(/24/);
  await expectNook(page, false);
  await standOutside(page);
  expect(await page.evaluate(({ x, z }) => (window.__izzy!.game() as unknown as NookGame).player.walkTo(x, z), INSIDE)).toBe(false);

  await talkTo(page, 'nook');
  await expect(page.getByTestId('discover-card')).toContainText(/reading nook/i);
  await expect(page.getByTestId('discover-card')).toContainText('25 books');
  await page.getByTestId('discover-ok').click();
  for (let i = 0; i < 2; i++) {
    await talkTo(page, 'nook');
    const hint = page.getByTestId('hint-card');
    await expect(hint).toContainText('Read 25 books');
    await expect(hint.getByLabel('24 of 25', { exact: true })).toBeVisible();
    await hint.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(hint).toHaveCount(0);
    expect(await page.evaluate(() => window.__izzy!.overlay())).toBeNull();
    await expect.poll(() => page.evaluate(() => (window.__izzy!.game() as unknown as NookGame).input.enabled)).toBe(true);
  }

  await page.reload();
  await waitForSchool(page);
  await expectNook(page, false);
  await expect(page.getByTestId('hud-books')).toHaveText(/24/);
  const saved = await savedReading(page);
  expect(saved.books).toHaveLength(24);
  expect(saved.rewards.some((reward) => reward.rewardId === 'room.reading-nook')).toBe(false);
});

test('25 books open the garden nook for floor-tap entry, exit and persisted return', async ({ page, isMobile }, testInfo) => {
  await loadSample(page, 25);
  await enterSchool(page, 'sample');
  await expect(page.getByTestId('hud-books')).toHaveText(/25/);
  await expectNook(page, true);
  const saved = await savedReading(page);
  expect(saved.books).toHaveLength(25);
  expect(saved.rewards.filter((reward) => reward.rewardId === 'room.reading-nook')).toHaveLength(1);

  await standOutside(page);
  await attachRoomView(page, testInfo, 'garden-nook-before-walking');
  for (let i = 0; i < 2; i++) {
    await tapFloor(page, INSIDE, isMobile);
    if (i === 0) {
      const entered = testInfo.outputPath(`garden-nook-entered-${isMobile ? 'phone' : 'desktop'}.png`);
      await page.screenshot({ path: entered });
      await testInfo.attach('Garden nook after walking inside (synthetic Sample profile)', { path: entered, contentType: 'image/png' });
      if (!isMobile) {
        // An optional inspection image, separate from the gameplay camera assertions.
        // Release the cinematic view even if screenshot capture fails.
        try {
          await page.evaluate(async () => {
            const game = window.__izzy!.game() as unknown as NookGame;
            await game.rig.shot(game.player.position.clone().set(-10, 3.6, 2), game.player.position.clone().set(-16.2, 1.2, 2), 0.01);
          });
          const overview = testInfo.outputPath('garden-nook-room-overview.png');
          await page.screenshot({ path: overview });
          await testInfo.attach('Garden nook room overview (synthetic Sample profile)', { path: overview, contentType: 'image/png' });
        } finally {
          await page.evaluate(async () => (window.__izzy!.game() as unknown as NookGame).rig.release(0.01));
        }
      }
    }
    await tapFloor(page, OUTSIDE, isMobile);
  }
  await page.getByRole('button', { name: 'My treasures', exact: true }).click();
  const treasures = page.getByRole('dialog', { name: 'My treasures', exact: true });
  await expect(treasures).toContainText('The Reading Nook is open');
  await treasures.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(treasures).toHaveCount(0);

  await page.reload();
  await waitForSchool(page);
  await expectNook(page, true);
  await standOutside(page);
  await tapFloor(page, INSIDE, isMobile);
  await tapFloor(page, OUTSIDE, isMobile);
  expect(await savedReading(page)).toEqual(saved);
});

test('repeated nook previews dismiss cleanly, survive phone navigation and save no progress', async ({ page, isMobile }, testInfo) => {
  await loadSample(page, 24);
  const before = await savedReading(page);
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);

  for (let i = 0; i < 2; i++) {
    await page.getByTestId('preview-books-25').click();
    await waitForSchool(page);
    await expect(page.getByTestId('celebration')).toBeVisible({ timeout: 180_000 });
    const celebrations = await dismissCelebrations(page);
    expect(celebrations.join(' ')).toContain('Reading Nook');
    await expectNook(page, true, true);
    await expect(page.locator('.preview-ribbon')).toContainText('nothing here is saved');
    await expect(page.getByTestId('hud-books')).toHaveText(/25/);
    await standOutside(page);
    await attachRoomView(page, testInfo, `garden-nook-preview-${i + 1}-before-walking`);
    await tapFloor(page, INSIDE, isMobile);
    await tapFloor(page, OUTSIDE, isMobile);

    if (isMobile) {
      for (const width of [320, 375, 412]) {
        await page.setViewportSize({ width, height: 812 });
        for (const name of ['End preview', 'My treasures', 'Grown-ups', 'Home']) {
          await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      }
    }
    await page.getByRole('button', { name: 'End preview', exact: true }).click();
    await expect(page.getByTestId('preview-books-25')).toBeVisible();
    await expect(page.locator('.preview-ribbon')).toHaveCount(0);
    await expect(page.getByTestId('celebration')).toHaveCount(0);
    expect(await savedReading(page)).toEqual(before);
  }

  // Back returns to the ordinary saved school, never a stale preview or celebration.
  await page.goBack();
  await waitForSchool(page);
  await expectNook(page, false);
  await expect(page.getByTestId('hud-books')).toHaveText(/24/);
  await expect(page.locator('.preview-ribbon')).toHaveCount(0);
  await expect(page.getByTestId('celebration')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByTestId('preview-books-25')).toBeVisible();
  await page.reload();
  await enterSchool(page, 'sample');
  await expectNook(page, false);
  await expect(page.getByTestId('hud-books')).toHaveText(/24/);
  expect(await savedReading(page)).toEqual(before);
});
