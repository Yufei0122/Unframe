import type { AIRoute } from '../../shared/ai-types';
import type { RoutePlan } from '../../shared/domain.js';
import { artwork, type MobileState, type SavedRoute } from './model';
import { museumForArtwork, museums, type MuseumId } from './museum';

export const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
function routeKey(value: unknown) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `route-${(hash >>> 0).toString(36)}`;
}
export function saveMuseumRoute(itinerary: AIRoute, museumId: MuseumId, now = new Date()): SavedRoute {
  return { id: routeKey({ museumId, itinerary }), title: `${museums[museumId].shortName} · Your art trail`, savedAt: now.toISOString(), kind: 'museum', museumId, itinerary };
}
export function saveSampleRoute(value: RoutePlan, now = new Date()): SavedRoute {
  const plan = { artworkIds: value.artworkIds, minutes: value.minutes, duration: value.duration, interests: value.interests, stepFree: value.stepFree };
  return { id: routeKey(plan), title: 'Northbank Gallery Trail', savedAt: now.toISOString(), kind: 'sample', plan };
}
export function savedRouteInfo(route: SavedRoute) {
  return route.kind === 'museum'
    ? { ids: route.itinerary.route.map(stop => stop.artworkId), minutes: route.itinerary.estimatedMinutes, museum: museums[route.museumId].shortName, place: route.museumId === 'met' ? 'New York, USA' : 'Brisbane, Australia', description: route.itinerary.reasoningSummary, museumId: route.museumId }
    : { ids: route.plan.artworkIds, minutes: route.plan.minutes, museum: 'Northbank Gallery', place: 'Sample gallery', description: `A personal trail through ${route.plan.interests.join(', ').toLowerCase() || 'the collection'}${route.plan.stepFree ? ', with step-free access' : ''}.`, museumId: undefined };
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function validSavedRoute(value: unknown, artworkIds: string[]): value is SavedRoute {
  if (!value || typeof value !== 'object') return false;
  const r = value as SavedRoute;
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || !r.title.trim() || !validDate(r.savedAt)) return false;
  if (r.kind === 'sample') {
    const p = r.plan;
    return !!p && Array.isArray(p.artworkIds) && p.artworkIds.length > 0 && p.artworkIds.every(id => artworkIds.includes(id) && !Object.values(museums).some(m => m.artworks.some(a => a.id === id)))
      && finite(p.minutes) && finite(p.duration) && p.minutes <= p.duration && typeof p.stepFree === 'boolean' && Array.isArray(p.interests) && p.interests.every(s => typeof s === 'string');
  }
  if (r.kind !== 'museum' || !Object.hasOwn(museums, r.museumId)) return false;
  const a = r.itinerary, museum = museums[r.museumId];
  if (!a || !Array.isArray(a.route) || !a.route.length || !Array.isArray(a.navigation) || a.route.length !== a.navigation.length) return false;
  return typeof a.demo === 'boolean' && typeof a.mapNotice === 'string' && typeof a.reasoningSummary === 'string'
    && (a.warning === undefined || typeof a.warning === 'string') && new Set(a.route.map(stop => stop?.artworkId)).size === a.route.length
    && ['local', 'ollama'].includes(a.recommendationSource) && finite(a.estimatedMinutes) && finite(a.estimatedWalkingDistance)
    && a.route.every(stop => !!stop && museum.artworks.some(art => art.id === stop.artworkId) && finite(stop.order) && typeof stop.title === 'string' && typeof stop.galleryId === 'string' && finite(stop.estimatedVisitMinutes))
    && a.navigation.every(segment => !!segment && typeof segment.from === 'string' && typeof segment.to === 'string' && finite(segment.distance) && finite(segment.estimatedSeconds) && Array.isArray(segment.nodes) && segment.nodes.every(id => museum.graph.nodes.some(node => node.id === id)));
}

export function activityDateGroup(date: string | undefined, now = new Date()) {
  if (!date) return 'SAVED ON THIS DEVICE';
  const value = new Date(date);
  if (value.toDateString() === now.toDateString()) return 'TODAY';
  if (value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth()) return 'THIS MONTH';
  return 'EARLIER';
}
export function activityDateLabel(date: string | undefined, now = new Date()) {
  if (!date) return 'Date not recorded';
  const value = new Date(date);
  return activityDateGroup(date, now) === 'TODAY' ? value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface ProfileActivity { id: string; kind: 'Visits' | 'Saves' | 'Routes'; date?: string; label: string; title: string; subtitle: string; body: string; coverId?: string; museumId?: MuseumId; artworkId?: string; routeId?: string; ai?: boolean }
export function profileActivity(state: MobileState): ProfileActivity[] {
  const entries: ProfileActivity[] = state.saved.flatMap(id => {
    const a = artwork(id); if (!a) return [];
    return [{ id: `save-${id}`, kind: 'Saves' as const, date: state.savedAt?.[id], label: 'Saved an artwork', title: a.title, subtitle: a.artist, body: museumForArtwork(id)?.name || 'Northbank Gallery · Sample collection', coverId: id, artworkId: id }];
  });
  for (const visit of state.visits) {
    const a = visit.artworkIds.map(artwork).find(Boolean), museum = a && museumForArtwork(a.id);
    entries.push({ id: `visit-${visit.id}`, kind: 'Visits', date: visit.date, label: 'Completed a visit', title: museum ? `A day at ${museum.shortName}` : 'A day at Northbank', subtitle: museum?.name || 'Northbank Gallery · Sample visit', body: visit.summary, coverId: a?.id });
  }
  for (const route of state.savedRoutes || []) {
    const info = savedRouteInfo(route), ai = route.kind === 'museum' && route.itinerary.recommendationSource === 'ollama';
    entries.push({ id: `route-${route.id}`, kind: 'Routes', date: route.savedAt, label: ai ? 'Saved an AI route' : 'Saved a route', title: route.title, subtitle: info.place, body: `${info.ids.length} artworks · ${Math.ceil(info.minutes)} minutes · ${info.museum}`, museumId: info.museumId, coverId: info.museumId ? undefined : info.ids[0], routeId: route.id, ai });
  }
  return entries.sort((a, b) => (b.date ? Date.parse(b.date) : -Infinity) - (a.date ? Date.parse(a.date) : -Infinity));
}
