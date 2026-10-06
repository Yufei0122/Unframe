import type { ImageSourcePropType } from 'react-native';
import { museumImages } from './assets';
import { museums, type MuseumId } from './museum';

export type CityId = 'new-york' | 'brisbane';
export type MuseumPlace = {
  id: string; city: CityId; name: string; shortName: string; title: string;
  area: string; description: string; latitude: number; longitude: number;
  image: ImageSourcePropType; credit: string; website: string; demoMuseumId?: MuseumId;
};
// Discovery locations are separate from the two AI artwork catalogues.
// Building coordinates and image/source provenance: MUSEUM-DISCOVERY.md.
export const museumPlaces: MuseumPlace[] = [
  { id: 'met', city: 'new-york', name: museums.met.name, shortName: 'The Met', title: 'The Metropolitan\nMuseum of Art', area: 'Upper East Side, New York', description: 'Extraordinary art experiences\nare closer than you think.', latitude: museums.met.latitude, longitude: museums.met.longitude, image: museumImages.met, credit: 'The Met exterior · Alvin David / Unsplash', website: 'https://www.metmuseum.org/plan-your-visit', demoMuseumId: 'met' },
  { id: 'guggenheim', city: 'new-york', name: 'Solomon R. Guggenheim Museum', shortName: 'Guggenheim', title: 'Solomon R.\nGuggenheim\nMuseum', area: 'Upper East Side, New York', description: 'Modern art meets the spiralling\narchitecture of Frank Lloyd Wright.', latitude: 40.78306, longitude: -73.95889, image: require('../assets/guggenheim-exterior.jpg'), credit: 'Exterior photograph · Guggenheim', website: 'https://www.guggenheim.org/plan-your-visit' },
  { id: 'moma', city: 'new-york', name: 'The Museum of Modern Art', shortName: 'MoMA', title: 'The Museum\nof Modern Art', area: 'Midtown Manhattan, New York', description: 'Find a new perspective\nthrough modern and contemporary art.', latitude: 40.7617, longitude: -73.9775, image: require('../assets/moma-exterior.jpg'), credit: 'MoMA entrance · Photo: Noah Kalina', website: 'https://www.moma.org/visit/' },
  { id: 'goma', city: 'brisbane', name: 'Gallery of Modern Art', shortName: 'GOMA', title: 'Gallery of\nModern Art', area: 'South Brisbane, Queensland', description: 'A different perspective,\non the banks of the river.', latitude: museums.goma.latitude, longitude: museums.goma.longitude, image: museumImages.goma, credit: 'Exterior · M Sherwood © QAGOMA', website: 'https://www.qagoma.qld.gov.au/visit/', demoMuseumId: 'goma' },
  { id: 'qag', city: 'brisbane', name: 'Queensland Art Gallery', shortName: 'QAG', title: 'Queensland\nArt Gallery', area: 'South Brisbane, Queensland', description: 'Australian, Asian and international art\nat the Queensland Cultural Centre.', latitude: -27.472733, longitude: 153.018453, image: require('../assets/qag-exterior.jpg'), credit: 'Exterior · M Sherwood © QAGOMA', website: 'https://www.qagoma.qld.gov.au/visit/' },
  { id: 'kurilpa', city: 'brisbane', name: 'Queensland Museum Kurilpa', shortName: 'Queensland Museum', title: 'Queensland\nMuseum Kurilpa', area: 'South Brisbane, Queensland', description: 'Discover Queensland through\nnature, science and cultural stories.', latitude: -27.473412, longitude: 153.018420, image: require('../assets/kurilpa-exterior.jpg'), credit: 'Museum entrance · Queensland Museum', website: 'https://www.museum.qld.gov.au/kurilpa/plan-your-visit' },
  { id: 'mob', city: 'brisbane', name: 'Museum of Brisbane', shortName: 'Museum of Brisbane', title: 'Museum\nof Brisbane', area: 'Brisbane City Hall, Queensland', description: 'Art and stories of the city,\ninside Brisbane City Hall.', latitude: -27.46885, longitude: 153.023602, image: require('../assets/mob-exterior.jpg'), credit: 'City Hall · Museum of Brisbane', website: 'https://www.museumofbrisbane.com.au/visit-us/' },
];
export const cityPlaces = (city: CityId) => museumPlaces.filter(place => place.city === city);
