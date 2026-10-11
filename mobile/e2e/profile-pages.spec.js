import fs from 'node:fs';
import path from 'node:path';
import { test, expect, enterWelcome } from './fixtures';

test.use({ viewport: { width: 390, height: 1000 }, deviceScaleFactor: 1 });
const root = path.resolve(__dirname, '../..');
const met = JSON.parse(fs.readFileSync(path.join(root, 'shared/met-collection.json'), 'utf8'));
const goma = JSON.parse(fs.readFileSync(path.join(root, 'shared/goma-collection.json'), 'utf8'));
const graphs = Object.fromEntries(['met', 'goma'].map(id => [id, JSON.parse(fs.readFileSync(path.join(root, `shared/${id}-graph.json`), 'utf8'))]));
const today = new Date(), earlier = new Date(today.getFullYear(), today.getMonth() - 1, 12, 14);
function itinerary(museumId, works, source = 'local') {
  return { demo: true, mapNotice: 'Illustrative demo map.', estimatedMinutes: 24, estimatedWalkingDistance: 20, route: works.map((a, index) => ({ order: index + 1, artworkId: a.id, title: a.title, galleryId: a.room, estimatedVisitMinutes: a.minutes })), navigation: works.map(a => ({ from: 'entrance', to: a.room, nodes: [graphs[museumId].nodes[0].id], distance: 10, estimatedSeconds: 10 })), reasoningSummary: 'A personal route through colour, form and new perspectives.', recommendationSource: source };
}
const seed = {
  version: 1, preferences: { name: 'Alex', interests: ['Nature', 'Colour'], duration: 30, stepFree: false, saveHistory: true, largeText: false },
  saved: ['water-lilies', 'wheat-field-with-cypresses', 'the-dancing-class', 'goma-in-bed', 'goma-soul-under-the-moon', 'goma-obliteration-room'],
  savedAt: { 'water-lilies': today.toISOString(), 'wheat-field-with-cypresses': today.toISOString(), 'the-dancing-class': earlier.toISOString(), 'goma-in-bed': earlier.toISOString(), 'goma-soul-under-the-moon': today.toISOString() },
  savedRoutes: [
    { id: 'met-test', title: 'The Met Classics Trail', kind: 'museum', museumId: 'met', savedAt: today.toISOString(), itinerary: itinerary('met', met.slice(0, 3)) },
    { id: 'goma-test', title: 'GOMA · Colour & Wonder', kind: 'museum', museumId: 'goma', savedAt: earlier.toISOString(), itinerary: itinerary('goma', goma, 'ollama') },
    { id: 'sample-test', title: 'Northbank Gallery Trail', kind: 'sample', savedAt: today.toISOString(), plan: { artworkIds: ['riverlight', 'soft-form'], minutes: 12, duration: 30, interests: ['Nature', 'Sculpture'], stepFree: true } },
  ],
  visits: [{ id: 'visit-1', date: today.toISOString(), artworkIds: ['riverlight'], summary: 'A quiet moment with Riverlight at the sample Northbank Gallery.' }, { id: 'visit-2', date: earlier.toISOString(), artworkIds: ['soft-form'], summary: 'Explored shape and space at the sample gallery.' }], feedback: [], tour: null,
};
async function openProfile(page, seeded = true) {
  if (seeded) await page.addInitScript(value => { if (!localStorage.getItem('unframe.mobile.v1')) localStorage.setItem('unframe.mobile.v1', JSON.stringify(value)); }, seed);
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Profile/ }).click();
}
async function screenshot(page, file) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  await page.screenshot({ path: `test-results/${file}.png`, animations: 'disabled' });
}

test('saved artworks has working filters, search and bookmarks with Profile navigation retained', async ({ page }) => {
  await openProfile(page);
  await page.getByRole('button', { name: 'View saved artworks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved Artworks', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Profile/ })).toHaveAttribute('aria-selected', 'true');
  await screenshot(page, 'profile-saved-artworks');
  const search = page.getByRole('textbox', { name: 'Search your saved artworks…' });
  await search.fill('van Gogh');
  await expect(page.getByRole('button', { name: 'Explore Wheat Field with Cypresses', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Water Lilies', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('button', { name: 'Filter: Sculpture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore In bed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unsave In bed', exact: true }).click();
  await expect(page.getByText('No matching artworks.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Profile', exact: true }).click();
  await expect(page.getByRole('button', { name: '5 Saved Artworks', exact: true })).toBeVisible();
  await page.reload(); await enterWelcome(page); await page.getByRole('button', { name: 'Start visit', exact: true }).click(); await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: 'View saved artworks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore In bed', exact: true })).toHaveCount(0);
});

test('saved routes support museum filters, details, removal and undo without changing the active tour', async ({ page }) => {
  await openProfile(page);
  await page.getByRole('button', { name: 'View saved routes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved Routes', exact: true })).toBeVisible();
  await screenshot(page, 'profile-saved-routes');
  await page.getByRole('button', { name: 'Filter: GOMA', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open route: GOMA · Colour & Wonder', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open route: The Met Classics Trail', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open route: GOMA · Colour & Wonder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'GOMA · Colour & Wonder', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore In bed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to saved routes', exact: true }).click();
  await page.getByRole('button', { name: 'Remove saved route: GOMA · Colour & Wonder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open route: GOMA · Colour & Wonder', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo remove route', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open route: GOMA · Colour & Wonder', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('unframe.mobile.v1')).tour)).toBeNull();
  await page.getByRole('textbox', { name: 'Search your saved routes…' }).fill('no match');
  await expect(page.getByText('No routes in this view.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('button', { name: 'Open route: GOMA · Colour & Wonder', exact: true }).click();
  await page.getByRole('button', { name: 'Open itinerary and map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit visit preferences', exact: true }).click();
  await expect(page.getByText(/Let's make GOMA your own/)).toBeVisible();
});

test('recent activity groups known dates and filters actual visits, saves and AI routes', async ({ page }) => {
  await openProfile(page);
  await page.getByRole('button', { name: 'View recent activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent Activity', exact: true })).toBeVisible();
  await expect(page.getByText('TODAY', { exact: true })).toBeVisible();
  await expect(page.getByText('EARLIER', { exact: true })).toBeVisible();
  await expect(page.getByText('SAVED ON THIS DEVICE', { exact: true })).toHaveCount(1);
  await screenshot(page, 'profile-recent-activity');
  await page.getByRole('button', { name: 'Filter: AI', exact: true }).click();
  await expect(page.getByRole('button', { name: /^View activity:/ })).toHaveCount(1);
  await expect(page.getByText('Saved an AI route', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filter: Visits', exact: true }).click();
  await expect(page.getByRole('button', { name: /^View activity:/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Filter: All', exact: true }).click();
  await page.getByRole('button', { name: 'Search recent activity', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search your activity…' }).fill('van Gogh');
  await expect(page.getByRole('button', { name: /^View activity:/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to Profile', exact: true }).click();
  await page.getByRole('button', { name: '2 Visits Completed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filter: Visits', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('an actual sample itinerary can be saved and reopened after reload', async ({ page }) => {
  await openProfile(page, false);
  await page.getByRole('button', { name: 'View saved routes', exact: true }).click();
  await expect(page.getByText('Your next art trail awaits.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Open app settings', exact: true }).click();
  await page.getByRole('button', { name: 'Northbank sample tour', exact: true }).click();
  await page.getByRole('button', { name: 'Plan my visit', exact: true }).click();
  await page.getByRole('button', { name: 'Find my route', exact: true }).click();
  await page.getByRole('button', { name: 'Save route', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsave route', exact: true })).toBeVisible();
  await page.reload(); await enterWelcome(page); await page.getByRole('button', { name: 'Start visit', exact: true }).click(); await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByRole('button', { name: 'View saved routes', exact: true }).click();
  await page.getByRole('button', { name: 'Open route: Northbank Gallery Trail', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Northbank Gallery Trail', exact: true })).toBeVisible();
});

test('all three Profile pages fit a 320px viewport with larger text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(value => localStorage.setItem('unframe.mobile.v1', JSON.stringify({ ...value, preferences: { ...value.preferences, largeText: true } })), seed);
  await openProfile(page, false);
  for (const [button, name] of [['View saved artworks', 'artworks'], ['View saved routes', 'routes'], ['View recent activity', 'activity']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const scroll = page.getByTestId('profile-subpage-scroll').filter({ visible: true });
    const width = await scroll.evaluate(e => ({ client: e.clientWidth, scroll: e.scrollWidth }));
    expect(width.scroll).toBe(width.client);
    await screenshot(page, `profile-${name}-small`);
    await page.getByRole('button', { name: 'Back to Profile', exact: true }).click();
  }
});
