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
export interface ArtworkAnalysis {
  identityStatus: 'uncertain' | 'possible_match';
  artworkPresence: 'likely' | 'uncertain' | 'unlikely';
  description: string;
  visualFeatures: string[];
  visibleText: string[];
  hypotheses: { title: string; artist: string | null; basis: string }[];
  sources: { id: string; provider: string; title: string; artist: string | null; date: string | null; sourceUrl: string; imageUrl: string | null; visualCheck: 'similar' | 'different' | 'unavailable' | 'not_checked'; similarity: number | null }[];
  search: { status: 'not_needed' | 'disabled' | 'completed' | 'partial' | 'unavailable'; providers: { name: string; status: string; results: number }[] };
}
export interface ConfirmationResult { artwork: RecognisedArtwork; aiExplanation: Explanation | null; warning?: string; errorCode?: string; interpretationLabel: string }
export interface AIStatus {
  museumId: string;
  ready: boolean;
  planningReady: boolean;
  analysisReady: boolean;
  analysisMessage: string;
  liveVerified: false;
  configuration: { valid: boolean; provider: 'local'; embeddingModel: string; embeddingPretrained: string; dimension: number; ollamaModel: string; visionModel: string; analysisVersion: number; planningVersion: number };
  services: { openclip: { available: boolean; code?: string }; ollama: { available: boolean; modelAvailable: boolean; code?: string }; vision?: { available: boolean; model: string; code?: string } };
  index: { available: boolean; indexedArtworks: number; totalArtworks: number; code?: string };
  message: string;
}
export interface AIRoute {
  demo: boolean; mapNotice: string; estimatedMinutes: number; estimatedWalkingDistance: number;
  route: { order: number; artworkId: string; title: string; galleryId: string; estimatedVisitMinutes: number }[];
  navigation: { from: string; to: string; nodes: string[]; distance: number; estimatedSeconds: number }[];
  reasoningSummary: string; recommendationSource: 'ollama' | 'local'; warning?: string; errorCode?: string;
}
