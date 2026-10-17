import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import collection from '../shared/met-collection.json' with { type: 'json' };
import graph from '../shared/met-graph.json' with { type: 'json' };
import gomaCollection from '../shared/goma-collection.json' with { type: 'json' };
import gomaGraph from '../shared/goma-graph.json' with { type: 'json' };
import { readAIConfig, AIError } from '../server/ai/config.js';
import { createLocalClient } from '../server/ai/local-http.js';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createEmbeddingService, createEmbeddingStore, cosineSimilarity, referenceArtworks, referenceImageUrl, sha256 } from '../server/ai/embeddings.js';
import { parseExplanation, parseRecommendations, assembleGroundedExplanation, createOllamaService } from '../server/ai/ollama.js';
import { createRecognitionService } from '../server/ai/recognition.js';
import { createRouteService } from '../server/ai/routes.js';
import { createPlanningChatService } from '../server/ai/chat.js';
import { shortestPath } from '../server/ai/graph.js';
import { normalizeImage, MAX_IMAGE_BYTES } from '../server/ai/images.js';
import { createAIHandler } from '../server/ai/handler.js';
import { getAIStatus } from '../server/ai/status.js';
import { assertModelRoute } from '../scripts/route-acceptance.mjs';

const config = readAIConfig({});
const vector = (position = 0) => Array.from({ length: 512 }, (_, i) => i === position ? 1 : 0);
const explanation = { summary: 'Observe colour and reflections.', historicalContext: 'Not available in the supplied notes.', interestingFacts: ['The medium is oil on canvas.'], whyItMatters: 'An interpretation of the water garden.', suggestedNextArtwork: null };
const explanationSelection = { summaryNoteId: 'summary-0', factIds: ['artist', 'year', 'medium'], interpretationNoteId: 'interpretation-0', suggestedNextArtwork: null };
const groundedExplanation = assembleGroundedExplanation(explanationSelection, collection[0], collection.slice(1).map(a => a.id));
const recommendation = { recommendedArtworkIds: collection.map(a => a.id), reasoningSummary: 'A visit connecting nature and movement.' };
const ollama = { generateArtworkExplanation: async () => explanation, generateRouteRecommendations: async () => recommendation };
const unavailable = async () => { throw new AIError(503, 'MOCK_UNAVAILABLE', 'Unavailable'); };
const store = { load: async () => [{ artworkId: collection[0].id, vector: vector() }] };
const jsonCandidate = value => ({ done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(value) } });
const identity = { model: 'ViT-B-32', pretrained: 'laion2b_s34b_b79k', dimensions: 512, normalized: true };
let image;
before(async () => { image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#667C86' } }).jpeg().toBuffer(); });

test('configuration is local, model identity is fixed and CPU inference is configurable', () => {
  assert.throws(() => readAIConfig({ ARTWORK_MATCH_THRESHOLD: 'bad' }));
  assert.equal(config.ollamaModel, 'qwen3:1.7b'); assert.equal(config.planningModel, 'qwen3:1.7b'); assert.equal(config.dimension, 512);
  assert.equal(config.embeddingModel, 'ViT-B-32'); assert.equal(config.embeddingPretrained, 'laion2b_s34b_b79k');
  assert.equal(config.timeoutMs, 14000); assert.equal(config.responseBudgetMs, 15000); assert.equal(config.recognitionBudgetMs, 5000); assert.equal(config.clipTimeoutMs, 4500); assert.equal(config.ollamaNumGpu, -1);
  assert.equal(readAIConfig({ OLLAMA_TIMEOUT_MS: '600000' }).timeoutMs, 600000);
  assert.throws(() => readAIConfig({ OPENCLIP_URL: 'https://external.example' }));
  assert.throws(() => readAIConfig({ OLLAMA_MODEL: 'qwen3:cloud' }));
  assert.throws(() => readAIConfig({ OLLAMA_PLANNING_MODEL: 'qwen3:cloud' }));
  assert.throws(() => readAIConfig({ OLLAMA_NUM_CTX: 'abc' }));
});
test('OpenCLIP service sends normalized bytes and validates model, dimensions and normalization', async () => {
  const service = createEmbeddingService(config, { request: async (endpoint, body) => {
    assert.equal(endpoint, '/embed'); assert.equal(body.imageBase64, image.toString('base64')); assert.equal(body.mimeType, 'image/jpeg');
    return { ...identity, embedding: vector() };
  } });
  assert.deepEqual(await service.generate(image), vector());
  for (const embedding of [[NaN], Array(512).fill(0), vector().map(n => n * 2), Array(1408).fill(0.1)]) {
    await assert.rejects(createEmbeddingService(config, { request: async () => ({ ...identity, embedding }) }).generate(image), { code: 'INVALID_VECTOR' });
  }
  await assert.rejects(createEmbeddingService(config, { request: async () => ({ ...identity, pretrained: 'wrong', embedding: vector() }) }).generate(image), { code: 'OPENCLIP_MODEL_MISMATCH' });
});
test('cosine similarity handles identical, orthogonal and invalid vectors', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2], [2, 4]) - 1) < 1e-12);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.throws(() => cosineSimilarity([0, 0], [1, 1]));
  assert.throws(() => cosineSimilarity([1], [1, 2]));
});
test('recognition returns catalogue candidates without confirming or generating explanations', async () => {
  const service = createRecognitionService({ config, collection, store, embeddings: { generate: async () => vector() }, ollama: { generateArtworkExplanation: () => assert.fail('scanning must not generate explanations') } });
  const result = await service.recognise(image);
  assert.equal(result.matched, true); assert.equal(result.artwork.artist, 'Claude Monet'); assert.equal(result.aiExplanation, null);
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.candidates, [{ artwork: collection[0], similarity: 1 }]);
});

test('recognition filters weak and other-museum matches, ranks unique candidates, and caps the shortlist', async () => {
  const scoreVector = score => [score, Math.sqrt(1 - score ** 2), ...Array(510).fill(0)];
  const records = collection.map((artwork, i) => ({ artworkId: artwork.id, vector: scoreVector(i === 0 ? 0.79 : 0.85 + i * 0.01) }));
  records.push({ artworkId: collection[1].id, vector: vector() }, { artworkId: 'goma-heritage', vector: vector() });
  const result = await createRecognitionService({ config, collection, store: { load: async () => records }, embeddings: { generate: async () => vector() }, ollama: { generateArtworkExplanation: () => assert.fail('must not explain') } }).recognise(image);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0].artwork.id, collection[1].id);
  assert.equal(new Set(result.candidates.map(c => c.artwork.id)).size, 3);
  assert.ok(result.candidates.every((candidate, i) => candidate.similarity >= config.threshold && collection.some(a => a.id === candidate.artwork.id) && (i === 0 || candidate.similarity <= result.candidates[i - 1].similarity)));
  assert.ok(!result.candidates.some(c => c.artwork.id === collection[0].id));
});

test('confirmation explains only a selected museum artwork and preserves metadata when Qwen fails', async () => {
  let calls = 0;
  const service = createRecognitionService({ config, collection, store, ollama: { generateArtworkExplanation: async (artwork, preferences) => {
    calls++; assert.equal(artwork, collection[0]); assert.deepEqual(preferences, ['Nature']); return explanation;
  } } });
  for (const input of [null, [], { artworkId: 'goma-heritage' }, { artworkId: collection[0].id, visitorPreferences: 'Nature' }, { artworkId: collection[0].id, visitorPreferences: null }, { artworkId: collection[0].id, visitorPreferences: Array(11).fill('Nature') }]) await assert.rejects(service.confirm(input), { status: 400 });
  assert.equal(calls, 0);
  const result = await service.confirm({ artworkId: collection[0].id, visitorPreferences: ['Nature'] });
  assert.equal(calls, 1); assert.deepEqual(result.aiExplanation, explanation); assert.equal(result.artwork, collection[0]);
  assert.match(result.interpretationLabel, /not museum-approved/);
  const fallback = await createRecognitionService({ config, collection, store, ollama: { generateArtworkExplanation: unavailable } }).confirm({ artworkId: collection[0].id });
  assert.equal(fallback.artwork, collection[0]); assert.equal(fallback.aiExplanation, null); assert.ok(fallback.warning);
});
test('low similarity does not force a match or call Qwen', async () => {
  const service = createRecognitionService({ config, collection, store, embeddings: { generate: async () => vector(1) }, ollama: { generateArtworkExplanation: () => assert.fail('must not explain unknown artwork') } });
  const result = await service.recognise(image);
  assert.equal(result.matched, false); assert.deepEqual(result.candidates, []); assert.equal(result.artwork, undefined);
});
test('empty collection and index fail without embedding calls', async () => {
  const dependencies = { config, collection, store, embeddings: { generate: () => assert.fail('must not embed') }, ollama };
  await assert.rejects(createRecognitionService({ ...dependencies, collection: [] }).recognise(image), { code: 'EMPTY_COLLECTION' });
  await assert.rejects(createRecognitionService({ ...dependencies, store: { load: async () => [] } }).recognise(image), { code: 'EMPTY_INDEX' });
});
test('Qwen JSON validation rejects invented IDs, wrong types and excessive text', () => {
  assert.deepEqual(parseExplanation(explanation, []), explanation);
  assert.throws(() => parseExplanation({ ...explanation, suggestedNextArtwork: 'invented' }, []));
  assert.throws(() => parseExplanation({ ...explanation, interestingFacts: 'fact' }, []));
  assert.deepEqual(parseRecommendations(recommendation, collection.map(a => a.id)), recommendation);
  assert.throws(() => parseRecommendations({ ...recommendation, recommendedArtworkIds: ['invented'] }, []));
  assert.throws(() => parseRecommendations({ ...recommendation, recommendedArtworkIds: [collection[0].id, collection[0].id] }, collection.map(a => a.id)));
});
test('Qwen uses local metadata, think:false and JSON schema; rejects truncated, invalid and concurrent output', async () => {
  let payload;
  const client = createOllamaService(config, { request: async (endpoint, body) => { assert.equal(endpoint, '/api/chat'); payload = body; return jsonCandidate(body.format.properties.recommendedArtworkIds ? recommendation : explanationSelection); } });
  await client.generateArtworkExplanation(collection[0], ['Nature'], collection);
  assert.equal(payload.model, 'qwen3:1.7b');
  assert.equal(payload.think, false); assert.equal(payload.stream, false); assert.equal(payload.format.type, 'object');
  assert.equal(payload.options.num_gpu, -1); assert.equal(payload.options.num_ctx, 2048);
  assert.equal(payload.options.num_predict, 256); assert.equal(payload.keep_alive, '10m'); assert.match(payload.messages[1].content, /Claude Monet/);
  assert.ok(!payload.messages[1].content.includes('goma-'));
  await client.generateRouteRecommendations({ interests: ['Nature'], mustSeeArtworkIds: [] }, collection);
  assert.equal(payload.model, 'qwen3:1.7b'); assert.equal(payload.options.num_predict, 1024); assert.equal(payload.options.num_ctx, 4096);
  await assert.rejects(createOllamaService(config, { request: async () => ({ done: true, done_reason: 'length' }) }).generateArtworkExplanation(collection[0], [], collection), { code: 'OLLAMA_INCOMPLETE' });
  await assert.rejects(createOllamaService(config, { request: async () => ({ done: true, done_reason: 'stop', message: { content: 'not json' } }) }).generateArtworkExplanation(collection[0], [], collection), { code: 'OLLAMA_JSON' });
  let finish;
  const busy = createOllamaService(config, { request: () => new Promise(resolve => { finish = resolve; }) });
  const first = busy.generateArtworkExplanation(collection[0], [], collection);
  await assert.rejects(busy.generateArtworkExplanation(collection[0], [], collection), { code: 'OLLAMA_BUSY' });
  finish(jsonCandidate(explanationSelection)); await first;
});
test('grounded explanation maps only server-owned facts and rejects hallucinated prose or IDs', async () => {
  assert.deepEqual(groundedExplanation.interestingFacts, [`Artist: ${collection[0].artist}`, `Catalogue date: ${collection[0].year}`, `Medium: ${collection[0].medium}`]);
  assert.ok(collection[0].description.includes(groundedExplanation.summary.replace('Catalogue note: ', '')));
  assert.ok(collection[0].detail.includes(groundedExplanation.whyItMatters.replace('Interpretation from collection notes: ', '')));
  assert.match(groundedExplanation.historicalContext, /not available/);
  for (const selection of [
    { ...explanationSelection, summaryNoteId: "Monet's final series" },
    { ...explanationSelection, factIds: ['invented-biography'] },
    { ...explanationSelection, factIds: ['artist', 'artist'] },
    { ...explanationSelection, interpretationNoteId: 'mastery' },
    { ...explanationSelection, inventedHistory: 'painted in 1900' },
    { ...explanationSelection, suggestedNextArtwork: 'goma-heritage' },
    explanation,
  ]) {
    await assert.rejects(createOllamaService(config, { request: async () => jsonCandidate(selection) }).generateArtworkExplanation(collection[0], [], collection), { code: 'INVALID_EXPLANATION' });
  }
});
test('Dijkstra chooses the shortest path and excludes inaccessible edges', () => {
  const sample = { nodes: ['a', 'b', 'c', 'island'].map(id => ({ id })), edges: [{ from: 'a', to: 'c', distance: 30, estimatedSeconds: 40, accessible: true }, { from: 'a', to: 'b', distance: 5, estimatedSeconds: 6, accessible: false }, { from: 'b', to: 'c', distance: 5, estimatedSeconds: 6, accessible: true }] };
  assert.deepEqual(shortestPath(sample, 'a', 'c').nodes, ['a', 'b', 'c']);
  assert.equal(shortestPath(sample, 'a', 'c', { stepFree: true }).distance, 30);
  assert.equal(shortestPath(sample, 'a', 'island'), null);
  assert.equal(shortestPath(sample, 'unknown', 'c'), null);
});
test('route respects time, must-see, starting point and returns deterministic navigation', async () => {
  const result = await createRouteService({ ollama, collection, graph }).plan({ availableMinutes: 8, currentLocation: 'water-lilies', mustSeeArtworkIds: ['the-dancing-class'], walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'] });
  assert.ok(result.estimatedMinutes <= 8); assert.ok(result.route.some(s => s.artworkId === 'the-dancing-class'));
  assert.equal(result.navigation[0].from, 'water-lilies');
  assert.equal(result.estimatedWalkingDistance, result.navigation.reduce((sum, n) => sum + n.distance, 0));
  assert.equal(result.demo, true);
});
test('route fallback reuses local recommendations when Qwen fails', async () => {
  const result = await createRouteService({ ollama: { generateRouteRecommendations: unavailable }, collection, graph }).plan({});
  assert.equal(result.recommendationSource, 'local'); assert.ok(result.warning); assert.ok(result.route.length);
});
test('impossible budgets, disconnected graphs and invalid IDs are rejected', async () => {
  const service = createRouteService({ ollama, collection, graph });
  await assert.rejects(service.plan({ availableMinutes: 1 }), { code: 'NO_ROUTE' });
  await assert.rejects(service.plan({ availableMinutes: 5, mustSeeArtworkIds: collection.map(a => a.id) }), { code: 'NO_ROUTE' });
  await assert.rejects(service.plan({ mustSeeArtworkIds: ['invented'] }), { status: 400 });
  await assert.rejects(service.plan({ accessibilityRequirements: ['flying'] }), { status: 400 });
  await assert.rejects(service.plan(null), { status: 400 });
  await assert.rejects(createRouteService({ ollama, collection, graph: { ...graph, edges: [] } }).plan({}), { code: 'NO_ROUTE' });
});
test('image validation checks MIME, signature, actual decoding, bytes and WebP conversion', async () => {
  assert.ok((await normalizeImage(image, 'image/jpeg')).length);
  await assert.rejects(normalizeImage(image, 'image/png'), { status: 415 });
  await assert.rejects(normalizeImage(Buffer.from([255,216,255,0]), 'image/jpeg'), { status: 400 });
  await assert.rejects(normalizeImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/jpeg'), { status: 413 });
  const webp = await sharp(image).webp().toBuffer();
  assert.equal((await sharp(await normalizeImage(webp, 'image/webp')).metadata()).format, 'jpeg');
  const tagged = await sharp(image).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.ok((await sharp(tagged).metadata()).exif);
  const stripped = await sharp(await normalizeImage(tagged, 'image/jpeg')).metadata();
  assert.equal(stripped.exif, undefined); assert.equal(stripped.orientation, undefined);
});
test('local transport sanitizes failures, rejects redirects, and enforces CPU timeout', async () => {
  const c = { ...config, timeoutMs: 20 };
  const good = createLocalClient(c, 'OLLAMA', { fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined); return new Response('{}');
  } });
  await good.request('/api/chat', {});
  await assert.rejects(createLocalClient(c, 'OLLAMA', { fetchImpl: async () => new Response('secret-details', { status: 500 }) }).request('/api/chat', {}), error => error.code === 'OLLAMA_HTTP_500' && !error.message.includes('secret'));
  await assert.rejects(createLocalClient(c, 'OLLAMA', { fetchImpl: () => new Promise(() => {}) }).request('/api/chat', {}), { code: 'OLLAMA_TIMEOUT' });
  await assert.rejects(createLocalClient(c, 'OLLAMA', { fetchImpl: async () => new Response('{}', { status: 404 }) }).request('/api/chat', {}), { code: 'OLLAMA_MODEL_MISSING' });
});

test('index rejects legacy vectors, wrong weights, missing works, non-normalization and changed source hashes without overwriting', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unframe-ai-index-'));
  const embeddingsFile = path.join(directory, 'index.json');
  const index = createEmbeddingStore({ ...config, embeddingsFile });
  try {
    const records = await Promise.all(referenceArtworks().map(async ({ museumId, artwork }) => ({ museumId, artworkId: artwork.id, imageHash: 'a'.repeat(64), sourceHash: sha256(await readFile(referenceImageUrl(artwork))), vector: vector() })));
    await writeFile(embeddingsFile, JSON.stringify({ version: 1, model: 'multimodalembedding@001', dimension: 1408, records: [] }));
    await assert.rejects(index.load(), { code: 'INDEX_INCOMPATIBLE' });
    const legacy = await readFile(embeddingsFile, 'utf8');
    await assert.rejects(index.save(records.slice(1)), { code: 'INDEX_INCOMPATIBLE' });
    assert.equal(await readFile(embeddingsFile, 'utf8'), legacy);
    await index.save(records);
    assert.equal((await index.load({ verifySources: true })).length, records.length);
    const original = await readFile(embeddingsFile, 'utf8');
    await assert.rejects(index.save(records.slice(1)), { code: 'INDEX_INCOMPATIBLE' });
    await assert.rejects(index.save(records.map((record, i) => i ? record : { ...record, vector: vector().map(v => v * 2) })), { code: 'INDEX_INCOMPATIBLE' });
    assert.equal(await readFile(embeddingsFile, 'utf8'), original);
    const wrongWeights = JSON.parse(original); wrongWeights.pretrained = 'wrong';
    await writeFile(embeddingsFile, JSON.stringify(wrongWeights)); await assert.rejects(index.load(), { code: 'INDEX_INCOMPATIBLE' });
    const wrongCatalogue = JSON.parse(original); wrongCatalogue.catalogueHash = 'c'.repeat(64);
    await writeFile(embeddingsFile, JSON.stringify(wrongCatalogue)); await assert.rejects(index.load(), { code: 'INDEX_INCOMPATIBLE' });
    const stale = JSON.parse(original); stale.records[0].sourceHash = 'b'.repeat(64);
    await writeFile(embeddingsFile, JSON.stringify(stale)); await assert.rejects(index.load({ verifySources: true }), { code: 'INDEX_INCOMPATIBLE' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('status verifies health, model presence and museum completeness without claiming inference verification', async () => {
  const services = { openclip: { available: true }, ollama: { available: true, modelAvailable: true, planningModelAvailable: true } };
  const completeStore = { load: async () => collection.map(artwork => ({ museumId: 'met', artworkId: artwork.id, vector: vector() })) };
  const ready = await getAIStatus({ config, store: completeStore, collection, museumId: 'met', services });
  assert.equal(ready.ready, true); assert.equal(ready.liveVerified, false); assert.equal(ready.configuration.provider, 'local');
  const wrongMuseum = await getAIStatus({ config, store, collection: gomaCollection, museumId: 'goma', services });
  assert.equal(wrongMuseum.ready, false); assert.equal(wrongMuseum.index.code, 'EMPTY_INDEX');
  const missingIndex = await getAIStatus({ config, store: { load: async () => { throw new Error('secret-path'); } }, collection, museumId: 'met', services });
  assert.equal(missingIndex.index.code, 'INDEX_UNAVAILABLE'); assert.ok(!JSON.stringify(missingIndex).includes('secret-path'));
  const unavailableModel = await getAIStatus({ config, store: completeStore, collection, museumId: 'met', services: { ...services, ollama: { available: true, modelAvailable: false } } });
  assert.equal(unavailableModel.ready, false); assert.equal(unavailableModel.credentials, undefined);
});

let server, base, mode = 'ok', generationCalls = 0, embeddingCalls = 0;
before(async () => {
  const clip = { request: async (endpoint) => {
    if (endpoint === '/health') return identity;
    embeddingCalls++; if (mode === 'down') return unavailable();
    return { ...identity, embedding: vector(mode === 'no-match' ? 1 : 0) };
  } };
  const ollamaClient = { request: async (endpoint, body) => {
    if (endpoint === '/api/tags') return { models: [{ name: config.ollamaModel }] };
    generationCalls++;
    if (mode === 'down' || mode === 'explanation-down') return unavailable();
    if (body.format.properties.reply) {
      const context = JSON.parse(body.messages[1].content);
      return jsonCandidate({ reply: 'A relaxed visit with your selected artwork.', preferences: { ...context.preferences, availableMinutes: 45, walkingPreference: 'less_walking' } });
    }
    return jsonCandidate(body.format.properties.summaryNoteId ? explanationSelection : recommendation);
  } };
  server = http.createServer(createAIHandler({ config, clip, ollamaClient, store }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api/ai`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const upload = () => { const form = new FormData(); form.append('image', new Blob([image], { type: 'image/jpeg' }), '../../untrusted-name.jpg'); return form; };
test('recognise HTTP endpoint returns candidates and generates no explanations during repeated scans', async () => {
  const beforeCalls = generationCalls;
  for (const state of ['ok', 'explanation-down']) {
    mode = state;
    const response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: upload() });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.candidates[0].artwork.id, 'water-lilies'); assert.equal(result.matched, true); assert.equal(result.requiresConfirmation, true); assert.equal(result.aiExplanation, null);
  }
  mode = 'no-match'; const response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: upload() });
  const result = await response.json(); assert.equal(result.matched, false); assert.deepEqual(result.candidates, []);
  assert.equal(generationCalls, beforeCalls);
});

test('confirm HTTP endpoint explains the user selection with strict museum validation and graceful failure', async () => {
  const post = input => fetch(`${base}/artworks/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const beforeCalls = generationCalls;
  const beforeEmbeddings = embeddingCalls;
  mode = 'ok';
  const response = await post({ museumId: 'met', artworkId: 'water-lilies', visitorPreferences: ['Nature'] });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).aiExplanation, groundedExplanation);
  assert.equal(generationCalls, beforeCalls + 1); assert.equal(embeddingCalls, beforeEmbeddings);
  assert.equal((await post({ museumId: 'goma', artworkId: 'water-lilies' })).status, 400);
  assert.equal((await post({ museumId: 'met', artworkId: 'invented' })).status, 400);
  assert.equal((await post({ museumId: 'unknown', artworkId: 'water-lilies' })).status, 400);
  assert.equal((await post({ museumId: 'met', artworkId: 'water-lilies', visitorPreferences: 'invalid' })).status, 400);
  assert.equal(generationCalls, beforeCalls + 1);
  mode = 'explanation-down';
  const fallback = await (await post({ museumId: 'met', artworkId: 'water-lilies' })).json();
  assert.equal(fallback.artwork.id, 'water-lilies'); assert.equal(fallback.aiExplanation, null); assert.ok(fallback.warning);
});

test('status HTTP endpoint scopes its index, sanitizes configuration, and makes no inference calls', async () => {
  const beforeCalls = generationCalls + embeddingCalls;
  const response = await fetch(`${base}/status`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.museumId, 'met'); assert.equal(result.ready, false); assert.equal(result.liveVerified, false); assert.equal(result.index.indexedArtworks, 1);
  const goma = await (await fetch(`${base}/status?museumId=goma`)).json();
  assert.equal(goma.index.available, false); assert.equal(goma.index.indexedArtworks, 0);
  assert.equal((await fetch(`${base}/status?museumId=unknown`)).status, 400);
  assert.equal(generationCalls + embeddingCalls, beforeCalls);
  assert.equal(result.configuration.provider, 'local'); assert.equal(result.configuration.project, undefined); assert.equal(result.credentials, undefined); assert.equal(result.services.ollama.modelAvailable, true);
});
test('recognise endpoint handles embedding failure, missing files and spoofed MIME', async () => {
  mode = 'down'; let response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: upload() }); assert.equal(response.status, 503);
  response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: new FormData() }); assert.equal(response.status, 400);
  const form = new FormData(); form.append('image', new Blob(['fake'], { type: 'image/png' }), 'fake.png');
  response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: form }); assert.equal(response.status, 415);
});
test('route endpoint returns bounded itinerary and graceful provider fallback', async () => {
  for (const state of ['ok', 'down']) {
    mode = state;
    const response = await fetch(`${base}/routes/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify({ availableMinutes: 15, interests: ['Nature'] }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081');
    const result = await response.json(); assert.ok(result.estimatedMinutes <= 15); assert.equal(result.recommendationSource, state === 'ok' ? 'ollama' : 'local');
  }
});

test('real-model acceptance rejects usable fallbacks and independently checks route constraints', async () => {
  const preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: ['step_free'], mustSeeArtworkIds: [collection[0].id] };
  const route = await createRouteService({ ollama, collection, graph }).plan(preferences);
  assertModelRoute(route, preferences, collection, graph);
  const fallback = await createRouteService({ ollama: { generateRouteRecommendations: unavailable }, collection, graph }).plan(preferences);
  assert.ok(fallback.route.length > 0);
  assert.throws(() => assertModelRoute(fallback, preferences, collection, graph), /fallback is not a model success/);
  assert.throws(() => assertModelRoute({ ...route, warning: 'Provider failed' }, preferences, collection, graph), /provider warning/);
  assert.throws(() => assertModelRoute(route, { ...preferences, availableMinutes: 1 }, collection, graph), /exceeds budget/);
  const tampered = structuredClone(route);
  tampered.navigation[0].nodes = ['entrance', 'invented', route.route[0].artworkId];
  assert.throws(() => assertModelRoute(tampered, preferences, collection, graph), /navigation edge/);
});
test('AI endpoints reject untrusted origin, invalid JSON, invalid IDs and oversized bodies', async () => {
  const post = (body, headers = {}) => fetch(`${base}/routes/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.equal((await post('{}', { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('{"mustSeeArtworkIds":["unknown"]}')).status, 400);
  assert.equal((await post('x'.repeat(17000))).status, 413);
  const preflight = await fetch(`${base}/routes/plan`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081' } }); assert.equal(preflight.status, 204);
});

test('GOMA catalogue and routes stay separate from The Met; unknown museums fail explicitly', async () => {
  const catalogue = await (await fetch(`${base}/catalogue?museumId=goma`)).json();
  assert.equal(catalogue.museum.id, 'goma');
  assert.deepEqual(catalogue.artworks.map(a => a.id), gomaCollection.map(a => a.id));
  assert.equal((await fetch(`${base}/catalogue?museumId=unknown`)).status, 400);
  assert.equal((await fetch(`${base}/catalogue?museumId=__proto__`)).status, 400);
  const post = input => fetch(`${base}/routes/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  mode = 'down';
  assert.equal((await post({ museumId: 'goma', mustSeeArtworkIds: ['water-lilies'] })).status, 400);
  assert.equal((await post({ museumId: 'met', mustSeeArtworkIds: ['goma-heritage'] })).status, 400);
  assert.equal((await post({ museumId: 'goma', currentLocation: 'great-hall' })).status, 400);
  assert.equal((await post({ museumId: 'unknown' })).status, 400);
  assert.equal((await post({ museumId: null })).status, 400);
  const response = await post({ museumId: 'goma', availableMinutes: 60, mustSeeArtworkIds: gomaCollection.map(a => a.id), accessibilityRequirements: ['step_free'] });
  assert.equal(response.status, 200);
  const route = await response.json();
  assert.equal(route.route.length, 4);
  assert.equal(route.recommendationSource, 'local');
  assert.ok(route.route.every(stop => gomaCollection.some(a => a.id === stop.artworkId)));
  assert.ok(route.navigation.every(leg => leg.nodes.every(id => gomaGraph.nodes.some(n => n.id === id))));
  assert.equal(route.mapNotice, gomaGraph.description);
  const met = await (await fetch(`${base}/catalogue`)).json();
  assert.equal(met.artworks.length, collection.length);
});

test('GOMA recognition excludes a Met-only index without calling inference', async () => {
  const service = createRecognitionService({ config, collection: gomaCollection, store, embeddings: { generate: () => assert.fail('must not embed without a museum index') }, ollama });
  await assert.rejects(service.recognise(image), { code: 'EMPTY_INDEX' });
  const result = await fetch(`${base}/artworks/recognise?museumId=goma`, { method: 'POST', body: upload() });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'EMPTY_INDEX');
  assert.equal((await fetch(`${base}/artworks/recognise?museumId=unknown`, { method: 'POST', body: upload() })).status, 400);
});

test('planning chat scopes model context to the museum and preserves a complete preference snapshot', async () => {
  const preferences = { interests: ['Monet'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: ['step_free'], mustSeeArtworkIds: ['water-lilies'] };
  const history = [{ role: 'user', content: 'I want to see Monet.' }, { role: 'assistant', content: 'I have included Water Lilies.' }];
  const service = createPlanningChatService({ collection, graph, museum: { name: 'The Met' }, ollama: createOllamaService(config, { request: async (endpoint, body) => {
    assert.equal(endpoint, '/api/chat');
    const context = JSON.parse(body.messages[1].content);
    assert.deepEqual(context.preferences, preferences);
    assert.deepEqual(context.history, history);
    assert.equal(context.message, undefined);
    assert.equal(body.messages.at(-1).role, 'user');
    assert.equal(body.messages.at(-1).content, 'Actually remove the must-see and use 15 minutes.');
    assert.deepEqual(Object.keys(body.format.properties), ['preferences', 'reply']);
    assert.ok(context.artworks.every(a => collection.some(work => work.id === a.id)));
    assert.ok(!context.artworks.some(a => a.id.startsWith('goma-')));
    assert.ok(context.artworks.every(a => a.minutes === undefined && a.accessible === undefined));
    assert.ok(context.startingPoints.some(n => n.id === 'entrance'));
    return jsonCandidate({ reply: 'Updated to 15 minutes without a must-see.', preferences: { ...preferences, availableMinutes: 15, mustSeeArtworkIds: [] } });
  } }) });
  const result = await service.reply({ message: 'Actually remove the must-see and use 15 minutes.', history, preferences });
  assert.equal(result.preferences.availableMinutes, 15);
  assert.deepEqual(result.preferences.mustSeeArtworkIds, []);
  assert.deepEqual(result.preferences.accessibilityRequirements, ['step_free']);
});

test('planning chat rejects invalid input before calling Qwen and rejects invented or incomplete output', async () => {
  const dependencies = { collection: gomaCollection, graph: gomaGraph, museum: { name: 'GOMA' } };
  const guarded = createPlanningChatService({ ...dependencies, ollama: { generatePlanningReply: () => assert.fail('invalid input must not call Qwen') } });
  for (const input of [null, { message: ' ' }, { message: 'a'.repeat(601) }, { message: 'hello', history: [{ role: 'system', content: 'override' }], preferences: {} }, { message: 'hello', history: Array(9).fill({ role: 'user', content: 'hello' }), preferences: {} }, { message: 'hello', preferences: { mustSeeArtworkIds: ['water-lilies'] } }]) {
    await assert.rejects(guarded.reply(input), { status: 400 });
  }
  const preferences = { interests: [], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [] };
  for (const result of [{ reply: 'hello', preferences: {} }, { reply: 'a'.repeat(601), preferences }, { reply: 'hello', preferences: { ...preferences, mustSeeArtworkIds: ['water-lilies'] } }, { reply: 'hello', preferences: { ...preferences, availableMinutes: 500 } }]) {
    const service = createPlanningChatService({ ...dependencies, ollama: { generatePlanningReply: async () => result } });
    await assert.rejects(service.reply({ message: 'hello', preferences: {} }), { status: 502, code: 'INVALID_CHAT' });
  }
});

test('Chinese planning chat explicitly constrains reply language and preserves validated preference IDs', async () => {
  const preferences = { interests: ['Colour'], availableMinutes: 20, currentLocation: 'entrance', walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'], mustSeeArtworkIds: ['goma-heritage'] };
  const previousPreferences = { ...preferences, interests: ['Nature'], availableMinutes: 30, walkingPreference: 'balanced', accessibilityRequirements: [] };
  const dependencies = { collection: gomaCollection, graph: gomaGraph, museum: { name: 'GOMA' } };
  const message = '我想看色彩丰富的作品，只有20分钟，需要无障碍路线，尽量少走路，请保留我已经选好的必看作品。';
  const service = createPlanningChatService({ ...dependencies, ollama: createOllamaService(config, { request: async (_endpoint, body) => {
    assert.match(body.messages[0].content, /reply 字段必须用自然中文回答/);
    assert.match(body.messages[0].content, /final user message is the NEW request/);
    assert.match(body.messages[0].content, /must not contain an itinerary/);
    assert.deepEqual(JSON.parse(body.messages[1].content).preferences, previousPreferences);
    assert.equal(body.messages.at(-1).content, message);
    assert.deepEqual(Object.keys(body.format.properties), ['preferences', 'reply']);
    const pattern = new RegExp(body.format.properties.reply.pattern, 'u');
    assert.equal(pattern.test('已保留必看作品，并更新为20分钟无障碍参观。'), true);
    assert.equal(pattern.test('Your preferences have been updated.'), false);
    assert.ok(body.format.properties.preferences.properties.mustSeeArtworkIds.items.enum.includes('goma-heritage'));
    return jsonCandidate({ reply: '已保留必看作品，并更新为20分钟无障碍参观。', preferences });
  } }) });
  const result = await service.reply({ message, preferences: previousPreferences });
  assert.deepEqual(result.preferences, preferences); assert.match(result.reply, /已保留/);
  const wrongLanguage = createPlanningChatService({ ...dependencies, ollama: { generatePlanningReply: async () => ({ reply: 'Your preferences have been updated.', preferences }) } });
  await assert.rejects(wrongLanguage.reply({ message, preferences }), { code: 'INVALID_CHAT_LANGUAGE', status: 502 });
});

test('chat HTTP endpoint supports GOMA preferences and reports provider failures without inventing a reply', async () => {
  const post = input => fetch(`${base}/routes/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify(input) });
  const input = { museumId: 'goma', message: 'A relaxed visit please.', preferences: { mustSeeArtworkIds: ['goma-heritage'] } };
  mode = 'ok';
  const response = await post(input);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  const result = await response.json();
  assert.equal(result.preferences.availableMinutes, 45);
  assert.equal(result.preferences.walkingPreference, 'less_walking');
  assert.deepEqual(result.preferences.mustSeeArtworkIds, ['goma-heritage']);
  assert.equal((await post({ ...input, museumId: 'unknown' })).status, 400);
  assert.equal((await post({ ...input, preferences: { mustSeeArtworkIds: ['water-lilies'] } })).status, 400);
  mode = 'down';
  const failure = await post(input);
  assert.equal(failure.status, 503);
  assert.equal((await failure.json()).reply, undefined);
});

test('explicitly preserving must-see works constrains exact IDs for both museums, including an empty list', async () => {
  for (const catalogue of [collection, gomaCollection]) for (const ids of [[], [catalogue[0].id]]) {
    const preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: ids };
    for (const message of ['我想看色彩丰富的作品，只有20分钟，需要无障碍路线，尽量少走路，请保留我已经选好的必看作品。', 'Use 20 minutes and keep my existing must-see artworks.']) {
      const service = createOllamaService(config, { request: async (_endpoint, body, timeout) => {
        assert.equal(timeout, 0, 'Planning has no model deadline.');
        assert.equal(body.model, config.planningModel, 'Use the independent lightweight planning model.');
        assert.equal(body.options.num_predict, config.planningNumPredict);
        assert.deepEqual(body.format.properties.preferences.properties.mustSeeArtworkIds.const, ids);
        return jsonCandidate({ reply: '已保留必看作品。', preferences: { ...preferences, availableMinutes: 20 } });
      } });
      await service.generatePlanningReply({ message, preferences, artworks: catalogue, startingPoints: [{ id: 'entrance' }], history: [] });
    }
  }
});

test('unrelated planning requests cannot turn recommendations into must-see selections', async () => {
  const preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [] };
  const service = createPlanningChatService({ collection, graph, museum: { name: 'The Met' },
    ollama: createOllamaService(config, { request: async (_endpoint, body) => {
      assert.deepEqual(body.format.properties.preferences.properties.mustSeeArtworkIds.const, []);
      return jsonCandidate({ reply: 'I will focus on highlights.', preferences: { ...preferences, mustSeeArtworkIds: [] } });
    } }) });
  const result = await service.reply({ message: 'I have 30 minutes. Help me explore the highlights.', history: [], preferences });
  assert.deepEqual(result.preferences.mustSeeArtworkIds, []);
});

test('GOMA chat rejects an extra valid artwork when the visitor explicitly keeps the selected must-see list', async () => {
  const preferences = { interests: ['Colour'], availableMinutes: 20, currentLocation: 'entrance', walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'], mustSeeArtworkIds: ['goma-obliteration-room'] };
  for (const ids of [['goma-obliteration-room', 'goma-soul-under-the-moon'], []]) {
    const service = createPlanningChatService({ collection: gomaCollection, graph: gomaGraph, museum: { name: 'GOMA' },
      ollama: { generatePlanningReply: async () => ({ reply: '已保留必看作品。', preferences: { ...preferences, mustSeeArtworkIds: ids } }) } });
    await assert.rejects(service.reply({ message: '请保留我已经选好的必看作品。', preferences }), { status: 502, code: 'INVALID_CHAT' });
    assert.deepEqual(preferences.mustSeeArtworkIds, ['goma-obliteration-room']);
  }
});

test('explicit additions, removals and negated preserve instructions remain editable', async () => {
  const preferences = { interests: ['Colour'], availableMinutes: 20, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: ['goma-obliteration-room'] };
  for (const [message, ids] of [
    ['Keep my existing must-see artworks and also include Heritage.', ['goma-obliteration-room', 'goma-heritage']],
    ['保留我已选的必看作品，再加入 Heritage。', ['goma-obliteration-room', 'goma-heritage']],
    ['Remove all must-see artworks.', []], ['不要保留必看作品。', []], ["Don't keep my must-see artworks.", []],
  ]) {
    const service = createPlanningChatService({ collection: gomaCollection, graph: gomaGraph, museum: { name: 'GOMA' },
      ollama: createOllamaService(config, { request: async (_endpoint, body) => {
        assert.equal(Object.hasOwn(body.format.properties.preferences.properties.mustSeeArtworkIds, 'const'), false);
        return jsonCandidate({ reply: '已更新必看作品。', preferences: { ...preferences, mustSeeArtworkIds: ids } });
      } }) });
    const result = await service.reply({ message, preferences });
    assert.deepEqual(result.preferences.mustSeeArtworkIds, ids);
  }
});

test('planning output and context budgets are independent, bounded, and preserve explicit tuning', () => {
  assert.equal(config.planningNumPredict, 1024); assert.equal(config.planningRetryNumPredict, 2048);
  assert.equal(config.planningNumCtx, 4096);
  const legacy = readAIConfig({ OLLAMA_PLANNING_NUM_PREDICT: '192' });
  assert.equal(legacy.planningNumPredict, 192); assert.equal(legacy.planningRetryNumPredict, 1024);
  assert.equal(readAIConfig({ OLLAMA_NUM_CTX: '8192' }).planningNumCtx, 8192);
  const tuned = readAIConfig({ OLLAMA_PLANNING_NUM_PREDICT: '4096', OLLAMA_PLANNING_NUM_CTX: '6144' });
  assert.equal(tuned.planningNumPredict, 4096); assert.equal(tuned.planningRetryNumPredict, 4096); assert.equal(tuned.planningNumCtx, 6144);
  for (const value of ['-1', '0', '127', '4097', 'NaN']) assert.throws(() => readAIConfig({ OLLAMA_PLANNING_NUM_PREDICT: value }));
});

test('planning and artwork budgets follow the operation even when model names match', async () => {
  const calls = [];
  const service = createOllamaService({ ...config, ollamaModel: config.planningModel }, { request: async (_endpoint, body, timeout) => {
    calls.push({ body, timeout });
    return jsonCandidate(body.format.properties.recommendedArtworkIds ? recommendation : explanationSelection);
  } });
  await service.generateArtworkExplanation(collection[0], [], collection);
  await service.generateRouteRecommendations({ interests: [], mustSeeArtworkIds: [] }, collection);
  assert.deepEqual(calls.map(({ body, timeout }) => [body.options.num_predict, body.options.num_ctx, timeout]), [[256, 2048, 45000], [1024, 4096, 0]]);
});

test('a truncated planning answer is regenerated once with a larger budget and the original request', async t => {
  const log = t.mock.method(console, 'warn', () => {});
  const cfg = readAIConfig({ OLLAMA_PLANNING_NUM_PREDICT: '192' });
  const calls = [], controller = new AbortController();
  const service = createOllamaService(cfg, { request: async (_endpoint, body, timeout, signal) => {
    calls.push(structuredClone(body)); assert.equal(timeout, 0); assert.equal(signal, controller.signal);
    return calls.length === 1
      ? { done: true, done_reason: 'length', eval_count: 192, prompt_eval_count: 1300, message: { content: '{"recommendedArtworkIds": ["unfinished' } }
      : jsonCandidate(recommendation);
  } });
  assert.deepEqual(await service.generateRouteRecommendations({ interests: ['Nature'], mustSeeArtworkIds: [] }, collection, controller.signal), recommendation);
  assert.deepEqual(calls.map(body => body.options.num_predict), [192, 1024]);
  assert.deepEqual(calls[1].messages, calls[0].messages); assert.deepEqual(calls[1].format, calls[0].format);
  assert.equal(log.mock.callCount(), 1);
  assert.equal(JSON.parse(log.mock.calls[0].arguments[0]).nextNumPredict, 1024);
  assert.ok(!log.mock.calls[0].arguments[0].includes('unfinished'));
});

test('planning retries only a finished response with an output-length stop, and never loops indefinitely', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const [data, count] of [
    [{ done: true, done_reason: 'length', eval_count: 1024, message: { content: JSON.stringify(recommendation) } }, 2],
    [{ done: false, done_reason: 'length' }, 1], [{ done: true }, 1], [{ done: true, done_reason: 'load' }, 1],
  ]) {
    let calls = 0;
    const service = createOllamaService(config, { request: async () => { calls++; return data; } });
    await assert.rejects(service.generateRouteRecommendations({ interests: [], mustSeeArtworkIds: [] }, collection), error => {
      assert.equal(error.code, 'OLLAMA_INCOMPLETE'); assert.equal(error.details.outputSetting, 'OLLAMA_PLANNING_NUM_PREDICT');
      assert.equal(error.details.attempts.length, count);
      assert.ok(!JSON.stringify(error.details).includes('reasoningSummary'));
      assert.equal(error.details.attempts.at(-1).doneReason, data.done_reason || 'unknown');
      return true;
    });
    assert.equal(calls, count);
  }
  let calls = 0;
  const capped = createOllamaService(readAIConfig({ OLLAMA_PLANNING_NUM_PREDICT: '4096' }), { request: async () => { calls++; return { done: true, done_reason: 'length' }; } });
  await assert.rejects(capped.generateRouteRecommendations({ interests: [], mustSeeArtworkIds: [] }, collection), { code: 'OLLAMA_INCOMPLETE' });
  assert.equal(calls, 1);
});

test('cancellation between a truncated response and retry stops further generation and releases the gate', async () => {
  const controller = new AbortController(); let calls = 0;
  const service = createOllamaService(config, { request: async () => {
    calls++;
    if (calls === 1) { controller.abort(); return { done: true, done_reason: 'length' }; }
    return jsonCandidate(recommendation);
  } });
  await assert.rejects(service.generateRouteRecommendations({ interests: [], mustSeeArtworkIds: [] }, collection, controller.signal), { code: 'REQUEST_CANCELLED' });
  assert.equal(calls, 1);
  assert.deepEqual(await service.generateRouteRecommendations({ interests: [], mustSeeArtworkIds: [] }, collection), recommendation);
});
