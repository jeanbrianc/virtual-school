/**
 * Natural voices and listening through the family's AI helper (OpenAI on the
 * hosted site). The helper is simulated at /api: it "speaks" with a short
 * chime and "hears" a fixed sentence. A parent turns both on in Settings, then
 * Hoot talks in his natural voice and hears Izzy through the helper.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'playwright/test';
import { APP, enterSchool, unlockParent } from './helpers';

declare global {
  interface Window {
    __fallback: string[];
    __played: number;
    __micOpened: string[];
  }
}

const chime = readFileSync(new URL('./fixtures/chime.mp3', import.meta.url));

// A fake microphone (Chromium's test device) that's allowed without a prompt.
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      // The fake microphone "says" a sentence, then pauses (so listening stops by itself).
      `--use-file-for-fake-audio-capture=${fileURLToPath(new URL('./fixtures/speech.wav', import.meta.url))}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test('natural teacher voices and listening through the AI helper', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // What reaches the helper.
  const spoken: { teacherId: string; text: string }[] = [];
  const heard: { mime: string; bytes: number; keywords: string[]; childName?: string }[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    expect(req.headers()['x-izzy-classroom']).toBe('1');
    if (path === '/api/health') {
      return route.fulfill({
        json: { ok: true, keyConfigured: true, provider: 'openai', model: 'gpt-6-luna', voices: true, listening: true },
      });
    }
    if (path === '/api/v1/speak') {
      spoken.push(req.postDataJSON() as { teacherId: string; text: string });
      return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: chime });
    }
    if (path === '/api/v1/listen') {
      const body = req.postDataJSON() as { audio: string; mime: string; keywords: string[]; childName?: string };
      heard.push({
        mime: body.mime,
        bytes: Buffer.from(body.audio, 'base64').length,
        keywords: body.keywords,
        ...(body.childName ? { childName: body.childName } : {}),
      });
      return route.fulfill({ json: { text: 'i read daddy the goodnight leelanau book' } });
    }
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });

  // Count real audio playback, and catch any fallback to the computer's own voice.
  await page.addInitScript(() => {
    window.__fallback = [];
    window.__played = 0;
    window.__micOpened = [];
    // Which microphone gets opened.
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => {
      const audio = c?.audio;
      const id = typeof audio === 'object' ? (audio.deviceId as { exact?: string } | undefined)?.exact : undefined;
      window.__micOpened.push(id ?? 'default');
      return gum(c);
    };
    const synth = window.speechSynthesis as unknown as Record<string, unknown>;
    synth.speak = (u: { text: string; onend?: () => void }) => {
      window.__fallback.push(u.text);
      window.setTimeout(() => u.onend?.(), 10);
    };
    synth.cancel = () => undefined;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      window.__played += 1;
      return play.call(this);
    };
  });

  // ── A parent points the school at the helper and turns both on ──────────
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  await page.getByTestId('ai-endpoint').fill('/api');
  await page.getByTestId('ai-endpoint').blur();
  await page.getByTestId('ai-check').click();
  await expect(page.getByTestId('ai-check-result')).toHaveText(
    'Connected to helper — OpenAI (gpt-6-luna) is configured; provider requests are not tested. Natural voices and listening are configured; not tested.',
  );
  await page.getByTestId('natural-test').click();
  await expect(page.getByTestId('natural-test-result')).toContainText('Voice generation passed');
  expect(spoken.at(-1)).toEqual({ teacherId: 'hoot', text: 'Hoo-hoo! This is a teacher voice test.' });
  // (Saved settings update the switches a moment later, so click and then wait.)
  await page.getByTestId('natural-toggle').click();
  await expect(page.getByTestId('natural-toggle')).toBeChecked();
  await expect(page.getByTestId('natural-voices')).toContainText('AI-generated voice');
  await page.getByTestId('talk-helper').click();
  await expect(page.getByTestId('talk-helper')).toBeChecked();

  // Choose a particular microphone (Chromium's test devices stand in for "MacBook Pro Microphone").
  const picker = page.getByTestId('mic-pick');
  await expect(picker).toBeVisible();
  const chosen = await page.evaluate(async () => {
    const mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default');
    const m = mics[mics.length - 1]!;
    return { id: m.deviceId, label: m.label };
  });
  await picker.selectOption(chosen.id);
  await expect(picker).toHaveValue(chosen.id);
  await expect(page.getByTestId('talk-status')).toContainText('Ready — your AI helper (OpenAI)');
  await expect(page.getByText('Her voice is recorded only while the microphone is on')).toBeVisible();

  // "Hear it" uses Hoot's natural voice.
  await page.getByTestId('say-name-hear').click();
  await expect.poll(() => spoken.at(-1)).toEqual({ teacherId: 'hoot', text: 'Hoo-hoo! Hello, Izzy! Ready to read with me, Izzy?' });
  await expect.poll(() => page.evaluate(() => window.__played)).toBeGreaterThan(0);

  // ── In the school ───────────────────────────────────────────────────────
  await enterSchool(page);
  await page.getByTestId('discover-action').click(); // "Meet Professor Hoot"
  await expect(page.getByTestId('dialogue-line')).toContainText('you must be Izzy', { timeout: 120_000 });
  const playedBefore = await page.evaluate(() => window.__played);
  await page.locator('.dialogue-tools').getByRole('button', { name: 'Read it to me' }).click();
  await expect.poll(() => spoken.at(-1)?.text ?? '').toContain('you must be Izzy');
  await expect.poll(() => page.evaluate(() => window.__played)).toBeGreaterThan(playedBefore);

  // She talks: the recording goes to the helper, and Hoot answers what she said — out loud.
  await page.getByTestId('talk-bar').getByTestId('mic-btn').click();
  await expect(page.getByTestId('talk-status')).toContainText('I’m listening', { timeout: 60_000 });
  // She stops talking; listening stops by itself and the words come back from the helper.
  await expect(page.getByTestId('dialogue-line')).toContainText('You read Goodnight Leelanau to Daddy?', { timeout: 90_000 });
  expect(heard).toHaveLength(1);
  expect(heard[0]!.mime).toMatch(/^audio\/(webm|ogg|mp4)/);
  expect(heard[0]!.bytes).toBeGreaterThan(1000);
  expect(heard[0]!.childName).toBe('Izzy');
  expect(await page.evaluate(() => window.__micOpened.at(-1))).toBe(chosen.id);
  await expect.poll(() => spoken.at(-1)?.text ?? '').toContain('Goodnight Leelanau');

  // Nothing fell back to the computer's voice, and nothing broke.
  expect(await page.evaluate(() => window.__fallback)).toEqual([]);
  expect(errors).toEqual([]);
});
