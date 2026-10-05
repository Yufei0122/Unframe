import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ viewport: { width: 390, height: 844 } });
async function chooseGoma(page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Museum and location information' }).click();
  await page.getByRole('button', { name: 'Choose GOMA', exact: true }).click();
  await page.getByRole('button', { name: 'Explore GOMA', exact: true }).click();
}

test('GOMA selection, rooms, artwork details and switch back to Met', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await chooseGoma(page);
  await expect(page.getByText('GOMA · DEMO LAYOUT')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Water Lilies' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Nature Gallery' }).click();
  await expect(page.getByRole('button', { name: 'Explore Heritage', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore In bed', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset demo map position' }).click();
  await page.getByRole('button', { name: 'View all artworks' }).click();
  for (const title of ['The obliteration room', 'In bed', 'Heritage', 'Soul under the moon']) {
    await page.getByRole('button', { name: `Explore ${title}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: title, exact: true }).filter({ visible: true })).toBeVisible();
    await expect.poll(() => page.getByRole('img', { name: title, exact: true }).filter({ visible: true }).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: 'Audio language: English. Switch to Chinese' }).click();
    await expect(page.getByRole('heading', { name: '关于作品' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View artwork source at QAGOMA' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Back to museum' }).click();
  }
  await page.screenshot({ path: 'test-results/goma-museum.png', fullPage: true });
  await page.getByRole('button', { name: 'Choose museum', exact: true }).click();
  await page.getByRole('button', { name: 'Choose The Met', exact: true }).click();
  await page.getByRole('button', { name: 'Explore The Met', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore Water Lilies', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Heritage', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('GOMA route opens its own itinerary with a GOMA map and artwork', async ({ page }) => {
  await page.route('**/api/ai/routes/plan', async route => {
    const body = route.request().postDataJSON();
    expect(body.museumId).toBe('goma');
    expect(body.mustSeeArtworkIds).toEqual(['goma-heritage']);
    await route.fulfill({ json: { demo: true, mapNotice: 'GOMA illustrative layout.', estimatedMinutes: 7, estimatedWalkingDistance: 47, route: [{ order: 1, artworkId: 'goma-heritage', title: 'Heritage', galleryId: 'nature-gallery', estimatedVisitMinutes: 6 }], navigation: [{ from: 'entrance', to: 'goma-heritage', nodes: ['entrance', 'goma-foyer', 'goma-heritage'], distance: 47, estimatedSeconds: 70 }], reasoningSummary: 'A nature visit.', recommendationSource: 'local' } });
  });
  await chooseGoma(page);
  await page.getByRole('button', { name: 'Plan a GOMA visit' }).click();
  await expect(page.getByRole('button', { name: 'Must see: Water Lilies' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Must see: Heritage', exact: true }).click();
  await page.getByRole('button', { name: 'Generate route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate route', exact: true })).not.toBeVisible();
  await expect(page.getByText('GOMA · DEMO LAYOUT').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Entrance → Demo foyer → Heritage')).toBeVisible();
  await page.screenshot({ path: 'test-results/goma-itinerary.png', fullPage: true });
  await page.getByRole('button', { name: 'Visit Heritage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Heritage', exact: true })).toBeVisible();
});

test('GOMA scan scopes image matching to the selected collection', async ({ page }) => {
  await page.route('**/api/ai/artworks/recognise*', async route => {
    expect(new URL(route.request().url()).searchParams.get('museumId')).toBe('goma');
    await route.fulfill({ json: { matched: true, similarity: .96, artwork: { id: 'goma-heritage', title: 'Heritage', artist: 'Cai Guo-Qiang', year: '2013', medium: 'Animal replicas', description: 'Collection notes', source: 'QAGOMA' }, aiExplanation: null } });
  });
  await chooseGoma(page);
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
  await expect(page.getByText('Photograph an artwork or upload an image to search the 4-work GOMA demo collection.')).toBeVisible();
  await page.getByLabel('Upload artwork image').setInputFiles(path.resolve(__dirname, '../assets/goma-heritage.jpg'));
  await page.getByRole('button', { name: 'Identify artwork', exact: true }).click();
  await expect(page.getByText('Nature Gallery · demo location')).toBeVisible();
  await page.getByRole('button', { name: 'Open artwork details' }).click();
  await expect(page.getByRole('heading', { name: 'Heritage', exact: true })).toBeVisible();
});

test('precise Brisbane device location selects GOMA automatically', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: ok => ok({ coords: { latitude: -27.4709, longitude: 153.0172, accuracy: 20 } }) } }));
  await page.goto('/');
  await expect(page.getByText('Near your location', { exact: true })).toBeVisible();
  await expect(page.getByText('GOMA', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/goma-welcome.png' });
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByText('GOMA · DEMO LAYOUT')).toBeVisible();
});
