import { test, expect, enterWelcome } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });
const routeResult = { demo: true, estimatedMinutes: 24, estimatedWalkingDistance: 90,
  route: [{ order: 1, artworkId: 'water-lilies', title: 'Water Lilies', galleryId: 'european-paintings', estimatedVisitMinutes: 5 }],
  navigation: [{ from: 'entrance', to: 'water-lilies', nodes: ['entrance', 'the-great-hall', 'water-lilies'], distance: 90, estimatedSeconds: 90 }],
  mapNotice: 'Illustrative demo map.', reasoningSummary: 'A calm route through colour and nature.', recommendationSource: 'ollama' };
test.beforeEach(async ({ page }) => { await page.route('**/api/ai/routes/plan', route => route.fulfill({ json: routeResult })); });
async function openPlan(page) {
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Plan/ }).click();
}

test('chat fits a small screen, handles keyboard input and retries without losing or duplicating a message', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let calls = 0;
  await page.route('**/api/ai/routes/chat', route => {
    const input = route.request().postDataJSON();
    expect(input.history.filter(message => message.role === 'user')).toHaveLength(0);
    return route.fulfill(++calls === 1 ? { status: 503, json: { error: 'Local Ollama Qwen is temporarily unavailable.' } } : { json: { reply: 'We will take a relaxed, step-free route.', preferences: { ...input.preferences, walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'] } } });
  });
  await openPlan(page);
  await expect(page.getByRole('tab')).toHaveCount(4);
  const composer = page.getByRole('textbox', { name: 'Message your visit planner' });
  await expect(composer).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/plan-chat-small.png' });
  await composer.fill('A relaxed visit');
  await composer.press('Shift+Enter');
  await expect(composer).toHaveValue('A relaxed visit\n');
  await composer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
  expect(calls).toBe(0);
  await composer.fill('A relaxed, step-free visit please.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Local Ollama Qwen is temporarily unavailable.');
  await expect(page.getByTestId('route-preview-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry message', exact: true }).click();
  await expect(page.getByTestId('planning-answer-card')).toContainText('Step-free');
  await expect(page.getByText('A relaxed, step-free visit please.', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
  expect(calls).toBe(2);
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(page.getByText('A relaxed, step-free visit please.', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('visit-preferences')).not.toContainText('Step-free');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('changing museums starts a separate planning conversation', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } }));
  await page.route('**/api/ai/routes/chat', route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: { reply: 'Water Lilies is included in your Met visit.', preferences: { ...input.preferences, mustSeeArtworkIds: ['water-lilies'] } } });
  });
  await openPlan(page);
  await page.getByRole('button', { name: 'Include Water Lilies', exact: true }).click();
  await expect(page.getByTestId('planning-answer-card')).toContainText('Water Lilies');
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('button', { name: 'Choose museum', exact: true }).click();
  await page.getByRole('button', { name: 'Show Brisbane' }).click();
  await page.getByRole('button', { name: 'Choose GOMA', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByText('GOMA', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId('visit-preferences').filter({ visible: true })).not.toContainText('Water Lilies');
  await expect(page.getByText('Water Lilies is included in your Met visit.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Include The obliteration room', exact: true })).toBeVisible();
});

test('leaving Plan cancels pending chat and ignores a late response', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/routes/chat', route => { pending = route; });
  await openPlan(page);
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: /Home/ }).click();
  const preferences = pending.request().postDataJSON().preferences;
  await pending.fulfill({ json: { reply: 'Outdated planning reply', preferences: { ...preferences, availableMinutes: 90 } } }).catch(() => {});
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByRole('alert')).toContainText('Your message was paused.');
  await expect(page.getByText('Outdated planning reply', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('planning-answer-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard message', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message your visit planner' })).toBeEditable();
});

test('leaving Plan during automatic generation prevents a late route preview', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/routes/chat', route => { const input = route.request().postDataJSON(); return route.fulfill({ json: { reply: 'Your highlights are ready.', preferences: input.preferences } }); });
  await page.route('**/api/ai/routes/plan', route => { pending = route; });
  await openPlan(page);
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole('tab', { name: /Home/ }).click();
  await pending.fulfill({ json: { demo: true, estimatedMinutes: 6, estimatedWalkingDistance: 0, route: [], navigation: [], mapNotice: 'Late route', reasoningSummary: 'Late', recommendationSource: 'local' } }).catch(() => {});
  await expect(page.getByRole('button', { name: 'Choose museum', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByRole('alert')).toContainText('Route generation was paused.');
  await expect(page.getByTestId('route-preview-card')).toHaveCount(0);
});

test('automatic route generation has no deadline and displays its preview', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/routes/chat', route => { const input = route.request().postDataJSON(); return route.fulfill({ json: { reply: 'Your highlights are ready.', preferences: input.preferences } }); });
  await page.route('**/api/ai/routes/plan', route => { pending = route; });
  await openPlan(page);
  await page.clock.install();
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await expect(page.getByTestId('route-planning-transition')).toBeVisible();
  await page.clock.fastForward(7200000);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('planning-elapsed')).toContainText('Waiting 7200s');
  await pending.fulfill({ json: routeResult });
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View full itinerary', exact: true })).toBeVisible();
});

test('slow planning chat survives the former client deadline and applies the completed reply', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/routes/chat', route => { pending = route; });
  await openPlan(page); await page.clock.install();
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page.clock.fastForward(7200000);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('planning-elapsed')).toContainText('Waiting 7200s');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  const { preferences } = pending.request().postDataJSON();
  await pending.fulfill({ json: { reply: 'Your 30-minute highlights visit is ready to plan.', preferences: { ...preferences, availableMinutes: 30 } } });
  await expect(page.getByTestId('planning-answer-card')).toContainText('30 minutes');
  await expect(page.getByTestId('route-preview-card')).toBeVisible();
  await expect(page.getByText('I have 30 minutes. Help me explore the highlights.', { exact: true })).toHaveCount(1);
});

for (const endpoint of ['chat', 'plan']) test(`manually cancelling an unlimited ${endpoint} request ignores its late response`, async ({ page }) => {
  let pending;
  if (endpoint === 'plan') await page.route('**/api/ai/routes/chat', route => { const input = route.request().postDataJSON(); return route.fulfill({ json: { reply: 'Ready.', preferences: input.preferences } }); });
  await page.route(`**/api/ai/routes/${endpoint}`, route => { pending = route; });
  await openPlan(page); await page.clock.install();
  await page.getByRole('button', { name: '30-minute highlights', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page.clock.fastForward(7200000);
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.getByTestId('planning-elapsed')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText(endpoint === 'chat' ? 'Your message was paused.' : 'Route generation was paused.');
  await pending.fulfill({ json: { reply: 'This late reply must be ignored.', preferences: {} } }).catch(() => {});
  await expect(page.getByText('This late reply must be ignored.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toHaveCount(0);
});
