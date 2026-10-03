import { expect, test, type Page } from 'playwright/test';
import { APP, enterSchool, talkTo, unlockParent } from './helpers';
async function prompt(page: Page) {
  const line = await page.getByTestId('dialogue-line').locator('.sr-only').textContent();
  return /Find ([A-Z])/.exec(line!)![1]!;
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('izzys-classroom');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<{ summary: string }[]>((resolve, reject) => {
        const r = db.transaction('lessonAttempts').objectStore('lessonAttempts').getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}
test('keyboard banner: shortcuts, repeat/modifiers/IME, blur, hints, exactly once and replay', async ({ page }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await page.evaluate(() => window.__izzy!.teleportTo('alphabet'));
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const g = window.__izzy!.game() as unknown as { player: { position: { x: number; z: number }; settleAt(x: number, z: number): void } };
    g.player.settleAt(g.player.position.x + 0.4, g.player.position.z + 0.4);
    window.__izzy!.interact('alphabet');
  });
  await expect(page.getByTestId('keyboard-trail')).toBeVisible();
  expect(await page.getByRole('button', { name: /^Touch letter/ }).count()).toBe(2);
  const before = await page.evaluate(() => {
    const g = window.__izzy!.game() as unknown as { player: { position: { x: number; z: number } }; rig: { yaw: number } };
    return { x: g.player.position.x, z: g.player.position.z, yaw: g.rig.yaw };
  });
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  for (const key of ['w', 'a', 's', 'd', 'e', 'q', 'r']) {
    await page.keyboard.down(key);
    await page.keyboard.up(key);
  }
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => {
    const g = window.__izzy!.game() as unknown as { player: { position: { x: number; z: number } }; rig: { yaw: number } };
    return { x: g.player.position.x, z: g.player.position.z, yaw: g.rig.yaw };
  });
  expect(after).toEqual(before);
  // Restart after exploratory shortcut keys without saving.
  await page.getByRole('button', { name: 'Back to school' }).click();
  await talkTo(page, 'alphabet');
  let letter = await prompt(page);
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
    await page.getByTestId('keyboard-trail').dispatchEvent('keydown', { key: letter, bubbles: true, ...extra });
    expect(await prompt(page)).toBe(letter);
  }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.press(letter);
  await expect(page.getByRole('button', { name: 'Resume trail' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume trail' }).click();
  await page.getByRole('button', { name: /Help me/ }).click();
  await page.keyboard.press(letter.toLowerCase());
  await expect(page.getByTestId('dialogue-line').locator('.sr-only')).not.toContainText(`Find ${letter}`);
  for (let i = 0; i < 4; i++) {
    letter = await prompt(page);
    await page.keyboard.press(letter);
    await expect(page.getByTestId('dialogue-line').locator('.sr-only')).not.toContainText(`Find ${letter}`);
  }
  await page.getByRole('button', { name: 'Save trail', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0]!.summary).toContain('physical, supported');
  await page.getByRole('button', { name: 'Replay trail' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('keyboard-trail')).toHaveCount(0);
  await page.reload();
  expect(await records(page)).toHaveLength(1);
  await page.goto(`${APP}#/parent/today`);
  await unlockParent(page);
  await expect(page.getByText(/Keyboard trail:.*physical, supported/).first()).toBeVisible();
  const composer = page.getByTestId('today-composer');
  await composer.fill('Synthetic learner tried letters W A S D E Q R.');
  await expect(composer).toHaveValue('Synthetic learner tried letters W A S D E Q R.');
});
test('phone touch records recognition separately; skip/cancel saves no evidence', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'alphabet');
  await page.getByRole('button', { name: 'Skip letter' }).click();
  await page.getByRole('button', { name: 'Back to school' }).click();
  expect(await records(page)).toHaveLength(0);
  await talkTo(page, 'alphabet');
  for (let i = 0; i < 5; i++) {
    const letter = await prompt(page);
    await page.getByRole('button', { name: `Touch letter ${letter}`, exact: true }).click();
    await expect(page.getByTestId('dialogue-line').locator('.sr-only')).not.toContainText(`Find ${letter}`);
  }
  await page.getByRole('button', { name: 'Save trail', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0]!.summary).toContain('touch');
  expect(saved[0]!.summary).not.toContain('physical');
});

test('two live tabs race the same completion through the atomic learning service', async ({ page, context }) => {
  await enterSchool(page);
  await page.getByTestId('discover-ok').click();
  const other = await context.newPage();
  await enterSchool(other);
  const run = {
    id: 'synthetic-multi-tab-run',
    startedAt: new Date().toISOString(),
    letters: ['A', 'B', 'C', 'D', 'E'],
    trials: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ letter, modality: 'physical' as const, outcome: 'independent' as const })),
    hinted: false,
    cancelled: false,
  };
  await Promise.all(
    [page, other].map((tab) =>
      tab.evaluate(async (input) => {
        await window.__izzy!.saveKeyboardTrail(input);
      }, run),
    ),
  );
  expect(await records(page)).toHaveLength(1);
  const count = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('izzys-classroom');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<number>((resolve) => {
        const r = db.transaction('evidence').objectStore('evidence').count();
        r.onsuccess = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
  expect(count).toBe(5);
  await page.reload();
  expect(await records(page)).toHaveLength(1);
  await other.close();
});
