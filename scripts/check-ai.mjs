import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { catalogues } from '../server/ai/catalogues.js';
import { readAIConfig, AIError } from '../server/ai/config.js';
import { createEmbeddingService, createEmbeddingStore, referenceImageUrl, cosineSimilarity } from '../server/ai/embeddings.js';
import { createOllamaService } from '../server/ai/ollama.js';
import { createRecognitionService } from '../server/ai/recognition.js';
import { getAIStatus, inspectLocalServices } from '../server/ai/status.js';
import { normalizeImage } from '../server/ai/images.js';

try {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--smoke', '--live'].includes(arg))) throw new AIError(400, 'INVALID_ARGUMENT', 'Usage: npm.cmd run ai:doctor -- [--smoke]');
  const config = readAIConfig();
  const store = createEmbeddingStore(config);
  const services = await inspectLocalServices(config);
  const statuses = [];
  for (const [museumId, { collection }] of catalogues) statuses.push(await getAIStatus({ config, store, collection, museumId, services, verifySources: true }));
  console.log(JSON.stringify({ check: 'local_services_and_index', liveVerified: false, museums: statuses }, null, 2));
  if (!statuses.every(status => status.ready)) {
    console.error('Local setup is incomplete. Run npm.cmd run ai:setup, npm.cmd run ai:up, then npm.cmd run ai:doctor.');
    process.exitCode = 1;
  } else if (args.some(arg => ['--smoke', '--live'].includes(arg))) {
    const embeddings = createEmbeddingService(config);
    const ollama = createOllamaService(config);
    const records = await store.load({ verifySources: true });
    const live = [];
    for (const [museumId, { collection }] of catalogues) {
      const artwork = collection[0];
      console.log(`Smoke: ${museumId} real OpenCLIP reference, transformed reference and unrelated image.`);
      const image = await normalizeImage(await readFile(referenceImageUrl(artwork)), 'image/jpeg');
      const referenceVector = await embeddings.generate(image);
      const recognition = createRecognitionService({ config, embeddings: { generate: async () => referenceVector }, store, ollama, collection });
      const result = await recognition.recognise(image);
      if (result.candidates[0]?.artwork.id !== artwork.id) throw new AIError(502, 'LIVE_RECOGNITION_MISMATCH', 'A catalogue reference image did not retrieve its expected artwork. Rebuild the index and review source images.');
      const transformed = await sharp(image).resize({ width: 384 }).modulate({ brightness: 0.9 }).jpeg({ quality: 65 }).toBuffer();
      const transformedVector = await embeddings.generate(await normalizeImage(transformed, 'image/jpeg'));
      const transformedResult = await createRecognitionService({ config, embeddings: { generate: async () => transformedVector }, store, ollama, collection }).recognise(transformed);
      if (transformedResult.candidates[0]?.artwork.id !== artwork.id) throw new AIError(502, 'LIVE_TRANSFORMED_REFERENCE_MISMATCH', 'A resized reference image was not retrieved. Review the threshold using more camera samples.');
      const unrelated = await normalizeImage(await readFile(new URL(`../mobile/assets/${museumId}-exterior.jpg`, import.meta.url)), 'image/jpeg');
      const unrelatedVector = await embeddings.generate(unrelated);
      const unrelatedResult = await createRecognitionService({ config, embeddings: { generate: async () => unrelatedVector }, store, ollama, collection }).recognise(unrelated);
      const maxUnrelatedSimilarity = Math.max(...records.filter(r => r.museumId === museumId).map(r => cosineSimilarity(unrelatedVector, r.vector)));
      if (unrelatedResult.matched) throw new AIError(502, 'LIVE_UNRELATED_MATCH', 'An unrelated exterior photograph passed the matching threshold. Calibrate ARTWORK_MATCH_THRESHOLD before using recognition.');
      let explanation;
      if (!live.length) {
        console.log(`Smoke: ${museumId} real Qwen structured explanation (CPU inference may take several minutes).`);
        explanation = await ollama.generateArtworkExplanation(artwork, [], collection);
      }
      live.push({ museumId, embedding: 'passed', referenceRetrieval: { artworkId: artwork.id, similarity: result.candidates[0].similarity }, transformedReferenceSimilarity: transformedResult.candidates[0].similarity, unrelatedImageRejected: true, maxUnrelatedSimilarity, threshold: config.threshold, ...(explanation ? { explanation } : {}) });
    }
    console.log(JSON.stringify({ check: 'real_local_models', liveVerified: true, museums: live, note: 'Two reference/transformation/exterior image sets and one real structured explanation. Run scripts/validate-local-ai.mjs for broader retrieval and HTTP explanation/route/chat checks. Similarity is not accuracy or probability; validate camera conditions and more negative images before broad use. Visitor photographs are never stored.' }, null, 2));
  } else console.log('Health checks verify local model presence and index identity, not inference. Run npm.cmd run ai:doctor -- --smoke for real models.');
} catch (error) {
  console.error(JSON.stringify({ check: 'failed', liveVerified: false, code: error instanceof AIError ? error.code : 'CHECK_FAILED', error: error instanceof AIError ? error.message : 'AI check failed. Review local configuration and reference images.' }));
  process.exitCode = 1;
}
