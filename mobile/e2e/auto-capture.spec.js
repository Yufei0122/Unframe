import { test, expect, enterWelcome } from './fixtures';

const empty = { matched: false, candidates: [], requiresConfirmation: true, artworkDetected: false };
const observation = { method: 'vision', identityStatus: 'uncertain', artworkPresence: 'likely', description: 'A geometric painting.',
  visualFeatures: [], visibleText: [], hypotheses: [], sources: [], search: { status: 'not_needed', providers: [] } };

async function openScan(page) {
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await getUserMedia(constraints);
      window.captureTracks = stream.getTracks();
      return stream;
    };
  });
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!window.captureTracks)).toBe(true);
}

test('an unfamiliar painting freezes before slow analysis and never samples a second frame', async ({ page }) => {
  let detection, analysis, frames = 0, analyses = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { frames++; detection = route; });
  await page.route('**/api/ai/artworks/analyse', route => { analyses++; analysis = route; });
  await openScan(page);
  await expect.poll(() => !!detection).toBe(true);
  await detection.fulfill({ json: { ...empty, artworkDetected: true } });
  await expect(page.getByText('Photo captured. You can lower your phone.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.captureTracks.every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByLabel('Selected artwork photo')).toBeVisible();
  await expect.poll(() => !!analysis).toBe(true);
  await page.waitForTimeout(3500);
  expect(frames).toBe(1); expect(analyses).toBe(1);
  await page.screenshot({ path: 'test-results/auto-capture-waiting.png' });
  await analysis.fulfill({ json: observation });
  await expect(page.getByRole('heading', { name: 'Artwork not identified', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(frames).toBe(1);
  await page.getByRole('button', { name: 'Scan again', exact: true }).click();
  await expect.poll(() => frames).toBe(2);
});

test('cancelling or failing analysis keeps the frame and cannot silently reopen the camera', async ({ page }) => {
  let analysis, frames = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { frames++; return route.fulfill({ json: { ...empty, artworkDetected: true } }); });
  await page.route('**/api/ai/artworks/analyse', route => { analysis = route; });
  await openScan(page);
  await expect(page.getByRole('button', { name: 'Cancel analysis', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  await analysis.fulfill({ json: observation }).catch(() => {});
  await expect(page.getByTestId('artwork-analysis-result')).toHaveCount(0);
  await expect(page.getByLabel('Selected artwork photo')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(frames).toBe(1);
  await page.getByRole('button', { name: 'Analyse any artwork', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel analysis', exact: true })).toBeVisible();
  await analysis.fulfill({ status: 503, json: { error: 'Vision unavailable.' } });
  await expect(page.getByRole('alert')).toContainText('Vision unavailable.');
  await expect(page.getByLabel('Selected artwork photo')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(frames).toBe(1);
});

test('manual capture freezes the current frame when the scene detector is uncertain', async ({ page }) => {
  let frames = 0, analyses = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { frames++; return route.fulfill({ json: empty }); });
  await page.route('**/api/ai/artworks/analyse', route => { analyses++; return route.fulfill({ json: observation }); });
  await openScan(page);
  await expect(page.getByRole('button', { name: 'Capture frame', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Capture frame', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByTestId('artwork-analysis-result')).toBeVisible();
  expect(analyses).toBe(1);
  const capturedFrames = frames;
  await page.waitForTimeout(3500);
  expect(frames).toBe(capturedFrames);
});
