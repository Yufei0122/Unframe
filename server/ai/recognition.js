import { AIError, logFailure } from './config.js';
import { cosineSimilarity } from './embeddings.js';
export function createRecognitionService({ config, embeddings, store, gemini, collection }) {
  return { async recognise(image, preferences = []) {
    if (!collection.length) throw new AIError(503, 'EMPTY_COLLECTION', 'No artworks are available in this collection.');
    const records = (await store.load()).filter(r => collection.some(a => a.id === r.artworkId));
    if (!records.length) throw new AIError(503, 'EMPTY_INDEX', 'No indexed artworks are available. Run npm run ai:index.');
    const query = await embeddings.generate(image);
    const best = records.map(r => ({ id: r.artworkId, similarity: cosineSimilarity(query, r.vector) })).sort((a, b) => b.similarity - a.similarity)[0];
    if (best.similarity < config.threshold) return { matched: false, message: 'No artwork could be identified with sufficient confidence.' };
    const artwork = collection.find(a => a.id === best.id);
    const result = { matched: true, similarity: best.similarity, artwork, aiExplanation: null, interpretationLabel: 'AI interpretation based on collection notes; not museum-approved.' };
    try { result.aiExplanation = await gemini.generateArtworkExplanation(artwork, preferences, collection); }
    catch (error) { logFailure('explanation', error); result.warning = 'AI explanation is temporarily unavailable. Collection information is still available.'; }
    return result;
  } };
}
