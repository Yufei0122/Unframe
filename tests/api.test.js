import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

let child, directory;
const port = 31000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
async function request(route, method = 'GET', data, headers = {}) {
  const response = await fetch(`${base}/api${route}`, { method, headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: data !== undefined ? JSON.stringify(data) : undefined });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'unframe-api-'));
  child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), UNFRAME_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const response = await request('/state'); if (response.status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Test server started');
});
after(async () => {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  if (directory && path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('unframe-api-')) await rm(directory, { recursive: true, force: true });
});

test('static shell and artwork assets are available', async () => {
  const shell = await fetch(base); assert.equal(shell.status, 200); assert.match(await shell.text(), /Unframe/);
  const asset = await fetch(`${base}/assets/riverlight.svg`); assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /image\/svg/);
});

test('starting the same workspace twice reports its running URL without crashing', async () => {
  const result = await execFileAsync(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), UNFRAME_DATA_DIR: directory }, windowsHide: true, timeout: 7000 });
  assert.match(result.stdout, /Unframe is already running/);
  assert.ok(result.stdout.includes(base));
  assert.equal(result.stderr, '');
  assert.equal((await request('/state')).status, 200);
});

test('another workspace on the same port gets an actionable error without stopping the first', async () => {
  await assert.rejects(execFileAsync(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), UNFRAME_DATA_DIR: path.join(directory, 'other-workspace') }, windowsHide: true, timeout: 7000 }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /already in use by another server/);
    assert.match(error.stderr, /npm.cmd start/);
    assert.doesNotMatch(error.stderr, /Unhandled 'error'/);
    return true;
  });
  assert.equal((await request('/state')).status, 200);
});

test('invalid port configuration is explained without a stack trace', async () => {
  await assert.rejects(execFileAsync(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: 'invalid', UNFRAME_DATA_DIR: directory }, windowsHide: true, timeout: 7000 }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /PORT must be a whole number/);
    return true;
  });
});
test('invalid preference requests are rejected without partially changing state', async () => {
  const before = (await request('/state')).data.preferences;
  const bad = await request('/preferences', 'PATCH', { name: 'Should not persist', duration: -5 });
  assert.equal(bad.status, 400);
  assert.deepEqual((await request('/state')).data.preferences, before);
});
test('saved artworks persist to disk and reject unknown artwork IDs', async () => {
  assert.equal((await request('/saved', 'POST', { artworkId: 'invalid' })).status, 400);
  const saved = await request('/saved', 'POST', { artworkId: 'riverlight' });
  assert.ok(saved.data.includes('riverlight'));
  const disk = JSON.parse(await readFile(path.join(directory, 'unframe.json'), 'utf8'));
  assert.ok(disk.saved.includes('riverlight'));
  await request('/saved', 'POST', { artworkId: 'riverlight' });
});
test('disabled history returns a reflection but does not retain a visit', async () => {
  await request('/preferences', 'PATCH', { saveHistory: false });
  const result = await request('/visits', 'POST', { artworkIds: ['riverlight', 'soft-form'] });
  assert.equal(result.status, 201); assert.equal(result.data.persisted, false);
  assert.match(result.data.summary, /Riverlight/); assert.equal((await request('/state')).data.visits.length, 0);
  await request('/preferences', 'PATCH', { saveHistory: true });
  assert.equal((await request('/visits', 'POST', { artworkIds: ['riverlight'] })).data.persisted, true);
  assert.equal((await request('/state')).data.visits.length, 1);
  await request('/visits', 'DELETE', {});
  assert.equal((await request('/state')).data.visits.length, 0);
});
test('feedback can be submitted and resolved by the local museum workspace', async () => {
  const result = await request('/feedback', 'POST', { artworkId: 'riverlight', type: 'Accuracy', message: 'Please review the colour description.' });
  assert.equal(result.status, 201); assert.equal(result.data.status, 'Open');
  const resolved = await request(`/feedback/${result.data.id}`, 'PATCH', { status: 'Resolved' });
  assert.equal(resolved.data.status, 'Resolved');
});
test('editing a collection note updates guide answers', async () => {
  const result = await request('/artworks/riverlight', 'PATCH', { description: 'Updated interpretation from a curator.' });
  assert.equal(result.status, 200);
  const answer = await request('/guide', 'POST', { question: 'Tell me about Riverlight' });
  assert.match(answer.data.text, /Updated interpretation from a curator/);
  assert.ok(answer.data.sources.length > 0);
});
test('cross-origin mutations and malformed requests are rejected', async () => {
  const cross = await request('/saved', 'POST', { artworkId: 'riverlight' }, { Origin: 'https://untrusted.example' });
  assert.equal(cross.status, 403);
  assert.equal((await request('/guide', 'POST', { question: '' })).status, 400);
  const malformed = await fetch(`${base}/api/guide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
});
