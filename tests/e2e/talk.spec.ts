/**
 * Talking to teachers: she says "I read Daddy the Goodnight Leelanau book"
 * into the microphone (a simulated on-device recognizer), Hoot answers about
 * that book, she confirms she read the whole thing, and it goes on her shelf.
 * Then a worry typed to Hoot reaches the parent's Today page.
 */
import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { DB_NAME } from '../../src/data/schema';
import { APP, dismissCelebrations, enterSchool, talkTo, unlockParent } from './helpers';
import { captureSyntheticSuccess, useSyntheticHousehold } from './synthetic-household';

declare global {
  interface Window {
    __speechQueue: string[];
    __speechEvents: { event: string; at: number; data?: unknown }[];
    __speechSnapshot(stage: string): Promise<void>;
  }
}

test.beforeEach(async ({ page }) => {
  // A stand-in for the browser's on-device recognizer: each start() "hears" the next queued sentence.
  await page.addInitScript((databaseName) => {
    window.__speechQueue = [];
    window.__speechEvents = [];
    const log = (event: string, data?: unknown) => {
      if (window.__speechEvents.length < 100) window.__speechEvents.push({ event, at: performance.now(), ...(data === undefined ? {} : { data }) });
    };
    window.__speechSnapshot = (stage) => {
      const button = document.querySelector('[data-testid="talk-bar"] [data-testid="mic-btn"]');
      log('snapshot', {
        stage,
        queue: [...window.__speechQueue],
        busy: button?.getAttribute('aria-busy'),
        pressed: button?.getAttribute('aria-pressed'),
        label: button?.getAttribute('aria-label'),
        status: document.querySelector('[data-testid="talk-bar"]')?.textContent?.slice(0, 1000),
      });
      // Observation only; never write, and do not delay the next explicit tap.
      return new Promise<void>((resolve) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => {
          const db = request.result;
          const query = db.transaction('meta').objectStore('meta').get('speechProbe');
          query.onsuccess = () => {
            const value = query.result?.value;
            log('persisted-probe', { stage, value: value ? { answer: value.answer, browser: value.browser, at: value.at } : null });
            db.close();
            resolve();
          };
          query.onerror = () => {
            log('persisted-probe-error', { stage });
            db.close();
            resolve();
          };
        };
        request.onerror = () => {
          log('database-open-error', { stage });
          resolve();
        };
      });
    };
    const devices = navigator.mediaDevices;
    if (devices?.enumerateDevices) {
      const enumerate = devices.enumerateDevices.bind(devices);
      devices.enumerateDevices = async () => {
        log('enumerate-start');
        try {
          const result = await enumerate();
          log('enumerate-end', { count: result.length, kinds: result.map((d) => d.kind) });
          return result;
        } catch (error) {
          log('enumerate-error', { name: error instanceof Error ? error.name : 'unknown' });
          throw error;
        }
      };
      devices.getUserMedia = async () => {
        log('unexpected-real-microphone-request');
        throw new Error('Synthetic talk fixture forbids actual microphone capture');
      };
    }
    let nextRecognizer = 0;
    (window as unknown as { __installs: number }).__installs = 0;
    class FakeRecognition {
      // Like a fresh Chrome: on-device recognition works once the voice pack is installed.
      static installed = false;
      static available = async () => {
        const answer = FakeRecognition.installed ? 'available' : 'downloadable';
        log('available', { answer });
        return answer;
      };
      static install = async () => {
        (window as unknown as { __installs: number }).__installs += 1;
        log('install', { count: (window as unknown as { __installs: number }).__installs });
        FakeRecognition.installed = true;
        return true;
      };
      id = ++nextRecognizer;
      constructor() {
        log('constructor', { id: this.id });
      }
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
        log('start', { id: this.id, text, remaining: [...window.__speechQueue], processLocally: this.processLocally });
        const event = (t: string, isFinal: boolean) => ({ resultIndex: 0, results: [Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal })] });
        window.setTimeout(() => {
          if (!text) {
            log('end-empty', { id: this.id });
            return this.onend?.();
          }
          log('interim', { id: this.id });
          this.onresult?.(event(text.split(' ').slice(0, 3).join(' '), false));
          window.setTimeout(() => {
            log('final', { id: this.id });
            this.onresult?.(event(text, true));
            log('end', { id: this.id });
            this.onend?.();
          }, 400);
        }, 200);
      }
      stop() {
        log('stop', { id: this.id });
      }
      abort() {
        log('abort', { id: this.id });
      }
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  }, DB_NAME);
  await useSyntheticHousehold(page);
});

test('she tells Hoot about a book out loud and it goes on her shelf', async ({ page, isMobile }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  try {
    await enterSchool(page, 'sample');
    await page.getByTestId('discover-action').click(); // "Meet Professor Hoot"
    await expect(page.getByTestId('dialogue-line')).toContainText('you must be Sample', { timeout: 120_000 });

    // First-time setup refreshes the mic and cancels the obsolete operation.
    // A second explicit tap starts listening with the installed on-device pack.
    await page.evaluate(() => window.__speechQueue.push('i read daddy the goodnight leelanau book'));
    await page.getByTestId('talk-bar').getByTestId('mic-btn').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __installs: number }).__installs)).toBe(1);
    await expect(page.getByTestId('talk-bar').getByTestId('mic-btn')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('talk-bar').getByTestId('mic-btn')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.__speechQueue)).toEqual(['i read daddy the goodnight leelanau book']);
    await page.evaluate(() => {
      void window.__speechSnapshot('after-setup-before-second-tap');
    });
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
    await expect(page.locator('.choices .choice').first()).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByTestId('star-5').click();
    await expect(page.getByTestId('star-5')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('rating-next').click();
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

    // Saved transcript turns are visible to parents, with spoken lines marked.
    if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
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
  } finally {
    if (!page.isClosed()) {
      await page.evaluate(() => window.__speechSnapshot('scenario-finally'));
      const diagnostics = await page.evaluate(() => ({ events: window.__speechEvents, queue: window.__speechQueue }));
      const path = info.outputPath('synthetic-talk-diagnostics.json');
      writeFileSync(path, JSON.stringify(diagnostics, null, 2));
      await info.attach('Synthetic microphone fixture diagnostics', { path, contentType: 'application/json' });
      console.log('Synthetic microphone fixture diagnostics:', JSON.stringify(diagnostics));
    }
  }
});

test.afterEach(async ({ page }, info) => captureSyntheticSuccess(page, info));
