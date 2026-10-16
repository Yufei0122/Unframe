import { AIError, logFailure, requireInput } from './config.js';
import { cosineSimilarity } from './embeddings.js';
export const MAX_RECOGNITION_CANDIDATES = 3;
export function createRecognitionService({ config, embeddings, store, ollama, collection }) {
  return { async recognise(image) {
    if (!collection.length) throw new AIError(503, 'EMPTY_COLLECTION', 'No artworks are available in this collection.');
    const records = (await store.load()).filter(r => collection.some(a => a.id === r.artworkId));
    if (!records.length) throw new AIError(503, 'EMPTY_INDEX', 'No indexed artworks are available. Run npm run ai:index.');
    const query = await embeddings.generate(image);
    const scores = new Map();
    for (const record of records) {
      const similarity = cosineSimilarity(query, record.vector);
      scores.set(record.artworkId, Math.max(scores.get(record.artworkId) ?? -1, similarity));
    }
    // A similarity score is a retrieval signal, not a probability or a confirmed identity.
    const candidates = [...scores].filter(([, score]) => score >= config.threshold)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_RECOGNITION_CANDIDATES)
      .map(([id, similarity]) => ({ artwork: collection.find(a => a.id === id), similarity }));
    if (!candidates.length) return { matched: false, candidates: [], requiresConfirmation: true, message: `No close match among the ${collection.length} artworks in this museum's demo collection. Check the selected museum and try a clear photo with the whole artwork filling the frame.` };
    // Legacy fields describe the leading suggestion only. No explanation is generated while scanning.
    return { matched: true, candidates, requiresConfirmation: true, ...candidates[0], aiExplanation: null };
  }, async confirm(input) {
    requireInput(input && typeof input === 'object' && !Array.isArray(input), 'Choose an artwork from this museum.');
    const artwork = collection.find(a => a.id === input.artworkId);
    requireInput(Boolean(artwork), 'Choose a valid artwork from this museum.');
    const preferences = input.visitorPreferences !== undefined ? input.visitorPreferences : (input.preferences !== undefined ? input.preferences : []);
    requireInput(Array.isArray(preferences) && preferences.length <= 10 && preferences.every(s => typeof s === 'string' && s.length <= 80), 'Invalid visitor preferences.');
    const result = { artwork, aiExplanation: null, interpretationLabel: 'AI interpretation based on collection notes; not museum-approved.' };
    try { result.aiExplanation = await ollama.generateArtworkExplanation(artwork, preferences, collection); }
    catch (error) { logFailure('explanation', error); result.errorCode = error instanceof AIError ? error.code : 'EXPLANATION_UNAVAILABLE'; result.warning = (error instanceof AIError ? error.message : 'The local AI explanation is unavailable.') + ' Collection information is still available.'; }
    return result;
  } };
}
