import type { Artwork } from './domain.js';
export type StudioRole = 'visitor' | 'admin' | 'reviewer' | 'publisher';
export type StudioStage = 'review' | 'verify' | 'ready' | 'published' | 'returned';
export type StudioField = 'year' | 'description' | 'detail' | 'chineseIntroduction' | 'sourceUrl' | 'imageCredit';
export type StudioMuseum = 'met' | 'goma' | 'northbank';
export interface StudioUser { id: string; name: string; email: string; role: StudioRole; canAccessStudio: boolean }
export interface StudioArtwork extends Artwork { museumId: StudioMuseum; sourceUrl?: string; chineseIntroduction?: string; imageCredit?: string }
export interface StudioEvent { id: string; caseId: string | null; actorId: string; actor: string; action: string; note: string; date: string }
export interface StudioCase {
  id: string; artworkId: string; museumId: StudioMuseum; kind: 'ai' | 'artwork'; field: StudioField; current: string; proposed: string; reason: string;
  status: StudioStage; priority: 'normal' | 'high'; sourceUrl: string; evidence: { verified: boolean; note: string; by: string | null };
  createdBy: string; assignedTo: string | null; firstReviewer: string | null; finalReviewer: string | null;
  baseVersion: number; version: number; history: StudioEvent[]; createdAt: string; updatedAt: string;
}
export interface StudioState { user: StudioUser; artworks: StudioArtwork[]; cases: StudioCase[]; members: StudioUser[]; audit: StudioEvent[] }
