import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { DB_NAME } from '../../src/data/schema';
import type { Household, TeacherInteraction } from '../../src/domain/types';
import { APP, unlockParent } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

test.use({ actionTimeout: 45_000 });

async function seedNoticeState(page: Page, enabled: boolean, consentToSend: boolean): Promise<void> {
  await page.evaluate(
    async ({ name, enabled, consentToSend }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['households', 'teacherInteractions'], 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          const households = tx.objectStore('households');
          const request = households.getAll();
          request.onsuccess = () => {
            for (const household of request.result as Household[]) {
              households.put({
                ...household,
                settings: {
                  ...household.settings,
                  talkMode: 'helper',
                  teacherAi: { enabled, consentToSend, endpoint: '/api', naturalVoices: true },
                },
              });
            }
          };
          const summary: TeacherInteraction = {
            id: 'synthetic-summary',
            childId: 'child_izzy',
            teacherId: 'nova',
            startedAt: '2026-01-01T12:00:00Z',
            endedAt: '2026-01-01T12:01:00Z',
            context: { flow: 'Synthetic activity' },
            transcript: [{ speaker: 'system', text: 'Completed a synthetic sorting activity.', at: '2026-01-01T12:01:00Z' }],
            outcome: 'Synthetic activity summary',
            isDemo: true,
          };
          tx.objectStore('teacherInteractions').put(summary);
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, enabled, consentToSend },
  );
  await page.reload();
  await expect(page.getByTestId('enter-sample')).toBeVisible();
}

test('avatar inspiration photo notice includes opt-in household sharing without changing saved settings', async ({ page, baseURL }, info) => {
  const unexpected: string[] = [];
  const errors: string[] = [];
  let microphoneAttempts = 0;
  await page.exposeFunction('avatarPrivacyMicrophoneAttempt', () => microphoneAttempts++);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL!).origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin === new URL(baseURL!).origin && url.pathname === '/api/health')
      return route.fulfill({ json: { ok: true, keyConfigured: false, provider: 'mock-only', voices: false, listening: false } });
    unexpected.push(url.href);
    return route.abort();
  });
  await page.routeWebSocket('**/*', (socket) => {
    unexpected.push(socket.url());
    socket.close();
  });
  await page.addInitScript(() => {
    const state = window as unknown as { avatarPrivacyMicrophoneAttempt(): Promise<void> };
    navigator.mediaDevices.getUserMedia = async () => {
      await state.avatarPrivacyMicrophoneAttempt();
      throw new Error('No real microphone allowed');
    };
  });
  await useSyntheticHousehold(page);
  const saved = () =>
    page.evaluate(async (name) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const read = (table: string) =>
          new Promise<unknown[]>((resolve, reject) => {
            const request = db.transaction(table).objectStore(table).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        return { households: await read('households'), avatars: await read('avatars'), media: await read('media') };
      } finally {
        db.close();
      }
    }, DB_NAME);
  const before = await saved();
  await page.goto(`${APP}#/parent/avatar`);
  await unlockParent(page);
  await expect(page.getByRole('heading', { name: 'Sample’s avatar', exact: true })).toBeVisible();
  const notice = page.locator('.inspiration .privacy-points');
  for (const text of [
    'Stored in this browser',
    'When family sync is on',
    'photos already saved here, are uploaded to your household sync',
    'shared with your household’s signed-in devices',
  ])
    await expect(notice).toContainText(text);
  await expect(notice).not.toContainText(/Stays on this device only|Never uploaded|never analysed or uploaded/i);
  await notice.scrollIntoViewIfNeeded();
  const bounds = await notice.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
  await notice.screenshot({ path: info.outputPath(`avatar-photo-privacy-${info.project.name}.png`) });
  const after = await saved();
  expect(after).toEqual(before);
  expect(microphoneAttempts).toBe(0);
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
  writeFileSync(
    info.outputPath('avatar-photo-privacy.json'),
    JSON.stringify({ project: info.project.name, bounds, savedRecordsUnchanged: true, microphoneAttempts, unexpected, errors }, null, 2),
  );
});

for (const enabled of [false, true]) {
  for (const consent of [false, true]) {
    test(`Teacher talk privacy with AI enabled=${enabled}, consent=${consent}`, async ({ page, isMobile, baseURL }, info) => {
      const unexpected: string[] = [];
      const errors: string[] = [];
      let microphoneAttempts = 0;
      await page.exposeFunction('privacyMicrophoneAttempt', () => microphoneAttempts++);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(baseURL!).origin && !url.pathname.startsWith('/api/')) return route.continue();
        if (url.origin === new URL(baseURL!).origin && url.pathname === '/api/health') {
          return route.fulfill({ json: { ok: true, keyConfigured: true, provider: 'openai', voices: true, listening: true } });
        }
        unexpected.push(url.href);
        return route.abort();
      });
      await page.addInitScript(() => {
        const state = window as unknown as { privacyMicrophoneAttempt(): Promise<void> };
        navigator.mediaDevices.getUserMedia = async () => {
          await state.privacyMicrophoneAttempt();
          throw new Error('No real microphone allowed');
        };
      });
      // Apply canonical anonymous profiles after every init mock, then reload.
      await useSyntheticHousehold(page);
      await seedNoticeState(page, enabled, consent);
      await page.goto(`${APP}#/parent/today`);
      await unlockParent(page);
      if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByLabel('Viewing learner').selectOption({ label: 'Sample' });
      await expect(page.getByLabel('Viewing learner')).toHaveValue('child_izzy');
      await page.getByTestId('nav-conversations').click();
      await expect(page.locator('.p-side')).not.toHaveClass(/open/);

      const notice = page.getByTestId('conversation-privacy');
      const checkCopy = async () => {
        await expect(page.getByRole('heading', { name: 'Teacher talk', exact: true })).toBeVisible();
        await expect(page.locator('.page-sub')).toContainText('Saved conversations and activity summaries for Sample');
        await expect(page.locator('.page-sub')).toContainText('Some activities save summaries rather than every line');
        await expect(notice).toContainText(`Optional AI chat: ${enabled && consent ? 'on' : 'off'}`);
        await expect(notice).toContainText('stored in this browser');
        await expect(notice).toContainText('family sync when enabled, or in exports you make');
        await expect(notice).toContainText('Voice and microphone sharing are controlled separately');
        await expect(notice).toContainText('may send text or audio to other services');
        if (enabled && consent) {
          for (const field of ['first name', 'current message', 'recent conversation turns', 'book titles']) await expect(notice).toContainText(field);
          await expect(notice).toContainText('helper and its AI service receive text');
        } else {
          await expect(notice).toContainText('Built-in chat replies run on this device');
        }
        await expect(page.locator('.page')).not.toContainText(/Stored only on this device|nothing is sent anywhere|word for word|every conversation/i);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      };
      await checkCopy();
      const summary = page.getByRole('button', { name: /Synthetic activity summary/ });
      await summary.click();
      await expect(summary).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByText('Completed a synthetic sorting activity.', { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`conversation-privacy-${info.project.name}-${enabled}-${consent}.png`), fullPage: true });
      await summary.click();
      await expect(summary).toHaveAttribute('aria-expanded', 'false');

      // Real Settings link, then browser Back and reload preserve the accurate notice.
      await notice.getByRole('link', { name: 'Settings & privacy' }).click();
      await expect(page.getByRole('heading', { name: 'Settings & privacy', exact: true })).toBeVisible();
      await page.goBack();
      await checkCopy();
      await page.reload();
      await checkCopy();
      expect(microphoneAttempts).toBe(0);
      expect(unexpected).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
