// Real public deployment smoke test. No HAR/traces, capability URLs or tokens saved.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = process.env.UNFRAME_FINAL_DIR || 'verification/2026-10-31/aws-final';
if (!process.argv.includes('--execute')) { console.log('Use --execute to submit one real Web Scan recognition job.'); process.exit(0); }
const evidence = { startedAt: new Date().toISOString(), origin: 'https://d3x3iexpafsgf.cloudfront.net', status: 'PENDING', stage: 'launch', jobsCreated: 0, suppressedExtraJobs: 0, requests: [], browserErrors: [] };
await writeFile(`${dir}/F18-browser.json`, JSON.stringify(evidence), { flag: 'wx' });
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const cdp = await browser.newBrowserCDPSession();
  evidence.stage = 'deny_camera';
  await cdp.send('Browser.setPermission', { permission: { name: 'camera' }, setting: 'denied', origin: evidence.origin });
  const page = await context.newPage();
  // No camera frames/private photos. Only the selected public reference is sent.
  await page.route('**/a3/jobs', async route => {
    if (route.request().method() === 'POST' && ++evidence.jobsCreated > 1) {
      evidence.suppressedExtraJobs++; await route.abort(); return;
    }
    await route.continue();
  });
  const pending = [];
  page.on('response', response => {
    const url = new URL(response.url());
    const method = response.request().method();
    let kind;
    if (url.hostname === '4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com') kind = url.pathname.includes('/a3/jobs') ? 'jobs' : 'confirmation';
    else if (url.hostname.startsWith('a3-n12281212-unframe-job-images.') && method === 'PUT') kind = 'upload';
    if (!kind) return;
    evidence.requests.push({ kind, method, status: response.status(), cacheControl: response.headers()['cache-control'], allowOrigin: response.headers()['access-control-allow-origin'] });
    if (kind === 'jobs' && response.status() < 300) pending.push((async () => {
      const body = await response.json();
      if (body.jobId) evidence.jobId = body.jobId;
      if (body.status === 'SUCCEEDED') evidence.recognition = { status: body.status, matched: body.result.matched,
        artworkId: body.result.artwork?.id, similarity: body.result.similarity, requiresConfirmation: body.result.requiresConfirmation,
        candidates: body.result.candidates?.map(c => ({ artworkId: c.artwork.id, similarity: c.similarity })) };
    })().catch(() => {}));
  });
  page.on('pageerror', () => evidence.browserErrors.push('pageerror'));
  evidence.stage = 'navigate';
  await page.goto(evidence.origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'Choose The Met', exact: true }).click({ timeout: 60000 });
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Scan an artwork', exact: true }).click();
  evidence.stage = 'upload';
  await page.getByLabel('Upload artwork image').setInputFiles('mobile/assets/water-lilies.jpg');
  evidence.stage = 'recognition';
  await page.getByRole('button', { name: 'Select Water Lilies', exact: true }).waitFor({ timeout: 60000 });
  await Promise.all(pending);
  assert.equal(evidence.recognition?.artworkId, 'water-lilies');
  assert.ok(evidence.recognition.similarity >= .80);
  assert.equal(evidence.recognition.requiresConfirmation, true);
  evidence.candidateDisplayed = true;
  await page.screenshot({ path: `${dir}/F18-candidate.png`, fullPage: true });
  // Observe a short idle interval without creating more camera jobs.
  await page.waitForTimeout(5500);
  assert.equal(evidence.jobsCreated, 1);
  evidence.stage = 'confirmation';
  await page.getByRole('button', { name: 'Select Water Lilies', exact: true }).click();
  await page.waitForTimeout(5000);
  evidence.confirmationHttpSucceeded = evidence.requests.some(r => r.kind === 'confirmation' && r.method === 'POST' && r.status === 200);
  evidence.detailsButtonVisible = await page.getByRole('button', { name: 'Open artwork details', exact: true }).isVisible();
  await page.screenshot({ path: `${dir}/F18-confirmation.png`, fullPage: true });
  evidence.status = evidence.confirmationHttpSucceeded ? 'PASS' : 'PARTIAL_CONFIRMATION_ENDPOINT_MISSING';
  evidence.stage = 'complete';
} catch (error) {
  if (['launch', 'deny_camera'].includes(evidence.stage)) evidence.initializationError = error.message;
  evidence.status = 'FAIL'; process.exitCode = 1;
}
finally {
  await browser?.close(); evidence.finishedAt = new Date().toISOString();
  await writeFile(`${dir}/F18-browser.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
