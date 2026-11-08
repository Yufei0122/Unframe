// Read-only, project-scoped pricing evidence. Never records environment values,
// credentials, image contents, job capabilities or unfiltered application logs.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const execFile = promisify(execFileCallback);
const dir = 'verification/2026-10-31/pricing-calculator';
await mkdir(dir, { recursive: true });
const profile = ['--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'];
async function aws(args) {
  const { stdout } = await execFile('aws', [...args, ...profile], { windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout || '{}');
}
const identity = await aws(['sts', 'get-caller-identity']);
if (identity.Account !== '901444280953') throw new Error('Wrong AWS account');
await writeFile(`${dir}/account.json`, JSON.stringify({ account: identity.Account, retrievedAt: new Date().toISOString() }, null, 2));
const cluster = 'n12281212-strobe-a2', worker = 'a3-n12281212-unframe-worker', jobs = 'a3-n12281212-unframe-jobs';
const queue = 'a3-n12281212-unframe-recognition', imageBucket = 'a3-n12281212-unframe-job-images', webBucket = 'a3-n12281212-unframe-web';
async function collect(name, args, project = v => v) {
  if (process.argv.includes('--resume')) {
    try { const previous = JSON.parse(await readFile(`${dir}/${name}.json`, 'utf8')); if ('value' in previous) return previous.value; } catch {}
  }
  try {
    const value = project(await aws(args));
    await writeFile(`${dir}/${name}.json`, JSON.stringify({ retrievedAt: new Date().toISOString(), value }, null, 2));
    console.log(JSON.stringify({ name, status: 'OK' }));
    return value;
  } catch (e) {
    const error = (e.stderr || e.message).replace(/\r/g, '').trim();
    await writeFile(`${dir}/${name}.json`, JSON.stringify({ retrievedAt: new Date().toISOString(), error }, null, 2));
    console.log(JSON.stringify({ name, status: 'UNAVAILABLE', error }));
  }
}
const requests = [
  ['service', ['ecs', 'describe-services', '--cluster', cluster, '--services', worker], v => v.services.map(s => ({ serviceName: s.serviceName, desired: s.desiredCount, running: s.runningCount, pending: s.pendingCount, taskDefinition: s.taskDefinition, launchType: s.launchType, network: s.networkConfiguration, loadBalancers: s.loadBalancers }))],
  ['task-definition', ['ecs', 'describe-task-definition', '--task-definition', `${worker}:6`], v => { const t = v.taskDefinition; return { cpu: t.cpu, memory: t.memory, runtime: t.runtimePlatform, networkMode: t.networkMode, ephemeralStorage: t.ephemeralStorage || { sizeInGiB: 20 }, containers: t.containerDefinitions.map(c => ({ name: c.name, image: c.image, logConfiguration: c.logConfiguration })) }; }],
  ['cluster', ['ecs', 'describe-clusters', '--clusters', cluster, '--include', 'SETTINGS'], v => v.clusters.map(c => ({ clusterName: c.clusterName, settings: c.settings, runningTasks: c.runningTasksCount, services: c.activeServicesCount }))],
  ['lambda', ['lambda', 'get-function-configuration', '--function-name', jobs], v => ({ functionName: v.FunctionName, runtime: v.Runtime, memoryMiB: v.MemorySize, architecture: v.Architectures, timeout: v.Timeout, ephemeralStorage: v.EphemeralStorage, vpc: v.VpcConfig, tracing: v.TracingConfig })],
  ['api-routes', ['apigatewayv2', 'get-routes', '--api-id', '4xfbhsso7a'], v => v.Items.filter(r => r.RouteKey.includes('/a3/')).map(r => ({ route: r.RouteKey, target: r.Target }))],
  ['api-stage', ['apigatewayv2', 'get-stage', '--api-id', '4xfbhsso7a', '--stage-name', 'prob'], v => ({ stage: v.StageName, accessLogs: v.AccessLogSettings || null, routeSettings: v.RouteSettings, defaultRouteSettings: v.DefaultRouteSettings })],
  ['dynamodb', ['dynamodb', 'describe-table', '--table-name', jobs], v => ({ name: v.Table.TableName, billing: v.Table.BillingModeSummary, itemCount: v.Table.ItemCount, bytes: v.Table.TableSizeBytes, indexes: v.Table.GlobalSecondaryIndexes || [], streams: v.Table.StreamSpecification || null, sse: v.Table.SSEDescription || null })],
  ['dynamodb-ttl', ['dynamodb', 'describe-time-to-live', '--table-name', jobs]],
  ['dynamodb-backups', ['dynamodb', 'describe-continuous-backups', '--table-name', jobs]],
  ['ecr', ['ecr', 'describe-images', '--repository-name', worker], v => v.imageDetails.map(i => ({ tags: i.imageTags || [], digest: i.imageDigest, compressedBytes: i.imageSizeInBytes, pushedAt: i.imagePushedAt }))],
  ['cloudfront', ['cloudfront', 'get-distribution', '--id', 'E2CK5412ICFTJX'], v => { const d = v.Distribution.DistributionConfig; return { id: v.Distribution.Id, priceClass: d.PriceClass, origins: d.Origins, defaultBehavior: d.DefaultCacheBehavior, cacheBehaviors: d.CacheBehaviors, logging: d.Logging, webAcl: d.WebACLId, aliases: d.Aliases }; }],
  ['scaling-target', ['application-autoscaling', 'describe-scalable-targets', '--service-namespace', 'ecs', '--resource-ids', `service/${cluster}/${worker}`]],
  ['scaling-policy', ['application-autoscaling', 'describe-scaling-policies', '--service-namespace', 'ecs', '--resource-id', `service/${cluster}/${worker}`]],
  ['routes', ['ec2', 'describe-route-tables', '--filters', 'Name=vpc-id,Values=vpc-007bab53289655834'], v => v.RouteTables.map(t => ({ id: t.RouteTableId, associations: t.Associations.map(a => ({ subnet: a.SubnetId, main: a.Main })), routes: t.Routes }))],
  ['guardduty-detectors', ['guardduty', 'list-detectors']],
  ['bedrock-metrics-list', ['cloudwatch', 'list-metrics', '--namespace', 'AWS/Bedrock'], v => v.Metrics.filter(m => m.Dimensions.some(d => d.Value.includes('gemma-3-12b')))],
  ['ci-metrics', ['cloudwatch', 'list-metrics', '--namespace', 'ECS/ContainerInsights', '--dimensions', `Name=ClusterName,Value=${cluster}`, '--recently-active', 'PT3H'], v => v.Metrics],
];
for (const bucket of [imageBucket, webBucket]) {
  for (const action of ['get-bucket-versioning', 'get-bucket-encryption', 'get-bucket-lifecycle-configuration']) requests.push([`${bucket}-${action}`, ['s3api', action, '--bucket', bucket]]);
  requests.push([`${bucket}-object-sizes`, ['s3api', 'list-objects-v2', '--bucket', bucket], v => { const sizes = (v.Contents || []).map(x => x.Size); return { count: sizes.length, bytes: sizes.reduce((a, b) => a + b, 0), averageBytes: sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0, sizes, truncated: !!v.IsTruncated }; }]);
}
for (const q of [queue, `${queue}-dlq`]) requests.push([q, ['sqs', 'get-queue-attributes', '--queue-url', `https://sqs.ap-southeast-2.amazonaws.com/901444280953/${q}`, '--attribute-names', 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'VisibilityTimeout', 'ReceiveMessageWaitTimeSeconds', 'MessageRetentionPeriod', 'RedrivePolicy', 'SqsManagedSseEnabled', 'KmsMasterKeyId']]);
for (const group of [`/ecs/${worker}`, `/aws/lambda/${jobs}`, `/aws/ecs/containerinsights/${cluster}/performance`]) requests.push([`logs-${group.includes('performance') ? 'ci' : group.includes('lambda') ? 'lambda' : 'worker'}`, ['logs', 'describe-log-groups', '--log-group-name-prefix', group], v => v.logGroups.filter(g => g.logGroupName === group).map(g => ({ name: g.logGroupName, bytes: g.storedBytes, retentionDays: g.retentionInDays || 'never-expire', logGroupClass: g.logGroupClass }))]);
for (let i = 0; i < requests.length; i += 5) await Promise.all(requests.slice(i, i + 5).map(r => collect(...r)));

// Closed experiment window; measurements are independent from forecast assumptions.
const start = '2026-10-31T08:05:00Z', end = '2026-10-31T08:35:00Z';
const metric = (id, namespace, name, dims, stat = 'Sum') => ({ Id: id, MetricStat: { Metric: { Namespace: namespace, MetricName: name, Dimensions: Object.entries(dims).map(([Name, Value]) => ({ Name, Value })) }, Period: 60, Stat: stat }, ReturnData: true });
const queries = [
  ...['Invocations', 'Errors', 'Duration'].map((n, i) => metric(`l${i}`, 'AWS/Lambda', n, { FunctionName: jobs }, n === 'Duration' ? 'Average' : 'Sum')),
  ...['NumberOfMessagesSent', 'NumberOfMessagesReceived', 'NumberOfMessagesDeleted', 'NumberOfEmptyReceives', 'SentMessageSize'].map((n, i) => metric(`s${i}`, 'AWS/SQS', n, { QueueName: queue }, n === 'SentMessageSize' ? 'Average' : 'Sum')),
  ...[`/ecs/${worker}`, `/aws/lambda/${jobs}`, `/aws/ecs/containerinsights/${cluster}/performance`].flatMap((g, i) => ['IncomingBytes', 'IncomingLogEvents'].map((n, j) => metric(`g${i}${j}`, 'AWS/Logs', n, { LogGroupName: g }))),
  ...['InputTokenCount', 'OutputTokenCount', 'Invocations', 'InvocationLatency'].map((n, i) => metric(`b${i}`, 'AWS/Bedrock', n, { ModelId: 'google.gemma-3-12b-it' }, n === 'InvocationLatency' ? 'Average' : 'Sum')),
];
await collect('experiment-usage-metrics', ['cloudwatch', 'get-metric-data', '--start-time', start, '--end-time', end, '--metric-data-queries', JSON.stringify(queries)]);
await collect('bedrock-day-metrics', ['cloudwatch', 'get-metric-data', '--start-time', '2026-10-31T00:00:00Z', '--end-time', new Date().toISOString(), '--metric-data-queries', JSON.stringify(queries.filter(q => q.Id.startsWith('b')))]);
await collect('lambda-reports', ['logs', 'filter-log-events', '--log-group-name', `/aws/lambda/${jobs}`, '--start-time', String(Date.parse(start)), '--end-time', String(Date.parse(end)), '--filter-pattern', '"REPORT RequestId:"'], v => {
  const rows = (v.events || []).map(e => { const m = e.message; const number = key => Number(m.match(new RegExp(`${key}:\\s*([\\d.]+)`))?.[1] || 0); return { timestamp: e.timestamp, durationMs: number('Duration'), billedMs: number('Billed Duration'), maxMemoryMiB: number('Max Memory Used'), initMs: number('Init Duration') }; });
  const stats = field => { const a = rows.map(r => r[field]).sort((a, b) => a - b); return { count: a.length, sum: a.reduce((x, y) => x + y, 0), mean: a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, p95: a[Math.ceil(a.length * .95) - 1], max: a.at(-1) }; };
  return { start, end, reports: rows.length, duration: stats('durationMs'), billed: stats('billedMs'), memory: stats('maxMemoryMiB'), coldStarts: rows.filter(r => r.initMs > 0).length, rows };
});
console.log('Read-only collection complete');
