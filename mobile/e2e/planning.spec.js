import { test, expect, enterWelcome, visitResponse } from './fixtures';
import http from 'node:http';
import { once } from 'node:events';

test.use({ viewport: { width: 390, height: 844 } });
const itinerary = { demo: true, estimatedMinutes: 24, estimatedWalkingDistance: 90,
  route: [{ order: 1, artworkId: 'water-lilies', title: 'Water Lilies', galleryId: 'european-paintings', estimatedVisitMinutes: 5 }],
  navigation: [{ from: 'entrance', to: 'water-lilies', nodes: ['entrance', 'great-hall', 'water-lilies'], distance: 90, estimatedSeconds: 90 }],
  mapNotice: 'Illustrative map.', reasoningSummary: 'A calm route through colour and nature.', recommendationSource: 'ollama' };
const text = 'Let’s take a relaxed walk through colour and nature. I’ll keep your chosen artworks in the visit and leave time to enjoy each one, with a step-free path between the galleries.';
const servers = new Set();
test.afterEach(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } servers.clear(); });
async function openPlan(page) {
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Plan/ }).click();
}
async function heldRoute(page) {
  const control = { response: null, cancelled: false };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks));
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write(JSON.stringify({ type: 'answer', reply: text, preferences: input.preferences }) + '\n');
    control.response = res;
    res.on('close', () => { control.cancelled = true; });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.add(server);
  await page.route('**/api/ai/routes/visit', route => route.continue({ url: `http://127.0.0.1:${server.address().port}/api/ai/routes/visit` }));
  control.finish = () => { if (!control.response.destroyed) control.response.end(JSON.stringify({ type: 'route', itinerary }) + '\n'); };
  return control;
}

test('small-screen keyboard, failure and retry preserve the message and use one visit request', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let calls = 0;
  await page.route('**/api/ai/routes/plan', () => { throw new Error('Automatic planning must not make a second model request.'); });
  await page.route('**/api/ai/routes/visit', route => {
    const input = route.request().postDataJSON();
    expect(input.history.filter(message => message.role === 'user')).toHaveLength(0);
    return route.fulfill(++calls === 1 ? { status: 503, json: { error: 'Local Ollama Qwen is temporarily unavailable.' } } : visitResponse({ reply: text, preferences: { ...input.preferences, walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'] } }, itinerary));
  });
  await openPlan(page);
  const composer = page.getByRole('textbox', { name: 'Message your visit planner' });
  await expect(composer).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await composer.fill('A relaxed visit'); await composer.press('Shift+Enter');
  await expect(composer).toHaveValue('A relaxed visit\n');
  await composer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
  expect(calls).toBe(0);
  await composer.fill('A relaxed, step-free visit please.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Local Ollama Qwen is temporarily unavailable.');
  await page.getByRole('button', { name: 'Retry message', exact: true }).click();
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
  await expect(page.getByText('A relaxed, step-free visit please.', { exact: true })).toHaveCount(1);
  expect(calls).toBe(2);
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(page.getByTestId('planning-reply-text')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a ready route appears while the answer is still typing; show-full works immediately', async ({ page }) => {
  const control = await heldRoute(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openPlan(page); await page.clock.install();
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect(page.getByTestId('planning-reply-text')).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const partial = await page.getByTestId('planning-reply-text').innerText();
  expect(partial.length).toBeLessThan(text.length);
  await page.clock.fastForward(500);
  const longer = await page.getByTestId('planning-reply-text').innerText();
  expect(longer.length).toBeGreaterThan(partial.length); expect(longer.length).toBeLessThan(text.length);
  control.finish();
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show full answer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show full answer', exact: true }).click();
  await expect(page.getByTestId('planning-reply-text')).toHaveText(text);
  await page.screenshot({ path: 'test-results/planning-progressive-card.png' });
});

test('reduced motion shows the whole answer without a typing delay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/ai/routes/visit', route => route.fulfill(visitResponse({ reply: text, preferences: route.request().postDataJSON().preferences }, itinerary)));
  await openPlan(page);
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect(page.getByTestId('planning-reply-text')).toHaveText(text);
  await expect(page.getByRole('button', { name: 'Show full answer', exact: true })).toHaveCount(0);
});

test('leaving during routing stops typing and ignores a late itinerary', async ({ page }) => {
  const control = await heldRoute(page); await openPlan(page);
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect(page.getByTestId('planning-answer-card')).toBeVisible();
  await page.getByRole('tab', { name: /Home/ }).click();
  await expect.poll(() => control.cancelled).toBe(true); control.finish();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByRole('alert')).toContainText('Route generation was paused.');
  await expect(page.getByTestId('route-preview-card')).toHaveCount(0);
  await expect(page.getByTestId('planning-reply-text')).toHaveText(text);
});

test('cancelling before the answer preserves retry state and discards a late response', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/routes/visit', route => { pending = route; });
  await openPlan(page);
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await pending.fulfill(visitResponse({ reply: text, preferences: pending.request().postDataJSON().preferences }, itinerary)).catch(() => {});
  await expect(page.getByRole('alert')).toContainText('Your message was paused.');
  await expect(page.getByTestId('planning-answer-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard message', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message your visit planner' })).toBeEditable();
});

test('long model requests retain cancellation and have no automatic deadline', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/routes/visit', route => { pending = route; });
  await openPlan(page); await page.clock.install();
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true); await page.clock.fastForward(7200000);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('planning-elapsed')).toContainText('Waiting 7200s');
  await pending.fulfill(visitResponse({ reply: text, preferences: pending.request().postDataJSON().preferences }, itinerary));
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
});

test('route failure retains the answer and preferences; retry does not duplicate the conversation', async ({ page }) => {
  let visits = 0, plans = 0;
  await page.route('**/api/ai/routes/visit', route => { visits++; return route.fulfill(visitResponse({ reply: text, preferences: { ...route.request().postDataJSON().preferences, availableMinutes: 20 } }, null, 'No route fits this time.')); });
  await page.route('**/api/ai/routes/plan', route => { plans++; expect(route.request().postDataJSON().availableMinutes).toBe(20); return route.fulfill({ json: itinerary }); });
  await openPlan(page);
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No route fits this time.');
  await expect(page.getByTestId('planning-answer-card')).toContainText('20 minutes');
  await page.getByRole('button', { name: 'Try route again', exact: true }).click();
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
  expect(visits).toBe(1); expect(plans).toBe(1);
  await expect(page.getByTestId('planning-answer-card')).toHaveCount(1);
});

test('changing museums starts a separate planning conversation', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } }));
  await page.route('**/api/ai/routes/visit', route => route.fulfill(visitResponse({ reply: 'Water Lilies is included in your Met visit.', preferences: { ...route.request().postDataJSON().preferences, mustSeeArtworkIds: ['water-lilies'] } }, itinerary)));
  await openPlan(page); await page.getByRole('button', { name: 'Include Water Lilies', exact: true }).click();
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('button', { name: 'Choose museum', exact: true }).click();
  await page.getByRole('button', { name: 'Show Brisbane' }).click();
  await page.getByRole('button', { name: 'Choose GOMA', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByTestId('planning-museum')).toContainText('GOMA');
  await expect(page.getByTestId('planning-answer-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Include The obliteration room', exact: true })).toBeVisible();
});
