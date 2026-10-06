import { test, expect, enterWelcome } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });
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
    return route.fulfill(++calls === 1 ? { status: 503, json: { error: 'Google AI is temporarily unavailable.' } } : { json: { reply: 'We will take a relaxed, step-free route.', preferences: { ...input.preferences, walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'] } } });
  });
  await openPlan(page);
  await expect(page.getByRole('tab')).toHaveCount(5);
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
  await expect(page.getByRole('alert')).toContainText('Google AI is temporarily unavailable.');
  await expect(page.getByRole('button', { name: 'Generate route', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry message', exact: true }).click();
  await expect(page.getByTestId('visit-preferences')).toContainText('Step-free');
  await expect(page.getByText('A relaxed, step-free visit please.', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Generate route', exact: true })).toBeEnabled();
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
  await expect(page.getByTestId('visit-preferences')).toContainText('Water Lilies');
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('button', { name: 'Choose museum', exact: true }).click();
  await page.getByRole('button', { name: 'Show Brisbane' }).click();
  await page.getByRole('button', { name: 'Choose GOMA', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByText('GOMA · demo collection').filter({ visible: true })).toBeVisible();
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
  await expect(page.getByTestId('visit-preferences')).toContainText('30 min');
  await page.getByRole('button', { name: 'Discard message', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message your visit planner' })).toBeEditable();
});

test('leaving Plan during generation prevents a late route from opening', async ({ page }) => {
  let pending;
  await page.route('**/api/ai/routes/plan', route => { pending = route; });
  await openPlan(page);
  await page.getByRole('button', { name: 'Generate route', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole('tab', { name: /Home/ }).click();
  await pending.fulfill({ json: { demo: true, estimatedMinutes: 6, estimatedWalkingDistance: 0, route: [], navigation: [], mapNotice: 'Late route', reasoningSummary: 'Late', recommendationSource: 'local' } }).catch(() => {});
  await expect(page.getByRole('button', { name: 'Choose museum', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Plan/ }).click();
  await expect(page.getByRole('alert')).toContainText('Route generation was paused.');
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate route', exact: true })).toBeEnabled();
});
