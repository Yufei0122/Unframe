import React, { type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParams } from '../model';
import { Icon, Notice, T, serif, type IconName } from '../ui';
import { useStore } from '../store';

export const useProfileNavigation = () => useNavigation<NativeStackNavigationProp<ProfileStackParams>>();
export const profileColors = { background: '#F5F1EB', card: '#FFFDFA', ink: '#28241F', muted: '#817971', gold: '#A47A3D', border: '#EAE3D9' };
export function ProfilePage({ title, subtitle, action, children }: { title: string; subtitle: string; action?: { icon: IconName; label: string; run: () => void }; children: React.ReactNode }) {
  const navigation = useProfileNavigation(), { storageError } = useStore();
  return <SafeAreaView edges={['top']} style={pageStyles.screen}><ScrollView testID="profile-subpage-scroll" contentContainerStyle={pageStyles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={pageStyles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile" onPress={() => navigation.popTo('ProfileHome')} style={pageStyles.iconButton}><Icon name="chevron-back-outline" size={26} color={profileColors.ink}/></Pressable>
      <T accessibilityRole="header" style={pageStyles.title}>{title}</T>
      {action ? <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.run} style={pageStyles.iconButton}><Icon name={action.icon} size={25} color={profileColors.ink}/></Pressable> : <View style={pageStyles.iconButton}/>}
    </View>
    <T style={pageStyles.subtitle}>{subtitle}</T>
    {storageError && <Notice>{storageError}</Notice>}
    {children}
  </ScrollView></SafeAreaView>;
}
export function ProfileSearch({ value, onChange, label, inputRef }: { value: string; onChange: (value: string) => void; label: string; inputRef?: RefObject<TextInput | null> }) {
  return <View style={pageStyles.search}><Icon name="search-outline" size={22} color="#6A6560"/><TextInput ref={inputRef} accessibilityLabel={label} placeholder={label} placeholderTextColor="#918A82" value={value} onChangeText={onChange} style={pageStyles.input} autoCorrect={false}/>{!!value && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange('')} style={pageStyles.clear}><Icon name="close-outline" size={20}/></Pressable>}</View>;
}
export function ProfileFilters<T extends string>({ items, value, onChange }: { items: { label: T; icon?: IconName }[]; value: T; onChange: (value: T) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pageStyles.filters}>{items.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`Filter: ${item.label}`} accessibilityState={{ selected: value === item.label }} aria-pressed={value === item.label} key={item.label} onPress={() => onChange(item.label)} style={[pageStyles.filter, value === item.label && pageStyles.filterActive]}>{item.icon && <Icon name={item.icon} color={value === item.label ? '#FFFDF8' : profileColors.gold} size={18}/>}<T style={[pageStyles.filterLabel, value === item.label && { color: '#FFFDF8' }]}>{item.label}</T></Pressable>)}</ScrollView>;
}
export function CollectionEmpty({ title, body, action, onPress }: { title: string; body: string; action?: string; onPress?: () => void }) {
  return <View style={pageStyles.empty}><Icon name="bookmark-outline" size={32} color={profileColors.gold}/><T accessibilityRole="header" style={pageStyles.emptyTitle}>{title}</T><T style={pageStyles.emptyBody}>{body}</T>{action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={pageStyles.emptyAction}><T style={{ color: '#FFFDF8', fontSize: 12 }}>{action}</T></Pressable>}</View>;
}
export const pageStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: profileColors.background }, content: { paddingHorizontal: 12, paddingTop: 17, paddingBottom: 25, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 2 }, iconButton: { width: 35, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontFamily: serif, fontSize: 28, lineHeight: 33, color: profileColors.ink, letterSpacing: -.7 },
  subtitle: { fontSize: 12, lineHeight: 18, color: '#716B64', textAlign: 'center', marginTop: -10, marginBottom: 3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, paddingHorizontal: 13, backgroundColor: profileColors.card, minHeight: 47 },
  input: { flex: 1, minWidth: 0, minHeight: 47, fontSize: 13, color: profileColors.ink, paddingVertical: 10 }, clear: { width: 28, height: 38, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: 7, alignItems: 'center', paddingVertical: 2 }, filter: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 13, borderRadius: 22, backgroundColor: '#EDE8E1' }, filterActive: { backgroundColor: '#AE8951' }, filterLabel: { fontSize: 11, lineHeight: 16, color: '#574F46' },
  card: { borderRadius: 14, backgroundColor: profileColors.card, borderWidth: 1, borderColor: '#FFFFFF', overflow: 'hidden' },
  empty: { alignItems: 'center', paddingVertical: 35, paddingHorizontal: 24, gap: 13, borderRadius: 16, backgroundColor: profileColors.card },
  emptyTitle: { fontFamily: serif, fontSize: 24, lineHeight: 29, textAlign: 'center', color: profileColors.ink }, emptyBody: { fontSize: 13, lineHeight: 20, color: profileColors.muted, textAlign: 'center' }, emptyAction: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: profileColors.gold },
});
