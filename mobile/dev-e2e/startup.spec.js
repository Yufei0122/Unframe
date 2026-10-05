import { test, expect } from '@playwright/test';
import { stat, utimes } from 'node:fs/promises';
import path from 'node:path';

test('web development server survives watched configuration changes and reloads', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start visit', exact: true })).toBeVisible({ timeout: 60000 });

  const config = path.resolve(__dirname, '../tsconfig.json');
  const before = await stat(config);
  try {
    // Trigger Metro's real file watcher without changing any source/configuration content.
    await utimes(config, before.atime, new Date(before.mtimeMs + 2000));
    let healthyResponses = 0;
    await expect.poll(async () => {
      const response = await request.get('/status');
      expect(response.ok()).toBe(true);
      expect(await response.text()).toContain('packager-status:running');
      return ++healthyResponses;
    }, { intervals: [500], timeout: 10000 }).toBeGreaterThanOrEqual(5);

    await page.reload();
    await page.getByRole('button', { name: 'Start visit', exact: true }).click();
    await expect(page.getByText('Nearby Artworks', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Explore Water Lilies', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await utimes(config, before.atime, before.mtime);
  }
});
