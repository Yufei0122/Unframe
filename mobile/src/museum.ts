import metCollection from '../../shared/met-collection.json';
import gomaCollection from '../../shared/goma-collection.json';
import metGraph from '../../shared/met-graph.json';
import gomaGraph from '../../shared/goma-graph.json';
import metadata from '../../shared/museums.json';
import type { Artwork } from '../../shared/domain.js';

export type MuseumId = keyof typeof metadata;
export const museum = metadata.met;

export interface MuseumArtwork extends Artwork {
  medium: string;
  demoDistance: number;
  sourceUrl: string;
  chineseIntroduction: string;
  imageCredit?: string;
}

export const museumArtworks: MuseumArtwork[] = metCollection;
export const museums = {
  met: { ...metadata.met, artworks: metCollection as MuseumArtwork[], graph: metGraph },
  goma: { ...metadata.goma, artworks: gomaCollection as MuseumArtwork[], graph: gomaGraph },
};
export const allMuseumArtworks = Object.values(museums).flatMap(m => m.artworks);
export const museumForArtwork = (id: string) => Object.values(museums).find(m => m.artworks.some(a => a.id === id));

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function matchMuseum(coords: { latitude: number; longitude: number; accuracy: number | null }, museumId: MuseumId = 'met') {
  const selected = museums[museumId];
  const distance = distanceMeters(coords, selected);
  return { distance, nearby: distance <= selected.radius && coords.accuracy !== null && coords.accuracy >= 0 && coords.accuracy <= Math.min(500, selected.radius) };
}

export function nearestMuseum(coords: { latitude: number; longitude: number; accuracy: number | null }): MuseumId | undefined {
  return (Object.keys(museums) as MuseumId[]).filter(id => matchMuseum(coords, id).nearby)
    .sort((a, b) => matchMuseum(coords, a).distance - matchMuseum(coords, b).distance)[0];
}
