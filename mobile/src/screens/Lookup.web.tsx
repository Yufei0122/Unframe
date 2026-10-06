import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraCapture } from '../components/CameraCapture.web';
import { Button, Icon, T, c, s, useRootNavigation } from '../ui';
import { useMuseumLocation } from '../location';
import { images } from '../assets';
import { useStore } from '../store';
import { requestAI } from '../ai';
import type { RecognitionResult } from '../../../shared/ai-types';

export function LookupScreen() {
  const { museumId } = useMuseumLocation();
  return <LookupContent key={museumId}/>;
}

function LookupContent() {
  const { museum, museumId } = useMuseumLocation();
  const nav = useRootNavigation(), focused = useIsFocused();
  const { state } = useStore();
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<RecognitionResult | null>(null);
  const [cameraKey, setCameraKey] = useState(0), [expanded, setExpanded] = useState(false);
  function cancel() { controller.current?.abort(); controller.current = null; }
  useEffect(() => { if (!focused) { cancel(); setBusy(false); } return cancel; }, [focused]);
  useEffect(() => { if (!photo) { setPreview(''); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  function reset() { cancel(); setPhoto(null); setResult(null); setError(''); setBusy(false); setExpanded(false); setCameraKey(k => k + 1); }
  function close() {
    cancel();
    if (nav.getState().type === 'stack' && nav.canGoBack()) nav.goBack();
    else nav.navigate('Home', { screen: 'Discover' });
  }
  function choose(blob: Blob) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) { setError('Choose a JPEG, PNG or WebP image.'); return; }
    if (blob.size > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB.'); return; }
    setPhoto(blob); setExpanded(false); void recognise(blob);
  }
  async function recognise(blob: Blob) {
    cancel(); const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 60000);
    setBusy(true); setResult(null); setError('');
    const form = new FormData(); form.append('image', blob, 'artwork-photo'); form.append('visitorPreferences', JSON.stringify(state.preferences.interests));
    try {
      const response = await requestAI<RecognitionResult>('artworks/recognise?museumId=' + museumId, form, request.signal);
      if (controller.current === request && !request.signal.aborted) setResult(response);
    } catch (error) {
      if (controller.current === request) setError(request.signal.aborted ? 'Recognition timed out. Please try again.' : error instanceof Error ? error.message : 'Recognition failed.');
    } finally { clearTimeout(timeout); if (controller.current === request) setBusy(false); }
  }
  const art = result?.artwork, explanation = result?.aiExplanation;
  function liveControls(ready: boolean, cameraError: string, capture: () => void) {
    return <View style={styles.live}>
      <View style={styles.finderArea}>
        {cameraError ? <View style={styles.cameraMessage}><Icon name="camera-outline" size={34} color="white"/><T accessibilityRole="alert" style={styles.light}>{cameraError}</T><Pressable accessibilityRole="button" accessibilityLabel="Retry camera" onPress={reset} style={styles.retry}><T style={styles.light}>Try camera again</T></Pressable></View> : <>
          <View pointerEvents="none" style={styles.finder}>{[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, i) => <View key={i} style={[styles.corner, corner]}/>)}</View>
          <T style={styles.hint}>{ready ? 'Place the artwork inside the frame' : 'Waiting for camera permission…'}</T>
        </>}
      </View>
      <View style={styles.controls}>
        {!!error && <T accessibilityRole="alert" style={styles.light}>{error}</T>}
        <View style={styles.controlRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Upload photo" onPress={() => input.current?.click()} style={styles.sideButton}><Icon name="images-outline" color="white" size={25}/><T style={styles.controlLabel}>Photos</T></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Capture photo" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={capture} style={[styles.shutter, !ready && { opacity: .4 }]}><View style={styles.shutterInner}/></Pressable>
          <View style={styles.sideButton}><Icon name="sparkles-outline" color="#DBCBAA" size={23}/><T style={styles.controlLabel}>Identify</T></View>
        </View>
        <T style={styles.privacy}>Capture or upload to identify with Google AI.{'\n'}Unframe does not save your photo.</T>
      </View>
    </View>;
  }
  return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
    <View style={styles.stage}>
      {focused && !photo && <CameraCapture key={cameraKey} onCapture={choose}>{({ ready, error: cameraError, capture }) => liveControls(ready, cameraError, capture)}</CameraCapture>}
      {!!preview && <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Selected artwork photo"/>}
      <LinearGradient pointerEvents="none" colors={['#08130CE6', '#08130C00']} style={styles.topShade}/>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close scan" onPress={close} style={styles.close}><Icon name="close" size={24} color="white"/></Pressable>
        <View style={styles.heading}><T accessibilityRole="header" style={styles.title}>Scan artwork</T><T style={styles.museum}>{museum.shortName} · demo collection</T></View>
        <View style={{ width: 42 }}/>
      </View>
      {!!photo && <View style={styles.resultArea}>
        <View style={styles.resultActions}><Pressable accessibilityRole="button" accessibilityLabel="Retake photo" onPress={reset} style={styles.photoAction}><Icon name="camera-outline" color="white"/><T style={styles.light}>Retake</T></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Upload photo" onPress={() => input.current?.click()} style={styles.photoAction}><Icon name="images-outline" color="white"/><T style={styles.light}>Photos</T></Pressable></View>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
          {!!error && (busy || !!art) && <T accessibilityRole="alert" style={s.small}>{error}</T>}
          {busy ? <View style={styles.loading}><ActivityIndicator color={c.green}/><T accessibilityLiveRegion="polite">Identifying artwork…</T></View> : art ? <>
            <View style={styles.match}><Image source={images[art.id]} accessibilityLabel={art.title} style={styles.thumbnail}/><View style={{ flex: 1 }}><T style={styles.matched}>COLLECTION MATCH</T><T accessibilityRole="header" style={styles.artTitle}>{art.title}</T><T style={s.small}>{art.artist} · {art.year}</T></View></View>
            <Button title="Open artwork details" icon="arrow-forward" onPress={() => nav.navigate('Artwork', { id: art.id })}/>
            {!!result?.warning && <T style={s.small}>{result.warning}</T>}
            {!!explanation && <><Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide AI interpretation' : 'Read AI interpretation'} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.interpretation}><Icon name="sparkles-outline" size={17}/><T style={s.label}>AI interpretation</T><Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16}/></Pressable>{expanded && <View style={{ gap: 10 }}><T style={s.small}>{result?.interpretationLabel}</T><T>{explanation.summary}</T><T>{explanation.historicalContext}</T>{explanation.interestingFacts.map((fact, i) => <T key={i}>• {fact}</T>)}<T>{explanation.whyItMatters}</T>{explanation.suggestedNextArtwork && <Button title="Explore suggested artwork" secondary onPress={() => nav.navigate('Artwork', { id: explanation.suggestedNextArtwork! })}/>}</View>}</>}
          </> : <><T accessibilityRole={error ? 'alert' : undefined} style={s.label}>{error || result?.message || 'Photo ready. Try identifying it again.'}</T><Button title="Try again" secondary icon="refresh-outline" onPress={() => { void recognise(photo); }}/></>}
        </ScrollView>
      </View>}
      <input ref={input} aria-label="Upload artwork image" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; if (file) choose(file); event.target.value = ''; }}/>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101915' }, stage: { flex: 1, overflow: 'hidden' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  header: { position: 'absolute', top: 14, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  close: { width: 42, height: 42, borderRadius: 24, backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, alignItems: 'center' }, title: { color: 'white', fontSize: 17, fontWeight: '500' }, museum: { color: '#D0D8D2', fontSize: 11, lineHeight: 18 },
  live: { flex: 1, paddingTop: 90 }, finderArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 20 },
  finder: { width: '100%', maxWidth: 310, height: '65%', maxHeight: 340, minHeight: 90 },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#FFFAE9' },
  topLeft: { left: 0, top: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 12 }, topRight: { right: 0, top: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 12 },
  bottomLeft: { left: 0, bottom: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 12 }, bottomRight: { right: 0, bottom: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 12 },
  hint: { color: 'white', fontSize: 12, textAlign: 'center', backgroundColor: '#10191580', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
  cameraMessage: { alignItems: 'center', gap: 16, padding: 16 }, light: { color: 'white', fontSize: 12, lineHeight: 19, textAlign: 'center' }, retry: { padding: 12, borderRadius: 20, borderWidth: 1, borderColor: '#FFFFFF55' },
  controls: { backgroundColor: '#101915DF', paddingTop: 20, paddingBottom: 18, paddingHorizontal: 22, gap: 16 }, controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  sideButton: { width: 64, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 4 }, controlLabel: { color: '#D2DBD4', fontSize: 10, lineHeight: 16 },
  shutter: { height: 76, width: 76, padding: 5, borderRadius: 40, borderWidth: 2, borderColor: 'white' }, shutterInner: { flex: 1, borderRadius: 36, backgroundColor: '#FFFEF8' },
  privacy: { color: '#B9C4BC', textAlign: 'center', fontSize: 10, lineHeight: 16 },
  resultArea: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '65%' }, resultActions: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 }, photoAction: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 25, backgroundColor: '#101915D9' },
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, flexShrink: 1 }, sheetContent: { padding: 22, gap: 16 }, loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 62 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 14 }, thumbnail: { width: 62, height: 76, borderRadius: 9 }, matched: { fontSize: 9, lineHeight: 15, color: c.muted, letterSpacing: 1.3 }, artTitle: { fontSize: 20, lineHeight: 26, marginVertical: 3 }, interpretation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 8 },
});
