// Read-only deployment/scaling evidence. Never receives messages or reads tokens.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const exec = promisify(execFile);
const dir = process.env.UNFRAME_FINAL_DIR || 'verification/2026-10-31/recognition-final';
const phase = process.argv[2] || 'before';
if (!/^[a-z-]+$/.test(phase)) throw new Error('Invalid phase');
await mkdir(dir, { recursive: true });
async function read(name, args) {
  try {
    const { stdout } = await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const value = JSON.parse(stdout);
    await writeFile(`${dir}/${phase}-${name}.json`, JSON.stringify(value, null, 2));
    console.log(JSON.stringify({ read: name, status: 'PASS' })); return value;
  } catch (error) {
    const code = error.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || 'CLI_FAILED';
    const message = error.stderr?.trim().replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted]');
    await writeFile(`${dir}/${phase}-${name}.json`, JSON.stringify({ errorCode: code, message }, null, 2));
    console.log(JSON.stringify({ read: name, status: code }));
  }
}
const identity = await read('account', ['sts', 'get-caller-identity', '--query', '{Account:Account}']);
if (identity?.Account !== '901444280953') throw new Error('Expected account unavailable');
const cluster = 'n12281212-strobe-a2', service = 'a3-n12281212-unframe-worker';
const resource = `service/${cluster}/${service}`;
await read('F13-target', ['application-autoscaling', 'describe-scalable-targets', '--service-namespace', 'ecs', '--resource-ids', resource]);
await read('F13-policy', ['application-autoscaling', 'describe-scaling-policies', '--service-namespace', 'ecs', '--resource-id', resource]);
await read('scaling-activities', ['application-autoscaling', 'describe-scaling-activities', '--service-namespace', 'ecs', '--resource-id', resource, '--include-not-scaled-activities']);
await read('service', ['ecs', 'describe-services', '--cluster', cluster, '--services', service, '--query', 'services[].{cluster:clusterArn,service:serviceArn,taskDefinition:taskDefinition,desired:desiredCount,running:runningCount,pending:pendingCount,deployments:deployments,events:events[0:8]}']);
await read('quota', ['service-quotas', 'get-service-quota', '--service-code', 'fargate', '--quota-code', 'L-3032A538']);
for (const suffix of ['recognition', 'recognition-dlq']) await read(suffix, ['sqs', 'get-queue-attributes', '--queue-url', `https://sqs.ap-southeast-2.amazonaws.com/901444280953/a3-n12281212-unframe-${suffix}`, '--attribute-names', 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed', 'RedrivePolicy']);
const queries = JSON.parse(await readFile('verification/2026-10-31/aws-final/metric-queries.json', 'utf8'));
for (const q of queries) if (q.Id === 'visible') q.MetricStat.Stat = 'Maximum';
await writeFile(`${dir}/metric-queries.json`, JSON.stringify(queries));
await read('F20-metrics', ['cloudwatch', 'get-metric-data', '--metric-data-queries', `file://${dir}/metric-queries.json`, '--start-time', process.env.UNFRAME_METRICS_START || new Date(Date.now() - 30 * 60000).toISOString(), '--end-time', new Date().toISOString()]);
await read('dashboard', ['cloudwatch', 'get-dashboard', '--dashboard-name', 'a3-n12281212-unframe']);
await read('api-routes', ['apigatewayv2', 'get-routes', '--api-id', '4xfbhsso7a', '--query', 'Items[].{route:RouteKey,target:Target}']);
const historicalInput = { TableName: 'a3-n12281212-unframe-jobs', Key: { jobId: { S: 'e606a64c-20fe-4b50-b781-a6f1ee78b63d' } }, ConsistentRead: true, ProjectionExpression: '#id,#s,#a,#c,#e', ExpressionAttributeNames: { '#id': 'jobId', '#s': 'status', '#a': 'attempts', '#c': 'completedAt', '#e': 'error' } };
await writeFile(`${dir}/historical-read-input.json`, JSON.stringify(historicalInput));
await read('historical-analyse', ['dynamodb', 'get-item', '--cli-input-json', `file://${dir}/historical-read-input.json`]);
