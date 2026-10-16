// Real HTTP acceptance checks. The CLI has no mock or simulated-success mode.
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readAIConfig } from '../server/ai/config.js';
import { parseVision } from '../server/ai/vision.js';
import { createPublicCatalogues, publicURL } from '../server/ai/public-catalogues.js';
import { normalizeImage } from '../server/ai/images.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const simplified = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function assessAnalysis(result, expected) {
  const { artworkPresence, description, visualFeatures, visibleText, hypotheses } = result;
  const parsed = parseVision({ artworkPresence, description, visualFeatures, visibleText, hypotheses });
  assert.deepEqual(parsed.hypotheses, hypotheses, 'Uncertain/non-art images must not contain identity hypotheses.');
  assert.ok(['uncertain', 'possible_match'].includes(result.identityStatus), 'Identity must remain unconfirmed.');
  assert.equal(artworkPresence, expected.presence, 'Artwork presence did not match the labelled control.');
  assert.ok(Array.isArray(result.sources) && result.sources.length <= 6, 'Invalid public reference list.');
  assert.ok(['not_needed', 'disabled', 'completed', 'partial', 'unavailable'].includes(result.search?.status), 'Missing public search status.');
  for (const source of result.sources) {
    assert.ok(['similar', 'different', 'unavailable', 'not_checked'].includes(source.visualCheck), 'Invalid visual comparison status.');
    assert.ok(source.similarity === null || (Number.isFinite(source.similarity) && source.similarity >= -1.000001 && source.similarity <= 1.000001), 'Invalid reference similarity.');
    if (source.visualCheck === 'similar') assert.ok(Number.isFinite(source.similarity), 'A visual match needs a computed similarity.');
    const url = new URL(source.sourceUrl);
    assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['www.metmuseum.org', 'www.artic.edu', 'commons.wikimedia.org'].includes(url.hostname), 'Invalid source link.');
    if (source.imageUrl) publicURL(source.imageUrl);
  }
  const similar = result.sources.some(source => source.visualCheck === 'similar');
  assert.equal(result.identityStatus, similar ? 'possible_match' : 'uncertain', 'Metadata alone must not confirm an image identity.');
  if (expected.presence === 'unlikely') {
    assert.deepEqual(hypotheses, [], 'A blank image must not be assigned an artwork identity.');
    assert.deepEqual(result.sources, [], 'A blank image must not produce artwork references.');
  }
  let identitySuggestion = 'not_evaluated';
  if (expected.titles) {
    const leading = hypotheses[0];
    identitySuggestion = leading ? 'incorrect' : 'abstained';
    if (leading && expected.titles.some(title => simplified(title) === simplified(leading.title))
      && expected.artists.some(artist => simplified(artist) === simplified(leading.artist || ''))) identitySuggestion = 'correct';
    assert.notEqual(identitySuggestion, 'incorrect', 'The leading title/artist hypothesis disagreed with the labelled reference; inspect the saved response.');
  }
  return { identitySuggestion };
}

export async function runVisionAcceptance({ config = readAIConfig(), backend, fetchImpl = fetch,
  sources = createPublicCatalogues(), outputRoot = path.join(root, '.local-ai'), log = console.log } = {}) {
  const port = Number(process.env.PORT || 3000);
  assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535, 'PORT must be a valid local port.');
  backend ||= `http://127.0.0.1:${port}`;
  const address = new URL(backend);
  assert.ok(address.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)
    && !address.username && !address.password && address.pathname === '/' && !address.search && !address.hash, 'Acceptance checks require a local backend origin.');
  const reportFile = path.join(outputRoot, 'acceptance', `vision-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`);
  const report = { startedAt: new Date().toISOString(), completedAt: null, passed: false,
    scope: 'general_artwork_local_acceptance', backend, model: config.visionModel, responseBudgetMs: config.responseBudgetMs,
    training: { performed: false, method: 'pretrained_inference', labelledTrainingDataset: null },
    limitation: 'Two bundled paintings and one generated blank image are controlled acceptance inputs, not independent visitor photographs. Abstaining from identity is allowed. This does not establish arbitrary-artwork accuracy, fine-tuning, or a general false-positive rate.',
    checks: [], failures: [] };
  async function save() {
    await mkdir(path.dirname(reportFile), { recursive: true });
    const temporary = `${reportFile}.tmp`;
    await writeFile(temporary, JSON.stringify(report, null, 2));
    await rename(temporary, reportFile);
  }
  async function check(name, action) {
    const row = { name, passed: false };
    report.checks.push(row);
    const started = performance.now();
    log(`Checking ${name}; real CPU inference may take several minutes.`);
    const heartbeat = setInterval(() => log(`Waiting ${name}: ${Math.round((performance.now() - started) / 1000)} seconds.`), 15000);
    heartbeat.unref();
    try { await action(row); row.passed = true; log(`PASS ${name}`); }
    catch (error) { row.error = error.message; report.failures.push({ name, code: error.code || 'ACCEPTANCE_FAILED', message: error.message }); log(`FAIL ${name}: ${error.message}`); }
    finally { clearInterval(heartbeat); row.elapsedMs = Math.round(performance.now() - started); await save(); }
    return row.passed;
  }
  async function json(endpoint, init = {}) {
    const started = performance.now();
    let response;
    try { response = await fetchImpl(`${address.origin}${endpoint}`, { ...init, signal: AbortSignal.timeout(config.responseBudgetMs) }); }
    catch (error) { throw new Error(`Cannot reach ${address.origin}${endpoint} (${error.cause?.code || error.name}). Start the updated backend with npm.cmd run ai:up and check the root PORT setting.`); }
    let result;
    try { result = await response.json(); } catch { throw new Error(`${endpoint}: HTTP ${response.status}, invalid JSON. Check the backend port/version.`); }
    const responseMs = Math.round(performance.now() - started);
    assert.ok(response.ok, `${endpoint}: HTTP ${response.status}, ${result.code || ''} ${result.error || ''}`);
    if (endpoint === '/api/ai/artworks/analyse') assert.ok(responseMs < config.responseBudgetMs, `${endpoint} took ${responseMs} ms; target is below ${config.responseBudgetMs} ms.`);
    return { response, result, responseMs };
  }
  await save();
  const ready = await check('backend_model_and_browser_origin', async row => {
    const health = await json('/api/health');
    assert.equal(health.result.app, 'unframe');
    const { response, result } = await json('/api/ai/status?museumId=met', { headers: { Origin: 'http://localhost:8081' } });
    row.configuration = result.configuration; row.services = result.services;
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081', 'The browser origin is not allowed.');
    assert.equal(result.configuration?.visionModel, config.visionModel, 'Restart the updated backend.');
    assert.equal(result.configuration?.analysisVersion, 2, 'Restart the updated backend.');
    assert.equal(result.analysisReady, true, result.analysisMessage);
  });
  if (ready) {
    const cases = [
      { name: 'water_lilies', file: 'water-lilies.jpg', expected: { presence: 'likely', titles: ['Water Lilies', 'Nympheas', 'Nymphéas', '睡莲'], artists: ['Claude Monet', 'Monet', '克劳德·莫奈', '莫奈'] } },
      { name: 'harvesters', file: 'the-harvesters.jpg', expected: { presence: 'likely', titles: ['The Harvesters', 'Harvesters', 'The Corn Harvest', '收割者', '收割人'], artists: ['Pieter Bruegel the Elder', 'Pieter Bruegel', 'Bruegel', '老彼得·勃鲁盖尔', '彼得·勃鲁盖尔'] } },
      { name: 'blank_negative', expected: { presence: 'unlikely' } },
    ];
    for (const sample of cases) await check(sample.name, async row => {
      row.expected = sample.expected;
      const bytes = sample.file ? await readFile(path.join(root, 'mobile', 'assets', sample.file))
        : await sharp({ create: { width: 512, height: 512, channels: 3, background: 'white' } }).jpeg().toBuffer();
      const image = await normalizeImage(bytes, 'image/jpeg');
      row.inputSha256 = createHash('sha256').update(image).digest('hex');
      const form = new FormData(); form.set('image', new Blob([image], { type: 'image/jpeg' }), `${sample.name}.jpg`);
      const { result, responseMs } = await json('/api/ai/artworks/analyse', { method: 'POST', body: form });
      row.responseMs = responseMs;
      row.actual = result; // Only bundled/synthetic controls, never user photo contents.
      Object.assign(row, assessAnalysis(result, sample.expected));
    });
  }
  if (config.publicSearch) await check('public_source_search_and_reference_download', async row => {
    const signal = AbortSignal.timeout(45000);
    const result = await sources.search([{ title: 'Water Lilies', artist: 'Claude Monet' }], signal);
    row.providers = result.providers;
    row.references = result.records.map(({ id, sourceUrl }) => ({ id, sourceUrl }));
    assert.equal(result.providers.length, 3, 'Expected all three configured public sources.');
    assert.ok(result.providers.every(provider => provider.status === 'completed'), 'A public source is unavailable or partial; local analysis may work but full retrieval has not passed.');
    const imageSource = result.records.find(record => record.imageUrl);
    assert.ok(imageSource, 'No downloadable public reference image was returned.');
    const image = await sources.image(imageSource.imageUrl, signal);
    const normalized = await normalizeImage(image.bytes, image.mime);
    row.downloadedReference = { id: imageSource.id, sha256: createHash('sha256').update(normalized).digest('hex') };
  });
  else report.publicSearch = 'disabled_by_configuration';
  report.completedAt = new Date().toISOString();
  report.passed = ready && report.failures.length === 0 && report.checks.length === (config.publicSearch ? 5 : 4);
  report.summary = { checks: report.checks.length, checksPassed: report.checks.filter(row => row.passed).length,
    identitySuggestionsCorrect: report.checks.filter(row => row.identitySuggestion === 'correct').length,
    identityAbstentions: report.checks.filter(row => row.identitySuggestion === 'abstained').length,
    independentCameraAccuracy: null };
  await save();
  log(JSON.stringify({ passed: report.passed, ...report.summary, report: reportFile, limitation: report.limitation }, null, 2));
  return { report, reportFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2, 'Usage: npm.cmd run ai:validate:vision');
    const { report } = await runVisionAcceptance();
    if (!report.passed) process.exitCode = 1;
  } catch (error) { console.error(`Vision acceptance failed: ${error.message}`); process.exitCode = 1; }
}
