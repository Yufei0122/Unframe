// Real combined-planner acceptance. One request per turn; no image models or mocks.
import assert from 'node:assert/strict';
import http from 'node:http';
import { StringDecoder } from 'node:string_decoder';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogues } from '../server/ai/catalogues.js';
import { planningVersion } from '../server/ai/planning-status.js';
import { loopbackFetch } from '../server/ai/loopback-fetch.js';
import { assertAIRoute } from './validate-ai-routes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const timing = process.argv.includes('--timing');
assert.ok(process.argv.slice(2).every(arg => arg === '--timing'), 'Usage: node scripts/validate-ai-visit.mjs [--timing]');
const port = Number(process.env.PORT || 3000);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'PORT must be 1–65535.');
const base = `http://127.0.0.1:${port}`;
const output = path.join(root, '.local-ai', 'acceptance', `visit-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
const report = { passed: false, startedAt: new Date().toISOString(), mode: timing ? 'combined_visit_timing' : 'combined_visit_acceptance', verification: 'Real Node/Qwen single-inference visits; no mocks.', checks: [], failures: [], limitation: 'Individual end-to-end CPU/GPU samples including any output-limit retry. No model is forcibly unloaded. This does not establish general latency guarantees or real museum navigation accuracy.' };
async function visit(input) {
  const started = performance.now(), events = [], decoder = new StringDecoder('utf8');
  let buffer = '', size = 0;
  const consume = line => { if (line.trim()) events.push({ ...JSON.parse(line), elapsedMs: Math.round(performance.now() - started) }); };
  // Native local HTTP avoids fetch's implicit five-minute headers deadline.
  const response = await new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/ai/routes/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, agent: false }, resolve);
    request.on('error', reject); request.end(JSON.stringify(input));
  });
  if (response.statusCode !== 200) {
    const chunks = []; let bytes = 0;
    for await (const chunk of response) {
      bytes += chunk.length; assert.ok(bytes <= 128 * 1024, 'Unexpected error response size.'); chunks.push(chunk);
    }
    let failure;
    try { failure = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Report a safe generic error for non-JSON servers. */ }
    throw new Error(`HTTP ${response.statusCode}: ${failure?.code || 'VISIT_FAILED'}: ${failure?.error || 'Restart the updated backend and check Ollama.'}`);
  }
  assert.match(response.headers['content-type'], /application\/x-ndjson/);
  for await (const chunk of response) {
    size += chunk.length; assert.ok(size <= 128 * 1024, 'Unexpected visit response size.');
    buffer += decoder.write(chunk);
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
  }
  buffer += decoder.end(); if (buffer.trim()) consume(buffer);
  assert.deepEqual(events.map(event => event.type), ['answer', 'route'], JSON.stringify(events));
  const [answer, route] = events, { collection, graph } = catalogues.get(input.museumId);
  assert.ok(answer.reply?.trim());
  assertAIRoute(route.itinerary, answer.preferences, collection, graph);
  return { answer, route: route.itinerary, answerMs: answer.elapsedMs, routeMs: route.elapsedMs, graphAfterAnswerMs: route.elapsedMs - answer.elapsedMs };
}
try {
  const status = await (await loopbackFetch(`${base}/api/ai/planning/status`)).json();
  assert.equal(status.configuration?.planningVersion, planningVersion, 'Restart the updated backend.'); assert.equal(status.ready, true, status.message);
  report.configuration = status.configuration;
  for (const [museumId, { collection }] of timing ? [['met', catalogues.get('met')]] : catalogues) {
    let preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [collection[0].id] };
    let history = [];
    for (const sample of [0, 1]) {
      const message = timing ? 'I have 30 minutes. Please keep my must-see artwork and show me colourful highlights.' : sample === 0 ? '我只有20分钟，想看色彩丰富的作品，需要无障碍，尽量少走路，保留我的必看作品。' : 'Change the visit to 35 minutes and remove all must-see artworks. Keep my colour interest, starting point, less walking and step-free access. Please reply in English.';
      const name = `${museumId}/${timing ? sample ? 'repeat' : 'first' : sample ? 'english_revision' : 'chinese_visit'}`;
      console.log(`START ${name}: combined answer and route; Ctrl+C cancels.`);
      const heartbeat = setInterval(() => console.log(`WAIT ${name}: model inference is still running.`), 15000); heartbeat.unref();
      try {
        const result = await visit({ museumId, message, preferences, history });
        if (!timing) {
          assert.equal(result.answer.preferences.availableMinutes, sample ? 35 : 20);
          assert.equal(result.answer.preferences.walkingPreference, 'less_walking');
          assert.ok(result.answer.preferences.accessibilityRequirements.includes('step_free'));
          assert.deepEqual(result.answer.preferences.mustSeeArtworkIds, sample ? [] : preferences.mustSeeArtworkIds);
          assert.match(result.answer.reply, sample ? /[a-zA-Z]/u : /[\u3400-\u9fff]/u);
        }
        report.checks.push({ name, passed: true, ...result });
        console.log(`PASS ${name}: answer ${(result.answerMs / 1000).toFixed(2)}s; full route ${(result.routeMs / 1000).toFixed(2)}s.`);
        preferences = result.answer.preferences; history = [{ role: 'user', content: message }, { role: 'assistant', content: result.answer.reply }];
      } catch (error) { report.failures.push({ name, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
      finally { clearInterval(heartbeat); }
    }
  }
  report.passed = !report.failures.length && report.checks.length === (timing ? 2 : catalogues.size * 2);
} catch (error) { report.failures.push({ error: error.message }); }
finally {
  report.completedAt = new Date().toISOString();
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.failures, report: output }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
