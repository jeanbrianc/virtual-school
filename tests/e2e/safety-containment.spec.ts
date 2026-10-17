import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { APP, enterSchool, talkTo, unlockParent } from './helpers';
import { useSyntheticHousehold } from './synthetic-household';

test.use({ actionTimeout: 45_000 });

const chime = readFileSync(new URL('./fixtures/chime.mp3', import.meta.url));

test('recognized safety stays local through repeated turns and Back; retained parent evidence and fresh AI both work', async ({ page, isMobile }, info) => {
  const teacherRequests: unknown[] = [];
  const voiceRequests: { text: string }[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Every network request is bounded to the static test app or fulfilled below.
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4180') {
      unexpected.push(request.url());
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/health')
      return route.fulfill({ json: { ok: true, keyConfigured: true, provider: 'openai', model: 'gpt-6-luna', voices: true, listening: false } });
    if (url.pathname === '/api/v1/teacher') {
      const body = request.postDataJSON() as { childName: string };
      expect(body.childName).toBe('Sample');
      teacherRequests.push(body);
      return route.fulfill({ json: { reply: 'A synthetic story reply!', intent: 'share', finished: null } });
    }
    if (url.pathname === '/api/v1/speak') {
      voiceRequests.push(request.postDataJSON());
      return route.fulfill({ contentType: 'audio/mpeg', body: chime });
    }
    unexpected.push(url.pathname);
    return route.abort();
  });
  await page.addInitScript(() => {
    const state = window as unknown as { safetyLocalSpeech: string[]; safetyMicrophones: number };
    state.safetyLocalSpeech = [];
    state.safetyMicrophones = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      state.safetyMicrophones++;
      throw new Error('No real microphone allowed');
    };
    Object.assign(window, {
      SpeechSynthesisUtterance: class {
        constructor(public text: string) {}
      },
    });
    const localVoice = { name: 'Synthetic local voice', lang: 'en-US', localService: true, default: true, voiceURI: 'synthetic-local' };
    window.speechSynthesis.getVoices = () => [localVoice];
    window.speechSynthesis.cancel = () => undefined;
    window.speechSynthesis.speak = (utterance) => {
      state.safetyLocalSpeech.push(utterance.text);
      window.setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 0);
    };
    HTMLMediaElement.prototype.play = async function () {
      window.setTimeout(() => this.dispatchEvent(new Event('ended')), 0);
    };
  });
  const selectSample = async (section: 'settings' | 'today') => {
    if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByLabel('Viewing learner').selectOption({ label: 'Sample' });
    if (isMobile) {
      // The legacy sidebar covers the Menu toggle. Use real navigation to close it.
      await page.getByTestId(`nav-${section === 'settings' ? 'today' : 'settings'}`).click();
      await expect(page.locator('.p-side')).not.toHaveClass(/open/);
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByTestId(`nav-${section}`).click();
      await expect(page.locator('.p-side')).not.toHaveClass(/open/);
    }
    await expect(page.getByLabel('Viewing learner')).toHaveValue('child_izzy');
  };
  await useSyntheticHousehold(page);
  expect(teacherRequests).toHaveLength(0);
  expect(voiceRequests).toHaveLength(0);
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  await selectSample('settings');
  await page.getByTestId('ai-endpoint').fill('/api');
  await page.getByTestId('ai-endpoint').blur();
  await page.getByTestId('ai-check').click();
  await expect(page.getByTestId('ai-check-result')).toContainText('Connected to helper');
  await page.getByTestId('ai-consent').click();
  await expect(page.getByTestId('ai-consent')).toBeChecked();
  await page.getByTestId('ai-enabled').click();
  await expect(page.getByTestId('ai-enabled')).toBeChecked();
  await page.getByTestId('natural-toggle').click();
  await expect(page.getByTestId('natural-toggle')).toBeChecked();
  await page.getByLabel(/Teachers read their/).click();
  await expect(page.getByLabel(/Teachers read their/)).toBeChecked();
  await enterSchool(page, 'sample');
  await page.getByTestId('discover-ok').click();
  await talkTo(page, 'hoot');
  await expect(page.getByTestId('talk-input')).toBeVisible();
  const say = async (text: string) => {
    await page.getByTestId('talk-input').fill(text);
    await page.getByTestId('talk-send').click();
    await expect(page.getByTestId('talk-input')).toBeEnabled();
  };
  await say('I like stars');
  await expect(page.getByTestId('dialogue-line')).toContainText('A synthetic story reply!');
  await expect.poll(() => teacherRequests.length).toBe(1);
  await expect.poll(() => voiceRequests.some((request) => request.text === 'A synthetic story reply!')).toBe(true);
  await say('I am scared');
  await expect(page.getByTestId('dialogue-line')).toContainText('Please go tell Mom or Dad');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { safetyLocalSpeech: string[] }).safetyLocalSpeech.some((line) => line.includes('Please go tell Mom or Dad'))),
    )
    .toBe(true);
  const voicesBefore = voiceRequests.length;
  for (let turn = 0; turn < 12; turn++) {
    await say(`I like stars ${turn}`);
    await expect(page.getByTestId('dialogue-line')).not.toContainText('A synthetic story reply!');
    expect(teacherRequests).toHaveLength(1);
    expect(voiceRequests).toHaveLength(voicesBefore);
  }
  await page.getByRole('button', { name: 'Read it to me', exact: true }).click();
  await page.getByRole('button', { name: 'Back to library', exact: true }).click();
  await say('I like books');
  await expect(page.getByTestId('dialogue-line')).toContainText('You love books? Hoo-hoo, so do I!');
  expect(teacherRequests).toHaveLength(1);
  expect(voiceRequests).toHaveLength(voicesBefore);
  await page.getByRole('dialog').screenshot({ path: `test-results/safety-local-${info.project.name}.png` });
  await page.getByTestId('dialogue-close').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await talkTo(page, 'nova');
  await say('I like stars');
  await expect(page.getByTestId('dialogue-line')).toContainText('A synthetic story reply!');
  expect(teacherRequests).toHaveLength(2);
  expect(JSON.stringify([...teacherRequests, ...voiceRequests])).not.toContain('I am scared');
  await page.getByTestId('dialogue-close').click();
  await page.goto(`${APP}#/parent/today`);
  await unlockParent(page);
  await selectSample('today');
  await expect(page.getByTestId('teacher-notes')).toContainText('I am scared');
  await page.getByTestId('teacher-notes').screenshot({ path: `test-results/safety-parent-note-${info.project.name}.png` });
  if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByTestId('nav-conversations').click();
  const conversation = page.locator('.convo-head').filter({ hasText: 'Professor Hoot' }).first();
  await conversation.click();
  await expect(page.locator('.transcript')).toContainText('I am scared');
  expect(await page.evaluate(() => (window as unknown as { safetyMicrophones: number }).safetyMicrophones)).toBe(0);
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
  await info.attach('mocked-outbound-requests', {
    body: JSON.stringify({ teacherRequests, voiceRequests, unexpected, providerCalls: 0, fixture: 'synthetic' }, null, 2),
    contentType: 'application/json',
  });
});
