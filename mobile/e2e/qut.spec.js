import { test, expect } from './fixtures';
import collection from '../../shared/qut-collection.json';
import path from 'node:path';

// Fixed API fixture for UI assertions. Real-model checks run separately.
const itinerary = {
  demo: true, mapNotice: 'Simulated QUT gallery map.', estimatedMinutes: 12, estimatedWalkingDistance: 62,
  route: collection.map((art, index) => ({ order: index + 1, artworkId: art.id, title: art.title, galleryId: ['colour-gallery', 'form-gallery', 'nature-gallery'][index], estimatedVisitMinutes: art.minutes })),
  navigation: collection.map((art, index) => ({ from: index ? collection[index - 1].id : 'entrance', to: art.id, nodes: [index ? collection[index - 1].id : 'entrance', 'qut-foyer', art.id], distance: [12, 16, 34][index], estimatedSeconds: [18, 24, 51][index] })),
  recommendationSource: 'ollama', reasoningSummary: 'A quiet walk through colour, form and nature.',
};

async function enterQut(page) {
  await page.getByRole('button', { name: 'Show Brisbane' }).click();
  await page.getByRole('button', { name: 'Preview QUT Art Museum on map' }).click();
  await page.getByRole('button', { name: 'Choose QUT Art Museum', exact: true }).click();
  await expect(page.getByText('QUT ART MUSEUM · PERSONAL MUSEUM GUIDE')).toBeVisible();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } }));
  await page.goto('/');
  await enterQut(page);
});

test('QUT uses the common museum map, artwork details and persistent profile collection', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const name of ['Home', 'Plan', 'Scan', 'Profile']) await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByText('QUT ART MUSEUM · FLOOR PLAN').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Visit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Nature Gallery' }).click();
  await expect(page.getByRole('button', { name: 'Explore Between places', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore River rhythm', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset map position' }).click();
  await page.getByRole('button', { name: 'View all nearby artworks' }).click();
  for (const art of collection) await expect(page.getByRole('button', { name: `Explore ${art.title}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Water Lilies', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore Soft architecture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Soft architecture', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
  await page.getByRole('button', { name: 'Back to museum' }).click();
  await page.getByRole('link', { name: /back/i }).click();
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: '1 Saved Artworks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore Soft architecture', exact: true })).toBeVisible();
  await page.reload();
  await enterQut(page);
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: '1 Saved Artworks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore Soft architecture', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('QUT planning automatically shows its route and saves it in the shared profile', async ({ page }) => {
  const preferences = { interests: ['Colour'], availableMinutes: 20, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: ['step_free'], mustSeeArtworkIds: [] };
  await page.route('**/api/ai/routes/chat', route => {
    expect(route.request().postDataJSON().museumId).toBe('qut');
    return route.fulfill({ json: { reply: 'A quiet walk through colour, form and nature.', preferences } });
  });
  await page.route('**/api/ai/routes/plan', route => {
    expect(route.request().postDataJSON()).toMatchObject({ museumId: 'qut', ...preferences });
    return route.fulfill({ json: itinerary });
  });
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByTestId('planning-museum')).toContainText('QUT Art Museum');
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect(page.getByTestId('planning-answer-card')).toContainText('QUT ART MUSEUM · FLOOR PLAN');
  await page.getByRole('button', { name: 'View full itinerary' }).click();
  await expect(page.getByText('QUT ART MUSEUM · FLOOR PLAN').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save route', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit visit preferences', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save route', exact: true }).click();
  await page.getByRole('button', { name: 'Back to planner' }).click();
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: 'View saved routes' }).click();
  await page.getByRole('button', { name: 'Filter: QUT Art Museum', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open route: QUT Art Museum · Your art trail', exact: true })).toBeVisible();
});

test('QUT Scan submits the selected museum and opens shared artwork details', async ({ page }) => {
  let uploaded = false, requests = 0;
  const artwork = collection[0];
  await page.route('**/api/ai/artworks/recognise*', route => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get('museumId')).toBe('qut');
    return route.fulfill({ json: uploaded ? { matched: true, requiresConfirmation: true, candidates: [{ artwork, similarity: .99 }] } : { matched: false, candidates: [] } });
  });
  await page.route('**/api/ai/artworks/confirm', route => {
    expect(route.request().postDataJSON()).toMatchObject({ museumId: 'qut', artworkId: artwork.id });
    return route.fulfill({ json: { artwork, aiExplanation: { summary: artwork.description, historicalContext: artwork.source, interestingFacts: [], whyItMatters: 'Follow the blue curves.', suggestedNextArtwork: null }, interpretationLabel: 'AI interpretation based on supplied notes.' } });
  });
  await page.getByRole('tab', { name: /Scan/ }).click();
  await expect(page.getByText('QUT Art Museum', { exact: true }).last()).toBeVisible();
  uploaded = true;
  await page.locator('input[type=file]').setInputFiles(path.resolve('mobile/assets/qut-river-rhythm.png'));
  await page.getByRole('button', { name: 'Select River rhythm', exact: true }).click();
  await page.getByRole('button', { name: 'Open artwork details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'River rhythm', exact: true })).toBeVisible();
  await expect(page.getByText('Unframe studio', { exact: true }).filter({ visible: true })).toBeVisible();
  expect(requests).toBeGreaterThan(0);
});

test('QUT fits small and desktop layouts and switching museums replaces the catalogue', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.getByTestId('mobile-viewport').locator('img').evaluateAll(images => images.length >= 3 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const frame = await page.getByTestId('mobile-viewport').boundingBox();
    expect(frame.width).toBeLessThanOrEqual(406);
    await page.screenshot({ path: `test-results/qut-shared-${viewport.width}.png` });
  }
  await page.getByRole('button', { name: 'Choose museum', exact: true }).click();
  await expect(page.getByTestId('preview-title').filter({ visible: true })).toContainText('QUT');
  await page.getByRole('button', { name: 'Preview GOMA on map' }).click();
  await page.getByRole('button', { name: 'Choose GOMA', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByText('GOMA · FLOOR PLAN')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore River rhythm', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByTestId('planning-museum')).toContainText('GOMA');
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('button', { name: 'Choose museum', exact: true }).click();
  await page.getByRole('button', { name: 'Show New York' }).click();
  await page.getByRole('button', { name: 'Choose The Met', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Floor 1', exact: true })).toBeVisible();
});
