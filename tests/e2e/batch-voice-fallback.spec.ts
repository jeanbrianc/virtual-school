import { expect, test } from 'playwright/test';
import { APP, unlockParent } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

test('helper quota failure keeps built-in speech available and counts cooldown fallback without another request', async ({ page }, info) => {
  let attempts = 0;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, keyConfigured: true, voices: true, listening: false } });
    if (path === '/api/v1/speak') {
      attempts += 1;
      return route.fulfill({ status: 429, json: { error: 'Synthetic quota failure', retryAfterSeconds: 900 } });
    }
    throw new Error(`Unexpected helper request: ${path}`);
  });
  await page.addInitScript(() => {
    const state = window as unknown as { batchSpoken: string[] };
    state.batchSpoken = [];
    const synth = window.speechSynthesis as unknown as Record<string, unknown>;
    synth.speak = (utterance: { text: string; onend?: () => void }) => {
      state.batchSpoken.push(utterance.text);
      window.setTimeout(() => utterance.onend?.(), 10);
    };
    synth.cancel = () => undefined;
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error('This fallback test must not open a microphone');
    };
  });
  await useSyntheticHousehold(page);
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  await page.getByTestId('ai-endpoint').fill('/api');
  await page.getByTestId('ai-endpoint').blur();
  await page.getByTestId('ai-check').click();
  await expect(page.getByTestId('natural-toggle')).toBeEnabled();
  await page.getByTestId('natural-toggle').check();
  await page.getByTestId('say-name-hear').click();
  const spoken = () => page.evaluate(() => (window as unknown as { batchSpoken: string[] }).batchSpoken);
  await expect.poll(spoken).toEqual(['Hoo-hoo! Hello, Sample! Ready to read with me, Sample?']);
  expect(attempts).toBe(1);
  await expect(page.getByTestId('usage-attempts')).toHaveText('1 observed request attempts');
  await expect(page.getByTestId('usage-view')).toContainText('built-in fallbacks: 1');
  await page.getByTestId('say-name-input').fill('Sample friend');
  await page.getByTestId('say-name-hear').click();
  await expect.poll(spoken).toHaveLength(2);
  expect(attempts).toBe(1);
  await expect(page.getByTestId('usage-view')).toContainText('built-in fallbacks: 2');
  await expect(page.getByTestId('usage-view')).toContainText('failed: 1');
  await page.getByTestId('usage-view').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('synthetic-voice-fallback.png'), fullPage: true });
});
