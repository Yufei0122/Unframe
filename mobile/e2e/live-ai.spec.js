import { test, expect, enterWelcome } from './fixtures';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const backend = process.env.UNFRAME_LIVE_AI_URL;
test.skip(!backend, 'Set UNFRAME_LIVE_AI_URL to a running local backend to exercise real models.');
test.use({ viewport: { width: 390, height: 844 } });

test('real local Scan recognises an uploaded artwork and returns analysis for an unfamiliar image', async ({ page }) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const origin = new URL(backend);
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(origin.hostname);
  const requests = [];
  const started = new Map();
  // Use the real npm-start preview and browser upload transport. CDP interception
  // omits file bytes from multipart POST bodies, so never proxy photo requests.
  page.on('request', request => { if (request.url().startsWith(origin.origin + '/api/ai/')) started.set(request, Date.now()); });
  page.on('response', response => {
    const request = response.request();
    if (!started.has(request) || request.method() !== 'POST') return;
    requests.push({ endpoint: new URL(request.url()).pathname, status: response.status(), elapsedMs: Date.now() - started.get(request) });
    console.log(`LIVE ${requests.at(-1).endpoint}: HTTP ${response.status()}`);
  });
  console.log('LIVE opening the application');
  await page.goto(process.env.UNFRAME_LIVE_WEB_URL || 'http://127.0.0.1:8081'); await enterWelcome(page);
  console.log('LIVE entering Scan');
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
  await page.getByLabel('Upload artwork image').setInputFiles(path.resolve(__dirname, '../assets/water-lilies.jpg'));
  console.log('LIVE uploaded Water Lilies');
  await page.getByRole('button', { name: 'Select Water Lilies', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read AI interpretation' })).toBeVisible({ timeout: 55000 });
  await page.getByRole('button', { name: 'Read AI interpretation' }).click();
  await expect(page.getByText('Claude Monet', { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/live-scan-catalogue.png' });
  console.log('LIVE catalogue recognition and interpretation passed');
  await page.getByRole('button', { name: 'Resume scanning' }).click();
  await page.getByLabel('Upload artwork image').setInputFiles(path.resolve(__dirname, '../assets/quiet-geometry.png'));
  console.log('LIVE uploaded an unfamiliar image');
  await expect(page.getByRole('heading', { name: /Artwork identity uncertain|Possible artwork identity/ })).toBeVisible({ timeout: 135000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/live-scan-general.png' });
  // General vision unloads the text model on memory-constrained Ollama servers.
  // Confirm another known artwork to exercise that real cold model switch.
  await page.getByRole('button', { name: 'Resume scanning' }).click();
  await page.getByLabel('Upload artwork image').setInputFiles(path.resolve(__dirname, '../assets/water-lilies.jpg'));
  await page.getByRole('button', { name: 'Select Water Lilies', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read AI interpretation' })).toBeVisible({ timeout: 55000 });
  console.log('LIVE text interpretation after vision model switch passed');
  expect(requests.some(row => row.endpoint.endsWith('/analyse') && row.status === 200)).toBe(true);
  expect(requests.every(row => row.status === 200)).toBe(true);
  const reportDirectory = path.resolve(__dirname, '../../.local-ai/acceptance');
  await mkdir(reportDirectory, { recursive: true });
  const reportFile = path.join(reportDirectory, `browser-scan-${Date.now()}.json`);
  await writeFile(reportFile, JSON.stringify({ passed: true, backend: origin.origin, web: process.env.UNFRAME_LIVE_WEB_URL || 'http://127.0.0.1:8081', verification: 'Real browser file uploads, Node endpoints, OpenCLIP and Ollama; no model-response mocks or upload proxy.', samples: ['water-lilies.jpg', 'quiet-geometry.png', 'water-lilies.jpg after model switch'], requests }, null, 2));
  console.log(`LIVE report: ${reportFile}`);
  await test.info().attach('real-model-requests', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' });
});
