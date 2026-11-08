import { writeFile } from 'node:fs/promises';
const origin = 'https://d3x3iexpafsgf.cloudfront.net';
const index = await fetch(origin);
const html = await index.text();
const asset = html.match(/src="([^" ]+\.js)"/)?.[1];
if (!asset) throw new Error('Deployed JavaScript not found');
const url = new URL(asset, origin).href;
const evidence = { origin, asset: url, requests: [], build: {} };
for (let i = 0; i < 3; i++) {
  const timestamp = new Date().toISOString(), start = performance.now();
  const response = await fetch(url);
  const text = await response.text();
  evidence.requests.push({ timestamp, status: response.status, xCache: response.headers.get('x-cache'), age: response.headers.get('age'),
    cacheControl: response.headers.get('cache-control'), elapsedMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(text) });
  evidence.build = { actualApiBasePresent: text.includes('https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob'), jobsModePresent: text.includes('jobs'), localhostApiPresent: text.includes('http://localhost:3000') };
}
evidence.status = evidence.requests.every(r => r.status === 200) && evidence.requests.some(r => r.xCache?.includes('Hit')) ? 'PASS' : 'FAIL';
await writeFile(`${process.env.UNFRAME_FINAL_DIR || 'verification/2026-10-31/aws-final'}/F19-cache.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
