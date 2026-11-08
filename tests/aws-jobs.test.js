import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { readCloudConfig } from '../server/cloud/config.js';
import { createJobService } from '../server/cloud/jobs.js';
import { createJobsHandler } from '../server/cloud/handlers.js';
import { createJobRepository } from '../server/cloud/job-repository.js';
import { createUploads } from '../server/cloud/uploads.js';
import { createMessageProcessor, parseJobMessage } from '../worker/process-job.js';
import { diagnosticMethods } from '../server/ai/diagnostics.js';

const config = readCloudConfig({ JOBS_TABLE_NAME: 'mock-jobs', JOB_IMAGES_BUCKET: 'mock-images', RECOGNITION_QUEUE_URL: 'https://sqs.example/queue', JOBS_ALLOWED_ORIGINS: 'https://app.example' }, { worker: true });
const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).jpeg().toBuffer();
const jobId = '12345678-1234-4234-8234-123456789012';
const notification = (id = jobId) => JSON.stringify({ Records: [{ eventSource: 'aws:s3', eventName: 'ObjectCreated:Put', s3: { bucket: { name: config.bucket }, object: { key: `uploads/${id}/image`, size: bytes.length, eTag: 'test-etag' } } }] });
function fixture() {
  const events = [], logs = [];
  let job = { jobId, status: 'WAITING_UPLOAD', imageKey: `uploads/${jobId}/image`, bucket: config.bucket, sizeBytes: bytes.length, contentType: 'image/jpeg', operation: 'recognise', museumId: 'met', attempts: 0, expiresAt: 1000 };
  const repository = {
    get: async () => job,
    claim: async (_, owner) => { events.push('claim'); if (job.status === 'PROCESSING') throw Object.assign(new Error('lease'), { name: 'ConditionalCheckFailedException' }); job = { ...job, status: 'PROCESSING', leaseOwner: owner, attempts: job.attempts + 1 }; return job; },
    complete: async (_, owner, result) => { events.push('complete'); assert.equal(job.leaseOwner, owner); job = { ...job, status: 'SUCCEEDED', result }; },
    fail: async (_, owner) => { events.push('fail'); assert.equal(job.leaseOwner, owner); job = { ...job, status: job.attempts >= config.maxAttempts ? 'FAILED' : 'RETRYING' }; },
  };
  const uploads = { read: async () => { events.push('read'); return bytes; }, remove: async () => { events.push('delete-image'); } };
  const dependencies = { config, repository, uploads, now: () => 100, log: data => logs.push(data),
    infer: async () => { events.push('infer'); return { matched: false, candidates: [], requiresConfirmation: true }; },
    acknowledge: async () => { events.push('ack'); } };
  return { events, logs, repository, uploads, dependencies, job: () => job };
}

test('SQS validation accepts S3 notifications and rejects foreign/malformed/oversized messages', () => {
  const result = parseJobMessage(notification(), config);
  assert.equal(result.jobId, jobId); assert.equal(result.key, `uploads/${jobId}/image`);
  for (const body of ['invalid', '{}', notification('bad-id'), notification().replace('mock-images', 'foreign-bucket'), notification().replace('ObjectCreated:Put', 'ObjectRemoved:Delete'), notification().replace('uploads/', 'other/'), 'x'.repeat(262145)]) assert.throws(() => parseJobMessage(body, config));
  assert.equal(parseJobMessage(JSON.stringify({ Event: 's3:TestEvent', Bucket: config.bucket }), config), null);
});

test('successful processing saves result before deleting image and acknowledging; duplicate avoids inference', async () => {
  const f = fixture(), process = createMessageProcessor(f.dependencies);
  const message = { Body: notification(), ReceiptHandle: 'receipt' };
  await process(message);
  assert.deepEqual(f.events, ['claim', 'read', 'infer', 'complete', 'delete-image', 'ack']);
  assert.equal(f.job().status, 'SUCCEEDED');
  f.events.length = 0;
  await process(message);
  assert.deepEqual(f.events, ['delete-image', 'ack']);
  assert.ok(f.logs.every(row => row.jobId === jobId));
});

test('processing failures preserve input and message and make job retryable', async () => {
  for (const stage of ['read', 'infer', 'complete']) {
    const f = fixture();
    const fail = async () => { throw new Error('mock failure'); };
    if (stage === 'read') f.uploads.read = fail;
    if (stage === 'infer') f.dependencies.infer = fail;
    if (stage === 'complete') f.repository.complete = fail;
    await assert.rejects(createMessageProcessor(f.dependencies)({ Body: notification(), ReceiptHandle: 'r' }));
    assert.ok(!f.events.includes('delete-image')); assert.ok(!f.events.includes('ack'));
    assert.equal(f.job().status, 'RETRYING');
    const logged = f.logs.find(row => row.event === 'job_failed');
    assert.equal(logged.stage, { read: 's3_get_object', infer: 'inference', complete: 'dynamodb_complete' }[stage]);
    assert.equal(logged.exceptionType, 'Error'); assert.equal(logged.code, 'PROCESSING_FAILED');
  }
});

test('cleanup or acknowledgement failure retains durable success and retries without inference', async () => {
  for (const stage of ['remove', 'acknowledge']) {
    const f = fixture(); let fail = true;
    if (stage === 'remove') f.uploads.remove = async () => { if (fail) throw new Error('delete failed'); f.events.push('delete-image'); };
    else f.dependencies.acknowledge = async () => { if (fail) throw new Error('ack failed'); f.events.push('ack'); };
    const process = createMessageProcessor(f.dependencies), message = { Body: notification(), ReceiptHandle: 'r' };
    await assert.rejects(process(message)); assert.equal(f.job().status, 'SUCCEEDED'); assert.ok(!f.events.includes('fail'));
    assert.equal(f.logs.find(row => row.event === 'job_cleanup_retry').stage, stage === 'remove' ? 's3_delete_object' : 'sqs_delete');
    fail = false; f.events.length = 0; await process(message);
    assert.deepEqual(f.events, ['delete-image', 'ack']);
  }
});

test('worker failure logs keep nested vector errors separate from retry-state update failures', async () => {
  const f = fixture();
  const failure = Object.assign(new Error('do not log private upload URL or token'), { name: 'ValidationException', $metadata: { requestId: '12345678-1234-4234-8234-123456789012', httpStatusCode: 400 } });
  const store = diagnosticMethods({ search: async () => { throw failure; } }, { search: 's3vectors_query' });
  f.dependencies.infer = () => store.search();
  f.repository.fail = async () => { throw Object.assign(new Error('private'), { name: 'AccessDeniedException' }); };
  await assert.rejects(createMessageProcessor(f.dependencies)({ Body: notification(), ReceiptHandle: 'private-token' }), e => e === failure);
  const logged = f.logs.find(row => row.event === 'job_failed');
  assert.equal(logged.stage, 's3vectors_query'); assert.equal(logged.awsErrorCode, 'ValidationException');
  assert.equal(logged.httpStatusCode, 400); assert.equal(logged.attempt, 1); assert.ok(logged.elapsedMs >= 0);
  const state = f.logs.find(row => row.event === 'job_state_update_failed');
  assert.equal(state.stage, 'dynamodb_fail'); assert.equal(state.awsErrorCode, 'AccessDeniedException');
  assert.ok(!JSON.stringify(f.logs).includes('private')); assert.ok(!f.events.includes('delete-image')); assert.ok(!f.events.includes('ack'));
});

test('malformed messages and active leases are not acknowledged or deleted', async () => {
  const f = fixture();
  await assert.rejects(createMessageProcessor(f.dependencies)({ Body: 'garbage', ReceiptHandle: 'r' }));
  assert.deepEqual(f.events, []);
  await f.repository.claim(jobId, 'another-worker'); f.events.length = 0;
  await assert.rejects(createMessageProcessor(f.dependencies)({ Body: notification(), ReceiptHandle: 'r' }));
  assert.deepEqual(f.events, ['claim']); assert.equal(f.job().status, 'PROCESSING');
});

test('retry limit produces FAILED without deleting message or temporary image', async () => {
  const f = fixture(); f.dependencies.infer = async () => { throw new Error('bad image'); };
  const process = createMessageProcessor(f.dependencies), message = { Body: notification(), ReceiptHandle: 'r' };
  for (let i = 0; i < config.maxAttempts; i++) await assert.rejects(process(message));
  assert.equal(f.job().status, 'FAILED');
  await assert.rejects(process(message));
  assert.ok(!f.events.includes('ack')); assert.ok(!f.events.includes('delete-image'));
});

test('job creation validates input, stores only token hash, and status hides internal fields', async () => {
  let stored;
  const service = createJobService({ config, now: () => 100, repository: { create: async job => { stored = job; }, get: async () => stored },
    uploads: { presign: async () => ({ url: 'https://mock-images.example/upload', headers: { 'Content-Type': 'image/jpeg' }, expiresAt: 400 }) } });
  for (const input of [null, [], {}, { contentType: 'image/jpeg', sizeBytes: 9e9 }, { contentType: 'image/jpeg', sizeBytes: 10, museumId: 'invented' }, { contentType: 'image/jpeg', sizeBytes: 10, imageKey: 'escape' }]) await assert.rejects(service.create(input));
  const created = await service.create({ contentType: 'image/jpeg', sizeBytes: bytes.length, museumId: 'met' });
  assert.equal(stored.status, 'WAITING_UPLOAD'); assert.equal(stored.readToken, undefined); assert.notEqual(stored.tokenHash, created.readToken);
  const status = await service.get(created.jobId, created.readToken);
  assert.equal(status.imageKey, undefined); assert.equal(status.tokenHash, undefined); assert.equal(status.result, undefined);
  await assert.rejects(service.get(created.jobId, 'f'.repeat(64)), { status: 404 });
  stored = { ...stored, expiresAt: 99 };
  await assert.rejects(service.get(created.jobId, created.readToken), { status: 410 });
});

test('API Gateway v1/v2 parsing is isolated and handles CORS, content type and malformed JSON', async () => {
  const calls = [];
  const handler = createJobsHandler({ create: async input => { calls.push(input); return { jobId }; }, get: async (id, token) => ({ jobId: id, token }) }, config);
  const post = { rawPath: '/a3/jobs', requestContext: { http: { method: 'POST' } }, headers: { 'Content-Type': 'application/json', Origin: 'https://app.example' }, body: '{"museumId":"met"}' };
  assert.equal((await handler(post)).statusCode, 201); assert.deepEqual(calls, [{ museumId: 'met' }]);
  assert.equal((await handler({ ...post, body: '{' })).statusCode, 400);
  assert.equal((await handler({ ...post, headers: { origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await handler({ ...post, headers: {} })).statusCode, 415);
  assert.equal((await handler({ ...post, body: 'x'.repeat(2049) })).statusCode, 413);
  const get = await handler({ httpMethod: 'GET', path: `/a3/jobs/${jobId}`, headers: { 'X-Job-Token': 'token' } });
  assert.equal(JSON.parse(get.body).token, 'token');
});

function httpV2Event(method, rawPath, stage = '$default') {
  const routeKey = method === 'POST' ? 'POST /a3/jobs' : 'GET /a3/jobs/{jobId}';
  return { version: '2.0', routeKey, rawPath, rawQueryString: '',
    headers: { 'content-type': 'application/json', origin: 'https://app.example', 'x-job-token': 'test-token' },
    requestContext: { accountId: '123456789012', apiId: 'test-api', domainName: 'test-api.execute-api.ap-southeast-2.amazonaws.com',
      http: { method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: '192.0.2.1', userAgent: 'routing-test' },
      requestId: 'test-request', routeKey, stage, time: '31/Oct/2026:00:00:00 +0000', timeEpoch: 1793404800000 },
    ...(method === 'GET' ? { pathParameters: { jobId } } : { body: JSON.stringify({ museumId: 'met', operation: 'recognise', contentType: 'image/jpeg', sizeBytes: bytes.length }) }),
    isBase64Encoded: false };
}

test('HTTP API v2 routes POST and GET with default, named and already-stripped stages', async () => {
  for (const [stage, prefix] of [['$default', ''], ['prod', '/prod'], ['prod', ''], ['a3', '/a3'], ['a3', '']]) {
    const calls = [];
    const handler = createJobsHandler({
      create: async input => { calls.push(['create', input]); return { jobId }; },
      get: async (id, token) => { calls.push(['get', id, token]); return { jobId: id }; },
    }, config);
    const post = httpV2Event('POST', `${prefix}/a3/jobs`, stage);
    const expectedInput = JSON.parse(post.body);
    // Base64 JSON must still reach the existing body parser after routing.
    post.body = Buffer.from(post.body).toString('base64'); post.isBase64Encoded = true;
    assert.equal((await handler(post)).statusCode, 201, `POST stage=${stage} prefix=${prefix}`);
    const response = await handler(httpV2Event('GET', `${prefix}/a3/jobs/${jobId}`, stage));
    assert.equal(response.statusCode, 200, `GET stage=${stage} prefix=${prefix}`);
    assert.deepEqual(JSON.parse(response.body), { jobId });
    assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://app.example');
    assert.deepEqual(calls, [['create', expectedInput], ['get', jobId, 'test-token']]);
  }
});

test('HTTP API v2 stage normalization does not accept foreign prefixes or unrelated routes', async () => {
  let calls = 0;
  const handler = createJobsHandler({ create: async () => { calls++; }, get: async () => { calls++; } }, config);
  for (const [method, path, stage] of [
    ['POST', '/production/a3/jobs', 'prod'], ['POST', '/other/a3/jobs', 'prod'],
    ['POST', '/prod/prod/a3/jobs', 'prod'], ['POST', '/prod/a3/jobs', '$default'],
    ['POST', '/$default/a3/jobs', '$default'], ['POST', '/prod/jobs', 'prod'],
    ['GET', `/prod/a3/jobs/${jobId}/extra`, 'prod'], ['DELETE', '/prod/a3/jobs', 'prod'],
  ]) {
    const response = await handler(httpV2Event(method, path, stage));
    assert.equal(response.statusCode, 404, `${method} ${path} stage=${stage}`);
    assert.equal(JSON.parse(response.body).code, 'NOT_FOUND');
  }
  assert.equal(calls, 0);
});

test('HTTP API v2 named-stage routes preserve job creation and read-token authentication', async () => {
  let stored;
  const upload = { url: 'https://mock.example/upload', headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' }, expiresAt: 400 };
  const handler = createJobsHandler(createJobService({ config, now: () => 100,
    repository: { create: async job => { stored = job; }, get: async () => stored },
    uploads: { presign: async () => upload },
  }), config);
  const created = await handler(httpV2Event('POST', '/prod/a3/jobs', 'prod'));
  assert.equal(created.statusCode, 201);
  const result = JSON.parse(created.body);
  assert.deepEqual(result.upload, upload); assert.equal(stored.status, 'WAITING_UPLOAD');
  const get = httpV2Event('GET', `/prod/a3/jobs/${result.jobId}`, 'prod');
  get.pathParameters.jobId = result.jobId;
  get.headers['x-job-token'] = result.readToken;
  const status = await handler(get);
  assert.equal(status.statusCode, 200); assert.equal(JSON.parse(status.body).jobId, result.jobId);
  assert.equal(JSON.parse(status.body).tokenHash, undefined);
  for (const token of [undefined, 'f'.repeat(64)]) {
    get.headers['x-job-token'] = token;
    const denied = await handler(get);
    assert.equal(denied.statusCode, 404); assert.equal(JSON.parse(denied.body).code, 'JOB_NOT_FOUND');
  }
});

test('DynamoDB transitions use conditional ownership, expiry, retries, consistent reads and bounded results', async () => {
  const commands = [];
  const repository = createJobRepository(config, { send: async command => { commands.push(command.input); return { Attributes: { attempts: 1 }, Item: { jobId } }; } });
  await repository.create({ jobId }); await repository.get(jobId); await repository.claim(jobId, 'owner', 100);
  await repository.complete(jobId, 'owner', { candidates: [] }, 101); await repository.fail(jobId, 'owner', 5, 102);
  assert.equal(commands[0].ConditionExpression, 'attribute_not_exists(jobId)'); assert.equal(commands[1].ConsistentRead, true);
  assert.ok(commands[2].ConditionExpression.includes('expiresAt > :now')); assert.equal(commands[2].ExpressionAttributeValues[':lease'], 400);
  assert.ok(commands[3].ConditionExpression.includes('leaseOwner = :owner')); assert.equal(commands[3].ExpressionAttributeValues[':success'], 'SUCCEEDED');
  assert.equal(commands[4].ExpressionAttributeValues[':next'], 'FAILED');
  await assert.rejects(repository.complete(jobId, 'owner', { data: 'x'.repeat(300001) }, 101));
});

test('presigned uploads prevent overwrites; versioned cleanup deletes the actual uploaded version', async () => {
  let signed, deleted;
  const uploads = createUploads(config, { send: async command => { deleted = command.input; } }, async (_, command, options) => { signed = { input: command.input, options }; return 'https://mock.example/signed'; });
  const result = await uploads.presign({ imageKey: `uploads/${jobId}/image`, contentType: 'image/jpeg', createdAt: 100 });
  assert.equal(signed.input.IfNoneMatch, '*'); assert.equal(result.headers['If-None-Match'], '*'); assert.equal(signed.options.expiresIn, 300);
  await uploads.remove({ key: `uploads/${jobId}/image`, versionId: 'specific-version' });
  assert.equal(deleted.VersionId, 'specific-version');
});

test('visibility must exceed processing deadline and cloud config has no resource-name defaults', () => {
  assert.throws(() => readCloudConfig({}));
  assert.throws(() => readCloudConfig({ JOBS_TABLE_NAME: 'x', JOB_IMAGES_BUCKET: 'x', RECOGNITION_QUEUE_URL: 'x', WORKER_VISIBILITY_SECONDS: '90', WORKER_JOB_TIMEOUT_MS: '180000' }, { worker: true }));
});

test('S3 reads enforce the recorded size/type/ETag and read the event object version', async () => {
  let command;
  const job = { imageKey: `uploads/${jobId}/image`, sizeBytes: bytes.length, contentType: 'image/jpeg' };
  const event = { versionId: 'v1', etag: 'test-etag' };
  const uploads = createUploads(config, { send: async cmd => { command = cmd; return { Body: Readable.from([bytes]), ContentLength: bytes.length, ContentType: 'image/jpeg', ETag: '"test-etag"' }; } });
  assert.deepEqual(await uploads.read(job, event), bytes); assert.equal(command.input.VersionId, 'v1');
  for (const fields of [{ ContentLength: 10000000 }, { ContentType: 'text/html' }, { ETag: '"different"' }, { Body: Readable.from([bytes.subarray(0, 3)]) }]) {
    const bad = createUploads(config, { send: async () => ({ Body: Readable.from([bytes]), ContentLength: bytes.length, ContentType: 'image/jpeg', ETag: '"test-etag"', ...fields }) });
    await assert.rejects(bad.read(job, event));
  }
});

test('invalid image bytes cannot save a successful result or delete the input', async () => {
  const f = fixture(); f.uploads.read = async () => Buffer.from('not an image');
  await assert.rejects(createMessageProcessor(f.dependencies)({ Body: notification(), ReceiptHandle: 'r' }));
  assert.equal(f.job().status, 'RETRYING');
  assert.ok(!f.events.some(x => ['complete', 'infer', 'delete-image', 'ack'].includes(x)));
});
