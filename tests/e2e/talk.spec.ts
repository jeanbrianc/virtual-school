/**
 * Talking to teachers: she says "I read Daddy the Goodnight Leelanau book"
 * into the microphone (a simulated on-device recognizer), Hoot answers about
 * that book, she confirms she read the whole thing, and it goes on her shelf.
 * Then a worry typed to Hoot reaches the parent's Today page.
 */
import { expect, test } from 'playwright/test';
import { APP, dismissCelebrations, enterSchool, talkTo, unlockParent } from './helpers';

declare global {
  interface Window {
    __speechQueue: string[];
  }
}

test.beforeEach(async ({ page }) => {
  // A stand-in for the browser's on-device recognizer: each start() "hears" the next queued sentence.
  await page.addInitScript(() => {
    window.__speechQueue = [];
    (window as unknown as { __installs: number }).__installs = 0;
    class FakeRecognition {
      // Like a fresh Chrome: on-device recognition works once the voice pack is installed.
      static installed = false;
      static available = async () => (FakeRecognition.installed ? 'available' : 'downloadable');
      static install = async () => {
        (window as unknown as { __installs: number }).__installs += 1;
        FakeRecognition.installed = true;
        return true;
      };
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      processLocally = false;
      phrases: unknown[] = [];
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const text = window.__speechQueue.shift() ?? '';
        const event = (t: string, isFinal: boolean) => ({ resultIndex: 0, results: [Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal })] });
        window.setTimeout(() => {
          if (!text) return this.onend?.();
          this.onresult?.(event(text.split(' ').slice(0, 3).join(' '), false));
          window.setTimeout(() => {
            this.onresult?.(event(text, true));
            this.onend?.();
          }, 400);
        }, 200);
      }
      stop() {}
      abort() {}
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  });
});

test('she tells Hoot about a book out loud and it goes on her shelf', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await enterSchool(page);
  await page.getByTestId('discover-action').click(); // "Meet Professor Hoot"
  await expect(page.getByTestId('dialogue-line')).toContainText('you must be Izzy', { timeout: 120_000 });

  // Tap the microphone and talk. The first tap sets up on-device listening
  // (the simulated browser needs its voice pack downloaded first).
  await page.evaluate(() => window.__speechQueue.push('i read daddy the goodnight leelanau book'));
  await page.getByTestId('talk-bar').getByTestId('mic-btn').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('You read Goodnight Leelanau to Daddy?', { timeout: 60_000 });
  await expect(page.getByTestId('talk-topic')).toContainText('Goodnight Leelanau');
  await expect(page.getByTestId('talk-topic')).toContainText('Read to Daddy');
  expect(await page.evaluate(() => (window as unknown as { __installs: number }).__installs)).toBe(1);

  // "Did you read the whole book?" — yes, by voice.
  await page.evaluate(() => window.__speechQueue.push('yes the whole thing'));
  await page.getByTestId('talk-bar').getByTestId('mic-btn').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('The whole book? Hoo-ray', { timeout: 60_000 });
  await page.getByTestId('choice-shelf').click();

  // A book Hoot doesn't know: how did it make her feel, then stars.
  await expect(page.getByTestId('dialogue-line')).toContainText('How did the story make you feel?');
  await page.locator('.choices .choice').first().click();
  await page.getByTestId('star-5').click();
  await expect(page.getByTestId('celebration')).toBeVisible({ timeout: 180_000 });
  const cards = await dismissCelebrations(page);
  expect(cards.join(' ')).toMatch(/Goodnight Leelanau is on your bookshelf/);
  expect(await page.evaluate(() => window.__izzy!.booksOnShelf())).toBe(1);

  // A worry, typed this time: the on-device safety answer, and a note for parents.
  await talkTo(page, 'hoot');
  await page.getByTestId('talk-input').fill('my tummy hurts');
  await page.getByTestId('talk-send').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('Please go tell Mom or Dad', { timeout: 60_000 });
  await page.getByTestId('choice-bye').click();

  await page.goto(`${APP}#/parent/today`);
  await unlockParent(page);
  await expect(page.getByTestId('teacher-notes')).toContainText('my tummy hurts');
  await page.getByRole('button', { name: 'I’ve talked with her' }).click();
  await expect(page.getByTestId('teacher-notes')).toHaveCount(0);

  // Every word is visible to parents, with spoken lines marked.
  await page.getByTestId('nav-conversations').click();
  await page.locator('.convo-head').last().click();
  await expect(page.locator('.transcript')).toContainText('i read daddy the goodnight leelanau book');
  await expect(page.locator('.transcript .via-tag').first()).toHaveText('🎤');

  // Settings: talking is ready on-device; AI teachers stay off until a parent consents.
  await page.goto(`${APP}#/parent/settings`);
  await expect(page.getByTestId('talk-status')).toContainText('on this computer');
  await expect(page.getByTestId('ai-enabled')).toBeDisabled();
  await page.getByTestId('ai-check').click();
  await expect(page.getByText(/Can’t reach the helper/)).toBeVisible({ timeout: 60_000 });

  expect(
    errors.filter((e) => !/127\.0\.0\.1:8787|ERR_CONNECTION_REFUSED/.test(e)),
    errors.join('\n'),
  ).toEqual([]);
});
