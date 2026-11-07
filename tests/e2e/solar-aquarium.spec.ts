import { expect, test } from 'playwright/test';
import type { Game } from '../../src/engine/Game';
import type { CameraRig } from '../../src/engine/systems/cameraRig';
import type { Mesh, MeshBasicMaterial } from 'three';
import { SOLAR_POSTER_PLANETS } from '../../src/shared/solarPoster';
import { enterSchool, talkTo } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

test.use({ actionTimeout: 30_000 });
test.beforeEach(async ({ page }) => {
  await useSyntheticHousehold(page);
});

test('poster opens every planet, supports offline touch/keyboard, closes and reopens', async ({ page, context }, info) => {
  await enterSchool(page, 'sample');
  await page.getByTestId('discover-ok').click();
  // A real canvas click on each painted planet, using a close-up solely to
  // make the wall-poster targets deterministic on both device sizes.
  for (const planet of SOLAR_POSTER_PLANETS) {
    const point = await page.evaluate(async ({ x }) => {
      const game = window.__izzy!.game() as unknown as Pick<Game, 'world' | 'teleportTo'> & { rig: CameraRig };
      game.teleportTo('solar-system');
      const poster = game.world.root.getObjectByName('solar-system-poster')!;
      const target = poster.position.clone();
      await game.rig.shot(target.clone().set(target.x, target.y, target.z + 3), target, 0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      game.world.root.updateMatrixWorld(true);
      const p = poster.localToWorld(target.clone().set((x / 768 - 0.5) * 1.8, 0, 0)).project(game.rig.camera);
      const rect = document.querySelector('.game-canvas')!.getBoundingClientRect();
      return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
    }, planet);
    await page.locator('.game-canvas').focus();
    if (info.project.name === 'phone') await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await expect(page.getByRole('heading', { level: 3, name: planet.name, exact: true })).toBeVisible();
    await expect(page.locator(`[data-planet-id="${planet.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Close solar system' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForTimeout(1200);
  }
  await talkTo(page, 'solar-system');
  await context.setOffline(true);
  const close = page.getByRole('button', { name: 'Close solar system' });
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(page.locator('[data-planet-id="neptune"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  for (const planet of SOLAR_POSTER_PLANETS) {
    const button = page.locator(`[data-planet-id="${planet.id}"]`);
    const bounds = await button.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await button.press('Enter');
    await expect(page.getByTestId('solar-system-facts').getByRole('heading')).toHaveText(planet.name);
  }
  await page.getByTestId('solar-system-facts').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`planet-facts-${info.project.name}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.game-canvas')).toBeFocused();
  await talkTo(page, 'solar-system');
  await expect(page.getByRole('heading', { level: 3, name: 'Earth', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close solar system' }).click();
  await context.setOffline(false);
});

for (const quality of ['low', 'balanced', 'high']) {
  test(`new aquarium fish remain visible with ${quality} graphics`, async ({ page }, info) => {
    await page.goto(`/?maxfps=3&quality=${quality}#/`);
    await page.getByTestId('enter-sample').click();
    await page.waitForFunction(() => window.__izzy?.game()?.busy === false, null, { timeout: 300_000 });
    await page.getByTestId('discover-ok').click();
    const report = await page.evaluate(async () => {
      const game = window.__izzy!.game() as unknown as Game;
      const state = game.world.currentState!;
      await game.applyWorld({ ...state, aquariumFish: 2 }, [], false);
      await game.revealUnlocks([], { ...state, aquariumFish: 3 }, [], 'aquarium');
      const fish = game.world.root.getObjectByName('aquarium-fish')!;
      const layers = ['aquarium-glass', 'aquarium-water'].map((name) => {
        const mesh = game.world.root.getObjectByName(name) as Mesh<import('three').BufferGeometry, MeshBasicMaterial>;
        return { basic: mesh.material.isMeshBasicMaterial, opacity: mesh.material.opacity, depthWrite: mesh.material.depthWrite };
      });
      return { fish: fish.children.length, layers };
    });
    expect(report.fish).toBe(3);
    expect(report.layers).toEqual([
      { basic: true, opacity: 0.07, depthWrite: false },
      { basic: true, opacity: 0.12, depthWrite: false },
    ]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: info.outputPath(`aquarium-${quality}-${info.project.name}.png`) });
  });
}
