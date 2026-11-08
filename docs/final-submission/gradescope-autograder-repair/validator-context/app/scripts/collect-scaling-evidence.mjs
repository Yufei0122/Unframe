// Read-only CloudWatch/ECS evidence and AWS-rendered charts for the one bounded run.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
const exec = promisify(execFile), dir = 'verification/2026-10-31/scaling-max-three/run-01';
const cluster = 'n12281212-strobe-a2', service = 'a3-n12281212-unframe-worker', resource = `service/${cluster}/${service}`;
async function aws(args) { return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })).stdout || '{}'); }
async function save(name, value) { await writeFile(`${dir}/${name}.json`, JSON.stringify({ retrievedAt: new Date().toISOString(), value }, null, 2)); }
const bounds = JSON.parse(await readFile(`${dir}/authorization-and-bounds.json`, 'utf8'));
const start = new Date(Date.parse(bounds.startedAt) - 120000).toISOString(), end = new Date().toISOString();
const query = JSON.parse(await readFile('verification/2026-10-31/scaling-max-three/before/metric-query.json', 'utf8'));
await writeFile(`${dir}/metric-query.json`, JSON.stringify(query, null, 2));
const data = await aws(['cloudwatch', 'get-metric-data', '--metric-data-queries', `file://${dir}/metric-query.json`, '--start-time', start, '--end-time', end]);
await save('F14-F16-cloudwatch-metrics', data);
const times = [...new Set(data.MetricDataResults.flatMap(m => m.Timestamps))].sort();
await writeFile(`${dir}/F14-F16-metrics.csv`, ['timestampUTC,' + data.MetricDataResults.map(m => m.Id).join(','),
  ...times.map(t => [new Date(t).toISOString(), ...data.MetricDataResults.map(m => { const i = m.Timestamps.indexOf(t); return i < 0 ? '' : m.Values[i]; })].join(','))].join('\n') + '\n');
const activities = await aws(['application-autoscaling', 'describe-scaling-activities', '--service-namespace', 'ecs', '--resource-id', resource, '--include-not-scaled-activities']);
await save('F15-F16-scaling-activities', activities);
const submissionLines = (await readFile(`${dir}/submissions.jsonl`, 'utf8')).trim().split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const ids = new Set(submissionLines.filter(e => e.event === 'job_created').map(e => e.jobId));
const logs = await aws(['logs', 'filter-log-events', '--log-group-name', '/ecs/a3-n12281212-unframe-worker', '--start-time', String(Date.parse(bounds.startedAt)), '--end-time', String(Date.parse(end))]);
const safeEvents = [];
for (const e of logs.events || []) {
  let value; try { value = JSON.parse(e.message); } catch { continue; }
  if (!ids.has(value.jobId) || !['job_received', 'job_processing', 'job_completed', 'job_failed', 'job_cleanup_retry', 'bedrock_complete'].includes(value.event)) continue;
  safeEvents.push({ timestamp: e.timestamp, event: value.event, jobId: value.jobId, stream: e.logStreamName, attempt: value.attempt, code: value.code });
}
await save('F14-F16-worker-events', safeEvents);
const targets = await aws(['application-autoscaling', 'describe-scalable-targets', '--service-namespace', 'ecs', '--resource-ids', resource]);
const policies = await aws(['application-autoscaling', 'describe-scaling-policies', '--service-namespace', 'ecs', '--resource-id', resource]);
await save('final-target', targets); await save('final-policy', policies);
for (const [i, alarm] of policies.ScalingPolicies.find(p => p.PolicyName === 'unframe-sqs-backlog').Alarms.entries()) {
  await save(`alarm-${i}-history`, await aws(['cloudwatch', 'describe-alarm-history', '--alarm-name', alarm.AlarmName, '--start-date', start, '--end-date', end]));
}
const arns = (await aws(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', service, '--desired-status', 'STOPPED'])).taskArns;
if (arns.length) await save('stopped-tasks', await aws(['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...arns.slice(0,100), '--query', 'tasks[].{taskArn:taskArn,taskDefinition:taskDefinitionArn,startedAt:startedAt,stoppedAt:stoppedAt,stopCode:stopCode,stoppedReason:stoppedReason,containers:containers[].{name:name,exitCode:exitCode,reason:reason}}']));
const widgets = [
  ['F14-queue', 'F14: Real recognition SQS backlog', [['AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'QueueName', 'a3-n12281212-unframe-recognition', { stat: 'Maximum', label: 'Visible messages (minute maximum)' }], ['AWS/SQS', 'ApproximateNumberOfMessagesNotVisible', 'QueueName', 'a3-n12281212-unframe-recognition', { stat: 'Maximum', label: 'In flight' }]]],
  ['F15-F16-running', 'F15/F16: Actual running worker tasks', [['ECS/ContainerInsights', 'RunningTaskCount', 'ClusterName', cluster, 'ServiceName', service, { stat: 'Average', label: 'Running tasks (minute average)' }]]],
  ['worker-utilization', 'Worker CPU and memory percentages', [['AWS/ECS', 'CPUUtilization', 'ClusterName', cluster, 'ServiceName', service, { stat: 'Average' }], ['AWS/ECS', 'MemoryUtilization', 'ClusterName', cluster, 'ServiceName', service, { stat: 'Average' }]]],
];
const chartResults = [];
for (const [name, title, metrics] of widgets) {
  const input = { metrics, title, width: 1200, height: 450, start, end, timezone: '+1000', period: 60, region: 'ap-southeast-2', view: 'timeSeries', yAxis: { left: { min: 0 } } };
  await writeFile(`${dir}/${name}-widget.json`, JSON.stringify(input));
  try {
    const image = await aws(['cloudwatch', 'get-metric-widget-image', '--metric-widget', `file://${dir}/${name}-widget.json`]);
    await writeFile(`${dir}/${name}.png`, Buffer.from(image.MetricWidgetImage, 'base64'));
    chartResults.push({ name, status: 'AWS_RENDERED_REAL_METRICS' });
  } catch (e) { chartResults.push({ name, status: e.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || 'ERROR' }); }
}
await save('charts', chartResults);
console.log(JSON.stringify({ start, end, charts: chartResults, metrics: data.MetricDataResults.map(m => ({ id: m.Id, samples: m.Values.length, min: m.Values.length ? Math.min(...m.Values) : null, max: m.Values.length ? Math.max(...m.Values) : null })) }));
