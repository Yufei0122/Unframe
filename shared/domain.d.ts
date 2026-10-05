export interface Artwork {
  id: string; title: string; artist: string; year: string; category: string;
  room: string; minutes: number; tags: string[]; color: string; image: string;
  description: string; detail: string; source: string; accessible: boolean; featured?: boolean;
}
export interface RouteOptions { duration?: number; interests?: string[]; stepFree?: boolean }
export interface RoutePlan { artworkIds: string[]; minutes: number; duration: number; interests: string[]; stepFree: boolean }
export interface GuideSource { title: string; artworkId?: string }
export interface GuideReply { text: string; sources: GuideSource[]; mode: 'catalogue' }
export function planRoute(artworks: Artwork[], options?: RouteOptions): RoutePlan;
export function guideReply(question: string, artworks: Artwork[], artworkId?: string): GuideReply;
