import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assessAnalysis, runVisionAcceptance } from '../scripts/validate-artwork-vision.mjs';
import { readAIConfig } from '../server/ai/config.js';

const observation = presence => ({ artworkPresence: presence, identityStatus: 'uncertain', description: 'Test fixture observation, not real model output.',
  visualFeatures: [], visibleText: [], hypotheses: [], sources: [], search: { status: 'not_needed', providers: [] } });

test('acceptance allows identity abstention but rejects a wrong leading identity and blank-image hallucinations', () => {
  const expected = { presence: 'likely', titles: ['Water Lilies'], artists: ['Claude Monet'] };
  assert.equal(assessAnalysis(observation('likely'), expected).identitySuggestion, 'abstained');
  const correct = { ...observation('likely'), hypotheses: [{ title: 'Water Lilies', artist: 'Claude Monet', basis: 'Test only.' }] };
  assert.equal(assessAnalysis(correct, expected).identitySuggestion, 'correct');
  assert.throws(() => assessAnalysis({ ...correct, hypotheses: [{ ...correct.hypotheses[0], title: 'Mona Lisa' }] }, expected), /leading title/);
  assert.throws(() => assessAnalysis({ ...correct, artworkPresence: 'unlikely' }, { presence: 'unlikely' }), /must not contain identity/);
  assert.throws(() => assessAnalysis(observation('likely'), { presence: 'unlikely' }), /labelled control/);
});

test('acceptance rejects metadata-only identity assertions and invalid source links', () => {
  const candidate = { id: 'met:1', sourceUrl: 'https://www.metmuseum.org/art/collection/search/1', imageUrl: null, visualCheck: 'not_checked', similarity: null };
  const result = { ...observation('likely'), identityStatus: 'possible_match', sources: [candidate] };
  assert.throws(() => assessAnalysis(result, { presence: 'likely' }), /Metadata alone/);
  assert.throws(() => assessAnalysis({ ...result, sources: [{ ...candidate, visualCheck: 'similar' }] }, { presence: 'likely' }), /computed similarity/);
  assert.throws(() => assessAnalysis({ ...result, sources: [{ ...candidate, sourceUrl: 'https://example.invalid/art' }] }, { presence: 'likely' }), /Invalid source/);
});

async function fixture(t, { failSecond = false, ready = true, publicSearch = false } = {}) {
  const config = { ...readAIConfig({}), publicSearch };
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* Drain multipart bytes; encoder is intentionally mocked. */ }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8081');
    if (req.url === '/api/health') return res.end(JSON.stringify({ app: 'unframe' }));
    if (req.url.startsWith('/api/ai/status')) return res.end(JSON.stringify({ analysisReady: ready, analysisMessage: 'Missing test model', configuration: { visionModel: config.visionModel, analysisVersion: 2 }, services: { vision: { available: ready } } }));
    assert.equal(req.url, '/api/ai/artworks/analyse');
    assert.match(req.headers['content-type'], /^multipart\/form-data/);
    calls++;
    if (failSecond && calls % 3 === 2) { res.statusCode = 503; return res.end(JSON.stringify({ code: 'VISION_BUSY', error: 'Test busy response' })); }
    res.end(JSON.stringify(observation(calls % 3 === 0 ? 'unlikely' : 'likely')));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'unframe-acceptance-test-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  return { options: { config, backend: `http://127.0.0.1:${server.address().port}`, outputRoot, log: () => {} }, calls: () => calls };
}

test('HTTP acceptance saves failures, continues controls, and cannot report a busy model as passed', async t => {
  const { options, calls } = await fixture(t, { failSecond: true });
  const { report, reportFile } = await runVisionAcceptance(options);
  assert.equal(report.passed, false);
  assert.equal(calls(), 3);
  assert.equal(report.checks.length, 4);
  assert.match(report.failures[0].message, /VISION_BUSY/);
  assert.equal(report.checks.at(-1).passed, true);
  assert.deepEqual(JSON.parse(await readFile(reportFile, 'utf8')), report);
  assert.equal(report.training.performed, false);
  assert.equal(report.summary.independentCameraAccuracy, null);
});

test('acceptance preserves previous reports and reports abstention separately from correct identity', async t => {
  const { options } = await fixture(t);
  const first = await runVisionAcceptance(options);
  const before = await readFile(first.reportFile, 'utf8');
  const second = await runVisionAcceptance(options);
  assert.notEqual(first.reportFile, second.reportFile);
  assert.equal(await readFile(first.reportFile, 'utf8'), before);
  assert.equal(second.report.passed, true);
  assert.equal(second.report.summary.identitySuggestionsCorrect, 0);
  assert.equal(second.report.summary.identityAbstentions, 2);
  assert.equal(second.report.publicSearch, 'disabled_by_configuration');
  assert.doesNotMatch(before, /imageBase64|data:image\//);
});

test('missing vision model saves a failed preflight without sending image requests', async t => {
  const { options, calls } = await fixture(t, { ready: false });
  const { report } = await runVisionAcceptance(options);
  assert.equal(report.passed, false);
  assert.equal(calls(), 0);
  assert.match(report.failures[0].message, /Missing test model/);
});

test('public source outage fails full acceptance even when local vision responses pass', async t => {
  const { options } = await fixture(t, { publicSearch: true });
  const sources = { search: async () => ({ records: [], providers: ['The Met', 'Art Institute of Chicago', 'Wikimedia Commons'].map(name => ({ name, status: 'unavailable', results: 0 })) }) };
  const { report } = await runVisionAcceptance({ ...options, sources });
  assert.equal(report.passed, false);
  assert.equal(report.summary.checksPassed, 4);
  assert.match(report.failures[0].message, /public source is unavailable/);
});

test('connection failure stays a boolean failure in the console summary and explains the backend port', async t => {
  const { options } = await fixture(t);
  const logs = [];
  const fetchImpl = async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); };
  const { report } = await runVisionAcceptance({ ...options, fetchImpl, log: value => logs.push(value) });
  assert.equal(report.passed, false);
  const summary = JSON.parse(logs.at(-1));
  assert.equal(summary.passed, false);
  assert.equal(summary.checksPassed, 0);
  assert.match(report.failures[0].message, /ECONNREFUSED.*PORT setting/);
});
