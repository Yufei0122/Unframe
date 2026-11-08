// Validate this documentation/evidence deliverable without network access.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root = 'verification/2026-10-31/pricing-calculator';
const doc = await readFile('docs/a3-pricing-calculator-inputs.md', 'utf8');
const broken = [];
for (const [, target] of doc.matchAll(/\]\(([^)]+)\)/g)) {
  if (target.startsWith('http')) continue;
  try { await stat(resolve('docs', target)); } catch { broken.push(target); }
}
assert.deepEqual(broken, []);
const patterns = [/AKIA[0-9A-Z]{16}/, /ASIA[0-9A-Z]{16}/, /X-Amz-Signature=/i, /"readToken"\s*:/, /"secretAccessKey"\s*:/, /"sessionToken"\s*:/];
let files = 0; const hits = [];
async function scan(dir) { for (const e of await readdir(dir, { withFileTypes: true })) { const path = join(dir,e.name); if (e.isDirectory()) await scan(path); else { files++; const raw = await readFile(path,'utf8'); if (patterns.some(r=>r.test(raw))) hits.push(path); } } }
await scan(root); assert.deepEqual(hits, []);
const model = JSON.parse(await readFile(`${root}/calculator-model.json`,'utf8'));
const sum = Object.values(model.expected.costs).reduce((a,b)=>a+b,0);
assert.ok(Math.abs(sum-model.expected.grossMonthlyUsd)<1e-9);
assert.equal(sum.toFixed(2),'97.07');
assert.equal(model.recognitionOnly.grossMonthlyUsd.toFixed(2),'84.76');
for(const entry of Object.values(model.sources)) assert.ok(entry.source.startsWith('https://pricing.us-east-1.amazonaws.com/'));
const result = { checkedAt:new Date().toISOString(), checks:{localEvidenceLinks:'PASS', arithmetic:'PASS', publicRateSources:'PASS', sensitivePatternScan:'PASS'}, evidenceFilesScanned:files, sensitivePatternHits:0, limitation:'Pattern scan is a screening check, not proof of absence of all sensitive information. No application tests were needed for documentation/measurement tooling.' };
await writeFile(`${root}/validation.json`,JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
