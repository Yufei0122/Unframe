import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { catalogues } from '../server/ai/catalogues.js';
import { readAIConfig, logFailure } from '../server/ai/config.js';
import { createGoogleClient } from '../server/ai/google.js';
import { createEmbeddingService, createEmbeddingStore } from '../server/ai/embeddings.js';
import { normalizeImage } from '../server/ai/images.js';

try {
  const config = readAIConfig();
  const service = createEmbeddingService(config, createGoogleClient(config));
  const records = [];
  for (const art of [...catalogues.values()].flatMap(c => c.collection)) {
    const image = await normalizeImage(await readFile(new URL(`../mobile/assets/${art.image}`, import.meta.url)), 'image/jpeg');
    records.push({ artworkId: art.id, imageHash: createHash('sha256').update(image).digest('hex'), vector: await service.generate(image) });
    console.log(`Indexed ${art.id}`);
  }
  await createEmbeddingStore(config).save(records);
  console.log(`Saved ${records.length} artwork embeddings. No visitor photographs were stored.`);
} catch (error) { logFailure('index', error); console.error('Indexing failed. Check .env, ADC, model access and source images. The previous index was not replaced.'); process.exitCode = 1; }
