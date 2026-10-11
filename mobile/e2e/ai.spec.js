import { test, expect, enterWelcome } from '../e2e/fixtures';
import path from 'node:path';

test.use({ viewport: { width: 390, height: 844 }, launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
async function openScan(page) {
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
}
const imagePath = path.resolve(__dirname, '../assets/water-lilies.jpg');
const artwork = { id: 'water-lilies', title: 'Water Lilies', artist: 'Claude Monet', year: '1916–19', medium: 'Oil on canvas', description: 'Collection notes', source: 'The Met collection record' };
const otherArtwork = { ...artwork, id: 'the-harvesters', title: 'The Harvesters', artist: 'Pieter Bruegel the Elder' };
const candidates = { matched: true, requiresConfirmation: true, candidates: [{ artwork, similarity: .94 }, { artwork: otherArtwork, similarity: .87 }] };
const confirmed = { artwork, aiExplanation: { summary: 'A quiet study of reflections.', historicalContext: 'Not available in the supplied notes.', interestingFacts: ['Oil on canvas.'], whyItMatters: 'An interpretation of colour.', suggestedNextArtwork: null }, interpretationLabel: 'AI interpretation based on collection notes; not museum-approved.' };

async function rememberCamera(page) {
  await expect.poll(() => page.evaluate(() => !!document.querySelector('video')?.srcObject)).toBe(true);
  await page.evaluate(() => { window.scanTracks = document.querySelector('video').srcObject.getTracks(); });
}
async function expectCameraStopped(page) {
  await expect.poll(() => page.evaluate(() => window.scanTracks.every(track => track.readyState === 'ended'))).toBe(true);
}

test('Scan starts automatically without a shutter, releases the camera on blur, and keeps the map on Home', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { requests++; return route.fulfill({ json: { matched: false, candidates: [] } }); });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Map', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Floor 1', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Scan/ }).click();
  await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause scanning', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Upload photo', exact: true })).toBeInViewport();
  await expect(page.getByText('Sampled frames go to OpenCLIP on your local AI server.', { exact: false })).toBeVisible();
  await expect(page.getByText('Browse the demo collection')).toHaveCount(0);
  await expect.poll(() => requests).toBeGreaterThan(0);
  await rememberCamera(page);
  await page.screenshot({ path: 'test-results/scan-small-screen.png' });
  await page.getByRole('tab', { name: /Profile/ }).click();
  await expectCameraStopped(page);
  const stoppedRequests = requests;
  await page.waitForTimeout(3500);
  expect(requests).toBe(stoppedRequests);
  await page.getByRole('tab', { name: /Scan/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(stoppedRequests);
  await rememberCamera(page);
  await page.getByRole('button', { name: 'Close scan', exact: true }).click();
  await expectCameraStopped(page);
  await expect(page.getByRole('button', { name: 'Floor 1', exact: true })).toBeVisible();
});

test('live recognition submits one frame at a time and requires choosing a candidate before confirmation', async ({ page }) => {
  let pending, requests = 0, confirmations = 0;
  await page.route('**/api/ai/artworks/recognise*', route => {
    requests++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    expect(new URL(route.request().url()).searchParams.get('museumId')).toBe('met');
    pending = route;
  });
  await page.route('**/api/ai/artworks/confirm', route => {
    confirmations++;
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({ museumId: 'met', artworkId: 'the-harvesters' });
    expect(Array.isArray(input.visitorPreferences)).toBe(true);
    return route.fulfill({ json: { ...confirmed, artwork: otherArtwork } });
  });
  await openScan(page);
  await expect.poll(() => !!pending).toBe(true);
  // Longer than the normal three-second interval: no second request while this one is pending.
  await page.waitForTimeout(3500);
  expect(requests).toBe(1);
  await pending.fulfill({ json: candidates });
  await expect(page.getByRole('button', { name: 'Select Water Lilies', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select The Harvesters', exact: true })).toBeVisible();
  expect(confirmations).toBe(0);
  await expect(page.getByRole('button', { name: 'Open artwork details', exact: true })).toHaveCount(0);
  await expect(page.getByText('A quiet study of reflections.')).toHaveCount(0);
  await rememberCamera(page);
  await page.screenshot({ path: 'test-results/scan-candidates.png' });
  await page.getByRole('button', { name: 'Select The Harvesters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open artwork details', exact: true })).toBeVisible();
  await expectCameraStopped(page);
  expect(confirmations).toBe(1);
  const selectedRequests = requests;
  await page.waitForTimeout(3500);
  expect(requests).toBe(selectedRequests);
  await page.getByRole('button', { name: 'Open artwork details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Harvesters', exact: true })).toBeVisible();
});

test('resuming during confirmation discards its late interpretation and keeps the new scan', async ({ page }) => {
  let pending, requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: ++requests === 1 ? candidates : { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/confirm', route => { pending = route; });
  await openScan(page);
  await page.getByRole('button', { name: 'Select Water Lilies', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await expect(page.getByText('Preparing AI interpretation…')).toBeVisible();
  await page.getByRole('button', { name: 'Resume scanning', exact: true }).click();
  await pending.fulfill({ json: confirmed }).catch(() => {});
  await expect.poll(() => requests).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Pause scanning', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open artwork details', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Read AI interpretation', exact: true })).toHaveCount(0);
  await expect(page.getByText('A quiet study of reflections.')).toHaveCount(0);
});

test('camera disconnection cancels its pending frame and never scans a frozen preview', async ({ page }) => {
  let pending, requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { requests++; pending = route; });
  await openScan(page);
  await expect.poll(() => !!pending).toBe(true);
  await rememberCamera(page);
  await page.evaluate(() => window.scanTracks[0].dispatchEvent(new Event('ended')));
  await expect(page.getByRole('alert')).toContainText('The camera stopped.');
  await expectCameraStopped(page);
  await pending.fulfill({ json: candidates }).catch(() => {});
  await page.waitForTimeout(3500);
  expect(requests).toBe(1);
  await expect(page.getByRole('button', { name: 'Select Water Lilies', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry camera', exact: true })).toBeVisible();
});

test('pausing aborts an outstanding frame, discards late candidates and can restart scanning', async ({ page }) => {
  let pending, requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => {
    requests++;
    if (requests === 1) pending = route;
    else return route.fulfill({ json: { matched: false, candidates: [] } });
  });
  await openScan(page);
  await expect.poll(() => !!pending).toBe(true);
  await rememberCamera(page);
  await page.getByRole('button', { name: 'Pause scanning', exact: true }).click();
  await expectCameraStopped(page);
  await pending.fulfill({ json: candidates }).catch(() => {});
  await expect(page.getByRole('button', { name: 'Select Water Lilies', exact: true })).toHaveCount(0);
  await page.waitForTimeout(3500);
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Resume scanning', exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(1);
});

test('hiding Scan releases the camera and ignores the old frame when the page becomes visible', async ({ page }) => {
  let pending, requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => {
    if (++requests === 1) pending = route;
    else return route.fulfill({ json: { matched: false, candidates: [] } });
  });
  await openScan(page);
  await expect.poll(() => !!pending).toBe(true);
  await rememberCamera(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectCameraStopped(page);
  await pending.fulfill({ json: candidates }).catch(() => {});
  await page.waitForTimeout(3500);
  expect(requests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => requests).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Select Water Lilies', exact: true })).toHaveCount(0);
});

test('camera denial still permits upload and selection before loading the AI interpretation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } } });
  });
  await page.route('**/api/ai/artworks/recognise*', async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    await route.fulfill({ json: candidates });
  });
  let confirmations = 0;
  await page.route('**/api/ai/artworks/confirm', route => { confirmations++; return route.fulfill({ json: confirmed }); });
  await openScan(page);
  await expect(page.getByText('Camera access was not granted.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload photo', exact: true })).toBeVisible();
  await page.getByLabel('Upload artwork image').setInputFiles(imagePath);
  await expect(page.getByRole('button', { name: 'Select Water Lilies', exact: true })).toBeVisible();
  expect(confirmations).toBe(0);
  await page.getByRole('button', { name: 'Select Water Lilies', exact: true }).click();
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

test('no-match continues scanning; provider failure pauses requests until the visitor retries', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/ai/artworks/recognise*', route => {
    attempt++;
    return route.fulfill(attempt === 2 ? { status: 503, json: { error: 'Local OpenCLIP is temporarily unavailable.' } } : { json: { matched: false, candidates: [], message: 'No artwork passed the matching threshold.' } });
  });
  await openScan(page);
  await expect(page.getByText('No artwork passed the matching threshold.')).toBeVisible();
  await rememberCamera(page);
  await expect(page.getByRole('alert')).toContainText('Local OpenCLIP is temporarily unavailable.');
  await expectCameraStopped(page);
  await page.waitForTimeout(3500);
  expect(attempt).toBe(2);
  await page.getByRole('button', { name: 'Resume scanning', exact: true }).click();
  await expect.poll(() => attempt).toBeGreaterThan(2);
});

test('invalid uploads send no request and scanning can still resume', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { requests++; return route.fulfill({ json: { matched: false, candidates: [] } }); });
  await openScan(page);
  await page.getByRole('button', { name: 'Pause scanning', exact: true }).click();
  const beforeUpload = requests;
  await page.getByLabel('Upload artwork image').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG, PNG or WebP image.');
  expect(requests).toBe(beforeUpload);
  await page.getByRole('button', { name: 'Resume scanning', exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(beforeUpload);
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
  await expect(page.getByText('Local rules recommendation', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Visit Water Lilies', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/ai-route.png', fullPage: true });
  await page.getByRole('button', { name: 'Visit Water Lilies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
});
