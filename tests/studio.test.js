import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { tmpdir } from 'node:os';

const port = 51000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
const password = 'Test-only-Review-928!';
let directory, child, admin, reviewer, publisher, visitor, registered;
async function request(route, method = 'GET', data, token, headers = {}) {
  const response = await fetch(`${base}/api${route}`, { method, headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, headers: response.headers, data: response.status === 204 ? null : await response.json() };
}
async function start() {
  child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), UNFRAME_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 100; i++) { try { if ((await request('/health')).status === 200) return; } catch {} await new Promise(resolve => setTimeout(resolve, 60)); }
  throw new Error('Studio test server did not start');
}
async function stop() { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'unframe-studio-')); await start();
  const status = await request('/studio/status'); assert.equal(status.data.setupRequired, true);
  const registration = await request('/auth/register', 'POST', { email: ' New.Visitor@Example.test ', password, confirmPassword: password, role: 'admin', canAccessStudio: true });
  assert.equal(registration.status, 201); registered = registration.data;
  assert.equal((await request('/auth/status')).data.setupRequired, true);
  assert.equal((await request('/auth/setup', 'POST', { name: 'Duplicate', email: 'new.visitor@example.test', password })).data.code, 'EMAIL_EXISTS');
  admin = (await request('/studio/setup', 'POST', { name: 'Admin', email: 'admin@example.test', password })).data;
  for (const [name, role] of [['Reviewer', 'reviewer'], ['Publisher', 'publisher']]) await request('/studio/members', 'POST', { name, email: `${role}@example.test`, password, role }, admin.token);
  reviewer = (await request('/studio/login', 'POST', { email: 'reviewer@example.test', password })).data;
  publisher = (await request('/studio/login', 'POST', { email: 'publisher@example.test', password })).data;
  await request('/studio/members', 'POST', { name: 'Visitor', email: 'visitor@example.test', password, role: 'visitor' }, admin.token);
  visitor = (await request('/auth/login', 'POST', { email: 'visitor@example.test', password, role: 'admin', canAccessStudio: true })).data;
});
after(async () => { await stop(); if (directory && path.basename(directory).startsWith('unframe-studio-')) await rm(directory, { recursive: true, force: true }); });
async function create(artworkId = 'water-lilies', field = 'description', suffix = '') {
  const response = await request('/studio/cases', 'POST', { artworkId, field, proposed: `A reviewed interpretation${suffix}.`, reason: 'Source-backed editorial update.', sourceUrl: 'https://www.metmuseum.org/art/collection/search/437137', priority: 'high' }, admin.token);
  assert.equal(response.status, 201, JSON.stringify(response.data)); return response.data;
}
async function ready(item) {
  item = (await request(`/studio/cases/${item.id}/evidence`, 'PATCH', { version: item.version, verified: true, note: 'Compared the proposed wording with the official collection record.' }, admin.token)).data;
  item = (await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'approve', version: item.version }, admin.token)).data;
  const result = await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'approve', version: item.version }, reviewer.token);
  assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data;
}

test('public registration creates a persisted ordinary account and never accepts staff permissions', async () => {
  assert.equal(registered.user.email, 'new.visitor@example.test');
  assert.equal(registered.user.name, 'New.Visitor');
  assert.equal(registered.user.role, 'visitor'); assert.equal(registered.user.canAccessStudio, false);
  assert.equal((await request('/auth/session', 'GET', undefined, registered.token)).status, 200);
  assert.equal((await request('/studio/state', 'GET', undefined, registered.token)).status, 403);
  assert.equal((await request('/auth/login', 'POST', { email: 'NEW.VISITOR@example.test', password })).status, 200);
  const disk = JSON.parse(await readFile(path.join(directory, 'studio.json'), 'utf8'));
  const user = disk.users.find(item => item.id === registered.user.id);
  assert.equal(user.role, 'visitor'); assert.equal(user.hash.length, 128); assert.ok(user.salt);
  assert.doesNotMatch(JSON.stringify(registered), /"hash"|"salt"|Test-only/);
  assert.doesNotMatch(JSON.stringify(disk), /Test-only-Review/);
});

test('registration validates passwords and atomically rejects duplicate normalized emails', async () => {
  const input = { email: 'other@example.test', password, confirmPassword: password };
  for (const [patch, code] of [[{ email: 'invalid' }, 'EMAIL_INVALID'], [{ password: 'short' }, 'PASSWORD_INVALID'], [{ confirmPassword: 'different-password' }, 'PASSWORD_MISMATCH']]) {
    const result = await request('/auth/register', 'POST', { ...input, ...patch });
    assert.equal(result.status, 400); assert.equal(result.data.code, code);
  }
  const duplicate = await request('/auth/register', 'POST', { ...input, email: 'NEW.VISITOR@example.test' });
  assert.equal(duplicate.status, 409); assert.equal(duplicate.data.code, 'EMAIL_EXISTS');
  const results = await Promise.all([
    request('/auth/register', 'POST', { ...input, email: ' Race@Example.test ' }),
    request('/auth/register', 'POST', { ...input, email: 'race@example.test' }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const disk = JSON.parse(await readFile(path.join(directory, 'studio.json'), 'utf8'));
  assert.equal(disk.users.filter(item => item.email === 'race@example.test').length, 1);
});

test('staff data is authenticated, public catalogue never exposes users, drafts or password hashes', async () => {
  assert.equal((await request('/studio/state')).status, 401);
  assert.equal((await request('/artworks/riverlight', 'PATCH', { description: 'Unauthenticated update' })).status, 401);
  const catalogue = await request('/catalogue'); assert.equal(catalogue.status, 200); assert.ok(catalogue.data.artworks.length >= 12);
  assert.doesNotMatch(JSON.stringify(catalogue.data), /"hash"|"salt"|"users"|"cases"|"email"/);
  assert.doesNotMatch(JSON.stringify((await request('/studio/state', 'GET', undefined, admin.token)).data), /"hash"|"salt"|Test-only/);
  assert.equal((await request('/studio/setup', 'POST', { name: 'Other', email: 'other@example.test', password })).status, 409);
});

test('login validates credentials, role is server-owned, logout revokes the session', async () => {
  assert.equal((await request('/studio/login', 'POST', { email: 'admin@example.test', password: 'incorrect' })).status, 401);
  const session = await request('/studio/login', 'POST', { email: 'reviewer@example.test', password, role: 'admin' });
  assert.equal(session.status, 200); assert.equal(session.data.user.role, 'reviewer');
  assert.equal((await request('/studio/members', 'POST', { name: 'X', email: 'x@example.test', password, role: 'admin' }, session.data.token)).status, 403);
  assert.equal((await request('/studio/logout', 'POST', {}, session.data.token)).status, 200);
  assert.equal((await request('/studio/state', 'GET', undefined, session.data.token)).status, 401);
});

test('browser preflights permit the configured Expo origin and reject untrusted origins', async () => {
  const allowed = await request('/studio/state', 'OPTIONS', undefined, undefined, { Origin: 'http://127.0.0.1:8081', 'Access-Control-Request-Headers': 'Authorization,Content-Type' });
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8081');
  assert.match(allowed.headers.get('access-control-allow-headers'), /Authorization/);
  assert.equal((await request('/studio/setup', 'POST', {}, undefined, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request('/studio/setup', 'POST', {}, undefined, { Origin: 'http://untrusted.example', Host: 'untrusted.example' })).status, 403);
});

test('a proposed museum update needs evidence, separate reviewers and a separate publication step', async () => {
  let item = await create();
  const publicArt = async () => (await request('/catalogue')).data.artworks.find(art => art.id === item.artworkId);
  assert.equal((await publicArt()).description, item.current);
  assert.equal((await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'approve', version: item.version }, admin.token)).data.code, 'EVIDENCE_REQUIRED');
  assert.equal((await request(`/studio/cases/${item.id}/evidence`, 'PATCH', { version: item.version, verified: true, note: '' }, admin.token)).status, 400);
  const oldVersion = item.version;
  item = (await request(`/studio/cases/${item.id}/evidence`, 'PATCH', { version: item.version, verified: true, note: 'The collection record supports the proposed wording.' }, admin.token)).data;
  assert.equal((await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'approve', version: oldVersion }, admin.token)).data.code, 'VERSION_CONFLICT');
  item = (await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'approve', version: item.version }, admin.token)).data;
  assert.equal(item.status, 'verify');
  assert.equal((await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'approve', version: item.version }, admin.token)).data.code, 'SECOND_REVIEWER_REQUIRED');
  item = (await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'approve', version: item.version }, reviewer.token)).data;
  assert.equal(item.status, 'ready'); assert.equal((await publicArt()).description, item.current);
  assert.equal((await request('/studio/releases', 'POST', { cases: [{ id: item.id, version: item.version }] }, reviewer.token)).status, 403);
  assert.equal((await request('/studio/releases', 'POST', { cases: [{ id: item.id, version: item.version }] }, publisher.token)).status, 200);
  assert.equal((await publicArt()).description, item.proposed);
  const disk = JSON.parse(await readFile(path.join(directory, 'studio.json'), 'utf8'));
  assert.equal(disk.cases.find(entry => entry.id === item.id).status, 'published');
  assert.ok(disk.cases.find(entry => entry.id === item.id).history.some(entry => entry.action === 'published'));
  assert.doesNotMatch(JSON.stringify(disk.users), /Test-only/); assert.equal(disk.users[0].hash.length, 128);
});

test('return requires a reason and resubmission invalidates previous verification', async () => {
  let item = await create('the-harvesters');
  assert.equal((await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'return', version: item.version }, reviewer.token)).status, 400);
  item = (await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'return', version: item.version, note: 'Add a more specific collection citation.' }, reviewer.token)).data;
  assert.equal(item.status, 'returned');
  item = (await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'resubmit', version: item.version, proposed: 'An updated proposal.', reason: 'Added the requested source detail.', sourceUrl: 'https://www.metmuseum.org/art/collection/search/435809' }, admin.token)).data;
  assert.equal(item.status, 'review'); assert.equal(item.evidence.verified, false); assert.equal(item.firstReviewer, null);
  assert.equal((await request(`/studio/cases/${item.id}/evidence`, 'PATCH', { version: item.version, verified: 'true', note: 'Source check.' }, admin.token)).status, 400);
});

test('roles prevent publication bypass and assignment uses optimistic concurrency', async () => {
  const item = await create('the-dancing-class');
  assert.equal((await request('/studio/cases', 'POST', {}, publisher.token)).status, 403);
  assert.equal((await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'assign', version: item.version, assignedTo: reviewer.user.id }, reviewer.token)).status, 403);
  assert.equal((await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'assign', version: item.version, assignedTo: reviewer.user.id }, admin.token)).status, 200);
  assert.equal((await request(`/studio/cases/${item.id}/action`, 'POST', { action: 'assign', version: item.version, assignedTo: null }, admin.token)).status, 409);
  assert.equal((await request('/studio/releases', 'POST', { cases: [{ id: item.id, version: item.version + 1 }] }, admin.token)).status, 409);
});

test('optional visitor login never grants staff data or mutations, even with forged role fields', async () => {
  assert.equal(visitor.user.role, 'visitor'); assert.equal(visitor.user.canAccessStudio, false);
  const session = await request('/auth/session', 'GET', undefined, visitor.token);
  assert.equal(session.status, 200); assert.equal(session.data.user.canAccessStudio, false);
  assert.equal((await request('/catalogue')).status, 200);
  for (const [route, method, input] of [['/studio/state', 'GET'], ['/studio/cases', 'POST', {}], ['/studio/members', 'POST', { role: 'admin' }], ['/studio/releases', 'POST', {}]]) {
    const result = await request(route, method, input, visitor.token);
    assert.equal(result.status, 403); assert.equal(result.data.code, 'STUDIO_FORBIDDEN');
  }
  assert.equal((await request('/artworks/riverlight', 'PATCH', { description: 'Unapproved update.' }, visitor.token)).status, 403);
  const staff = (await request('/studio/state', 'GET', undefined, reviewer.token)).data;
  assert.ok(!staff.members.some(member => member.id === visitor.user.id));
});

test('only administrators grant or revoke access, and existing sessions use the latest role', async () => {
  assert.equal((await request(`/studio/members/${visitor.user.id}`, 'PATCH', { role: 'admin' }, visitor.token)).status, 403);
  assert.equal((await request(`/studio/members/${visitor.user.id}`, 'PATCH', { role: 'admin' }, reviewer.token)).status, 403);
  const granted = await request(`/studio/members/${visitor.user.id}`, 'PATCH', { role: 'reviewer' }, admin.token);
  assert.equal(granted.status, 200); assert.equal(granted.data.canAccessStudio, true);
  assert.equal((await request('/auth/session', 'GET', undefined, visitor.token)).data.user.canAccessStudio, true);
  assert.equal((await request('/studio/state', 'GET', undefined, visitor.token)).status, 200);
  assert.equal((await request(`/studio/members/${visitor.user.id}`, 'PATCH', { role: 'visitor' }, admin.token)).status, 200);
  assert.equal((await request('/auth/session', 'GET', undefined, visitor.token)).data.user.canAccessStudio, false);
  assert.equal((await request('/studio/state', 'GET', undefined, visitor.token)).status, 403);
  assert.equal((await request(`/studio/members/${admin.user.id}`, 'PATCH', { role: 'visitor' }, admin.token)).data.code, 'LAST_ADMIN_REQUIRED');
});

test('revocation also blocks an already-started mutation whose body arrives later', async () => {
  await request(`/studio/members/${visitor.user.id}`, 'PATCH', { role: 'reviewer' }, admin.token);
  const before = (await request('/studio/state', 'GET', undefined, admin.token)).data.cases.length;
  const input = JSON.stringify({ artworkId: 'water-lilies', field: 'detail', proposed: 'This request must not be committed.', reason: 'Testing a permission change during a request.', sourceUrl: 'https://www.metmuseum.org/art/collection/search/437137' });
  let outgoing;
  const response = new Promise((resolve, reject) => {
    outgoing = http.request(`${base}/api/studio/cases`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(input), Authorization: `Bearer ${visitor.token}` } }, res => { let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) })); });
    outgoing.on('error', reject); outgoing.write(input.slice(0, 10));
  });
  await request('/auth/session', 'GET', undefined, visitor.token);
  await request(`/studio/members/${visitor.user.id}`, 'PATCH', { role: 'visitor' }, admin.token);
  outgoing.end(input.slice(10));
  assert.equal((await response).status, 403);
  assert.equal((await request('/studio/state', 'GET', undefined, admin.token)).data.cases.length, before);
});

test('stale publication conflicts roll back the entire release and can be returned for rebasing', async () => {
  const first = await ready(await create('the-card-players', 'description', ' first'));
  let second = await ready(await create('the-card-players', 'detail', ' second'));
  const other = await ready(await create('riverlight', 'description', ' other'));
  assert.equal((await request('/studio/releases', 'POST', { cases: [first, second].map(({ id, version }) => ({ id, version })) }, admin.token)).data.code, 'RELEASE_CONFLICT');
  assert.equal((await request('/studio/releases', 'POST', { cases: [{ id: first.id, version: first.version }] }, admin.token)).status, 200);
  assert.equal((await request('/studio/releases', 'POST', { cases: [other, second].map(({ id, version }) => ({ id, version })) }, admin.token)).data.code, 'PUBLICATION_CONFLICT');
  const current = (await request('/studio/state', 'GET', undefined, admin.token)).data;
  assert.equal(current.cases.find(item => item.id === other.id).status, 'ready');
  second = (await request(`/studio/cases/${second.id}/action`, 'POST', { action: 'return', version: second.version, note: 'Rebase on the latest published artwork.' }, admin.token)).data;
  assert.equal(second.status, 'returned');
});

test('persistent content survives restart while previous bearer sessions expire', async () => {
  await stop(); await start();
  assert.equal((await request('/studio/status')).data.setupRequired, false);
  assert.equal((await request('/studio/state', 'GET', undefined, admin.token)).status, 401);
  admin = (await request('/studio/login', 'POST', { email: 'admin@example.test', password })).data;
  assert.equal((await request('/studio/state', 'GET', undefined, admin.token)).status, 200);
  const login = await request('/auth/login', 'POST', { email: 'new.visitor@example.test', password });
  assert.equal(login.status, 200); assert.equal(login.data.user.canAccessStudio, false);
  assert.equal((await request('/catalogue')).data.artworks.find(art => art.id === 'water-lilies').description, 'A reviewed interpretation.');
});
