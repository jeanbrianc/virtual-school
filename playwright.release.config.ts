import { defineConfig, devices } from 'playwright/test';
import config from './playwright.config';

/** One combined candidate, with every collected suite eligible on both devices. */
export default defineConfig({
  ...config,
  outputDir: 'test-results/browser',
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    ...config.use,
    serviceWorkers: 'block',
    // Initial source-default fixtures must never enter automatic screenshots or traces.
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 720 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
