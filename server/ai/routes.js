import { AIError, requireInput, logFailure } from './config.js';
import { shortestPath } from './graph.js';
import { planRoute } from '../../shared/domain.js';

export function validateRouteInput(input, collection, graph) {
  requireInput(input && typeof input === 'object' && !Array.isArray(input), 'Send a route preferences object.');
  const { interests = [], availableMinutes = 30, currentLocation = 'entrance', walkingPreference = 'balanced', accessibilityRequirements = [], mustSeeArtworkIds = [] } = input;
  requireInput(Array.isArray(interests) && interests.length <= 10 && interests.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 80), 'Choose up to 10 interests.');
  requireInput(Number.isFinite(availableMinutes) && availableMinutes >= 1 && availableMinutes <= 240, 'Available time must be 1–240 minutes.');
  requireInput(graph.nodes.some(n => n.id === currentLocation), 'Choose a valid starting location.');
  requireInput(['balanced', 'less_walking'].includes(walkingPreference), 'Invalid walking preference.');
  requireInput(Array.isArray(accessibilityRequirements) && accessibilityRequirements.every(s => ['step_free', 'wheelchair'].includes(s)), 'Supported accessibility requirements: step_free, wheelchair.');
  requireInput(Array.isArray(mustSeeArtworkIds) && mustSeeArtworkIds.length <= 8 && mustSeeArtworkIds.every(id => collection.some(a => a.id === id)), 'Choose valid must-see artwork IDs (up to 8).');
  return { interests, availableMinutes, currentLocation, walkingPreference, accessibilityRequirements, mustSeeArtworkIds: [...new Set(mustSeeArtworkIds)] };
}

export function createRouteService({ gemini, collection, graph }) {
  return { async plan(input) {
    const prefs = validateRouteInput(input, collection, graph);
    const stepFree = prefs.accessibilityRequirements.length > 0;
    const eligible = collection.filter(a => (!stepFree || a.accessible) && graph.nodes.some(n => n.id === a.id));
    if (!eligible.length) throw new AIError(422, 'NO_ROUTE', 'No artworks can be visited with these requirements.');
    let recommendations, warning, recommendationSource = 'gemini';
    try { recommendations = await gemini.generateRouteRecommendations(prefs, eligible); }
    catch (error) {
      logFailure('recommendation', error); recommendationSource = 'local';
      const route = planRoute(eligible, { interests: prefs.interests, duration: 120, stepFree });
      recommendations = { recommendedArtworkIds: route.artworkIds, reasoningSummary: 'Local collection preferences were used because AI recommendations are unavailable.' };
      warning = 'AI recommendations are unavailable. This itinerary uses local rules.';
    }
    // Exact search over a small shortlist; physical shortest paths are always Dijkstra.
    const ids = [...new Set([...prefs.mustSeeArtworkIds, ...recommendations.recommendedArtworkIds, ...eligible.map(a => a.id)])].slice(0, 8);
    const works = ids.map(id => eligible.find(a => a.id === id)).filter(Boolean);
    if (prefs.mustSeeArtworkIds.some(id => !works.some(a => a.id === id))) throw new AIError(422, 'NO_ROUTE', 'A must-see artwork is not accessible with these requirements.');
    const options = { stepFree, metric: prefs.walkingPreference === 'less_walking' ? 'distance' : 'estimatedSeconds' };
    const paths = new Map();
    for (const from of [prefs.currentLocation, ...ids]) for (const to of ids) paths.set(`${from}:${to}`, shortestPath(graph, from, to, options));
    const scores = new Map(works.map(a => [a.id, 10 + a.tags.filter(t => prefs.interests.some(i => i.toLowerCase() === t.toLowerCase())).length * 3 + Math.max(0, recommendations.recommendedArtworkIds.length - recommendations.recommendedArtworkIds.indexOf(a.id)) * (recommendations.recommendedArtworkIds.includes(a.id) ? 1 : 0)]));
    let best = null;
    function visit(current, stops, navigation, seconds, distance, score) {
      const selected = new Set(stops.map(a => a.id));
      const utility = prefs.walkingPreference === 'less_walking' ? score / (1 + distance / 200) : score;
      if (stops.length && prefs.mustSeeArtworkIds.every(id => selected.has(id)) && (!best || utility > best.utility || (utility === best.utility && distance < best.distance))) best = { stops, navigation, seconds, distance, utility };
      for (const art of works) {
        if (selected.has(art.id)) continue;
        const path = paths.get(`${current}:${art.id}`);
        if (!path) continue;
        const nextSeconds = seconds + art.minutes * 60 + path.estimatedSeconds;
        if (nextSeconds <= prefs.availableMinutes * 60) visit(art.id, [...stops, art], [...navigation, path], nextSeconds, distance + path.distance, score + scores.get(art.id));
      }
    }
    visit(prefs.currentLocation, [], [], 0, 0, 0);
    if (!best) throw new AIError(422, 'NO_ROUTE', 'No feasible route fits this time and these must-see/accessibility requirements. Increase the time or change the starting point or selections.');
    return {
      demo: graph.demo, mapNotice: graph.description, estimatedMinutes: Math.ceil(best.seconds / 60), estimatedWalkingDistance: best.distance,
      route: best.stops.map((a, i) => ({ order: i + 1, artworkId: a.id, title: a.title, galleryId: graph.nodes.find(n => n.id === a.id).galleryId, estimatedVisitMinutes: a.minutes })),
      navigation: best.navigation, reasoningSummary: recommendations.reasoningSummary, recommendationSource, ...(warning ? { warning } : {}),
    };
  } };
}
