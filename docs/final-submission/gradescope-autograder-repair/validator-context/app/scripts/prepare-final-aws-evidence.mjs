import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = 'verification/2026-10-31/aws-final';
const save = (name, value) => writeFile(`${dir}/${name}.json`, JSON.stringify(value, null, 2));
const snapshot = JSON.parse(await readFile(`${dir}/dashboard-before.json`, 'utf8'));
const before = JSON.parse(snapshot.DashboardBody);
const dashboard = structuredClone(before);
const indexes = dashboard.widgets.flatMap((widget, index) => widget.properties?.metrics?.some(row => row[1] === 'CpuUtilized') ? [index] : []);
assert.equal(indexes.length, 1);
const widget = dashboard.widgets[indexes[0]];
widget.properties.metrics = ['CPUUtilization', 'MemoryUtilization'].map(metric => [
  'AWS/ECS', metric, 'ServiceName', 'a3-n12281212-unframe-worker', 'ClusterName', 'n12281212-strobe-a2',
  { label: `ECS - ${metric === 'CPUUtilization' ? 'CPU' : 'Memory'} Utilization (%)` },
]);
widget.properties.stat = 'Average';
for (let i = 0; i < before.widgets.length; i++) if (!indexes.includes(i)) assert.deepEqual(dashboard.widgets[i], before.widgets[i]);
await save('F20-dashboard-replacement', dashboard);
await save('F20-widget-change', { changedWidgetIndex: indexes[0], before: before.widgets[indexes[0]], after: widget, untouchedWidgets: before.widgets.length - 1 });
const ecsDimensions = [{ Name: 'ClusterName', Value: 'n12281212-strobe-a2' }, { Name: 'ServiceName', Value: 'a3-n12281212-unframe-worker' }];
const metrics = [
  ['visible', 'AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'Sum', [{ Name: 'QueueName', Value: 'a3-n12281212-unframe-recognition' }]],
  ['oldest', 'AWS/SQS', 'ApproximateAgeOfOldestMessage', 'Maximum', [{ Name: 'QueueName', Value: 'a3-n12281212-unframe-recognition' }]],
  ['running', 'ECS/ContainerInsights', 'RunningTaskCount', 'Average', ecsDimensions],
  ['cpu', 'AWS/ECS', 'CPUUtilization', 'Average', ecsDimensions],
  ['memory', 'AWS/ECS', 'MemoryUtilization', 'Average', ecsDimensions],
  ['lambdaerrors', 'AWS/Lambda', 'Errors', 'Sum', [{ Name: 'FunctionName', Value: 'a3-n12281212-unframe-jobs' }]],
  ['lambdainvocations', 'AWS/Lambda', 'Invocations', 'Sum', [{ Name: 'FunctionName', Value: 'a3-n12281212-unframe-jobs' }]],
  ['dlq', 'AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'Maximum', [{ Name: 'QueueName', Value: 'a3-n12281212-unframe-recognition-dlq' }]],
].map(([Id, Namespace, MetricName, Stat, Dimensions]) => ({ Id, MetricStat: { Metric: { Namespace, MetricName, Dimensions }, Period: 60, Stat }, ReturnData: true }));
await save('metric-queries', metrics);
await save('F12-read-job', { TableName: 'a3-n12281212-unframe-jobs', Key: { jobId: { S: 'd697fc84-9c23-4f15-abd0-2bcd5f040dc8' } },
  ConsistentRead: true, ProjectionExpression: 'jobId, #s, operation, museumId, attempts, #r, completedAt', ExpressionAttributeNames: { '#s': 'status', '#r': 'result' } });
const env = JSON.parse(await readFile('deployment/lambda/planning-env.example.json', 'utf8'));
env.Variables.AI_ALLOWED_ORIGINS = 'https://d3x3iexpafsgf.cloudfront.net';
await save('planning-env', env);
console.log('Prepared one dashboard widget replacement, eight metric queries, safe job projection and Planning environment.');
