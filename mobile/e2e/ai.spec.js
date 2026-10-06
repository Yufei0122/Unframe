import { test, expect, enterWelcome } from '../e2e/fixtures';
import path from 'node:path';

test.use({ viewport: { width: 390, height: 844 }, launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
async function openScan(page) {
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
}
const imagePath = path.resolve(__dirname, '../assets/water-lilies.jpg');

test('Scan tab opens the camera, releases it on blur, and keeps the only map on Home', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { requests++; return route.fulfill({ json: { matched: false } }); });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Map', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Floor 1', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Scan/ }).click();
  await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Upload photo', exact: true })).toBeInViewport();
  await expect(page.getByText('Browse the demo collection')).toHaveCount(0);
  expect(requests).toBe(0);
  await page.evaluate(() => { window.tabTracks = document.querySelector('video').srcObject.getTracks(); });
  await page.screenshot({ path: 'test-results/scan-small-screen.png' });
  await page.getByRole('tab', { name: /Profile/ }).click();
  await expect.poll(() => page.evaluate(() => window.tabTracks.every(t => t.readyState === 'ended'))).toBe(true);
  await page.getByRole('tab', { name: /Scan/ }).click();
  await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close scan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Floor 1', exact: true })).toBeVisible();
});

test('retaking a photo cancels pending recognition and ignores its late result', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/artworks/recognise*', route => { pending = route; });
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(imagePath);
  await expect(page.getByText('Identifying artwork…')).toBeVisible();
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole('button', { name: 'Retake photo', exact: true }).click();
  await pending.fulfill({ json: { matched: false, message: 'Outdated recognition result' } }).catch(() => {});
  await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeEnabled();
  await expect(page.getByText('Outdated recognition result')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Selected artwork photo' })).toHaveCount(0);
});

test('invalid uploads do not send an AI request or block the camera', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { requests++; return route.fulfill({ json: { matched: false } }); });
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG, PNG or WebP image.');
  await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeEnabled();
  expect(requests).toBe(0);
});
test.describe('browser camera capture', () => {
  test('captures a real browser media stream and releases the camera', async ({ page }) => {
    await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, message: 'Try another photo.' } }));
    await openScan(page);
    await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeEnabled();
    await page.screenshot({ path: 'test-results/scan-camera.png' });
    await page.evaluate(() => { window.captureTracks = document.querySelector('video').srcObject.getTracks(); });
    await page.getByRole('button', { name: 'Capture photo', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Selected artwork photo' })).toBeVisible();
    await expect(page.getByText('Try another photo.')).toBeVisible();
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
  await expect(page.getByText('Camera access was not granted.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload photo', exact: true })).toBeVisible();
  await page.getByLabel('Upload artwork image').setInputFiles(imagePath);
  await page.getByRole('button', { name: 'Read AI interpretation', exact: true }).click();
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
  await expect(page.getByText('Waiting for camera permission…')).toBeVisible();
  await page.getByRole('button', { name: 'Close scan', exact: true }).click();
  await page.evaluate(() => window.resolveCamera());
  await expect.poll(() => page.evaluate(() => window.cameraStops)).toBe(1);
});
test('no-match and server failures let visitors retry or browse', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill(++attempt === 1 ? { json: { matched: false, message: 'No artwork could be identified with sufficient confidence.' } } : { status: 503, json: { error: 'Google AI is temporarily unavailable.' } }));
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(imagePath);
  await expect(page.getByText('No artwork could be identified with sufficient confidence.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Google AI is temporarily unavailable.');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
});
test('route opens a separate itinerary page and preserves preferences when returning', async ({ page }) => {
  let chatTurns = 0;
  await page.route('**/api/ai/routes/chat', route => {
    const input = route.request().postDataJSON();
    expect(input.museumId).toBe('met');
    if (++chatTurns === 2) {
      expect(input.history.some(message => message.content.includes('Monet'))).toBe(true);
      expect(input.preferences.interests).toContain('Monet');
    }
    return route.fulfill({ json: { reply: chatTurns === 1 ? 'Monet and Water Lilies are included.' : 'Your visit is now step-free, with less walking.', preferences: { ...input.preferences, interests: ['Monet'], mustSeeArtworkIds: ['water-lilies'], ...(chatTurns === 2 ? { accessibilityRequirements: ['step_free'], walkingPreference: 'less_walking' } : {}) } } });
  });
  await page.route('**/api/ai/routes/plan', async route => {
    const request = route.request().postDataJSON();
    expect(request.mustSeeArtworkIds).toContain('water-lilies');
    expect(request.accessibilityRequirements).toEqual(['step_free']);
    expect(request.interests).toContain('Monet');
    expect(request.walkingPreference).toBe('less_walking');
    await route.fulfill({ json: { demo: true, mapNotice: 'Illustrative demo map.', estimatedMinutes: 6, estimatedWalkingDistance: 72, route: [{ order: 1, artworkId: 'water-lilies', title: 'Water Lilies', galleryId: 'european-paintings', estimatedVisitMinutes: 4 }], navigation: [{ from: 'entrance', to: 'water-lilies', nodes: ['entrance', 'great-hall', 'european-paintings', 'water-lilies'], distance: 72, estimatedSeconds: 110 }], reasoningSummary: 'A local nature route.', recommendationSource: 'local', warning: 'AI recommendations are unavailable. This itinerary uses local rules.' } });
  });
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await page.getByRole('textbox', { name: 'Message your visit planner' }).fill('I love Monet. Include Water Lilies.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Monet and Water Lilies are included.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message your visit planner' }).fill('Make it step-free with less walking.');
  await page.getByRole('textbox', { name: 'Message your visit planner' }).press('Enter');
  await expect(page.getByTestId('visit-preferences')).toContainText('Step-free');
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByText('Your visit is now step-free, with less walking.', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/plan-chat.png' });
  await page.getByRole('button', { name: 'Generate route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate route', exact: true })).not.toBeVisible();
  await expect(page.getByText('6 minutes · 72 m walking (demo)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit visit preferences', exact: true }).click();
  await expect(page.getByTestId('visit-preferences')).toContainText('Monet');
  await expect(page.getByTestId('visit-preferences')).toContainText('Step-free');
  await expect(page.getByText('I love Monet. Include Water Lilies.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Generate route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toBeVisible();
  await expect(page.getByText('AI recommendations are unavailable. This itinerary uses local rules.')).toBeVisible();
  await page.getByRole('button', { name: 'Visit Water Lilies', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/ai-route.png', fullPage: true });
  await page.getByRole('button', { name: 'Visit Water Lilies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
});
