import React from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useStore } from './store';
import type { RootStackParams } from './model';
import type { Artwork } from '../../shared/domain.js';
import { images } from './assets';

export const c = { bg: '#F8F6F2', ink: '#192722', green: '#263F36', sage: '#E7EBE5', muted: '#72746F', border: '#E7E3DD', accent: '#A35E48', white: '#FFFFFF', sand: '#ECE8E0' };
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const useRootNavigation = () => useNavigation<NativeStackNavigationProp<RootStackParams>>();
export function T({ style, ...props }: TextProps) {
  const { state } = useStore();
  const flat = StyleSheet.flatten([s.text, style]);
  const scale = state.preferences.largeText ? 1.18 : 1;
  return <Text {...props} style={[flat, { fontSize: (flat.fontSize || 14) * scale, lineHeight: (flat.lineHeight || 22) * scale }]}/>;
}
export function Icon({ name, size = 21, color = c.ink }: { name: IconName; size?: number; color?: string }) { return <Ionicons name={name} size={size} color={color} accessible={false}/>; }
export function Button({ title, onPress, icon, secondary = false, disabled = false, style, testID }: { title: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary ? s.secondary : s.primary, { opacity: disabled ? .45 : pressed ? .75 : 1 }, style]}>{icon && <Icon name={icon} size={18} color={secondary ? c.green : c.white}/>}<T style={[s.buttonText, { color: secondary ? c.green : c.white }]}>{title}</T></Pressable>;
}
export function CircleButton({ name, label, onPress, selected = false }: { name: IconName; label: string; onPress: () => void; selected?: boolean }) { return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={s.circle}><Icon name={name} size={20} color={selected ? c.accent : c.green}/></Pressable>; }
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress} style={[s.chip, active && s.chipActive]}><T style={[s.chipText, active && { color: c.white }]}>{label}</T></Pressable>; }
export function Page({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const { storageError } = useStore();
  return <SafeAreaView edges={['top']} style={s.safe}>{scroll ? <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">{storageError && <Notice>{storageError}</Notice>}{children}</ScrollView> : <View style={s.page}>{children}</View>}</SafeAreaView>;
}
export function Eyebrow({ children }: { children: React.ReactNode }) { return <T style={s.eyebrow}>{children}</T>; }
export function Title({ children }: { children: React.ReactNode }) { return <T accessibilityRole="header" style={s.title}>{children}</T>; }
export function Notice({ children, icon = 'information-circle-outline' }: { children: React.ReactNode; icon?: IconName }) { return <View style={s.notice}><Icon name={icon} size={18} color={c.muted}/><T style={s.noticeText}>{children}</T></View>; }
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { return <View style={s.section}><T accessibilityRole="header" style={s.sectionTitle}>{title}</T>{action && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={s.linkTouch}><T style={s.link}>{action} ↗</T></Pressable>}</View>; }
export function Empty({ title, body }: { title: string; body: string }) { return <View style={s.empty}><Icon name="leaf-outline" size={32} color={c.muted}/><T style={s.sectionTitle}>{title}</T><T style={[s.muted, { textAlign: 'center' }]}>{body}</T></View>; }
export function ArtCard({ art }: { art: Artwork }) {
  const nav = useRootNavigation(); const { state, dispatch } = useStore(); const saved = state.saved.includes(art.id);
  return <View style={s.artCard}><View><Pressable accessibilityRole="button" accessibilityLabel={`Explore ${art.title}`} onPress={() => nav.navigate('Artwork', { id: art.id })}><Image source={images[art.id]} style={s.artImage} accessibilityLabel={art.title}/><View style={s.roomTag}><T style={s.tagText}>ROOM {art.room}</T></View></Pressable><View style={s.savePosition}><CircleButton name={saved ? 'bookmark' : 'bookmark-outline'} label={`${saved ? 'Unsave' : 'Save'} ${art.title}`} selected={saved} onPress={() => { dispatch({ type: 'save', id: art.id }); void Haptics.selectionAsync().catch(() => {}); }}/></View></View><Pressable accessibilityRole="button" onPress={() => nav.navigate('Artwork', { id: art.id })}><T style={s.artTitle}>{art.title}</T><T style={s.artArtist}>{art.artist} · {art.year}</T></Pressable><View style={s.rowBetween}><T style={s.small}>{art.category}</T><T style={s.small}>{art.minutes} min</T></View></View>;
}
export function ArtRow({ art }: { art: Artwork }) { const nav = useRootNavigation(); return <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${art.title}`} onPress={() => nav.navigate('Artwork', { id: art.id })} style={s.artRow}><Image source={images[art.id]} style={s.thumbnail}/><View style={{ flex: 1 }}><T style={s.artTitle}>{art.title}</T><T style={s.small}>{art.artist} · Room {art.room}</T></View><Icon name="arrow-forward" size={18}/></Pressable>; }

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg }, page: { padding: 22, paddingBottom: 35, gap: 20 },
  text: { color: c.ink, fontSize: 14, lineHeight: 22 }, muted: { color: c.muted, fontSize: 13, lineHeight: 21 }, small: { color: c.muted, fontSize: 11, lineHeight: 17 },
  title: { fontFamily: serif, fontSize: 35, lineHeight: 41, letterSpacing: -1.1 }, eyebrow: { fontSize: 10, lineHeight: 16, letterSpacing: 1.8, color: c.muted, textTransform: 'uppercase', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, wrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  primary: { backgroundColor: c.green }, secondary: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }, button: { minHeight: 48, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, buttonText: { fontSize: 13, lineHeight: 19, fontWeight: '600' }, circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F2F2' },
  chip: { borderRadius: 25, borderWidth: 1, borderColor: c.border, minHeight: 42, paddingHorizontal: 15, justifyContent: 'center', backgroundColor: c.bg }, chipActive: { backgroundColor: c.green, borderColor: c.green }, chipText: { fontSize: 12, lineHeight: 18, color: c.muted },
  notice: { backgroundColor: c.sage, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, noticeText: { fontSize: 11, lineHeight: 18, color: c.muted, flex: 1 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, sectionTitle: { fontFamily: serif, fontSize: 24, lineHeight: 29, letterSpacing: -.45, flexShrink: 1 }, linkTouch: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 12, color: c.green },
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 20, gap: 14 }, empty: { alignItems: 'center', backgroundColor: c.sage, padding: 28, borderRadius: 16, gap: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 25 }, artCard: { width: '47.5%', gap: 5 }, artImage: { width: '100%', aspectRatio: .83, borderRadius: 12, backgroundColor: c.sand }, savePosition: { position: 'absolute', top: 6, right: 6 }, roomTag: { position: 'absolute', left: 9, bottom: 10, backgroundColor: '#F7F8F2E8', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 }, tagText: { fontSize: 8, lineHeight: 13, letterSpacing: .8 }, artTitle: { fontFamily: serif, fontSize: 18, lineHeight: 23, marginTop: 6 }, artArtist: { fontSize: 10, lineHeight: 16, color: c.muted },
  artRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderColor: c.border }, thumbnail: { width: 58, height: 67, borderRadius: 8 },
  input: { backgroundColor: c.white, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, minHeight: 48, color: c.ink, fontSize: 14 }, divider: { borderBottomWidth: 1, borderColor: c.border }, label: { fontSize: 13, fontWeight: '600' },
});
