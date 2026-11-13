import { createContext, useContext } from 'react';
import type { StudioArtwork, StudioCase, StudioMuseum, StudioState } from '../../../shared/studio-types';

export type StudioTab = 'overview' | 'review' | 'content' | 'workflow';
export type StudioView = { type: 'case' | 'evidence'; id: string } | { type: 'edit'; artworkId: string; caseId?: string } | { type: 'queue'; filter: 'pending' | 'priority' | 'sources' | 'today' } | { type: 'account' | 'releases' } | null;
export interface Controller {
  data: StudioState; cases: StudioCase[]; artworks: StudioArtwork[]; museum: StudioMuseum | 'all';
  setMuseum: (value: StudioMuseum | 'all') => void; tab: StudioTab; view: StudioView;
  navigate: (view: StudioView, tab?: StudioTab) => void; busy: boolean;
  mutate: <T>(path: string, body: object, method?: string) => Promise<T | null>;
  refresh: () => Promise<void>; logout: () => Promise<void>; exit: () => void;
}
export const StudioContext = createContext<Controller | null>(null);
export function useStudio() { const value = useContext(StudioContext); if (!value) throw new Error('Studio is required'); return value; }
export const museumName = (id: string, zh: boolean) => ({ met: zh ? '大都会' : 'The Met', goma: 'GOMA', northbank: zh ? '北岸示例馆' : 'Northbank', all: zh ? '全部馆区' : 'All museums' }[id] || id);
export function caseTitle(item: StudioCase, zh: boolean) { const fields: Record<string, [string, string]> = { year: ['Date correction', '作品年份纠错'], description: ['Label update', '作品解说更新'], detail: ['Interpretation update', '详细解说更新'], chineseIntroduction: ['Chinese introduction', '中文解说修订'], sourceUrl: ['Source update', '资料来源更新'], imageCredit: ['Image credit', '图像署名补充'] }; return fields[item.field]?.[zh ? 1 : 0] || item.field; }
export const fieldLabel = (field: string, zh: boolean) => ({ year: ['Date', '创作年份'], description: ['Introduction', '作品简介'], detail: ['Interpretation', '详细解说'], chineseIntroduction: ['Chinese introduction', '中文解说'], sourceUrl: ['Source URL', '来源链接'], imageCredit: ['Image credit', '图像署名'] }[field]?.[zh ? 1 : 0] || field);
export const stageLabel = (stage: string, zh: boolean) => ({ review: ['Initial review', '初审中'], verify: ['Verification', '复核中'], ready: ['Ready', '待发布'], published: ['Published', '已发布'], returned: ['Returned', '已退回'] }[stage]?.[zh ? 1 : 0] || stage);
