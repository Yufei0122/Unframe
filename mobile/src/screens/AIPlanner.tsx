import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, T, c, serif, useRootNavigation } from '../ui';
import { useStore } from '../store';
import { useMuseumLocation } from '../location';
import { requestAI } from '../ai';
import type { AIRoute, PlanningMessage, PlanningReply, VisitPreferences } from '../../../shared/ai-types';
import { RoutePlanningTransition } from '../components/AIProcessingAnimations';
import { FloorPlan, type Floor } from '../components/FloorPlan';

type ActiveRequest = { controller: AbortController; kind: 'chat' | 'route'; message?: string; startedAt: number };

function PlanningWait({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const update = () => setSeconds(Math.floor((performance.now() - startedAt) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <View style={{ gap: 8 }}>
    <T style={styles.detail} testID="planning-elapsed">Waiting {seconds}s · You can cancel at any time.</T>
    <Button title="Cancel request" secondary onPress={onCancel}/>
  </View>;
}

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
  const [lastDuration, setLastDuration] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<AIRoute | null>(null);
  const [previewFloor, setPreviewFloor] = useState<Floor>('1');
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
    cancel(); setMessages([welcome]); setPreferences(defaults()); setDraft(''); setError(''); setFailedMessage(null); setLastDuration(null); setItinerary(null);
  }

  async function send(content = draft, retry = false) {
    const message = content.trim();
    if (!message || request.current || (failedMessage && !retry)) return;
    const history = (retry ? messages.slice(0, -1) : messages).slice(-8);
    if (!retry) setMessages(previous => [...previous, { role: 'user', content: message }]);
    setDraft(''); setError(''); setFailedMessage(null); setBusy('chat');
    const controller = new AbortController(), startedAt = performance.now();
    request.current = { controller, kind: 'chat', message, startedAt }; setLastDuration(null);
    let chatCompleted = false;
    try {
      const response = await requestAI<PlanningReply>('routes/chat', { museumId, message, history, preferences }, controller.signal);
      if (request.current?.controller !== controller || controller.signal.aborted) return;
      chatCompleted = true;
      setPreferences(response.preferences);
      setMessages(previous => [...previous, { role: 'assistant', content: response.reply }]);
      setItinerary(null);
      const chatSeconds = (performance.now() - startedAt) / 1000;
      setBusy('route');
      const routeStartedAt = performance.now();
      request.current = { controller, kind: 'route', startedAt: routeStartedAt };
      const route = await requestAI<AIRoute>('routes/plan', { museumId, ...response.preferences }, controller.signal);
      if (request.current?.controller !== controller || controller.signal.aborted) return;
      setItinerary(route);
      setLastDuration(`Answer ${chatSeconds.toFixed(1)}s · route ${((performance.now() - routeStartedAt) / 1000).toFixed(1)}s`);
    } catch (failure) {
      if (request.current?.controller !== controller) return;
      if (!chatCompleted) setFailedMessage(message);
      setError(failure instanceof Error ? failure.message : chatCompleted ? 'Your answer is ready, but the route preview could not be built.' : 'Could not send your message. Please retry.');
    } finally {
      if (request.current?.controller === controller) { request.current = null; setBusy(null); }
    }
  }

  async function plan() {
    if (request.current || failedMessage || draft.trim()) return;
    Keyboard.dismiss(); setBusy('route'); setError('');
    const controller = new AbortController(), startedAt = performance.now();
    request.current = { controller, kind: 'route', startedAt }; setLastDuration(null);
    try {
      const itinerary = await requestAI<AIRoute>('routes/plan', { museumId, ...preferences }, controller.signal);
      if (request.current?.controller !== controller || controller.signal.aborted) return;
      setLastDuration(`Route received in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`);
      setItinerary(itinerary);
    } catch (failure) {
      if (request.current?.controller !== controller) return;
      setError(failure instanceof Error ? failure.message : 'Could not plan this visit.');
    } finally {
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
          {message.role === 'assistant' && index > 0 && index === messages.length - 1 ? <View style={styles.answerCard} testID="planning-answer-card">
            <View style={styles.answerHeading}><Icon name="checkmark-circle-outline" size={18} color={c.green}/><T style={styles.answerTitle}>Your visit is taking shape</T></View>
            <T style={styles.answerIntro}>{message.content}</T>
            <View style={styles.answerDivider}/>
            <View style={styles.answerPoint}><Icon name="time-outline" size={15} color={c.green}/><View style={styles.answerPointCopy}><T style={styles.answerLabel}>TIME</T><T style={styles.answerValue}>{preferences.availableMinutes} minutes</T></View></View>
            <View style={styles.answerPoint}><Icon name="color-palette-outline" size={15} color={c.green}/><View style={styles.answerPointCopy}><T style={styles.answerLabel}>FOCUS</T><T style={styles.answerValue}>{preferences.interests.length ? preferences.interests.join(', ') : 'Museum highlights'}</T></View></View>
            <View style={styles.answerPoint}><Icon name="walk-outline" size={15} color={c.green}/><View style={styles.answerPointCopy}><T style={styles.answerLabel}>PACE & ACCESS</T><T style={styles.answerValue}>{preferences.walkingPreference === 'less_walking' ? 'Less walking' : 'Balanced walking'}{preferences.accessibilityRequirements.length ? ' · Step-free' : ''}</T></View></View>
            {!!preferences.mustSeeArtworkIds.length && <View style={styles.answerPoint}><Icon name="star-outline" size={15} color={c.green}/><View style={styles.answerPointCopy}><T style={styles.answerLabel}>MUST SEE</T><T style={styles.answerValue}>{preferences.mustSeeArtworkIds.map(id => museum.artworks.find(art => art.id === id)?.title).filter(Boolean).join(', ')}</T></View></View>}
          </View> : <View style={[styles.bubble, message.role === 'user' && styles.userBubble]}><T style={[styles.message, message.role === 'user' && styles.userText]}>{message.content}</T></View>}
        </View>)}
        {messages.length === 1 && <View style={styles.prompts}>{prompts.map(prompt => <Pressable key={prompt.label} accessibilityRole="button" accessibilityLabel={prompt.label} disabled={locked} onPress={() => { void send(prompt.message); }} style={styles.prompt}><T style={styles.promptText}>{prompt.label}</T><Icon name="arrow-up-outline" size={15} color={c.green}/></Pressable>)}</View>}
        {busy === 'chat' && <RoutePlanningTransition label="Understanding your preferences…"/>}
        {busy && request.current && <PlanningWait startedAt={request.current.startedAt} onCancel={cancel}/>}
        {!busy && lastDuration && <T style={styles.detail} testID="planning-duration">{lastDuration}</T>}
        {!!error && <View style={styles.errorBox}><T accessibilityRole="alert" style={styles.errorText}>{error}</T>{failedMessage ? <View style={styles.errorActions}>
          <Button title="Retry message" secondary disabled={!!busy} onPress={() => { void send(failedMessage, true); }}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Discard message" onPress={() => { setMessages(previous => previous.slice(0, -1)); setFailedMessage(null); setError(''); }} style={styles.discard}><T style={styles.detail}>Discard message</T></Pressable>
        </View> : messages.length > 1 && <Button title="Try route again" secondary disabled={!!busy} onPress={() => { void plan(); }}/>}</View>}
        {messages.length === 1 && <View style={styles.summary} testID="visit-preferences"><View style={styles.summaryHeading}><T style={styles.summaryTitle}>Starting preferences</T><View style={styles.time}><Icon name="time-outline" size={13}/><T style={styles.timeText}>{preferences.availableMinutes} min</T></View></View><T style={styles.detail}>Choose a prompt or tell me what matters to you.</T></View>}
        {busy === 'route' && <View style={styles.routeCard}><RoutePlanningTransition label="Designing your route preview…"/></View>}
        {!busy && itinerary && <View style={styles.routeCard} testID="route-preview-card">
          <View style={styles.routeCardHeading}><View><T style={styles.routeEyebrow}>YOUR ROUTE</T><T style={styles.routeTitle}>{itinerary.route.length} stops · {itinerary.estimatedMinutes} min</T></View><T style={styles.routeDistance}>{itinerary.estimatedWalkingDistance} m</T></View>
          <FloorPlan museumId={museumId} floor={previewFloor} setFloor={setPreviewFloor} room={null} onRoom={() => {}} onSearch={() => nav.navigate('Lookup')} height={220} routePaths={itinerary.navigation.map(item => item.nodes)}/>
          <T numberOfLines={2} style={styles.routeReason}>{itinerary.reasoningSummary}</T>
          <View style={styles.stopPreview}>{itinerary.route.slice(0, 3).map(stop => <View key={stop.artworkId} style={styles.stopChip}><T style={styles.stopNumber}>{stop.order}</T><T numberOfLines={1} style={styles.stopName}>{stop.title}</T></View>)}</View>
          <Button title="View full itinerary" icon="arrow-forward" onPress={() => nav.navigate('AIItinerary', { itinerary, museumId, returnToPlanner: true })}/>
          <Pressable accessibilityRole="button" onPress={() => { void plan(); }} style={styles.replan}><T style={styles.detail}>Refresh this route</T></Pressable>
        </View>}
        <T style={styles.demoNote}>Messages and preferences are processed by Qwen on your local AI server and are not saved by Unframe. Demo artworks and illustrative indoor routes. GPS cannot locate you inside a gallery.</T>
      </ScrollView>
      <View style={styles.composerArea}>
        <View style={styles.composer}>
          <TextInput accessibilityLabel="Message your visit planner" placeholder="Tell me what you have in mind…" placeholderTextColor={c.muted} value={draft} onChangeText={setDraft} multiline maxLength={600} editable={!locked} style={styles.input} onKeyPress={event => {
            const key = event.nativeEvent as typeof event.nativeEvent & { shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
            if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey && !key.isComposing && key.keyCode !== 229) { event.preventDefault(); void send(); }
          }}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: locked || !draft.trim() }} disabled={locked || !draft.trim()} onPress={() => { void send(); }} style={[styles.send, (locked || !draft.trim()) && styles.disabled]}><Icon name="arrow-up" color={c.white} size={21}/></Pressable>
        </View>
        <T style={styles.composerNote}>Send a change and your route preview updates automatically.</T>
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
  answerCard: { flex: 1, maxWidth: '90%', borderWidth: 1, borderColor: '#D8DED4', backgroundColor: c.white, borderRadius: 18, padding: 16, gap: 11 }, answerHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, answerTitle: { fontFamily: serif, fontSize: 18, lineHeight: 23, color: c.green }, answerIntro: { fontSize: 12, lineHeight: 19, color: '#3F4943' }, answerDivider: { height: 1, backgroundColor: '#E5E8E2' }, answerPoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, answerPointCopy: { flex: 1, gap: 1 }, answerLabel: { fontSize: 8, lineHeight: 12, letterSpacing: 1.2, color: c.muted }, answerValue: { fontSize: 12, lineHeight: 18, color: c.ink },
  prompts: { gap: 8, alignItems: 'flex-start', marginLeft: 36 }, prompt: { borderWidth: 1, borderColor: '#D5DDD3', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' }, promptText: { fontSize: 11, lineHeight: 18, color: c.green, flexShrink: 1 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 9, marginLeft: 36 },
  summary: { padding: 15, gap: 10, borderWidth: 1, borderColor: c.border, backgroundColor: '#F0F2EC', borderRadius: 17 }, summaryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, summaryTitle: { fontSize: 12, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  time: { flexDirection: 'row', alignItems: 'center', gap: 4 }, timeText: { fontSize: 11, lineHeight: 18 }, detail: { fontSize: 11, lineHeight: 18, color: c.muted }, summaryNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', color: c.muted }, demoNote: { fontSize: 10, lineHeight: 16, textAlign: 'center', color: c.muted, paddingHorizontal: 8 },
  routeCard: { borderWidth: 1, borderColor: '#D7DED3', backgroundColor: '#F4F5F0', borderRadius: 19, padding: 14, gap: 12, overflow: 'hidden' }, routeCardHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }, routeEyebrow: { fontSize: 8, lineHeight: 12, letterSpacing: 1.4, color: c.green }, routeTitle: { fontFamily: serif, fontSize: 21, lineHeight: 27, color: c.ink }, routeDistance: { fontSize: 11, lineHeight: 18, color: c.muted }, routeReason: { fontSize: 11, lineHeight: 17, color: c.muted }, stopPreview: { gap: 6 }, stopChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.white, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }, stopNumber: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.green, color: c.white, textAlign: 'center', fontSize: 10, lineHeight: 20 }, stopName: { flex: 1, fontSize: 11, lineHeight: 16 }, replan: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  errorBox: { padding: 13, borderRadius: 13, backgroundColor: '#F5E9E3', gap: 9 }, errorText: { fontSize: 12, lineHeight: 19, color: '#8A3C29' }, errorActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, discard: { minHeight: 44, justifyContent: 'center' },
  composerArea: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 7, backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.border }, composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 5, gap: 6, backgroundColor: c.white, borderWidth: 1, borderColor: '#D6DCD2', borderRadius: 25 },
  input: { flex: 1, minWidth: 0, minHeight: 42, maxHeight: 104, paddingHorizontal: 12, paddingVertical: 11, color: c.ink, fontSize: 13, lineHeight: 20 }, send: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: .4 }, composerNote: { fontSize: 9, lineHeight: 15, textAlign: 'center', color: c.muted, marginTop: 6 },
});
