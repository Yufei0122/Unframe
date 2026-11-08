// Acceptance checks against real model services and the running Node backend.
// Bundled catalogue assets and generated controls only; no visitor photos are read or saved.
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { catalogues } from '../server/ai/catalogues.js';
import { readAIConfig } from '../server/ai/config.js';
import { loopbackFetch } from '../server/ai/loopback-fetch.js';
import { createEmbeddingService, createEmbeddingStore, cosineSimilarity, referenceImageUrl } from '../server/ai/embeddings.js';
import { normalizeImage } from '../server/ai/images.js';
import { parseExplanation } from '../server/ai/ollama.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert.ok(args.every(arg => ['--only-chat', '--recognition-only'].includes(arg)) && args.length <= 1, 'Usage: node scripts/validate-local-ai.mjs [--only-chat | --recognition-only]');
const chatOnly = args.includes('--only-chat');
const recognitionOnly = args.includes('--recognition-only');
const config = readAIConfig();
const port = Number(process.env.PORT || 3000);
assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535, 'PORT must be a valid local port.');
const backend = `http://127.0.0.1:${port}`;
const initialReport = path.join(root, '.local-ai', 'validation.json');
const output = path.join(root, '.local-ai', chatOnly ? 'chat-validation.json' : recognitionOnly ? 'recognition-validation.json' : 'validation.json');
const report = {
  startedAt: new Date().toISOString(), completedAt: null, passed: false,
  scope: chatOnly ? 'chinese_chat_retest_only' : recognitionOnly ? 'catalogue_recognition_acceptance' : 'full_local_ai_acceptance',
  verification: chatOnly ? 'One real Node HTTP/Ollama Chinese chat request; no embedding, explanation or route requests repeated; no mocks' : recognitionOnly ? 'Real OpenCLIP embeddings and Node HTTP catalogue recognition; no mocks; no guide/chat inference' : 'real OpenCLIP embeddings and real Node HTTP/Ollama inference; no mocks',
  model: { embedding: config.embeddingModel, pretrained: config.embeddingPretrained, dimensions: config.dimension, guide: config.ollamaModel, planning: config.planningModel },
  backend, threshold: config.threshold, recognitionBudgetMs: config.recognitionBudgetMs, responseBudgetMs: config.responseBudgetMs,
  limitation: chatOnly ? 'Isolated Chinese chat retest. Initial embedding, recognition, explanation and route results remain in the unchanged initial report, including its first failed chat check. This retest does not repeat or replace those checks.' : 'Small, controlled sample of bundled references, mild transformations and six negative controls. Cosine similarity is neither probability nor accuracy. These results do not establish real visitor-camera accuracy or a general false-positive rate.',
  references: [], negatives: [], http: [], failures: [],
};
let captureHttpResponse;

async function save() {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, JSON.stringify(report, null, 2));
  await rename(temporary, output);
}

function fail(stage, error) {
  const message = error instanceof Error ? error.message : String(error);
  report.failures.push({ stage, code: error.code || 'VALIDATION_FAILED', message });
  console.error(`FAIL ${stage}: ${message}`);
}

async function checkHttp(name, action) {
  console.log(`HTTP ${name} (real inference can take several minutes on CPU).`);
  const started = performance.now();
  const heartbeat = setInterval(() => console.log(`Waiting ${name}: ${Math.round((performance.now() - started) / 1000)} seconds; planning requests have no automatic timeout.`), 15000);
  heartbeat.unref();
  const actualResponses = [];
  captureHttpResponse = response => actualResponses.push(response);
  try {
    const result = await action();
    report.http.push({ name, passed: true, elapsedMs: Math.round(performance.now() - started), ...result });
    console.log(`PASS ${name}`);
  } catch (error) {
    fail(name, error);
    report.http.push({ name, passed: false, elapsedMs: Math.round(performance.now() - started), error: error.message, actualResponses });
  } finally { clearInterval(heartbeat); captureHttpResponse = undefined; }
  await save();
}

async function httpJSON(endpoint, body, { form, expectedStatus = 200 } = {}) {
  const started = performance.now();
  const planning = endpoint.startsWith('routes/');
  const response = await (planning ? loopbackFetch : fetch)(`${backend}/api/ai/${endpoint}`, {
    method: body !== undefined || form ? 'POST' : 'GET',
    ...(form ? { body: form } : body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    ...(planning ? {} : { signal: AbortSignal.timeout(endpoint.startsWith('artworks/recognise') ? config.recognitionBudgetMs : endpoint === 'artworks/confirm' ? config.explanationTimeoutMs + 5000 : config.responseBudgetMs) }),
  });
  const result = await response.json();
  const responseMs = Math.round(performance.now() - started);
  // Capture before assertions so a language/semantic failure retains the actual
  // public-catalogue answer instead of only the assertion error.
  captureHttpResponse?.({ endpoint, status: response.status, responseMs, response: result });
  assert.equal(response.status, expectedStatus, `${endpoint}: HTTP ${response.status} ${result.code || ''} ${result.error || ''}`);
  if (endpoint.startsWith('artworks/recognise')) assert.ok(responseMs < config.recognitionBudgetMs, `${endpoint} took ${responseMs} ms; target is below ${config.recognitionBudgetMs} ms.`);
  return result;
}

async function recognise(museumId, bytes) {
  const form = new FormData();
  form.set('image', new Blob([await normalizeImage(bytes)], { type: 'image/jpeg' }), 'bundled-validation.jpg');
  return httpJSON(`artworks/recognise?museumId=${museumId}`, undefined, { form });
}

function rank(vector, records) {
  return records.map(record => ({ artworkId: record.artworkId, similarity: cosineSimilarity(vector, record.vector) }))
    .sort((a, b) => b.similarity - a.similarity || a.artworkId.localeCompare(b.artworkId));
}

async function variants(source) {
  const reference = await normalizeImage(source);
  const { width, height } = await sharp(reference).metadata();
  const left = Math.floor(width * 0.05), top = Math.floor(height * 0.05);
  return [
    ['reference', reference],
    ['resize_384px', await sharp(reference).resize({ width: 384, height: 384, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()],
    ['jpeg_quality_65', await sharp(reference).jpeg({ quality: 65 }).toBuffer()],
    ['center_crop_5pct_per_edge', await sharp(reference).extract({ left, top, width: width - 2 * left, height: height - 2 * top }).jpeg({ quality: 88 }).toBuffer()],
  ];
}

async function negativeControls() {
  const controls = [];
  for (const name of ['met-exterior.jpg', 'goma-exterior.jpg', 'qag-exterior.jpg']) {
    controls.push({ name, description: 'Bundled museum exterior photograph, not a catalogue artwork.', bytes: await readFile(path.join(root, 'mobile', 'assets', name)) });
  }
  controls.push({ name: 'synthetic_white', description: 'Uniform white 512 x 512 image.', bytes: await sharp({ create: { width: 512, height: 512, channels: 3, background: 'white' } }).jpeg().toBuffer() });
  const noise = Buffer.alloc(256 * 256 * 3);
  let state = 123456789;
  for (let index = 0; index < noise.length; index++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; noise[index] = state >>> 24; }
  controls.push({ name: 'synthetic_seeded_noise', description: 'Deterministic RGB noise; seed 123456789.', bytes: await sharp(noise, { raw: { width: 256, height: 256, channels: 3 } }).jpeg({ quality: 90 }).toBuffer() });
  const code = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#18212b"/><g fill="#c9e3f5" font-family="monospace" font-size="22"><text x="24" y="45">// local service example</text><text x="24" y="95">const port = 8001;</text><text x="24" y="145">function add(a, b) {</text><text x="44" y="185">return a + b;</text><text x="24" y="225">}</text><text x="24" y="290">console.log(add(2, 3));</text><text x="24" y="365">Ready on localhost</text></g></svg>';
  controls.push({ name: 'synthetic_code_screen', description: 'Generated code screenshot rasterized from SVG to JPEG; SVG uploads are not enabled.', bytes: await sharp(Buffer.from(code)).jpeg().toBuffer() });
  return controls;
}

function assertRoute(route, collection, graph, mustSee) {
  assert.equal(route.recommendationSource, 'ollama', `Route fell back: ${route.errorCode || route.warning || 'unknown'}`);
  assert.ok(!route.warning && !route.errorCode, 'Route has a provider warning.');
  assert.ok(Array.isArray(route.route) && route.route.length > 0, 'Route has no stops.');
  assert.ok(route.estimatedMinutes <= 30, 'Route exceeds the 30 minute limit.');
  const ids = route.route.map(stop => stop.artworkId);
  assert.equal(new Set(ids).size, ids.length, 'Route repeats a stop.');
  assert.ok(ids.includes(mustSee), 'Route omitted the must-see artwork.');
  assert.ok(ids.every(id => collection.some(artwork => artwork.id === id && artwork.accessible)), 'Route contains an inaccessible or foreign artwork.');
  assert.equal(route.navigation.length, ids.length);
  let totalSeconds = 0, totalDistance = 0, previous = 'entrance';
  for (const [index, leg] of route.navigation.entries()) {
    assert.equal(leg.from, previous);
    assert.equal(leg.to, ids[index]);
    assert.equal(leg.nodes[0], previous);
    assert.equal(leg.nodes.at(-1), ids[index]);
    let seconds = 0, distance = 0;
    for (let nodeIndex = 1; nodeIndex < leg.nodes.length; nodeIndex++) {
      const a = leg.nodes[nodeIndex - 1], b = leg.nodes[nodeIndex];
      const edge = graph.edges.find(edge => (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a));
      assert.ok(edge?.accessible, `Navigation traverses an inaccessible or nonexistent edge ${a} -> ${b}.`);
      seconds += edge.estimatedSeconds;
      distance += edge.distance;
    }
    assert.equal(leg.estimatedSeconds, seconds);
    assert.equal(leg.distance, distance);
    totalSeconds += seconds + collection.find(artwork => artwork.id === ids[index]).minutes * 60;
    totalDistance += distance;
    previous = ids[index];
  }
  assert.ok(totalSeconds <= 30 * 60, 'Recomputed walking plus visit time exceeds 30 minutes.');
  assert.equal(route.estimatedMinutes, Math.ceil(totalSeconds / 60));
  assert.equal(route.estimatedWalkingDistance, totalDistance);
}

try {
  if (chatOnly) {
    try {
      const previous = await readFile(output);
      const archive = path.join(root, '.local-ai', `chat-validation-${Date.now()}-${randomUUID()}.json`);
      await writeFile(archive, previous, { flag: 'wx' });
      report.previousChatAttempt = { file: archive, sha256: createHash('sha256').update(previous).digest('hex') };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const originalBytes = await readFile(initialReport);
    const original = JSON.parse(originalBytes);
    report.initialReport = {
      file: initialReport, sha256: createHash('sha256').update(originalBytes).digest('hex'),
      completedAt: original.completedAt, passed: original.passed, summary: original.summary,
      failures: original.failures, note: 'Initial full validation is preserved unchanged. This retest only addresses the Chinese chat check.',
    };
    assert.deepEqual(original.model, report.model, 'Initial full validation used a different model identity. Keep its results separate and rerun full validation.');
    assert.equal(original.threshold, report.threshold, 'Initial full validation used a different recognition threshold.');
    assert.equal(original.backend, report.backend, 'Initial full validation used a different backend address.');
    await save();
  } else {
  const embeddings = createEmbeddingService(config);
  const records = await createEmbeddingStore(config).load({ verifySources: true });
  for (const [museumId, { collection }] of catalogues) {
    const ownRecords = records.filter(record => record.museumId === museumId);
    for (const artwork of collection) {
      for (const [variant, image] of await variants(await readFile(referenceImageUrl(artwork)))) {
        const label = `${museumId}/${artwork.id}/${variant}`;
        try {
          console.log(`Embedding ${label}`);
          const vector = await embeddings.generate(await normalizeImage(image, 'image/jpeg'));
          const ranked = rank(vector, ownRecords);
          const expected = ranked.find(item => item.artworkId === artwork.id);
          const row = {
            museumId, artworkId: artwork.id, variant, expectedSimilarity: expected.similarity,
            topArtworkId: ranked[0].artworkId, maxSimilarity: ranked[0].similarity,
            top1Correct: ranked[0].artworkId === artwork.id, passesThreshold: ranked[0].similarity >= config.threshold,
            marginToSecond: ranked.length > 1 ? ranked[0].similarity - ranked[1].similarity : null,
          };
          row.passed = row.top1Correct && row.passesThreshold;
          report.references.push(row);
          console.log(`${row.passed ? 'PASS' : 'FAIL'} ${label}: expected=${expected.similarity.toFixed(4)}, top=${row.topArtworkId}, threshold=${config.threshold}`);
          if (!row.passed) fail(label, new Error('Expected artwork was not the leading candidate above threshold.'));
        } catch (error) { fail(label, error); }
      }
      await save();
    }
  }

  const controls = await negativeControls();
  for (const control of controls) {
    try {
      console.log(`Embedding negative control ${control.name}`);
      const vector = await embeddings.generate(await normalizeImage(control.bytes, 'image/jpeg'));
      const perMuseum = [...catalogues.keys()].map(museumId => {
        const top = rank(vector, records.filter(record => record.museumId === museumId))[0];
        return { museumId, topArtworkId: top.artworkId, maxSimilarity: top.similarity, passesThreshold: top.similarity >= config.threshold };
      });
      const row = { name: control.name, description: control.description, passed: perMuseum.every(result => !result.passesThreshold), museums: perMuseum };
      report.negatives.push(row);
      console.log(`${row.passed ? 'PASS' : 'FAIL'} negative ${control.name}: ${perMuseum.map(item => `${item.museumId}=${item.maxSimilarity.toFixed(4)}`).join(', ')}`);
      if (!row.passed) fail(`negative/${control.name}`, new Error('A negative control passed the artwork threshold.'));
    } catch (error) { fail(`negative/${control.name}`, error); }
    await save();
  }

  for (const [museumId, { collection, graph }] of catalogues) {
    const artwork = collection.find(artwork => artwork.accessible);
    const foreignMuseum = [...catalogues.keys()].find(id => id !== museumId);
    const foreignArtwork = catalogues.get(foreignMuseum).collection[0];
    await checkHttp(`${museumId}/local_provider_and_catalogue`, async () => {
      const status = await httpJSON(`status?museumId=${museumId}`);
      assert.equal(status.configuration?.provider, 'local');
      assert.equal(status.configuration.embeddingModel, config.embeddingModel);
      assert.equal(status.configuration.embeddingPretrained, config.embeddingPretrained);
      assert.equal(status.configuration.ollamaModel, config.ollamaModel);
      assert.equal(recognitionOnly ? status.recognitionReady : status.ready, true, status.message);
      const catalogue = await httpJSON(`catalogue?museumId=${museumId}`);
      assert.deepEqual(catalogue.artworks.map(item => item.id), collection.map(item => item.id));
      return { museumId, configuration: status.configuration, catalogueArtworkIds: catalogue.artworks.map(item => item.id) };
    });
    await checkHttp(`${museumId}/reference_recognition`, async () => {
      const result = await recognise(museumId, await readFile(referenceImageUrl(artwork)));
      assert.equal(result.matched, true);
      assert.equal(result.candidates[0]?.artwork.id, artwork.id);
      assert.equal(result.requiresConfirmation, true);
      assert.ok(result.candidates.every(candidate => collection.some(item => item.id === candidate.artwork.id)));
      return { museumId, artworkId: artwork.id, similarity: result.candidates[0].similarity, requiresConfirmation: true };
    });
    await checkHttp(`${museumId}/foreign_reference_and_confirmation_rejected`, async () => {
      const result = await recognise(museumId, await readFile(referenceImageUrl(foreignArtwork)));
      assert.equal(result.matched, false, 'A foreign museum reference passed the matching threshold.');
      assert.deepEqual(result.candidates, []);
      const rejected = await httpJSON('artworks/confirm', { museumId, artworkId: foreignArtwork.id }, { expectedStatus: 400 });
      return { museumId, foreignArtworkId: foreignArtwork.id, matched: false, invalidConfirmationCode: rejected.code };
    });
    await checkHttp(`${museumId}/unrelated_image_rejected`, async () => {
      const image = controls.find(control => control.name === (museumId === 'qut' ? 'met-exterior.jpg' : `${museumId}-exterior.jpg`));
      const result = await recognise(museumId, image.bytes);
      assert.equal(result.matched, false, 'A museum exterior was unconditionally matched.');
      assert.deepEqual(result.candidates, []);
      return { museumId, sample: image.name, matched: false };
    });
    if (recognitionOnly) continue;
    await checkHttp(`${museumId}/real_ollama_confirmation`, async () => {
      const result = await httpJSON('artworks/confirm', { museumId, artworkId: artwork.id, visitorPreferences: ['Colour'] });
      assert.ok(!result.warning && !result.errorCode, `Explanation fell back: ${result.errorCode || result.warning}`);
      for (const field of ['id', 'title', 'artist', 'year']) assert.equal(result.artwork[field], artwork[field]);
      parseExplanation(result.aiExplanation, collection.filter(item => item.id !== artwork.id).map(item => item.id));
      return { museumId, provider: 'ollama', model: config.ollamaModel, artwork: { id: artwork.id, title: artwork.title, artist: artwork.artist, year: artwork.year }, explanation: result.aiExplanation, interpretationLabel: result.interpretationLabel };
    });
    await checkHttp(`${museumId}/real_ollama_accessible_route`, async () => {
      const preferences = { museumId, interests: ['Colour'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'], mustSeeArtworkIds: [artwork.id] };
      const result = await httpJSON('routes/plan', preferences);
      assertRoute(result, collection, graph, artwork.id);
      return { museumId, preferences, result };
    });
  }

  }
  if (!recognitionOnly) {
  const museumId = 'goma';
  const artwork = catalogues.get(museumId).collection.find(artwork => artwork.accessible);
  await checkHttp('goma/real_chinese_planning_chat', async () => {
    const preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [artwork.id] };
    const message = '我想看色彩丰富的作品，只有20分钟，需要无障碍路线，尽量少走路，请保留我已经选好的必看作品。';
    const result = await httpJSON('routes/chat', { museumId, message, preferences, history: [] });
    assert.ok(typeof result.reply === 'string' && /[\u3400-\u9fff]/u.test(result.reply), 'Expected a Chinese reply.');
    assert.equal(result.preferences.availableMinutes, 20);
    assert.equal(result.preferences.walkingPreference, 'less_walking');
    assert.equal(result.preferences.currentLocation, 'entrance');
    assert.ok(result.preferences.accessibilityRequirements.some(value => ['step_free', 'wheelchair'].includes(value)));
    assert.ok(result.preferences.mustSeeArtworkIds.includes(artwork.id));
    assert.ok(result.preferences.mustSeeArtworkIds.every(id => catalogues.get(museumId).collection.some(item => item.id === id)));
    assert.ok(result.preferences.interests.some(value => /colour|color|色彩|颜色/i.test(value)), 'Colour interest was not captured.');
    return { museumId, provider: 'ollama', model: config.planningModel, message, result };
  });
  }
} catch (error) { fail('validation_setup_or_execution', error); }
finally {
  const positives = report.references.map(row => row.expectedSimilarity);
  const negatives = report.negatives.flatMap(row => row.museums.map(item => item.maxSimilarity));
  report.summary = {
    referenceAndVariantSamples: report.references.length,
    referenceAndVariantChecksPassed: report.references.filter(row => row.passed).length,
    negativeImages: report.negatives.length,
    negativeImagesRejectedInAllMuseums: report.negatives.filter(row => row.passed).length,
    minExpectedArtworkSimilarity: positives.length ? Math.min(...positives) : null,
    maxNegativeSimilarity: negatives.length ? Math.max(...negatives) : null,
    httpChecks: report.http.length, httpChecksPassed: report.http.filter(row => row.passed).length,
    failureCount: report.failures.length,
  };
  report.passed = report.failures.length === 0 && (chatOnly
    ? report.http.length === 1
    : report.references.length === [...catalogues.values()].reduce((count, { collection }) => count + collection.length * 4, 0)
      && report.negatives.length === 6 && report.http.length === (recognitionOnly ? catalogues.size * 4 : catalogues.size * 6 + 1));
  report.completedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ passed: report.passed, ...report.summary, report: output, note: report.limitation }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
