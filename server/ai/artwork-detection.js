import detector from './artwork-detector.json' with { type: 'json' };
import { cosineSimilarity, normalizedVector } from './embeddings.js';

export const RECOGNITION_VERSION = 2;

// Reuses the image embedding already computed for recognition. Text prototypes
// are exported once, offline, from this exact CLIP space. No second model call.
// This scene cue is ONLY permission to freeze a frame, never an identity claim.
export function detectArtwork(vector, config) {
  if (config.embeddingModel !== detector.model || config.embeddingPretrained !== detector.pretrained
    || config.dimension !== detector.dimension || !normalizedVector(vector, detector.dimension)) return false;
  const art = cosineSimilarity(vector, detector.vectors.artwork);
  const background = cosineSimilarity(vector, detector.vectors.background);
  return art >= detector.minimumSimilarity && art - background >= detector.minimumMargin;
}
