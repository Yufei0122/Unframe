import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { Icon, T, serif, type IconName } from '../ui';

export const palette = { bg: '#F8F6F2', ink: '#192722', green: '#263F36', sage: '#E7EBE5', muted: '#72746F', border: '#E7E3DD', accent: '#A35E48', amber: '#8B4A22', softAmber: '#F7E9D7', white: '#FFFEFB' };
export function Heading({ children, small = false }: { children: React.ReactNode; small?: boolean }) { return <T accessibilityRole="header" style={[st.heading, small && st.sectionTitle]}>{children}</T>; }
export function Copy({ children, muted = false, style }: { children: React.ReactNode; muted?: boolean; style?: object }) { return <T style={[st.copy, muted && { color: palette.muted }, style]}>{children}</T>; }
export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' }) { return <View style={[st.pill, { backgroundColor: tone === 'green' ? palette.sage : tone === 'amber' ? palette.softAmber : '#EFEDE7' }]}><T style={{ fontSize: 11, lineHeight: 17, color: tone === 'amber' ? palette.amber : tone === 'green' ? palette.green : palette.muted, fontWeight: '500' }}>{children}</T></View>; }
export function Action({ label, onPress, disabled = false, secondary = false, busy = false, icon, style, labelStyle }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; busy?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy }} aria-disabled={disabled || busy} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [st.action, secondary ? st.secondary : { backgroundColor: palette.green }, style, (disabled || busy) && { opacity: .4 }, pressed && { opacity: .7 }]}>{busy ? <ActivityIndicator color={secondary ? palette.green : 'white'}/> : <>{icon && <Icon name={icon} size={17} color={secondary ? palette.green : 'white'}/>}<T style={[st.actionLabel, { color: secondary ? palette.green : 'white' }, labelStyle]}>{label}</T></>}</Pressable>;
}
export function Input({ label, ...props }: TextInputProps & { label: string }) { return <View style={{ gap: 7 }}><T style={st.label}>{label}</T><TextInput accessibilityLabel={label} placeholderTextColor="#92918A" {...props} style={[st.input, props.multiline && { minHeight: 112, textAlignVertical: 'top' }, props.style]}/></View>; }
export function TextLink({ children, onPress, icon = 'arrow-forward' }: { children: string; onPress: () => void; icon?: IconName }) { return <Pressable accessibilityRole="button" accessibilityLabel={children} onPress={onPress} style={st.textLink}><T style={{ fontSize: 12, color: palette.accent }}>{children}</T><Icon name={icon} size={15} color={palette.accent}/></Pressable>; }
export const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg }, content: { padding: 20, gap: 16, paddingBottom: 28 },
  heading: { fontFamily: serif, fontSize: 31, lineHeight: 39, letterSpacing: -.7, color: palette.ink }, sectionTitle: { fontSize: 23, lineHeight: 30, letterSpacing: -.3 },
  copy: { fontSize: 13, lineHeight: 21, color: palette.ink }, label: { fontSize: 12, lineHeight: 19, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  card: { padding: 17, gap: 13, borderWidth: 1, borderColor: palette.border, borderRadius: 14, backgroundColor: palette.white },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: palette.white, color: palette.ink, fontSize: 14 },
  action: { minHeight: 46, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, secondary: { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg }, actionLabel: { fontSize: 13, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  pill: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  textLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chip: { minHeight: 38, borderRadius: 22, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 15, justifyContent: 'center' },
  line: { borderBottomWidth: 1, borderColor: palette.border }, notice: { backgroundColor: palette.sage, padding: 13, borderRadius: 10 },
  error: { marginHorizontal: 18, marginTop: 8, padding: 12, backgroundColor: '#F7E6DE', borderRadius: 10 },
});
