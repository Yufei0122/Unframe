import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const exec = promisify(execFile), dir = 'artifacts/bedrock-v5-deployment';
const cluster = 'n12281212-strobe-a2', serviceName = 'a3-n12281212-unframe-worker';
async function aws(args) { try { return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })).stdout); } catch (e) { throw new Error(e.stderr?.trim() || 'AWS read failed'); } }
try {
  const expected = JSON.parse(await readFile(`${dir}/task-registered.json`, 'utf8'));
  const normalize = td => {
    const copy = structuredClone(td);
    for (const key of ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities', 'registeredAt', 'registeredBy', 'deregisteredAt']) delete copy[key];
    copy.containerDefinitions.find(c => c.name === 'unframe-worker').image = '[image]'; return copy;
  };
  const old = await aws(['ecs', 'describe-task-definition', '--task-definition', 'a3-n12281212-unframe-worker:5']);
  const fresh = await aws(['ecs', 'describe-task-definition', '--task-definition', expected.taskDefinitionArn]);
  assert.deepEqual(normalize(fresh.taskDefinition), normalize(old.taskDefinition));
  const snapshots = [], started = Date.now();
  for (;;) {
    const service = (await aws(['ecs', 'describe-services', '--cluster', cluster, '--services', serviceName])).services[0];
    const { taskArns } = await aws(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', serviceName, '--desired-status', 'RUNNING']);
    const tasks = taskArns.length ? (await aws(['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...taskArns])).tasks : [];
    const safe = { at: new Date().toISOString(), desired: service.desiredCount, running: service.runningCount, pending: service.pendingCount,
      deployments: service.deployments.map(d => ({ taskDefinition: d.taskDefinition, status: d.status, rollout: d.rolloutState, failedTasks: d.failedTasks })),
      tasks: tasks.map(t => ({ taskArn: t.taskArn, taskDefinitionArn: t.taskDefinitionArn, lastStatus: t.lastStatus, healthStatus: t.healthStatus, cpu: t.cpu, memory: t.memory,
        containers: t.containers.map(c => ({ name: c.name, healthStatus: c.healthStatus, image: c.image, imageDigest: c.imageDigest })) })) };
    snapshots.push(safe); await writeFile(`${dir}/rollout-observations.json`, JSON.stringify(snapshots, null, 2));
    console.log(JSON.stringify(safe));
    if (service.desiredCount === 1 && service.runningCount === 1 && service.pendingCount === 0 && service.deployments.length === 1 && service.deployments[0].rolloutState === 'COMPLETED'
      && tasks.length === 1 && tasks[0].taskDefinitionArn === expected.taskDefinitionArn && tasks[0].healthStatus === 'HEALTHY') {
      assert.equal(tasks[0].containers.find(c => c.name === 'unframe-worker').imageDigest, expected.image.split('@')[1]);
      await writeFile(`${dir}/deployment-verified.json`, JSON.stringify({ status: 'PASS', configurationPreserved: true, ...safe }, null, 2)); break;
    }
    if (service.deployments.some(d => d.rolloutState === 'FAILED') || Date.now() - started > 15 * 60000) throw new Error('Rollout failed or did not become healthy within 15 minutes');
    await delay(20000);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
