import { test, expect, enterWelcome } from '../e2e/fixtures';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import path from 'node:path';

const password = 'Browser-test-only-928!';
const published = 'A considered, source-backed introduction prepared for this review.';
const api = 'http://127.0.0.1:3013/api';
let backend, directory;
test.describe.configure({ mode: 'serial' });
test.use({ reducedMotion: 'reduce' });
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'unframe-studio-browser-'));
  backend = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, PORT: '3013', UNFRAME_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 100; i++) { try { const result = await fetch(`${api}/auth/status`); if ((await result.json()).setupRequired) return; } catch {} await new Promise(resolve => setTimeout(resolve, 80)); }
  throw new Error('Could not start the isolated backend on port 3013.');
});
test.afterAll(async () => {
  if (backend && backend.exitCode === null) { const exited = once(backend, 'exit'); backend.kill(); await exited; }
  if (directory && path.basename(directory).startsWith('unframe-studio-browser-')) await rm(directory, { recursive: true, force: true });
});
async function screenshot(page, name) {
  await mkdir('test-results/auth-previews', { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('mobile-viewport').screenshot({ path: `test-results/auth-previews/${name}.png` });
}
async function assertTabs(page, active, chinese = false) {
  const labels = chinese ? ['总览', '审核', '内容', '协作'] : ['Overview', 'Review', 'Content', 'Workflow'];
  await expect(page.getByRole('tab')).toHaveCount(4);
  for (const label of labels) await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', label === active ? 'true' : 'false');
}
async function openStudio(page) {
  await page.getByRole('button', { name: 'Open Unframe Studio', exact: true }).click();
  await assertTabs(page, 'Content');
}
async function signIn(page, email, staff = true) {
  await page.getByRole('button', { name: 'Sign in to Unframe', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const response = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const session = await (await response).json();
  await expect(page.getByRole('button', { name: 'Unframe account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Unframe Studio', exact: true })).toHaveCount(staff ? 1 : 0);
  return session;
}
async function addAccount(page, name, email, role) {
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await page.getByRole('textbox', { name: 'Account name' }).fill(name);
  await page.getByRole('textbox', { name: 'Account email' }).fill(email);
  await page.getByLabel('Initial password', { exact: true }).fill(password);
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}
async function signOutStudio(page) {
  await page.getByRole('button', { name: 'Workspace account' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to Unframe', exact: true })).toBeVisible();
}

test('guest use is optional, offline authentication does not block browsing, and Studio is hidden', async ({ page }) => {
  await page.route('**/api/auth/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toHaveCount(0);
  await screenshot(page, 'guest-en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await screenshot(page, 'guest-zh');
  await page.getByRole('button', { name: '登录 Unframe', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂不登录，直接使用', exact: true })).toBeVisible();
  await screenshot(page, 'signin-zh');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await screenshot(page, 'signin-en');
  await page.getByRole('button', { name: 'Explore as guest', exact: true }).click();
  await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await page.getByRole('button', { name: 'Explore Water Lilies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Water Lilies', exact: true })).toBeVisible();
});

test('shared bilingual login: initialize → role-gated switching → evidence → two reviewers → publication', async ({ page, request }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Unframe' }).click();
  await page.getByRole('button', { name: 'Initialize workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Avery');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('admin@studio.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toBeVisible();
  await screenshot(page, 'staff-visitor-en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await screenshot(page, 'staff-visitor-zh');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await openStudio(page);
  await page.getByRole('button', { name: 'Workspace account' }).click();
  await addAccount(page, 'Morgan', 'reviewer@studio.test', 'Reviewer');
  await addAccount(page, 'Riley', 'visitor@studio.test', 'Visitor');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Propose update', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Proposed content' }).fill(published);
  await page.getByRole('textbox', { name: 'Reason for change' }).fill('The collection record supports this editorial wording.');
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pass review', exact: true })).toBeDisabled();
  await assertTabs(page, 'Review');
  await page.getByRole('button', { name: 'Assign reviewer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Riley', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Morgan', exact: true }).click();
  await screenshot(page, 'review-en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await screenshot(page, 'review-zh');
  await page.getByRole('button', { name: '打开证据核验' }).click();
  await assertTabs(page, '审核', true);
  await screenshot(page, 'evidence-zh');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await screenshot(page, 'evidence-en');
  await page.getByRole('textbox', { name: 'Source finding' }).fill('Checked the wording against the official collection record.');
  await page.getByRole('switch', { name: 'Mark source verified' }).click();
  await page.getByRole('button', { name: 'Save findings', exact: true }).click();
  await page.getByRole('button', { name: 'Pass review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await signOutStudio(page);
  await signIn(page, 'reviewer@studio.test');
  await openStudio(page);
  await screenshot(page, 'curator-en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await screenshot(page, 'curator-zh');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View ready content' })).toBeVisible();
  await signOutStudio(page);
  await signIn(page, 'admin@studio.test');
  await openStudio(page);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await screenshot(page, 'overview-en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await screenshot(page, 'overview-zh');
  await page.getByRole('tab', { name: '协作', exact: true }).click();
  await screenshot(page, 'workflow-zh');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await screenshot(page, 'workflow-en');
  await page.getByRole('button', { name: 'Review release', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select REV-0001', exact: true }).click();
  await page.getByRole('button', { name: 'Publish selected (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
  await expect(page.getByText('No changes ready', { exact: true })).toBeVisible();
  expect((await (await request.get(`${api}/catalogue`)).json()).artworks.find(art => art.id === 'water-lilies').description).toBe(published);
  let logins = 0; page.on('request', req => { if (req.url().endsWith('/api/auth/login')) logins++; });
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await page.getByRole('button', { name: 'Visitor · Unframe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unframe account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toHaveCount(0);
  await openStudio(page);
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await page.getByRole('button', { name: 'Visitor · Unframe', exact: true }).click();
  expect(logins).toBe(0);
  await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore Water Lilies', exact: true }).click();
  await expect(page.getByText(published, { exact: true }).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('ordinary signed-in accounts stay in Visitor and cannot access protected endpoints', async ({ page, request }) => {
  await page.goto('/');
  const session = await signIn(page, 'visitor@studio.test', false);
  expect(session.user.canAccessStudio).toBe(false);
  await screenshot(page, 'signed-visitor-en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await screenshot(page, 'signed-visitor-zh');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  expect((await request.get(`${api}/studio/state`, { headers: { Authorization: `Bearer ${session.token}` } })).status()).toBe(403);
  expect((await request.patch(`${api}/studio/members/${session.user.id}`, { headers: { Authorization: `Bearer ${session.token}` }, data: { role: 'admin' } })).status()).toBe(403);
  await enterWelcome(page);
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Unframe account' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toBeVisible();
});

test('administrator grants and revokes access for an existing logged-in account without a new login', async ({ page, browser, request }) => {
  await page.goto('/');
  const visitor = await signIn(page, 'visitor@studio.test', false);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminPage = await context.newPage();
  await adminPage.route('https://tile.openstreetmap.org/**', route => route.abort());
  try {
    await adminPage.goto('http://127.0.0.1:8091/');
    await signIn(adminPage, 'admin@studio.test'); await openStudio(adminPage);
    await adminPage.getByRole('button', { name: 'Workspace account' }).click();
    await adminPage.getByRole('button', { name: 'Edit access · visitor@studio.test', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Reviewer', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Save access', exact: true }).click();
    await expect(adminPage.getByRole('button', { name: 'Save access', exact: true })).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toBeVisible();
    await openStudio(page);
    await adminPage.getByRole('button', { name: 'Edit access · visitor@studio.test', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Visitor', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Save access', exact: true }).click();
    await expect(adminPage.getByRole('button', { name: 'Save access', exact: true })).toHaveCount(0);
    expect((await request.get(`${api}/studio/state`, { headers: { Authorization: `Bearer ${visitor.token}` } })).status()).toBe(403);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Unframe account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(0);
  } finally { await context.close(); }
});

test('login errors, server session expiry, reload and 320px navigation all clear private views correctly', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Unframe' }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('admin@studio.test');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
  await page.getByRole('button', { name: 'Explore as guest', exact: true }).click();
  const session = await signIn(page, 'admin@studio.test');
  await openStudio(page);
  for (const tab of ['Overview', 'Review', 'Workflow', 'Content']) { await page.getByRole('tab', { name: tab, exact: true }).click(); await assertTabs(page, tab); }
  const nav = await page.getByRole('tablist').boundingBox();
  expect(nav.x).toBeGreaterThanOrEqual(0); expect(nav.width).toBeLessThanOrEqual(320); expect(nav.y + nav.height).toBeLessThanOrEqual(740);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await request.post(`${api}/auth/logout`, { headers: { Authorization: `Bearer ${session.token}` }, data: {} });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await signIn(page, 'admin@studio.test');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toHaveCount(0);
});

test('leaving during sign-in discards and revokes a late authentication response', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Unframe' }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('admin@studio.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  let release, held = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth/login', async route => { held = true; await gate; await route.continue(); });
  try {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.getByRole('button', { name: 'Explore as guest', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toBeVisible();
    const revoked = page.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.status() === 200);
    release(); await revoked;
    await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unframe account' })).toHaveCount(0);
  } finally { release(); }
});

test('public registration: bilingual form → validation → ordinary account → sign in → duplicate email', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Unframe' }).click();
  await expect(page.getByTestId('auth-brand')).toBeVisible();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await expect(page.getByTestId('auth-brand')).toHaveCount(0);
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeVisible();
  await screenshot(page, 'signup-en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.getByLabel('确认密码', { exact: true })).toBeVisible();
  await screenshot(page, 'signup-zh');
  await page.getByLabel('邮箱', { exact: true }).fill('registered@studio.test');
  await page.getByLabel('密码', { exact: true }).fill('short');
  await page.getByLabel('确认密码', { exact: true }).fill('short');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('密码长度须为10至128个字符');
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('两次输入的密码不一致');
  await page.getByRole('button', { name: '显示密码', exact: true }).click();
  await expect(page.getByLabel('密码', { exact: true })).toHaveJSProperty('type', 'text');
  await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  const response = page.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  const session = await (await response).json();
  expect(session.user.role).toBe('visitor'); expect(session.user.canAccessStudio).toBe(false);
  await expect(page.getByRole('button', { name: 'Unframe 账号', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '进入 Unframe 审核端' })).toHaveCount(0);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Unframe account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'registered@studio.test', false);
  await page.getByRole('button', { name: 'Unframe account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in to Unframe' }).click();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('REGISTERED@studio.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This email already has an account.');
  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(page.getByTestId('auth-brand')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('REGISTERED@studio.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('auth forms fit both languages at 320px and stay usable in a short viewport', async ({ page }) => {
  await page.route('**/api/auth/**', route => route.abort());
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 390, height: 500 }]) {
    await page.setViewportSize(viewport); await page.goto('/');
    await page.evaluate(() => localStorage.setItem('unframe.locale', 'en')); await page.reload();
    await page.getByRole('button', { name: 'Sign in to Unframe' }).click();
    for (const chinese of [false, true]) {
      if (chinese) await page.getByRole('button', { name: '中文', exact: true }).click();
      await page.getByRole('button', { name: chinese ? '注册账号' : 'Create an account', exact: true }).click();
      await expect(page.getByTestId('auth-brand')).toHaveCount(0);
      const confirmation = page.getByLabel(chinese ? '确认密码' : 'Confirm password', { exact: true });
      await confirmation.fill('typed-with-keyboard');
      await expect(confirmation).toHaveValue('typed-with-keyboard');
      const gallery = await page.getByTestId('auth-gallery').boundingBox();
      for (const label of [chinese ? '邮箱' : 'Email', chinese ? '密码' : 'Password', chinese ? '确认密码' : 'Confirm password']) {
        const input = page.getByLabel(label, { exact: true });
        await input.scrollIntoViewIfNeeded(); const box = await input.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(gallery.x + gallery.width);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
      const language = page.getByRole('button', { name: chinese ? 'English' : '中文', exact: true });
      await language.scrollIntoViewIfNeeded(); await expect(language).toBeInViewport();
      if (viewport.height >= 740) {
        await page.getByTestId('auth-scroll').evaluate(element => { element.scrollTop = 0; });
        await expect(page.getByRole('button', { name: chinese ? '创建账号' : 'Create account', exact: true })).toBeInViewport();
        await expect(page.getByRole('button', { name: chinese ? '暂不登录，直接使用' : 'Explore as guest', exact: true })).toBeInViewport();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (viewport.width === 320) await screenshot(page, chinese ? 'signup-320-zh' : 'signup-320-en');
      await page.getByRole('button', { name: chinese ? '返回登录' : 'Back to sign in', exact: true }).click();
      await expect(page.getByTestId('auth-brand')).toBeVisible();
    }
    await page.getByRole('button', { name: '注册账号', exact: true }).click();
    await page.getByRole('button', { name: '暂不登录，直接使用', exact: true }).click();
    await expect(page.getByRole('button', { name: '登录 Unframe' })).toBeVisible();
  }
});

test('leaving registration revokes a late session without opening Studio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Unframe' }).click();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('late-registration@studio.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  let release, held = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth/register', async route => { held = true; await gate; await route.continue(); });
  try {
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.getByRole('button', { name: 'Explore as guest', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in to Unframe' })).toBeVisible();
    const revoked = page.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.status() === 200);
    release(); await revoked;
    await expect(page.getByRole('button', { name: 'Unframe account' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Unframe Studio' })).toHaveCount(0);
  } finally { release(); }
});
