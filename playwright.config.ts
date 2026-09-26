import { defineConfig, devices } from 'playwright/test';

/**
 * End-to-end tests run against the e2e build (automation hooks enabled) served
 * by the static preview server. Each test gets a fresh browser context, so a
 * fresh IndexedDB that is seeded with the labeled demo data.
 *
 * Headless Chromium renders WebGL in software (SwiftShader), which is slow, so
 * the app is opened with ?maxfps=3 and reduced motion. Real GPUs are unaffected.
 */
const PORT = Number(process.env.E2E_PORT ?? 4180);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 720 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /parent\.spec\.ts/ },
  ],
  webServer: {
    command: 'node scripts/preview.mjs --e2e',
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
