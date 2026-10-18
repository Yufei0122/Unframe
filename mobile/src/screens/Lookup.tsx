import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Button, Icon, T, c, s, useRootNavigation } from '../ui';
import { useMuseumLocation } from '../location';
import { images } from '../assets';
import { useStore } from '../store';
import { AI_TIMEOUT_MS, CLIP_TIMEOUT_MS, VISION_TIMEOUT_MS, requestAI } from '../ai';
import { createNativeScanLoop } from '../nativeScanLoop';
import { ArtworkAnalysisResult } from '../components/ArtworkAnalysisResult';
import { ArtworkScanTransition } from '../components/AIProcessingAnimations';
import type { ArtworkAnalysis, ConfirmationResult, RecognitionCandidate, RecognitionResult } from '../../../shared/ai-types';

export function LookupScreen() {
  const { museumId } = useMuseumLocation();
  return <NativeLookupContent key={museumId}/>;
}

function NativeLookupContent() {
  const { museum, museumId } = useMuseumLocation();
  const nav = useRootNavigation(), focused = useIsFocused();
  const { state } = useStore();
  const camera = useRef<CameraView>(null);
  const screenFocused = useRef(focused), pickingPhoto = useRef(false);
  screenFocused.current = focused;
  useEffect(() => () => { screenFocused.current = false; }, []);
  const confirmation = useRef<AbortController | null>(null);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const asked = useRef(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [cameraReady, setCameraReady] = useState(false), [cameraError, setCameraError] = useState('');
  const [cameraKey, setCameraKey] = useState(0), [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [candidates, setCandidates] = useState<RecognitionCandidate[]>([]);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<RecognitionCandidate | null>(null);
  const [result, setResult] = useState<ConfirmationResult | null>(null);
  const [confirming, setConfirming] = useState(false), [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null), [analysing, setAnalysing] = useState(false);
  const [slowAnalysis, setSlowAnalysis] = useState(false);
  useEffect(() => { setSlowAnalysis(false); if (!analysing) return; const timer = setTimeout(() => setSlowAnalysis(true), 15000); return () => clearTimeout(timer); }, [analysing]);

  const loop = useMemo(() => createNativeScanLoop<RecognitionResult>({
    timeoutMs: CLIP_TIMEOUT_MS,
    async sample(signal) {
      const currentCamera = camera.current;
      if (!currentCamera) throw new Error('The camera is not ready. Try scanning again.');
      const temporaryFiles = new Set<string>();
      try {
        // Silent sampling keeps the preview live without a shutter interaction or photo library.
        const frame = await currentCamera.takePictureAsync({ quality: .7, exif: false, shutterSound: false });
        temporaryFiles.add(frame.uri);
        if (signal.aborted) throw new Error('Scan cancelled.');
        const context = ImageManipulator.manipulate(frame.uri);
        let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
        let uri: string;
        try {
          if (Math.max(frame.width, frame.height) > 960) context.resize(frame.width >= frame.height ? { width: 960 } : { height: 960 });
          rendered = await context.renderAsync();
          const compressed = await rendered.saveAsync({ compress: .65, format: SaveFormat.JPEG });
          uri = compressed.uri; temporaryFiles.add(uri);
        } finally { rendered?.release(); context.release(); }
        if (signal.aborted) throw new Error('Scan cancelled.');
        const form = new FormData();
        // React Native FormData accepts local file descriptors instead of browser Blobs.
        form.append('image', { uri, name: 'artwork-frame.jpg', type: 'image/jpeg' } as unknown as Blob);
        return await requestAI<RecognitionResult>('artworks/recognise?museumId=' + museumId, form, signal);
      } finally {
        for (const uri of temporaryFiles) {
          try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* The OS may already have cleared a cache file. */ }
        }
      }
    },
    onResult(response) {
      const next = response.candidates || [];
      // Preserve row order while fresh suggestions arrive so tap targets do not jump.
      setCandidates(previous => [
        ...previous.flatMap(item => next.find(candidate => candidate.artwork.id === item.artwork.id) || []),
        ...next.filter(item => !previous.some(candidate => candidate.artwork.id === item.artwork.id)),
      ]);
      setMessage(next.length ? 'Possible matches — tap the work you see to confirm.' : response.message || 'No close match in this museum collection. Try a clear photo of the whole artwork.');
    },
    onError(value) { setCandidates([]); setError(value instanceof Error ? value.message : 'Scanning is unavailable. Please try again.'); },
    onBusy: setBusy,
  // A newly mounted camera gets its own loop, even if an old native capture never settles.
  // Cleanup stops the old loop; its aborted signal prevents any late upload or result.
  }), [museumId, cameraKey, focused, active]);

  function cancelConfirmation() {
    confirmation.current?.abort(); confirmation.current = null; setConfirming(false); setAnalysing(false);
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      const foreground = next === 'active';
      if (!foreground) { loop.stop(); cancelConfirmation(); setCameraReady(false); }
      else void getPermission().catch(() => setCameraError('Camera permission could not be checked. Please try again.'));
      setActive(foreground);
    });
    return () => { subscription.remove(); loop.stop(); cancelConfirmation(); };
  }, [loop, getPermission]);
  useEffect(() => {
    if (!focused || !active || !permission || permission.status !== 'undetermined' || asked.current) return;
    asked.current = true;
    void requestPermission().catch(() => setCameraError('Camera permission could not be requested. Please try again.'));
  }, [focused, active, permission, requestPermission]);

  const cameraVisible = focused && active && !!permission?.granted && !paused && !selected && !analysis && !error && !cameraError;
  const scanning = cameraVisible && cameraReady && !cameraError;
  useEffect(() => {
    if (scanning) loop.start(); else loop.stop();
    return () => loop.stop();
  }, [loop, scanning]);
  useEffect(() => {
    if (!cameraVisible) setCameraReady(false);
    if (!focused || !active) { cancelConfirmation(); setCandidates([]); }
  }, [cameraVisible, focused, active]);

  async function retryCamera() {
    loop.stop(); setCameraReady(false); setCameraError(''); setError(''); setPaused(false);
    setCandidates([]); setCameraKey(key => key + 1);
    try {
      const current = await getPermission();
      if (!current.granted) {
        if (current.canAskAgain) await requestPermission();
        else await Linking.openSettings();
      }
    } catch { setCameraError('Camera access is unavailable. Check your device settings, then try again.'); }
  }
  function scanAgain() {
    setAnalysis(null);
    loop.stop(); cancelConfirmation(); setSelected(null); setResult(null); setExpanded(false);
    setCandidates([]); setError(''); setCameraError(''); setPaused(false); setCameraReady(false);
    setMessage('');
    setCameraKey(key => key + 1);
  }
  async function analyseImage(capture: () => Promise<{ uri: string; width: number; height: number } | null>, ownedOriginal: boolean) {
    loop.stop(); cancelConfirmation(); setAnalysis(null); setCandidates([]); setSelected(null); setError(''); setAnalysing(true);
    const request = new AbortController(); confirmation.current = request;
    const timer = setTimeout(() => request.abort(), VISION_TIMEOUT_MS);
    const temporaryFiles = new Set<string>();
    try {
      const frame = await capture();
      if (frame && ownedOriginal) temporaryFiles.add(frame.uri);
      if (!frame || request.signal.aborted || confirmation.current !== request) return;
      setPaused(true);
      const context = ImageManipulator.manipulate(frame.uri);
      let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
      let uri: string;
      try {
        if (Math.max(frame.width, frame.height) > 1536) context.resize(frame.width >= frame.height ? { width: 1536 } : { height: 1536 });
        rendered = await context.renderAsync();
        const compressed = await rendered.saveAsync({ compress: .85, format: SaveFormat.JPEG });
        uri = compressed.uri; temporaryFiles.add(uri);
      } finally { rendered?.release(); context.release(); }
      if (request.signal.aborted || confirmation.current !== request) return;
      const upload = () => { const form = new FormData(); form.append('image', { uri, name: 'artwork.jpg', type: 'image/jpeg' } as unknown as Blob); return form; };
      const recognition = await requestAI<RecognitionResult>('artworks/recognise?museumId=' + museumId, upload(), request.signal);
      if (request.signal.aborted || confirmation.current !== request) return;
      if (recognition.candidates?.length) { setCandidates(recognition.candidates.slice(0, 3)); return; }
      const response = await requestAI<ArtworkAnalysis>('artworks/analyse', upload(), request.signal);
      if (confirmation.current === request && !request.signal.aborted) setAnalysis(response);
    } catch (failure) {
      if (confirmation.current === request) setError(request.signal.aborted ? 'Visual analysis timed out. Try another photo.' : failure instanceof Error ? failure.message : 'Visual analysis is unavailable.');
    } finally {
      clearTimeout(timer);
      for (const uri of temporaryFiles) { try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* Temporary capture may already be removed. */ } }
      if (confirmation.current === request) { confirmation.current = null; setAnalysing(false); setPaused(true); }
    }
  }
  function analyseCamera() {
    const current = camera.current;
    if (!current || !cameraReady || busy) return;
    void analyseImage(() => current.takePictureAsync({ quality: .85, exif: false, shutterSound: false }), true);
  }
  async function analysePhoto() {
    if (pickingPhoto.current) return;
    pickingPhoto.current = true;
    loop.stop(); cancelConfirmation(); setPaused(true);
    try {
      const choice = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      if (!choice.canceled && screenFocused.current) await analyseImage(async () => choice.assets[0], false);
    } catch { if (screenFocused.current) setError('The photo library could not be opened. Try again.'); }
    finally { pickingPhoto.current = false; }
  }
  async function choose(candidate: RecognitionCandidate) {
    loop.stop(); cancelConfirmation();
    setSelected(candidate); setResult(null); setError(''); setExpanded(false); setConfirming(true);
    const request = new AbortController(); confirmation.current = request;
    const timeout = setTimeout(() => request.abort(), AI_TIMEOUT_MS);
    try {
      const response = await requestAI<ConfirmationResult>('artworks/confirm', {
        museumId, artworkId: candidate.artwork.id, visitorPreferences: state.preferences.interests,
      }, request.signal);
      if (confirmation.current === request && !request.signal.aborted) setResult(response);
    } catch (value) {
      if (confirmation.current === request) setError(request.signal.aborted ? 'The interpretation timed out. Please try again.' : value instanceof Error ? value.message : 'The interpretation is unavailable. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (confirmation.current === request) { confirmation.current = null; setConfirming(false); }
    }
  }
  function close() {
    loop.stop(); cancelConfirmation();
    if (nav.getState().type === 'stack' && nav.canGoBack()) nav.goBack();
    else nav.navigate('Home', { screen: 'Discover' });
  }

  const cameraMessage = cameraError || (error ? 'Scanning paused.' : !permission ? 'Checking camera access…' : !permission.granted ? 'Allow camera access to automatically find artworks in view.' : paused ? 'Scanning paused.' : 'Starting camera…');
  const art = selected?.artwork, explanation = result?.aiExplanation;
  return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}><View style={styles.stage}>
    {cameraVisible && <CameraView key={cameraKey} ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" flash="off" animateShutter={false} onCameraReady={() => setCameraReady(true)} onMountError={event => { loop.stop(); setCandidates([]); setCameraReady(false); setCameraError(event.message || 'The camera could not start.'); }}/>}
    {!!art && <Image source={images[art.id]} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel={art.title}/>}
    <LinearGradient pointerEvents="none" colors={['#08130CE6', '#08130C00']} style={styles.topShade}/>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close scan" onPress={close} style={styles.close}><Icon name="close" size={24} color="white"/></Pressable>
      <View style={styles.heading}><T accessibilityRole="header" style={styles.title}>Scan artwork</T><T style={styles.museum}>{museum.shortName}</T></View>
      <View style={{ width: 42 }}/>
    </View>
    {analysis ? <View style={styles.resultArea}><ScrollView style={styles.resultSheet} contentContainerStyle={styles.resultContent}><ArtworkAnalysisResult result={analysis}/><Button title="Scan another artwork" secondary onPress={scanAgain}/><Button title="Analyse another photo" secondary onPress={analysePhoto}/></ScrollView></View> : !art ? <>
      <View style={styles.finderArea}>
        {cameraReady && !cameraError && !paused ? <>
          <View pointerEvents="none" style={styles.finder}>{[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, i) => <View key={i} style={[styles.corner, corner]}/>)}</View>
          <T style={styles.hint}>{error ? 'Scanning paused' : 'Hold steady'}</T>
        </> : <View style={styles.cameraMessage}><Icon name="camera-outline" size={34} color="white"/><T accessibilityRole={cameraError ? 'alert' : undefined} style={styles.light}>{cameraMessage}</T>{!!permission && (!permission.granted || !!cameraError || paused) && <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Resume scanning' : 'Enable camera'} onPress={() => { void retryCamera(); }} style={styles.retry}><T style={styles.light}>{paused ? 'Resume scanning' : permission.canAskAgain ? 'Enable camera' : 'Camera settings'}</T></Pressable>}</View>}
      </View>
      <View style={styles.sheet}>
        {!!candidates.length && <T style={s.label}>Choose the artwork in view</T>}
        {(busy || analysing) && <View style={styles.scanAnimation}><ArtworkScanTransition compact label={analysing ? (slowAnalysis ? 'Taking a closer look…' : 'Looking closer…') : 'Finding a match…'}/></View>}
        {!analysing && !candidates.length && !error && !!message && <T accessibilityLiveRegion="polite" style={s.small}>{message}</T>}
        {!!error && <><T accessibilityRole="alert" style={s.small}>{error}</T><Button title="Try scanning again" secondary onPress={scanAgain}/></>}
        {analysing ? <Button title="Cancel analysis" secondary onPress={scanAgain}/> : <View style={{ gap: 8 }}>{cameraVisible && <Button title="Analyse any artwork" secondary disabled={busy || !cameraReady} onPress={analyseCamera}/>}<Button title="Analyse photo" secondary onPress={analysePhoto}/></View>}
        {!!candidates.length && <ScrollView style={styles.candidateList} contentContainerStyle={{ paddingBottom: 4 }}>{candidates.map(candidate => <Pressable key={candidate.artwork.id} accessibilityRole="button" accessibilityLabel={`Confirm ${candidate.artwork.title} by ${candidate.artwork.artist}`} onPress={() => { void choose(candidate); }} style={styles.candidate}>
          <Image source={images[candidate.artwork.id]} style={styles.thumbnail}/><View style={{ flex: 1 }}><T style={styles.artTitle}>{candidate.artwork.title}</T><T style={s.small}>{candidate.artwork.artist} · {candidate.artwork.year}</T><T style={styles.matchLabel}>Possible match · tap to confirm</T></View><Icon name="chevron-forward" size={18}/>
        </Pressable>)}</ScrollView>}
        {cameraVisible && <Pressable accessibilityRole="button" accessibilityLabel="Pause scanning" onPress={() => { loop.stop(); setPaused(true); setCandidates([]); }} style={styles.pause}><T style={s.small}>Pause scanning</T></Pressable>}
      </View>
    </> : <View style={styles.resultArea}><ScrollView style={styles.resultSheet} contentContainerStyle={styles.resultContent}>
      <View style={styles.statusRow}><Image source={images[art.id]} style={styles.thumbnail}/><View style={{ flex: 1 }}><T style={styles.matchLabel}>YOUR SELECTED WORK</T><T accessibilityRole="header" style={styles.artTitle}>{art.title}</T><T style={s.small}>{art.artist} · {art.year}</T></View></View>
      <Button title="Open artwork details" icon="arrow-forward" onPress={() => { cancelConfirmation(); nav.navigate('Artwork', { id: art.id }); }}/>
      {confirming && <View style={styles.scanAnimation}><ArtworkScanTransition compact label="Preparing your AI interpretation…"/></View>}
      {!!error && <T accessibilityRole="alert" style={s.small}>{error}</T>}
      {!result && !confirming && <Button title="Retry interpretation" secondary onPress={() => { void choose(selected!); }}/>}
      {!!result?.warning && <T style={s.small}>{result.warning}</T>}
      {!!explanation && <><Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide AI interpretation' : 'Read AI interpretation'} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.statusRow}><Icon name="sparkles-outline" size={17}/><T style={[s.label, { flex: 1 }]}>AI interpretation</T><Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16}/></Pressable>{expanded && <View style={{ gap: 10 }}><T style={s.small}>{result?.interpretationLabel}</T><T>{explanation.summary}</T><T>{explanation.historicalContext}</T>{explanation.interestingFacts.map((fact, i) => <T key={i}>• {fact}</T>)}<T>{explanation.whyItMatters}</T>{explanation.suggestedNextArtwork && <Button title="Explore suggested artwork" secondary onPress={() => nav.navigate('Artwork', { id: explanation.suggestedNextArtwork! })}/>}</View>}</>}
      <Button title="Scan another artwork" secondary icon="scan-outline" onPress={scanAgain}/>
    </ScrollView></View>}
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101915' }, stage: { flex: 1, overflow: 'hidden' }, topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  header: { position: 'absolute', zIndex: 1, top: 14, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  close: { width: 42, height: 42, borderRadius: 24, backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, alignItems: 'center' }, title: { color: 'white', fontSize: 17, fontWeight: '500' }, museum: { color: '#D0D8D2', fontSize: 11, lineHeight: 18 },
  finderArea: { flex: 1, minHeight: 150, paddingTop: 90, paddingBottom: 20, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center', gap: 16 },
  finder: { width: '100%', maxWidth: 310, height: '65%', maxHeight: 340, minHeight: 70 }, corner: { position: 'absolute', width: 30, height: 30, borderColor: '#FFFAE9' },
  topLeft: { left: 0, top: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 12 }, topRight: { right: 0, top: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 12 },
  bottomLeft: { left: 0, bottom: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 12 }, bottomRight: { right: 0, bottom: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 12 },
  hint: { color: 'white', fontSize: 12, textAlign: 'center', backgroundColor: '#10191580', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
  cameraMessage: { alignItems: 'center', gap: 16, padding: 16 }, light: { color: 'white', fontSize: 12, lineHeight: 19, textAlign: 'center' }, retry: { padding: 12, borderRadius: 20, borderWidth: 1, borderColor: '#FFFFFF55' },
  sheet: { maxHeight: '52%', backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, candidateList: { flexShrink: 1 }, candidate: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  thumbnail: { width: 54, height: 64, borderRadius: 8 }, artTitle: { fontSize: 16, lineHeight: 22, fontWeight: '500' }, matchLabel: { color: c.green, fontSize: 9, lineHeight: 16, letterSpacing: .7 },
  privacy: { color: c.muted, fontSize: 10, lineHeight: 15 }, pause: { alignSelf: 'center', paddingHorizontal: 15, paddingVertical: 8 }, scanAnimation: { backgroundColor: '#24372F', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  resultArea: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%' }, resultSheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, resultContent: { padding: 22, gap: 16 },
});
