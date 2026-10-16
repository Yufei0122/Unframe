import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AIError, readAIConfig } from '../server/ai/config.js';
import { createAIHandler } from '../server/ai/handler.js';
import { createRouteService } from '../server/ai/routes.js';
import { getPlanningStatus } from '../server/ai/planning-status.js';
import { catalogues } from '../server/ai/catalogues.js';
import { assertAIRoute, runRouteAcceptance } from '../scripts/validate-ai-routes.mjs';

const config = readAIConfig({});
const { collection, graph } = catalogues.get('met');
const preferences = { interests: ['Colour'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: ['water-lilies'] };

async function listen(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup(t) {
  const state = { generationCalls: 0, hold: false, fail: false, onStart: () => {}, onCancel: () => {} };
  const ollamaUrl = await listen(t, async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: config.ollamaModel, digest: 'test-fixture-not-real-weights' }] }));
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion'], details: { parameter_size: 'test-only' } }));
    assert.equal(req.url, '/api/chat');
    state.generationCalls++;
    if (state.hold) { res.once('close', () => state.onCancel()); state.onStart(); return; }
    if (state.fail) { res.statusCode = 500; return res.end('{}'); }
    const context = JSON.parse(body.messages[1].content);
    const value = body.format.properties.reply
      ? { reply: '已调整为20分钟、色彩主题、无障碍且少走路，保留必看作品。', preferences: { ...context.preferences, interests: ['Colour'], availableMinutes: 20, walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'] } }
      : { recommendedArtworkIds: context.artworks.map(artwork => artwork.id), reasoningSummary: 'Fixture recommendation from supplied works.' };
    res.end(JSON.stringify({ done: true, done_reason: 'stop', message: { content: JSON.stringify(value) } }));
  });
  const fixtureConfig = { ...config, ollamaUrl, timeoutMs: 3000 };
  const never = async () => { assert.fail('Planning must not call CLIP or read the image index.'); };
  const backend = await listen(t, createAIHandler({ config: fixtureConfig, clip: { request: never }, store: { load: never } }));
  const post = (endpoint, body, signal) => fetch(`${backend}/api/ai/routes/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  return { config: fixtureConfig, backend, state, post };
}

test('planning status requires a local completion model and reports no inference claim', async () => {
  for (const [tags, details, code] of [
    [{ models: [] }, {}, 'OLLAMA_MODEL_MISSING'],
    [{ models: [{ name: config.ollamaModel, remote_host: 'cloud.invalid' }] }, {}, 'OLLAMA_REMOTE_MODEL'],
    [{ models: [{ name: config.ollamaModel }] }, { capabilities: ['embedding'] }, 'OLLAMA_CAPABILITY'],
  ]) {
    const status = await getPlanningStatus({ config, client: { request: async endpoint => endpoint === '/api/tags' ? tags : details } });
    assert.equal(status.ready, false); assert.equal(status.liveVerified, false); assert.equal(status.code, code);
  }
});

test('strict route requests expose Qwen failure, while ordinary fallback remains explicitly labelled', async t => {
  const { state, post } = await setup(t); state.fail = true;
  const ordinary = await (await post('plan', preferences)).json();
  assert.equal(ordinary.recommendationSource, 'local'); assert.ok(ordinary.warning);
  assert.throws(() => assertAIRoute(ordinary, preferences, collection, graph), /AI did not run/);
  const strict = await post('plan', { ...preferences, requireAI: true });
  assert.equal(strict.status, 503); assert.equal((await strict.json()).code, 'OLLAMA_HTTP_500');
  const invalid = await post('plan', { ...preferences, requireAI: 'true' }); assert.equal(invalid.status, 400);
});

test('obviously impossible visits fail before model inference', async () => {
  let calls = 0;
  const ollama = { generateRouteRecommendations: async () => { calls++; throw new Error('Should not run'); } };
  const service = createRouteService({ ollama, collection, graph });
  await assert.rejects(service.plan({ ...preferences, availableMinutes: 1, requireAI: true }), { code: 'NO_ROUTE' });
  await assert.rejects(createRouteService({ ollama, collection, graph: { ...graph, edges: [] } }).plan(preferences), { code: 'NO_ROUTE' });
  assert.equal(calls, 0);
});

for (const endpoint of ['plan', 'chat']) test(`disconnecting ${endpoint} aborts the actual upstream HTTP request and allows a fresh Qwen route`, { timeout: 10000 }, async t => {
  const { state, post } = await setup(t);
  const started = new Promise(resolve => { state.onStart = resolve; });
  const cancelled = new Promise(resolve => { state.onCancel = resolve; });
  state.hold = true;
  const abort = new AbortController();
  const body = endpoint === 'plan' ? preferences : { message: '少走路', preferences };
  const pending = post(endpoint, body, abort.signal).catch(error => error);
  await started; abort.abort(); await pending; await cancelled;
  state.hold = false;
  const next = await post('plan', { ...preferences, requireAI: true });
  assert.equal(next.status, 200);
  assert.equal((await next.json()).recommendationSource, 'ollama');
  assert.equal(state.generationCalls, 2);
});

test('route cancellation is never converted into a local fallback', async () => {
  const signal = new AbortController();
  const ollama = { generateRouteRecommendations: async () => { signal.abort(); throw new AIError(499, 'REQUEST_CANCELLED', 'Cancelled.'); } };
  await assert.rejects(createRouteService({ ollama, collection, graph }).plan(preferences, signal.signal), { code: 'REQUEST_CANCELLED' });
});

test('route-only acceptance exercises both museums, Chinese chat and graph constraints without image services', async t => {
  const fixture = await setup(t);
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'route-acceptance-test-')); t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const { report, reportFile } = await runRouteAcceptance({ ...fixture, outputRoot, log: () => {} });
  assert.equal(report.passed, true, JSON.stringify(report.failures));
  assert.equal(report.checks.length, 11);
  assert.equal(report.summary.qwenRoutesPassed, 4); assert.equal(report.summary.chineseChatsPassed, 2);
  assert.equal(fixture.state.generationCalls, 6, 'Invalid time/foreign artworks must not invoke Qwen.');
  assert.deepEqual(JSON.parse(await readFile(reportFile, 'utf8')), report);
});

test('strict acceptance records model failure instead of counting deterministic routes as AI success', async t => {
  const fixture = await setup(t); fixture.state.fail = true;
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'route-failure-test-')); t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const { report } = await runRouteAcceptance({ ...fixture, outputRoot, log: () => {} });
  assert.equal(report.passed, false); assert.equal(report.summary.qwenRoutesPassed, 0); assert.equal(report.summary.chineseChatsPassed, 0);
  assert.ok(report.failures.some(row => /OLLAMA_HTTP_500/.test(row.message)));
});
