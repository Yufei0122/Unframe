import { test as base, expect } from '@playwright/test';

// Never drive OSM's public tile service with automated browser tests.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
    await use(page);
  },
});
export { expect };
export function visitResponse(answer, itinerary, error) {
  return { contentType: 'application/x-ndjson', body: [
    { type: 'answer', ...answer },
    error ? { type: 'route_error', error, code: 'NO_ROUTE' } : { type: 'route', itinerary },
  ].map(event => JSON.stringify(event)).join('\n') + '\n' };
}
export async function enterWelcome(page) {
  await page.getByRole('button', { name: /^Choose (The Met|GOMA)$/ }).click({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Start visit', exact: true })).toBeVisible();
}
