import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { catalogues } from '../server/ai/catalogues.js';
import { readAIConfig, AIError } from '../server/ai/config.js';
import { createEmbeddingService, createEmbeddingStore, referenceImageUrl, cosineSimilarity } from '../server/ai/embeddings.js';
import { createOllamaService } from '../server/ai/ollama.js';
import { createRecognitionService } from '../server/ai/recognition.js';
import { getAIStatus, inspectLocalServices } from '../server/ai/status.js';
import { normalizeImage } from '../server/ai/images.js';
import { applyInteractivePerformanceProfile } from './ai-runtime.mjs';

try {
  const args = process.argv.slice(2);
  const visionCheck = args.includes('--vision');
  const imageFlag = args.indexOf('--image');
  const imageFile = imageFlag < 0 ? undefined : args[imageFlag + 1];
  const flags = args.filter((_, index) => imageFlag < 0 || (index !== imageFlag && index !== imageFlag + 1));
  if (flags.some(arg => !['--smoke', '--live', '--vision'].includes(arg)) || (imageFlag >= 0 && (!visionCheck || !imageFile || imageFile.startsWith('--')))) throw new AIError(400, 'INVALID_ARGUMENT', 'Usage: npm.cmd run ai:doctor -- [--smoke | --vision [--image path]]');
  applyInteractivePerformanceProfile();
  const config = readAIConfig();
  const store = createEmbeddingStore(config);
  const services = await inspectLocalServices(config);
  const statuses = [];
  for (const [museumId, { collection }] of catalogues) statuses.push(await getAIStatus({ config, store, collection, museumId, services, verifySources: true }));
  console.log(JSON.stringify({ check: 'local_services_and_index', passed: statuses.every(status => status.ready), liveVerified: false, museums: statuses }, null, 2));
  if (visionCheck) {
    if (!services.vision.available) throw new AIError(503, services.vision.code, 'The local vision model is unavailable. Run npm.cmd run ai:setup:vision.');
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AIError(400, 'INVALID_PORT', 'PORT must be a valid backend port.');
    const source = imageFile ? await readFile(imageFile) : await readFile(new URL('../mobile/assets/water-lilies.jpg', import.meta.url));
    const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[(await sharp(source).metadata()).format];
    const image = await normalizeImage(source, mime);
    const form = new FormData(); form.append('image', new Blob([image], { type: 'image/jpeg' }), 'artwork.jpg');
    console.log(`Testing real visual analysis through the running backend (CPU budget ${config.analysisBudgetMs} ms, including model loading).`);
    let response;
    try { response = await fetch(`http://127.0.0.1:${port}/api/ai/artworks/analyse`, { method: 'POST', body: form, signal: AbortSignal.timeout(config.analysisBudgetMs + 5000) }); }
    catch (error) { throw new AIError(error.name === 'TimeoutError' ? 504 : 503, error.name === 'TimeoutError' ? 'VISION_TIMEOUT' : 'BACKEND_UNAVAILABLE', error.name === 'TimeoutError' ? 'Visual inference exceeded the CPU budget. Check Ollama logs and OLLAMA_VISION_TIMEOUT_MS.' : 'Cannot reach the updated backend. Restart ai:up and verify its PORT.'); }
    const result = await response.json();
    if (!response.ok) throw new AIError(response.status, result.code || 'VISION_HTTP_ERROR', result.error || 'The backend cannot analyse images. Restart it after updating the code.');
    if (!['uncertain', 'possible_match'].includes(result.identityStatus) || typeof result.description !== 'string') throw new AIError(502, 'INVALID_VISION_RESULT', 'The backend returned an invalid visual analysis.');
    console.log(JSON.stringify({ check: 'real_general_artwork_analysis', liveVerified: true, identityConfirmed: false, model: config.visionModel, result, note: 'Real HTTP and vision inference. This does not establish identification accuracy. Inspect search.status and visualCheck for source coverage; all identity suggestions remain unconfirmed.' }, null, 2));
  } else if (!statuses.every(status => status.ready)) {
    console.error('AI is not ready. Follow the service/index messages above. If models are already installed, run npm.cmd run ai:up and keep that terminal open, then rerun ai:doctor in another terminal.');
    process.exitCode = 1;
  } else if (args.some(arg => ['--smoke', '--live'].includes(arg))) {
    const embeddings = createEmbeddingService(config);
    const ollama = createOllamaService(config);
    const records = await store.load({ verifySources: true });
    const live = [];
    for (const [museumId, { collection }] of catalogues) {
      const artwork = collection[0];
      console.log(`Smoke: ${museumId} real OpenCLIP reference, transformed reference and unrelated image.`);
      const image = await normalizeImage(await readFile(referenceImageUrl(artwork)));
      const referenceVector = await embeddings.generate(image);
      const recognition = createRecognitionService({ config, embeddings: { generate: async () => referenceVector }, store, ollama, collection });
      const result = await recognition.recognise(image);
      if (result.candidates[0]?.artwork.id !== artwork.id) throw new AIError(502, 'LIVE_RECOGNITION_MISMATCH', 'A catalogue reference image did not retrieve its expected artwork. Rebuild the index and review source images.');
      const transformed = await sharp(image).resize({ width: 384 }).modulate({ brightness: 0.9 }).jpeg({ quality: 65 }).toBuffer();
      const transformedVector = await embeddings.generate(await normalizeImage(transformed, 'image/jpeg'));
      const transformedResult = await createRecognitionService({ config, embeddings: { generate: async () => transformedVector }, store, ollama, collection }).recognise(transformed);
      if (transformedResult.candidates[0]?.artwork.id !== artwork.id) throw new AIError(502, 'LIVE_TRANSFORMED_REFERENCE_MISMATCH', 'A resized reference image was not retrieved. Review the threshold using more camera samples.');
      const unrelated = await normalizeImage(await readFile(new URL(`../mobile/assets/${museumId === 'qut' ? 'met' : museumId}-exterior.jpg`, import.meta.url)), 'image/jpeg');
      const unrelatedVector = await embeddings.generate(unrelated);
      const unrelatedResult = await createRecognitionService({ config, embeddings: { generate: async () => unrelatedVector }, store, ollama, collection }).recognise(unrelated);
      const maxUnrelatedSimilarity = Math.max(...records.filter(r => r.museumId === museumId).map(r => cosineSimilarity(unrelatedVector, r.vector)));
      if (unrelatedResult.matched) throw new AIError(502, 'LIVE_UNRELATED_MATCH', 'An unrelated exterior photograph passed the matching threshold. Calibrate ARTWORK_MATCH_THRESHOLD before using recognition.');
      let explanation;
      if (!live.length) {
        console.log(`Smoke: ${museumId} real Qwen structured explanation (CPU deadline ${config.explanationTimeoutMs} ms including model loading).`);
        explanation = await ollama.generateArtworkExplanation(artwork, [], collection);
      }
      live.push({ museumId, embedding: 'passed', referenceRetrieval: { artworkId: artwork.id, similarity: result.candidates[0].similarity }, transformedReferenceSimilarity: transformedResult.candidates[0].similarity, unrelatedImageRejected: true, maxUnrelatedSimilarity, threshold: config.threshold, ...(explanation ? { explanation } : {}) });
    }
    console.log(JSON.stringify({ check: 'real_local_models', liveVerified: true, museums: live, note: 'Reference/transformation/exterior image sets for every supported museum and one real structured explanation. Run scripts/validate-local-ai.mjs for broader retrieval and HTTP explanation/route/chat checks. Similarity is not accuracy or probability; validate camera conditions and more negative images before broad use. Visitor photographs are never stored.' }, null, 2));
  } else console.log('PASS readiness: local services, models and indexes are ready. Inference has not been tested by this command. Run npm.cmd run ai:doctor -- --smoke and npm.cmd run ai:doctor -- --vision for real model checks.');
} catch (error) {
  console.error(JSON.stringify({ check: 'failed', liveVerified: false, code: error instanceof AIError ? error.code : 'CHECK_FAILED', error: error instanceof AIError ? error.message : 'AI check failed. Review local configuration and reference images.' }));
  process.exitCode = 1;
}
