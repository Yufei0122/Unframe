import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Show Brisbane' }).click();
  await page.getByRole('button', { name: 'Preview QUT Art Museum on map' }).click();
  await page.getByRole('button', { name: 'Choose QUT Art Museum', exact: true }).click();
});

test('QUT demo supports artwork filtering, saved pieces and a complete slow-looking tour', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'QUT Art Museum' })).toBeVisible();
  await expect(page.getByText('DEMO EXHIBITION', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/qut-discover.png' });
  await page.getByRole('button', { name: 'Filter Form', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore Soft architecture', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore River rhythm', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore Soft architecture', exact: true }).click();
  await expect(page.getByText('A moment to notice', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save Soft architecture', exact: true }).last().click();
  await page.getByRole('button', { name: 'Close artwork preview' }).click();
  await page.getByRole('tab', { name: 'Saved, 1 artworks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore Soft architecture', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unsave Soft architecture', exact: true }).click();
  await expect(page.getByText('Keep a little inspiration', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discover demo artworks', exact: true }).click();
  await page.getByRole('button', { name: 'Start slow-looking demo tour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'River rhythm', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next demo artwork', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Soft architecture', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next demo artwork', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Between places', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish demo tour', exact: true }).click();
  await expect(page.getByText('You’ve completed the sample slow-looking tour.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to QUT museum', exact: true }).click();
  await page.getByRole('tab', { name: 'Visit', exact: true }).click();
  await expect(page.getByText('2 George Street, Brisbane QLD 4000', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open QUT Art Museum official website', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/qut-visit.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to museum selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose QUT Art Museum', exact: true })).toBeVisible();
  // The independent QUT UI demo must not change the selected GOMA catalogue.
  await page.getByRole('button', { name: 'Preview GOMA on map', exact: true }).click();
  await page.getByRole('button', { name: 'Choose GOMA', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByText('GOMA · DEMO LAYOUT')).toBeVisible();
  expect(errors).toEqual([]);
});

test('QUT fits small and desktop viewports and bundles every demo image', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.getByTestId('qut-content').locator('img').evaluateAll(images => images.length >= 4 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const frame = await page.getByTestId('mobile-viewport').boundingBox();
    expect(frame.width).toBeLessThanOrEqual(406);
    await page.screenshot({ path: `test-results/qut-${viewport.width}.png` });
  }
});
