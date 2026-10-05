import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.patch('/api/preferences', { data: { name: 'Alex', duration: 30, interests: ['Nature', 'Colour'], stepFree: false, saveHistory: true, largeText: false, reducedMotion: false } });
  const state = await (await request.get('/api/state')).json();
  for (const artworkId of state.saved) await request.post('/api/saved', { data: { artworkId } });
  await request.delete('/api/visits', { data: {} });
});

test('discovery, artwork details, bookmarks, search and accessible dialogs', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your next perspective.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/discover-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save Riverlight', exact: true }).click();
  await page.getByRole('link', { name: 'My Visits', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Riverlight', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Riverlight', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Explore Riverlight', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Fictional artwork');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const search = page.getByRole('textbox', { name: 'Search artworks, artists or interests' });
  await search.fill('Mina Park'); await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'The Blue Hour', exact: true })).toBeVisible();
  await expect(page.locator('.art-card')).toHaveCount(1);
  await search.fill('no-such-work'); await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'A different starting point?' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('step-free tour, completion and saved reflection', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan my visit', exact: true }).click();
  await page.getByRole('combobox', { name: 'How much time do you have?' }).selectOption('60');
  await page.getByRole('checkbox', { name: 'Step-free route' }).check();
  await page.getByRole('button', { name: 'Find my route' }).click();
  await expect(page.locator('.route-panel')).toBeVisible();
  await expect(page.locator('.route-panel')).not.toContainText('Afterimage');
  await expect(page.locator('.route-panel')).toContainText('Step-free route');
  await page.getByRole('button', { name: 'Explored', exact: true }).first().click();
  await page.getByRole('button', { name: 'Finish with explored works' }).click();
  await expect(page.locator('.visit-card')).toContainText('You explored 1 work');
  await page.reload();
  await page.getByRole('button', { name: 'Past visits' }).click();
  await expect(page.locator('.visit-card')).toBeVisible();
});

test('guide responses cite sources and visitor feedback reaches curator workspace', async ({ page }) => {
  await page.goto('/#guide');
  await page.getByRole('button', { name: 'Tell me about Riverlight', exact: true }).click();
  await expect(page.locator('.message.assistant')).toContainText('Riverlight');
  await expect(page.locator('.source-list')).toContainText('Curatorial note 01');
  await page.locator('.source-list button').click();
  await page.getByRole('button', { name: 'Something to share? Send feedback' }).click();
  await page.getByRole('textbox', { name: 'Your feedback', exact: true }).fill('Please add more detail about the use of green.');
  await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await page.goto('/#admin');
  await page.getByRole('button', { name: 'Visitor feedback' }).click();
  await expect(page.locator('.feedback-card').first()).toContainText('Please add more detail');
  await page.getByRole('button', { name: 'Mark resolved' }).first().click();
  await expect(page.locator('.feedback-card').first()).toContainText('Resolved');
});

test('preferences persist and artwork lookup explains its limits', async ({ page }) => {
  await page.goto('/#profile');
  await page.getByRole('textbox', { name: 'What should we call you?' }).fill('Yufei');
  await page.getByRole('checkbox', { name: 'Prefer step-free routes' }).check();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'What should we call you?' })).toHaveValue('Yufei');
  await expect(page.getByRole('checkbox', { name: 'Prefer step-free routes' })).toBeChecked();
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await page.getByRole('button', { name: 'Find an artwork' }).click();
  await expect(page.getByRole('dialog')).toContainText('Photo identification is not connected');
  await page.getByRole('combobox', { name: 'Select the matching artwork' }).selectOption('blue-hour');
  await page.getByRole('button', { name: 'Open artwork' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'The Blue Hour' })).toBeVisible();
});

test('guide context and conversation reset remain available on small screens', async ({ page }) => {
  await page.goto('/#guide');
  const focus = page.getByRole('combobox', { name: 'Focus on an artwork' });
  await expect(focus).toBeVisible();
  await focus.selectOption('blue-hour');
  await page.getByRole('textbox', { name: 'Ask your museum guide' }).fill('Tell me about this work');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.message.assistant')).toContainText('The Blue Hour');
  await page.getByRole('button', { name: 'Start a new conversation' }).click();
  await expect(page.locator('.message')).toHaveCount(0);
  await expect(focus).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Tell me about Riverlight', exact: true })).toBeVisible();
});
