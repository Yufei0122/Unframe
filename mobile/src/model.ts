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
export interface MobileState { version: 1; preferences: Preferences; saved: string[]; visits: Visit[]; feedback: Feedback[]; tour: ActiveTour | null }
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
};
export type TabParams = { Discover: undefined; Plan: undefined; Scan: undefined; Guide: { artworkId?: string } | undefined; Saved: undefined; You: undefined };
