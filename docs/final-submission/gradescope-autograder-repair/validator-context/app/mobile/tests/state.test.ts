import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, artworks } from '../src/model.ts';
import { makeReflection, reducer, restoreState } from '../src/state.ts';
import { planRoute } from '../../shared/domain.js';
import { avatarCrop, MAX_AVATAR_LENGTH } from '../src/avatar.ts';

test('avatar persists independently of preferences and legacy collections still restore', () => {
  const ids = artworks.map(a => a.id), uri = 'data:image/jpeg;base64,/9j/2Q==';
  const legacy = restoreState(JSON.stringify(initialState), initialState, ids);
  assert.equal(legacy.avatarUri, undefined);
  let state = reducer(legacy, { type: 'avatar', uri });
  state = reducer(state, { type: 'preferences', preferences: { ...state.preferences, name: 'Maya' } });
  const restored = restoreState(JSON.stringify(state), initialState, ids);
  assert.equal(restored.avatarUri, uri);
  assert.equal(restored.preferences.name, 'Maya');
  assert.deepEqual(restored.saved, legacy.saved);
  for (const invalid of ['https://example.com/avatar.jpg', 'blob:expired', 'data:image/svg+xml,<svg/>', `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_LENGTH)}`]) {
    assert.equal(reducer(state, { type: 'avatar', uri: invalid }), state);
    const recovered = restoreState(JSON.stringify({ ...state, avatarUri: invalid }), initialState, ids);
    assert.equal(recovered.avatarUri, undefined);
    assert.equal(recovered.preferences.name, 'Maya');
  }
});

test('avatar crops stay square and inside portrait and landscape images at all edges', () => {
  for (const [width, height] of [[1600, 900], [600, 1600], [512, 512]]) {
    for (const zoom of [1, 1.25, 3]) for (const x of [-1, 0, .5, 1, 2]) for (const y of [-1, .5, 2]) {
      const crop = avatarCrop(width, height, zoom, x, y);
      assert.equal(crop.width, crop.height);
      assert.ok(crop.originX >= 0 && crop.originY >= 0);
      assert.ok(crop.originX + crop.width <= width && crop.originY + crop.height <= height);
    }
  }
  assert.deepEqual(avatarCrop(1600, 900, 1, .5, .5), { originX: 350, originY: 0, width: 900, height: 900 });
});

test('bookmarks and active tour progress survive a persisted round trip', () => {
  let state = reducer(initialState, { type: 'save', id: 'riverlight' });
  state = reducer(state, { type: 'plan', route: planRoute(artworks, { duration: 30, interests: ['Nature'], stepFree: true }) });
  state = reducer(state, { type: 'stop', id: 'riverlight', status: 'completed' });
  const restored = restoreState(JSON.stringify(state), initialState, artworks.map(a => a.id));
  assert.deepEqual(restored.saved, ['riverlight']);
  assert.deepEqual(restored.tour?.completed, ['riverlight']);
  assert.ok(!restored.tour?.artworkIds.includes('afterimage'));
});
test('a stop cannot be both explored and skipped, and unknown stops are ignored', () => {
  let state = reducer(initialState, { type: 'plan', route: planRoute(artworks, { duration: 60 }) });
  state = reducer(state, { type: 'stop', id: 'riverlight', status: 'completed' });
  state = reducer(state, { type: 'stop', id: 'riverlight', status: 'skipped' });
  assert.deepEqual(state.tour?.completed, []);
  assert.deepEqual(state.tour?.skipped, ['riverlight']);
  assert.equal(reducer(state, { type: 'stop', id: 'unknown', status: 'completed' }), state);
});
test('finished visits respect history consent and clearing history preserves bookmarks', () => {
  const visit = makeReflection(['riverlight'], artworks, new Date('2026-09-28T00:00:00Z'));
  let state = reducer(initialState, { type: 'preferences', preferences: { ...initialState.preferences, saveHistory: false } });
  state = reducer(state, { type: 'finish', visit });
  assert.deepEqual(state.visits, []);
  state = reducer(state, { type: 'preferences', preferences: { ...state.preferences, saveHistory: true } });
  state = reducer(state, { type: 'finish', visit });
  state = reducer(state, { type: 'save', id: 'riverlight' });
  assert.equal(state.visits.length, 1);
  state = reducer(state, { type: 'clearHistory' });
  assert.equal(state.visits.length, 0);
  assert.deepEqual(state.saved, ['riverlight']);
});
test('corrupt or unsupported data is rejected instead of silently overwritten', () => {
  const ids = artworks.map(a => a.id);
  assert.throws(() => restoreState('{', initialState, ids));
  assert.throws(() => restoreState(JSON.stringify({ ...initialState, version: 2 }), initialState, ids), /unsupported format/);
  assert.throws(() => restoreState(JSON.stringify({ ...initialState, preferences: null }), initialState, ids), /preferences/);
});
test('stale artwork IDs and malformed visits are removed on restore', () => {
  const restored = restoreState(JSON.stringify({ ...initialState, saved: ['riverlight', 'removed'], visits: [{ id: 'bad', artworkIds: ['removed'], date: 'invalid', summary: '' }] }), initialState, artworks.map(a => a.id));
  assert.deepEqual(restored.saved, ['riverlight']);
  assert.deepEqual(restored.visits, []);
});
