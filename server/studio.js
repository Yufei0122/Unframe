import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const scrypt = promisify(scryptCallback);
const fields = new Set(['year', 'description', 'detail', 'chineseIntroduction', 'sourceUrl', 'imageCredit']);
const hasStudioAccess = user => ['admin', 'reviewer', 'publisher'].includes(user.role);
const publicUser = ({ id, name, email, role }) => ({ id, name, email, role, canAccessStudio: hasStudioAccess({ role }) });
const digest = value => createHash('sha256').update(value).digest('hex');
function ensure(condition, status, code, message) {
  if (!condition) throw Object.assign(new Error(message), { status, code });
}
function text(value, min, max) { return typeof value === 'string' && value.trim().length >= min && value.length <= max; }
function sourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
function credentials(input) {
  ensure(text(input.email, 3, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()), 400, 'EMAIL_INVALID', 'Enter a valid email address.');
  ensure(typeof input.password === 'string' && input.password.length >= 10 && input.password.length <= 128, 400, 'PASSWORD_INVALID', 'Use a password between 10 and 128 characters.');
}

/** Private, atomically persisted review workspace. Session tokens never go to disk. */
export async function createStudio({ dataDir, catalogue }) {
  const filename = path.join(dataDir, 'studio.json');
  let state;
  try {
    state = JSON.parse(await readFile(filename, 'utf8'));
    ensure(state.version === 1 && Array.isArray(state.users) && Array.isArray(state.cases) && state.published && Array.isArray(state.audit), 500, 'STORE_INVALID', 'The review workspace could not be loaded.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { version: 1, users: [], cases: [], published: {}, audit: [] };
  }
  const sessions = new Map(), attempts = new Map(), registrations = new Map();
  let writes = Promise.resolve();
  const live = id => catalogue.find(art => art.id === id);
  const applyPublished = () => {
    for (const [id, item] of Object.entries(state.published)) {
      const art = live(id);
      if (art) Object.assign(art, item.fields);
    }
  };
  applyPublished();
  async function transact(change, actor, roles) {
    const work = writes.catch(() => {}).then(async () => {
      const next = structuredClone(state);
      if (actor) ensure(next.users.some(user => user.id === actor.id && roles.includes(user.role)), 403, 'PERMISSION_CHANGED', 'Your account permissions have changed. Refresh before continuing.');
      const result = change(next);
      await writeFile(`${filename}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(`${filename}.tmp`, filename);
      state = next;
      applyPublished();
      return result;
    });
    writes = work;
    return work;
  }
  const event = (draft, user, item, action, note = '') => {
    const entry = { id: randomBytes(12).toString('hex'), caseId: item?.id || null, actorId: user.id, actor: user.name, action, note, date: new Date().toISOString() };
    draft.audit.unshift(entry);
    if (item) { item.history.push(entry); item.version++; item.updatedAt = entry.date; }
  };
  const userFor = req => {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
    const key = token ? digest(token) : '';
    const session = sessions.get(key);
    if (session && session.expires <= Date.now()) sessions.delete(key);
    const user = session && session.expires > Date.now() ? state.users.find(item => item.id === session.userId) : null;
    ensure(user, 401, 'AUTH_REQUIRED', 'Please sign in to Unframe.');
    return user;
  };
  const issueSession = user => {
    user = state.users.find(current => current.id === user.id);
    ensure(user, 401, 'AUTH_REQUIRED', 'Please sign in to Unframe.');
    const token = randomBytes(32).toString('hex');
    for (const [key, item] of sessions) if (item.expires <= Date.now()) sessions.delete(key);
    sessions.set(digest(token), { userId: user.id, expires: Date.now() + 12 * 60 * 60 * 1000 });
    return { token, user: publicUser(user) };
  };
  const reviewer = user => ensure(['admin', 'reviewer'].includes(user.role), 403, 'REVIEW_FORBIDDEN', 'Your role cannot review content.');
  const staff = user => ensure(hasStudioAccess(user), 403, 'STUDIO_FORBIDDEN', 'This account does not have access to Unframe Studio.');
  const admin = user => ensure(user.role === 'admin', 403, 'ADMIN_REQUIRED', 'An administrator is required.');
  const caseFor = (draft, id, version) => {
    const item = draft.cases.find(item => item.id === id);
    ensure(item, 404, 'CASE_NOT_FOUND', 'This review case was not found.');
    ensure(Number.isInteger(version) && item.version === version, 409, 'VERSION_CONFLICT', 'This case has changed. Refresh before continuing.');
    return item;
  };
  const knownInput = (input, art) => {
    ensure(fields.has(input.field), 400, 'FIELD_INVALID', 'Choose a supported content field.');
    ensure(text(input.proposed, 1, 5000), 400, 'VALUE_INVALID', 'Enter a proposed value of up to 5,000 characters.');
    ensure(input.proposed.trim() !== String(art[input.field] || ''), 400, 'VALUE_UNCHANGED', 'The proposed content is unchanged.');
    if (input.field === 'sourceUrl') ensure(sourceUrl(input.proposed), 400, 'SOURCE_INVALID', 'Use an HTTPS source URL without credentials.');
    ensure(text(input.reason, 5, 2000), 400, 'REASON_REQUIRED', 'Explain the proposed change in at least five characters.');
    ensure(text(input.sourceUrl, 8, 2048) && sourceUrl(input.sourceUrl), 400, 'SOURCE_INVALID', 'Attach an HTTPS source URL without credentials.');
  };
  async function addUser(input, role) {
    credentials(input);
    ensure(text(input.name, 1, 60), 400, 'NAME_REQUIRED', 'Enter a display name.');
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(input.password, salt, 64)).toString('hex');
    return { id: randomBytes(12).toString('hex'), name: input.name.trim(), email: input.email.trim().toLowerCase(), role, salt, hash };
  }
  const allowedOrigins = new Set((process.env.AI_ALLOWED_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:8082,http://127.0.0.1:8082,http://127.0.0.1:8091').split(',').map(value => value.trim()));

  return {
    requireUser: req => { const user = userFor(req); staff(user); return user; },
    async handle(req, res, route, { body, send }) {
      if (!route.startsWith('/api/studio/') && !route.startsWith('/api/auth/') && route !== '/api/catalogue') return false;
      const origin = req.headers.origin;
      if (origin) {
        let loopbackOrigin = false;
        try { const url = new URL(origin); loopbackOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.host === req.headers.host && ['http:', 'https:'].includes(url.protocol); } catch { /* Invalid origins are rejected below. */ }
        ensure(allowedOrigins.has(origin) || loopbackOrigin, 403, 'ORIGIN_FORBIDDEN', 'This origin is not allowed.');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
      const respond = (status, data) => { send(res, status, data); return true; };
      if (route === '/api/catalogue' && req.method === 'GET') return respond(200, { artworks: catalogue, publishedAt: state.audit.find(item => item.action === 'published')?.date || null });
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (['/api/studio/status', '/api/auth/status'].includes(route) && req.method === 'GET') return respond(200, { setupRequired: !state.users.some(user => user.role === 'admin'), setupAllowed: local });
      if (['POST', 'PATCH'].includes(req.method)) ensure(req.headers['content-type']?.includes('application/json'), 415, 'JSON_REQUIRED', 'Use application/json.');
      if (['/api/studio/setup', '/api/auth/setup'].includes(route) && req.method === 'POST') {
        ensure(local, 403, 'LOCAL_SETUP_ONLY', 'Create the first administrator on the server computer.');
        ensure(!state.users.some(user => user.role === 'admin'), 409, 'SETUP_COMPLETE', 'This workspace already has an administrator. Sign in instead.');
        const user = await addUser(await body(req), 'admin');
        await transact(draft => {
          ensure(!draft.users.some(user => user.role === 'admin'), 409, 'SETUP_COMPLETE', 'This workspace already has an administrator.');
          ensure(!draft.users.some(item => item.email === user.email), 409, 'EMAIL_EXISTS', 'This email already has an account. Sign in instead.');
          draft.users.push(user); event(draft, user, null, 'workspace_created');
        });
        return respond(201, issueSession(user));
      }
      if (route === '/api/auth/register' && req.method === 'POST') {
        const input = await body(req);
        const key = req.socket.remoteAddress || 'local';
        for (const [address, item] of registrations) if (item.until <= Date.now()) registrations.delete(address);
        const attempt = registrations.get(key) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
        ensure(attempt.count < 10, 429, 'REGISTER_LIMIT', 'Too many registration attempts. Try again in 15 minutes.');
        attempt.count++; registrations.set(key, attempt);
        credentials(input);
        ensure(input.password === input.confirmPassword, 400, 'PASSWORD_MISMATCH', 'The passwords do not match.');
        // Public registration never accepts client-supplied roles or staff access.
        const user = await addUser({ email: input.email, password: input.password, name: input.email.trim().split('@')[0].slice(0, 60) }, 'visitor');
        await transact(draft => {
          ensure(!draft.users.some(item => item.email === user.email), 409, 'EMAIL_EXISTS', 'This email already has an account. Sign in instead.');
          draft.users.push(user); event(draft, user, null, 'account_registered');
        });
        return respond(201, issueSession(user));
      }
      if (['/api/studio/login', '/api/auth/login'].includes(route) && req.method === 'POST') {
        const input = await body(req);
        const key = req.socket.remoteAddress || 'local';
        for (const [key, item] of attempts) if (item.until <= Date.now()) attempts.delete(key);
        const attempt = attempts.get(key) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
        ensure(attempt.count < 10, 429, 'LOGIN_LIMIT', 'Too many attempts. Try again in 15 minutes.');
        attempt.count++; attempts.set(key, attempt);
        ensure(text(input.email, 3, 254) && typeof input.password === 'string' && input.password.length <= 128, 401, 'LOGIN_INVALID', 'Email or password is incorrect.');
        const user = state.users.find(item => item.email === input.email.trim().toLowerCase());
        const hash = await scrypt(input.password, user?.salt || 'unframe-nonexistent-user', 64);
        ensure(user && timingSafeEqual(hash, Buffer.from(user.hash, 'hex')), 401, 'LOGIN_INVALID', 'Email or password is incorrect.');
        attempts.delete(key);
        return respond(200, issueSession(user));
      }
      const user = userFor(req);
      if (['/api/studio/session', '/api/auth/session'].includes(route) && req.method === 'GET') return respond(200, { user: publicUser(user) });
      if (['/api/studio/logout', '/api/auth/logout'].includes(route) && req.method === 'POST') { sessions.delete(digest(req.headers.authorization.slice(7))); return respond(200, { ok: true }); }
      staff(user);
      if (route === '/api/studio/state' && req.method === 'GET') return respond(200, { user: publicUser(user), artworks: catalogue, cases: state.cases, members: state.users.filter(member => user.role === 'admin' || hasStudioAccess(member)).map(publicUser), audit: state.audit });
      if (route === '/api/studio/members' && req.method === 'POST') {
        admin(user);
        const input = await body(req);
        ensure(['visitor', 'reviewer', 'publisher', 'admin'].includes(input.role), 400, 'ROLE_INVALID', 'Choose a supported role.');
        const member = await addUser(input, input.role);
        await transact(draft => {
          ensure(draft.users.length < 100 && !draft.users.some(item => item.email === member.email), 409, 'MEMBER_EXISTS', 'This email already belongs to a member, or the member limit was reached.');
          draft.users.push(member); event(draft, user, null, 'member_created', member.email);
        }, user, ['admin']);
        return respond(201, publicUser(member));
      }
      const memberMatch = route.match(/^\/api\/studio\/members\/([a-f0-9]{24})$/);
      if (memberMatch && req.method === 'PATCH') {
        admin(user);
        const input = await body(req);
        ensure(['visitor', 'reviewer', 'publisher', 'admin'].includes(input.role), 400, 'ROLE_INVALID', 'Choose a supported role.');
        const member = await transact(draft => {
          const member = draft.users.find(member => member.id === memberMatch[1]);
          ensure(member, 404, 'MEMBER_NOT_FOUND', 'This account was not found.');
          ensure(member.role !== 'admin' || input.role === 'admin' || draft.users.some(other => other.id !== member.id && other.role === 'admin'), 409, 'LAST_ADMIN_REQUIRED', 'Keep at least one administrator in this workspace.');
          const previous = member.role; member.role = input.role;
          event(draft, user, null, 'role_changed', `${member.name}: ${previous} → ${input.role}`);
          return publicUser(member);
        }, user, ['admin']);
        return respond(200, member);
      }
      if (route === '/api/studio/cases' && req.method === 'POST') {
        reviewer(user);
        const input = await body(req), art = live(input.artworkId);
        ensure(art, 404, 'ARTWORK_NOT_FOUND', 'Choose an existing artwork.'); knownInput(input, art);
        const item = await transact(draft => {
          knownInput(input, art);
          ensure(!draft.cases.some(item => item.artworkId === art.id && item.field === input.field && item.proposed === input.proposed.trim() && !['returned', 'published'].includes(item.status)), 409, 'DUPLICATE_CASE', 'This change already has an open review case.');
          const item = { id: `REV-${String(draft.cases.length + 1).padStart(4, '0')}`, artworkId: art.id, museumId: art.museumId, kind: input.kind === 'ai' ? 'ai' : 'artwork', field: input.field, current: String(art[input.field] || ''), proposed: input.proposed.trim(), reason: input.reason.trim(), status: 'review', priority: input.priority === 'high' ? 'high' : 'normal', sourceUrl: input.sourceUrl.trim(), evidence: { verified: false, note: '', by: null }, createdBy: user.id, assignedTo: null, firstReviewer: null, finalReviewer: null, baseVersion: draft.published[art.id]?.version || 0, version: 0, history: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          draft.cases.unshift(item); event(draft, user, item, 'submitted', item.reason); return item;
        }, user, ['admin', 'reviewer']);
        return respond(201, item);
      }
      const match = route.match(/^\/api\/studio\/cases\/(REV-\d+)\/(evidence|action)$/);
      if (match && ((match[2] === 'evidence' && req.method === 'PATCH') || (match[2] === 'action' && req.method === 'POST'))) {
        reviewer(user);
        const input = await body(req);
        ensure(input.note === undefined || text(input.note, 0, 2000), 400, 'NOTE_INVALID', 'Use a review note of up to 2,000 characters.');
        const result = await transact(draft => {
          const item = caseFor(draft, match[1], input.version);
          if (match[2] === 'evidence') {
            ensure(['review', 'verify'].includes(item.status), 409, 'STAGE_INVALID', 'Evidence can only change during a review.');
            ensure(typeof input.verified === 'boolean' && text(input.note, input.verified ? 5 : 0, 2000), 400, 'EVIDENCE_NOTE_REQUIRED', 'Record the source finding in at least five characters.');
            item.evidence = { verified: input.verified, note: input.note.trim(), by: user.id };
            event(draft, user, item, input.verified ? 'evidence_verified' : 'evidence_pending', input.note.trim());
          } else if (input.action === 'assign') {
            admin(user);
            ensure(!['published', 'returned'].includes(item.status), 409, 'STAGE_INVALID', 'This case cannot be assigned at its current stage.');
            ensure(input.assignedTo === null || draft.users.some(member => member.id === input.assignedTo && ['admin', 'reviewer'].includes(member.role)), 400, 'ASSIGNEE_INVALID', 'Choose a reviewer.');
            item.assignedTo = input.assignedTo; event(draft, user, item, 'assigned', input.assignedTo || 'unassigned');
          } else if (input.action === 'return') {
            ensure(['review', 'verify', 'ready'].includes(item.status), 409, 'STAGE_INVALID', 'This case cannot be returned at its current stage.');
            ensure(text(input.note, 5, 2000), 400, 'RETURN_NOTE_REQUIRED', 'Explain the return in at least five characters.');
            item.status = 'returned'; event(draft, user, item, 'returned', input.note.trim());
          } else if (input.action === 'resubmit') {
            ensure(item.status === 'returned', 409, 'STAGE_INVALID', 'Only returned cases can be resubmitted.');
            const art = live(item.artworkId); knownInput({ ...input, field: item.field }, art);
            Object.assign(item, { current: String(art[item.field] || ''), proposed: input.proposed.trim(), reason: input.reason.trim(), sourceUrl: input.sourceUrl.trim(), baseVersion: draft.published[art.id]?.version || 0, status: 'review', firstReviewer: null, finalReviewer: null, evidence: { verified: false, note: '', by: null } });
            event(draft, user, item, 'resubmitted', item.reason);
          } else {
            ensure(input.action === 'approve', 400, 'ACTION_INVALID', 'Choose a supported review action.');
            ensure(['review', 'verify'].includes(item.status), 409, 'STAGE_INVALID', 'This case is no longer waiting for review.');
            ensure(item.evidence.verified, 409, 'EVIDENCE_REQUIRED', 'Verify the source before approving.');
            if (item.status === 'review') { item.firstReviewer = user.id; item.status = 'verify'; event(draft, user, item, 'review_passed', input.note || ''); }
            else {
              ensure(item.firstReviewer !== user.id, 403, 'SECOND_REVIEWER_REQUIRED', 'A different reviewer must complete verification.');
              item.finalReviewer = user.id; item.status = 'ready'; event(draft, user, item, 'verification_passed', input.note || '');
            }
          }
          return item;
        }, user, input.action === 'assign' ? ['admin'] : ['admin', 'reviewer']);
        return respond(200, result);
      }
      if (route === '/api/studio/releases' && req.method === 'POST') {
        ensure(['admin', 'publisher'].includes(user.role), 403, 'PUBLISH_FORBIDDEN', 'Your role cannot publish content.');
        const input = await body(req);
        ensure(Array.isArray(input.cases) && input.cases.length > 0 && input.cases.length <= 30 && new Set(input.cases.map(item => item.id)).size === input.cases.length, 400, 'RELEASE_INVALID', 'Select between 1 and 30 distinct cases.');
        const result = await transact(draft => {
          const items = input.cases.map(({ id, version }) => caseFor(draft, id, version));
          ensure(new Set(items.map(item => item.artworkId)).size === items.length, 409, 'RELEASE_CONFLICT', 'Publish changes to the same artwork in separate batches, rebasing later changes first.');
          for (const item of items) {
            ensure(item.status === 'ready' && item.finalReviewer && item.evidence.verified, 409, 'STAGE_INVALID', 'Only verified, ready cases can be published.');
            const previous = draft.published[item.artworkId] || { version: 0, fields: {} };
            ensure(previous.version === item.baseVersion, 409, 'PUBLICATION_CONFLICT', 'The published artwork has changed. Return and rebase this revision before publishing.');
            draft.published[item.artworkId] = { version: previous.version + 1, fields: { ...previous.fields, [item.field]: item.proposed } };
            item.status = 'published'; event(draft, user, item, 'published');
          }
          return { published: items.map(item => item.id) };
        }, user, ['admin', 'publisher']);
        return respond(200, result);
      }
      return respond(404, { error: 'Studio endpoint not found.', code: 'NOT_FOUND' });
    },
  };
}
