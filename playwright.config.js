import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3011', trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: 'chrome' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1050 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
  ],
  webServer: { command: 'node server/index.js', url: 'http://127.0.0.1:3011', reuseExistingServer: false, env: { PORT: '3011', UNFRAME_DATA_DIR: '.test-data' } }
});
