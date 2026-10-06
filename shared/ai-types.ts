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
export interface RecognitionResult { matched: boolean; message?: string; similarity?: number; artwork?: Artwork & { medium: string; sourceUrl: string }; aiExplanation?: Explanation | null; warning?: string; interpretationLabel?: string }
export interface AIRoute {
  demo: boolean; mapNotice: string; estimatedMinutes: number; estimatedWalkingDistance: number;
  route: { order: number; artworkId: string; title: string; galleryId: string; estimatedVisitMinutes: number }[];
  navigation: { from: string; to: string; nodes: string[]; distance: number; estimatedSeconds: number }[];
  reasoningSummary: string; recommendationSource: 'gemini' | 'local'; warning?: string;
}
