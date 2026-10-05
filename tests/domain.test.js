import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, guideReply } from '../server/domain.js';
import { artworks } from '../server/seed.js';

test('routes respect the time budget, include transition time and visit rooms in order', () => {
  for (const duration of [10, 15, 30, 45, 60, 120]) {
    const route = planRoute(artworks, { duration, interests: ['Nature'] });
    assert.ok(route.artworkIds.length > 0);
    assert.ok(route.minutes <= duration);
    const selected = route.artworkIds.map(id => artworks.find(a => a.id === id));
    assert.equal(route.minutes, selected.reduce((sum, a) => sum + a.minutes, 0) + (selected.length - 1) * 2);
    assert.deepEqual(selected.map(a => a.room), selected.map(a => a.room).sort());
  }
});
test('step-free routes never include inaccessible rooms', () => {
  const route = planRoute(artworks, { duration: 120, stepFree: true, interests: ['Reflection'] });
  assert.equal(route.artworkIds.length, 5);
  assert.ok(!route.artworkIds.includes('afterimage'));
});
test('short visits prioritise the chosen interest', () => {
  const route = planRoute(artworks, { duration: 10, interests: ['Sculpture'] });
  assert.deepEqual(route.artworkIds, ['soft-form']);
});
test('artwork answers contain source attribution and use current collection content', () => {
  const collection = structuredClone(artworks);
  collection[0].description = 'A curator-reviewed replacement note.';
  const reply = guideReply('Tell me about Riverlight', collection);
  assert.ok(reply.text.includes(collection[0].description));
  assert.equal(reply.sources[0].artworkId, 'riverlight');
  assert.equal(reply.mode, 'catalogue');
});
test('unsupported questions acknowledge the limits of the collection', () => {
  const reply = guideReply('What was the artist’s childhood address?', artworks);
  assert.match(reply.text, /don’t have approved information/);
  assert.deepEqual(reply.sources, []);
});
