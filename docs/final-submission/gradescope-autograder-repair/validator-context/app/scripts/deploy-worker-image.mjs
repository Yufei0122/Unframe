// Explicitly invoked image-only ECS rollout. Full task configuration stays in memory.
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const exec = promisify(execFile), dir = 'artifacts/bedrock-v5-deployment';
const cluster = 'n12281212-strobe-a2', service = 'a3-n12281212-unframe-worker';
async function aws(args) {
  try { return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })).stdout); }
  catch (error) { throw new Error(error.stderr?.trim() || 'AWS CLI failed; no configuration printed'); }
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields = ['desiredCount', 'networkConfiguration', 'deploymentConfiguration', 'capacityProviderStrategy', 'launchType', 'platformVersion', 'schedulingStrategy', 'loadBalancers', 'serviceRegistries', 'enableExecuteCommand'];
const stable = s => Object.fromEntries(fields.map(k => [k, s[k]]));
const save = (name, value) => writeFile(`${dir}/${name}.json`, JSON.stringify(value, null, 2));
try {
  assert.equal((await aws(['sts', 'get-caller-identity'])).Account, '901444280953');
  const receipt = JSON.parse(await readFile(`${dir}/ecr-v5.json`, 'utf8'));
  const digest = receipt.imageDetails[0].imageDigest;
  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  const before = (await aws(['ecs', 'describe-services', '--cluster', cluster, '--services', service])).services[0];
  assert.ok(before.taskDefinition.endsWith(':5'), 'Expected existing revision 5; stop on concurrent changes');
  assert.equal(before.desiredCount, 1); assert.equal(before.runningCount, 1);
  const original = await aws(['ecs', 'describe-task-definition', '--task-definition', before.taskDefinition, '--include', 'TAGS']);
  const input = structuredClone(original.taskDefinition);
  for (const key of ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities', 'registeredAt', 'registeredBy', 'deregisteredAt']) delete input[key];
  input.tags = original.tags;
  assert.equal(input.cpu, '512'); assert.equal(input.memory, '2048');
  assert.deepEqual(input.runtimePlatform, { cpuArchitecture: 'X86_64', operatingSystemFamily: 'LINUX' });
  const baseline = structuredClone(input);
  const worker = input.containerDefinitions.find(c => c.name === 'unframe-worker');
  assert.ok(worker);
  const previousImage = worker.image;
  worker.image = `901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/${service}@${digest}`;
  const restored = structuredClone(input); restored.containerDefinitions.find(c => c.name === worker.name).image = previousImage;
  assert.deepEqual(restored, baseline);
  await save('image-only-review', { previousTask: before.taskDefinition, previousImage, newImage: worker.image, cpu: input.cpu, memory: input.memory,
    runtimePlatform: input.runtimePlatform, healthCheck: worker.healthCheck, taskRoleArn: input.taskRoleArn, executionRoleArn: input.executionRoleArn,
    environmentNames: worker.environment.map(e => e.name), baselineHash: hash(baseline), restoredHash: hash(restored), serviceConfigurationHash: hash(stable(before)), onlyImageChanged: true });
  if (!process.argv.includes('--execute')) { console.log('Review prepared; --execute required'); process.exit(0); }
  const registered = await aws(['ecs', 'register-task-definition', '--cli-input-json', JSON.stringify(input)]);
  const td = registered.taskDefinition;
  await save('task-registered', { taskDefinitionArn: td.taskDefinitionArn, revision: td.revision, image: td.containerDefinitions.find(c => c.name === worker.name).image, cpu: td.cpu, memory: td.memory });
  // Check again before changing the service. No desired-count/network override.
  const current = (await aws(['ecs', 'describe-services', '--cluster', cluster, '--services', service])).services[0];
  assert.equal(current.taskDefinition, before.taskDefinition); assert.deepEqual(stable(current), stable(before));
  const updated = await aws(['ecs', 'update-service', '--cluster', cluster, '--service', service, '--task-definition', td.taskDefinitionArn]);
  assert.ok(isDeepStrictEqual(stable(updated.service), stable(before)));
  await save('service-update', { taskDefinition: updated.service.taskDefinition, configurationPreserved: true, desiredCount: updated.service.desiredCount, deployments: updated.service.deployments });
  console.log(JSON.stringify({ taskDefinition: td.taskDefinitionArn, image: worker.image, configurationPreserved: true }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
