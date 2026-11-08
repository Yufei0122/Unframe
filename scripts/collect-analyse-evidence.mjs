// Read-only evidence for the single deployment-verification job. Never submits jobs.
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { readFile, writeFile } from 'node:fs/promises';
import { resultDigest } from './evidence-result.mjs';
const exec = promisify(execFile);
const directory = process.env.UNFRAME_ANALYSE_EVIDENCE_DIR;
if (!directory) throw new Error('Set UNFRAME_ANALYSE_EVIDENCE_DIR to the existing one-job evidence directory');
const job = JSON.parse(await readFile(`${directory}/F12-analyse.json`, 'utf8'));
if (!/^[a-f0-9-]{36}$/.test(job.jobId)) throw new Error('Valid existing job evidence required');
async function cli(service, operation, input) {
  const file = `${directory}/read-${operation}.json`;
  await writeFile(file, JSON.stringify(input));
  try {
    const { stdout } = await exec('aws', [service, operation, '--cli-input-json', `file://${file}`, '--profile', 'default',
      '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
    return { ok: true, value: stdout.trim() ? JSON.parse(stdout) : {} };
  } catch (error) {
    const code = error.stderr?.match(/An error occurred \(([A-Za-z0-9]+)\)/)?.[1] || 'CLI_FAILED';
    return { ok: false, errorCode: code };
  }
}
const identity = await cli('sts', 'get-caller-identity', {});
if (!identity.ok || identity.value.Account !== '901444280953') throw new Error('Expected authenticated AWS account unavailable');
const projectedFields = ['jobId', 'status', 'operation', 'museumId', 'attempts', 'completedAt', 'result', 'imageKey', 'bucket', 'error'];
const names = Object.fromEntries(projectedFields.map((field, index) => [`#f${index}`, field]));
const item = await cli('dynamodb', 'get-item', { TableName: 'a3-n12281212-unframe-jobs', Key: { jobId: { S: job.jobId } },
  ConsistentRead: true, ProjectionExpression: Object.keys(names).join(', '), ExpressionAttributeNames: names });
const row = item.value?.Item;
const result = row?.result?.M ? unmarshall(row).result : null;
const resultSha256 = result ? resultDigest(result) : null;
// Do not persist model-authored text from the normalized application result.
const safeItem = structuredClone(item);
if (safeItem.value?.Item) delete safeItem.value.Item.result;
safeItem.resultSummary = result ? { method: result.method, identityStatus: result.identityStatus, artworkPresence: result.artworkPresence } : null;
safeItem.resultSha256 = resultSha256;
await writeFile(`${directory}/F12-dynamodb.json`, JSON.stringify(safeItem, null, 2));
let cleanup = { ok: false, errorCode: 'JOB_STORAGE_NOT_VERIFIED' };
if (row?.bucket?.S === 'a3-n12281212-unframe-job-images' && row?.imageKey?.S === `uploads/${job.jobId}/image`) {
  const head = await cli('s3api', 'head-object', { Bucket: row.bucket.S, Key: row.imageKey.S });
  cleanup = { status: !head.ok && ['404', 'NoSuchKey', 'NotFound'].includes(head.errorCode) ? 'PASS_OBJECT_ABSENT' : 'NOT_CONFIRMED',
    exists: head.ok, errorCode: head.errorCode || null };
}
const logs = await cli('logs', 'filter-log-events', { logGroupName: '/ecs/a3-n12281212-unframe-worker',
  filterPattern: `"${job.jobId}"`, startTime: Date.parse(job.startedAt) - 5000 });
const events = [];
for (const record of logs.value?.events || []) {
  let value;
  try { value = JSON.parse(record.message); } catch { continue; }
  if (value.jobId !== job.jobId) continue;
  const event = { timestamp: record.timestamp, logStreamName: record.logStreamName };
  for (const key of ['event', 'jobId', 'operation', 'attempt', 'stage', 'code', 'errorCode', 'exceptionType', 'awsErrorCode',
    'awsRequestId', 'httpStatusCode', 'modelId', 'elapsedMs', 'stopReason', 'contentBlockCount', 'hasNonTextBlocks', 'textCharacters', 'singleMarkdownFence']) {
    const field = value[key];
    if (typeof field === 'number' || typeof field === 'boolean' || field === null || (typeof field === 'string' && /^[A-Za-z0-9_.:/-]{1,160}$/.test(field))) event[key] = field;
  }
  // The worker has already reduced these to schema-owned paths and constraints.
  // Preserve only the four diagnostic fields, never arbitrary nested log data.
  if (Array.isArray(value.schemaIssues)) event.schemaIssues = value.schemaIssues.slice(0, 5)
    .filter(issue => issue && typeof issue.path === 'string' && issue.path.length <= 1100
      && typeof issue.expected === 'string' && issue.expected.length <= 80
      && ['missing', 'null', 'array', 'object', 'string', 'number', 'boolean'].includes(issue.actualType)
      && typeof issue.category === 'string' && /^[A-Za-z]{1,32}$/.test(issue.category))
    .map(({ path, expected, actualType, category }) => ({ path, expected, actualType, category }));
  events.push(event);
}
await writeFile(`${directory}/F12-worker-events.json`, JSON.stringify({ ok: logs.ok, errorCode: logs.errorCode, events }, null, 2));
const summary = { checkedAt: new Date().toISOString(), jobId: job.jobId, jobStatus: row?.status?.S || 'UNKNOWN',
  attempts: Number(row?.attempts?.N || 0), method: row?.result?.M?.method?.S || null,
  resultPersistedInDynamoDB: row?.status?.S === 'SUCCEEDED' && Boolean(row?.result?.M), cleanup,
  dynamoDBResultMatchesAPI: Boolean(result) && (job.resultSha256 ? resultSha256 === job.resultSha256 : isDeepStrictEqual(result, job.result)),
  bedrockCompleteEvents: events.filter(e => e.event === 'bedrock_complete').length,
  resultSavedEvents: events.filter(e => e.event === 'job_result_saved').length,
  jobCompletedEvents: events.filter(e => e.event === 'job_completed').length,
  failureEvents: events.filter(e => ['job_failed', 'job_cleanup_retry', 'bedrock_response_rejected'].includes(e.event)),
  logsRead: logs.ok ? 'PASS' : logs.errorCode };
summary.bedrockVerification = summary.bedrockCompleteEvents > 0 ? 'PASS_INVOKED_AND_PARSED'
  : events.some(e => e.event === 'bedrock_response_rejected' && e.httpStatusCode === 200) ? 'INVOKED_BUT_RESPONSE_REJECTED'
  : summary.method === 'collection' ? 'NOT_INVOKED_CATALOGUE_SHORTCUT' : 'NOT_CONFIRMED';
await writeFile(`${directory}/F12-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
