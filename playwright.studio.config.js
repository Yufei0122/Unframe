import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './mobile/studio-e2e',
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: 'list',
  outputDir: 'test-results/studio',
  use: {
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    baseURL: 'http://127.0.0.1:8091',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    ...(process.env.UNFRAME_BROWSER_WS_ENDPOINT ? { connectOptions: { wsEndpoint: process.env.UNFRAME_BROWSER_WS_ENDPOINT } } : {}),
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run mobile:web -- --port 8091 --offline --max-workers 2',
    url: 'http://127.0.0.1:8091/status',
    timeout: 120000,
    reuseExistingServer: false,
    env: { BROWSER: 'none', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3013' },
  },
});
