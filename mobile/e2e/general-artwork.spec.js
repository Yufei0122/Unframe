import { test, expect, enterWelcome } from './fixtures';
import path from 'node:path';

const photo = path.resolve(__dirname, '../assets/water-lilies.jpg');
const result = { identityStatus: 'uncertain', artworkPresence: 'likely', description: 'A figure against a landscape.', visualFeatures: ['Folded hands'], visibleText: [], hypotheses: [{ title: 'Mona Lisa', artist: 'Leonardo da Vinci', basis: 'The pose suggests a comparison.' }], sources: [], search: { status: 'unavailable', providers: [] } };
async function openScan(page) {
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
}
test('an unknown uploaded photo receives visual analysis with uncertainty and source outage disclosure', async ({ page }) => {
  let analyses = 0;
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/analyse', route => { analyses++; expect(route.request().headers()['content-type']).toContain('multipart/form-data'); return route.fulfill({ json: result }); });
  await openScan(page);
  await expect(page.getByRole('button', { name: 'Analyse any artwork' })).toBeVisible();
  expect(analyses).toBe(0, 'Camera sampling must not repeatedly invoke the large vision model');
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByRole('heading', { name: 'Artwork identity uncertain' })).toBeVisible();
  await expect(page.getByText('A figure against a landscape.')).toBeVisible();
  await expect(page.getByText('Model suggestions · unverified')).toBeVisible();
  await expect(page.getByText('Some public sources could not be reached.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open artwork details' })).toHaveCount(0);
  expect(analyses).toBe(1);
  await page.screenshot({ path: 'test-results/general-artwork-uncertain.png' });
});
test('resuming during general analysis discards the late result and restarts lightweight scanning', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/analyse', route => { pending = route; });
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByText('Analysing the image and checking public sources…', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Resume scanning', exact: true }).click();
  await pending.fulfill({ json: result }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Artwork identity uncertain' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause scanning', exact: true })).toBeVisible();
});
test('a missing vision model is an actionable error, not an empty artwork result', async ({ page }) => {
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/analyse', route => route.fulfill({ status: 503, json: { code: 'VISION_MODEL_MISSING', error: 'Visual analysis needs the local vision model. Run npm.cmd run ai:setup:vision on the backend computer.' } }));
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByRole('alert')).toContainText('ai:setup:vision');
  await expect(page.getByRole('heading', { name: 'Artwork identity uncertain' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analyse any artwork' })).toBeVisible();
});
