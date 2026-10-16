import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import sharp from 'sharp';
import { readAIConfig, AIError } from '../server/ai/config.js';
import { createVisionService, parseVision, inspectVisionModel } from '../server/ai/vision.js';
import { createPublicClient, createPublicCatalogues, publicURL } from '../server/ai/public-catalogues.js';
import { createArtworkAnalysis } from '../server/ai/artwork-analysis.js';
import { createAIHandler } from '../server/ai/handler.js';
import { createOllamaService } from '../server/ai/ollama.js';
import { createLocalClient } from '../server/ai/local-http.js';

const config = readAIConfig({});
const observation = { artworkPresence: 'likely', description: 'A seated figure with a landscape behind it.', visualFeatures: ['Folded hands'], visibleText: [], hypotheses: [{ title: 'Mona Lisa', artist: 'Leonardo da Vinci', basis: 'Figure, pose and landscape resemble this work.' }] };
const jpeg = await sharp({ create: { width: 1000, height: 800, channels: 3, background: '#667C86' } }).jpeg().toBuffer();
const source = { id: 'commons:1', provider: 'Wikimedia Commons', title: 'Mona Lisa.jpg', artist: null, date: null, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg', imageUrl: 'https://upload.wikimedia.org/mona.jpg' };
const providers = [{ name: 'Wikimedia Commons', status: 'completed', results: 1 }];
const records = { records: [source], providers };

test('visual output rejects ungrounded extra fields and cannot attach identity guesses to uncertain presence', () => {
  assert.deepEqual(parseVision(observation), observation);
  assert.deepEqual(parseVision({ ...observation, artworkPresence: 'uncertain' }).hypotheses, []);
  for (const value of [{ ...observation, verified: true }, { ...observation, description: '' }, { ...observation, hypotheses: [{ ...observation.hypotheses[0], sourceUrl: 'https://invented.example' }] }, { ...observation, visualFeatures: ['x'.repeat(201)] }]) assert.throws(() => parseVision(value), { code: 'INVALID_VISION_RESULT' });
  assert.throws(() => readAIConfig({ OLLAMA_VISION_MODEL: 'qwen3-vl:cloud' }));
});

test('vision requires a local image-capable model and sends bounded images to that model', async () => {
  let sent;
  const client = { request: async (endpoint, body) => {
    if (endpoint === '/api/tags') return { models: [{ name: config.visionModel }] };
    if (endpoint === '/api/show') return { capabilities: ['completion', 'vision'] };
    sent = body;
    return { done: true, done_reason: 'stop', message: { content: JSON.stringify(observation) } };
  } };
  assert.deepEqual(await createVisionService(config, { client }).analyse(jpeg), observation);
  assert.equal(sent.model, 'qwen3-vl:4b'); assert.equal(sent.keep_alive, '10m'); assert.equal(sent.think, false);
  const image = Buffer.from(sent.messages[1].images[0], 'base64');
  const metadata = await sharp(image).metadata();
  assert.ok(metadata.width <= 512 && metadata.height <= 512); assert.equal(metadata.exif, undefined);
  await assert.rejects(inspectVisionModel(config, { request: async () => ({ models: [{ name: config.visionModel, remote_host: 'remote.invalid' }] }) }), { code: 'VISION_REMOTE_MODEL' });
  await assert.rejects(inspectVisionModel(config, { request: async () => ({ models: [] }) }), { code: 'VISION_MODEL_MISSING' });
  await assert.rejects(inspectVisionModel(config, { request: async endpoint => endpoint === '/api/tags' ? { models: [{ name: config.visionModel }] } : { capabilities: ['completion'] } }), { code: 'VISION_NOT_SUPPORTED' });
});

test('vision and guide share one generation slot and release it after a failed answer', async () => {
  const gate = { active: false }; let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  const client = { request: async endpoint => {
    if (endpoint === '/api/tags') return { models: [{ name: config.visionModel }] };
    if (endpoint === '/api/show') return { capabilities: ['vision'] };
    started(); return new Promise(resolve => { finish = resolve; });
  } };
  const pending = createVisionService(config, { client, gate }).analyse(jpeg);
  await ready;
  const guide = createOllamaService(config, { request: () => assert.fail('Must not generate concurrently') }, gate);
  await assert.rejects(guide.generateArtworkExplanation({ id: 'a', title: 'A' }, [], []), { code: 'OLLAMA_BUSY' });
  finish({ done: true, done_reason: 'length', message: { content: '{}' } });
  await assert.rejects(pending, { code: 'VISION_INCOMPLETE' });
  assert.equal(gate.active, false);
});

test('public downloads reject private destinations, credential URLs and redirect escapes before contacting them', async () => {
  for (const url of ['http://api.artic.edu/a', 'https://127.0.0.1/a', 'https://api.artic.edu.evil.example/a', 'https://user:secret@api.artic.edu/a', 'https://api.artic.edu:8080/a']) assert.throws(() => publicURL(url), { code: 'SOURCE_URL_INVALID' });
  let requests = 0;
  const client = createPublicClient({ fetchImpl: async (_url, options) => { requests++; assert.equal(options.redirect, 'manual'); return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data' } }); } });
  await assert.rejects(client.get('https://api.artic.edu/test'), { code: 'SOURCE_URL_INVALID' });
  assert.equal(requests, 1);
  await assert.rejects(createPublicClient({ fetchImpl: async () => new Response('x', { headers: { 'content-type': 'image/jpeg', 'content-length': String(6 * 1024 * 1024) } }) }).get('https://www.artic.edu/image', { image: true }), /SOURCE_TOO_LARGE/);
});

test('catalogue adapters return linked records, constrain image addresses and preserve provider outages', async () => {
  const requests = [];
  const catalogues = createPublicCatalogues({ client: { get: async value => {
    const url = new URL(value); requests.push(url);
    if (url.hostname === 'collectionapi.metmuseum.org') throw new Error('offline');
    if (url.hostname === 'api.artic.edu') return { config: { iiif_url: 'https://www.artic.edu/iiif/2' }, data: [{ id: 10, title: 'Test artwork', artist_title: 'Artist', image_id: 'abc-123', is_public_domain: true }] };
    return { query: { pages: [{ pageid: 12, title: 'File:Mona Lisa.jpg', imageinfo: [{ thumburl: 'http://127.0.0.1/private' }] }] } };
  } } });
  const result = await catalogues.search(observation.hypotheses);
  assert.equal(result.providers.find(item => item.name === 'The Met').status, 'unavailable');
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].sourceUrl, 'https://www.artic.edu/artworks/10');
  assert.equal(result.records[0].imageUrl, 'https://www.artic.edu/iiif/2/abc-123/full/600,/0/default.jpg');
  assert.equal(result.records[1].imageUrl, null);
  assert.ok(requests.every(url => !url.href.includes(jpeg.toString('base64').slice(0, 100))));
});

test('a title search result alone never establishes the photo identity; even similar images remain tentative', async () => {
  const vision = { analyse: async () => observation };
  const catalogues = { search: async () => records, image: async () => ({ bytes: jpeg, mime: 'image/jpeg' }) };
  let calls = 0;
  const low = await createArtworkAnalysis(config, { vision, catalogues, embeddings: { generate: async () => ++calls === 1 ? [1, 0] : [0, 1] } }).analyse(jpeg);
  assert.equal(low.identityStatus, 'uncertain'); assert.equal(low.sources[0].visualCheck, 'different');
  const high = await createArtworkAnalysis(config, { vision, catalogues, embeddings: { generate: async () => [1, 0] } }).analyse(jpeg);
  assert.equal(high.identityStatus, 'possible_match'); assert.equal(high.sources[0].visualCheck, 'similar');
  assert.equal(high.matched, undefined); assert.equal(high.artwork, undefined);
});

test('unknown images and disabled search do not send queries; source failures preserve cautious observations', async () => {
  const unavailable = { generate: async () => { throw new Error('OpenCLIP unavailable'); } };
  for (const [settings, result] of [[{ ...config, publicSearch: false }, observation], [config, { ...observation, hypotheses: [] }]]) {
    const response = await createArtworkAnalysis(settings, { vision: { analyse: async () => result }, catalogues: { search: () => assert.fail('No search permitted') }, embeddings: unavailable }).analyse(jpeg);
    assert.equal(response.identityStatus, 'uncertain'); assert.deepEqual(response.sources, []);
  }
  const response = await createArtworkAnalysis(config, { vision: { analyse: async () => observation }, catalogues: { search: async () => ({ records: [], providers: [{ name: 'The Met', status: 'unavailable', results: 0 }] }) }, embeddings: unavailable }).analyse(jpeg);
  assert.equal(response.search.status, 'unavailable'); assert.equal(response.description, observation.description);
});

test('cancelled visual requests abort the local transport instead of reporting model unavailability', async () => {
  const cancellation = new AbortController();
  const client = createLocalClient(config, 'OLLAMA', { fetchImpl: async (_url, { signal }) => new Promise((_, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); cancellation.abort(); }) });
  await assert.rejects(client.request('/api/chat', {}, undefined, cancellation.signal), { code: 'REQUEST_CANCELLED' });
});

test('general analysis HTTP validates images and origins and never writes external records into the local catalogue', async t => {
  let calls = 0;
  const server = http.createServer(createAIHandler({ config, analysis: { analyse: async (image, signal) => {
    calls++; assert.ok(Buffer.isBuffer(image)); assert.equal(signal.aborted, false);
    return { ...observation, identityStatus: 'uncertain', sources: [], search: { status: 'not_needed', providers: [] } };
  } } }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  const form = () => { const value = new FormData(); value.append('image', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg'); return value; };
  const response = await fetch(`${base}/artworks/analyse`, { method: 'POST', body: form() });
  assert.equal(response.status, 200); assert.equal((await response.json()).identityStatus, 'uncertain');
  assert.equal((await fetch(`${base}/artworks/analyse`, { method: 'POST', headers: { Origin: 'https://evil.example' }, body: form() })).status, 403);
  assert.equal((await fetch(`${base}/artworks/analyse`, { method: 'POST', body: new FormData() })).status, 400);
  assert.equal(calls, 1);
  const catalogue = await (await fetch(`${base}/catalogue?museumId=met`)).json();
  assert.equal(catalogue.artworks.length, 8); assert.ok(catalogue.artworks.every(item => item.id !== 'mona-lisa'));
});

test('closing an HTTP analysis request cancels its model work', { timeout: 5000 }, async t => {
  let started, stopped;
  const ready = new Promise(resolve => { started = resolve; });
  const cancelled = new Promise(resolve => { stopped = resolve; });
  const server = http.createServer(createAIHandler({ config, analysis: { analyse: async (_image, signal) => {
    started();
    return new Promise((_, reject) => signal.addEventListener('abort', () => { stopped(); reject(new AIError(499, 'REQUEST_CANCELLED', 'Cancelled')); }, { once: true }));
  } } }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const signal = new AbortController();
  const form = new FormData(); form.append('image', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
  const request = fetch(`http://127.0.0.1:${server.address().port}/api/ai/artworks/analyse`, { method: 'POST', body: form, signal: signal.signal });
  const rejected = assert.rejects(request, { name: 'AbortError' });
  await ready; signal.abort(); await rejected; await cancelled;
});
