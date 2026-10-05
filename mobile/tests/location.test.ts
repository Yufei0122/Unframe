import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, matchMuseum, museum, museums, nearestMuseum, allMuseumArtworks, museumForArtwork } from '../src/museum';

test('a precise location at The Met matches, but another city does not', () => {
  assert.equal(matchMuseum({ ...museum, accuracy: 20 }).nearby, true);
  const brisbane = matchMuseum({ latitude: -27.4698, longitude: 153.0251, accuracy: 20 });
  assert.equal(brisbane.nearby, false);
  assert.ok(brisbane.distance > 15_000_000);
});

test('imprecise location must not claim the visitor is near the museum', () => {
  assert.equal(matchMuseum({ ...museum, accuracy: 2000 }).nearby, false);
  assert.equal(matchMuseum({ ...museum, accuracy: null }).nearby, false);
});

test('distance calculation handles matching and opposite coordinates', () => {
  assert.equal(distanceMeters(museum, museum), 0);
  assert.ok(Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }) - 20_015_087) < 1);
});

test('GOMA and Met are matched independently; low accuracy never selects a museum', () => {
  const coords = { ...museums.goma, accuracy: 20 };
  assert.equal(nearestMuseum(coords), 'goma');
  assert.equal(matchMuseum(coords, 'goma').nearby, true);
  assert.equal(matchMuseum(coords, 'met').nearby, false);
  assert.equal(nearestMuseum({ ...museum, accuracy: 20 }), 'met');
  assert.equal(nearestMuseum({ ...coords, accuracy: 2000 }), undefined);
  assert.equal(nearestMuseum({ ...coords, accuracy: null }), undefined);
  assert.equal(nearestMuseum({ latitude: -27.4698, longitude: 153.0251, accuracy: 20 }), undefined);
});

test('museum artwork IDs remain unique and resolve to their own museum for saved details', () => {
  assert.equal(new Set(allMuseumArtworks.map(a => a.id)).size, allMuseumArtworks.length);
  assert.equal(museumForArtwork('goma-heritage')?.id, 'goma');
  assert.equal(museumForArtwork('water-lilies')?.id, 'met');
});
