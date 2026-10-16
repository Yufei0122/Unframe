import { createVisionService } from './vision.js';
import { createPublicCatalogues } from './public-catalogues.js';
import { createEmbeddingService, cosineSimilarity } from './embeddings.js';
import { normalizeImage } from './images.js';

export function createArtworkAnalysis(config, { vision = createVisionService(config), catalogues = createPublicCatalogues(), embeddings = createEmbeddingService(config) } = {}) {
  return { async analyse(image, signal) {
    const started = performance.now();
    const observation = await vision.analyse(image, signal);
    signal?.throwIfAborted();
    const result = { ...observation, identityStatus: 'uncertain', sources: [], search: { status: config.publicSearch ? 'not_needed' : 'disabled', providers: [] } };
    if (!config.publicSearch || !observation.hypotheses.length) return result;
    // Network searches and optional reference comparisons have a shared bounded budget.
    const remaining = Math.max(1, config.responseBudgetMs - Math.round(performance.now() - started) - 750);
    const deadline = AbortSignal.timeout(Math.min(3000, remaining));
    const searchSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const found = await catalogues.search(observation.hypotheses, searchSignal);
    result.search.providers = found.providers;
    result.search.status = found.providers.every(item => item.status === 'completed') ? 'completed'
      : found.providers.every(item => item.status === 'unavailable') ? 'unavailable' : 'partial';
    result.sources = found.records.map(record => ({ ...record, visualCheck: 'not_checked', similarity: null }));
    let query;
    try { query = await embeddings.generate(image, searchSignal); } catch { /* Description and linked search results remain useful without OpenCLIP. */ }
    if (query) {
      for (const source of result.sources.filter(item => item.imageUrl).slice(0, 3)) {
        if (searchSignal.aborted) break;
        try {
          const reference = await catalogues.image(source.imageUrl, searchSignal);
          const vector = await embeddings.generate(await normalizeImage(reference.bytes, reference.mime), searchSignal);
          source.similarity = cosineSimilarity(query, vector);
          source.visualCheck = source.similarity >= config.threshold ? 'similar' : 'different';
        } catch { source.visualCheck = 'unavailable'; }
      }
    }
    signal?.throwIfAborted();
    // A source record's existence is not evidence that it identifies this photograph.
    // Even visually similar references remain suggestions for human comparison.
    result.sources.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
    if (result.sources.some(source => source.visualCheck === 'similar')) result.identityStatus = 'possible_match';
    return result;
  } };
}
