// Read-only projected records and allowlisted events for exactly the submitted batch.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const exec = promisify(execFile), dir = 'verification/2026-10-31/recognition-final';
async function aws(args) { return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })).stdout); }
try {
  const bytes = await readFile(`${dir}/load-submissions.txt`);
  const text = bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
  const ids = text.split(/\r?\n/).flatMap(line => { try { const e = JSON.parse(line); return e.event === 'job_uploaded' ? [e.jobId] : []; } catch { return []; } });
  assert.equal(ids.length, 30); assert.equal(new Set(ids).size, 30);
  const jobs = [];
  for (const jobId of ids) {
    const input = { TableName: 'a3-n12281212-unframe-jobs', Key: { jobId: { S: jobId } }, ConsistentRead: true,
      ProjectionExpression: '#j,#s,#a,#r,#c,#t', ExpressionAttributeNames: { '#j': 'jobId', '#s': 'status', '#a': 'attempts', '#r': 'result', '#c': 'completedAt', '#t': 'createdAt' } };
    await writeFile(`${dir}/batch-read-input.json`, JSON.stringify(input));
    const item = (await aws(['dynamodb', 'get-item', '--cli-input-json', `file://${dir}/batch-read-input.json`])).Item;
    jobs.push({ jobId, status: item?.status?.S, attempts: Number(item?.attempts?.N), artworkId: item?.result?.M?.artwork?.M?.id?.S, similarity: Number(item?.result?.M?.similarity?.N), createdAt: Number(item?.createdAt?.N), completedAt: Number(item?.completedAt?.N) });
  }
  const observation = JSON.parse(await readFile(`${dir}/F14-F16-observations.json`, 'utf8'));
  const logs = await aws(['logs', 'filter-log-events', '--log-group-name', '/ecs/a3-n12281212-unframe-worker', '--start-time', String(Date.parse(observation.startedAt) - 1000)]);
  const events = [];
  for (const record of logs.events || []) {
    let value; try { value = JSON.parse(record.message); } catch { continue; }
    if (!ids.includes(value.jobId) || !['job_received', 'job_processing', 'job_result_saved', 'job_completed', 'job_failed', 'bedrock_complete'].includes(value.event)) continue;
    const event = { timestamp: record.timestamp, event: value.event, jobId: value.jobId, logStreamName: record.logStreamName };
    for (const key of ['attempt', 'elapsedMs']) if (Number.isFinite(value[key])) event[key] = value[key];
    events.push(event);
  }
  for (const job of jobs) {
    const start = events.find(e => e.jobId === job.jobId && e.event === 'job_processing');
    const end = events.find(e => e.jobId === job.jobId && e.event === 'job_completed');
    if (start && end) job.processingMs = end.timestamp - start.timestamp;
  }
  const durations = jobs.map(j => j.processingMs).filter(Number.isFinite).sort((a,b) => a-b);
  const summary = { checkedAt: new Date().toISOString(), total: jobs.length, succeeded: jobs.filter(j => j.status === 'SUCCEEDED').length,
    correct: jobs.filter(j => j.artworkId === 'water-lilies' && j.similarity >= .80).length,
    bedrockEvents: events.filter(e => e.event === 'bedrock_complete').length,
    processing: { samples: durations.length, minMs: durations[0], maxMs: durations.at(-1), meanMs: durations.reduce((a,b)=>a+b,0)/durations.length, p95Ms: durations[Math.ceil(durations.length*.95)-1] }, jobs };
  await writeFile(`${dir}/F14-load-results.json`, JSON.stringify(summary, null, 2));
  await writeFile(`${dir}/F14-worker-events.json`, JSON.stringify(events, null, 2));
  console.log(JSON.stringify({ ...summary, jobs: undefined }));
} catch (error) { console.error(error.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || error.message); process.exitCode = 1; }
