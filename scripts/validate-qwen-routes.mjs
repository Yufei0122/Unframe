// Serial real HTTP inference; every run retains its own report, including failures.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readAIConfig } from '../server/ai/config.js';
import { loopbackFetch } from '../server/ai/loopback-fetch.js';
import { planningVersion } from '../server/ai/planning-status.js';
import { catalogues } from '../server/ai/catalogues.js';
import { assertModelRoute } from './route-acceptance.mjs';

assert.equal(process.argv.length, 2, 'Usage: npm.cmd run ai:validate:routes');
const config = readAIConfig();
assert.match(config.planningModel, /^qwen/i, 'This acceptance run requires a Qwen planning model.');
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const backend = `http://127.0.0.1:${port}`;
const output = path.join(root, '.local-ai', `qwen-routes-${Date.now()}-${randomUUID()}.json`);
const report = {
  startedAt: new Date().toISOString(), passed: false, backend,
  verification: 'Real Node HTTP and local Ollama Qwen inference; no mocks; local fallback always fails model acceptance.',
  limitation: 'Controlled planning cases on illustrative museum graphs, not surveyed navigation or a general model quality benchmark.',
  config: { model: config.planningModel, timeoutMs: 0, numCtx: config.ollamaNumCtx, numGpu: config.ollamaNumGpu, numPredict: config.planningNumPredict, keepAlive: config.ollamaKeepAlive },
  sourceHashes: {}, checks: [],
};
await mkdir(path.dirname(output), { recursive: true });
async function save() {
  await writeFile(`${output}.tmp`, JSON.stringify(report, null, 2));
  await rename(`${output}.tmp`, output);
}
async function json(url, body) {
  const response = await loopbackFetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
async function check(name, endpoint, input, validate) {
  const row = { name, endpoint, input, passed: false, startedAt: new Date().toISOString() };
  report.checks.push(row);
  await save();
  const started = performance.now();
  console.log(`REAL ${name}: no generation deadline; Ctrl+C cancels.`);
  const heartbeat = setInterval(() => console.log(`WAIT ${name}: ${Math.round((performance.now() - started) / 1000)}s elapsed.`), 15000);
  heartbeat.unref();
  try {
    row.response = await json(`${backend}/api/ai/${endpoint}`, input);
    row.elapsedMs = Math.round(performance.now() - started);
    assert.equal(row.response.status, 200, JSON.stringify(row.response.body));
    validate(row.response.body);
    row.passed = true;
    console.log(`PASS ${name}: ${(row.elapsedMs / 1000).toFixed(2)}s`);
    return row.response.body;
  } catch (error) {
    row.error = { code: error.code || error.name, message: error.message };
    console.error(`FAIL ${name}: ${error.message}`);
    return null;
  } finally {
    clearInterval(heartbeat);
    row.elapsedMs ??= Math.round(performance.now() - started);
    await save();
  }
}
try {
  for (const file of ['server/ai/ollama.js', 'server/ai/chat.js', 'server/ai/routes.js', 'scripts/route-acceptance.mjs', 'scripts/validate-qwen-routes.mjs']) {
    report.sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  }
  const version = await json(`${config.ollamaUrl}/api/version`);
  const tags = await json(`${config.ollamaUrl}/api/tags`);
  assert.equal(version.status, 200);
  assert.equal(tags.status, 200);
  const model = tags.body.models.find(item => item.name === config.planningModel);
  assert.ok(model && !model.remote_host && !model.remote_model, 'Expected installed local model.');
  report.ollama = { version: version.body.version, model };
  for (const [museumId, { collection, graph }] of catalogues) {
    const status = await json(`${backend}/api/ai/planning/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.configuration?.planningModel, config.planningModel);
    assert.equal(status.body.configuration?.planningVersion, planningVersion, 'Restart the updated backend.');
    assert.equal(status.body.configuration?.planningTimeoutMs, 0, 'The backend still has a planning deadline.');
    assert.equal(status.body.ready, true, status.body.message);
    const preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [collection.find(a => a.accessible).id] };
    const message = '我想看色彩丰富的作品，只有20分钟，需要无障碍路线，尽量少走路，请保留我已经选好的必看作品。';
    const chat = await check(`${museumId}/chinese_preferences`, 'routes/chat', { museumId, preferences, history: [], message }, result => {
      assert.match(result.reply, /[\u3400-\u9fff]/u);
      assert.equal(result.preferences.availableMinutes, 20);
      assert.equal(result.preferences.currentLocation, 'entrance');
      assert.equal(result.preferences.walkingPreference, 'less_walking');
      assert.ok(result.preferences.interests.some(value => /colour|color|色彩|颜色/i.test(value)));
      assert.ok(result.preferences.accessibilityRequirements.includes('step_free'));
      assert.deepEqual(result.preferences.mustSeeArtworkIds, preferences.mustSeeArtworkIds);
    });
    if (!chat) {
      report.checks.push({ name: `${museumId}/route_from_chat`, passed: false, skipped: true, reason: 'Chat failed; do not substitute manual or fallback preferences.' });
      continue;
    }
    await check(`${museumId}/route_from_chat`, 'routes/plan', { museumId, ...chat.preferences, requireAI: true }, result => assertModelRoute(result, chat.preferences, collection, graph));
    if (museumId === 'goma') {
      const followup = await check('goma/english_revision', 'routes/chat', {
        museumId, preferences: chat.preferences, history: [{ role: 'user', content: message }, { role: 'assistant', content: chat.reply }],
        message: 'Change the visit to 35 minutes and remove all must-see artworks. Keep my colour interest, starting point, less walking and step-free access. Please reply in English.',
      }, result => {
        assert.equal(result.preferences.availableMinutes, 35);
        assert.deepEqual(result.preferences.mustSeeArtworkIds, []);
        for (const key of ['interests', 'currentLocation', 'walkingPreference', 'accessibilityRequirements']) assert.deepEqual(result.preferences[key], chat.preferences[key]);
        assert.match(result.reply, /[a-zA-Z]/);
        assert.doesNotMatch(result.reply, /[\u3400-\u9fff]/u);
      });
      if (followup) await check('goma/route_from_revision', 'routes/plan', { museumId, ...followup.preferences, requireAI: true }, result => assertModelRoute(result, followup.preferences, collection, graph));
      else report.checks.push({ name: 'goma/route_from_revision', passed: false, skipped: true, reason: 'Revision failed.' });
    }
  }
} catch (error) {
  report.setupError = { code: error.code || error.name, message: error.message };
  console.error(error.message);
} finally {
  report.summary = {
    expectedChecks: 6, executedChecks: report.checks.filter(row => !row.skipped).length,
    passedChecks: report.checks.filter(row => row.passed).length,
    modelRoutesPassed: report.checks.filter(row => row.endpoint === 'routes/plan' && row.passed).length,
    fallbackResponses: report.checks.filter(row => row.response?.body?.recommendationSource === 'local').length,
  };
  report.passed = !report.setupError && report.checks.length === 6 && report.checks.every(row => row.passed);
  report.completedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ passed: report.passed, ...report.summary, report: output }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
