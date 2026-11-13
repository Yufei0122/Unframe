import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useAuth } from './auth';
import { Icon, T } from './ui';
import { useLocale } from './studio/locale';
import { studioError } from './studio/api';
import { Action, Copy, palette, st } from './studio/theme';

export function WorkspaceSwitch({ onStudio, onSignIn }: { onStudio: () => void; onSignIn: () => void }) {
  const { language, setLanguage, t } = useLocale(), auth = useAuth();
  const [accountMenu, setAccountMenu] = useState(false), [opening, setOpening] = useState(false), [error, setError] = useState<unknown>(null);
  const openStudio = async () => {
    if (opening) return;
    setOpening(true); setError(null);
    try { const user = await auth.refreshSession(); if (user?.canAccessStudio) onStudio(); }
    catch (error) { setError(error); }
    finally { setOpening(false); }
  };
  return <View style={{ backgroundColor: palette.bg, borderBottomWidth: 1, borderColor: palette.border }}>
    <View style={[st.between, { paddingHorizontal: 16, paddingVertical: 6, gap: 6 }]}>
      <View style={[st.row, { gap: 5, flex: 1, minWidth: 0 }]}><View style={[st.chip, { backgroundColor: palette.sage, minHeight: 36, paddingHorizontal: 12 }]}><Copy>{t('Visitor', '访客端')}</Copy></View>
        {auth.session?.user.canAccessStudio && <Pressable accessibilityRole="button" accessibilityLabel={t('Open Unframe Studio', '进入 Unframe 审核端')} aria-disabled={opening} disabled={opening} onPress={() => { void openStudio(); }} style={[st.chip, st.row, { gap: 5, minHeight: 36, paddingHorizontal: 10 }]}><Icon name="shield-checkmark-outline" size={15} color={palette.green}/><Copy>{t('Studio', '审核后台')}</Copy></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={auth.session ? t('Unframe account', 'Unframe 账号') : t('Sign in to Unframe', '登录 Unframe')} onPress={() => { if (auth.session) setAccountMenu(true); else onSignIn(); }} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 6, flexShrink: 1 }}><T numberOfLines={1} style={{ fontSize: 12, color: palette.green }}>{auth.session?.user.name || t('Sign in', '登录')}</T></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={language === 'en' ? '中文' : 'English'} onPress={() => setLanguage(language === 'en' ? 'zh' : 'en')} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 }}><Copy muted>{language === 'en' ? '中文' : 'EN'}</Copy></Pressable>
    </View>
    {error != null && <View accessibilityRole="alert" style={{ paddingHorizontal: 18, paddingBottom: 10 }}><Copy>{studioError(error, language)}</Copy></View>}
    <Modal visible={accountMenu} transparent animationType="fade" onRequestClose={() => setAccountMenu(false)}><View style={{ flex: 1, backgroundColor: '#19272270', justifyContent: 'center', padding: 25 }}><View style={[st.card, { maxWidth: 400, width: '100%', alignSelf: 'center' }]}><Copy style={{ fontWeight: '600' }}>{auth.session?.user.name}</Copy><Copy muted>{auth.session?.user.email}</Copy><Copy>{auth.session?.user.canAccessStudio ? t('Studio access enabled. You can switch workspaces from the main screen.', '已获审核后台权限，可在主界面切换工作区。') : t('Signed in to Unframe as a visitor.', '已登录 Unframe，使用访客界面。')}</Copy><Action secondary label={t('Sign out', '退出登录')} onPress={() => { setAccountMenu(false); void auth.signOut(); }}/><Action label={t('Close', '关闭')} onPress={() => setAccountMenu(false)}/></View></View></Modal>
  </View>;
}
