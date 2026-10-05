import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './mobile/e2e',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8082', ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/serve-mobile-preview.mjs', url: 'http://127.0.0.1:8082', reuseExistingServer: false },
});
