import { readFile } from 'node:fs/promises';
import { readAIConfig, logFailure } from '../server/ai/config.js';
import { createEmbeddingService, createEmbeddingStore, referenceArtworks, referenceImageUrl, sha256 } from '../server/ai/embeddings.js';
import { normalizeImage } from '../server/ai/images.js';

try {
  const config = readAIConfig();
  const service = createEmbeddingService(config);
  const records = [];
  for (const { museumId, artwork } of referenceArtworks()) {
    const source = await readFile(referenceImageUrl(artwork));
    const image = await normalizeImage(source);
    records.push({ museumId, artworkId: artwork.id, sourceHash: sha256(source), imageHash: sha256(image), vector: await service.generate(image) });
    console.log(`Indexed ${museumId}/${artwork.id}`);
  }
  await createEmbeddingStore(config).save(records);
  console.log(`Saved ${records.length} artwork embeddings. No visitor photographs were stored.`);
} catch (error) { logFailure('index', error); console.error('Indexing failed. Check the local OpenCLIP service and bundled source images. The previous index was not replaced.'); process.exitCode = 1; }
