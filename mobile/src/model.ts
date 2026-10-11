import collection from '../../shared/collection.json';
import type { Artwork, RoutePlan } from '../../shared/domain.js';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AIRoute } from '../../shared/ai-types';
import { allMuseumArtworks, type MuseumId } from './museum';

export const artworks: Artwork[] = [...allMuseumArtworks, ...collection];
export const sampleArtworks: Artwork[] = collection;
export const interests = ['Nature', 'Colour', 'Sculpture', 'Form', 'Reflection'];
export const artwork = (id: string) => artworks.find(item => item.id === id);
export interface Preferences { name: string; interests: string[]; duration: number; stepFree: boolean; saveHistory: boolean; largeText: boolean }
export interface Visit { id: string; date: string; artworkIds: string[]; summary: string }
export interface Feedback { id: string; date: string; artworkId?: string; message: string; type: string }
export interface ActiveTour extends RoutePlan { completed: string[]; skipped: string[] }
export type SavedRoute = { id: string; title: string; savedAt: string } & ({ kind: 'museum'; museumId: MuseumId; itinerary: AIRoute } | { kind: 'sample'; plan: RoutePlan });
export interface MobileState { version: 1; preferences: Preferences; avatarUri?: string; saved: string[]; savedAt?: Record<string, string>; savedRoutes?: SavedRoute[]; visits: Visit[]; feedback: Feedback[]; tour: ActiveTour | null }
export const initialState: MobileState = { version: 1, preferences: { name: 'Alex', interests: ['Nature', 'Colour'], duration: 30, stepFree: false, saveHistory: true, largeText: false }, saved: [], visits: [], feedback: [], tour: null };
export type RootStackParams = {
  MuseumSelect: undefined;
  Welcome: undefined;
  Tour: undefined;
  Home: NavigatorScreenParams<TabParams> | undefined;
  Artwork: { id: string };
  Planner: undefined;
  AIItinerary: { itinerary: AIRoute; museumId?: MuseumId };
  Lookup: undefined;
  Feedback: { artworkId?: string } | undefined;
  About: undefined;
  AppSettings: undefined;
};
export type ProfileStackParams = { ProfileHome: undefined; SavedArtworks: undefined; SavedRoutes: undefined; RecentActivity: { filter?: 'All' | 'Visits' | 'Saves' | 'Routes' | 'AI' } | undefined; SavedRouteDetails: { id: string } };
export type TabParams = { Discover: undefined; Plan: undefined; Scan: undefined; Guide: { artworkId?: string } | undefined; Saved: { tab?: 'saved' | 'visits' } | undefined; You: NavigatorScreenParams<ProfileStackParams> | undefined };
