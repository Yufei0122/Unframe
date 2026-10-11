import { ensureClip, ensureOllama, ensureNode, installShutdown, keepRunning, requireOllamaModel, root, run, stopOwned } from './ai-runtime.mjs';
import { readAIConfig } from '../server/ai/config.js';
import { createEmbeddingStore } from '../server/ai/embeddings.js';
import path from 'node:path';

installShutdown();
try {
  await ensureOllama();
  await requireOllamaModel();
  await ensureClip();
  const store = createEmbeddingStore(readAIConfig());
  try { await store.load({ verifySources: true }); console.log('Artwork index identity, catalogue and source images are current.'); }
  catch (error) {
    console.log(`Rebuilding artwork index (${error.code || 'unavailable'}). The old file stays intact until the complete replacement is ready.`);
    await run(process.execPath, [path.join(root, 'scripts', 'index-artworks.mjs')]);
    await store.load({ verifySources: true });
  }
  await ensureNode();
  await keepRunning();
} catch (error) { console.error(`Local AI startup failed: ${error.message}`); process.exitCode = 1; }
finally { await stopOwned(); }
