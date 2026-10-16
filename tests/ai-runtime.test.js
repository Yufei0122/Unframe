import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

async function mockServer(t, responseFor) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responseFor(req.url)));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function runtime(env) {
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const instance = await import(`../scripts/ai-runtime.mjs?test=${randomUUID()}`);
  return { ...instance, restore() { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } } };
}

const clipIdentity = { status: 'ok', model: 'ViT-B-32', pretrained: 'laion2b_s34b_b79k', dimensions: 512, normalized: true };

test('interactive profile migrates legacy slow defaults without overwriting explicit tuning', async () => {
  const api = await runtime({});
  const env = { OLLAMA_TIMEOUT_MS: '300000', OLLAMA_NUM_GPU: '0', OLLAMA_NUM_CTX: '3072' };
  const changed = api.applyInteractivePerformanceProfile(env);
  assert.equal(env.AI_RESPONSE_BUDGET_MS, '15000');
  assert.equal(env.OLLAMA_TIMEOUT_MS, '14000'); assert.equal(env.OLLAMA_NUM_GPU, '-1');
  assert.equal(env.OLLAMA_NUM_CTX, '3072', 'A non-legacy custom value must be preserved.');
  assert.ok(changed.includes('OLLAMA_TIMEOUT_MS') && !changed.includes('OLLAMA_NUM_CTX'));
  api.restore();
});

test('reused OpenCLIP and Ollama survive shutdown while owned subprocess is stopped', { timeout: 15000 }, async t => {
  const clip = await mockServer(t, () => clipIdentity);
  const ollama = await mockServer(t, () => ({ version: 'test-only' }));
  const api = await runtime({ OPENCLIP_URL: clip, OLLAMA_URL: ollama });
  t.after(api.restore);
  t.after(api.stopOwned);
  assert.equal((await api.ensureClip()).reused, true);
  assert.equal((await api.ensureOllama()).reused, true);
  const owned = api.spawnOwned(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await once(owned, 'spawn');
  api.stopOwned();
  const result = await owned.result;
  assert.ok(result.code !== 0 || result.signal);
  assert.equal((await api.getJSON(`${clip}/health`)).status, 'ok');
  assert.equal((await api.getJSON(`${ollama}/api/version`)).version, 'test-only');
});

test('incompatible preexisting embedding service is rejected and remains running', async t => {
  const address = await mockServer(t, () => ({ ...clipIdentity, dimensions: 1408 }));
  const api = await runtime({ OPENCLIP_URL: address });
  t.after(api.restore);
  await assert.rejects(api.ensureClip(), /different model identity/);
  api.stopOwned();
  assert.equal((await api.getJSON(`${address}/health`)).dimensions, 1408);
});

test('a remote Ollama alias cannot satisfy the local model requirement', async t => {
  const address = await mockServer(t, () => ({ models: [{ name: 'qwen3:4b', remote_model: 'qwen3:4b', remote_host: 'example.invalid' }] }));
  const api = await runtime({ OLLAMA_URL: address, OLLAMA_MODEL: 'qwen3:4b' });
  t.after(api.restore);
  await assert.rejects(api.requireOllamaModel(), /remote model alias/);
  await assert.rejects(api.pullOllamaModel(), /remote model alias/);
  api.stopOwned();
  assert.equal((await api.getJSON(`${address}/api/tags`)).models[0].remote_model, 'qwen3:4b');
});

test('managed Python stdin EOF closes the actual interpreter and its HTTP listener gracefully', { timeout: 15000 }, async t => {
  const api = await runtime({});
  if (!existsSync(api.python)) return t.skip('Run ai:setup to install the local Python environment.');
  t.after(api.stopOwned);
  const code = [
    'import sys',
    'sys.path.insert(0, "local-ai")',
    'from http.server import ThreadingHTTPServer',
    'from server import make_handler, serve',
    'from model import IDENTITY',
    'server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(lambda image: [1.0] + [0.0] * 511, IDENTITY))',
    'print(server.server_port, flush=True)',
    'serve(server, managed_stdin=True)',
  ].join('\n');
  const owned = api.spawnOwned(api.python, ['-u', '-c', code], { managedStdin: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const [ready] = await once(owned.stdout, 'data');
  const port = Number(ready.toString().trim());
  assert.ok(Number.isInteger(port) && port > 0);
  const address = `http://127.0.0.1:${port}`;
  assert.equal((await api.getJSON(`${address}/health`)).status, 'ok');
  await api.stopOwned();
  const result = await owned.result;
  assert.equal(result.code, 0, 'The service must shut down on EOF before force termination.');
  assert.equal(await api.getJSON(`${address}/health`), null, 'The descendant HTTP listener must also be gone.');
});

test('same-workspace backend with stale Google configuration is rejected without stopping it', async t => {
  let workspace;
  const address = await mockServer(t, url => url.startsWith('/api/health')
    ? { app: 'unframe', status: 'ok', workspace }
    : { configuration: { embeddingModel: 'multimodalembedding@001', geminiModel: 'old-model' } });
  const api = await runtime({ PORT: new URL(address).port });
  t.after(api.restore);
  const dataFile = path.resolve(process.env.UNFRAME_DATA_DIR || path.join(api.root, 'data'), 'unframe.json');
  workspace = createHash('sha256').update(process.platform === 'win32' ? dataFile.toLowerCase() : dataFile).digest('hex');
  await assert.rejects(api.ensureNode(), /older or different AI configuration/);
  api.stopOwned();
  assert.equal((await api.getJSON(`${address}/api/health`)).workspace, workspace);
});

test('route-only startup reuses a compatible backend without checking image services or indexes', async t => {
  let workspace;
  const urls = [];
  const address = await mockServer(t, url => {
    urls.push(url);
    if (url === '/api/health') return { app: 'unframe', status: 'ok', workspace };
    assert.equal(url, '/api/ai/planning/status');
    return { ready: true, configuration: { provider: 'local', ollamaModel: 'qwen3:4b', planningVersion: 3 } };
  });
  const api = await runtime({ PORT: new URL(address).port, OLLAMA_MODEL: 'qwen3:4b' });
  t.after(api.restore);
  const dataFile = path.resolve(process.env.UNFRAME_DATA_DIR || path.join(api.root, 'data'), 'unframe.json');
  workspace = createHash('sha256').update(process.platform === 'win32' ? dataFile.toLowerCase() : dataFile).digest('hex');
  assert.equal((await api.ensureNode({ planningOnly: true })).reused, true);
  assert.deepEqual(urls, ['/api/health', '/api/ai/planning/status']);
});
