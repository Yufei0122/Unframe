import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ viewport: { width: 390, height: 844 }, launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
async function openScan(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
}
const imagePath = path.resolve(__dirname, '../assets/water-lilies.jpg');
test.describe('browser camera capture', () => {
  test('captures a real browser media stream and releases the camera', async ({ page }) => {
    await openScan(page);
    await page.getByRole('button', { name: 'Take photo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeEnabled();
    await page.evaluate(() => { window.captureTracks = document.querySelector('video').srcObject.getTracks(); });
    await page.getByRole('button', { name: 'Capture photo', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Selected artwork photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Identify artwork', exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.captureTracks.every(track => track.readyState === 'ended'))).toBe(true);
  });
});
test('web camera denial is actionable and uploaded image reaches recognition UI', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } } });
  });
  await page.route('**/api/ai/artworks/recognise*', async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    await route.fulfill({ json: { matched: true, similarity: .94, artwork: { id: 'water-lilies', title: 'Water Lilies', artist: 'Claude Monet', year: '1916–19', medium: 'Oil on canvas', description: 'Collection notes', source: 'The Met collection record' }, aiExplanation: { summary: 'A quiet study of reflections.', historicalContext: 'Not available in the supplied notes.', interestingFacts: ['Oil on canvas.'], whyItMatters: 'An interpretation of colour.', suggestedNextArtwork: null }, interpretationLabel: 'AI interpretation based on collection notes; not museum-approved.' } });
  });
  await openScan(page);
  await page.getByRole('button', { name: 'Take photo', exact: true }).click();
  await expect(page.getByText('Camera access was not granted.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Close camera', exact: true }).click();
  await page.getByLabel('Upload artwork image').setInputFiles(imagePath);
  await page.getByRole('button', { name: 'Identify artwork', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI interpretation', exact: true })).toBeVisible();
  await expect(page.getByText('A quiet study of reflections.')).toBeVisible();
  await page.screenshot({ path: 'test-results/ai-recognition.png', fullPage: true });
  await page.getByRole('button', { name: 'Open artwork details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
});
test('camera streams stop when leaving preview even if permission completes late', async ({ page }) => {
  await page.addInitScript(() => {
    window.cameraStops = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(resolve => {
      window.resolveCamera = () => resolve({ getTracks: () => [{ stop: () => window.cameraStops++ }] });
    }) } });
  });
  await openScan(page);
  await page.getByRole('button', { name: 'Take photo', exact: true }).click();
  await expect(page.getByText('Waiting for camera permission…')).toBeVisible();
  await page.getByRole('button', { name: 'Close camera', exact: true }).click();
  await page.evaluate(() => window.resolveCamera());
  await expect.poll(() => page.evaluate(() => window.cameraStops)).toBe(1);
});
test('no-match and server failures let visitors retry or browse', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill(++attempt === 1 ? { json: { matched: false, message: 'No artwork could be identified with sufficient confidence.' } } : { status: 503, json: { error: 'Google AI is temporarily unavailable.' } }));
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(imagePath);
  await page.getByRole('button', { name: 'Identify artwork', exact: true }).click();
  await expect(page.getByText('No artwork could be identified with sufficient confidence.')).toBeVisible();
  await page.getByRole('button', { name: 'Identify artwork', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Google AI is temporarily unavailable.');
  await expect(page.getByRole('button', { name: 'Identify artwork', exact: true })).toBeEnabled();
});
test('route opens a separate itinerary page and preserves preferences when returning', async ({ page }) => {
  await page.route('**/api/ai/routes/plan', async route => {
    const request = route.request().postDataJSON();
    expect(request.mustSeeArtworkIds).toContain('water-lilies');
    expect(request.accessibilityRequirements).toEqual(['step_free']);
    expect(request.interests).toContain('Monet');
    await route.fulfill({ json: { demo: true, mapNotice: 'Illustrative demo map.', estimatedMinutes: 6, estimatedWalkingDistance: 72, route: [{ order: 1, artworkId: 'water-lilies', title: 'Water Lilies', galleryId: 'european-paintings', estimatedVisitMinutes: 4 }], navigation: [{ from: 'entrance', to: 'water-lilies', nodes: ['entrance', 'great-hall', 'european-paintings', 'water-lilies'], distance: 72, estimatedSeconds: 110 }], reasoningSummary: 'A local nature route.', recommendationSource: 'local', warning: 'AI recommendations are unavailable. This itinerary uses local rules.' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Plan a Met visit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Additional interest' }).fill('Monet');
  await page.getByRole('button', { name: 'Must see: Water Lilies', exact: true }).click();
  await page.getByRole('switch', { name: 'Step-free route', exact: true }).check();
  await page.getByRole('button', { name: 'Generate route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate route', exact: true })).not.toBeVisible();
  await expect(page.getByText('6 minutes · 72 m walking (demo)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit visit preferences', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Additional interest' })).toHaveValue('Monet');
  await expect(page.getByRole('switch', { name: 'Step-free route', exact: true })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Generate route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toBeVisible();
  await expect(page.getByText('AI recommendations are unavailable. This itinerary uses local rules.')).toBeVisible();
  await page.getByRole('button', { name: 'Visit Water Lilies', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/ai-route.png', fullPage: true });
  await page.getByRole('button', { name: 'Visit Water Lilies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
});
