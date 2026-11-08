import { test, expect, enterWelcome } from './fixtures';
import path from 'node:path';

// Run against an export made with EXPO_PUBLIC_RECOGNITION_MODE=jobs. No AWS calls.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
test.skip(process.env.UNFRAME_CLOUD_WEB_TEST !== '1', 'Requires the cloud-mode web export and UNFRAME_CLOUD_WEB_TEST=1.');
const artwork = { id: 'water-lilies', title: 'Water Lilies', artist: 'Claude Monet', year: '1916–19', description: 'Collection notes', source: 'The Met' };
const recognition = { matched: true, candidates: [{ artwork, similarity: .95 }], artworkDetected: true, requiresConfirmation: true };
async function open(page) {
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
}
async function jobs(page, poll) {
  const operations = []; let uploads = 0, synchronous = 0;
  await page.route('**/api/ai/artworks/recognise*', route => { synchronous++; return route.abort(); });
  await page.route('**/api/ai/artworks/analyse', route => { synchronous++; return route.abort(); });
  await page.route('https://upload.example/**', route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers()['content-type']).toBe('image/jpeg');
    expect(route.request().headers()['if-none-match']).toBe('*');
    uploads++; return route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/a3/jobs', route => {
    const input = route.request().postDataJSON(); operations.push(input.operation);
    expect(input.museumId).toBe('met'); expect(input.sizeBytes).toBeGreaterThan(0);
    return route.fulfill({ status: 201, json: { jobId: String(operations.length), readToken: 'test-capability', status: 'WAITING_UPLOAD',
      upload: { url: 'https://upload.example/photo', headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' } } } });
  });
  await page.route('**/a3/jobs/*', route => {
    expect(route.request().headers()['x-job-token']).toBe('test-capability');
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    return poll(route, id, operations[Number(id) - 1]);
  });
  return { operations, uploads: () => uploads, synchronous: () => synchronous };
}
const success = (route, id, operation, result) => route.fulfill({ json: { jobId: id, status: 'SUCCEEDED', operation, result } });

test('cloud camera holds one job beyond five seconds, then preserves candidate confirmation and scan-again', async ({ page }) => {
  let pending; let confirmations = 0;
  const control = await jobs(page, (route, id, operation) => { pending = { route, id, operation }; });
  await page.route('**/api/ai/artworks/confirm', route => { confirmations++; return route.fulfill({ json: { artwork, aiExplanation: null, interpretationLabel: 'Collection notes' } }); });
  await open(page); await expect.poll(() => Boolean(pending)).toBe(true);
  await page.waitForTimeout(5500); expect(control.operations).toEqual(['recognise']); expect(control.uploads()).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await success(pending.route, pending.id, pending.operation, recognition);
  await expect(page.getByRole('button', { name: 'Select Water Lilies', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0); expect(confirmations).toBe(0);
  await page.getByRole('button', { name: 'Select Water Lilies', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open artwork details', exact: true })).toBeVisible(); expect(confirmations).toBe(1);
  await page.getByRole('button', { name: 'Scan again', exact: true }).click();
  await expect.poll(() => control.operations.length).toBe(2); expect(control.synchronous()).toBe(0);
});

test('cloud background and pause discard late polling responses and allow a fresh scan', async ({ page }) => {
  const pending = [];
  const control = await jobs(page, (route, id, operation) => { pending.push({ route, id, operation }); });
  await open(page); await expect.poll(() => pending.length).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await success(pending[0].route, pending[0].id, pending[0].operation, recognition).catch(() => {});
  await expect(page.locator('video')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Select Water Lilies' })).toHaveCount(0);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => pending.length).toBe(2);
  await page.getByRole('button', { name: 'Pause scanning', exact: true }).click();
  await success(pending[1].route, pending[1].id, pending[1].operation, recognition).catch(() => {});
  await expect(page.getByRole('button', { name: 'Select Water Lilies' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume scanning', exact: true }).click();
  await expect.poll(() => pending.length).toBe(3);
  await page.getByRole('button', { name: 'Close scan', exact: true }).click();
  await success(pending[2].route, pending[2].id, pending[2].operation, recognition).catch(() => {});
  await expect(page.getByRole('button', { name: 'Scan an artwork', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Water Lilies' })).toHaveCount(0);
  expect(control.synchronous()).toBe(0);
});

test('unknown uploaded photo uses a separate analysis job and retains the uncertainty result', async ({ page }) => {
  const control = await jobs(page, (route, id, operation) => success(route, id, operation, operation === 'recognise'
    ? { matched: false, candidates: [], requiresConfirmation: true, artworkDetected: false }
    : { identityStatus: 'uncertain', artworkPresence: 'likely', description: 'A painted scene.', visualFeatures: [], visibleText: [], hypotheses: [], sources: [], search: { status: 'not_needed', providers: [] } }));
  await open(page);
  await page.getByLabel('Upload artwork image').setInputFiles(path.resolve('mobile/assets/water-lilies.jpg'));
  await expect(page.getByRole('heading', { name: 'Artwork not identified', exact: true })).toBeVisible();
  expect(control.operations.filter(op => op === 'analyse')).toHaveLength(1); expect(control.synchronous()).toBe(0);
  await expect(page.getByLabel('Selected artwork photo')).toBeVisible(); await expect(page.locator('video')).toHaveCount(0);
});
