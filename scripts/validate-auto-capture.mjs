// Real CLIP/HTTP controls for auto capture. No simulated model-success mode.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { referenceArtworks, referenceImageUrl } from '../server/ai/embeddings.js';
import { normalizeImage } from '../server/ai/images.js';

const port = Number(process.env.PORT || 3000);
assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535, 'PORT must be a valid local port.');
const backend = `http://127.0.0.1:${port}`;
const report = { passed: false, backend, checks: [],
  scope: 'Fast scene detection and collection matching only; no vision generation.',
  limitation: 'Bundled images and synthetic framed variants are controlled checks, not independent visitor-camera accuracy. Artwork detection is a scene cue, never identity or probability.' };
const controls = referenceArtworks().map(({ museumId, artwork }) => ({ name: artwork.id, museumId, file: referenceImageUrl(artwork), detected: true, matched: true }));
controls.push({ name: 'unfamiliar_art', file: new URL('../mobile/assets/quiet-geometry.png', import.meta.url), detected: true, matched: false });
for (const file of ['water-lilies.jpg', 'quiet-geometry.png']) controls.push({ name: `framed_${file}`, file: new URL(`../mobile/assets/${file}`, import.meta.url), framed: true, detected: true });
for (const file of ['met-exterior.jpg', 'goma-exterior.jpg']) controls.push({ name: file, file: new URL(`../mobile/assets/${file}`, import.meta.url), detected: false, matched: false });
for (const background of ['white', 'black']) controls.push({ name: `blank_${background}`, background, detected: false, matched: false });

for (const sample of controls) {
  const started = performance.now();
  try {
    let image = sample.file ? await readFile(sample.file) : await sharp({ create: { width: 640, height: 800, channels: 3, background: sample.background } }).jpeg().toBuffer();
    if (sample.framed) image = await sharp(image).resize({ width: 480, height: 480, fit: 'inside' })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#66523e' }).jpeg().toBuffer();
    if (sample.framed) image = await sharp(image).extend({ top: 80, bottom: 100, left: 80, right: 80, background: '#dedbd3' }).jpeg().toBuffer();
    const form = new FormData(); form.set('image', new Blob([await normalizeImage(image)], { type: 'image/jpeg' }), 'control.jpg');
    const response = await fetch(`${backend}/api/ai/artworks/recognise?museumId=${sample.museumId || 'met'}`, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.artworkDetected, sample.detected, 'Scene detection disagreed with the labelled control.');
    if (sample.matched !== undefined) assert.equal(result.matched, sample.matched);
    assert.equal(result.requiresConfirmation, true);
    const row = { name: sample.name, passed: true, elapsedMs: Math.round(performance.now() - started), artworkDetected: result.artworkDetected, matched: result.matched };
    report.checks.push(row); console.log(JSON.stringify(row));
  } catch (error) { report.checks.push({ name: sample.name, passed: false, elapsedMs: Math.round(performance.now() - started), error: error.message }); }
}
report.passed = report.checks.every(row => row.passed);
await mkdir(new URL('../.local-ai/acceptance/', import.meta.url), { recursive: true });
await writeFile(new URL('../.local-ai/acceptance/auto-capture.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.checks.filter(row => !row.passed) }, null, 2));
if (!report.passed) process.exitCode = 1;
