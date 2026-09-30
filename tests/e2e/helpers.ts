import { expect, type Page } from 'playwright/test';

declare global {
  interface Window {
    __izzy?: {
      game(): { busy: boolean } | null;
      interact(id: string): void;
      teleportTo(id: string): void;
      overlay(): string | null;
      booksOnShelf(): number;
      explored(): string[];
      stepOn(n: number): void;
      performing(): boolean;
      circuit(): { next: number } | null;
    };
  }
}

export const APP = '/?maxfps=3';

/** Opens a child's school and waits until the 3D world is interactive. */
export async function enterSchool(page: Page, child = 'izzy'): Promise<void> {
  await page.goto(`${APP}#/`);
  await page.getByTestId(`enter-${child}`).click();
  await page.waitForFunction(() => !!window.__izzy?.game(), null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__izzy?.game()?.busy === false, null, { timeout: 300_000 });
  await expect(page.getByTestId('hud-books')).toBeVisible();
}

/** Walks (teleports, for speed) to a teacher/object and interacts with it. */
export async function talkTo(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => window.__izzy!.teleportTo(target), id);
  await page.waitForTimeout(800);
  await page.evaluate((target) => window.__izzy!.interact(target), id);
}

/** Clicks through any pending celebration cards. */
export async function dismissCelebrations(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 8 && (await page.getByTestId('celebration').count()); i++) {
    seen.push((await page.getByTestId('celebration').innerText()).replace(/\s+/g, ' '));
    await page.getByTestId('celebrate-next').click();
    await page.waitForTimeout(700);
  }
  return seen;
}

export async function unlockParent(page: Page): Promise<void> {
  for (const d of '1234') await page.getByTestId(`pin-${d}`).click();
}
