// Read-only ECS/SQS scaling diagnosis; no task, policy, queue or job mutations.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const exec = promisify(execFile);
// A separate output directory preserves earlier timestamped evidence on subsequent audits.
const dir = process.argv[2] || 'verification/2026-10-31/scaling-investigation';
const cluster = 'n12281212-strobe-a2', service = 'a3-n12281212-unframe-worker';
const resource = `service/${cluster}/${service}`;
await mkdir(dir, { recursive: true });
async function read(name, args) {
  try {
    const { stdout } = await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const value = JSON.parse(stdout);
    await writeFile(`${dir}/${name}.json`, JSON.stringify({ retrievedAt: new Date().toISOString(), value }, null, 2));
    console.log(JSON.stringify({ read: name, status: 'PASS' })); return value;
  } catch (error) {
    const code = error.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || 'CLI_FAILED';
    const message = error.stderr?.trim().replace(/User: .*? is not authorized/g, 'Current AWS principal is not authorized');
    await writeFile(`${dir}/${name}.json`, JSON.stringify({ retrievedAt: new Date().toISOString(), errorCode: code, message }, null, 2));
    console.log(JSON.stringify({ read: name, status: code }));
  }
}
const identity = await read('identity', ['sts', 'get-caller-identity', '--query', '{Account:Account}']);
if (identity?.Account !== '901444280953') throw new Error('Expected AWS account unavailable');
await read('target', ['application-autoscaling', 'describe-scalable-targets', '--service-namespace', 'ecs', '--resource-ids', resource]);
const policies = await read('policy', ['application-autoscaling', 'describe-scaling-policies', '--service-namespace', 'ecs', '--resource-id', resource]);
await read('activities', ['application-autoscaling', 'describe-scaling-activities', '--service-namespace', 'ecs', '--resource-id', resource, '--include-not-scaled-activities']);
const services = await read('service', ['ecs', 'describe-services', '--cluster', cluster, '--services', service, '--query', 'services[].{taskDefinition:taskDefinition,desired:desiredCount,running:runningCount,pending:pendingCount,deployments:deployments,events:events}']);
await read('cluster-capacity', ['ecs', 'describe-clusters', '--clusters', cluster, '--include', 'STATISTICS', '--query', 'clusters[].{clusterName:clusterName,status:status,runningTasksCount:runningTasksCount,pendingTasksCount:pendingTasksCount,activeServicesCount:activeServicesCount,statistics:statistics}']);
const subnets = services?.[0]?.deployments?.find(d => d.status === 'PRIMARY')?.networkConfiguration?.awsvpcConfiguration?.subnets;
if (subnets?.length) await read('subnet-capacity', ['ec2', 'describe-subnets', '--subnet-ids', ...subnets, '--query', 'Subnets[].{SubnetId:SubnetId,State:State,AvailabilityZone:AvailabilityZone,AvailableIpAddressCount:AvailableIpAddressCount}']);
if (services?.[0]) await read('task-settings', ['ecs', 'describe-task-definition', '--task-definition', services[0].taskDefinition, '--query', 'taskDefinition.{cpu:cpu,memory:memory,runtime:runtimePlatform,containers:containerDefinitions[].{name:name,stopTimeout:stopTimeout,healthCheck:healthCheck}}']);
const tasks = await read('task-arns', ['ecs', 'list-tasks', '--cluster', cluster, '--service-name', service, '--desired-status', 'RUNNING']);
if (tasks?.taskArns?.length) {
  await read('task-health', ['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...tasks.taskArns, '--query', 'tasks[].{taskArn:taskArn,taskDefinitionArn:taskDefinitionArn,status:lastStatus,health:healthStatus,cpu:cpu,memory:memory,containers:containers[].{name:name,health:healthStatus,imageDigest:imageDigest}}']);
  await read('task-protection', ['ecs', 'get-task-protection', '--cluster', cluster, '--tasks', ...tasks.taskArns]);
}
await read('quota', ['service-quotas', 'get-service-quota', '--service-code', 'fargate', '--quota-code', 'L-3032A538']);
for (const suffix of ['recognition', 'recognition-dlq']) await read(suffix, ['sqs', 'get-queue-attributes', '--queue-url', `https://sqs.ap-southeast-2.amazonaws.com/901444280953/a3-n12281212-unframe-${suffix}`, '--attribute-names', 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed', 'VisibilityTimeout', 'RedrivePolicy']);
const policy = policies?.ScalingPolicies?.find(p => p.PolicyName === 'unframe-sqs-backlog');
if (policy) {
  const alarms = await read('alarms', ['cloudwatch', 'describe-alarms', '--alarm-names', ...policy.Alarms.map(a => a.AlarmName)]);
  for (const [i, alarm] of (alarms?.MetricAlarms || []).entries()) {
    await read(`alarm-${i}-history`, ['cloudwatch', 'describe-alarm-history', '--alarm-name', alarm.AlarmName, '--start-date', '2026-10-31T07:03:00Z', '--end-date', new Date().toISOString()]);
  }
  const queries = structuredClone(alarms?.MetricAlarms?.find(a => a.ComparisonOperator === 'GreaterThanThreshold')?.Metrics || []);
  for (const q of queries) { q.ReturnData = true; if (q.MetricStat) q.MetricStat.Period = 60; }
  queries.push({ Id: 'visible_max', MetricStat: { Metric: { Namespace: 'AWS/SQS', MetricName: 'ApproximateNumberOfMessagesVisible', Dimensions: [{ Name: 'QueueName', Value: 'a3-n12281212-unframe-recognition' }] }, Period: 60, Stat: 'Maximum' }, ReturnData: true });
  for (const [Id, MetricName] of [['cpu', 'CPUUtilization'], ['memory', 'MemoryUtilization']]) {
    queries.push({ Id, MetricStat: { Metric: { Namespace: 'AWS/ECS', MetricName, Dimensions: [{ Name: 'ClusterName', Value: cluster }, { Name: 'ServiceName', Value: service }] }, Period: 60, Stat: 'Average' }, ReturnData: true });
  }
  for (const [Id, MetricName] of [['inflight', 'ApproximateNumberOfMessagesNotVisible'], ['oldest', 'ApproximateAgeOfOldestMessage']]) {
    queries.push({ Id, MetricStat: { Metric: { Namespace: 'AWS/SQS', MetricName, Dimensions: [{ Name: 'QueueName', Value: 'a3-n12281212-unframe-recognition' }] }, Period: 60, Stat: 'Maximum' }, ReturnData: true });
  }
  await writeFile(`${dir}/metric-query.json`, JSON.stringify(queries, null, 2));
  await read('original-metric-math', ['cloudwatch', 'get-metric-data', '--metric-data-queries', `file://${dir}/metric-query.json`, '--start-time', '2026-10-31T07:03:00Z', '--end-time', '2026-10-31T07:11:00Z']);
  await read('current-metric-math', ['cloudwatch', 'get-metric-data', '--metric-data-queries', `file://${dir}/metric-query.json`, '--start-time', new Date(Date.now()-15*60000).toISOString(), '--end-time', new Date().toISOString()]);
}
const batch = JSON.parse(await readFile('verification/2026-10-31/recognition-final/F14-load-results.json', 'utf8'));
const first = Math.min(...batch.jobs.map(j=>j.createdAt)), last = Math.max(...batch.jobs.map(j=>j.createdAt)), done = Math.max(...batch.jobs.map(j=>j.completedAt));
await writeFile(`${dir}/original-timing.json`, JSON.stringify({ jobs: batch.total, succeeded: batch.succeeded, processing: batch.processing,
  firstCreatedAt: new Date(first*1000).toISOString(), lastCreatedAt: new Date(last*1000).toISOString(), lastCompletedAt: new Date(done*1000).toISOString(),
  note: 'DynamoDB timestamps have one-second precision; submission duration is approximate.', createSpanSeconds: last-first,
  nominalCreatesPerSecond: batch.total/(last-first), wholeBurstCompletionSeconds: done-first, serialCapacityJobsPerSecond: 1000/batch.processing.meanMs }, null, 2));
