import assert from 'node:assert/strict';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAIConfig } from '../server/ai/config.js';
import { loopbackFetch } from '../server/ai/loopback-fetch.js';
import { planningVersion } from '../server/ai/planning-status.js';
import { catalogues } from '../server/ai/catalogues.js';
import { validateRouteInput } from '../server/ai/routes.js';
import { assertAIRoute } from './validate-ai-routes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function runPlanningBenchmark({ config = readAIConfig(), backend = `http://127.0.0.1:${process.env.PORT || 3000}`,
  outputRoot = path.join(root, '.local-ai'), fetchImpl = loopbackFetch, log = console.log, signal } = {}) {
  const reportFile = path.join(outputRoot, 'benchmarks', `planning-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`);
  const report = { startedAt: new Date().toISOString(), completedAt: null, passed: false,
    backend, model: null, configuration: null, timeoutMs: 0, checks: [],
    limitation: 'End-to-end wall time including any output-limit retry for two fixed Met planning conversations. The first request may already use a loaded model; no model is forcibly unloaded. Repeat timings are individual samples, not a general performance guarantee.' };
  async function save() {
    await mkdir(path.dirname(reportFile), { recursive: true });
    await writeFile(`${reportFile}.tmp`, JSON.stringify(report, null, 2));
    await rename(`${reportFile}.tmp`, reportFile);
  }
  async function request(endpoint, body, row) {
    const requestSignal = body ? signal : (signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000));
    const response = await fetchImpl(`${backend}${endpoint}`, { method: body ? 'POST' : 'GET', signal: requestSignal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (row) { row.httpStatus = response.status; row.response = result; }
    if (response.status !== 200) {
      const last = result.details?.attempts?.at(-1);
      const diagnostics = last ? ` (reason: ${last.doneReason}; generated tokens: ${last.generatedTokens ?? 'unknown'}; output limit: ${last.numPredict}; setting: ${result.details.outputSetting})` : '';
      const error = new Error(`${result.code || response.status}: ${result.error || 'Backend request failed.'}${diagnostics}`);
      error.code = result.code || `HTTP_${response.status}`;
      throw error;
    }
    return result;
  }
  async function measure(name, action) {
    const row = { name, passed: false, startedAt: new Date().toISOString() }; report.checks.push(row);
    await save();
    const started = performance.now();
    log(`START ${name}: no generation deadline; Ctrl+C cancels.`);
    const heartbeat = setInterval(() => log(`WAIT ${name}: ${Math.round((performance.now() - started) / 1000)}s elapsed.`), 15000);
    heartbeat.unref();
    try { await action(row); row.passed = true; }
    catch (error) { row.error = error.message; row.code = error.cause?.code || error.code || error.name; }
    finally {
      clearInterval(heartbeat);
      row.elapsedMs = Math.round(performance.now() - started);
      log(`${row.passed ? 'PASS' : 'FAIL'} ${name}: ${(row.elapsedMs / 1000).toFixed(2)}s${row.error ? ` — ${row.error}` : ''}`);
      await save();
    }
    return row.passed;
  }
  const ready = await measure('preflight', async row => {
    const status = await request('/api/ai/planning/status', undefined, row);
    report.model = status.model; report.configuration = status.configuration;
    row.ready = status.ready;
    assert.equal(status.configuration?.planningVersion, planningVersion, 'Restart the updated backend before timing.');
    assert.equal(status.configuration?.planningTimeoutMs, 0, 'The backend still has a planning deadline.');
    assert.equal(status.configuration?.planningModel, config.planningModel, 'The running backend uses a different model.');
    assert.equal(status.ready, true, status.message);
  });
  const { collection, graph } = catalogues.get('met');
  const preferences = { interests: ['Nature', 'Colour'], availableMinutes: 30, currentLocation: 'entrance',
    walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [] };
  if (ready) for (const sample of ['first', 'repeat']) {
    let updated;
    const chatOK = await measure(`chat_${sample}`, async row => {
      row.response = await request('/api/ai/routes/chat', { museumId: 'met', preferences, history: [],
        message: 'I have 30 minutes. Help me explore the highlights.' }, row);
      assert.ok(typeof row.response.reply === 'string' && row.response.reply.trim(), 'The model did not return a reply.');
      updated = validateRouteInput(row.response.preferences, collection, graph);
      assert.equal(updated.availableMinutes, 30, 'The model did not apply the requested 30-minute visit.');
    });
    if (!chatOK) break;
    const routeOK = await measure(`route_${sample}`, async row => {
      row.response = await request('/api/ai/routes/plan', { museumId: 'met', ...updated, requireAI: true }, row);
      row.verified = assertAIRoute(row.response, updated, collection, graph);
    });
    if (!routeOK) break;
  }
  report.passed = report.checks.length === 5 && report.checks.every(row => row.passed);
  report.completedAt = new Date().toISOString();
  report.timings = Object.fromEntries(report.checks.filter(row => row.name !== 'preflight' && row.passed).map(row => [row.name, row.elapsedMs]));
  await save();
  log(JSON.stringify({ passed: report.passed, elapsedMs: report.timings, report: reportFile, limitation: report.limitation }, null, 2));
  return { report, reportFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    assert.equal(process.argv.length, 2, 'Usage: npm.cmd run ai:timing:routes');
    const { report } = await runPlanningBenchmark({ signal: controller.signal });
    if (!report.passed) process.exitCode = controller.signal.aborted ? 130 : 1;
  } catch (error) { console.error(`Planning timing failed: ${error.message}`); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
