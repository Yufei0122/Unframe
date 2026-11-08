// One explicitly authorized real recognition run. No ECS/scaling/IAM mutations.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { runRecognitionLoad } from './load-recognition-jobs.mjs';

if (!process.argv.includes('--execute')) { console.log('Prepared only; --execute submits the single authorized bounded workload.'); process.exit(0); }
const dir = 'verification/2026-10-31/scaling-max-three/run-01';
try { await mkdir(dir); } // Refuse any rerun after submission could have started.
catch (error) {
  if (error.code !== 'EEXIST' || !process.argv.includes('--resume-preflight')) throw error;
  const previous = JSON.parse(await readFile(`${dir}/run-summary.json`, 'utf8'));
  assert.equal(previous.startedAt, null); assert.equal(previous.created, 0); assert.equal(previous.loadResult, undefined);
  await writeFile(`${dir}/preflight-failure.json`, JSON.stringify(previous, null, 2), { flag: 'wx' });
}
const exec = promisify(execFile), region = 'ap-southeast-2';
const cluster = 'n12281212-strobe-a2', service = 'a3-n12281212-unframe-worker', resource = `service/${cluster}/${service}`;
const table = 'a3-n12281212-unframe-jobs', logGroup = '/ecs/a3-n12281212-unframe-worker';
const base = 'https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob';
// Reuse the CLI's supported login-session provider; credentials never leave process memory.
let cachedCredentials;
const credentials = async () => {
  if (cachedCredentials && (!cachedCredentials.expiration || cachedCredentials.expiration.getTime() > Date.now() + 60000)) return cachedCredentials;
  const response = await exec('aws', ['configure', 'export-credentials', '--profile', 'default', '--format', 'process'], { windowsHide: true, timeout: 30000 });
  const value = JSON.parse(response.stdout);
  if (!value.AccessKeyId || !value.SecretAccessKey) throw new Error('CLI_CREDENTIAL_EXPORT_FAILED');
  cachedCredentials = { accessKeyId: value.AccessKeyId, secretAccessKey: value.SecretAccessKey, sessionToken: value.SessionToken,
    ...(value.Expiration ? { expiration: new Date(value.Expiration) } : {}) };
  return cachedCredentials;
};
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials, maxAttempts: 2 }));
const sqs = new SQSClient({ region, credentials, maxAttempts: 2 });
const stop = new AbortController(), samples = [], jobIds = new Set(), jobs = new Map(), events = new Map();
let startedAt, baseline, loadResult, loadFinished = false, loadPromise, stopReason, fatalCode, lastLogs = 0, lastSlow = 0;
let writes = Promise.resolve(), lastActivities = [], lastAlarms = [], sawRunningOut = false;
const safeCode = e => e.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || e.name || 'ERROR';
async function aws(args) { return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', region, '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 })).stdout || '{}'); }
async function save(name, value) { await writeFile(`${dir}/${name}.json`, JSON.stringify(value, null, 2)); }
function stopLoad(reason) { if (!stop.signal.aborted) { stopReason = reason; stop.abort(); console.log(JSON.stringify({ event: 'submission_stopped', reason, at: new Date().toISOString() })); } }
process.once('SIGINT', () => stopLoad('USER_INTERRUPT')); process.once('SIGTERM', () => stopLoad('USER_INTERRUPT'));
async function queues() {
  const values = await Promise.all(['recognition', 'recognition-dlq'].map(suffix => sqs.send(new GetQueueAttributesCommand({
    QueueUrl: `https://sqs.ap-southeast-2.amazonaws.com/901444280953/a3-n12281212-unframe-${suffix}`,
    AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed'],
  }), { abortSignal: AbortSignal.timeout(15000) })));
  return values.map(v => ({ visible: Number(v.Attributes.ApproximateNumberOfMessages), inflight: Number(v.Attributes.ApproximateNumberOfMessagesNotVisible), delayed: Number(v.Attributes.ApproximateNumberOfMessagesDelayed) }));
}
async function serviceState() {
  const v = await aws(['ecs', 'describe-services', '--cluster', cluster, '--services', service, '--query', 'services[].{desired:desiredCount,running:runningCount,pending:pendingCount,taskDefinition:taskDefinition,deployments:deployments[].{state:rolloutState,failed:failedTasks},events:events}']);
  assert.equal(v.length, 1); return v[0];
}
async function taskHealth() {
  const arns = (await aws(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', service])).taskArns;
  if (!arns.length) return [];
  return (await aws(['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...arns, '--query', 'tasks[].{taskArn:taskArn,status:lastStatus,health:healthStatus,taskDefinition:taskDefinitionArn,cpu:cpu,memory:memory,startedAt:startedAt,containers:containers[].{name:name,health:healthStatus,imageDigest:imageDigest}}']));
}
async function readJobs(ids) {
  for (let offset = 0; offset < ids.length; offset += 100) {
    let request = { [table]: { Keys: ids.slice(offset, offset + 100).map(jobId => ({ jobId })), ConsistentRead: true,
      ProjectionExpression: '#j,#s,#n,#m,#r.#a.#i,#r.#v,#r.#c,#t,#d',
      ExpressionAttributeNames: { '#j': 'jobId', '#s': 'status', '#n': 'attempts', '#m': 'museumId', '#r': 'result', '#a': 'artwork', '#i': 'id', '#v': 'similarity', '#c': 'candidates', '#t': 'createdAt', '#d': 'completedAt' } } };
    for (let attempt = 0; Object.keys(request).length && attempt < 3; attempt++) {
      const response = await db.send(new BatchGetCommand({ RequestItems: request }), { abortSignal: AbortSignal.timeout(15000) });
      for (const j of response.Responses?.[table] || []) {
        const candidates = j.result?.candidates?.map(c => ({ artworkId: c.artwork?.id, similarity: c.similarity }));
        const record = { jobId: j.jobId, status: j.status, attempts: j.attempts, museumId: j.museumId,
          artworkId: j.result?.artwork?.id, similarity: j.result?.similarity, candidates, createdAt: j.createdAt, completedAt: j.completedAt };
        record.correct = j.status === 'SUCCEEDED' && j.museumId === 'met' && record.artworkId === 'water-lilies' && record.similarity >= .8
          && candidates?.length > 0 && candidates.length <= 3 && candidates.every((c, i) => c.similarity >= .8 && (!i || candidates[i - 1].similarity >= c.similarity));
        if (jobIds.has(j.jobId)) jobs.set(j.jobId, record);
      }
      request = response.UnprocessedKeys || {};
      if (Object.keys(request).length) await delay(500);
    }
    if (Object.keys(request).length) throw new Error('DDB_UNPROCESSED_KEYS');
  }
}
async function slowRead() {
  const alarmsInput = JSON.parse(await readFile('verification/2026-10-31/scaling-max-three/before/alarms.json', 'utf8')).value.MetricAlarms;
  const [activities, alarms, logs] = await Promise.all([
    aws(['application-autoscaling', 'describe-scaling-activities', '--service-namespace', 'ecs', '--resource-id', resource, '--include-not-scaled-activities']),
    aws(['cloudwatch', 'describe-alarms', '--alarm-names', ...alarmsInput.map(a => a.AlarmName)]),
    aws(['logs', 'filter-log-events', '--log-group-name', logGroup, '--start-time', String(lastLogs || startedAt)]),
  ]);
  lastActivities = activities.ScalingActivities; lastAlarms = alarms.MetricAlarms;
  for (const e of logs.events || []) {
    lastLogs = Math.max(lastLogs, e.timestamp);
    let value; try { value = JSON.parse(e.message); } catch { continue; }
    if (!jobIds.has(value.jobId) || !['job_received', 'job_processing', 'job_completed', 'job_failed', 'job_cleanup_retry', 'bedrock_complete'].includes(value.event)) continue;
    events.set(e.eventId, { timestamp: e.timestamp, event: value.event, jobId: value.jobId, stream: e.logStreamName, attempt: value.attempt, code: value.code });
    if (['job_failed', 'job_cleanup_retry', 'bedrock_complete'].includes(value.event)) stopLoad('WORKER_FAILURE_OR_UNEXPECTED_BEDROCK');
  }
  await save('activities', { at: new Date().toISOString(), activities: lastActivities });
  await save('alarms', { at: new Date().toISOString(), alarms: lastAlarms });
  await save('worker-events', [...events.values()]);
  const failures = lastActivities.filter(a => Date.parse(a.StartTime) >= startedAt && ['Failed', 'Unfulfilled'].includes(a.StatusCode)
    && !a.NotScaledReasons?.every(r => ['AlreadyAtMinCapacity', 'AlreadyAtMaxCapacity', 'AlreadyAtDesiredCapacity'].includes(r.Code)));
  if (failures.length) stopLoad('SCALING_ACTIVITY_FAILURE');
}
try {
  assert.equal((await aws(['sts', 'get-caller-identity', '--query', '{Account:Account}'])).Account, '901444280953');
  const target = (await aws(['application-autoscaling', 'describe-scalable-targets', '--service-namespace', 'ecs', '--resource-ids', resource])).ScalableTargets[0];
  assert.deepEqual([target.MinCapacity, target.MaxCapacity], [1, 3]);
  assert.ok(Object.values(target.SuspendedState).every(v => v === false));
  const policies = await aws(['application-autoscaling', 'describe-scaling-policies', '--service-namespace', 'ecs', '--resource-id', resource]);
  const p = policies.ScalingPolicies.find(p => p.PolicyName === 'unframe-sqs-backlog').TargetTrackingScalingPolicyConfiguration;
  assert.deepEqual([p.TargetValue, p.ScaleOutCooldown, p.ScaleInCooldown, p.DisableScaleIn], [3, 30, 120, false]);
  const [state, health, q] = await Promise.all([serviceState(), taskHealth(), queues()]);
  assert.deepEqual([state.desired, state.running, state.pending], [1, 1, 0]);
  assert.ok(state.taskDefinition.endsWith(':6') && state.deployments.every(d => d.state === 'COMPLETED' && !d.failed));
  assert.equal(health.length, 1); assert.equal(health[0].health, 'HEALTHY');
  assert.deepEqual([health[0].cpu, health[0].memory], ['512', '2048']);
  assert.deepEqual(q[0], { visible: 0, inflight: 0, delayed: 0 });
  assert.deepEqual(q[1], { visible: 3, inflight: 0, delayed: 0 });
  await readJobs(['8086449b-f72d-4205-af74-faac1ed0147e']); // Confirm projected bulk-read permission before creating any jobs.
  baseline = { at: new Date().toISOString(), state, health, queues: q, target, policies };
  await save('baseline', baseline);
  const bytes = await readFile('mobile/assets/water-lilies.jpg');
  startedAt = Date.now();
  await save('authorization-and-bounds', { startedAt: new Date(startedAt).toISOString(), maxJobs: 900, maxStartsPerSecond: 3, concurrency: 5,
    maxSubmissionSeconds: 300, maxObservationSeconds: 2400, maximumWorkers: 3, estimatedUsd: .116, allowanceUsd: .50,
    note: 'Explicit user authorization includes proceeding with quota-read denial and stopping on actual capacity errors. No manual DesiredCount changes.' });
  await slowRead();
  if (stop.signal.aborted) throw new Error('BASELINE_MONITOR_FAILED');
  loadPromise = runRecognitionLoad({ base, bytes, count: 900, concurrency: 5, ratePerSecond: 3, maxDurationMs: 300000, signal: stop.signal,
    onEvent: event => {
      if (event.event === 'job_created') jobIds.add(event.jobId);
      if (event.event === 'submission_failed') stopLoad('SUBMISSION_FAILED');
      const record = { at: new Date().toISOString(), ...event };
      writes = writes.then(() => appendFile(`${dir}/submissions.jsonl`, JSON.stringify(record) + '\n'));
    } }).then(result => { loadResult = result; loadFinished = true; return result; });
  while (Date.now() - startedAt < 40 * 60000) {
    const tick = Date.now();
    const [state, health, q] = await Promise.all([serviceState(), taskHealth(), queues()]);
    if (state.running > 1) { sawRunningOut = true; stopLoad('RUNNING_SCALE_OUT_OBSERVED'); }
    if (state.desired > 3 || state.running > 3 || !state.taskDefinition.endsWith(':6')) stopLoad('UNEXPECTED_SERVICE_CONFIGURATION');
    if (health.some(t => t.health === 'UNHEALTHY' || t.cpu !== '512' || t.memory !== '2048')) stopLoad('UNHEALTHY_OR_INVALID_TASK');
    if (q[1].visible > baseline.queues[1].visible || q[1].inflight || q[1].delayed) stopLoad('DLQ_CHANGED');
    const badEvents = state.events.filter(e => Date.parse(e.createdAt) >= startedAt && /unable|failed|insufficient|quota|unhealthy|capacity.*unavailable/i.test(e.message));
    if (badEvents.length) stopLoad('ECS_CAPACITY_OR_HEALTH_ERROR');
    await readJobs([...jobIds].filter(id => jobs.get(id)?.status !== 'SUCCEEDED'));
    if ([...jobs.values()].some(j => ['FAILED', 'RETRYING'].includes(j.status) || j.attempts > 1 || (j.status === 'SUCCEEDED' && !j.correct))) stopLoad('JOB_FAILURE_RETRY_OR_INCORRECT_RESULT');
    if (Date.now() - lastSlow > 30000) { await slowRead(); lastSlow = Date.now(); }
    const sample = { at: new Date().toISOString(), desired: state.desired, running: state.running, pending: state.pending,
      queue: q[0], dlq: q[1], health, newServiceEvents: state.events.filter(e => Date.parse(e.createdAt) >= startedAt),
      created: jobIds.size, succeeded: [...jobs.values()].filter(j => j.status === 'SUCCEEDED').length,
      correct: [...jobs.values()].filter(j => j.correct).length, stopReason };
    samples.push(sample);
    await save('observations', { startedAt: new Date(startedAt).toISOString(), samples });
    await save('jobs', [...jobs.values()]);
    console.log(JSON.stringify({ ...sample, health: undefined, newServiceEvents: undefined }));
    const empty = q[0].visible === 0 && q[0].inflight === 0 && q[0].delayed === 0;
    const allDone = loadFinished && jobs.size === jobIds.size && [...jobs.values()].every(j => ['SUCCEEDED', 'FAILED'].includes(j.status));
    if (sawRunningOut && allDone && empty && state.running === 1 && state.desired === 1 && state.pending === 0 && health.every(t => t.health === 'HEALTHY')) break;
    if (!sawRunningOut && allDone && empty && Date.now() - startedAt >= 10 * 60000) break;
    await delay(Math.max(1000, 10000 - (Date.now() - tick)));
  }
} catch (error) {
  fatalCode = safeCode(error); stopLoad('MONITOR_ERROR_' + fatalCode);
  console.error(JSON.stringify({ event: 'experiment_error', code: fatalCode }));
} finally {
  stopLoad('OBSERVATION_FINISHED');
  if (loadPromise) await loadPromise;
  await writes;
  await save('run-summary', { startedAt: startedAt ? new Date(startedAt).toISOString() : null, endedAt: new Date().toISOString(),
    loadResult, stopReason, fatalCode, created: jobIds.size, succeeded: [...jobs.values()].filter(j => j.status === 'SUCCEEDED').length,
    correct: [...jobs.values()].filter(j => j.correct).length, sawRunningOut,
    peakObservedVisible: samples.length ? Math.max(...samples.map(s => s.queue.visible)) : null,
    peakObservedRunning: samples.length ? Math.max(...samples.map(s => s.running)) : null,
    finalSample: samples.at(-1), note: 'Final F15/F16 verdict requires matching CloudWatch metrics and scaling activities.' });
  db.destroy(); sqs.destroy();
}
