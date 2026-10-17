/** Synthetic destination arrivals: real rendered book bounds, HUD occlusion and saved navigation. */
import { expect, test, type Page, type TestInfo } from 'playwright/test';
import type { PerspectiveCamera, Raycaster, WebGLRenderer } from 'three';
import type { Tweens } from '../../src/engine/core/tween';
import type { SchoolWorld } from '../../src/engine/world/SchoolWorld';
import type { ShelfBook } from '../../src/engine/world/bookshelf';
import { loadBookSample, savedReading } from './fixtures/book-arrival';
import { dismissCelebrations, enterSchool, talkTo } from './helpers';

type InspectGame = {
  busy: boolean;
  world: SchoolWorld;
  tweens: Tweens;
  renderer: WebGLRenderer;
  interaction: { raycaster: Raycaster };
  rig: { camera: PerspectiveCamera; inCinematic: boolean };
  input: { enabled: boolean };
  celebrateBook(book: ShelfBook): Promise<void>;
  setShelfBooks(books: ShelfBook[]): void;
  releaseCamera(): Promise<void>;
};
declare global {
  interface Window {
    __arrivalCapture?: { id: string; paused: boolean; frame: number; resume(): void };
  }
}

// Bound missing UI actions so a discovery card cannot stall the whole CI job.
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);
});

async function ready(page: Page) {
  await expect(page.locator('.loading-screen')).toHaveCount(0);
  await page.waitForFunction(
    () => {
      const game = window.__izzy?.game() as unknown as InspectGame | null;
      return game && !game.busy && game.renderer.info.render.frame > 0;
    },
    null,
    { timeout: 300_000 },
  );
}

/** Pause only the tween clock at an actual rendered pop frame; leave renderer/camera/HUD intact. */
async function captureNextArrival(page: Page) {
  await page.evaluate(() => {
    const game = window.__izzy!.game() as unknown as InspectGame;
    const fly = game.world.bookshelf.flyBookIn.bind(game.world.bookshelf);
    const update = game.tweens.update.bind(game.tweens);
    const capture = {
      id: '',
      paused: false,
      frame: 0,
      resume: () => {
        game.tweens.update = update;
      },
    };
    window.__arrivalCapture = capture;
    game.world.bookshelf.flyBookIn = (book, from, onLand, options) => {
      capture.id = book.id;
      game.world.bookshelf.flyBookIn = fly;
      game.tweens.update = (dt) => {
        if (capture.paused) return;
        update(dt);
        const mesh = game.world.bookshelf.root.getObjectByName(`book:${book.id}`);
        if (mesh && mesh.scale.x > 1.2) {
          capture.paused = true;
          capture.frame = game.renderer.info.render.frame;
        }
      };
      return fly(book, from, onLand, options);
    };
  });
}

async function inspectBook(page: Page, id: string) {
  return page.evaluate((id) => {
    const game = window.__izzy!.game() as unknown as InspectGame;
    const mesh = game.world.bookshelf.root.getObjectByName(`book:${id}`) as import('three').Mesh;
    mesh.geometry.computeBoundingBox();
    mesh.updateWorldMatrix(true, false);
    const bounds = mesh.geometry.boundingBox!;
    const canvas = game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const points = [];
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = mesh.position.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(game.rig.camera);
          const sx = rect.x + ((point.x + 1) / 2) * rect.width;
          const sy = rect.y + ((1 - point.y) / 2) * rect.height;
          points.push({ x: sx, y: sy, z: point.z, clear: document.elementFromPoint(sx, sy) === canvas });
        }
    const projected = mesh.getWorldPosition(mesh.position.clone()).project(game.rig.camera);
    const ray = game.interaction.raycaster;
    const mask = ray.layers.mask;
    ray.layers.set(0);
    ray.setFromCamera(projected as unknown as import('three').Vector2, game.rig.camera);
    const hits = ray.intersectObject(game.world.root, true).filter((hit) => {
      for (let node: import('three').Object3D | null = hit.object; node; node = node.parent) if (!node.visible) return false;
      const cameraDepth = -hit.point.clone().applyMatrix4(game.rig.camera.matrixWorldInverse).z;
      const hitMesh = hit.object as import('three').Mesh;
      const material = Array.isArray(hitMesh.material) ? hitMesh.material[hit.face?.materialIndex ?? 0] : hitMesh.material;
      return (
        cameraDepth >= game.rig.camera.near &&
        cameraDepth <= game.rig.camera.far &&
        !material?.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < 0)
      );
    });
    ray.layers.mask = mask;
    return {
      points,
      firstHit: hits[0]?.object.name,
      position: mesh.position.toArray(),
      rotation: mesh.rotation.z,
      count: game.world.bookshelf.root.children.filter((node) => node.name === `book:${id}`).length,
    };
  }, id);
}

async function visibleBook(page: Page, id: string, checkAllCorners = true) {
  const evidence = await inspectBook(page, id);
  const viewport = page.viewportSize()!;
  expect(evidence.count).toBe(1);
  for (const point of evidence.points) {
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(viewport.width);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(viewport.height);
    expect(point.z).toBeGreaterThan(-1);
    expect(point.z).toBeLessThan(1);
    if (checkAllCorners) expect(point.clear, `book corner ${point.x},${point.y} covered by HUD/dialogue`).toBe(true);
  }
  expect(evidence.firstHit, 'book center must be visible in the 3D world').toBe(`book:${id}`);
  return evidence;
}

async function image(page: Page, info: TestInfo, label: string) {
  const path = info.outputPath(`${label}.png`);
  await page.screenshot({ path });
  await info.attach(`${label} (synthetic Sample only)`, { path, contentType: 'image/png' });
}

async function pausedImage(page: Page, info: TestInfo, label: string) {
  await page.waitForFunction(
    () => {
      const capture = window.__arrivalCapture;
      return capture?.paused && (window.__izzy!.game() as unknown as InspectGame).renderer.info.render.frame > capture.frame;
    },
    null,
    { timeout: 120_000 },
  );
  const id = await page.evaluate(() => window.__arrivalCapture!.id);
  await visibleBook(page, id);
  await image(page, info, label);
  await page.evaluate(() => window.__arrivalCapture!.resume());
  return id;
}

async function finishNewBook(page: Page, title: string) {
  await talkTo(page, 'hoot');
  await page.getByTestId('choice-finish').click();
  await page.getByTestId('new-book-title').fill(title);
  await page.getByTestId('new-book-save').click();
  await page.getByRole('button', { name: 'Not sure', exact: true }).click();
  await page.getByTestId('rating-skip').click();
}

test('real 25-to-26 completion survives interruption, Back/Forward, reload and another arrival', async ({ page, isMobile }, info) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  await loadBookSample(page, 25);
  await enterSchool(page, 'sample');
  await ready(page);
  await captureNextArrival(page);
  await finishNewBook(page, 'Synthetic third shelf arrival');
  await page.waitForFunction(() => window.__arrivalCapture?.paused, null, { timeout: 120_000 });
  if (isMobile) await pausedImage(page, info, 'real-third-shelf-arrival-320');
  // Interrupt the active arrival with real navigation. Completion already committed atomically.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
  const after = await savedReading(page);
  expect(after.books).toHaveLength(26);
  const added = after.books.find((b) => b.title === 'Synthetic third shelf arrival')!;
  expect(added.shelfIndex).toBe(25);
  await page.goBack();
  await ready(page);
  await expect(page.getByTestId('hud-books')).toContainText('26');
  await expect(page.getByTestId('celebration')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window.__izzy!.game() as unknown as InspectGame).rig.inCinematic)).toBe(false);
  await page.goForward();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
  await page.reload();
  await enterSchool(page, 'sample');
  await ready(page);
  expect(await savedReading(page)).toEqual(after);
  await finishNewBook(page, 'Synthetic next shelf arrival');
  await expect(page.getByTestId('celebration')).toBeVisible({ timeout: 180_000 });
  await dismissCelebrations(page);
  await ready(page);
  await expect.poll(() => page.evaluate(() => (window.__izzy!.game() as unknown as InspectGame).rig.inCinematic)).toBe(false);
  const final = await savedReading(page);
  expect(final.books).toHaveLength(27);
  expect(final.books.find((b) => b.id === added.id)).toEqual(added);
  await talkTo(page, 'bookshelf');
  await expect(page.getByTestId('discover-card')).toBeVisible();
  await page.getByTestId('discover-ok').click();
  await expect(page.getByTestId('discover-card')).toHaveCount(0);
  await talkTo(page, 'bookshelf');
  await expect(page.getByRole('dialog', { name: 'My bookshelf', exact: true })).toBeVisible();
  await page.getByRole('img', { name: /Synthetic third shelf arrival by/ }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic third shelf arrival', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All my books', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window.__izzy!.game() as unknown as InspectGame).input.enabled)).toBe(true);
});

test('destination book stays visible through third, grand and overflow arrivals across phone sizes', async ({ page, isMobile }, info) => {
  await loadBookSample(page, 131);
  await enterSchool(page, 'sample');
  await ready(page);
  // Real completions dismiss this hint when Hoot is opened. The direct engine
  // fixture waits for its normal expiry instead of hiding any HUD element.
  await expect(page.locator('.controls-hint')).toHaveCount(0);
  const saved = await savedReading(page);
  const books = saved.books as unknown as ShelfBook[];
  const sizes = isMobile
    ? [
        { width: 320, height: 740 },
        { width: 375, height: 812 },
        { width: 412, height: 915 },
        { width: 667, height: 375 },
        { width: 740, height: 320 },
      ]
    : [{ width: 1100, height: 720 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    // Full geometry scans cover every slot; pixels sample each reported obstruction
    // at 320px and the third-case boundary at every other required phone shape.
    const slots = isMobile && size.width !== 320 ? [25] : [25, 38, 48, 53, 63, 100, 130];
    for (const slot of slots) {
      const book = books.find((b) => b.shelfIndex === slot)!;
      await page.evaluate(
        ({ books, book }) => (window.__izzy!.game() as unknown as InspectGame).setShelfBooks(books.filter((b) => b.shelfIndex < book.shelfIndex)),
        {
          books,
          book,
        },
      );
      await captureNextArrival(page);
      await page.evaluate((book) => {
        void (window.__izzy!.game() as unknown as InspectGame).celebrateBook(book);
      }, book);
      // Desktop preserves the long journey from Hoot; only phone uses the compact pop shot.
      if (isMobile) await pausedImage(page, info, `arrival-flight-slot-${slot}-${size.width}x${size.height}`);
      else {
        await page.waitForFunction(() => window.__arrivalCapture?.paused);
        await page.evaluate(() => window.__arrivalCapture!.resume());
      }
      await ready(page);
      await visibleBook(page, book.id);
      await image(page, info, `arrival-landed-slot-${slot}-${size.width}x${size.height}`);
      await page.evaluate(async () => (window.__izzy!.game() as unknown as InspectGame).releaseCamera());
    }
  }
  expect(await savedReading(page)).toEqual(saved);
});
