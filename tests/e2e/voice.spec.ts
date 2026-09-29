/**
 * Read-aloud says her name the way the family does: a parent picks a spelling
 * that sounds right ("Izzee"), hears it, saves it, and the teachers use it when
 * they speak — while the words on screen still say "Izzy".
 */
import { expect, test } from 'playwright/test';
import { APP, enterSchool, unlockParent } from './helpers';

declare global {
  interface Window {
    __spoken: { text: string; voice: string | null }[];
  }
}

test.beforeEach(async ({ page }) => {
  // A stand-in for the computer's voices that writes down what it was asked to say.
  await page.addInitScript(() => {
    window.__spoken = [];
    const voice = (name: string, lang: string) => ({ name, lang, localService: true, default: false, voiceURI: name });
    const voices = [voice('Albert', 'en-US'), voice('Karen', 'en-AU'), voice('Samantha', 'en-US'), voice('Google US English', 'en-US')];
    voices[3]!.localService = false; // a network voice: never used
    class Utterance {
      text: string;
      voice: { name: string } | null = null;
      lang = '';
      pitch = 1;
      rate = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const synth = window.speechSynthesis as unknown as Record<string, unknown>;
    (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = Utterance;
    synth.getVoices = () => voices;
    synth.cancel = () => undefined;
    synth.speak = (u: Utterance) => {
      window.__spoken.push({ text: u.text, voice: u.voice?.name ?? null });
      window.setTimeout(() => u.onend?.(), 20);
    };
  });
});

const lastSpoken = (page: import('playwright/test').Page) => page.evaluate(() => window.__spoken.at(-1) ?? null);

test('a parent fixes how the voices say her name', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  const card = page.getByTestId('say-name');
  await expect(card).toContainText('How the voices say “Izzy”');

  // Automatic picks the clear built-in US voice, never a joke or network voice.
  await expect(page.getByTestId('voice-pick').locator('option').first()).toHaveText('Automatic — Samantha (US)');
  await expect(page.getByTestId('voice-pick').locator('option')).toHaveCount(4);

  // Try a suggestion: it plays right away.
  await card.getByRole('button', { name: 'Izzee' }).click();
  await expect.poll(() => lastSpoken(page)).toEqual({ text: 'Hoo-hoo! Hello, Izzee! Ready to read with me, Izzee?', voice: 'Samantha' });
  await expect(page.getByTestId('say-name-input')).toHaveValue('Izzee');

  // A different voice, then save.
  await page.getByTestId('voice-pick').selectOption('Karen');
  await page.getByTestId('say-name-hear').click();
  await expect.poll(() => lastSpoken(page)).toEqual({ text: 'Hoo-hoo! Hello, Izzee! Ready to read with me, Izzee?', voice: 'Karen' });
  await page.getByTestId('say-name-save').click();
  await expect(card).toContainText('Voices now say “Izzee”.');
  await expect(page.getByTestId('say-name-save')).toBeDisabled();

  // In the school the words still say "Izzy", but the voice says "Izzee".
  await enterSchool(page);
  await page.getByTestId('discover-action').click(); // "Meet Professor Hoot"
  await expect(page.getByTestId('dialogue-line')).toContainText('you must be Izzy', { timeout: 120_000 });
  const before = await page.evaluate(() => window.__spoken.length);
  await page.locator('.dialogue-tools').getByRole('button', { name: 'Read it to me' }).click();
  await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBeGreaterThan(before);
  const said = await lastSpoken(page);
  expect(said?.voice).toBe('Karen');
  expect(said?.text).toContain('you must be Izzee');
  expect(said?.text).not.toMatch(/\bIzzy\b/);

  // Back to her name as written.
  await page.goto(`${APP}#/parent/settings`); // still unlocked from before
  await page.getByTestId('say-name').getByRole('button', { name: 'Use “Izzy” as written' }).click();
  await expect(page.getByTestId('say-name')).toContainText('Voices read “Izzy” as written.');
  await expect(page.getByTestId('say-name-input')).toHaveValue('');

  expect(errors).toEqual([]);
});
