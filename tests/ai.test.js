import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import collection from '../shared/met-collection.json' with { type: 'json' };
import graph from '../shared/met-graph.json' with { type: 'json' };
import gomaCollection from '../shared/goma-collection.json' with { type: 'json' };
import gomaGraph from '../shared/goma-graph.json' with { type: 'json' };
import { readAIConfig, AIError } from '../server/ai/config.js';
import { createGoogleClient } from '../server/ai/google.js';
import { createEmbeddingService, cosineSimilarity } from '../server/ai/embeddings.js';
import { parseExplanation, parseRecommendations, createGeminiService } from '../server/ai/gemini.js';
import { createRecognitionService } from '../server/ai/recognition.js';
import { createRouteService } from '../server/ai/routes.js';
import { shortestPath } from '../server/ai/graph.js';
import { normalizeImage, MAX_IMAGE_BYTES } from '../server/ai/images.js';
import { createAIHandler } from '../server/ai/handler.js';

const config = readAIConfig({});
const vector = (position = 0) => Array.from({ length: 1408 }, (_, i) => i === position ? 1 : 0);
const explanation = { summary: 'Observe colour and reflections.', historicalContext: 'Not available in the supplied notes.', interestingFacts: ['The medium is oil on canvas.'], whyItMatters: 'An interpretation of the water garden.', suggestedNextArtwork: null };
const recommendation = { recommendedArtworkIds: collection.map(a => a.id), reasoningSummary: 'A visit connecting nature and movement.' };
const gemini = { generateArtworkExplanation: async () => explanation, generateRouteRecommendations: async () => recommendation };
const unavailable = async () => { throw new AIError(503, 'MOCK_UNAVAILABLE', 'Unavailable'); };
const store = { load: async () => [{ artworkId: collection[0].id, vector: vector() }] };
const jsonCandidate = value => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
let image;
before(async () => { image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#667C86' } }).jpeg().toBuffer(); });

test('configuration validates threshold and keeps model/location independently configurable', () => {
  assert.throws(() => readAIConfig({ ARTWORK_MATCH_THRESHOLD: 'bad' }));
  assert.equal(config.geminiModel, 'gemini-3.8-flash');
  assert.equal(config.geminiLocation, 'global');
  assert.equal(readAIConfig({ GEMINI_MODEL: 'other' }).geminiModel, 'other');
});
test('Vertex embedding service sends normalized bytes and validates response dimensions', async () => {
  const service = createEmbeddingService(config, { post: async (model, location, method, body) => {
    assert.equal(model, 'multimodalembedding@001'); assert.equal(location, 'us-central1'); assert.equal(method, 'predict');
    assert.equal(body.instances[0].image.bytesBase64Encoded, image.toString('base64')); assert.equal(body.parameters.dimension, 1408);
    return { predictions: [{ imageEmbedding: vector() }] };
  } });
  assert.deepEqual(await service.generate(image), vector());
  await assert.rejects(createEmbeddingService(config, { post: async () => ({ predictions: [{ imageEmbedding: [NaN] }] }) }).generate(image), { code: 'INVALID_VECTOR' });
});
test('cosine similarity handles identical, orthogonal and invalid vectors', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2], [2, 4]) - 1) < 1e-12);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.throws(() => cosineSimilarity([0, 0], [1, 1]));
  assert.throws(() => cosineSimilarity([1], [1, 2]));
});
test('recognition matches DB metadata and retains match when Gemini fails', async () => {
  const service = createRecognitionService({ config, collection, store, embeddings: { generate: async () => vector() }, gemini: { ...gemini, generateArtworkExplanation: unavailable } });
  const result = await service.recognise(image);
  assert.equal(result.matched, true); assert.equal(result.artwork.artist, 'Claude Monet'); assert.equal(result.aiExplanation, null); assert.ok(result.warning);
});
test('low similarity does not force a match or call Gemini', async () => {
  const service = createRecognitionService({ config, collection, store, embeddings: { generate: async () => vector(1) }, gemini: { generateArtworkExplanation: () => assert.fail('must not explain unknown artwork') } });
  assert.equal((await service.recognise(image)).matched, false);
});
test('empty collection and index fail without paid embedding calls', async () => {
  const dependencies = { config, collection, store, embeddings: { generate: () => assert.fail('must not embed') }, gemini };
  await assert.rejects(createRecognitionService({ ...dependencies, collection: [] }).recognise(image), { code: 'EMPTY_COLLECTION' });
  await assert.rejects(createRecognitionService({ ...dependencies, store: { load: async () => [] } }).recognise(image), { code: 'EMPTY_INDEX' });
});
test('Gemini JSON validation rejects invented IDs, wrong types and excessive text', () => {
  assert.deepEqual(parseExplanation(explanation, []), explanation);
  assert.throws(() => parseExplanation({ ...explanation, suggestedNextArtwork: 'invented' }, []));
  assert.throws(() => parseExplanation({ ...explanation, interestingFacts: 'fact' }, []));
  assert.deepEqual(parseRecommendations(recommendation, collection.map(a => a.id)), recommendation);
  assert.throws(() => parseRecommendations({ ...recommendation, recommendedArtworkIds: ['invented'] }, []));
  assert.throws(() => parseRecommendations({ ...recommendation, recommendedArtworkIds: [collection[0].id, collection[0].id] }, collection.map(a => a.id)));
});
test('Gemini service uses server metadata, JSON schema and handles truncated/non-JSON output', async () => {
  let payload;
  const client = createGeminiService(config, { post: async (_m, _l, _method, body) => { payload = body; return jsonCandidate(explanation); } });
  await client.generateArtworkExplanation(collection[0], ['Nature'], collection);
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  assert.match(payload.contents[0].parts[0].text, /Claude Monet/);
  await assert.rejects(createGeminiService(config, { post: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) }).generateArtworkExplanation(collection[0], [], collection), { code: 'GEMINI_INCOMPLETE' });
  await assert.rejects(createGeminiService(config, { post: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }) }).generateArtworkExplanation(collection[0], [], collection), { code: 'GEMINI_JSON' });
});
test('Dijkstra chooses the shortest path and excludes inaccessible edges', () => {
  const sample = { nodes: ['a', 'b', 'c', 'island'].map(id => ({ id })), edges: [{ from: 'a', to: 'c', distance: 30, estimatedSeconds: 40, accessible: true }, { from: 'a', to: 'b', distance: 5, estimatedSeconds: 6, accessible: false }, { from: 'b', to: 'c', distance: 5, estimatedSeconds: 6, accessible: true }] };
  assert.deepEqual(shortestPath(sample, 'a', 'c').nodes, ['a', 'b', 'c']);
  assert.equal(shortestPath(sample, 'a', 'c', { stepFree: true }).distance, 30);
  assert.equal(shortestPath(sample, 'a', 'island'), null);
  assert.equal(shortestPath(sample, 'unknown', 'c'), null);
});
test('route respects time, must-see, starting point and returns deterministic navigation', async () => {
  const result = await createRouteService({ gemini, collection, graph }).plan({ availableMinutes: 8, currentLocation: 'water-lilies', mustSeeArtworkIds: ['the-dancing-class'], walkingPreference: 'less_walking', accessibilityRequirements: ['step_free'] });
  assert.ok(result.estimatedMinutes <= 8); assert.ok(result.route.some(s => s.artworkId === 'the-dancing-class'));
  assert.equal(result.navigation[0].from, 'water-lilies');
  assert.equal(result.estimatedWalkingDistance, result.navigation.reduce((sum, n) => sum + n.distance, 0));
  assert.equal(result.demo, true);
});
test('route fallback reuses local recommendations when Gemini fails', async () => {
  const result = await createRouteService({ gemini: { generateRouteRecommendations: unavailable }, collection, graph }).plan({});
  assert.equal(result.recommendationSource, 'local'); assert.ok(result.warning); assert.ok(result.route.length);
});
test('impossible budgets, disconnected graphs and invalid IDs are rejected', async () => {
  const service = createRouteService({ gemini, collection, graph });
  await assert.rejects(service.plan({ availableMinutes: 1 }), { code: 'NO_ROUTE' });
  await assert.rejects(service.plan({ availableMinutes: 5, mustSeeArtworkIds: collection.map(a => a.id) }), { code: 'NO_ROUTE' });
  await assert.rejects(service.plan({ mustSeeArtworkIds: ['invented'] }), { status: 400 });
  await assert.rejects(service.plan({ accessibilityRequirements: ['flying'] }), { status: 400 });
  await assert.rejects(service.plan(null), { status: 400 });
  await assert.rejects(createRouteService({ gemini, collection, graph: { ...graph, edges: [] } }).plan({}), { code: 'NO_ROUTE' });
});
test('image validation checks MIME, signature, actual decoding, bytes and WebP conversion', async () => {
  assert.ok((await normalizeImage(image, 'image/jpeg')).length);
  await assert.rejects(normalizeImage(image, 'image/png'), { status: 415 });
  await assert.rejects(normalizeImage(Buffer.from([255,216,255,0]), 'image/jpeg'), { status: 400 });
  await assert.rejects(normalizeImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/jpeg'), { status: 413 });
  const webp = await sharp(image).webp().toBuffer();
  assert.equal((await sharp(await normalizeImage(webp, 'image/webp')).metadata()).format, 'jpeg');
});
test('Google transport uses ADC and a fixed regional host, sanitizes failures and times out', async () => {
  const c = { ...config, project: 'test-project', timeoutMs: 20 };
  const auth = { getAccessToken: async () => 'secret-test-token' };
  const good = createGoogleClient(c, { auth, fetchImpl: async (url, options) => {
    assert.match(url, /^https:\/\/aiplatform.googleapis.com\/v1\/projects\/test-project/);
    assert.equal(options.headers.Authorization, 'Bearer secret-test-token'); return new Response('{}');
  } });
  await good.post('gemini-test', 'global', 'generateContent', {});
  await assert.rejects(createGoogleClient(c, { auth, fetchImpl: async () => new Response('secret-provider-details', { status: 403 }) }).post('model', 'global', 'predict', {}), error => error.code === 'GOOGLE_HTTP_403' && !error.message.includes('secret'));
  await assert.rejects(createGoogleClient(c, { auth: { getAccessToken: () => new Promise(() => {}) } }).post('model', 'global', 'predict', {}), { code: 'GOOGLE_TIMEOUT' });
});

let server, base, mode = 'ok';
before(async () => {
  const google = { post: async (_model, _location, method, body) => {
    if (mode === 'down' || (mode === 'explanation-down' && method === 'generateContent')) return unavailable();
    if (method === 'predict') return { predictions: [{ imageEmbedding: vector(mode === 'no-match' ? 1 : 0) }] };
    return jsonCandidate(body.generationConfig.responseSchema.properties.summary ? explanation : recommendation);
  } };
  server = http.createServer(createAIHandler({ config, google, store }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api/ai`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const upload = () => { const form = new FormData(); form.append('image', new Blob([image], { type: 'image/jpeg' }), '../../untrusted-name.jpg'); return form; };
test('recognise HTTP endpoint returns artwork, explanation and no-match states', async () => {
  mode = 'ok'; let response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: upload() });
  assert.equal(response.status, 200); assert.equal((await response.json()).artwork.id, 'water-lilies');
  mode = 'no-match'; response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: upload() }); assert.equal((await response.json()).matched, false);
  mode = 'explanation-down'; response = await fetch(`${base}/artworks/recognise`, { method: 'POST', body: upload() }); const result = await response.json(); assert.equal(result.matched, true); assert.equal(result.aiExplanation, null);
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
    const result = await response.json(); assert.ok(result.estimatedMinutes <= 15); assert.equal(result.recommendationSource, state === 'ok' ? 'gemini' : 'local');
  }
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

test('GOMA recognition excludes a Met-only index without calling a paid provider', async () => {
  const service = createRecognitionService({ config, collection: gomaCollection, store, embeddings: { generate: () => assert.fail('must not embed without a museum index') }, gemini });
  await assert.rejects(service.recognise(image), { code: 'EMPTY_INDEX' });
  const result = await fetch(`${base}/artworks/recognise?museumId=goma`, { method: 'POST', body: upload() });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'EMPTY_INDEX');
  assert.equal((await fetch(`${base}/artworks/recognise?museumId=unknown`, { method: 'POST', body: upload() })).status, 400);
});
