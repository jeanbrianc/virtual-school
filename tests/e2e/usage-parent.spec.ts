import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { APP, unlockParent } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

const chime = readFileSync(new URL('./fixtures/chime.mp3', import.meta.url));
for (const viewport of [
  { width: 1100, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`parent-only tab usage, warning, export and reset at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let paidAttempts = 0;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/health')
        return route.fulfill({ json: { ok: true, keyConfigured: true, provider: 'openai', model: 'gpt-6-luna', voices: true, listening: true } });
      if (path === '/api/v1/speak') {
        paidAttempts += 1;
        const body = route.request().postDataJSON() as { text: string };
        expect(body.text).toBe('Hoo-hoo! This is a teacher voice test.');
        if (paidAttempts > 3) return route.fulfill({ status: 429, json: { error: 'Synthetic limit. Built-in voices still work.' } });
        return route.fulfill({
          contentType: 'audio/mpeg',
          body: chime,
          headers: { 'X-Classroom-Usage': JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini-tts' }) },
        });
      }
      throw new Error(`Unexpected helper request: ${path}`);
    });
    await page.addInitScript(() => {
      const state = window as unknown as { usageMicCalls: number };
      state.usageMicCalls = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        state.usageMicCalls += 1;
        throw new Error('Usage view must never open a microphone');
      };
    });
    await useSyntheticHousehold(page);
    await page.goto(`${APP}#/parent/settings`);
    await expect(page.getByTestId('usage-view')).toHaveCount(0);
    await unlockParent(page);
    const view = page.getByTestId('usage-view');
    await expect(view).toBeVisible();
    await expect(page.getByTestId('usage-attempts')).toHaveText('0 observed request attempts');
    await expect(view).toContainText('Earlier usage is unknown');
    await expect(view).toContainText('not provider totals');
    await page.getByTestId('usage-warning').selectOption('10');
    await page.getByTestId('ai-endpoint').fill('/api');
    await page.getByTestId('ai-endpoint').blur();
    await page.getByTestId('ai-check').click();
    await expect(page.getByTestId('natural-test')).toBeEnabled();
    expect(paidAttempts).toBe(0);
    for (let i = 0; i < 10; i += 1) {
      await page.getByTestId('natural-test').click();
      await expect(page.getByTestId('usage-attempts')).toHaveText(`${i + 1} observed request attempts`);
      await expect(page.getByTestId('natural-test')).toBeEnabled();
    }
    await expect(view).toContainText('The 10-request warning has been reached');
    await expect(view).toContainText('Estimated API cost: unknown');
    await expect(view).toContainText('Provider-reported tokens: unknown');
    await view.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(view).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { usageMicCalls: number }).usageMicCalls)).toBe(0);
    await view.locator('..').screenshot({ path: `test-results/usage-parent-${viewport.width}.png`, scale: 'css' });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export local usage' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const exported = readFileSync(path!, 'utf8');
    expect(exported).not.toMatch(/Hoo-hoo|teacher voice test|Izzy|Leelanau|synthetic-key/);
    expect(JSON.parse(exported).verifiedProviderBilling).toBeNull();
    await page.getByRole('button', { name: 'Clear local usage' }).click();
    await expect(page.getByTestId('usage-attempts')).toHaveText('0 observed request attempts');
    expect(paidAttempts).toBe(10);
    await page.reload();
    await expect(page.getByTestId('usage-attempts')).toHaveText('0 observed request attempts');
    await expect(page.getByTestId('usage-warning')).toHaveValue('10');
  });
}
