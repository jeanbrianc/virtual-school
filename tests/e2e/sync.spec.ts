/**
 * Family sync between two devices. The family's helper (/api) runs right here
 * in the test with an in-memory store: the "Mac" turns family sync on, the
 * "iPad" opens for the first time and shows the Mac's school, and a book added
 * on the iPad reaches the Mac.
 */
import { expect, test, type BrowserContext, type Page } from 'playwright/test';
import { createHelper } from '../../scripts/ai-helper/handler';
import { MemorySyncStore } from '../../scripts/ai-helper/sync';
import { APP, unlockParent } from './helpers';

test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });

const store = new MemorySyncStore();
const helper = createHelper({ syncStore: store });

/** A browser that talks to the in-test helper at /api. */
async function familyDevice(context: BrowserContext): Promise<Page> {
  await context.addInitScript(() => {
    (window as unknown as { __izzySyncEndpoint: string }).__izzySyncEndpoint = '/api';
  });
  await context.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const res = await helper({
      method: req.method(),
      path: url.pathname.replace(/^\/api/, ''),
      headers: Object.fromEntries(Object.entries(await req.allHeaders()).map(([k, v]) => [k.toLowerCase(), v])),
      ...(req.postData() !== null ? { body: req.postData()! } : {}),
    });
    await route.fulfill({ status: res.status, headers: res.headers, body: typeof res.body === 'string' ? res.body : Buffer.from(res.body) });
  });
  return context.newPage();
}

test('a second device opens the same school', async ({ browser }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];

  // ── The Mac: has the history (sample data here) and turns family sync on ──
  const macContext = await browser.newContext();
  const mac = await familyDevice(macContext);
  mac.on('pageerror', (e) => errors.push(`mac: ${e.message}`));
  await mac.goto(`${APP}#/parent/settings`);
  await unlockParent(mac);
  await mac.getByTestId('load-sample').click();
  await mac.getByTestId('confirm-reset').click();
  await expect(mac.getByText('Sample data loaded')).toBeVisible();
  const card = mac.getByTestId('sync-card');
  await expect(card).toContainText('Off.');
  await mac.getByTestId('sync-on').click();
  await expect(mac.getByTestId('sync-status')).toContainText('On.', { timeout: 60_000 });
  await expect(mac.getByTestId('sync-status')).toContainText('Last synced just now', { timeout: 60_000 });
  expect(store.records.size).toBeGreaterThan(50);

  // ── The iPad: first visit, nothing of its own — it takes the family's school ──
  const ipadContext = await browser.newContext();
  const ipad = await familyDevice(ipadContext);
  ipad.on('pageerror', (e) => errors.push(`ipad: ${e.message}`));
  await ipad.goto(`${APP}#/parent/books`, { timeout: 60_000 });
  await unlockParent(ipad);
  await expect(ipad.getByText(/Charlotte/).first()).toBeVisible({ timeout: 60_000 });
  await ipad.goto(`${APP}#/parent/settings`);
  await expect(ipad.getByTestId('sync-status')).toContainText('On.');

  // A book added on the iPad reaches the Mac.
  await ipad.goto(`${APP}#/parent/books`);
  await ipad.getByTestId('add-book-toggle').click();
  await ipad.getByTestId('add-book-title').fill('The Snowy Day at Grandma’s');
  await ipad.getByTestId('add-book-save').click();
  await ipad.getByRole('tab', { name: /^All/ }).click();
  await expect(ipad.getByText('The Snowy Day at Grandma’s').first()).toBeVisible();
  await expect.poll(() => [...store.records.values()].some((r) => r.data?.title === 'The Snowy Day at Grandma’s'), { timeout: 30_000 }).toBe(true);

  await mac.goto(`${APP}#/parent/settings`);
  await mac.getByTestId('sync-now').click();
  await mac.goto(`${APP}#/parent/books`);
  await mac.getByRole('tab', { name: /^All/ }).click();
  await expect(mac.getByText('The Snowy Day at Grandma’s').first()).toBeVisible({ timeout: 30_000 });

  expect(errors).toEqual([]);
  await macContext.close();
  await ipadContext.close();
});
