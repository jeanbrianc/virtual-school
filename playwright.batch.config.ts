import { defineConfig, devices } from 'playwright/test';
import config from './playwright.config';

/** Validation-only: every explicit matrix suite really runs on both device projects. */
export default defineConfig({
  ...config,
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 720 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
