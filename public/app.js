const icons = {
  discover: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
  sparkles: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3ZM20 2v4M18 4h4"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  museum: '<path d="m3 8 9-5 9 5H3ZM4 21h16M6 10v8M12 10v8M18 10v8M3 18h18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  scan: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  leaf: '<path d="M20 3C8 2 1 9 5 17s17 3 15-14Z"/><path d="M4 21 15 10"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3M4 13H3v7h4v-7H4Zm16 0h1v7h-4v-7h3Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  send: '<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',
  book: '<path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2ZM12 5v16"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  edit: '<path d="m15 5 4 4M4 20l5-1L21 7l-4-4L5 15l-1 5Z"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9c-2 0-4-.5-5-1l-4 2 1-5a9 9 0 1 1 17-5Z"/><path d="M8 10h8M8 14h5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-6 6 8"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  stairs: '<path d="M3 21h6v-6h6V9h6V3"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2"/>',
  heart: '<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.sparkles}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
let state, category = 'All works', search = '', visitTab = 'saved', adminTab = 'collection', room = null, routePlan = null;
let completed = new Set(), skipped = new Set(), messages = [], guideArt = '', sending = false, speaking = false, toastTimer, lastFocus, photoUrl;
const interests = ['Nature', 'Colour', 'Sculpture', 'Form', 'Reflection'];
const pages = ['discover', 'explore', 'guide', 'visits', 'profile', 'admin'];
const currentPage = () => pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'discover';
const artById = id => state.artworks.find(a => a.id === id);
const dateLabel = date => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));

async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete this action.');
  return data;
}
function toast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}
function navigate(page) { if (currentPage() === page) render(); else location.hash = page; }
function applyPreferences() {
  document.documentElement.classList.toggle('large-text', state.preferences.largeText);
  document.documentElement.classList.toggle('reduced-motion', state.preferences.reducedMotion);
}
function navItem(id, label, iconName) {
  return `<a href="#${id}" class="nav-item ${currentPage() === id ? 'active' : ''}" ${currentPage() === id ? 'aria-current="page"' : ''} aria-label="${label}">${icon(iconName)}<span>${label}</span>${id === 'visits' && state.saved.length ? `<span class="badge-count">${state.saved.length}</span>` : ''}</a>`;
}
function render() {
  if (!state) return;
  const page = currentPage();
  applyPreferences();
  document.title = `${{ discover: 'Discover', explore: 'Explore the gallery', guide: 'Your AI guide', visits: 'My visits', profile: 'Your preferences', admin: 'Curator workspace' }[page]} — Unframe`;
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="Main navigation">
      <a href="#discover" class="brand" aria-label="Unframe home"><img src="/assets/mark.svg" alt=""/><span>unframe<span style="color:var(--accent)">.</span></span></a>
      <div class="nav-label">YOUR MUSEUM COMPANION</div>
      <nav class="nav-list">${navItem('discover', 'Discover', 'discover')}${navItem('explore', 'Explore', 'map')}${navItem('guide', 'AI Guide', 'sparkles')}${navItem('visits', 'My Visits', 'bookmark')}${navItem('profile', 'Preferences', 'settings')}</nav>
      <div class="sidebar-bottom"><div class="sidebar-note">${icon('leaf')}<strong>A little more wonder.</strong><p>No right route. No wrong questions.<br/>Just you and a new perspective.</p></div><nav class="nav-list">${navItem('admin', 'Museum workspace', 'museum')}</nav><div class="sidebar-footer"><i class="status-dot"></i> A thoughtfully built prototype</div></div>
    </aside>
    <div class="workspace"><header class="topbar">
      <a class="mobile-brand" href="#discover"><img src="/assets/mark.svg" alt=""/>unframe.</a>
      <form class="top-search" id="search-form" role="search">${icon('search')}<input name="search" aria-label="Search artworks, artists or interests" placeholder="Search artworks, artists, a little inspiration…" value="${esc(search)}" autocomplete="off"/></form>
      <div class="topbar-right"><span class="museum-indicator">${icon('pin')}Brisbane, Australia</span><a href="#profile" class="avatar" aria-label="Your preferences">${esc(state.preferences.name.slice(0, 2).toUpperCase())}</a></div>
    </header>
    <main class="main" id="main" tabindex="-1">${({ discover: discoverPage, explore: explorePage, guide: guidePage, visits: visitsPage, profile: profilePage, admin: adminPage })[page]()}
    <footer class="footer"><span>${icon('leaf')}Made for curiosity. Designed around you.</span><button data-action="about">Sample collection · About this prototype ${'↗'}</button></footer></main></div></div>`;
  if (page === 'guide') scrollChat();
}
function artCard(art) {
  return `<article class="art-card"><div class="art-image"><button data-action="art" data-id="${art.id}" aria-label="Explore ${esc(art.title)}"><img src="${art.image}" alt="${esc(art.title)} — ${esc(art.category.toLowerCase())} from the sample collection" loading="lazy"/></button><button class="save-button ${state.saved.includes(art.id) ? 'saved' : ''}" data-action="save" data-id="${art.id}" aria-label="${state.saved.includes(art.id) ? 'Unsave' : 'Save'} ${esc(art.title)}" aria-pressed="${state.saved.includes(art.id)}">${icon('bookmark')}</button><span class="art-room">Room ${art.room}</span></div><div class="art-info"><h3><button data-action="art" data-id="${art.id}">${esc(art.title)}</button></h3><p>${esc(art.artist)} · ${art.year}</p><div class="art-meta"><span>${esc(art.category)}</span><span>${icon('clock')}${art.minutes} min to explore</span></div></div></article>`;
}
function emptyState(title, copy, button = '', iconName = 'bookmark') { return `<div class="empty">${icon(iconName)}<h3>${title}</h3><p>${copy}</p>${button}</div>`; }
function discoverPage() {
  const filtered = state.artworks.filter(a => (category === 'All works' || a.category === category) && (!search || `${a.title} ${a.artist} ${a.tags.join(' ')} ${a.category}`.toLowerCase().includes(search.toLowerCase())));
  const showAll = search || category !== 'All works';
  return `<div class="page-heading"><div><div class="greeting">${icon('sun')}A good day to discover, ${esc(state.preferences.name)}.</div><h1>Your next perspective.</h1><p>Less searching. More finding something that stays with you.</p></div><button class="button secondary" data-action="scan">${icon('scan')}Find an artwork</button></div>
    ${!search ? `<section class="hero" aria-label="Featured exhibition"><div class="hero-copy"><span class="eyebrow"><i class="status-dot"></i> A little curiosity goes a long way</span><h2>Follow your<br/><em>curiosity.</em></h2><p>A work that stops you. A story that stays.<br/>Find your own way through the museum.</p><button class="button primary" data-action="plan">Plan my visit ${icon('arrow')}</button></div><div class="hero-image"><img src="/assets/riverlight.svg" alt="Riverlight: an abstract landscape in sage green, sand and terracotta"/><span class="image-label">${icon('image')}In the spotlight</span><div class="artwork-caption"><div><strong>Riverlight</strong><span>Elena Marr, 2024 · Ways of Seeing</span></div><button class="round-button" data-action="art" data-id="riverlight" aria-label="Explore Riverlight">${icon('diagonal')}</button></div></div></section>
    <div class="museum-strip"><div class="museum-name"><span class="museum-icon">${icon('museum')}</span><div><h3>${esc(state.museum.name)}</h3><p>Ways of Seeing · A contemporary collection</p></div></div><div class="museum-details"><span><i class="status-dot"></i>Sample museum</span><span>${icon('map')}5 rooms to explore</span><a class="text-button" href="#explore">View museum ${icon('arrow')}</a></div></div>` : ''}
    <section><div class="section-heading"><div><h2>${search ? `Results for “${esc(search)}”` : 'Something might catch your eye'}</h2><p>${search ? `${filtered.length} work${filtered.length !== 1 ? 's' : ''} in the sample collection` : 'A few starting points. See where they take you.'}</p></div>${search ? '<button class="text-button" data-action="clear-search">Clear search</button>' : '<a class="text-button" href="#explore">Explore all <span aria-hidden="true">↗</span></a>'}</div><div class="filters" aria-label="Filter by medium">${['All works', 'Painting', 'Sculpture', 'Print', 'Drawing', 'Installation'].map(c => `<button class="chip ${category === c ? 'active' : ''}" data-action="category" data-value="${c}" aria-pressed="${category === c}">${c}</button>`).join('')}</div><div class="art-grid ${showAll ? 'all-artworks' : ''}">${filtered.length ? (showAll ? filtered : filtered.slice(0, 4)).map(artCard).join('') : emptyState('A different starting point?', 'No artworks match this search. Try an artist, a medium, or an interest such as nature.', '<button class="button secondary" data-action="reset-filters">Show all works</button>', 'search')}</div></section>
    <section class="tour-banner"><div class="tour-banner-copy"><span class="compass">${icon('compass')}</span><div><h3>A visit that feels like you.</h3><p>Your interests. Your pace. A little room for the unexpected.</p></div></div><button class="button secondary" data-action="plan">Make it personal ${icon('arrow')}</button></section>`;
}
function miniArt(art) { return `<article class="mini-art"><img src="${art.image}" alt=""/><div><h3><button data-action="art" data-id="${art.id}">${esc(art.title)}</button></h3><p>${esc(art.artist)}<br/>Room ${art.room} · ${art.minutes} min</p></div><button data-action="art" data-id="${art.id}" aria-label="View ${esc(art.title)}">${icon('arrow')}</button></article>`; }
function explorePage() {
  const nearby = state.artworks.filter(a => !room || a.room === room);
  return `<div class="page-heading actions-heading"><div><span class="eyebrow">${icon('pin')}Northbank Gallery · Sample museum</span><h1 style="margin-top:12px">Find your own way.</h1><p>A little direction, plenty of room to wander.</p></div><button class="button primary" data-action="plan">${icon('compass')}${routePlan ? 'Adjust tour' : 'Plan my visit'}</button></div>
  <div class="explore-layout"><section class="panel"><div class="panel-header"><h2>The gallery, at a glance</h2><span>Illustrative floor plan</span></div><div class="map"><div class="map-grid">${['01', '02', '03'].map(r => mapRoom(r)).join('')}<div class="map-corridor">GALLERY WALKWAY</div>${mapRoom('04')}<div class="map-entrance">${icon('arrow')}Entrance & information</div>${mapRoom('05')}</div><div class="map-legend"><span><i></i>Step-free rooms</span><span><i class="sand"></i>Stairs required</span><span>${icon('pin')}Select a room to explore</span></div></div><div class="map-caption">${icon('info')}Manual room selection · Live indoor positioning is not connected.</div></section>
  <section class="panel"><div class="panel-header"><h2>${room ? `Inside Room ${room}` : 'Around the gallery'}</h2>${room ? '<button class="text-button" data-action="room" data-id="">Show all</button>' : `<span>${nearby.length} artworks</span>`}</div><div class="nearby-list">${nearby.map(miniArt).join('')}</div></section></div>
  ${routePlan ? routePanel() : `<div class="tour-banner"><div class="tour-banner-copy"><span class="compass">${icon('sparkles')}</span><div><h3>Not sure where to begin?</h3><p>Tell us what you love. We’ll help you find a starting point.</p></div></div><button class="button secondary" data-action="plan">Create a route ${icon('arrow')}</button></div>`}`;
}
function mapRoom(id) { const labels = { '01': 'Colour & landscape', '02': 'Sculpture', '03': 'Shape & reflection', '04': 'The natural world', '05': 'Installation' }; return `<button class="map-room ${room === id ? 'selected' : ''} ${id === '05' ? 'stairs' : ''}" data-action="room" data-id="${id}" aria-pressed="${room === id}" aria-label="Room ${id}: ${labels[id]}${id === '05' ? ', stairs required' : ''}"><strong>${id}</strong><small>${labels[id]}</small>${icon(id === '05' ? 'stairs' : 'image')}</button>`; }
function routePanel() {
  const finished = routePlan.artworkIds.every(id => completed.has(id) || skipped.has(id));
  return `<section class="panel route-panel"><div class="route-heading"><div><h2>Your route, your rhythm.</h2><p>${routePlan.artworkIds.length} stops · About ${routePlan.minutes} min, including transitions · ${completed.size} explored</p></div><span class="pill">${icon(routePlan.stepFree ? 'check' : 'compass')}${routePlan.stepFree ? 'Step-free route' : 'Personalised for you'}</span></div>${routePlan.artworkIds.map((id, i) => { const a = artById(id); return `<div class="route-stop ${completed.has(id) ? 'done' : ''} ${skipped.has(id) ? 'skipped' : ''}"><span class="stop-number">${completed.has(id) ? icon('check') : i + 1}</span><img src="${a.image}" alt=""/><div class="stop-copy"><strong>${esc(a.title)}</strong><p>Room ${a.room} · ${a.minutes} min${skipped.has(id) ? ' · Skipped' : ''}</p></div><button class="text-button" data-action="art" data-id="${id}">View</button><button class="button small secondary" data-action="complete-stop" data-id="${id}">${completed.has(id) ? 'Undo' : 'Explored'}</button>${!completed.has(id) ? `<button class="text-button" data-action="skip-stop" data-id="${id}">${skipped.has(id) ? 'Restore' : 'Skip'}</button>` : ''}</div>`; }).join('')}<div class="route-actions"><button class="button secondary" data-action="cancel-route">End without saving</button><button class="button primary" data-action="finish-visit" ${!completed.size ? 'disabled' : ''}>${finished ? 'Finish visit' : 'Finish with explored works'} ${icon('check')}</button></div></section>`;
}
function guidePage() {
  return `<div class="page-intro"><span class="eyebrow">A conversation with the collection</span><h1>Every question opens a door.</h1><p>Follow a detail, explore an idea, or simply ask where to begin.</p></div><div class="guide-layout"><section class="panel chat-panel"><div class="chat-header"><span class="guide-mark">${icon('sparkles')}</span><div><h2>Your Unframe guide</h2><p>Collection-grounded demo · Sources included</p></div></div><div class="chat-messages" id="chat-messages" role="log" aria-label="Conversation" aria-live="polite">${chatMessages()}</div><form class="chat-form" id="chat-form"><input name="question" aria-label="Ask your museum guide" placeholder="What catches your curiosity?" required maxlength="1000" autocomplete="off" ${sending ? 'disabled' : ''}/><button type="submit" aria-label="Send question" ${sending ? 'disabled' : ''}>${icon('send')}</button></form></section><aside class="panel guide-side"><h3>A little context.</h3><p>Your guide draws from this gallery’s collection notes. You stay in control of the conversation.</p><label for="guide-art">Focus on an artwork</label><select id="guide-art"><option value="">The whole collection</option>${state.artworks.map(a => `<option value="${a.id}" ${guideArt === a.id ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select><div class="notice">${icon('info')}This demo retrieves approved sample notes. Generative AI is not connected, and replies may not answer every question.</div><button class="text-button" data-action="feedback" style="margin-top:18px">${icon('chat')}Share feedback</button><button class="text-button" data-action="clear-chat" style="margin-top:12px">Start a new conversation</button></aside></div>`;
}
function chatMessages() {
  if (!messages.length) return `<div class="chat-welcome">${icon('sparkles')}<h2>Art starts a conversation.<br/>Let’s keep it going.</h2><p>You don’t need the right words. Just a question,<br/>an observation, or a little curiosity.</p><div class="prompts"><button data-action="prompt" data-value="Where should I start?">Where should I start?</button><button data-action="prompt" data-value="Tell me about Riverlight">Tell me about Riverlight</button><button data-action="prompt" data-value="I am interested in nature">Something inspired by nature</button><button data-action="prompt" data-value="Which rooms have step-free access?">Step-free access</button></div></div>`;
  return messages.map(m => `<div class="message ${m.role}"><p>${esc(m.text)}</p>${m.sources?.length ? `<div class="source-list">${m.sources.map(s => s.artworkId ? `<button data-action="art" data-id="${s.artworkId}">${icon('book')}${esc(s.title)}</button>` : `<span>${icon('book')}${esc(s.title)}</span>`).join('')}</div>` : ''}</div>`).join('') + (sending ? '<p class="muted" style="font-size:11px" role="status">Looking through the collection notes…</p>' : '');
}
function scrollChat() { const box = document.querySelector('#chat-messages'); if (box) box.scrollTop = box.scrollHeight; }
async function askGuide(question) {
  if (sending || !question.trim()) return;
  sending = true; messages.push({ role: 'user', text: question }); navigate('guide'); render();
  try { const answer = await api('/guide', 'POST', { question, artworkId: guideArt || undefined }); messages.push({ role: 'assistant', ...answer }); }
  catch (error) { messages.push({ role: 'assistant', text: `I couldn’t retrieve the collection notes. ${error.message} Please try again.` }); }
  finally { sending = false; if (currentPage() === 'guide') { render(); document.querySelector('#chat-form input')?.focus({ preventScroll: true }); } }
}
function visitsPage() {
  return `<div class="page-intro"><span class="eyebrow">A collection of your own</span><h1>Some things stay with you.</h1><p>The works you loved, the paths you took, and a little space to reflect.</p></div><div class="tabs" aria-label="Visit sections"><button class="tab ${visitTab === 'saved' ? 'active' : ''}" data-action="visit-tab" data-value="saved" aria-pressed="${visitTab === 'saved'}">Saved artworks (${state.saved.length})</button><button class="tab ${visitTab === 'history' ? 'active' : ''}" data-action="visit-tab" data-value="history" aria-pressed="${visitTab === 'history'}">Past visits (${state.visits.length})</button></div>${visitTab === 'saved' ? `<div class="art-grid all-artworks">${state.saved.length ? state.saved.map(id => artById(id)).filter(Boolean).map(artCard).join('') : emptyState('Make room for a favourite.', 'Tap the bookmark on any artwork to keep it here. Build a collection that means something to you.', '<a class="button primary" href="#discover">Discover artworks</a>')}</div>` : state.visits.length ? state.visits.map(visit => `<article class="panel visit-card"><div class="visit-card-header"><h3>A day at Northbank</h3><small>${dateLabel(visit.date)}</small></div><span class="eyebrow" style="font-size:9px;margin-bottom:12px">Your visit reflection · Template-generated</span><p>${esc(visit.summary)}</p><div class="visit-thumbnails">${visit.artworkIds.map(id => artById(id)).filter(Boolean).map(a => `<button data-action="art" data-id="${a.id}" aria-label="Revisit ${esc(a.title)}"><img src="${a.image}" alt="${esc(a.title)}"/></button>`).join('')}</div></article>`).join('') : emptyState('Your story starts with a visit.', 'Create a route and mark the artworks you explore. Finish your visit to keep a reflection here when visit history is enabled.', '<button class="button primary" data-action="plan">Plan a visit</button>', 'history')}`;
}
function interestFields(selected) { return `<div class="interest-options">${interests.map(t => `<label class="interest-option"><input type="checkbox" name="interests" value="${t}" ${selected.includes(t) ? 'checked' : ''}/><span>${t}</span></label>`).join('')}</div>`; }
function toggleField(name, title, description, checked) { return `<label class="toggle-row"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}/></label>`; }
function profilePage() {
  const p = state.preferences;
  return `<div class="page-intro"><span class="eyebrow">A little more you</span><h1>Make yourself at home.</h1><p>A few preferences help shape your visit. You can change them whenever you like.</p></div><form id="preferences-form"><div class="settings-grid"><section class="panel settings-panel"><h2>Your starting points</h2><label class="field"><span>What should we call you?</span><input name="name" value="${esc(p.name)}" required maxlength="40" autocomplete="given-name"/></label><div class="field"><span>Your interests</span>${interestFields(p.interests)}<small>Choose a few, or leave room for everything.</small></div><label class="field"><span>Usual visit length: <output id="duration-label">${p.duration}</output> minutes</span><input type="range" name="duration" min="10" max="120" step="5" value="${p.duration}"/><span class="range-labels"><span>10 min</span><span>2 hours</span></span></label></section><section class="panel settings-panel"><h2>Comfort & control</h2>${toggleField('stepFree', 'Prefer step-free routes', 'Exclude artworks in rooms that require stairs.', p.stepFree)}${toggleField('largeText', 'Larger text', 'A little more breathing room for reading.', p.largeText)}${toggleField('reducedMotion', 'Reduce motion', 'Keep interface transitions still.', p.reducedMotion)}${toggleField('saveHistory', 'Remember my visits', 'Save future completed visits on this device’s local server. Turning this off does not delete existing visits.', p.saveHistory)}<button type="button" class="text-button danger-button" data-action="clear-history">Delete saved visit history</button></section></div><div class="settings-footer"><button class="button primary" type="submit">Save preferences ${icon('check')}</button></div></form><div class="notice" style="margin-top:23px">${icon('shield')}Your data stays in this local prototype. No location is collected and no account is required. <a href="#admin" style="text-decoration:underline">Open museum workspace</a></div>`;
}
function adminPage() {
  return `<div class="page-intro"><span class="eyebrow">Behind the experience</span><h1>A thoughtful collection needs care.</h1><p>Keep interpretation accurate, sources visible, and visitors heard.</p></div><div class="notice">${icon('shield')}Local demonstration workspace · No staff authentication is configured. This server is intended for a single local user, not public deployment.</div><div class="admin-stats"><div class="panel stat"><span class="eyebrow">Collection works</span><strong>${state.artworks.length}</strong></div><div class="panel stat"><span class="eyebrow">Gallery rooms</span><strong>5</strong></div><div class="panel stat"><span class="eyebrow">Open feedback</span><strong>${state.feedback.filter(f => f.status === 'Open').length}</strong></div></div><div class="tabs"><button class="tab ${adminTab === 'collection' ? 'active' : ''}" data-action="admin-tab" data-value="collection">Collection & sources</button><button class="tab ${adminTab === 'feedback' ? 'active' : ''}" data-action="admin-tab" data-value="feedback">Visitor feedback (${state.feedback.length})</button></div>${adminTab === 'collection' ? `<section class="panel"><table class="admin-table"><thead><tr><th scope="col">Artwork</th><th scope="col">Room</th><th scope="col">Content</th><th scope="col"><span class="muted">Manage</span></th></tr></thead><tbody>${state.artworks.map(a => `<tr><td><div class="admin-work"><img src="${a.image}" alt=""/><div><strong>${esc(a.title)}</strong><small>${esc(a.artist)}</small></div></div></td><td>Room ${a.room}</td><td><span class="pill">${a.updatedAt ? 'Updated' : 'Sample note'}</span></td><td><button class="button small secondary" data-action="edit-art" data-id="${a.id}">${icon('edit')}Edit</button></td></tr>`).join('')}</tbody></table></section>` : `<section class="panel">${state.feedback.length ? state.feedback.map(f => `<article class="feedback-card"><div class="feedback-card-header"><span class="pill">${esc(f.type)} · ${esc(f.status)}</span><small>${dateLabel(f.date)}</small></div>${f.artworkId ? `<small>Regarding ${esc(artById(f.artworkId)?.title || 'an artwork')}</small>` : ''}<p>${esc(f.message)}</p><button class="text-button" data-action="resolve-feedback" data-id="${f.id}">${icon('check')}${f.status === 'Open' ? 'Mark resolved' : 'Reopen feedback'}</button></article>`).join('') : emptyState('A place for every perspective.', 'Visitor reports and suggestions will appear here. You can review them, update collection notes and mark the feedback resolved.', '', 'chat')}</section>`}`;
}

function openDialog(html, className = '') {
  closeDialog(); lastFocus = document.activeElement;
  modalRoot.innerHTML = `<dialog class="dialog ${className}" aria-labelledby="dialog-title">${html}</dialog>`;
  const dialog = modalRoot.querySelector('dialog'); dialog.showModal();
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
}
function closeDialog() {
  if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = undefined; }
  if (speaking) { window.speechSynthesis?.cancel(); speaking = false; }
  const dialog = modalRoot.querySelector('dialog'); if (dialog) { dialog.close(); modalRoot.innerHTML = ''; if (lastFocus?.isConnected) lastFocus.focus(); }
}
const dialogHeader = title => `<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="close-button" data-action="close" aria-label="Close dialog">${icon('close')}</button></div>`;
function artDialog(id) {
  const a = artById(id); if (!a) return;
  openDialog(`<div class="dialog-topline"><span>${icon('museum')}Northbank Gallery · Sample collection</span><button class="close-button" data-action="close" aria-label="Close artwork">${icon('close')}</button></div><div class="art-detail-layout"><img class="art-detail-image" src="${a.image}" alt="${esc(a.title)}"/><div class="art-detail-copy"><span class="eyebrow">${esc(a.category)} · Room ${a.room}</span><h2 id="dialog-title">${esc(a.title)}</h2><div class="artist">${esc(a.artist)}, ${a.year}</div><p>${esc(a.description)}</p><p>${esc(a.detail)}</p><div class="source">${icon('book')}${esc(a.source)}<br/>Fictional artwork and artist created for this prototype.</div><div class="art-detail-buttons"><button class="button primary small" data-action="ask-art" data-id="${id}">${icon('sparkles')}Ask the guide</button><button class="button secondary small" data-action="listen" data-id="${id}">${icon('headphones')}Listen</button><button class="button secondary small" data-action="save" data-id="${id}" aria-pressed="${state.saved.includes(id)}">${icon('bookmark')}${state.saved.includes(id) ? 'Saved' : 'Save'}</button></div><button class="text-button" data-action="feedback" data-id="${id}">${icon('chat')}Something to share? Send feedback</button></div></div>`, 'art-dialog');
}
function planDialog() {
  const p = routePlan || state.preferences;
  openDialog(`${dialogHeader('A visit that feels like you.')}<form class="dialog-body" id="plan-form"><p>A few starting points. We’ll leave room for discovery.</p><label class="field"><span>How much time do you have?</span><select name="duration">${[15, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${n === p.duration ? 'selected' : ''}>${n} minutes${n === 30 ? ' · A little wander' : n === 60 ? ' · Take your time' : ''}</option>`).join('')}</select></label><div class="field"><span>What draws you in?</span>${interestFields(p.interests)}</div>${toggleField('stepFree', 'Step-free route', 'Keep your route to rooms without stairs.', p.stepFree)}<div class="notice" style="margin-top:18px">${icon('compass')}Routes use sample room order and allow two minutes between works. Explore at your own pace; the estimate is a starting point.</div><div class="form-error" role="alert"></div><div class="dialog-actions"><button class="button secondary" type="button" data-action="close">Maybe later</button><button class="button primary" type="submit">Find my route ${icon('arrow')}</button></div></form>`);
}
function scanDialog() {
  openDialog(`${dialogHeader('Find the work in front of you.')}<div class="dialog-body"><p>Choose a photo as a reference, then select its matching work from the sample collection.</p><div class="scan-upload">${icon('scan')}<label for="art-photo">Add a photo from your camera or library</label><input id="art-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"/></div><img id="scan-preview" class="scan-preview" alt="Your selected artwork reference" hidden/><label class="field"><span>Select the matching artwork</span><select id="scan-match">${state.artworks.map(a => `<option value="${a.id}">${esc(a.title)} — ${esc(a.artist)}</option>`).join('')}</select></label><div class="notice">${icon('info')}Photo identification is not connected in this prototype. Your photo stays in your browser and is not uploaded.</div><div class="dialog-actions"><button class="button primary" data-action="scan-result">Open artwork ${icon('arrow')}</button></div></div>`);
}
function feedbackDialog(id = '') {
  openDialog(`${dialogHeader('Your perspective matters.')}<form class="dialog-body" id="feedback-form"><p>${id ? `Share feedback about ${esc(artById(id).title)}.` : 'Help us make this experience more thoughtful.'} Your report will appear in the museum workspace.</p><input type="hidden" name="artworkId" value="${esc(id)}"/><label class="field"><span>What would you like to share?</span><select name="type"><option>Accuracy</option><option>Accessibility</option><option>Suggestion</option></select></label><label class="field"><span>Your feedback</span><textarea name="message" required minlength="5" maxlength="2000" rows="5" placeholder="Tell us what you noticed…"></textarea></label><div class="form-error" role="alert"></div><div class="dialog-actions"><button type="submit" class="button primary">Send feedback ${icon('send')}</button></div></form>`);
}
function editDialog(id) {
  const a = artById(id);
  openDialog(`${dialogHeader(`Edit ${esc(a.title)}`)}<form class="dialog-body" id="edit-form" data-id="${id}"><p>Changes update the artwork page and the guide’s collection notes.</p><label class="field"><span>Introduction</span><textarea name="description" required maxlength="5000" rows="4">${esc(a.description)}</textarea></label><label class="field"><span>Interpretation & looking prompts</span><textarea name="detail" required maxlength="5000" rows="5">${esc(a.detail)}</textarea></label><label class="field"><span>Source attribution</span><input name="source" required maxlength="5000" value="${esc(a.source)}"/></label><div class="form-error" role="alert"></div><div class="dialog-actions"><button class="button secondary" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save collection note ${icon('check')}</button></div></form>`);
}
function aboutDialog() {
  openDialog(`${dialogHeader('A new perspective, in progress.')}<div class="dialog-body"><p>Unframe is a working local prototype of a personal museum companion, inspired by the location-aware guidance of MONA’s The O.</p><ul class="about-list"><li><strong>A sample world.</strong> Northbank Gallery, its artists, artworks and interpretation are fictional. All six illustrations were created for this project.</li><li><strong>Honest guidance.</strong> The guide retrieves collection notes. It does not call an AI model. Visit reflections use a template.</li><li><strong>You’re in control.</strong> Indoor navigation uses manual room selection. The app does not collect your location or track companions.</li><li><strong>Local persistence.</strong> Preferences, bookmarks, feedback and optional visit history are saved on the local server. Multiple tabs share this workspace.</li><li><strong>Built to grow.</strong> Production authentication, museum integrations, real positioning, image recognition, generative AI and multilingual content require further development.</li></ul><div class="dialog-actions"><a href="#admin" class="button secondary" data-action="close">Museum workspace ${icon('arrow')}</a><button class="button primary" data-action="close">Keep exploring</button></div></div>`);
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const { action, id, value } = button.dataset;
  try {
    if (action === 'close') closeDialog();
    else if (action === 'art') artDialog(id);
    else if (action === 'plan') planDialog();
    else if (action === 'scan') scanDialog();
    else if (action === 'scan-result') { const match = document.querySelector('#scan-match').value; artDialog(match); }
    else if (action === 'about') aboutDialog();
    else if (action === 'category') { category = value; render(); }
    else if (action === 'clear-search') { search = ''; render(); }
    else if (action === 'reset-filters') { search = ''; category = 'All works'; render(); }
    else if (action === 'room') { room = id || null; render(); }
    else if (action === 'save') {
      button.disabled = true; state.saved = await api('/saved', 'POST', { artworkId: id });
      const saved = state.saved.includes(id); render();
      document.querySelectorAll(`[data-action="save"][data-id="${id}"]`).forEach(el => { el.classList.toggle('saved', saved); el.setAttribute('aria-pressed', String(saved)); el.setAttribute('aria-label', `${saved ? 'Unsave' : 'Save'} ${artById(id).title}`); if (!el.classList.contains('save-button')) el.innerHTML = `${icon('bookmark')}${saved ? 'Saved' : 'Save'}`; el.disabled = false; });
      toast(saved ? 'A new favourite, saved to My Visits.' : 'Artwork removed from your saved collection.');
    }
    else if (action === 'prompt') await askGuide(value);
    else if (action === 'ask-art') { closeDialog(); guideArt = id; await askGuide(`Tell me about ${artById(id).title}`); }
    else if (action === 'clear-chat') { messages = []; guideArt = ''; render(); }
    else if (action === 'visit-tab') { visitTab = value; render(); }
    else if (action === 'admin-tab') { adminTab = value; render(); }
    else if (action === 'complete-stop') { if (completed.has(id)) completed.delete(id); else { completed.add(id); skipped.delete(id); } render(); }
    else if (action === 'skip-stop') { if (skipped.has(id)) skipped.delete(id); else { skipped.add(id); completed.delete(id); } render(); }
    else if (action === 'cancel-route') { routePlan = null; completed.clear(); skipped.clear(); render(); toast('Route ended. There’s always another way to explore.'); }
    else if (action === 'finish-visit') {
      button.disabled = true; const visit = await api('/visits', 'POST', { artworkIds: [...completed] });
      if (visit.persisted) state.visits.unshift(visit);
      routePlan = null; completed.clear(); skipped.clear();
      if (visit.persisted) { visitTab = 'history'; navigate('visits'); toast('Your visit reflection is ready.'); }
      else { render(); openDialog(`${dialogHeader('A little space to reflect.')}<div class="dialog-body"><p>${esc(visit.summary)}</p><div class="notice">${icon('shield')}Visit history is off. This reflection has not been saved.</div></div>`); }
    }
    else if (action === 'feedback') feedbackDialog(id);
    else if (action === 'edit-art') editDialog(id);
    else if (action === 'resolve-feedback') { button.disabled = true; const f = state.feedback.find(f => f.id === id); const updated = await api(`/feedback/${id}`, 'PATCH', { status: f.status === 'Open' ? 'Resolved' : 'Open' }); Object.assign(f, updated); render(); toast(`Feedback ${updated.status.toLowerCase()}.`); }
    else if (action === 'clear-history') openDialog(`${dialogHeader('Clear your visit history?')}<div class="dialog-body"><p>This deletes all saved visit reflections from this local workspace. Your bookmarked artworks will stay.</p><div class="dialog-actions"><button class="button secondary" data-action="close">Keep history</button><button class="button terracotta" data-action="confirm-clear-history">Delete history</button></div></div>`);
    else if (action === 'confirm-clear-history') { await api('/visits', 'DELETE', {}); state.visits = []; closeDialog(); render(); toast('Visit history deleted.'); }
    else if (action === 'listen') {
      if (!('speechSynthesis' in window)) return toast('Audio is not supported in this browser. The full text is available here.');
      if (speaking) { speechSynthesis.cancel(); speaking = false; button.innerHTML = `${icon('headphones')}Listen`; return; }
      const a = artById(id), utterance = new SpeechSynthesisUtterance(`${a.title}, by ${a.artist}. ${a.description} ${a.detail}`);
      utterance.lang = 'en-AU'; utterance.rate = .9; speaking = true; button.innerHTML = `${icon('close')}Stop audio`;
      const stop = () => { speaking = false; if (button.isConnected) button.innerHTML = `${icon('headphones')}Listen`; };
      utterance.onend = stop; utterance.onerror = () => { stop(); toast('Audio is unavailable. You can read the collection note here.'); }; speechSynthesis.speak(utterance);
    }
  } catch (error) { button.disabled = false; toast(error.message); }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['search-form', 'chat-form', 'preferences-form', 'plan-form', 'feedback-form', 'edit-form'].includes(form.id)) return;
  event.preventDefault(); const data = new FormData(form);
  const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
  const errorBox = form.querySelector('.form-error'); if (errorBox) errorBox.textContent = '';
  try {
    if (form.id === 'search-form') { search = data.get('search').trim(); category = 'All works'; navigate('discover'); }
    if (form.id === 'chat-form') await askGuide(data.get('question').trim());
    if (form.id === 'preferences-form') {
      const values = { name: data.get('name'), interests: data.getAll('interests'), duration: Number(data.get('duration')) };
      for (const key of ['stepFree', 'largeText', 'reducedMotion', 'saveHistory']) values[key] = data.has(key);
      state.preferences = await api('/preferences', 'PATCH', values); render(); toast('Your preferences are saved. Make yourself at home.');
    }
    if (form.id === 'plan-form') {
      routePlan = await api('/routes', 'POST', { duration: Number(data.get('duration')), interests: data.getAll('interests'), stepFree: data.has('stepFree') });
      completed.clear(); skipped.clear(); closeDialog(); navigate('explore'); toast('Your route is ready. Take it at your own pace.');
    }
    if (form.id === 'feedback-form') { const feedback = await api('/feedback', 'POST', Object.fromEntries(data)); state.feedback.unshift(feedback); closeDialog(); render(); toast('Thank you. Your feedback is in the museum’s review queue.'); }
    if (form.id === 'edit-form') { const updated = await api(`/artworks/${form.dataset.id}`, 'PATCH', Object.fromEntries(data)); Object.assign(artById(updated.id), updated); closeDialog(); render(); toast('Collection note updated. The guide now uses this version.'); }
  } catch (error) { if (errorBox) errorBox.textContent = error.message; else toast(error.message); }
  finally { if (submit?.isConnected) submit.disabled = false; }
});
document.addEventListener('input', event => { if (event.target.name === 'duration') { const label = document.querySelector('#duration-label'); if (label) label.textContent = event.target.value; } });
document.addEventListener('change', event => {
  if (event.target.id === 'guide-art') guideArt = event.target.value;
  if (event.target.id === 'art-photo') {
    const file = event.target.files[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { toast('Choose a JPG, PNG or WebP image smaller than 10 MB.'); event.target.value = ''; return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(file); const preview = document.querySelector('#scan-preview'); preview.src = photoUrl; preview.hidden = false;
  }
});
window.addEventListener('hashchange', () => { closeDialog(); render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
try { state = await api('/state'); render(); }
catch { app.innerHTML = `<main class="initial-loading"><div style="text-align:center;padding:25px"><h1 style="font-size:32px;font-weight:400">Let’s reconnect.</h1><p style="font:14px/1.8 Arial;margin:18px 0">The local server is unavailable. Start it with npm start, then refresh.</p><button class="button primary" id="retry">Try again</button></div></main>`; document.querySelector('#retry').addEventListener('click', () => location.reload()); }
