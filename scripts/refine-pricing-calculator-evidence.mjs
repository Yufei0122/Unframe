// Read-only follow-up: counts/sizes only; never writes raw item capabilities or log payloads.
import { execFile as cb } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
const exec = promisify(cb), dir = 'verification/2026-10-31/pricing-calculator';
const worker = 'a3-n12281212-unframe-worker', cluster = 'n12281212-strobe-a2';
async function aws(args) { return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })).stdout || '{}'); }
if ((await aws(['sts', 'get-caller-identity'])).Account !== '901444280953') throw new Error('Wrong account');
async function save(name, action) { try { const value = await action(); await writeFile(`${dir}/${name}.json`, JSON.stringify({ retrievedAt: new Date().toISOString(), value }, null, 2)); console.log(JSON.stringify({ name, value })); } catch (e) { const error = String(e.stderr || e.message).trim(); await writeFile(`${dir}/${name}.json`, JSON.stringify({ error }, null, 2)); console.log(JSON.stringify({ name, error })); } }
await save('ecr-unique-layers', async () => {
  const images = JSON.parse(await readFile(`${dir}/ecr.json`, 'utf8')).value;
  const v = await aws(['ecr', 'batch-get-image', '--repository-name', worker, '--image-ids', ...images.map(i => `imageDigest=${i.digest}`)]);
  const layers = new Map(), configs = new Map(); let manifests = 0, manifestBytes = 0;
  for (const image of v.images || []) { const m = JSON.parse(image.imageManifest); manifests++; manifestBytes += Buffer.byteLength(image.imageManifest); for (const l of m.layers || []) layers.set(l.digest, l.size); if (m.config) configs.set(m.config.digest, m.config.size); }
  return { manifests, failures: v.failures, uniqueLayers: layers.size, uniqueLayerBytes: [...layers.values()].reduce((a, b) => a + b, 0), uniqueConfigBytes: [...configs.values()].reduce((a, b) => a + b, 0), manifestBytes, note: 'Unique referenced compressed content, not CUR billed storage.' };
});
await save('api-cors', async () => { const v = await aws(['apigatewayv2', 'get-api', '--api-id', '4xfbhsso7a']); return { cors: v.CorsConfiguration || null, protocol: v.ProtocolType }; });
await save('ci-project-log-sizes', async () => {
  const v = await aws(['logs', 'filter-log-events', '--log-group-name', `/aws/ecs/containerinsights/${cluster}/performance`, '--start-time', String(Date.parse('2026-10-31T08:05:00Z')), '--end-time', String(Date.parse('2026-10-31T08:35:00Z')), '--filter-pattern', `"${worker}"`]);
  const groups = {};
  for (const e of v.events || []) { let m; try { m = JSON.parse(e.message); } catch { continue; } if (m.ServiceName !== worker && m.TaskDefinitionFamily !== worker) continue; const key = m.Type || 'unknown'; const g = groups[key] ||= { events: 0, bytes: 0 }; g.events++; g.bytes += Buffer.byteLength(e.message); }
  return { windowSeconds: 1800, groups, note: 'Only matching Unframe performance records; excludes shared cluster aggregate and Strobe records.' };
});
await save('vector-sizes', async () => {
  const arn = 'arn:aws:s3vectors:ap-southeast-2:901444280953:bucket/a3-n12281212-unframe-vectors/index/a3-n12281212-unframe-vectors';
  const { index } = await aws(['s3vectors', 'get-index', '--index-arn', arn]);
  const v = await aws(['s3vectors', 'list-vectors', '--index-arn', arn, '--return-metadata', '--max-results', '100']);
  const nonfilter = index.metadataConfiguration?.nonFilterableMetadataKeys || [];
  const b = x => Buffer.byteLength(typeof x === 'string' ? x : JSON.stringify(x));
  const rows = v.vectors.map(r => ({ keyBytes: b(r.key), vectorBytes: 4 * index.dimension, metadataUtf8Bytes: Object.entries(r.metadata || {}).reduce((s, [k, x]) => s + b(k) + b(x), 0), filterableUtf8Bytes: Object.entries(r.metadata || {}).filter(([k]) => !nonfilter.includes(k)).reduce((s, [k, x]) => s + b(k) + b(x), 0) }));
  return { count: rows.length, hasNextPage: !!v.nextToken, dimension: index.dimension, nonfilter, rows, note: 'UTF8 key/value logical byte estimate, excludes JSON transport punctuation. No embeddings retained.' };
});
await save('recognition-item-size', async () => {
  const jobId = 'd1964a3b-3090-4a41-87a6-83a2a69decac';
  // Prefer a known successful job from the latest experiment, not the historical failed job.
  const saved = JSON.parse(await readFile('verification/2026-10-31/scaling-max-three/run-01/jobs.json', 'utf8'));
  const list = Array.isArray(saved) ? saved : saved.value || saved.jobs || [];
  const id = list.find(j => j.status === 'SUCCEEDED')?.jobId || jobId;
  const keyFile = `${dir}/size-query-key.json`; await writeFile(keyFile, JSON.stringify({ jobId: { S: id } }));
  const v = await aws(['dynamodb', 'get-item', '--table-name', 'a3-n12281212-unframe-jobs', '--key', `file://${keyFile}`, '--consistent-read', '--return-consumed-capacity', 'TOTAL']);
  if (!v.Item) return { found: false };
  const size = a => a.S !== undefined ? Buffer.byteLength(a.S) : a.N !== undefined ? Math.ceil(a.N.replace(/[-.]/g, '').length / 2) + 1 : a.BOOL !== undefined || a.NULL !== undefined ? 1 : a.M ? 3 + Object.entries(a.M).reduce((s, [k, x]) => s + Buffer.byteLength(k) + size(x) + 1, 0) : a.L ? 3 + a.L.reduce((s, x) => s + size(x) + 1, 0) : 0;
  const bytes = Object.entries(v.Item).reduce((s, [k, x]) => s + Buffer.byteLength(k) + size(x), 0);
  return { found: true, jobId: id, status: v.Item.status?.S, estimatedItemBytes: bytes, stronglyConsistentReadUnits: v.ConsumedCapacity?.CapacityUnits, ttlSeconds: Number(v.Item.expiresAt?.N) - Number(v.Item.createdAt?.N), note: 'Numeric size approximation follows AWS sizing; no item values persisted.' };
});
