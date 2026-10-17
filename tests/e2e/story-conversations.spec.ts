import { expect, test, type Page } from 'playwright/test';
import { APP, dismissCelebrations, enterSchool, talkTo, unlockParent } from './helpers';
import type { Book, Evidence, TeacherInteraction } from '../../src/domain/types';

async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('izzys-classroom');
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const read = <T>(name: string) =>
        new Promise<T[]>((resolve) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
        });
      return {
        books: await read<Book>('books'),
        evidence: await read<Evidence>('evidence'),
        interactions: await read<TeacherInteraction>('teacherInteractions'),
      };
    } finally {
      db.close();
    }
  });
}

test.use({ permissions: [] });

test('parent depth, source-checked questions, hint/skip/cancel and saved history work offline', async ({ page }, testInfo) => {
  const name = testInfo.project.name;
  if (name === 'phone') await page.setViewportSize({ width: 320, height: 740 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${APP}#/parent/settings`);
  await unlockParent(page);
  await page.getByLabel('Conversation depth (household)').selectOption('deeper');
  await page.reload();
  // Parent unlock is retained for the tab session; handle either permitted state.
  if (await page.getByTestId('pin-1').count()) await unlockParent(page);
  await expect(page.getByLabel('Conversation depth (household)')).toHaveValue('deeper');
  await enterSchool(page);
  await page.getByTestId('discover-action').click();
  await page.getByTestId('choice-finish').click();
  await page.getByTestId('new-book-title').fill('Tom Kitten');
  await page.getByTestId('suggest-tom-kitten').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('climbing difficult');
  await expect(page.getByTestId('story-source')).toHaveText('Source-checked story question');
  const firstPrompt = await page.getByTestId('dialogue-line').innerText();
  await page.getByTestId('story-hint').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('choice-c0').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('Who puts on Tom’s clothes');
  await page.getByTestId('choice-c0').click();
  await expect(page.getByTestId('rating-skip')).toBeVisible();
  await page.getByTestId('rating-skip').click();
  await page.getByTestId('choice-__skip').dblclick();
  await expect(page.getByTestId('celebration')).toBeVisible();
  await dismissCelebrations(page);
  const saved = await records(page);
  expect(saved.books.filter((b) => b.catalogId === 'tom-kitten')).toHaveLength(1);
  expect(saved.evidence.some((e) => e.skillId === 'read.inference' && e.trials.supported === 1)).toBe(true);
  expect(saved.evidence.some((e) => e.skillId === 'read.narration')).toBe(false);
  expect(saved.evidence.filter((e) => e.excerpt?.includes('[story-question:tom-kitten.'))).toHaveLength(2);
  await page.reload();
  await enterSchool(page);
  await talkTo(page, 'hoot');
  await page.getByTestId('choice-finish').click();
  await page.getByTestId('new-book-title').fill('Tom Kitten');
  await page.getByTestId('suggest-tom-kitten').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('Where do the kittens climb');
  expect(await page.getByTestId('dialogue-line').innerText()).not.toBe(firstPrompt);
  if (name === 'phone') await page.getByTestId('story-skip').tap();
  else await page.getByTestId('story-skip').click();
  await expect(page.getByTestId('dialogue-line')).toContainText('before the kittens play');
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByTestId('dialogue-close').click();
  await talkTo(page, 'hoot');
  await expect(page.getByTestId('choice-finish')).toBeVisible();
  await page.screenshot({ path: `test-results/hoot-story-${name}.png` });
  expect((await records(page)).books.filter((b) => b.catalogId === 'tom-kitten')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('custom title keeps narration and parent-authored response ungraded', async ({ page }, testInfo) => {
  const name = testInfo.project.name;
  if (name === 'phone') await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${APP}#/parent/books`);
  await unlockParent(page);
  await page.getByTestId('add-book-toggle').click();
  await page.getByTestId('add-book-title').fill('Synthetic kite story');
  await page.getByTestId('add-book-save').click();
  await page.getByRole('tab', { name: /Up next/ }).click();
  await page.getByRole('link').filter({ hasText: 'Synthetic kite story' }).click();
  await page.getByLabel('Story question', { exact: true }).fill('Who brought the kite?');
  await page.getByLabel('Reference answer', { exact: true }).fill('Avery');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await enterSchool(page);
  await page.getByTestId('discover-action').click();
  await page.getByTestId('choice-finish').click();
  await page.getByRole('listitem').filter({ hasText: 'Synthetic kite story' }).click();
  await expect(page.getByTestId('story-source')).toHaveText('Your own reflections · ungraded');
  await page.getByText('Tell me more (optional)', { exact: true }).click();
  await page.getByTestId('reflection-favorite').fill('The kite');
  await page.getByTestId('reflection-narration').fill('A noodle flew to the moon.');
  await page.getByText('A question from your grown-up (optional)', { exact: true }).click();
  await expect(page.getByTestId('parent-story-prompt')).toHaveText('Who brought the kite?');
  await page.getByTestId('parent-story-response').fill('An unverified answer');
  await page.getByText('See your grown-up’s reference answer', { exact: true }).click();
  await expect(page.getByText('Avery', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/hoot-custom-${name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Not sure', exact: true }).click();
  await page.getByTestId('rating-skip').dblclick();
  await expect(page.getByTestId('celebration')).toBeVisible();
  await dismissCelebrations(page);
  const saved = await records(page);
  const book = saved.books.find((b) => b.title === 'Synthetic kite story')!;
  expect(book.favoritePart).toBe('The kite');
  expect(book.childRating).toBeUndefined();
  const evidence = saved.evidence.filter((e) => e.source.id === book.id);
  expect(evidence).toHaveLength(1);
  expect(evidence[0]!.kind).toBe('observation');
  expect(evidence[0]!.trials).toEqual({ independent: 0, supported: 0, notYet: 0 });
  const conversation = saved.interactions.find((i) => i.context.bookId === book.id && i.context.flow === 'finish-book')!;
  expect(conversation.transcript.some((line) => line.text.includes('Parent-authored prompt:'))).toBe(true);
  expect(conversation.transcript.some((line) => line.text === 'An unverified answer')).toBe(true);
});
