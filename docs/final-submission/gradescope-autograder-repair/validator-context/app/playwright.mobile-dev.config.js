import { defineConfig } from '@playwright/test';
import previewConfig from './playwright.mobile.config.js';

// Exercise the actual development server and file watcher, not an exported bundle.
export default defineConfig({
  ...previewConfig,
  testDir: './mobile',
  testMatch: ['e2e/**/*.spec.js', 'dev-e2e/**/*.spec.js'],
  timeout: 90000,
  use: { ...previewConfig.use, baseURL: 'http://127.0.0.1:8091' },
  webServer: {
    command: 'npm run mobile:web -- --port 8091 --offline',
    url: 'http://127.0.0.1:8091',
    timeout: 120000,
    reuseExistingServer: false,
    env: { BROWSER: 'none', EXPO_NO_TELEMETRY: '1' },
  },
});
