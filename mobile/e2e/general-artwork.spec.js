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
  expect(analyses).toBe(0, 'Camera sampling must not repeatedly invoke the large vision model');
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByRole('heading', { name: 'Artwork not identified', exact: true })).toBeVisible();
  await expect(page.getByText('Leonardo da Vinci', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Visual description only', { exact: true })).toBeVisible();
  await expect(page.getByText('The pose suggests a comparison.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('A figure against a landscape.')).toBeVisible();
  await page.getByRole('button', { name: 'More details' }).click();
  await expect(page.getByText('AI suggestions · unverified', { exact: true })).toBeVisible();
  await expect(page.getByText('Mona Lisa · Leonardo da Vinci', { exact: true })).toBeVisible();
  await expect(page.getByText('The pose suggests a comparison.', { exact: true })).toBeVisible();
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
  await expect(page.getByTestId('artwork-scan-transition')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Looking closer…' })).toBeVisible();
  await expect(page.getByText('Target: under 15 seconds.', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Camera frames go to OpenCLIP', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  await pending.fulfill({ json: result }).catch(() => {});
  await expect(page.getByTestId('artwork-analysis-result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause scanning', exact: true })).toBeVisible();
});
test('a missing vision model is an actionable error, not an empty artwork result', async ({ page }) => {
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/analyse', route => route.fulfill({ status: 503, json: { code: 'VISION_MODEL_MISSING', error: 'Visual analysis needs the local vision model. Run npm.cmd run ai:setup:vision on the backend computer.' } }));
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByRole('alert')).toContainText('ai:setup:vision');
  await expect(page.getByTestId('artwork-analysis-result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analyse any artwork' })).toBeVisible();
});

test('CPU vision survives the former deadline and returns the completed result', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/analyse', route => { pending = route; });
  await openScan(page);
  await page.clock.install();
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByRole('progressbar', { name: 'Looking closer…' })).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(page.getByRole('progressbar', { name: 'Taking a closer look…' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await pending.fulfill({ json: result });
  await expect(page.getByRole('heading', { name: 'Artwork not identified', exact: true })).toBeVisible();
});

test('a description without an identity is explicitly labelled as an unidentified artwork', async ({ page }) => {
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/analyse', route => route.fulfill({ json: { ...result, hypotheses: [], search: { status: 'not_needed', providers: [] } } }));
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByRole('heading', { name: 'Artwork not identified', exact: true })).toBeVisible();
  await expect(page.getByText('Visual description only', { exact: true })).toBeVisible();
  await expect(page.getByText('A figure against a landscape.')).toBeVisible();
  await expect(page.getByText('Leonardo da Vinci', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/general-artwork-unidentified.png' });
});

test('a visually matched reference takes priority over an unsupported model identity guess', async ({ page }) => {
  const source = { id: 'met:437137', provider: 'The Met', title: 'Water Lilies', artist: 'Claude Monet', date: '1916–19', sourceUrl: 'https://www.metmuseum.org/art/collection/search/437137', imageUrl: null, visualCheck: 'similar', similarity: .94 };
  await page.route('**/api/ai/artworks/recognise*', route => route.fulfill({ json: { matched: false, candidates: [] } }));
  await page.route('**/api/ai/artworks/analyse', route => route.fulfill({ json: { ...result, identityStatus: 'possible_match', sources: [source], search: { status: 'completed', providers: [] } } }));
  await openScan(page);
  await page.getByLabel('Upload artwork image').setInputFiles(photo);
  await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
  await expect(page.getByText('Claude Monet', { exact: true })).toBeVisible();
  await expect(page.getByText('Possible match · The Met · Unconfirmed', { exact: true })).toBeVisible();
  await expect(page.getByText('Mona Lisa', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/general-artwork-reference-match.png' });
});
