import test from 'node:test';
import assert from 'node:assert/strict';
import { artworks, initialState } from '../src/model.ts';
import { reducer, restoreState } from '../src/state.ts';
import { activityDateGroup, profileActivity, saveMuseumRoute, saveSampleRoute, validSavedRoute } from '../src/profileData.ts';
import { museums } from '../src/museum.ts';
import type { AIRoute } from '../../shared/ai-types.ts';

const ids = artworks.map(a => a.id);
const visitDate = new Date(2026, 9, 11, 10, 30);
const itinerary: AIRoute = { demo: true, mapNotice: 'Demo map', estimatedMinutes: 20, estimatedWalkingDistance: 10, route: [{ order: 1, artworkId: 'water-lilies', title: 'Water Lilies', galleryId: '01', estimatedVisitMinutes: 4 }], navigation: [{ from: 'entrance', to: '01', nodes: [museums.met.graph.nodes[0].id], distance: 10, estimatedSeconds: 10 }], reasoningSummary: 'A saved route.', recommendationSource: 'ollama' };

test('legacy bookmarks keep unknown dates; new saves record dates and undoing a bookmark removes its metadata', () => {
  let state = restoreState(JSON.stringify({ ...initialState, saved: ['water-lilies'] }), initialState, ids);
  assert.equal(state.savedAt?.['water-lilies'], undefined);
  assert.equal(activityDateGroup(profileActivity(state)[0].date, visitDate), 'SAVED ON THIS DEVICE');
  state = reducer(state, { type: 'save', id: 'the-dancing-class', date: visitDate.toISOString() });
  assert.equal(profileActivity(state)[0].title, 'The Dancing Class');
  state = reducer(state, { type: 'save', id: 'the-dancing-class' });
  assert.equal(state.savedAt?.['the-dancing-class'], undefined);
  assert.deepEqual(state.saved, ['water-lilies']);
});

test('saved itineraries survive reload and retain exact routing, constraints and museum identity', () => {
  const museumRoute = saveMuseumRoute(itinerary, 'met', visitDate);
  const sampleRoute = saveSampleRoute({ artworkIds: ['riverlight', 'soft-form'], duration: 30, minutes: 15, interests: ['Nature'], stepFree: true }, visitDate);
  let state = reducer(initialState, { type: 'saveRoute', route: museumRoute });
  state = reducer(state, { type: 'saveRoute', route: sampleRoute });
  state = reducer(state, { type: 'saveRoute', route: museumRoute });
  assert.equal(state.savedRoutes?.length, 2);
  const restored = restoreState(JSON.stringify(state), initialState, ids);
  assert.deepEqual(restored.savedRoutes, state.savedRoutes);
  assert.equal(restored.tour, null);
  assert.equal(profileActivity(restored).filter(e => e.ai).length, 1);
  const removed = reducer(restored, { type: 'removeRoute', id: museumRoute.id });
  assert.equal(removed.savedRoutes?.length, 1);
  assert.equal(removed.savedRoutes?.[0].kind, 'sample');
});

test('malformed and cross-museum route snapshots are ignored without losing valid saved data', () => {
  const good = saveMuseumRoute(itinerary, 'met', visitDate);
  for (const bad of [{ ...good, museumId: 'goma' }, { ...good, museumId: '__proto__' }, { ...good, savedAt: 'invalid' }, { ...good, itinerary: { ...itinerary, warning: {} } }, { ...good, itinerary: { ...itinerary, navigation: [] } }]) assert.equal(validSavedRoute(bad, ids), false);
  const restored = restoreState(JSON.stringify({ ...initialState, saved: ['water-lilies'], savedAt: { 'water-lilies': 'invalid' }, savedRoutes: [good, { ...good, museumId: 'goma' }] }), initialState, ids);
  assert.equal(restored.savedRoutes?.length, 1);
  assert.deepEqual(restored.saved, ['water-lilies']);
  assert.deepEqual(restored.savedAt, {});
});

test('activity buckets respect actual local dates and do not fabricate dates for older items', () => {
  assert.equal(activityDateGroup(visitDate.toISOString(), visitDate), 'TODAY');
  assert.equal(activityDateGroup(new Date(2026, 9, 2).toISOString(), visitDate), 'THIS MONTH');
  assert.equal(activityDateGroup(new Date(2025, 9, 11).toISOString(), visitDate), 'EARLIER');
  assert.equal(activityDateGroup(undefined, visitDate), 'SAVED ON THIS DEVICE');
});
