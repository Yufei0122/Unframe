import type { RecognitionResult } from '../../shared/ai-types';

/** Scene detection and identity selection are separate steps. */
export function shouldCaptureArtwork(result: RecognitionResult) {
  return result.artworkDetected === true || (result.candidates?.length ?? 0) > 0 || result.matched === true;
}
