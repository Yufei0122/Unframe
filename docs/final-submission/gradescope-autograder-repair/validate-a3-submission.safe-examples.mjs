import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const require = createRequire(path.resolve('mobile/package.json'));
const YAML = require('yaml');
const dir = 'verification/2026-10-31/recognition-final';
// Validate a new, explicit submission manifest without rewriting historical evidence.
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const manifestPath = value('--manifest');
const outputPath = value('--output');
if (!manifestPath || !outputPath || args.length !== 4) throw new Error('Usage: node scripts/validate-a3-submission.mjs --manifest <new-manifest.json> --output <new-receipt.json>');
const repairDir = path.resolve('docs/final-submission/gradescope-repair');
for (const file of [manifestPath, outputPath]) assert.ok(path.resolve(file).startsWith(repairDir + path.sep), 'Use a new audit file under docs/final-submission/gradescope-repair; historical evidence is read-only.');
async function readJson(name) {
  const data = await readFile(`${dir}/${name}.json`);
  return JSON.parse(data.toString(data[0] === 255 && data[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
}
const declaration = YAML.parse(await readFile('submission-a3-infra.yml', 'utf8'));
assert.equal(declaration.metaData.qutUsernameTag, 'n12281212@qut.edu.au');
assert.ok(declaration.cloudInfrastructure.every(r => r.type && r.arn?.startsWith('arn:aws:') && r.description));
assert.equal(new Set(declaration.cloudInfrastructure.map(r => r.arn)).size, declaration.cloudInfrastructure.length);
assert.ok(!declaration.cloudInfrastructure.some(r => r.arn.endsWith(':function:a3-n12281212-unframe-planning')));
const before = JSON.parse((await readJson('before-dashboard')).DashboardBody);
const after = JSON.parse((await readJson('after-dashboard')).DashboardBody);
assert.deepEqual(after, before);
assert.deepEqual(after.widgets[3].properties.metrics.map(m => m.slice(0, 2)), [['AWS/ECS', 'CPUUtilization'], ['AWS/ECS', 'MemoryUtilization']]);
assert.equal(after.widgets[3].properties.stat, 'Average');
const vectorKeys = await readJson('vector-keys');
assert.equal(vectorKeys.vectors.length, 15); assert.ok(!vectorKeys.nextToken);
const browser = await readJson('F18-browser');
assert.equal(browser.jobsCreated, 1); assert.equal(browser.suppressedExtraJobs, 0);
assert.equal(browser.recognition.artworkId, 'water-lilies'); assert.ok(browser.recognition.similarity >= .80);
assert.equal(browser.recognition.requiresConfirmation, true);
assert.ok(browser.recognition.candidates.length <= 3);
assert.equal(typeof browser.confirmationHttpSucceeded, 'boolean');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
assert.equal(sha(await readFile('submission-a3-infra.yml')), manifest.infrastructureSha256, 'Infrastructure declaration changed after audit');
for (const file of manifest.manifest) {
  assert.equal(sha(await readFile(path.join('app', file.path))), file.sha256, file.path);
  if (file.matchesCurrentRoot) assert.equal(sha(await readFile(file.path)), file.sha256, `source changed after snapshot: ${file.path}`);
}
const suspectFiles = [];
const submittedPaths = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Submission contains a symlink');
    if (entry.isDirectory()) { assert.ok(!['node_modules', '.aws', '.git', '.venv', '.expo'].includes(entry.name)); await scan(file); }
    else {
      submittedPaths.push(path.relative('app', file).replaceAll('\\', '/'));
      assert.ok((!entry.name.startsWith('.env') || entry.name === '.env.example') && !/credentials|service-account|\.pem$|\.key$/i.test(entry.name), file);
      if (/\.(js|mjs|ts|tsx|json|md|yml|yaml|ps1|py|txt)$/i.test(entry.name)) {
        const text = await readFile(file, 'utf8');
        if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|X-Amz-Signature=[a-f0-9]{64}|(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9/+]{30,}|["'](?:readToken|readTokenHash|tokenHash)["']\s*:\s*["'][A-Za-z0-9_+/=-]{32,}/.test(text)) suspectFiles.push(file);
      }
    }
  }
}
await scan('app');
assert.deepEqual(suspectFiles, []);
assert.deepEqual(submittedPaths.sort(), manifest.manifest.map(f => f.path).sort(), 'Manifest must cover every file, without omissions or extras');
const target = JSON.parse(await readFile('app/deployment/ecs/scalable-target.json', 'utf8'));
assert.equal(target.MinCapacity, 1); assert.equal(target.MaxCapacity, 3);
for (const file of ['app/deployment/ecs/autoscaling.json', 'app/deployment/ecs/backlog-target-tracking.json', 'deployment/ecs/autoscaling.json', 'deployment/ecs/backlog-target-tracking.json']) {
  const policy = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(policy.TargetValue, 3, file); assert.equal(policy.ScaleOutCooldown, 30, file); assert.equal(policy.ScaleInCooldown, 120, file);
  assert.equal(policy.DisableScaleIn, false, file);
}
const finalTarget = JSON.parse(await readFile('deployment/ecs/scalable-target.json', 'utf8'));
assert.equal(finalTarget.MinCapacity, 1); assert.equal(finalTarget.MaxCapacity, 3);
// The existing S3 endpoint is not associated with the worker's public route table.
assert.ok(!declaration.cloudInfrastructure.some(r => r.arn.endsWith(':vpc-endpoint/vpce-007b39b34446e234b')));
assert.ok(declaration.cloudInfrastructure.some(r => r.arn.endsWith(':log-group:/aws/ecs/containerinsights/n12281212-strobe-a2/performance')));
const summary = { status: 'PASS_LOCAL_VALIDATION', submissionReady: false, resources: declaration.cloudInfrastructure.length,
  sourceFilesVerified: manifest.files, sourceBytes: manifest.bytes, dashboardWidgetsPreserved: before.widgets.length, vectorCount: 15,
  historicalBrowserJobsVerified: 1, detectedSecretPatterns: 0, cloudPlanning: 'OUT_OF_SCOPE_FUTURE_WORK', remaining: ['fresh AWS verification blocked by expired session', 'shared API and dependency tagging review', 'final Calculator reconciliation', ...(browser.confirmationHttpSucceeded ? [] : ['optional AI confirmation endpoint unavailable']), 'student report/video'] };
await writeFile(outputPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
