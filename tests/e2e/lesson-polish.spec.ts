import { expect, test } from 'playwright/test';
import { enterSchool, talkTo } from './helpers';
test('letter rainbow uses the actual classroom alphabet strip', async ({ page }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'alphabet');
  await expect(page.getByRole('dialog', { name: 'Letter rainbow' })).toBeVisible();
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => {
    const g = window.__izzy!.game() as unknown as {
      world: { alphabet: { active: string; tiles: Map<string, { scale: { x: number } }>; root: { name: string } } };
    };
    return {
      active: g.world.alphabet.active,
      count: g.world.alphabet.tiles.size,
      scale: g.world.alphabet.tiles.get(g.world.alphabet.active)?.scale.x,
      name: g.world.alphabet.root.name,
    };
  });
  expect(state.count).toBe(26);
  expect(state.scale).toBeGreaterThan(1);
  expect(state.name).toBe('alphabet-banner');
  await expect(page.locator('.letter-instruction')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByRole('button', { name: /Touch letter/ })).toHaveCount(2);
  const target = state.active;
  await page.getByRole('button', { name: `Touch letter ${target}`, exact: true }).click();
  await page.keyboard.press(await page.evaluate(() => (window.__izzy!.game() as unknown as { world: { alphabet: { active: string } } }).world.alphabet.active));
  expect(await page.evaluate(() => (window.__izzy!.game() as unknown as { world: { alphabet: { found: string[] } } }).world.alphabet.found.length)).toBe(2);
  await page.screenshot({ path: '../polish-keyboard-final-success-desktop.png' });
  await page.getByRole('button', { name: 'Back to school' }).click();
  await talkTo(page, 'alphabet');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '../polish-keyboard-final-desktop.png' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Help me', exact: false }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '../polish-keyboard-final-phone.png' });
});
test('novice shapes show one large model and only two visual choices', async ({ page }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'pippa');
  await page.getByTestId('choice-go').click();
  await expect(page.locator('.shape-model')).toHaveCount(1);
  await expect(page.locator('.shape-choice')).toHaveCount(2);
  await expect(page.locator('.shape-model svg')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '../polish-shapes-final-desktop.png' });
  await page.getByRole('button', { name: 'Show me', exact: false }).click();
  await page.screenshot({ path: '../polish-shapes-final-hint-desktop.png' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByTestId('dialogue-close').click();
  await talkTo(page, 'pippa');
  await page.getByTestId('choice-go').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '../polish-shapes-final-phone.png' });
  for (const element of ['.shape-model svg', '.shape-choice', '.pattern-skip']) {
    for (const box of await page.locator(element).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }),
    )) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(375);
      expect(box.bottom).toBeLessThanOrEqual(812);
    }
  }
  const box = await page.locator('.shape-model svg').boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(160);
  const choice = await page.locator('.shape-choice').first().boundingBox();
  expect(choice!.width).toBeGreaterThanOrEqual(120);
});
test('all banner targets stay framed through portrait and landscape, and interruption cleans up', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'alphabet');
  for (const size of [
    { width: 375, height: 812 },
    { width: 667, height: 375 },
    { width: 1100, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
    const points = await page.evaluate(async () => {
      const g = window.__izzy!.game() as unknown as {
        focusAlphabet(l: string): Promise<void>;
        rig: { camera: unknown };
        world: { alphabet: { targetPosition(l: string): { x: number; y: number; project(c: unknown): { x: number; y: number } } } };
      };
      const points = [];
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        await g.focusAlphabet(letter);
        const p = g.world.alphabet.targetPosition(letter).project(g.rig.camera);
        points.push({ letter, x: p.x, y: p.y });
      }
      return points;
    });
    for (const p of points) {
      expect(Math.abs(p.x), p.letter).toBeLessThan(0.9);
      expect(Math.abs(p.y), p.letter).toBeLessThan(0.8);
    }
    const letter = await page.locator('.letter-goal').innerText();
    await page.evaluate(async (l) => {
      await (window.__izzy!.game() as unknown as { focusAlphabet(l: string): Promise<void> }).focusAlphabet(l);
    }, letter);
    const buttons = await page.locator('.letter-coach button').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { right: r.right, bottom: r.bottom, x: r.x, y: r.y };
      }),
    );
    for (const b of buttons) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(size.width);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(size.height);
    }
    if (size.height === 375) await page.screenshot({ path: '../polish-keyboard-final-landscape.png' });
  }
  await page.getByRole('button', { name: 'Grown-ups', exact: true }).click();
  await expect(page.getByTestId('keyboard-trail')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window.__izzy!.game() as unknown as { world: { alphabet: { active: string | null; found: string[] } } }).world.alphabet.active),
  ).toBeNull();
});
