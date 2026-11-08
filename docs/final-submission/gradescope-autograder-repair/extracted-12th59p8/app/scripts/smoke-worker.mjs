// Run in the built worker image with --network none and no AWS credentials.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { readAIConfig } from '../server/ai/config.js';
import { createEmbeddingService, normalizedVector } from '../server/ai/embeddings.js';
import { normalizeImage } from '../server/ai/images.js';
import { runWorker } from '../worker/worker.js';

assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
assert.equal(process.versions.node.split('.')[0], '22');
assert.equal(process.getuid(), 10001); assert.equal(typeof runWorker, 'function');
assert.equal(process.env.OPENCLIP_DEVICE, 'cpu'); assert.equal(process.env.HF_HUB_OFFLINE, '1');
const startedAt = Date.now();
const python = spawn(process.env.PYTHON_EXE, ['-u', 'local-ai/server.py', '--managed-stdin'], { stdio: ['pipe', 'inherit', 'inherit'] });
let exited = false;
const stopped = new Promise(resolve => { python.once('exit', () => { exited = true; resolve(); }); python.once('error', () => { exited = true; resolve(); }); });
try {
  let health;
  for (let i = 0; i < 120 && !exited; i++) {
    try {
      const response = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) { health = await response.json(); break; }
    } catch {}
    await delay(1000);
  }
  assert.ok(health, 'OpenCLIP did not become healthy within the worker startup budget (120 polls).');
  const startupMs = Date.now() - startedAt;
  assert.equal(health?.model, 'ViT-B-32'); assert.equal(health?.pretrained, 'laion2b_s34b_b79k');
  assert.equal(health?.device, 'cpu'); assert.equal(health?.dimensions, 512); assert.equal(health?.normalized, true);
  const image = await sharp({ create: { width: 256, height: 256, channels: 3, noise: { type: 'gaussian', mean: 120, sigma: 25 } } }).jpeg().toBuffer();
  const vector = await createEmbeddingService(readAIConfig()).generate(await normalizeImage(image));
  assert.ok(normalizedVector(vector, 512));
  await writeFile('/tmp/unframe-worker-ready', String(Date.now()));
  await promisify(execFile)(process.execPath, ['worker/healthcheck.js']);
  console.log(JSON.stringify({ status: 'PASS', platform: process.platform, arch: process.arch, node: process.versions.node,
    uid: process.getuid(), model: health.model, pretrained: health.pretrained, device: health.device,
    dimensions: vector.length, norm: Math.hypot(...vector), startupMs, healthcheck: 'PASS', network: 'disabled' }));
} finally {
  python.stdin.end();
  if (!exited) python.kill('SIGTERM');
  await stopped;
}
