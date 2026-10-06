import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, T, c, serif, useRootNavigation } from '../ui';
import { useStore } from '../store';
import { useMuseumLocation } from '../location';
import { requestAI } from '../ai';
import type { AIRoute, PlanningMessage, PlanningReply, VisitPreferences } from '../../../shared/ai-types';

type ActiveRequest = { controller: AbortController; kind: 'chat' | 'route'; message?: string };

export function AIPlannerScreen() {
  const { museumId } = useMuseumLocation();
  return <PlanningChat key={museumId}/>;
}

function PlanningChat() {
  const { museum, museumId } = useMuseumLocation();
  const nav = useRootNavigation(), { state } = useStore();
  const defaults = (): VisitPreferences => ({
    interests: state.preferences.interests.slice(0, 10), availableMinutes: state.preferences.duration,
    currentLocation: 'entrance', walkingPreference: 'balanced',
    accessibilityRequirements: state.preferences.stepFree ? ['step_free'] : [], mustSeeArtworkIds: [],
  });
  const welcome: PlanningMessage = { role: 'assistant', content: `Let's make ${museum.shortName} your own. Tell me how much time you have, what you love, or an artwork you don't want to miss. We can shape your visit together.` };
  const [messages, setMessages] = useState<PlanningMessage[]>([welcome]);
  const [preferences, setPreferences] = useState<VisitPreferences>(defaults);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'chat' | 'route' | null>(null);
  const [error, setError] = useState('');
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const request = useRef<ActiveRequest | null>(null);
  const scroll = useRef<ScrollView>(null);

  const cancel = useCallback(() => {
    const active = request.current;
    if (!active) return;
    request.current = null;
    active.controller.abort();
    setBusy(null);
    setFailedMessage(active.message ?? null);
    setError(active.kind === 'chat' ? 'Your message was paused. Retry to continue the conversation.' : 'Route generation was paused. You can generate it again.');
  }, []);
  useFocusEffect(useCallback(() => cancel, [cancel]));

  function reset() {
    cancel(); setMessages([welcome]); setPreferences(defaults()); setDraft(''); setError(''); setFailedMessage(null);
  }

  async function send(content = draft, retry = false) {
    const message = content.trim();
    if (!message || request.current || (failedMessage && !retry)) return;
    const history = (retry ? messages.slice(0, -1) : messages).slice(-8);
    if (!retry) setMessages(previous => [...previous, { role: 'user', content: message }]);
    setDraft(''); setError(''); setFailedMessage(null); setBusy('chat');
    const controller = new AbortController(); request.current = { controller, kind: 'chat', message };
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await requestAI<PlanningReply>('routes/chat', { museumId, message, history, preferences }, controller.signal);
      if (request.current?.controller !== controller || controller.signal.aborted) return;
      setPreferences(response.preferences);
      setMessages(previous => [...previous, { role: 'assistant', content: response.reply }]);
    } catch (failure) {
      if (request.current?.controller !== controller) return;
      setFailedMessage(message);
      setError(controller.signal.aborted ? 'The assistant took too long to reply. Please retry.' : failure instanceof Error ? failure.message : 'Could not send your message. Please retry.');
    } finally {
      clearTimeout(timeout);
      if (request.current?.controller === controller) { request.current = null; setBusy(null); }
    }
  }

  async function plan() {
    if (request.current || failedMessage || draft.trim()) return;
    Keyboard.dismiss(); setBusy('route'); setError('');
    const controller = new AbortController(); request.current = { controller, kind: 'route' };
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const itinerary = await requestAI<AIRoute>('routes/plan', { museumId, ...preferences }, controller.signal);
      if (request.current?.controller !== controller || controller.signal.aborted) return;
      request.current = null; setBusy(null);
      nav.navigate('AIItinerary', { itinerary, museumId });
    } catch (failure) {
      if (request.current?.controller !== controller) return;
      setError(controller.signal.aborted ? 'Planning took too long. Please try again.' : failure instanceof Error ? failure.message : 'Could not plan this visit.');
    } finally {
      clearTimeout(timeout);
      if (request.current?.controller === controller) { request.current = null; setBusy(null); }
    }
  }

  const locked = !!busy || !!failedMessage;
  const prompts = [
    { label: '30-minute highlights', message: 'I have 30 minutes. Help me explore the highlights.' },
    { label: 'A relaxed, step-free visit', message: 'I would like a step-free route with less walking.' },
    { label: `Include ${museum.artworks[0].title}`, message: `Please include ${museum.artworks[0].title} as a must-see.` },
  ];
  return <SafeAreaView edges={['top']} style={styles.screen}>
    <View style={styles.header}>
      <View style={styles.headerCopy}><T style={styles.eyebrow}>YOUR MUSEUM COMPANION</T><T accessibilityRole="header" style={styles.title}>Plan your visit</T></View>
      <Pressable accessibilityRole="button" accessibilityLabel="New conversation" onPress={reset} style={styles.roundButton}><Icon name="create-outline" size={22}/></Pressable>
    </View>
    <View style={styles.museum}><Icon name="location-outline" size={14} color={c.green}/><T style={styles.museumText}>{museum.shortName} · demo collection</T><View style={styles.dot}/><T style={styles.museumText}>AI guide</T></View>
    <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} style={styles.body} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (messages.length > 1) scroll.current?.scrollToEnd({ animated: true }); }}>
        <T style={styles.caption}>A visit shaped around you</T>
        {messages.map((message, index) => <View key={index} style={[styles.messageRow, message.role === 'user' && styles.userRow]}>
          {message.role === 'assistant' && <View style={styles.avatar}><Icon name="sparkles-outline" size={16} color={c.green}/></View>}
          <View style={[styles.bubble, message.role === 'user' && styles.userBubble]}><T style={[styles.message, message.role === 'user' && styles.userText]}>{message.content}</T></View>
        </View>)}
        {messages.length === 1 && <View style={styles.prompts}>{prompts.map(prompt => <Pressable key={prompt.label} accessibilityRole="button" accessibilityLabel={prompt.label} disabled={locked} onPress={() => { void send(prompt.message); }} style={styles.prompt}><T style={styles.promptText}>{prompt.label}</T><Icon name="arrow-up-outline" size={15} color={c.green}/></Pressable>)}</View>}
        {busy === 'chat' && <View style={styles.thinking} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color={c.green}/><T style={styles.detail}>Thinking about your visit…</T></View>}
        {!!error && <View style={styles.errorBox}><T accessibilityRole="alert" style={styles.errorText}>{error}</T>{failedMessage && <View style={styles.errorActions}>
          <Button title="Retry message" secondary disabled={!!busy} onPress={() => { void send(failedMessage, true); }}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Discard message" onPress={() => { setMessages(previous => previous.slice(0, -1)); setFailedMessage(null); setError(''); }} style={styles.discard}><T style={styles.detail}>Discard message</T></Pressable>
        </View>}</View>}
        <View style={styles.summary} testID="visit-preferences">
          <View style={styles.summaryHeading}><T style={styles.summaryTitle}>{messages.length === 1 ? 'Starting preferences' : 'The visit so far'}</T><View style={styles.time}><Icon name="time-outline" size={13}/><T style={styles.timeText}>{preferences.availableMinutes} min</T></View></View>
          <T style={styles.detail}>{preferences.interests.length ? preferences.interests.join(' · ') : 'Open to discovering something new'}</T>
          <T style={styles.detail}>From {museum.graph.nodes.find(node => node.id === preferences.currentLocation)?.label} · {preferences.walkingPreference === 'less_walking' ? 'Less walking' : 'Balanced walk'}{preferences.accessibilityRequirements.length ? ' · Step-free' : ''}</T>
          {!!preferences.mustSeeArtworkIds.length && <T style={styles.detail}>Must see: {preferences.mustSeeArtworkIds.map(id => museum.artworks.find(art => art.id === id)?.title).join(', ')}</T>}
          <Button title={busy === 'route' ? 'Planning your visit…' : 'Generate route'} icon="sparkles-outline" disabled={locked || !!draft.trim()} onPress={() => { void plan(); }}/>
          <T style={styles.summaryNote}>{draft.trim() ? 'Send your message to update these preferences.' : 'Your itinerary opens on a separate page.'}</T>
        </View>
        <T style={styles.demoNote}>Demo artworks and illustrative indoor routes. GPS cannot locate you inside a gallery.</T>
      </ScrollView>
      <View style={styles.composerArea}>
        <View style={styles.composer}>
          <TextInput accessibilityLabel="Message your visit planner" placeholder="Tell me what you have in mind…" placeholderTextColor={c.muted} value={draft} onChangeText={setDraft} multiline maxLength={600} editable={!locked} style={styles.input} onKeyPress={event => {
            const key = event.nativeEvent as typeof event.nativeEvent & { shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
            if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey && !key.isComposing && key.keyCode !== 229) { event.preventDefault(); void send(); }
          }}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: locked || !draft.trim() }} disabled={locked || !draft.trim()} onPress={() => { void send(); }} style={[styles.send, (locked || !draft.trim()) && styles.disabled]}><Icon name="arrow-up" color={c.white} size={21}/></Pressable>
        </View>
        <T style={styles.composerNote}>Ask, adjust, then make it your route.</T>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg }, body: { flex: 1, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 17, paddingBottom: 13, gap: 12 }, headerCopy: { flex: 1 },
  eyebrow: { fontSize: 9, lineHeight: 15, letterSpacing: 1.5, color: c.muted }, title: { fontFamily: serif, fontSize: 29, lineHeight: 38, letterSpacing: -.6 },
  roundButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  museum: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderColor: c.border }, museumText: { fontSize: 11, lineHeight: 17, color: c.green }, dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: c.muted },
  conversation: { padding: 18, gap: 17, paddingBottom: 22 }, caption: { fontSize: 10, lineHeight: 16, textAlign: 'center', color: c.muted, marginBottom: 3 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, userRow: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.sage, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  bubble: { backgroundColor: c.white, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 18, borderTopLeftRadius: 4, flexShrink: 1, maxWidth: '90%', borderWidth: 1, borderColor: c.border },
  userBubble: { backgroundColor: c.green, borderColor: c.green, borderTopLeftRadius: 18, borderBottomRightRadius: 4 }, message: { fontSize: 13, lineHeight: 21 }, userText: { color: c.white },
  prompts: { gap: 8, alignItems: 'flex-start', marginLeft: 36 }, prompt: { borderWidth: 1, borderColor: '#D5DDD3', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' }, promptText: { fontSize: 11, lineHeight: 18, color: c.green, flexShrink: 1 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 9, marginLeft: 36 },
  summary: { padding: 15, gap: 10, borderWidth: 1, borderColor: c.border, backgroundColor: '#F0F2EC', borderRadius: 17 }, summaryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, summaryTitle: { fontSize: 12, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  time: { flexDirection: 'row', alignItems: 'center', gap: 4 }, timeText: { fontSize: 11, lineHeight: 18 }, detail: { fontSize: 11, lineHeight: 18, color: c.muted }, summaryNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', color: c.muted }, demoNote: { fontSize: 10, lineHeight: 16, textAlign: 'center', color: c.muted, paddingHorizontal: 8 },
  errorBox: { padding: 13, borderRadius: 13, backgroundColor: '#F5E9E3', gap: 9 }, errorText: { fontSize: 12, lineHeight: 19, color: '#8A3C29' }, errorActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, discard: { minHeight: 44, justifyContent: 'center' },
  composerArea: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 7, backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.border }, composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 5, gap: 6, backgroundColor: c.white, borderWidth: 1, borderColor: '#D6DCD2', borderRadius: 25 },
  input: { flex: 1, minWidth: 0, minHeight: 42, maxHeight: 104, paddingHorizontal: 12, paddingVertical: 11, color: c.ink, fontSize: 13, lineHeight: 20 }, send: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: .4 }, composerNote: { fontSize: 9, lineHeight: 15, textAlign: 'center', color: c.muted, marginTop: 6 },
});
