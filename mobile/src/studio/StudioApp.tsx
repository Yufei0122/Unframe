import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StudioMuseum, StudioState } from '../../../shared/studio-types';
import type { RootStackParams } from '../model';
import { Icon, T, serif, type IconName } from '../ui';
import { useStore } from '../store';
import { useMuseumLocation } from '../location';
import { StudioContext, museumName, type StudioTab, type StudioView } from './context';
import { useLocale } from './locale';
import { useAuth } from '../auth';
import { studioError, StudioError, studioRequest } from './api';
import { Action, Copy, palette, st } from './theme';
import { AccountScreen, CaseScreen, ContentScreen, EditScreen, EvidenceScreen, OverviewScreen, QueueScreen, ReleasesScreen, WorkflowScreen } from './screens';

export function StudioApp({ navigation }: NativeStackScreenProps<RootStackParams, 'Studio'>) {
  const { language, setLanguage, t } = useLocale(), { museumId } = useMuseumLocation(), { refreshCatalogue } = useStore();
  const auth = useAuth(), { session } = auth;
  const [data, setData] = useState<StudioState | null>(null);
  const [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false), [tab, setTab] = useState<StudioTab>('content');
  const [view, setView] = useState<StudioView>(null), [museum, setMuseumState] = useState<StudioMuseum | 'all'>(museumId), [museumMenu, setMuseumMenu] = useState(false), [workspaceMenu, setWorkspaceMenu] = useState(false);
  const mutation = useRef(false), scroll = useRef<ScrollView>(null), alive = useRef(true);
  const navigate = (next: StudioView, nextTab?: StudioTab) => { setView(next); if (nextTab) setTab(nextTab); setError(null); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const exit = useCallback(() => { alive.current = false; setData(null); void refreshCatalogue(); navigation.popTo('MuseumSelect'); }, [navigation, refreshCatalogue]);
  const refresh = useCallback(async () => {
    const token = auth.getSession()?.token;
    if (!token) return;
    try {
      const result = await studioRequest<StudioState>('/studio/state', token);
      if (alive.current && token === auth.getSession()?.token) { setData(result); setError(null); }
    } catch (error) {
      if (alive.current && token === auth.getSession()?.token) {
        if (error instanceof StudioError && error.code === 'AUTH_REQUIRED') await auth.signOut();
        else if (error instanceof StudioError && ['STUDIO_FORBIDDEN', 'PERMISSION_CHANGED'].includes(error.code)) await auth.refreshSession().catch(() => {});
        setError(error);
      }
    }
  }, [auth.getSession, auth.signOut, auth.refreshSession]);
  useEffect(() => {
    if (!session?.user.canAccessStudio) { setData(null); navigation.popTo('MuseumSelect'); }
    else void refresh();
  }, [session?.token, session?.user.canAccessStudio, session?.user.role, refresh, navigation]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const logout = async () => { const pending = auth.signOut(); exit(); await pending; };
  const back = () => navigate(view?.type === 'evidence' ? { type: 'case', id: view.id } : null);
  useEffect(() => { const handler = BackHandler.addEventListener('hardwareBackPress', () => { if (view) { back(); return true; } return false; }); return () => handler.remove(); });
  async function mutate<R>(path: string, body: object, method?: string): Promise<R | null> {
    const token = auth.getSession()?.token;
    if (!token || mutation.current) return null;
    mutation.current = true; setBusy(true); setError(null);
    try {
      const result = await studioRequest<R>(path, token, body, method);
      if (!alive.current || auth.getSession()?.token !== token) return null;
      const next = await studioRequest<StudioState>('/studio/state', token);
      if (!alive.current || auth.getSession()?.token !== token) return null;
      setData(next);
      if (path === '/studio/releases') await refreshCatalogue();
      return result;
    } catch (error) {
      if (auth.getSession()?.token === token) {
        if (error instanceof StudioError && error.code === 'AUTH_REQUIRED') await auth.signOut();
        else if (error instanceof StudioError && ['STUDIO_FORBIDDEN', 'PERMISSION_CHANGED'].includes(error.code)) await auth.refreshSession().catch(() => {});
        else if (error instanceof StudioError && ['VERSION_CONFLICT', 'STAGE_INVALID', 'PUBLICATION_CONFLICT'].includes(error.code)) await refresh();
        setError(error);
      }
      return null;
    } finally { mutation.current = false; setBusy(false); }
  }
  if (!session?.user.canAccessStudio) return <SafeAreaView style={[st.screen, { justifyContent: 'center' }]}><ActivityIndicator color={palette.green}/></SafeAreaView>;
  if (!data) return <SafeAreaView style={[st.screen, { justifyContent: 'center', padding: 25, gap: 20 }]}>{error ? <><Copy>{studioError(error, language)}</Copy><Action label={t('Try again', '重试')} onPress={() => { void refresh(); }}/></> : <ActivityIndicator color={palette.green}/>}<Action secondary label={t('Back to visitor', '返回访客界面')} onPress={exit}/></SafeAreaView>;
  const cases = data.cases.filter(item => museum === 'all' || item.museumId === museum), artworks = data.artworks.filter(item => museum === 'all' || item.museumId === museum);
  const item = view && 'id' in view ? data.cases.find(item => item.id === view.id) : undefined;
  const art = view?.type === 'edit' ? data.artworks.find(art => art.id === view.artworkId) : undefined;
  const tabs: { id: StudioTab; icon: IconName; selectedIcon: IconName; label: string }[] = [
    { id: 'overview', icon: 'home-outline', selectedIcon: 'home', label: t('Overview', '总览') },
    { id: 'review', icon: 'clipboard-outline', selectedIcon: 'clipboard', label: t('Review', '审核') },
    { id: 'content', icon: 'layers-outline', selectedIcon: 'layers', label: t('Content', '内容') },
    { id: 'workflow', icon: 'albums-outline', selectedIcon: 'albums', label: t('Workflow', '协作') },
  ];
  return <StudioContext.Provider value={{ data, cases, artworks, museum, setMuseum: setMuseumState, tab, view, navigate, busy, mutate, refresh, logout, exit }}><SafeAreaView edges={['top', 'bottom']} style={st.screen}>
    <View style={[st.between, { minHeight: 66, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: palette.border, gap: 6 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Switch workspace', '切换工作区')} onPress={() => setWorkspaceMenu(true)} style={[st.row, { minHeight: 44, gap: 3, flex: 1, minWidth: 0 }]}><T numberOfLines={1} style={{ flexShrink: 1, fontFamily: serif, fontSize: 19, letterSpacing: -.7, color: palette.green }}>unframe studio</T><Icon name="chevron-down" size={12}/></Pressable>
      <View style={[st.row, { gap: 5 }]}><Pressable accessibilityRole="button" accessibilityLabel={t('Choose studio museum', '选择审核馆区')} onPress={() => setMuseumMenu(true)} style={[st.row, { minHeight: 44, gap: 3, paddingHorizontal: 5 }]}><T style={{ fontSize: 11 }}>{museumName(museum, language === 'zh')}</T><Icon name="chevron-down" size={12}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={language === 'en' ? '中文' : 'English'} onPress={() => setLanguage(language === 'en' ? 'zh' : 'en')} style={{ minHeight: 44, justifyContent: 'center', padding: 4 }}><T style={{ fontSize: 11, color: palette.muted }}>{language === 'en' ? '中文' : 'EN'}</T></Pressable><Pressable accessibilityRole="button" accessibilityLabel={t('Workspace account', '工作区账号')} onPress={() => navigate({ type: 'account' })} style={{ minHeight: 44, minWidth: 30, justifyContent: 'center' }}><View style={{ width: 28, height: 28, borderRadius: 18, backgroundColor: '#A0AE95', alignItems: 'center', justifyContent: 'center' }}><T style={{ color: 'white', fontSize: 12 }}>{data.user.name.slice(0, 2).toUpperCase()}</T></View></Pressable></View>
    </View>
    {view && <Pressable accessibilityRole="button" accessibilityLabel={t('Back', '返回')} onPress={back} style={[st.row, { minHeight: 42, paddingHorizontal: 20 }]}><Icon name="arrow-back" size={19}/><Copy>{view.type === 'evidence' ? t('Review case', '审核详情') : t('Back', '返回')}</Copy></Pressable>}
    {error != null && <View accessibilityRole="alert" style={st.error}><Copy>{studioError(error, language)}</Copy><Pressable accessibilityRole="button" accessibilityLabel={t('Refresh workspace', '刷新工作区')} onPress={() => { void refresh(); }} style={{ minHeight: 32, justifyContent: 'center' }}><Copy>{t('Refresh', '刷新')}</Copy></Pressable></View>}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={st.content}>
      {view?.type === 'queue' ? <QueueScreen key={view.filter} initialFilter={view.filter}/> : view?.type === 'case' && item ? <CaseScreen key={item.id} item={item}/> : view?.type === 'evidence' && item ? <EvidenceScreen key={`${item.id}-${item.version}`} item={item}/> : view?.type === 'edit' && art ? <EditScreen key={`${art.id}-${view.caseId || 'new'}`} art={art} previous={data.cases.find(item => item.id === view.caseId)}/> : view?.type === 'account' ? <AccountScreen/> : view?.type === 'releases' ? <ReleasesScreen/> : tab === 'overview' ? <OverviewScreen/> : tab === 'review' ? <QueueScreen/> : tab === 'workflow' ? <WorkflowScreen/> : <ContentScreen/>}
    </ScrollView>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, paddingTop: 9, paddingBottom: 10 }}>{tabs.map(item => <Pressable accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} aria-selected={tab === item.id} key={item.id} onPress={() => navigate(null, item.id)} style={{ flex: 1, minHeight: 47, gap: 4, alignItems: 'center', justifyContent: 'center' }}><Icon name={tab === item.id ? item.selectedIcon : item.icon} size={21} color={tab === item.id ? palette.green : palette.muted}/><T style={{ fontSize: 10, lineHeight: 16, color: tab === item.id ? palette.green : palette.muted, fontWeight: tab === item.id ? '600' : '400' }}>{item.label}</T></Pressable>)}</View>
    <Modal visible={museumMenu} transparent animationType="fade" onRequestClose={() => setMuseumMenu(false)}><View style={{ flex: 1, backgroundColor: '#19272270', justifyContent: 'center', padding: 30 }}><View style={st.card}>{(['all', 'met', 'goma', 'northbank'] as const).map(id => <Action key={id} secondary label={museumName(id, language === 'zh')} onPress={() => { setMuseumState(id); setMuseumMenu(false); navigate(null); }}/>) }<Action label={t('Close', '关闭')} onPress={() => setMuseumMenu(false)}/></View></View></Modal>
    <Modal visible={workspaceMenu} transparent animationType="fade" onRequestClose={() => setWorkspaceMenu(false)}><View style={{ flex: 1, backgroundColor: '#19272270', justifyContent: 'center', padding: 30 }}><View style={st.card}><Copy>{t('Choose your workspace', '选择工作区')}</Copy><Action secondary label={t('Visitor · Unframe', '访客端 · Unframe')} onPress={() => { setWorkspaceMenu(false); exit(); }}/><Action label={t('Continue in Studio', '继续使用审核端')} onPress={() => setWorkspaceMenu(false)}/></View></View></Modal>
  </SafeAreaView></StudioContext.Provider>;
}
