import type { Artwork } from './domain.js';
export interface VisitPreferences {
  interests: string[];
  availableMinutes: number;
  currentLocation: string;
  walkingPreference: 'balanced' | 'less_walking';
  accessibilityRequirements: ('step_free' | 'wheelchair')[];
  mustSeeArtworkIds: string[];
}
export interface PlanningMessage { role: 'user' | 'assistant'; content: string }
export interface PlanningReply { reply: string; preferences: VisitPreferences }
export interface Explanation { summary: string; historicalContext: string; interestingFacts: string[]; whyItMatters: string; suggestedNextArtwork: string | null }
export type RecognisedArtwork = Artwork & { medium: string; sourceUrl: string };
export interface RecognitionCandidate { artwork: RecognisedArtwork; similarity: number }
export interface RecognitionResult {
  matched: boolean;
  candidates: RecognitionCandidate[];
  requiresConfirmation: true;
  message?: string;
  /** The leading suggestion, retained for older clients; it is not a confirmed identity. */
  similarity?: number;
  artwork?: RecognisedArtwork;
  aiExplanation?: null;
}
export interface ConfirmationResult { artwork: RecognisedArtwork; aiExplanation: Explanation | null; warning?: string; errorCode?: string; interpretationLabel: string }
export interface AIStatus {
  museumId: string;
  ready: boolean;
  liveVerified: false;
  configuration: { valid: boolean; provider: 'local'; embeddingModel: string; embeddingPretrained: string; dimension: number; ollamaModel: string };
  services: { openclip: { available: boolean; code?: string }; ollama: { available: boolean; modelAvailable: boolean; code?: string } };
  index: { available: boolean; indexedArtworks: number; totalArtworks: number; code?: string };
  message: string;
}
export interface AIRoute {
  demo: boolean; mapNotice: string; estimatedMinutes: number; estimatedWalkingDistance: number;
  route: { order: number; artworkId: string; title: string; galleryId: string; estimatedVisitMinutes: number }[];
  navigation: { from: string; to: string; nodes: string[]; distance: number; estimatedSeconds: number }[];
  reasoningSummary: string; recommendationSource: 'ollama' | 'local'; warning?: string; errorCode?: string;
}
