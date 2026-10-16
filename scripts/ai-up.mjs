import { applyInteractivePerformanceProfile, ensureClip, ensureOllama, ensureNode, startMobileWeb, installShutdown, keepRunning, requireOllamaModel, pullOllamaModel, planningModel, root, run, stopOwned, warmOllamaModel } from './ai-runtime.mjs';
import { readAIConfig } from '../server/ai/config.js';
import { createEmbeddingStore } from '../server/ai/embeddings.js';
import path from 'node:path';
import { inspectVisionModel } from '../server/ai/vision.js';

installShutdown();
try {
  if (process.argv.slice(2).some(arg => !['--web', '--verify', '--features'].includes(arg))) throw new Error('Usage: npm.cmd run ai:up -- [--web] [--verify] [--features]');
  const migrated = applyInteractivePerformanceProfile();
  if (migrated.length) console.log(`Using the 15-second interactive profile for this run (${migrated.join(', ')}). Update .env from .env.example to make it explicit.`);
  await ensureOllama();
  await requireOllamaModel();
  await pullOllamaModel(planningModel);
  await warmOllamaModel(planningModel);
  try { await inspectVisionModel(readAIConfig()); console.log('General artwork visual analysis is available.'); }
  catch (error) { console.warn(`General visual analysis is unavailable: ${error.message} Existing catalogue scanning can still start.`); }
  await ensureClip();
  const store = createEmbeddingStore(readAIConfig());
  try { await store.load({ verifySources: true }); console.log('Artwork index identity, catalogue and source images are current.'); }
  catch (error) {
    console.log(`Rebuilding artwork index (${error.code || 'unavailable'}). The old file stays intact until the complete replacement is ready.`);
    await run(process.execPath, [path.join(root, 'scripts', 'index-artworks.mjs')]);
    await store.load({ verifySources: true });
  }
  await ensureNode();
  if (process.argv.includes('--features')) {
    console.log('Verifying the independent feature budgets: recognition <5s; AI route requests <15s.');
    await run(process.execPath, [path.join(root, 'scripts', 'validate-local-ai.mjs'), '--recognition-only']);
    await run(process.execPath, [path.join(root, 'scripts', 'validate-qwen-routes.mjs')]);
    console.log('Both feature performance gates passed with real local models.');
  }
  if (process.argv.includes('--verify')) {
    console.log('Running real-model acceptance before opening Expo. Reports are saved under .local-ai.');
    const failures = [];
    for (const [script, args] of [['validate-ai-routes.mjs', []], ['validate-local-ai.mjs', ['--recognition-only']], ['validate-artwork-vision.mjs', []]]) {
      try { await run(process.execPath, [path.join(root, 'scripts', script), ...args]); }
      catch (error) { failures.push(`${script}: ${error.message}`); }
    }
    if (failures.length) throw new Error(`Real-model acceptance did not pass. Review .local-ai/recognition-validation.json and .local-ai/acceptance/{routes,vision}-*.json. ${failures.join(' ')}`);
    console.log('Controlled real-model acceptance passed. Independent artwork/camera accuracy has not been established.');
  }
  if (process.argv.includes('--web')) await startMobileWeb();
  if (!process.argv.includes('--features') || process.argv.includes('--web')) await keepRunning();
} catch (error) { console.error(`Local AI startup failed: ${error.message}`); process.exitCode = 1; }
finally { await stopOwned(); }
