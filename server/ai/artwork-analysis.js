import { createVisionService } from './vision.js';
import { createPublicCatalogues } from './public-catalogues.js';
import { createEmbeddingService, cosineSimilarity, referenceArtworks } from './embeddings.js';
import { normalizeImage } from './images.js';
import { AIError } from './config.js';

export function createArtworkAnalysis(config, { vision = createVisionService(config), catalogues = createPublicCatalogues(), embeddings = createEmbeddingService(config), store } = {}) {
  async function analyse(image, signal) {
    const started = performance.now();
    let query, reference;
    if (store) {
      try {
        const records = await store.load();
        query = await embeddings.generate(image, signal);
        const ranked = records.map(record => ({ ...record, similarity: cosineSimilarity(query, record.vector) })).sort((a, b) => b.similarity - a.similarity);
        const best = ranked[0];
        if (best?.similarity >= config.threshold && best.similarity - (ranked[1]?.similarity ?? -1) >= .05) {
          const entry = referenceArtworks().find(item => item.museumId === best.museumId && item.artwork.id === best.artworkId);
          if (entry) reference = { ...entry, similarity: best.similarity };
        }
      } catch { signal?.throwIfAborted(); /* Missing CLIP/index must not prevent general visual observations. */ }
    }
    const observation = await vision.analyse(image, signal, reference?.artwork);
    signal?.throwIfAborted();
    const result = { ...observation, identityStatus: 'uncertain', sources: [], search: { status: config.publicSearch ? 'not_needed' : 'disabled', providers: [] } };
    if (reference && observation.artworkPresence === 'likely') {
      const { artwork, similarity } = reference;
      result.hypotheses = [{ title: artwork.title, artist: artwork.artist, basis: 'The photograph resembles the museum collection reference. Compare before confirming.' }];
      result.sources = [{ id: `collection:${artwork.id}`, provider: artwork.source, title: artwork.title, artist: artwork.artist, date: artwork.year, sourceUrl: artwork.sourceUrl, imageUrl: null, visualCheck: 'similar', similarity }];
      result.identityStatus = 'possible_match';
      return result;
    }
    if (!config.publicSearch || !observation.hypotheses.length) return result;
    // Network searches and optional reference comparisons have a shared bounded budget.
    const remaining = Math.max(1, config.analysisBudgetMs - Math.round(performance.now() - started) - 750);
    const deadline = AbortSignal.timeout(Math.min(3000, remaining));
    const searchSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const found = await catalogues.search(observation.hypotheses, searchSignal);
    result.search.providers = found.providers;
    result.search.status = found.providers.every(item => item.status === 'completed') ? 'completed'
      : found.providers.every(item => item.status === 'unavailable') ? 'unavailable' : 'partial';
    result.sources = found.records.map(record => ({ ...record, visualCheck: 'not_checked', similarity: null }));
    try { query ||= await embeddings.generate(image, searchSignal); } catch { /* Description and linked search results remain useful without OpenCLIP. */ }
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
  }
  return { async analyse(image, signal) {
    const deadline = AbortSignal.timeout(config.analysisBudgetMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try { return await analyse(image, combined); }
    catch (error) {
      if (deadline.aborted && !signal?.aborted) throw new AIError(504, 'VISION_TIMEOUT', 'This image took too long to analyse. Try again, or select a smaller Instruct vision model on the AI server.');
      throw error;
    }
  } };
}
