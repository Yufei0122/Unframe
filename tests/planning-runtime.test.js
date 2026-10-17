import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AIError, readAIConfig } from '../server/ai/config.js';
import { createLocalClient } from '../server/ai/local-http.js';
import { loopbackFetch } from '../server/ai/loopback-fetch.js';
import { createAIHandler } from '../server/ai/handler.js';
import { createRouteService } from '../server/ai/routes.js';
import { getPlanningStatus } from '../server/ai/planning-status.js';
import { catalogues } from '../server/ai/catalogues.js';
import { assertAIRoute, runRouteAcceptance } from '../scripts/validate-ai-routes.mjs';
import { runPlanningBenchmark } from '../scripts/benchmark-planning.mjs';

const config = readAIConfig({});
const { collection, graph } = catalogues.get('met');
const preferences = { interests: ['Colour'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: ['water-lilies'] };

async function listen(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup(t, overrides = {}) {
  const state = { generationCalls: 0, delayMs: 0, hold: false, holdFromBudget: Infinity, fail: false, truncateBelow: 0, onStart: () => {}, onCancel: () => {} };
  const ollamaUrl = await listen(t, async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/version') return res.end(JSON.stringify({ version: 'test-fixture' }));
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: config.planningModel, digest: 'test-fixture-not-real-weights' }] }));
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion'], details: { parameter_size: 'test-only' } }));
    assert.equal(req.url, '/api/chat');
    state.generationCalls++;
    if (state.hold || body.options.num_predict >= state.holdFromBudget) { res.once('close', () => state.onCancel()); state.onStart(); return; }
    if (state.fail) { res.statusCode = 500; return res.end('{}'); }
    if (state.delayMs) await delay(state.delayMs);
    if (body.options.num_predict < state.truncateBelow) {
      return res.end(JSON.stringify({ done: true, done_reason: 'length', eval_count: body.options.num_predict,
        prompt_eval_count: 1300, eval_duration: 1000000000, message: { content: '{"preferences":', thinking: 'Do not include private model text in diagnostics.' } }));
    }
    const context = JSON.parse(body.messages[1].content);
    const chinese = /[\u3400-\u9fff]/u.test(body.messages.at(-1).content);
    const value = body.format.properties.reply
      ? { reply: chinese ? '已调整为20分钟、色彩主题、无障碍且少走路，保留必看作品。' : 'Your 30-minute highlights visit is ready to plan.', preferences: chinese ? { ...context.preferences, interests: ['Colour'], availableMinutes: 20, walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'] } : { ...context.preferences, availableMinutes: 30 } }
      : { recommendedArtworkIds: context.artworks.map(artwork => artwork.id), reasoningSummary: 'Fixture recommendation from supplied works.' };
    if (value.preferences && /35 minutes/u.test(body.messages.at(-1).content)) {
      value.preferences = { ...context.preferences, availableMinutes: 35, mustSeeArtworkIds: [] };
      value.reply = 'Updated to 35 minutes and removed the must-see works.';
    }
    res.end(JSON.stringify({ done: true, done_reason: 'stop', message: { content: JSON.stringify(value) } }));
  });
  const fixtureConfig = { ...config, ollamaUrl, timeoutMs: 3000, ...overrides };
  const never = async () => { assert.fail('Planning must not call CLIP or read the image index.'); };
  const backend = await listen(t, createAIHandler({ config: fixtureConfig, clip: { request: never }, store: { load: never } }));
  const post = (endpoint, body, signal) => fetch(`${backend}/api/ai/routes/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  return { config: fixtureConfig, backend, state, post };
}

test('planning status requires a local completion model and reports no inference claim', async () => {
  for (const [tags, details, code] of [
    [{ models: [] }, {}, 'OLLAMA_MODEL_MISSING'],
    [{ models: [{ name: config.planningModel, remote_host: 'cloud.invalid' }] }, {}, 'OLLAMA_REMOTE_MODEL'],
    [{ models: [{ name: config.planningModel }] }, { capabilities: ['embedding'] }, 'OLLAMA_CAPABILITY'],
  ]) {
    const status = await getPlanningStatus({ config, client: { request: async endpoint => endpoint === '/api/tags' ? tags : details } });
    assert.equal(status.ready, false); assert.equal(status.liveVerified, false); assert.equal(status.code, code);
  }
});

test('local transport waits for delayed headers and a complete UTF-8 response within its budget', async t => {
  const ollamaUrl = await listen(t, (_req, res) => {
    const timer = setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const bytes = Buffer.from('{"reply":"参观"}');
      res.write(bytes.subarray(0, 12));
      res.end(bytes.subarray(12));
    }, 50);
    res.once('close', () => clearTimeout(timer));
  });
  const client = createLocalClient({ ...config, ollamaUrl, timeoutMs: 1000 }, 'OLLAMA');
  assert.deepEqual(await client.request('/api/chat', {}), { reply: '参观' });
});

for (const headersSent of [false, true]) test(`non-planning local timeout still cancels the socket (headers sent: ${headersSent})`, { timeout: 5000 }, async t => {
  let hold = true, markClosed;
  const closed = new Promise(resolve => { markClosed = resolve; });
  const ollamaUrl = await listen(t, async (req, res) => {
    for await (const _chunk of req) { /* consume the request */ }
    if (hold) {
      res.once('close', markClosed);
      if (headersSent) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); }
      return;
    }
    res.end('{"ok":true}');
  });
  const client = createLocalClient({ ...config, ollamaUrl, timeoutMs: 100 }, 'OLLAMA');
  await assert.rejects(client.request('/api/chat', {}), { status: 504, code: 'OLLAMA_TIMEOUT' });
  await closed;
  hold = false;
  assert.deepEqual(await client.request('/api/chat', {}), { ok: true });
});

for (const endpoint of ['chat', 'plan']) test(`planning ${endpoint} waits beyond the configured model deadline`, async t => {
  const { state, post } = await setup(t, { timeoutMs: 20 });
  state.delayMs = 100;
  const started = performance.now();
  const response = await post(endpoint, endpoint === 'chat'
    ? { preferences, message: 'I have 30 minutes. Help me explore the highlights.' }
    : { ...preferences, requireAI: true });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(performance.now() - started >= 100);
  if (endpoint === 'plan') assert.equal(body.recommendationSource, 'ollama');
  else assert.equal(body.preferences.availableMinutes, 30);
});

test('timing benchmark measures first/repeat chat and real-HTTP routes without a deadline', async t => {
  const fixture = await setup(t, { timeoutMs: 20 }); fixture.state.delayMs = 80;
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'planning-timing-test-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const { report, reportFile } = await runPlanningBenchmark({ ...fixture, outputRoot, log: () => {} });
  assert.equal(report.passed, true, JSON.stringify(report.checks));
  assert.equal(fixture.state.generationCalls, 4);
  assert.deepEqual(Object.keys(report.timings), ['chat_first', 'route_first', 'chat_repeat', 'route_repeat']);
  assert.ok(Object.values(report.timings).every(ms => ms >= 80));
  assert.deepEqual(JSON.parse(await readFile(reportFile, 'utf8')), report);
});

test('timing benchmark reports model failure and does not invent successful durations', async t => {
  const fixture = await setup(t); fixture.state.fail = true;
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'planning-timing-failure-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const { report } = await runPlanningBenchmark({ ...fixture, outputRoot, log: () => {} });
  assert.equal(report.passed, false);
  assert.deepEqual(report.timings, {});
  assert.match(report.checks.at(-1).error, /OLLAMA_HTTP_500/);
  assert.equal(fixture.state.generationCalls, 1);
});

test('cancelling the timing benchmark aborts model work and saves an unsuccessful report', { timeout: 5000 }, async t => {
  const fixture = await setup(t); fixture.state.hold = true;
  const started = new Promise(resolve => { fixture.state.onStart = resolve; });
  const closed = new Promise(resolve => { fixture.state.onCancel = resolve; });
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'planning-timing-cancel-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const controller = new AbortController();
  const pending = runPlanningBenchmark({ ...fixture, outputRoot, signal: controller.signal, log: () => {} });
  await started; controller.abort();
  const { report, reportFile } = await pending;
  await closed;
  assert.equal(report.passed, false);
  assert.deepEqual(report.timings, {});
  assert.equal(report.checks.at(-1).passed, false);
  assert.deepEqual(JSON.parse(await readFile(reportFile, 'utf8')), report);
});

test('local transport rejects redirects without contacting their destination', async t => {
  let followed = false;
  const destination = await listen(t, (_req, res) => { followed = true; res.end('{}'); });
  const ollamaUrl = await listen(t, (_req, res) => { res.writeHead(302, { Location: destination }); res.end(); });
  await assert.rejects(createLocalClient({ ...config, ollamaUrl }, 'OLLAMA').request('/api/chat', {}), { code: 'OLLAMA_UNAVAILABLE' });
  assert.equal(followed, false);
  assert.throws(() => loopbackFetch('https://example.com'), /loopback/);
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

test('route acceptance records duration without rejecting successful responses beyond the artwork budget', async t => {
  const fixture = await setup(t);
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'route-performance-test-')); t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const slowFetch = async (url, init) => {
    await new Promise(resolve => setTimeout(resolve, 25));
    return fetch(url, { ...init, signal: undefined });
  };
  const { report } = await runRouteAcceptance({ ...fixture, config: { ...fixture.config, responseBudgetMs: 20 }, outputRoot, fetchImpl: slowFetch, log: () => {} });
  assert.equal(report.passed, true, JSON.stringify(report.failures));
  assert.ok(report.checks.some(row => row.responseMs >= 25));
});

test('the six-case CLI used by ai:routes:verify accepts correct slow planning responses', { timeout: 20000 }, async t => {
  const fixture = await setup(t, { timeoutMs: 20 });
  fixture.state.delayMs = 1100;
  const script = fileURLToPath(new URL('../scripts/validate-qwen-routes.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [script], { env: { ...process.env,
    PORT: new URL(fixture.backend).port, OLLAMA_URL: fixture.config.ollamaUrl,
    OLLAMA_PLANNING_MODEL: fixture.config.planningModel, AI_RESPONSE_BUDGET_MS: '1000', OLLAMA_TIMEOUT_MS: '1000',
  } });
  const reportFile = JSON.parse(stdout.match(/\{\n  "passed"[\s\S]*\}\s*$/u)[0]).report;
  t.after(() => rm(reportFile, { force: true }));
  const report = JSON.parse(await readFile(reportFile, 'utf8'));
  assert.equal(report.passed, true);
  assert.equal(report.checks.length, 6);
  assert.ok(report.checks.every(row => row.passed && row.elapsedMs >= 1100));
  assert.equal(report.config.timeoutMs, 0);
});

test('timing includes truncation retries while accepting only complete planning responses', async t => {
  const fixture = await setup(t, { planningNumPredict: 192, planningRetryNumPredict: 1024, timeoutMs: 20 });
  fixture.state.truncateBelow = 1024; fixture.state.delayMs = 40;
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'planning-retry-timing-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const { report } = await runPlanningBenchmark({ ...fixture, outputRoot, log: () => {} });
  assert.equal(report.passed, true, JSON.stringify(report.checks));
  assert.equal(fixture.state.generationCalls, 8);
  assert.ok(Object.values(report.timings).every(ms => ms >= 80));
  assert.equal(report.configuration.retryNumPredict, 1024);
});

test('exhausted output retries retain safe diagnostics and the actual HTTP error in the timing report', async t => {
  const fixture = await setup(t); fixture.state.truncateBelow = Infinity;
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'planning-output-failure-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const { report } = await runPlanningBenchmark({ ...fixture, outputRoot, log: () => {} });
  assert.equal(report.passed, false); assert.deepEqual(report.timings, {}); assert.equal(fixture.state.generationCalls, 2);
  const failed = report.checks.at(-1);
  assert.equal(failed.httpStatus, 502); assert.equal(failed.code, 'OLLAMA_INCOMPLETE');
  assert.match(failed.error, /reason: length; generated tokens: 2048; output limit: 2048; setting: OLLAMA_PLANNING_NUM_PREDICT/);
  assert.equal(failed.response.details.outputSetting, 'OLLAMA_PLANNING_NUM_PREDICT');
  assert.deepEqual(failed.response.details.attempts.map(row => [row.doneReason, row.generatedTokens, row.numPredict]), [['length', 1024, 1024], ['length', 2048, 2048]]);
  assert.ok(!JSON.stringify(failed.response.details).includes('private model text'));
});

test('cancelling during the expanded-budget retry aborts upstream work and releases the busy gate', { timeout: 5000 }, async t => {
  const { state, post } = await setup(t, { planningNumPredict: 192, planningRetryNumPredict: 1024 });
  state.truncateBelow = 1024; state.holdFromBudget = 1024;
  const started = new Promise(resolve => { state.onStart = resolve; });
  const closed = new Promise(resolve => { state.onCancel = resolve; });
  const controller = new AbortController();
  const pending = post('chat', { preferences, message: 'I have 30 minutes.' }, controller.signal).catch(error => error);
  await started;
  const busy = await post('plan', { ...preferences, requireAI: true });
  assert.equal(busy.status, 429); assert.equal((await busy.json()).code, 'OLLAMA_BUSY');
  controller.abort(); await pending; await closed;
  state.truncateBelow = 0; state.holdFromBudget = Infinity;
  const next = await post('plan', { ...preferences, requireAI: true });
  assert.equal(next.status, 200); assert.equal((await next.json()).recommendationSource, 'ollama');
  assert.equal(state.generationCalls, 3);
});
