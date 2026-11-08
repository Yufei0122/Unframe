// Explicitly authorized existing-target update only. Never calls ECS UpdateService.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const exec = promisify(execFile), dir = 'verification/2026-10-31/scaling-max-three';
const service = 'a3-n12281212-unframe-worker';
async function aws(args) {
  return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })).stdout || '{}');
}
async function save(name, value) { await writeFile(`${dir}/${name}.json`, JSON.stringify({ at: new Date().toISOString(), value }, null, 2)); }
try {
  assert.equal((await aws(['sts', 'get-caller-identity', '--query', '{Account:Account}'])).Account, '901444280953');
  const targetResult = await aws(['application-autoscaling', 'describe-scalable-targets', '--service-namespace', 'ecs']);
  const matches = targetResult.ScalableTargets.filter(t => t.ResourceId.endsWith(`/${service}`));
  assert.equal(matches.length, 1);
  const before = matches[0], resource = before.ResourceId, cluster = resource.split('/')[1];
  assert.equal(before.MinCapacity, 1); assert.ok([3, 4].includes(before.MaxCapacity));
  const live = (await aws(['ecs', 'describe-services', '--cluster', cluster, '--services', service, '--query', 'services[].{desired:desiredCount,running:runningCount,pending:pendingCount,deployments:deployments[].rolloutState}']))[0];
  assert.deepEqual([live.desired, live.running, live.pending], [1, 1, 0]);
  assert.ok(live.deployments.every(state => state === 'COMPLETED'));
  const policyArgs = ['application-autoscaling', 'describe-scaling-policies', '--service-namespace', 'ecs', '--resource-id', resource];
  const policyBefore = await aws(policyArgs);
  const config = policyBefore.ScalingPolicies.find(p => p.PolicyName === 'unframe-sqs-backlog').TargetTrackingScalingPolicyConfiguration;
  assert.deepEqual([config.TargetValue, config.ScaleOutCooldown, config.ScaleInCooldown], [3, 30, 120]);
  const input = { ServiceNamespace: 'ecs', ResourceId: resource, ScalableDimension: 'ecs:service:DesiredCount', MinCapacity: 1, MaxCapacity: 3 };
  await save('target-before-update', before); await save('policy-before-update', policyBefore);
  await writeFile(`${dir}/target-update-input.json`, JSON.stringify(input, null, 2));
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ prepared: true, input })); }
  else {
    if (before.MaxCapacity !== 3) await save('update-response', await aws(['application-autoscaling', 'register-scalable-target', '--cli-input-json', `file://${dir}/target-update-input.json`]));
    const after = (await aws(['application-autoscaling', 'describe-scalable-targets', '--service-namespace', 'ecs', '--resource-ids', resource])).ScalableTargets[0];
    const policyAfter = await aws(policyArgs);
    await save('target-after-update', after); await save('policy-after-update', policyAfter);
    assert.equal(after.MinCapacity, 1); assert.equal(after.MaxCapacity, 3);
    assert.equal(after.RoleARN, before.RoleARN); assert.deepEqual(after.SuspendedState, before.SuspendedState);
    assert.deepEqual(policyAfter, policyBefore);
    console.log(JSON.stringify({ verified: true, cluster, min: after.MinCapacity, max: after.MaxCapacity, policyUnchanged: true }));
  }
} catch (error) {
  const code = error.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || error.code || error.name;
  const detail = error.stderr?.trim().replace(/User: .*? is not authorized/g, 'Current AWS principal is not authorized');
  await save('update-error', { code, detail });
  console.error(JSON.stringify({ failed: true, code, detail })); process.exitCode = 1;
}
