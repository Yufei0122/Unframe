// Prepare a source-only submission snapshot. Never copies credentials, caches or model weights.
import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const evidenceDir = 'verification/2026-10-31/aws-final';
const finalDir = 'verification/2026-10-31/recognition-final';
// Historical generator: never overwrite the immutable verification snapshot.
try {
  await readFile(`${finalDir}/source-manifest.json`);
  throw new Error('Historical submission snapshot already exists. Use the final Gradescope repair manifest; this generator must not overwrite original evidence.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
async function json(file) {
  const bytes = await readFile(`${evidenceDir}/${file}.json`);
  return JSON.parse(bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
}
const account = '901444280953', region = 'ap-southeast-2';
const resources = [];
const add = (type, arn, description) => resources.push({ type, arn, description });
const service = (await json('ecs-service')).services[0];
const task = await json('task-definition');
const latestTask = JSON.parse(await readFile('artifacts/bedrock-v5-deployment/task-registered.json', 'utf8'));
task.taskDefinitionArn = latestTask.taskDefinitionArn;
add('ECS cluster', service.clusterArn, 'Existing shared cluster hosts the Unframe Fargate worker; the course FAQ permits cluster reuse without relabelling.');
add('ECS service', service.serviceArn, 'Runs recognition workers which pull uploaded-image jobs from SQS.');
add('ECS task definition', task.taskDefinitionArn, 'Pins worker v5 by verified ECR digest at 512 CPU units, 2048 MiB and Linux x86_64.');
add('ECR repository', `arn:aws:ecr:${region}:${account}:repository/a3-n12281212-unframe-worker`, 'Stores the immutable worker image containing OpenCLIP and recognition code.');
add('Lambda function', `arn:aws:lambda:${region}:${account}:function:a3-n12281212-unframe-jobs`, 'Creates jobs, issues bounded image uploads and reads results through per-job capabilities.');
add('API Gateway HTTP API', `arn:aws:apigateway:${region}::/apis/4xfbhsso7a`, 'Shared HTTP API exposes A3 job routes through the prob stage; its assessment 2 purpose tag needs course review.');
add('DynamoDB table', `arn:aws:dynamodb:${region}:${account}:table/a3-n12281212-unframe-jobs`, 'Persists job state, leases and bounded results with a TTL.');
for (const [suffix, description] of [['job-images', 'Temporarily stores private image uploads and emits S3 ObjectCreated notifications.'], ['web', 'Stores the public static frontend served through CloudFront.']]) add('S3 bucket', `arn:aws:s3:::a3-n12281212-unframe-${suffix}`, description);
for (const [suffix, description] of [['recognition', 'Buffers recognition work for serial worker-pull processing.'], ['recognition-dlq', 'Retains jobs that exhaust the configured retry policy for diagnosis.']]) add('SQS queue', `arn:aws:sqs:${region}:${account}:a3-n12281212-unframe-${suffix}`, description);
const index = (await json('vector-index')).index;
add('S3 vector bucket', index.vectorBucketName ? `arn:aws:s3vectors:${region}:${account}:bucket/${index.vectorBucketName}` : index.indexArn.split('/index/')[0], 'Stores the versioned reference artwork vector index.');
add('S3 vector index', index.indexArn, 'Retrieves matching artworks using 512-dimensional cosine vectors and metadata filters.');
add('CloudFront distribution', (await json('cloudfront')).Distribution.ARN, 'Caches public frontend assets and serves the web application over HTTPS.');
add('CloudWatch dashboard', (await json('dashboard-before')).DashboardArn, 'Displays eight queue, worker and Jobs Lambda operational metrics.');
for (const name of ['/ecs/a3-n12281212-unframe-worker', '/aws/lambda/a3-n12281212-unframe-jobs']) add('CloudWatch log group', `arn:aws:logs:${region}:${account}:log-group:${name}`, 'Stores bounded operational events for the corresponding Unframe runtime.');
const scalableTarget = (await json('F13-target')).ScalableTargets[0];
add('Application Auto Scaling target', scalableTarget.ScalableTargetARN, 'Registers the existing worker service at minimum one and maximum three tasks.');
add('IAM service-linked role', scalableTarget.RoleARN, 'AWS-managed ECS scaling role is used by the registered target to adjust service desired capacity.');
const policy = (await json('F13-policy')).ScalingPolicies[0];
add('Application Auto Scaling policy', policy.PolicyARN, 'Tracks visible SQS backlog per running task at target three with 30-second scale-out and 120-second scale-in cooldowns.');
for (const alarm of policy.Alarms) add('CloudWatch alarm', alarm.AlarmARN, 'Managed target-tracking alarm evaluates the worker backlog scaling metric.');
for (const [arn, description] of [[task.taskRoleArn, 'Existing course role supplies worker AWS service permissions.'], [task.executionRoleArn, 'Existing course role permits ECS image pulls and log delivery.'], [`arn:aws:iam::${account}:role/CAB432-Lambda-Role`, 'Existing course role executes the Jobs Lambda; effective policy inspection is restricted.']]) add('IAM role', arn, description);
const subnets = await json('network-subnets');
for (const subnet of subnets) add('EC2 subnet', subnet.SubnetArn, 'Existing subnet provides network placement for the worker task.');
for (const vpcId of new Set(subnets.map(s => s.VpcId))) add('EC2 VPC', `arn:aws:ec2:${region}:${account}:vpc/${vpcId}`, 'Existing shared virtual network connects worker tasks to regional service endpoints.');
for (const group of (await json('network-security-group')).SecurityGroups) add('EC2 security group', `arn:aws:ec2:${region}:${account}:security-group/${group.GroupId}`, 'Existing worker network rules control task ingress and egress.');
const routeTables = await json('network-routes');
const selectedTables = new Map(subnets.map(subnet => {
  const table = routeTables.find(t => t.Associations.some(a => a.SubnetId === subnet.SubnetId)) || routeTables.find(t => t.Associations.some(a => a.Main));
  if (!table) throw new Error('Subnet route table unresolved');
  return [table.RouteTableId, table];
}));
const gateways = new Set();
for (const table of selectedTables.values()) {
  add('EC2 route table', `arn:aws:ec2:${region}:${account}:route-table/${table.RouteTableId}`, 'Existing public subnet routes provide outbound connectivity for worker AWS calls.');
  for (const route of table.Routes) if (route.GatewayId?.startsWith('igw-')) gateways.add(route.GatewayId);
}
for (const gateway of gateways) add('EC2 internet gateway', `arn:aws:ec2:${region}:${account}:internet-gateway/${gateway}`, 'Existing shared gateway provides public subnet internet routing.');
add('Bedrock foundation model', `arn:aws:bedrock:${region}::foundation-model/google.gemma-3-12b-it`, 'AWS-managed optional artwork-analysis model; see the final verification evidence for the actual strict-schema outcome.');
const yaml = '# DRAFT resource declaration, not CloudFormation and not a deployment template.\n'
  + '# Based on SS.docx. Shared/provider-managed dependency tags and accepted identifiers require course review.\n'
  + '# Cloud tour planning is deliberately outside the A3 scope and is Future Work.\n'
  + 'cloudInfrastructure:\n' + resources.map(r => `  - type: ${JSON.stringify(r.type)}\n    arn: ${JSON.stringify(r.arn)}\n    description: ${JSON.stringify(r.description)}\n`).join('\n')
  + '\nmetaData:\n  qutUsernameTag: "n12281212@qut.edu.au"\n';
await writeFile('submission-a3-infra.yml', yaml);
await writeFile(`${finalDir}/resource-inventory.json`, JSON.stringify(resources, null, 2));

const excluded = new Set(['node_modules', '.git', '.aws', '.credentials', '.venv', '.expo', '__pycache__', 'dist', 'build', 'artifacts', 'test-results', 'playwright-report', 'ios', 'android']);
const manifest = [];
async function copy(source) {
  const destination = path.join('app', source);
  await mkdir(path.dirname(destination), { recursive: true });
  const data = await readFile(source);
  await copyFile(source, destination);
  manifest.push({ path: source.replaceAll('\\', '/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
    if (entry.name.startsWith('.env') || /credentials|service-account|\.pem$|\.key$|\.pt$|\.pth$|\.safetensors$|\.log$|\.pyc$/i.test(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) await copy(file);
  }
}
// Explicit directories prevent recursive inclusion of the new app/ snapshot.
for (const directory of ['server', 'shared', 'worker', 'local-ai', 'mobile', 'scripts', 'tests', 'deployment', 'docs']) await walk(directory);
for (const file of ['package.json', 'package-lock.json', 'README.md', 'AI-INTEGRATION.md', 'TRAINING.md', 'GOMA-DEMO.md', 'QUT-DEMO.md', 'MUSEUM-DISCOVERY.md', 'playwright.config.js', 'playwright.mobile.config.js', 'playwright.mobile-dev.config.js', '.gitignore']) await copy(file);
await writeFile('app/README-CAB432-A3.md', '# Unframe source submission\n\nA3 scope: cloud-native AI Artwork Recognition System, with optional Bedrock artwork analysis. Cloud tour planning is Future Work; its existing local source is preserved and is not a deployed A3 feature.\n\nSource snapshot for n12281212. Install root and mobile dependencies with `npm ci` and `npm --prefix mobile ci` using Node 22. See `docs/recognition-final-verification.md` for current results and limitations; older deployment reports are historical. Run `node --test tests/*.test.js`, `npm --prefix mobile test`, and `npm --prefix mobile run check`. Build the worker from this directory using `docker build --platform linux/amd64 -f worker/Dockerfile .`.\n\nNo credentials, environment files, node_modules, local model caches, build artifacts or visitor images are included. Model weights download at Docker build time. Supply deployment environment variables from the documented configuration; never place AWS keys in source or frontend. Historical training commands may require separately downloaded datasets/models.\n\nThe student must review shared-resource tags, write the report, create the calculator share link and record the 4–5-minute video. This source snapshot alone is not proof that every assessment criterion passed.\n');
await writeFile(`${finalDir}/source-manifest.json`, JSON.stringify({ createdAt: new Date().toISOString(), files: manifest.length, bytes: manifest.reduce((s, f) => s + f.bytes, 0), manifest }, null, 2));
console.log(JSON.stringify({ resources: resources.length, sourceFiles: manifest.length, sourceBytes: manifest.reduce((s, f) => s + f.bytes, 0) }));
