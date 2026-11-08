// Test-only preload: run the real worker/start.js with SDK boundaries mocked.
// Requires --network none, read-only reference fixtures and a writable /results.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { SQSClient } from '@aws-sdk/client-sqs';
import { S3Client } from '@aws-sdk/client-s3';
import { S3VectorsClient } from '@aws-sdk/client-s3vectors';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { cosineSimilarity, normalizedVector, referenceCatalogueHash } from '../server/ai/embeddings.js';

assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
const read = p => readFileSync(p, 'utf8');
const counters = p => Object.fromEntries(read(p).trim().split('\n').map(line => line.trim().split(/\s+/)).map(([k, v]) => [k, Number(v)]));
const began = Date.now(), cpuStart = counters('/sys/fs/cgroup/cpu.stat');
assert.equal(read('/sys/fs/cgroup/memory.max').trim(), '2147483648');
assert.equal(read('/sys/fs/cgroup/memory.swap.max').trim(), '0');
assert.equal(read('/sys/fs/cgroup/cpu.max').trim(), '50000 100000');
Object.assign(process.env, { JOBS_TABLE_NAME: 'mock-jobs', JOB_IMAGES_BUCKET: 'mock-images',
  RECOGNITION_QUEUE_URL: 'https://sqs.example/mock', AWS_EC2_METADATA_DISABLED: 'true',
  S3_VECTOR_INDEX_ARN: 'arn:aws:s3vectors:ap-southeast-2:123456789012:bucket/mock/index/mock',
  VECTOR_STORE: 's3vectors', AI_PROVIDER: 'bedrock', S3_VECTOR_VERSION: 'openclip-v1', ARTWORK_MATCH_THRESHOLD: '0.80', ARTWORK_PUBLIC_SEARCH: 'false' });
const references = JSON.parse(read('/fixtures/references.json'));
assert.equal(references.catalogueHash, referenceCatalogueHash());
assert.equal(references.model, 'ViT-B-32'); assert.equal(references.pretrained, 'laion2b_s34b_b79k');
assert.equal(references.dimension, 512); assert.equal(references.records.length, 15);
const photo = readFileSync('/fixtures/water-lilies.jpg');
const largePhoto = process.env.WORKER_TEST_STRESS_IMAGE ? readFileSync(process.env.WORKER_TEST_STRESS_IMAGE) : photo;
assert.ok(largePhoto.length <= 5 * 1024 * 1024);
const jobCount = Number(process.env.WORKER_TEST_JOBS || 12);
assert.ok(Number.isInteger(jobCount) && jobCount >= 4 && jobCount <= 100);
const jobs = Array.from({ length: jobCount }, (_, i) => ({ jobId: `12345678-1234-4234-8234-${String(i).padStart(12, '0')}`,
  museumId: i === 1 ? 'goma' : 'met', operation: 'recognise', status: 'WAITING_UPLOAD', attempts: 0,
  large: i >= jobCount - 3 && Boolean(process.env.WORKER_TEST_STRESS_IMAGE),
  bucket: 'mock-images', contentType: 'image/jpeg', sizeBytes: i >= jobCount - 3 ? largePhoto.length : photo.length,
  expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
for (const job of jobs) job.imageKey = `uploads/${job.jobId}/image`;
let active, cursor = 0, completed = 0, startupMs, settled = false, failure, healthChecks = 0;
let pythonRssPeak = 0, nodeRssPeak = 0, inferenceMemoryPeak = 0;
let pythonAnonPeak = 0, pythonFilePeak = 0;
const measurements = [], samples = [], queries = [];
function sample() {
  const memory = Number(read('/sys/fs/cgroup/memory.current'));
  const cpu = counters('/sys/fs/cgroup/cpu.stat');
  let pythonRss = 0, pythonProcesses = 0;
  for (const pid of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      const status = read(`/proc/${pid}/status`);
      if (/^Name:\s+python/m.test(status)) {
        pythonProcesses++; pythonRss += Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
        pythonAnonPeak = Math.max(pythonAnonPeak, Number(status.match(/^RssAnon:\s+(\d+)/m)?.[1] || 0) * 1024);
        pythonFilePeak = Math.max(pythonFilePeak, Number(status.match(/^RssFile:\s+(\d+)/m)?.[1] || 0) * 1024);
      }
    } catch {}
  }
  assert.ok(pythonProcesses <= 1, 'The model must be loaded in one Python process only');
  pythonRssPeak = Math.max(pythonRssPeak, pythonRss); nodeRssPeak = Math.max(nodeRssPeak, process.memoryUsage().rss);
  if (startupMs !== undefined) inferenceMemoryPeak = Math.max(inferenceMemoryPeak, memory);
  samples.push({ ms: Date.now() - began, memory, pythonRss, cpuUsec: cpu.usage_usec });
  return { memory, cpu };
}
const monitor = setInterval(() => { try { sample(); } catch (error) { failure = error.message; } }, 250); monitor.unref();
const watchdog = setTimeout(() => { failure = 'Verification exceeded 300 seconds'; process.kill(process.pid, 'SIGTERM'); }, 300000); watchdog.unref();
process.on('exit', code => {
  clearInterval(monitor); clearTimeout(watchdog); sample();
  const elapsedMs = Date.now() - began, cpu = counters('/sys/fs/cgroup/cpu.stat');
  const summary = { status: code === 0 && settled && !failure ? 'PASS' : 'FAIL', exitCode: code, failure,
    scope: 'Real OpenCLIP and production worker entrypoint; all AWS SDK sends mocked; network disabled',
    threads: process.env.OPENCLIP_THREADS, startupMs, elapsedMs, completed, healthChecks,
    memoryPeakBytes: Number(read('/sys/fs/cgroup/memory.peak')), inferenceMemoryPeak, pythonRssPeak, nodeRssPeak,
    pythonAnonPeak, pythonFilePeak, memoryStat: counters('/sys/fs/cgroup/memory.stat'),
    memoryEvents: counters('/sys/fs/cgroup/memory.events'), cpuUsageUsec: cpu.usage_usec - cpuStart.usage_usec,
    cpuPercentOneCore: (cpu.usage_usec - cpuStart.usage_usec) / (elapsedMs * 10), cpu,
    measurements, queries, samples };
  writeFileSync('/results/summary.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, samples: undefined, queries: undefined }));
  if (summary.status !== 'PASS') process.exitCode = 1;
});

S3VectorsClient.prototype.send = async function(command) {
  if (command.constructor.name === 'GetIndexCommand') {
    startupMs = Date.now() - began;
    const identity = await (await fetch('http://127.0.0.1:8001/health')).json();
    assert.deepEqual([identity.model, identity.pretrained, identity.dimensions, identity.normalized], ['ViT-B-32', 'laion2b_s34b_b79k', 512, true]);
    return { index: { dimension: 512, distanceMetric: 'cosine', dataType: 'float32' } };
  }
  assert.equal(command.constructor.name, 'QueryVectorsCommand');
  const { filter, queryVector, topK } = command.input;
  assert.equal(filter.$and.length, 5);
  const fields = Object.fromEntries(filter.$and.map(item => { const [key, comparison] = Object.entries(item)[0]; assert.deepEqual(Object.keys(comparison), ['$eq']); return [key, comparison.$eq]; }));
  assert.deepEqual(fields, { model: 'ViT-B-32', pretrained: 'laion2b_s34b_b79k', version: 'openclip-v1', catalogueHash: referenceCatalogueHash(), museumId: active.museumId });
  assert.ok(normalizedVector(queryVector.float32, 512));
  if (!queries.length) writeFileSync('/results/embedding.json', JSON.stringify(queryVector.float32));
  const vectors = references.records.filter(r => r.museumId === fields.museumId).map(r => ({ key: r.artworkId,
    distance: 1 - cosineSimilarity(queryVector.float32, r.vector), metadata: { ...fields, artworkId: r.artworkId, sourceHash: r.sourceHash, imageHash: r.imageHash } }))
    .sort((a, b) => a.distance - b.distance).slice(0, topK);
  queries.push({ jobId: active.jobId, fields, norm: Math.hypot(...queryVector.float32), top: vectors.slice(0, 3).map(v => ({ artworkId: v.key, similarity: 1 - v.distance })) });
  return { distanceMetric: 'cosine', vectors };
};
DynamoDBDocumentClient.prototype.send = async function(command) {
  const { Key, ExpressionAttributeValues: values } = command.input;
  const job = jobs.find(j => j.jobId === Key.jobId); assert.ok(job);
  if (command.constructor.name === 'GetCommand') return { Item: { ...job } };
  assert.equal(command.constructor.name, 'UpdateCommand');
  if (values[':one']) { job.status = 'PROCESSING'; job.attempts++; job.leaseOwner = values[':owner']; return { Attributes: { ...job } }; }
  assert.equal(values[':owner'], job.leaseOwner);
  if (values[':result']) {
    const result = values[':result']; assert.ok(result.candidates.length <= 3); assert.equal(result.requiresConfirmation, true);
    assert.ok(result.candidates.every((c, i, list) => c.similarity >= .8 && (!i || list[i - 1].similarity >= c.similarity)));
    if (job.museumId === 'met') { assert.equal(result.artwork.id, 'water-lilies'); assert.ok(result.similarity > .8); }
    else { assert.equal(result.matched, false); assert.equal(result.candidates.length, 0); }
    job.status = 'SUCCEEDED'; job.result = result; return {};
  }
  failure = 'Production processor reported a job failure'; throw new Error(failure);
};
S3Client.prototype.send = async function(command) {
  assert.equal(command.input.Key, active.imageKey);
  if (command.constructor.name === 'GetObjectCommand') return { Body: Readable.from([active.large ? largePhoto : photo]), ContentLength: active.sizeBytes, ContentType: 'image/jpeg', ETag: '"fixture"' };
  assert.equal(command.constructor.name, 'DeleteObjectCommand'); assert.equal(active.status, 'SUCCEEDED'); active.deleted = true; return {};
};
BedrockRuntimeClient.prototype.send = async () => { throw new Error('Recognition must not invoke Bedrock'); };
SQSClient.prototype.send = async function(command, options) {
  if (command.constructor.name === 'DeleteMessageCommand') {
    assert.equal(active.deleted, true);
    const end = sample();
    measurements.push({ jobId: active.jobId, museumId: active.museumId, large: active.large, durationMs: Date.now() - active.started,
      cpuUsec: end.cpu.usage_usec - active.cpuStart, memoryBytes: end.memory,
      candidates: active.result.candidates.map(c => ({ artworkId: c.artwork.id, similarity: c.similarity })) });
    completed++; active = undefined; return {};
  }
  assert.equal(command.constructor.name, 'ReceiveMessageCommand'); assert.equal(command.input.MaxNumberOfMessages, 1); assert.equal(command.input.VisibilityTimeout, 300);
  assert.equal(active, undefined, 'Only one in-flight job allowed');
  if (cursor === jobs.length) {
    await promisify(execFile)(process.execPath, ['worker/healthcheck.js']); healthChecks++;
    writeFileSync('/results/idle.json', JSON.stringify({ completed, healthChecks }));
    await delay(35000, undefined, { signal: options.abortSignal });
    await promisify(execFile)(process.execPath, ['worker/healthcheck.js']); healthChecks++;
    settled = true; process.kill(process.pid, 'SIGTERM'); return {};
  }
  await promisify(execFile)(process.execPath, ['worker/healthcheck.js']); healthChecks++;
  active = jobs[cursor++]; active.started = Date.now(); active.cpuStart = counters('/sys/fs/cgroup/cpu.stat').usage_usec;
  return { Messages: [{ ReceiptHandle: active.jobId, Body: JSON.stringify({ Records: [{ eventSource: 'aws:s3', eventName: 'ObjectCreated:Put',
    s3: { bucket: { name: active.bucket }, object: { key: active.imageKey, size: active.sizeBytes, eTag: 'fixture' } } }] }) }] };
};
