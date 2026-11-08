import assert from 'node:assert/strict';

// A usable fallback itinerary is not evidence of successful model inference.
export function assertModelRoute(route, preferences, collection, graph) {
  assert.equal(route.recommendationSource, 'ollama', `Qwen failed; fallback is not a model success: ${route.errorCode || route.warning || 'unknown source'}`);
  assert.ok(!route.warning && !route.errorCode, 'Route contains a provider warning.');
  assert.ok(route.route?.length > 0, 'Route has no stops.');
  const ids = route.route.map(stop => stop.artworkId);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate stops.');
  assert.ok(preferences.mustSeeArtworkIds.every(id => ids.includes(id)), 'Missing must-see.');
  assert.equal(route.navigation.length, ids.length);
  const stepFree = preferences.accessibilityRequirements.length > 0;
  let previous = preferences.currentLocation, seconds = 0, distance = 0;
  for (const [i, leg] of route.navigation.entries()) {
    const artwork = collection.find(item => item.id === ids[i]);
    assert.ok(artwork && (!stepFree || artwork.accessible), 'Foreign or inaccessible artwork.');
    assert.equal(route.route[i].order, i + 1);
    assert.equal(route.route[i].estimatedVisitMinutes, artwork.minutes);
    assert.equal(leg.from, previous);
    assert.equal(leg.to, ids[i]);
    assert.equal(leg.nodes[0], previous);
    assert.equal(leg.nodes.at(-1), ids[i]);
    let legSeconds = 0, legDistance = 0;
    for (let j = 1; j < leg.nodes.length; j++) {
      const from = leg.nodes[j - 1], to = leg.nodes[j];
      const edge = graph.edges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from));
      assert.ok(edge && (!stepFree || edge.accessible), 'Invalid or inaccessible navigation edge.');
      legSeconds += edge.estimatedSeconds;
      legDistance += edge.distance;
    }
    assert.equal(leg.estimatedSeconds, legSeconds);
    assert.equal(leg.distance, legDistance);
    seconds += legSeconds + artwork.minutes * 60;
    distance += legDistance;
    previous = ids[i];
  }
  assert.ok(seconds <= preferences.availableMinutes * 60, 'Walking plus visit time exceeds budget.');
  assert.equal(route.estimatedMinutes, Math.ceil(seconds / 60));
  assert.equal(route.estimatedWalkingDistance, distance);
}
