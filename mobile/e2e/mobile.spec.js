import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

async function startVisit(page) {
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByText('Nearby Artworks', { exact: true })).toBeVisible();
}
async function denyLocation(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, error) => error({ code: 1 }) } });
  });
}
async function readyImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
  });
}

test('welcome → museum → artwork, saved works survive reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await denyLocation(page);
  await page.goto('/');
  await expect(page.getByText('Welcome to', { exact: true })).toBeVisible();
  await expect(page.getByText('Location off · demo museum')).toBeVisible();
  await readyImages(page);
  await page.screenshot({ path: 'test-results/met-welcome.png' });
  await startVisit(page);
  await expect(page.getByText('Illustrative map · demo position & distances')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Floor 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await readyImages(page);
  await page.screenshot({ path: 'test-results/met-museum.png' });
  await page.getByRole('button', { name: 'Explore Water Lilies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
  await expect(page.getByText('1916–19', { exact: true }).filter({ visible: true })).toBeVisible();
  await readyImages(page);
  await page.screenshot({ path: 'test-results/met-artwork.png' });
  await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsave artwork', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to museum' }).click();
  await page.getByRole('tab', { name: /Saved/ }).click();
  await expect(page.getByRole('button', { name: 'Explore Water Lilies' })).toBeVisible();
  await page.reload();
  await startVisit(page);
  await page.getByRole('tab', { name: /Saved/ }).click();
  await page.getByRole('button', { name: 'Explore Water Lilies' }).click();
  await page.getByRole('button', { name: 'Unsave artwork', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save artwork', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to museum' }).click();
  await expect(page.getByText('Make room for a favourite.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('floor selection, room filters, search and all artwork details', async ({ page }) => {
  await denyLocation(page);
  await page.goto('/'); await startVisit(page);
  await page.getByRole('button', { name: 'Floor 3', exact: true }).click();
  await expect(page.getByText('Room to discover', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show demo artworks' }).click();
  await page.getByRole('button', { name: 'Select Egyptian Art' }).click();
  await expect(page.getByRole('button', { name: 'Explore Water Lilies' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset demo map position' }).click();
  await page.getByRole('button', { name: 'Search nearby artworks' }).click();
  await page.getByRole('textbox', { name: 'Search museum artworks' }).fill('Degas');
  await expect(page.getByRole('button', { name: 'Explore The Dancing Class' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Water Lilies' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore The Dancing Class' }).click();
  await expect(page.getByRole('heading', { name: 'The Dancing Class', exact: true })).toBeVisible();
  await expect(page.getByText('Edgar Degas', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to museum' }).click();
  await page.getByRole('textbox', { name: 'Search museum artworks' }).fill('nothing-here');
  await expect(page.getByText('No matching artworks')).toBeVisible();
  await page.getByRole('button', { name: 'Close search' }).click();
  await page.getByRole('button', { name: 'Explore The Harvesters' }).click();
  await expect(page.getByText('Pieter Bruegel the Elder', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to museum' }).click();
  await page.getByRole('button', { name: 'Search nearby artworks' }).click();
  for (const [title, artist, year] of [
    ['Wheat Field with Cypresses', 'Vincent van Gogh', '1889'],
    ['Young Woman with a Water Pitcher', 'Johannes Vermeer', 'ca. 1662'],
    ['The Card Players', 'Paul Cézanne', '1890–92'],
    ['Madame Georges Charpentier and Her Children', 'Auguste Renoir', '1878'],
    ['Self-Portrait with a Straw Hat', 'Vincent van Gogh', '1887'],
  ]) {
    await page.getByRole('textbox', { name: 'Search museum artworks' }).fill(title);
    await page.getByRole('button', { name: `Explore ${title}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText(artist, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(year, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect.poll(() => page.getByRole('img', { name: title, exact: true }).evaluate(el => {
      const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
      return !!img?.complete && img.naturalWidth > 0;
    })).toBe(true);
    await page.getByRole('button', { name: 'Back to museum' }).click();
  }
});

test('speech controls switch language and stop playback when leaving', async ({ page }) => {
  await denyLocation(page);
  await page.addInitScript(() => {
    window.__speechCalls = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => window.__speechCalls.push('stop'),
      speak: utterance => { window.__speechCalls.push(utterance.lang); utterance.onstart?.(); },
    } });
  });
  await page.goto('/'); await startVisit(page);
  await page.getByRole('button', { name: 'Explore Water Lilies' }).click();
  await page.getByRole('button', { name: 'Play introduction' }).click();
  await expect(page.getByRole('button', { name: 'Stop introduction' })).toBeVisible();
  await page.getByRole('button', { name: /Audio language: English/ }).click();
  await expect(page.getByRole('heading', { name: '关于作品' })).toBeVisible();
  await page.getByRole('button', { name: 'Play introduction' }).click();
  await page.getByRole('button', { name: 'Back to museum' }).click();
  const calls = await page.evaluate(() => window.__speechCalls);
  expect(calls).toContain('en-US'); expect(calls).toContain('zh-CN'); expect(calls.at(-1)).toBe('stop');
});

test('device location recognises The Met and labels distant locations as demo', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.779437, longitude: -73.963244, accuracy: 15 });
  await page.goto('/');
  await expect(page.getByText('Near your location', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Museum and location information' }).click();
  await expect(page.getByText(/Device estimate: 0 m/)).toBeVisible();
  await context.setGeolocation({ latitude: -27.4698, longitude: 153.0251, accuracy: 15 });
  await page.getByRole('button', { name: 'Refresh my location' }).click();
  await expect(page.getByText('Explore a demo museum', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/does not confirm that you are near The Met/)).toBeVisible();
  await page.getByRole('button', { name: 'Explore The Met', exact: true }).click();
  await expect(page.getByText('Nearby Artworks', { exact: true })).toBeVisible();
});

test('unavailable location still allows starting the visit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, error) => error({ code: 2 }) } });
  });
  await page.goto('/');
  await expect(page.getByText('Location unavailable · demo museum')).toBeVisible();
  await startVisit(page);
});

test('desktop preview stays phone-sized and small phones have no page overflow', async ({ page }) => {
  await denyLocation(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await readyImages(page);
  const viewport = page.getByTestId('mobile-viewport');
  await expect(viewport).toHaveCSS('width', '406px');
  await expect(viewport).toHaveCSS('height', '860px');
  await page.screenshot({ path: 'test-results/met-desktop.png' });
  await startVisit(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(viewport).toHaveCSS('width', '320px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: 'Explore Water Lilies' }).click();
  await page.getByRole('button', { name: 'Play introduction' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Play introduction' })).toBeVisible();
});

test('existing sample tours survive reload and produce a completed visit', async ({ page }) => {
  await denyLocation(page);
  await page.goto('/'); await startVisit(page);
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: 'Northbank sample tour' }).click();
  await page.getByRole('button', { name: 'Plan my visit', exact: true }).click();
  await page.getByRole('button', { name: '60 minutes', exact: true }).click();
  await page.getByRole('switch', { name: 'Step-free route' }).click();
  await page.getByRole('button', { name: 'Find my route', exact: true }).click();
  await expect(page.getByText('Step-free route · Rooms without stairs').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Afterimage' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark explored', exact: true }).first().click();
  await page.reload(); await startVisit(page);
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: 'Northbank sample tour' }).click();
  await expect(page.getByText(/1 explored/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish my visit', exact: true }).click();
  await expect(page.getByText('A day at Northbank')).toBeVisible();
});

test('preferences, private feedback and scan entry still work', async ({ page }) => {
  await denyLocation(page);
  await page.goto('/'); await startVisit(page);
  await page.getByRole('tab', { name: /Scan/ }).click();
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Yufei');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByText('Your preferences are saved on this device.')).toBeVisible();
  await page.reload(); await startVisit(page);
  await page.getByRole('tab', { name: /Profile/ }).click();
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveValue('Yufei');
  await page.getByRole('button', { name: 'Share feedback', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your feedback' }).fill('Please add more details about the painting.');
  await page.getByRole('button', { name: 'Save feedback draft', exact: true }).click();
  await expect(page.getByText('Feedback on this device')).toBeVisible();
  await expect(page.getByText('Please add more details about the painting.')).toBeVisible();
});
