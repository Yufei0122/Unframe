import path from 'node:path';
import sharp from 'sharp';
import { test, expect, enterWelcome } from './fixtures';

const photo = path.join(__dirname, '../assets/water-lilies.jpg');
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

async function enterProfile(page) {
  await page.goto('/'); await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('tab', { name: /Profile/ }).click();
}
async function choosePhoto(page, file, label = 'Upload photo') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: label, exact: true }).click();
  await (await chooser).setFiles(file);
}
async function savedState(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('unframe.mobile.v1'))); }

test('avatar pencil uploads, crops and persists a photo without opening preferences', async ({ page }) => {
  const errors = [], uploads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/')) uploads.push(request.url()); });
  await enterProfile(page);
  const before = await savedState(page);
  await page.getByRole('button', { name: 'Edit avatar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit avatar', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeDisabled();
  await choosePhoto(page, photo);
  await expect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByText('125%', { exact: true })).toBeVisible();
  const preview = page.getByTestId('avatar-crop-preview');
  const originalOffset = await preview.getByRole('img').evaluate(e => e.parentElement.style.left);
  const rect = await preview.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 25, rect.y + rect.height / 2 + 10, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => preview.getByRole('img').evaluate(e => e.parentElement.style.left)).not.toBe(originalOffset);
  await page.getByRole('button', { name: 'Rotate photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeEnabled();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Move photo right', exact: true }).click();
  await page.screenshot({ path: 'test-results/avatar-editor.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit avatar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Your avatar', exact: true })).toBeVisible();
  await expect.poll(async () => (await savedState(page)).avatarUri).toMatch(/^data:image\/jpeg;base64,/);
  const saved = await savedState(page);
  const metadata = await sharp(Buffer.from(saved.avatarUri.split(',')[1], 'base64')).metadata();
  expect([metadata.width, metadata.height, metadata.format]).toEqual([512, 512, 'jpeg']);
  expect(metadata.exif).toBeUndefined();
  expect(saved.preferences).toEqual(before.preferences);
  expect(saved.saved).toEqual(before.saved);
  await enterProfile(page);
  await expect(page.getByRole('img', { name: 'Your avatar', exact: true })).toBeVisible();
  expect((await savedState(page)).avatarUri).toBe(saved.avatarUri);
  await page.getByRole('button', { name: 'Edit avatar', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await savedState(page)).avatarUri).toBe(saved.avatarUri);
  await page.screenshot({ path: 'test-results/profile-avatar.png', animations: 'disabled' });
  expect(errors).toEqual([]); expect(uploads).toEqual([]);
});

test('cancelled, invalid and oversized files preserve the avatar and keep the editor usable', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await enterProfile(page);
  await page.getByRole('button', { name: 'Edit avatar', exact: true }).click();
  await choosePhoto(page, []);
  await expect(page.getByRole('button', { name: 'Upload photo', exact: true })).toBeEnabled();
  await choosePhoto(page, { name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByText('Choose a JPG, PNG, WebP or HEIC photo.', { exact: true })).toBeVisible();
  await choosePhoto(page, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await expect(page.getByText('This photo could not be opened. Try a JPG or PNG image.', { exact: true })).toBeVisible();
  await choosePhoto(page, { name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByText('Choose a photo smaller than 10 MB.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeDisabled();
  await choosePhoto(page, photo);
  await expect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel avatar editing', exact: true }).click();
  expect((await savedState(page)).avatarUri).toBeUndefined();
  expect(errors).toEqual([]);
});
