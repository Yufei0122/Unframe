// Standalone acceptance against the running local backend. No image models or mocks.
import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAIConfig } from '../server/ai/config.js';
import { catalogues } from '../server/ai/catalogues.js';
import { planningVersion } from '../server/ai/planning-status.js';
import { validateRouteInput } from '../server/ai/routes.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export function assertAIRoute(route, preferences, collection, graph) {
  assert.equal(route.recommendationSource, 'ollama', `AI did not run successfully: ${route.errorCode || route.warning || 'local fallback'}`);
  assert.ok(!route.warning && !route.errorCode, 'The route contains a model warning.');
  assert.ok(Array.isArray(route.route) && route.route.length > 0 && route.route.length <= 8, 'No valid route stops.');
  assert.equal(route.navigation?.length, route.route.length, 'Navigation does not cover all stops.');
  assert.ok(typeof route.reasoningSummary === 'string' && route.reasoningSummary.trim(), 'No AI recommendation explanation.');
  const ids = route.route.map(stop => stop.artworkId);
  assert.equal(new Set(ids).size, ids.length, 'The route repeats a work.');
  assert.ok(preferences.mustSeeArtworkIds.every(id => ids.includes(id)), 'A must-see work is missing.');
  let from = preferences.currentLocation, seconds = 0, distance = 0;
  for (const [index, stop] of route.route.entries()) {
    const artwork = collection.find(item => item.id === stop.artworkId);
    assert.ok(artwork, 'A stop does not belong to this museum.');
    if (preferences.accessibilityRequirements.length) assert.ok(artwork.accessible, 'A stop is not accessible.');
    assert.equal(stop.order, index + 1);
    assert.equal(stop.title, artwork.title);
    assert.equal(stop.estimatedVisitMinutes, artwork.minutes);
    const leg = route.navigation[index];
    assert.equal(leg.from, from); assert.equal(leg.to, artwork.id);
    assert.ok(Array.isArray(leg.nodes) && leg.nodes.length > 0 && leg.nodes.every(id => graph.nodes.some(node => node.id === id)), 'Invalid map nodes.');
    assert.equal(leg.nodes[0], from); assert.equal(leg.nodes.at(-1), artwork.id);
    let legSeconds = 0, legDistance = 0;
    for (let i = 1; i < leg.nodes.length; i++) {
      const a = leg.nodes[i - 1], b = leg.nodes[i];
      const edge = graph.edges.find(item => (item.from === a && item.to === b) || (item.from === b && item.to === a));
      assert.ok(edge, 'The route traverses a nonexistent map edge.');
      if (preferences.accessibilityRequirements.length) assert.ok(edge.accessible, 'The route traverses stairs/inaccessible edges.');
      legSeconds += edge.estimatedSeconds; legDistance += edge.distance;
    }
    assert.equal(leg.estimatedSeconds, legSeconds); assert.equal(leg.distance, legDistance);
    seconds += legSeconds + artwork.minutes * 60; distance += legDistance; from = artwork.id;
  }
  assert.ok(seconds <= preferences.availableMinutes * 60, 'Walking plus visit time exceeds the budget.');
  assert.equal(route.estimatedMinutes, Math.ceil(seconds / 60));
  assert.equal(route.estimatedWalkingDistance, distance);
  return { stops: ids.length, verifiedSeconds: seconds, verifiedWalkingDistance: distance };
}

export async function runRouteAcceptance({ config = readAIConfig(), backend, outputRoot = path.join(root, '.local-ai'), fetchImpl = fetch, log = console.log } = {}) {
  const port = Number(process.env.PORT || 3000);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'PORT must be 1–65535.');
  const address = new URL(backend || `http://127.0.0.1:${port}`);
  assert.ok(address.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)
    && !address.username && !address.password && address.pathname === '/' && !address.search && !address.hash, 'Use a local backend origin.');
  const reportFile = path.join(outputRoot, 'acceptance', `routes-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`);
  const report = { startedAt: new Date().toISOString(), completedAt: null, passed: false, scope: 'local_qwen_route_acceptance',
    backend: address.origin, configuredModel: config.ollamaModel, model: null,
    limitation: 'Controlled requests to both demo museum graphs. A passing report requires local Qwen recommendations without fallback; it does not establish real museum navigation accuracy. No image model or training is involved.',
    checks: [], failures: [] };
  async function save() {
    await mkdir(path.dirname(reportFile), { recursive: true });
    await writeFile(`${reportFile}.tmp`, JSON.stringify(report, null, 2));
    await rename(`${reportFile}.tmp`, reportFile);
  }
  async function check(name, action) {
    const row = { name, passed: false }; report.checks.push(row);
    const start = performance.now(); log(`Checking ${name}. Qwen CPU inference may take several minutes.`);
    const heartbeat = setInterval(() => log(`Waiting ${name}: ${Math.round((performance.now() - start) / 1000)} seconds.`), 15000); heartbeat.unref();
    try { await action(row); row.passed = true; log(`PASS ${name}`); }
    catch (error) { row.error = error.message; report.failures.push({ name, message: error.message }); log(`FAIL ${name}: ${error.message}`); }
    finally { clearInterval(heartbeat); row.elapsedMs = Math.round(performance.now() - start); await save(); }
    return row.passed;
  }
  async function request(row, endpoint, body, expectedStatus = 200) {
    let response;
    try {
      response = await fetchImpl(`${address.origin}${endpoint}`, { method: body ? 'POST' : 'GET',
        headers: { Origin: 'http://localhost:8081', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body ? config.timeoutMs + 30000 : 15000) });
    } catch (error) { throw new Error(`Cannot reach ${address.origin}${endpoint} (${error.cause?.code || error.name}). Start npm.cmd run ai:routes and check PORT.`); }
    let result;
    try { result = await response.json(); } catch { throw new Error(`HTTP ${response.status} did not return JSON. Restart the updated backend.`); }
    row.httpStatus = response.status; row.actual = result;
    assert.equal(response.status, expectedStatus, `${endpoint}: HTTP ${response.status} ${result.code || ''} ${result.error || ''}`);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081', 'The browser cannot access this backend.');
    return result;
  }
  await save();
  const ready = await check('planning_model_and_browser_origin', async row => {
    const status = await request(row, '/api/ai/planning/status');
    report.model = status.model;
    assert.equal(status.configuration?.provider, 'local');
    assert.equal(status.configuration?.ollamaModel, config.ollamaModel);
    assert.equal(status.configuration?.planningVersion, planningVersion, 'Stop the old backend and restart the updated one.');
    assert.equal(status.ready, true, status.message);
  });
  if (ready) for (const [museumId, { collection, graph }] of catalogues) {
    const mustSee = collection.find(artwork => artwork.accessible).id;
    const preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [mustSee] };
    await check(`${museumId}/qwen_route_30_minutes`, async row => {
      row.preferences = preferences;
      const route = await request(row, '/api/ai/routes/plan', { museumId, ...preferences, requireAI: true });
      row.verified = assertAIRoute(route, preferences, collection, graph);
    });
    let updated;
    await check(`${museumId}/chinese_planning_chat`, async row => {
      const message = '我想看色彩丰富的作品，只有20分钟，需要无障碍路线，尽量少走路，请保留我已经选好的必看作品。';
      row.message = message;
      const reply = await request(row, '/api/ai/routes/chat', { museumId, preferences, history: [], message });
      assert.ok(typeof reply.reply === 'string' && /[\u3400-\u9fff]/u.test(reply.reply), 'Expected a Chinese reply.');
      const next = validateRouteInput(reply.preferences, collection, graph);
      assert.equal(next.availableMinutes, 20, 'The chat did not apply the requested time.');
      assert.equal(next.walkingPreference, 'less_walking');
      assert.equal(next.currentLocation, preferences.currentLocation);
      assert.ok(next.accessibilityRequirements.includes('step_free') || next.accessibilityRequirements.includes('wheelchair'));
      assert.ok(next.interests.some(value => /colour|color|色彩|颜色/i.test(value)));
      assert.ok(next.mustSeeArtworkIds.includes(mustSee), 'The chat dropped the existing must-see artwork.');
      updated = next;
    });
    await check(`${museumId}/qwen_accessible_route_after_chat`, async row => {
      assert.ok(updated, 'The preceding chat failed; its route cannot be accepted.');
      row.preferences = updated;
      const route = await request(row, '/api/ai/routes/plan', { museumId, ...updated, requireAI: true });
      row.verified = assertAIRoute(route, updated, collection, graph);
    });
    await check(`${museumId}/impossible_time_rejected`, async row => {
      const result = await request(row, '/api/ai/routes/plan', { museumId, ...preferences, availableMinutes: 1, requireAI: true }, 422);
      assert.equal(result.code, 'NO_ROUTE');
    });
    await check(`${museumId}/foreign_artwork_rejected`, async row => {
      const other = [...catalogues].find(([id]) => id !== museumId)[1].collection[0].id;
      const result = await request(row, '/api/ai/routes/plan', { museumId, ...preferences, mustSeeArtworkIds: [other], requireAI: true }, 400);
      assert.equal(result.code, 'INVALID_INPUT');
    });
  }
  report.completedAt = new Date().toISOString();
  report.passed = ready && report.failures.length === 0 && report.checks.length === 1 + catalogues.size * 5;
  report.summary = { checks: report.checks.length, checksPassed: report.checks.filter(row => row.passed).length,
    qwenRoutesPassed: report.checks.filter(row => row.passed && row.verified).length,
    chineseChatsPassed: report.checks.filter(row => row.passed && row.name.endsWith('/chinese_planning_chat')).length };
  await save(); log(JSON.stringify({ passed: report.passed, ...report.summary, report: reportFile, limitation: report.limitation }, null, 2));
  return { report, reportFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2, 'Usage: npm.cmd run ai:validate:routes');
    const { report } = await runRouteAcceptance();
    if (!report.passed) process.exitCode = 1;
  } catch (error) { console.error(`Route acceptance failed: ${error.message}`); process.exitCode = 1; }
}
