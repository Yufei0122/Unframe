import React, { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParams } from '../model';
import { useAuth, type AuthSession } from '../auth';
import { Icon, T, serif } from '../ui';
import { useLocale } from './locale';
import { Action, palette } from './theme';
import { StudioError, studioError, studioRequest } from './api';

type Mode = 'login' | 'register' | 'setup';
type FieldProps = TextInputProps & { label: string; inputRef?: React.Ref<TextInput>; visibility?: { label: string; visible: boolean; toggle: () => void } };
function Field({ label, inputRef, visibility, onFocus, onBlur, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <T style={styles.label}>{label}</T>
    <View style={[styles.inputBox, focused && styles.inputFocused]}>
      <TextInput ref={inputRef} accessibilityLabel={label} placeholderTextColor="#8B8983" {...props} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} style={styles.input}/>
      {visibility && <Pressable accessibilityRole="button" accessibilityLabel={visibility.label} accessibilityState={{ selected: visibility.visible }} onPress={visibility.toggle} style={styles.eye}><Icon name={visibility.visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={palette.green}/></Pressable>}
    </View>
  </View>;
}

/** Shared optional authentication: public registration always creates a visitor. */
export function SignInScreen({ navigation }: NativeStackScreenProps<RootStackParams, 'SignIn'>) {
  const { language, setLanguage, t } = useLocale(), auth = useAuth(), insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login'), [setupAllowed, setSetupAllowed] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [name, setName] = useState('');
  const [visible, setVisible] = useState(false), [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const [frame, setFrame] = useState({ width: 390, height: 844 });
  const active = useRef(true), submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const passwordInput = useRef<TextInput>(null), confirmationInput = useRef<TextInput>(null);
  const registering = mode === 'register', setup = mode === 'setup', login = mode === 'login';
  const compact = frame.height < 760 || frame.width < 350;
  const railWidth = Math.round(Math.min(104, frame.width * (frame.width < 350 ? .20 : .245)));
  useEffect(() => {
    active.current = true;
    void studioRequest<{ setupRequired: boolean; setupAllowed: boolean }>('/auth/status').then(status => { if (active.current) setSetupAllowed(status.setupRequired && status.setupAllowed); }).catch(() => {});
    return () => { active.current = false; };
  }, []);
  const leave = () => { active.current = false; if (navigation.canGoBack()) navigation.goBack(); else navigation.replace('MuseumSelect'); };
  const changeMode = (next: Mode) => {
    if (submitting.current) return;
    Keyboard.dismiss(); scroll.current?.scrollTo({ y: 0, animated: false });
    setMode(next); setPassword(''); setConfirmation(''); setVisible(false); setConfirmVisible(false); setError(null);
  };
  const submit = async () => {
    if (submitting.current) return;
    setError(null);
    if (!login) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(new StudioError('EMAIL_INVALID', 'Enter a valid email address.')); return; }
      if (password.length < 10 || password.length > 128) { setError(new StudioError('PASSWORD_INVALID', 'Use a password between 10 and 128 characters.')); passwordInput.current?.focus(); return; }
      if (registering && password !== confirmation) { setError(new StudioError('PASSWORD_MISMATCH', 'The passwords do not match.')); confirmationInput.current?.focus(); return; }
    }
    submitting.current = true; setBusy(true);
    try {
      const endpoint = setup ? '/auth/setup' : registering ? '/auth/register' : '/auth/login';
      const value = await studioRequest<AuthSession>(endpoint, undefined, { email, password, ...(setup ? { name } : {}), ...(registering ? { confirmPassword: confirmation } : {}) });
      // Leaving for guest use must not sign the visitor in when a slow response arrives.
      if (!active.current) { void studioRequest('/auth/logout', value.token, {}).catch(() => {}); return; }
      auth.acceptSession(value); leave();
    } catch (error) { if (active.current) setError(error); }
    finally { submitting.current = false; if (active.current) setBusy(false); }
  };
  const title = setup ? t('Set up your\nworkspace.', '初始化\n工作区。') : registering ? t('Create your\naccount.', '创建账号，\n开启探索。') : t('Your visit\nstarts here.', '你的参观，\n从这里开始。');
  const ready = !!email.trim() && !!password && (!registering || !!confirmation) && (!setup || !!name.trim() && setupAllowed);
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} onLayout={event => setFrame(event.nativeEvent.layout)}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.gallery, { width: railWidth }]}>
      <Image testID="auth-gallery" source={require('../../assets/auth-gallery.jpg')} resizeMode="cover" style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%' }]}/>
    </View>
    <ScrollView ref={scroll} testID="auth-scroll" style={{ flex: 1, marginLeft: railWidth }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { minHeight: frame.height, paddingHorizontal: compact ? 18 : 20, paddingTop: Math.max(insets.top + 20, compact ? 38 : 66), paddingBottom: Math.max(insets.bottom + 20, 28) }]}>
      {login && <View testID="auth-brand" style={[styles.brand, { marginBottom: compact ? 42 : 72 }]}><Image accessibilityLabel={t('Unframe logo', 'Unframe 标志')} source={require('../../assets/icon.png')} style={styles.logo}/><T style={styles.wordmark}>unframe</T></View>}
      <T accessibilityRole="header" style={[styles.title, { fontSize: compact ? 30 : language === 'zh' ? 34 : 36, lineHeight: compact ? 38 : 45, ...(language === 'zh' ? { fontFamily: Platform.select({ ios: 'Songti SC', android: 'serif', default: '"Noto Serif CJK SC", "Noto Serif SC", serif' }) } : {}) }]}>{title}</T>
      {setup && <T style={styles.hint}>{t('Create the first administrator on this computer.', '在本机创建首位管理员。')}</T>}
      <View style={[styles.form, { marginTop: compact ? 42 : login ? 72 : 56 }]}>
        {setup && <Field label={t('Your name', '姓名')} value={name} onChangeText={setName} autoComplete="name" maxLength={60}/>}
        <Field label={t('Email', '邮箱')} value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" maxLength={254} returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()}/>
        <View style={{ gap: 6 }}><Field inputRef={passwordInput} label={t('Password', '密码')} value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete={login ? 'current-password' : 'new-password'} textContentType={login ? 'password' : 'newPassword'} returnKeyType={registering ? 'next' : 'done'} onSubmitEditing={() => { if (registering) confirmationInput.current?.focus(); else if (ready) void submit(); }} maxLength={128} visibility={{ label: visible ? t('Hide password', '隐藏密码') : t('Show password', '显示密码'), visible, toggle: () => setVisible(!visible) }}/>
          {!login && <T style={styles.hint}>{t('10–128 characters.', '10–128 个字符。')}</T>}
        </View>
        {registering && <Field inputRef={confirmationInput} label={t('Confirm password', '确认密码')} value={confirmation} onChangeText={setConfirmation} secureTextEntry={!confirmVisible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={128} returnKeyType="done" onSubmitEditing={() => { if (ready) void submit(); }} visibility={{ label: confirmVisible ? t('Hide confirmed password', '隐藏确认密码') : t('Show confirmed password', '显示确认密码'), visible: confirmVisible, toggle: () => setConfirmVisible(!confirmVisible) }}/>}
      </View>
      {error != null && <View accessibilityRole="alert" style={styles.error}><T style={styles.errorText}>{studioError(error, language)}</T></View>}
      <View style={[styles.actions, { marginTop: compact ? 28 : 40 }]}>
        <Action label={setup ? t('Create administrator', '创建管理员') : registering ? t('Create account', '创建账号') : t('Sign in', '登录')} onPress={() => { void submit(); }} busy={busy} disabled={!ready} style={styles.button} labelStyle={styles.buttonLabel}/>
        <Action secondary label={t('Explore as guest', '暂不登录，直接使用')} onPress={leave} style={[styles.button, styles.guestButton]} labelStyle={styles.buttonLabel}/>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={login ? t('Create an account', '注册账号') : t('Back to sign in', '返回登录')} disabled={busy} onPress={() => changeMode(login ? 'register' : 'login')} style={styles.modeLink}>
        <T style={styles.linkText}>{login ? t('New here? ', '还没有账号？') : setup ? '' : t('Already registered? ', '已有账号？')}<T style={styles.linkEmphasis}>{login ? t('Create account', '注册') : t('Sign in', '登录')}</T></T>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={language === 'en' ? '中文' : 'English'} onPress={() => setLanguage(language === 'en' ? 'zh' : 'en')} style={styles.language}><Icon name="globe-outline" size={22} color={palette.green}/><T style={styles.languageText}>{language === 'en' ? '中文' : 'English'}</T></Pressable>
      {login && setupAllowed && <Pressable accessibilityRole="button" accessibilityLabel={t('Initialize workspace', '初始化工作区')} disabled={busy} onPress={() => changeMode('setup')} style={styles.setupLink}><T style={styles.hint}>{t('Initialize workspace', '初始化工作区')}</T></Pressable>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg }, gallery: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: '#DFCCAC', overflow: 'hidden' },
  content: { flexGrow: 1 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 32, height: 32, borderRadius: 6 }, wordmark: { fontFamily: serif, fontSize: 28, lineHeight: 36, letterSpacing: -.8, color: palette.green },
  title: { fontFamily: serif, letterSpacing: -.8, color: '#102C27' }, form: { gap: 20 }, field: { gap: 6 }, label: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: '#152F2E' },
  inputBox: { minHeight: 46, borderWidth: 1, borderColor: '#C8C3BB', borderRadius: 9, flexDirection: 'row', alignItems: 'center' }, inputFocused: { borderColor: palette.green, backgroundColor: '#FFFDFA' }, input: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 13, paddingVertical: 10, fontSize: 16, color: palette.ink, ...Platform.select({ web: { outlineWidth: 0 } }) }, eye: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, lineHeight: 18, color: palette.muted }, actions: { gap: 12 }, button: { minHeight: 50, borderRadius: 9, paddingHorizontal: 8 }, buttonLabel: { fontSize: 16, lineHeight: 22 }, guestButton: { borderColor: '#8B9C8D', backgroundColor: 'transparent' },
  modeLink: { minHeight: 44, marginTop: 8, justifyContent: 'center' }, linkText: { fontSize: 13, lineHeight: 20, color: '#403A32' }, linkEmphasis: { fontSize: 13, lineHeight: 20, color: palette.green, fontWeight: '600' },
  language: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', minHeight: 44, paddingRight: 12, marginTop: 24 }, languageText: { color: '#152F2E', fontSize: 15, lineHeight: 22 }, setupLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  error: { marginTop: 16, borderLeftWidth: 2, borderColor: palette.accent, paddingLeft: 10 }, errorText: { color: '#8E3D28', fontSize: 13, lineHeight: 20 },
});
