import { test, expect } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } }));
});

test('welcome, Home and Profile return to museum discovery without a location session', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose The Met', exact: true }).click();
  await page.getByRole('button', { name: 'Back to museum selection' }).click();
  await expect(page.getByRole('button', { name: 'Choose The Met', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose The Met', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Choose museum', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose The Met', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose The Met', exact: true }).click();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: 'Explore museums' }).click();
  await expect(page.getByRole('button', { name: 'Choose The Met', exact: true })).toBeVisible();
  await expect(page.getByText('Museum & location')).toHaveCount(0);
});

test('OpenLayers city markers select the corresponding previews and demo entrance', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose The Met', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start visit', exact: true })).toHaveCount(0);
  await expect(page.locator('.ol-viewport')).toHaveCount(1);
  await expect(page.locator('.museum-pin')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/discovery-new-york.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'Next museum' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview Guggenheim on map' }).click();
  await expect(page.getByTestId('preview-title')).toContainText('Guggenheim');
  await expect(page.getByRole('button', { name: 'Visit Guggenheim website' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Guggenheim' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Brisbane' }).click();
  await expect(page.locator('.museum-pin')).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Brisbane museum map' })).toBeVisible();
  await page.screenshot({ path: 'test-results/discovery-brisbane.png', fullPage: true });
  await page.getByRole('button', { name: 'Preview QAG on map' }).click();
  await expect(page.getByTestId('preview-title')).toContainText('Queensland');
  await page.getByRole('button', { name: 'Preview Museum of Brisbane on map' }).click();
  await expect(page.getByTestId('preview-title')).toContainText('Brisbane');
  await page.getByRole('button', { name: 'Preview GOMA on map' }).click();
  await page.getByRole('button', { name: 'Choose GOMA', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start visit', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByText('GOMA · DEMO LAYOUT')).toBeVisible();
  expect(errors).toEqual([]);
});

test('preview cycles at ten seconds, pauses while held and supports mouse dragging', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByTestId('preview-title')).toContainText('Metropolitan');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  // Reset the timer after startup and freeze wall time for exact boundaries.
  const initialBox = await page.getByTestId('museum-scene').boundingBox();
  await page.mouse.move(initialBox.x + 250, initialBox.y + 280);
  await page.mouse.down(); await page.mouse.up();
  await page.clock.fastForward(9900);
  await expect(page.getByTestId('preview-title')).toContainText('Metropolitan');
  await page.clock.fastForward(200);
  await expect(page.getByTestId('preview-title')).toContainText('Guggenheim');
  const box = await page.getByTestId('museum-scene').boundingBox();
  await page.mouse.move(box.x + 300, box.y + 280); await page.mouse.down();
  await page.clock.fastForward(12000);
  await expect(page.getByTestId('preview-title')).toContainText('Guggenheim');
  await page.mouse.move(box.x + 80, box.y + 280, { steps: 8 }); await page.mouse.up();
  await expect(page.getByTestId('preview-title')).toContainText('Modern Art');
  await page.mouse.move(box.x + 80, box.y + 280); await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 280, { steps: 8 }); await page.mouse.up();
  await expect(page.getByTestId('preview-title')).toContainText('Guggenheim');
  await page.clock.fastForward(10001);
  await expect(page.getByTestId('preview-title')).toContainText('Modern Art');
});

test('preview photos overlap during transitions and respond to the drag before release', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Preview Guggenheim on map' }).click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: 'test-results/discovery-motion-mid.png', animations: 'allow' });
  await expect(page.locator('.preview-outgoing')).toHaveCount(1);
  await expect(page.locator('.preview-incoming')).toHaveCount(1);
  const media = page.getByTestId('scene-media');
  const frame = await page.getByTestId('museum-scene').boundingBox();
  await page.mouse.move(frame.x + 300, frame.y + 280); await page.mouse.down();
  await page.mouse.move(frame.x + 170, frame.y + 280, { steps: 5 });
  await expect(media.locator('.preview-adjacent')).toHaveCount(1);
  await expect(media.locator('.preview-still')).toHaveCSS('transform', /matrix/);
  await page.mouse.move(frame.x + 70, frame.y + 280, { steps: 5 }); await page.mouse.up();
  await expect(page.getByTestId('preview-title')).toContainText('Modern Art');
  await expect(media.locator('.preview-incoming')).toHaveCount(1);
});

test('small and desktop entrances fit their viewport and every preview photo loads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  for (const [city, names] of [['New York', ['The Met', 'Guggenheim', 'MoMA']], ['Brisbane', ['GOMA', 'QAG', 'Queensland Museum', 'Museum of Brisbane']]]) {
    await page.getByRole('button', { name: 'Show ' + city }).click();
    for (const name of names) {
      await page.getByRole('button', { name: 'Preview ' + name + ' on map' }).click();
      await expect.poll(() => page.getByTestId('museum-scene').locator('img').evaluateAll(images => images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const scene = await page.getByTestId('museum-scene').boundingBox();
  expect(scene.width).toBeLessThanOrEqual(440);
  await page.getByRole('button', { name: 'Show New York' }).click();
  await page.getByRole('button', { name: 'Choose The Met', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/discovery-desktop.png' });
});

test('touch swipes preserve vertical scrolling; failed tiles retain museum selection', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Map tiles unavailable');
  const scene = page.getByTestId('museum-scene');
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 310, y: 270 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 270 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('preview-title')).toContainText('Guggenheim');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 200 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('preview-title')).toContainText('Guggenheim');
  await expect.poll(async () => (await scene.boundingBox()).y).toBeLessThan(0);
  await page.getByRole('button', { name: 'Preview The Met on map' }).click();
  await page.getByRole('button', { name: 'Open The Met welcome' }).click();
  await expect(page.getByRole('button', { name: 'Start visit', exact: true })).toBeVisible();
});
