import collection from '../shared/collection.json' with { type: 'json' };

export const artworks = collection;

export function initialState() {
  return {
    museum: { id: 'northbank', name: 'Northbank Gallery', city: 'Brisbane', subtitle: 'A space for curious minds', exhibition: 'Ways of Seeing', dates: 'A contemporary collection', demo: true },
    artworks: structuredClone(artworks),
    preferences: { name: 'Alex', interests: ['Nature', 'Colour'], duration: 30, stepFree: false, largeText: false, reducedMotion: false, saveHistory: true },
    saved: [], visits: [], feedback: []
  };
}
