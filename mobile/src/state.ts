import type { MobileState, Preferences, Visit, Feedback } from './model';
import type { RoutePlan } from '../../shared/domain.js';

export type Action =
  | { type: 'hydrate'; state: MobileState }
  | { type: 'save'; id: string }
  | { type: 'preferences'; preferences: Preferences }
  | { type: 'plan'; route: RoutePlan }
  | { type: 'stop'; id: string; status: 'completed' | 'skipped' }
  | { type: 'end' }
  | { type: 'finish'; visit: Visit }
  | { type: 'feedback'; feedback: Feedback }
  | { type: 'clearHistory' };

export function reducer(state: MobileState, action: Action): MobileState {
  switch (action.type) {
    case 'hydrate': return action.state;
    case 'save': return { ...state, saved: state.saved.includes(action.id) ? state.saved.filter(id => id !== action.id) : [...state.saved, action.id] };
    case 'preferences': return { ...state, preferences: action.preferences };
    case 'plan': return { ...state, tour: { ...action.route, completed: [], skipped: [] } };
    case 'stop': {
      if (!state.tour || !state.tour.artworkIds.includes(action.id)) return state;
      const selected = state.tour[action.status];
      const other = action.status === 'completed' ? 'skipped' : 'completed';
      return { ...state, tour: { ...state.tour, [action.status]: selected.includes(action.id) ? selected.filter(id => id !== action.id) : [...selected, action.id], [other]: state.tour[other].filter(id => id !== action.id) } };
    }
    case 'end': return { ...state, tour: null };
    case 'finish': return { ...state, tour: null, visits: state.preferences.saveHistory ? [action.visit, ...state.visits] : state.visits };
    case 'feedback': return { ...state, feedback: [action.feedback, ...state.feedback] };
    case 'clearHistory': return { ...state, visits: [] };
  }
}

export function makeReflection(ids: string[], collection: { id: string; title: string; tags: string[] }[], now = new Date()): Visit {
  const visited = collection.filter(a => ids.includes(a.id));
  const themes = [...new Set(visited.flatMap(a => a.tags))].join(', ').toLowerCase();
  return { id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, date: now.toISOString(), artworkIds: visited.map(a => a.id), summary: `You explored ${visited.length} ${visited.length === 1 ? 'work' : 'works'} at Northbank Gallery: ${visited.map(a => a.title).join(', ')}. Your visit connected ${themes}. What detail would you like to return to?` };
}

export function restoreState(raw: string, defaults: MobileState, ids: string[]): MobileState {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1) throw new Error('This saved collection uses an unsupported format.');
  const s = data as MobileState;
  const p = s.preferences;
  if (!p || typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.interests) || !p.interests.every(t => typeof t === 'string') || !Number.isFinite(p.duration) || p.duration < 10 || p.duration > 120 || ['stepFree', 'saveHistory', 'largeText'].some(k => typeof p[k as keyof Preferences] !== 'boolean')) throw new Error('Saved preferences could not be read.');
  if (!Array.isArray(s.saved) || !Array.isArray(s.visits) || !Array.isArray(s.feedback)) throw new Error('Saved collection could not be read.');
  const validIds = (values: unknown): values is string[] => Array.isArray(values) && values.every(id => typeof id === 'string' && ids.includes(id));
  const validTour = s.tour && validIds(s.tour.artworkIds) && validIds(s.tour.completed) && validIds(s.tour.skipped) && typeof s.tour.stepFree === 'boolean' && Number.isFinite(s.tour.minutes) && Number.isFinite(s.tour.duration) && Array.isArray(s.tour.interests);
  return { ...defaults, preferences: p, saved: [...new Set(s.saved.filter(id => ids.includes(id)))], visits: s.visits.filter(v => v && typeof v.id === 'string' && typeof v.summary === 'string' && Number.isFinite(Date.parse(v.date)) && validIds(v.artworkIds)), feedback: s.feedback.filter(f => f && typeof f.id === 'string' && typeof f.message === 'string' && typeof f.type === 'string' && Number.isFinite(Date.parse(f.date))), tour: validTour ? s.tour : null };
}
