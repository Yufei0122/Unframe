export function planRoute(artworks, { duration = 30, interests = [], stepFree = false } = {}) {
  const budget = Math.max(10, Math.min(120, Number(duration) || 30));
  const ranked = artworks.filter(a => !stepFree || a.accessible).map(a => ({ ...a, score: a.tags.filter(t => interests.includes(t)).length })).sort((a, b) => b.score - a.score || a.room.localeCompare(b.room));
  const selected = [];
  let elapsed = 0;
  for (const art of ranked) {
    const cost = art.minutes + (selected.length ? 2 : 0);
    if (elapsed + cost <= budget) { selected.push(art); elapsed += cost; }
  }
  selected.sort((a, b) => a.room.localeCompare(b.room));
  return { artworkIds: selected.map(a => a.id), minutes: elapsed, duration: budget, interests, stepFree };
}

export function guideReply(question, artworks, artworkId) {
  const q = question.toLowerCase();
  const art = artworks.find(a => a.id === artworkId) || artworks.find(a => q.includes(a.title.toLowerCase()));
  if (art) return { text: `${art.title} — ${art.artist}, ${art.year}.\n\n${art.description}\n\n${art.detail}`, sources: [{ title: art.source, artworkId: art.id }], mode: 'catalogue' };
  if (/access|stairs|step.free|wheelchair/.test(q)) return { text: 'In this sample gallery, Rooms 01–04 have step-free access. Room 05 is reached by stairs. Enable “Step-free route” in the tour planner to exclude that room. These are demonstration map details; check access information with staff at a real museum.', sources: [{ title: 'Unframe sample gallery · Access information' }], mode: 'catalogue' };
  const matched = artworks.filter(a => a.tags.some(t => q.includes(t.toLowerCase())) || q.includes(a.category.toLowerCase()));
  if (matched.length) return { text: `You could start with ${matched.map(a => `“${a.title}” in Room ${a.room}`).join(', ')}.\n\n${matched[0].description}\n\nUse Plan my visit to turn your interests and available time into a route.`, sources: matched.map(a => ({ title: a.source, artworkId: a.id })), mode: 'catalogue' };
  if (/start|recommend|tour|route|hello|hi\b/.test(q)) return { text: 'Start with Riverlight in Room 01: its gentle shapes and colour make a welcoming introduction to Ways of Seeing. Then try Soft Form No. 3 in Room 02 for a different perspective.\n\nTell the tour planner how long you have and what interests you. You can always skip a stop or change your mind.', sources: [{ title: artworks[0].source, artworkId: artworks[0].id }], mode: 'catalogue' };
  return { text: 'I don’t have approved information to answer that question. This prototype retrieves sample collection notes; it is not connected to a generative AI model. Try an artwork title, ask about nature or sculpture, or check the step-free access information.', sources: [], mode: 'catalogue' };
}
