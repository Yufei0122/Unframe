import { test, expect, enterWelcome } from './fixtures';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.skip(!process.env.UNFRAME_LIVE_AI_URL, 'Opt in with a running backend to test real OpenCLIP and vision.');

test('real painting detection closes camera tracks before vision finishes', async ({ page }) => {
  test.setTimeout(180000);
  const image = (await readFile(path.resolve(__dirname, '../assets/quiet-geometry.png'))).toString('base64');
  // A controlled camera scene; HTTP, multipart bytes and both model services
  // remain real. No request interception or model-response mocks.
  await page.addInitScript(({ image }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const picture = new Image(); picture.src = `data:image/png;base64,${image}`; await picture.decode();
      const canvas = document.createElement('canvas'); canvas.width = picture.width; canvas.height = picture.height;
      const context = canvas.getContext('2d'); context.drawImage(picture, 0, 0);
      const stream = canvas.captureStream(10);
      window.capturedCameraTracks = stream.getTracks();
      window.changeCameraScene = () => { context.fillStyle = 'black'; context.fillRect(0, 0, canvas.width, canvas.height); };
      return stream;
    };
  }, { image });
  const requests = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/ai/artworks/')) requests.push(new URL(request.url()).pathname);
  });
  await page.goto(process.env.UNFRAME_LIVE_WEB_URL || 'http://127.0.0.1:8082'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  const detection = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/artworks/recognise'));
  const analysis = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/artworks/analyse'), { timeout: 135000 });
  const started = Date.now();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
  expect((await detection).status()).toBe(200);
  const detected = await (await detection).json();
  expect(detected.artworkDetected).toBe(true); expect(detected.matched).toBe(false);
  await expect(page.getByText('Photo captured. You can lower your phone.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.capturedCameraTracks.every(track => track.readyState === 'ended'))).toBe(true);
  const capturedMs = Date.now() - started;
  await expect(page.locator('video')).toHaveCount(0);
  const frozen = page.getByLabel('Selected artwork photo'); await expect(frozen).toBeVisible();
  const snapshot = () => frozen.evaluate(element => JSON.stringify({ image: getComputedStyle(element).backgroundImage, src: element.querySelector('img')?.src }));
  const firstSnapshot = await snapshot();
  await page.evaluate(() => window.changeCameraScene());
  await page.waitForTimeout(3500);
  expect(await snapshot()).toBe(firstSnapshot);
  expect(requests.filter(endpoint => endpoint.endsWith('/recognise'))).toHaveLength(1);
  expect(requests.filter(endpoint => endpoint.endsWith('/analyse'))).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Cancel analysis', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/live-auto-capture-waiting.png' });
  const response = await analysis;
  expect(response.status()).toBe(200); const result = await response.json(); expect(result.method).toBe('vision');
  await expect(page.getByTestId('artwork-analysis-result')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/live-auto-capture-result.png' });
  const report = { passed: true, capturedMs, completedMs: Date.now() - started, requests, method: result.method,
    timings: result.timings, cameraStoppedBeforeAnalysis: true, sceneChangedAfterCapture: true, frameStayedUnchanged: true,
    limitation: 'Synthetic camera showing an app artwork, real browser uploads, OpenCLIP and vision. This is not physical device or general detector-accuracy testing.' };
  const directory = path.resolve(__dirname, '../../.local-ai/acceptance'); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'live-auto-capture.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
});
