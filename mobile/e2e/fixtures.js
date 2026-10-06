import { test as base, expect } from '@playwright/test';

// Never drive OSM's public tile service with automated browser tests.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
    await use(page);
  },
});
export { expect };
export async function enterWelcome(page) {
  await page.getByRole('button', { name: /^Choose (The Met|GOMA)$/ }).click({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Start visit', exact: true })).toBeVisible();
}
