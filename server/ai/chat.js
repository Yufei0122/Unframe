import { AIError, requireInput } from './config.js';
import { validateRouteInput } from './routes.js';
import { parseRecommendations } from './ollama.js';
import { preservedMustSeeIds } from './planning-constraints.js';

const preferenceKeys = ['interests', 'availableMinutes', 'currentLocation', 'walkingPreference', 'accessibilityRequirements', 'mustSeeArtworkIds'];
const messageText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 600;

export function createPlanningChatService({ ollama, collection, graph, museum }) {
  async function reply(input, signal, combined = false) {
    requireInput(input && typeof input === 'object' && !Array.isArray(input), 'Send a planning message.');
    requireInput(messageText(input.message), 'Write a message of 1–600 characters.');
    const history = input.history ?? [];
    requireInput(Array.isArray(history) && history.length <= 8 && history.every(item => item && ['user', 'assistant'].includes(item.role) && messageText(item.content)), 'Send up to eight recent chat messages.');
    const preferences = validateRouteInput(input.preferences, collection, graph);
    const result = await (combined ? ollama.generatePlanningVisit : ollama.generatePlanningReply)({
      message: input.message.trim(), history: history.map(({ role, content }) => ({ role, content })), preferences,
      museum: { name: museum.name, shortName: museum.shortName },
      artworks: collection.map(({ id, title, artist, tags, minutes, accessible }) => ({ id, title, artist, tags, minutes, accessible })),
      startingPoints: graph.nodes.map(({ id, label }) => ({ id, label })),
    }, signal);
    // Model output must be complete and belong to this museum before it can update the UI.
    if (!result || !messageText(result.reply) || !result.preferences || !preferenceKeys.every(key => Object.hasOwn(result.preferences, key))) {
      throw new AIError(502, 'INVALID_CHAT', 'The planning assistant returned an invalid answer. Please retry.');
    }
    if (/[\u3400-\u9fff]/u.test(input.message) && !/[\u3400-\u9fff]/u.test(result.reply)) {
      throw new AIError(502, 'INVALID_CHAT_LANGUAGE', '本地规划助手未使用中文回复，请重试；当前参观偏好未更改。');
    }
    let updated;
    try { updated = validateRouteInput(result.preferences, collection, graph); }
    catch { throw new AIError(502, 'INVALID_CHAT', 'The planning assistant returned invalid visit preferences. Please retry.'); }
    const preserved = preservedMustSeeIds(input.message, preferences);
    if (preserved !== undefined && JSON.stringify(updated.mustSeeArtworkIds) !== JSON.stringify(preserved)) {
      throw new AIError(502, 'INVALID_CHAT', 'The planning assistant changed your preserved must-see selection. Please retry.');
    }
    const recommendations = combined ? parseRecommendations({ recommendedArtworkIds: result.recommendedArtworkIds, reasoningSummary: result.reasoningSummary }, collection.map(a => a.id)) : undefined;
    return { reply: result.reply.trim(), preferences: updated, ...(combined ? { recommendations } : {}) };
  }
  return { reply, visit: (input, signal) => reply(input, signal, true) };
}
