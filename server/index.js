import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { initialState } from './seed.js';
import { planRoute, guideReply } from './domain.js';
import { startLocalServer } from './startup.js';
import { createAIHandler } from './ai/handler.js';

const handleAI = createAIHandler();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Cannot start Unframe: PORT must be a whole number between 1 and 65535.');
  process.exit(1);
}
const dataDir = path.resolve(process.env.UNFRAME_DATA_DIR || path.join(root, 'data'));
await mkdir(dataDir, { recursive: true });
const dataFile = path.join(dataDir, 'unframe.json');
const workspace = createHash('sha256').update(process.platform === 'win32' ? dataFile.toLowerCase() : dataFile).digest('hex');
let state;
try { state = JSON.parse(await readFile(dataFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = initialState(); }
let writes = Promise.resolve();
async function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writes = writes.catch(() => {}).then(async () => { await writeFile(`${dataFile}.tmp`, snapshot); await rename(`${dataFile}.tmp`, dataFile); });
  return writes;
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 100_000) throw Object.assign(new Error('Request too large'), { status: 413 }); }
  let parsed;
  try { parsed = data ? JSON.parse(data) : {}; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  assert(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'Request body must be an object');
  return parsed;
}
function assert(condition, message) { if (!condition) throw Object.assign(new Error(message), { status: 400 }); }
const allowedInterests = ['Nature', 'Colour', 'Sculpture', 'Form', 'Reflection'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    if (route.startsWith('/api/ai/')) return await handleAI(req, res);
    if (route.startsWith('/api/')) {
      if (route === '/api/health' && req.method === 'GET') return send(res, 200, { app: 'unframe', status: 'ok', workspace });
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Cross-origin requests are not allowed' });
        if (!req.headers['content-type']?.includes('application/json')) return send(res, 415, { error: 'Use application/json' });
      }
      if (route === '/api/state' && req.method === 'GET') return send(res, 200, state);
      if (route === '/api/preferences' && req.method === 'PATCH') {
        const input = await body(req);
        const next = { ...state.preferences };
        if (input.name !== undefined) { assert(typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 40, 'Name must be 1–40 characters'); next.name = input.name.trim(); }
        if (input.interests !== undefined) { assert(Array.isArray(input.interests) && input.interests.every(t => allowedInterests.includes(t)), 'Invalid interests'); next.interests = [...new Set(input.interests)]; }
        if (input.duration !== undefined) { assert(Number.isFinite(input.duration) && input.duration >= 10 && input.duration <= 120, 'Duration must be 10–120 minutes'); next.duration = input.duration; }
        for (const key of ['stepFree', 'largeText', 'reducedMotion', 'saveHistory']) if (input[key] !== undefined) { assert(typeof input[key] === 'boolean', `Invalid ${key}`); next[key] = input[key]; }
        state.preferences = next;
        await persist(); return send(res, 200, state.preferences);
      }
      if (route === '/api/saved' && req.method === 'POST') {
        const { artworkId } = await body(req); assert(state.artworks.some(a => a.id === artworkId), 'Artwork not found');
        state.saved = state.saved.includes(artworkId) ? state.saved.filter(id => id !== artworkId) : [...state.saved, artworkId];
        await persist(); return send(res, 200, state.saved);
      }
      if (route === '/api/routes' && req.method === 'POST') {
        const input = await body(req); assert(input.interests === undefined || (Array.isArray(input.interests) && input.interests.every(t => allowedInterests.includes(t))), 'Invalid interests');
        assert(input.stepFree === undefined || typeof input.stepFree === 'boolean', 'Invalid accessibility preference');
        return send(res, 200, planRoute(state.artworks, input));
      }
      if (route === '/api/guide' && req.method === 'POST') {
        const { question, artworkId } = await body(req); assert(typeof question === 'string' && question.trim().length > 0 && question.length <= 1000, 'Question must be 1–1000 characters');
        return send(res, 200, guideReply(question, state.artworks, artworkId));
      }
      if (route === '/api/visits' && req.method === 'POST') {
        const input = await body(req); assert(Array.isArray(input.artworkIds) && input.artworkIds.length > 0 && input.artworkIds.every(id => state.artworks.some(a => a.id === id)), 'Choose valid artworks');
        const visited = state.artworks.filter(a => input.artworkIds.includes(a.id));
        const visit = { id: randomUUID(), date: new Date().toISOString(), artworkIds: visited.map(a => a.id), summary: `You explored ${visited.length} ${visited.length === 1 ? 'work' : 'works'} at Northbank Gallery, including ${visited.map(a => a.title).join(', ')}. Your visit connected ${[...new Set(visited.flatMap(a => a.tags))].join(', ').toLowerCase()}. ${visited.length === 1 ? 'What detail would you like to return to?' : 'Which work changed how you looked at the next one?'}` };
        if (state.preferences.saveHistory) { state.visits.unshift(visit); await persist(); }
        return send(res, 201, { ...visit, persisted: state.preferences.saveHistory });
      }
      if (route === '/api/visits' && req.method === 'DELETE') { state.visits = []; await persist(); return send(res, 200, { ok: true }); }
      if (route === '/api/feedback' && req.method === 'POST') {
        const { artworkId, message, type } = await body(req); assert(typeof message === 'string' && message.trim().length >= 5 && message.length <= 2000, 'Feedback must be 5–2000 characters');
        assert(!artworkId || state.artworks.some(a => a.id === artworkId), 'Artwork not found');
        const item = { id: randomUUID(), artworkId: artworkId || null, message: message.trim(), type: ['Accuracy', 'Accessibility', 'Suggestion'].includes(type) ? type : 'Suggestion', status: 'Open', date: new Date().toISOString() };
        state.feedback.unshift(item); await persist(); return send(res, 201, item);
      }
      const artMatch = route.match(/^\/api\/artworks\/([a-z0-9-]+)$/);
      if (artMatch && req.method === 'PATCH') {
        const art = state.artworks.find(a => a.id === artMatch[1]); if (!art) return send(res, 404, { error: 'Artwork not found' });
        const input = await body(req);
        for (const key of ['description', 'detail', 'source']) if (input[key] !== undefined) assert(typeof input[key] === 'string' && input[key].trim().length > 0 && input[key].length <= 5000, `Invalid ${key}`);
        for (const key of ['description', 'detail', 'source']) if (input[key] !== undefined) art[key] = input[key].trim();
        art.updatedAt = new Date().toISOString(); await persist(); return send(res, 200, art);
      }
      const feedbackMatch = route.match(/^\/api\/feedback\/([a-z0-9-]+)$/);
      if (feedbackMatch && req.method === 'PATCH') {
        const item = state.feedback.find(f => f.id === feedbackMatch[1]); if (!item) return send(res, 404, { error: 'Feedback not found' });
        const { status } = await body(req); assert(['Open', 'Resolved'].includes(status), 'Invalid status'); item.status = status; await persist(); return send(res, 200, item);
      }
      return send(res, 404, { error: 'Endpoint not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    const relative = decodeURIComponent(route === '/' ? '/index.html' : route);
    const publicDir = path.join(root, 'public');
    const file = path.resolve(publicDir, `.${relative}`);
    if (!file.startsWith(publicDir + path.sep)) return send(res, 403, { error: 'Forbidden' });
    try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : data); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'EISDIR') return send(res, 404, { error: 'Not found' }); throw error; }
  } catch (error) { if (!error.status) console.error(error); send(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' }); }
});
if (!await startLocalServer(server, { port, workspace, dataFile })) process.exitCode = 1;
