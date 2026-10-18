import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraCapture } from '../components/CameraCapture.web';
import { Button, Icon, T, c, s, useRootNavigation } from '../ui';
import { useMuseumLocation } from '../location';
import { images } from '../assets';
import { useStore } from '../store';
import { AI_TIMEOUT_MS, CLIP_TIMEOUT_MS, VISION_TIMEOUT_MS, requestAI } from '../ai';
import { ArtworkAnalysisResult } from '../components/ArtworkAnalysisResult';
import { ArtworkScanTransition } from '../components/AIProcessingAnimations';
import { shouldCaptureArtwork } from '../scanCapture';
import type { RecognitionResult, RecognitionCandidate, ConfirmationResult, ArtworkAnalysis } from '../../../shared/ai-types';

export function LookupScreen() {
  const { museumId } = useMuseumLocation();
  return <LookupContent key={museumId}/>;
}

function LookupContent() {
  const { museum, museumId } = useMuseumLocation();
  const nav = useRootNavigation(), focused = useIsFocused();
  const { state } = useStore();
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const lastFrame = useRef<Blob | null>(null);
  const stopCamera = useRef<(() => void) | null>(null);
  const [captured, setCaptured] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const [paused, setPaused] = useState(false), [cameraKey, setCameraKey] = useState(0);
  const [photo, setPhoto] = useState<Blob | null>(null), [preview, setPreview] = useState('');
  const hasPhoto = useRef(false); hasPhoto.current = !!photo;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uploadError, setUploadError] = useState('');
  const [candidates, setCandidates] = useState<RecognitionCandidate[]>([]), [message, setMessage] = useState('');
  const [selected, setSelected] = useState<RecognitionCandidate | null>(null), [result, setResult] = useState<ConfirmationResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null), [analysing, setAnalysing] = useState(false);
  const [slowAnalysis, setSlowAnalysis] = useState(false);
  useEffect(() => { setSlowAnalysis(false); if (!analysing) return; const timer = setTimeout(() => setSlowAnalysis(true), 15000); return () => clearTimeout(timer); }, [analysing]);
  const active = focused && visible && !paused && !photo && !selected;
  function cancel() { controller.current?.abort(); controller.current = null; }
  useEffect(() => {
    const update = () => {
      const next = document.visibilityState !== 'hidden';
      if (!next) { cancel(); lastFrame.current = null; setBusy(false); setAnalysing(false); if (!hasPhoto.current) setCandidates([]); }
      setVisible(next);
    };
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (!focused) { cancel(); lastFrame.current = null; setBusy(false); setAnalysing(false); if (!hasPhoto.current) setCandidates([]); }
    return () => { cancel(); lastFrame.current = null; };
  }, [focused]);
  useEffect(() => { if (!photo) { setPreview(''); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  function resume() {
    setCaptured(false); stopCamera.current = null;
    lastFrame.current = null; setAnalysis(null); setAnalysing(false);
    cancel(); setPhoto(null); setSelected(null); setResult(null); setCandidates([]); setMessage('');
    setError(''); setUploadError(''); setBusy(false); setExpanded(false); setPaused(false); setCameraKey(k => k + 1);
  }
  function pause() { cancel(); setBusy(false); setPaused(true); setCandidates([]); setMessage(''); }
  function cancelAnalysis() { cancel(); setBusy(false); setAnalysing(false); setPaused(true); setError(''); setMessage('Analysis cancelled.'); }
  function close() {
    lastFrame.current = null;
    cancel(); setPaused(true);
    if (nav.getState().type === 'stack' && nav.canGoBack()) nav.goBack();
    else nav.navigate('Home', { screen: 'Discover' });
  }
  function choose(blob: Blob) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) { setUploadError('Choose a JPEG, PNG or WebP image.'); return; }
    if (blob.size > 5 * 1024 * 1024) { setUploadError('Choose an image smaller than 5 MB.'); return; }
    stopCamera.current?.(); setCaptured(false);
    cancel(); setAnalysis(null); setAnalysing(false); setPaused(true); setPhoto(blob); setSelected(null); setResult(null); setCandidates([]); setExpanded(false); setUploadError('');
    void recognise(blob, true);
  }
  async function analyse(blob: Blob) {
    stopCamera.current?.();
    cancel(); setPaused(true); setPhoto(blob); setCandidates([]); setSelected(null); setResult(null); setAnalysis(null); setError(''); setBusy(true); setAnalysing(true);
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), VISION_TIMEOUT_MS);
    const form = new FormData(); form.append('image', blob, 'artwork.jpg');
    try {
      const result = await requestAI<ArtworkAnalysis>('artworks/analyse', form, request.signal);
      if (controller.current === request && !request.signal.aborted) setAnalysis(result);
    } catch (failure) {
      if (controller.current === request) setError(request.signal.aborted ? 'Visual analysis timed out. Try again with a clearer photo.' : failure instanceof Error ? failure.message : 'Visual analysis is unavailable.');
    } finally { clearTimeout(timeout); if (controller.current === request) { controller.current = null; setBusy(false); setAnalysing(false); } }
  }
  function captureNow() {
    const frame = lastFrame.current;
    if (!frame) return;
    stopCamera.current?.(); cancel(); setCaptured(true); setPaused(true); setPhoto(frame);
    void recognise(frame, true);
  }
  async function recognise(blob: Blob, analyseUnknown = false, freeze?: () => void) {
    lastFrame.current = blob;
    if (controller.current || !focused || document.visibilityState === 'hidden') return;
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), CLIP_TIMEOUT_MS);
    setBusy(true); setError('');
    const form = new FormData(); form.append('image', blob, 'artwork-frame.jpg');
    try {
      const response = await requestAI<RecognitionResult>('artworks/recognise?museumId=' + museumId, form, request.signal);
      if (controller.current !== request || request.signal.aborted) return;
      // A legacy single match is still just a candidate; it never confirms itself.
      const matches = response.candidates ?? (response.matched && response.artwork ? [{ artwork: response.artwork, similarity: response.similarity ?? 0 }] : []);
      setCandidates(matches.slice(0, 3)); setMessage(matches.length ? '' : response.message || 'No close match in this museum collection. Try a clear photo of the whole artwork.');
      const capture = !analyseUnknown && shouldCaptureArtwork(response);
      if (capture) { freeze?.(); setCaptured(true); setPhoto(blob); setPaused(true); }
      if (!matches.length && (analyseUnknown || capture)) { clearTimeout(timeout); await analyse(blob); }
    } catch (failure) {
      if (controller.current === request) {
        setError(request.signal.aborted ? 'Recognition timed out. Resume scanning to try again.' : failure instanceof Error ? failure.message : 'Recognition failed. Resume scanning to try again.');
        setPaused(true); setCandidates([]);
      }
    } finally { clearTimeout(timeout); if (controller.current === request) { controller.current = null; setBusy(false); } }
  }
  async function confirm(candidate: RecognitionCandidate) {
    cancel(); setPaused(true); setSelected(candidate); setResult(null); setError(''); setUploadError(''); setBusy(true); setExpanded(false);
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), AI_TIMEOUT_MS);
    try {
      const response = await requestAI<ConfirmationResult>('artworks/confirm', { museumId, artworkId: candidate.artwork.id, visitorPreferences: state.preferences.interests }, request.signal);
      if (controller.current === request && !request.signal.aborted) setResult(response);
    } catch (failure) {
      if (controller.current === request) setError(request.signal.aborted ? 'Interpretation timed out. You can retry or open the collection details.' : failure instanceof Error ? failure.message : 'Interpretation is unavailable.');
    } finally { clearTimeout(timeout); if (controller.current === request) { controller.current = null; setBusy(false); } }
  }
  const art = selected?.artwork, explanation = result?.aiExplanation;
  function cameraOverlay(ready: boolean, cameraError: string) {
    return <View style={[styles.finderArea, candidates.length > 0 && styles.finderWithCandidates]}>
      {cameraError ? <View style={styles.cameraMessage}><Icon name="camera-outline" size={32} color="white"/><T accessibilityRole="alert" style={styles.light}>{cameraError}</T><Pressable accessibilityRole="button" accessibilityLabel="Retry camera" onPress={resume} style={styles.retry}><T style={styles.light}>Try camera again</T></Pressable></View> : <>
        <View pointerEvents="none" style={styles.finder}>{[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, i) => <View key={i} style={[styles.corner, corner]}/>)}</View>
        <T style={styles.hint}>{ready ? 'Hold steady' : 'Waiting for camera permission…'}</T>
      </>}
    </View>;
  }
  return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
    <View style={styles.stage}>
      {active && <CameraCapture key={cameraKey} onFrame={(blob, freeze) => { stopCamera.current = freeze; return recognise(blob, false, freeze); }} onUnavailable={() => { cancel(); setBusy(false); setCandidates([]); setMessage('Camera unavailable'); }}>{({ ready, error: cameraError }) => cameraOverlay(ready, cameraError)}</CameraCapture>}
      {!!preview && <Image source={{ uri: preview }} style={[StyleSheet.absoluteFill, (selected || analysis) && styles.resultPhoto]} resizeMode="contain" accessibilityLabel="Selected artwork photo"/>}
      {!active && !preview && <View pointerEvents="none" style={styles.pausedBackdrop}><Icon name={selected ? 'checkmark-circle-outline' : 'scan-outline'} size={52} color="#84968B"/></View>}
      <LinearGradient pointerEvents="none" colors={['#08130CE6', '#08130C00']} style={styles.topShade}/>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close scan" onPress={close} style={styles.close}><Icon name="close" size={24} color="white"/></Pressable>
        <View style={styles.heading}><T accessibilityRole="header" style={styles.title}>Scan artwork</T><T style={styles.museum}>{museum.shortName}</T></View>
        <View style={{ width: 42 }}/>
      </View>
      <View style={[styles.dock, (selected || analysis) && styles.selectedDock]}>
        {captured && !selected && !analysis && <T accessibilityLiveRegion="polite" style={styles.statusText}>Photo captured. You can lower your phone.</T>}
        {analysis ? <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}><ArtworkAnalysisResult result={analysis}/></ScrollView> : selected && art ? <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
          <View style={styles.match}><Image source={images[art.id]} accessibilityLabel={art.title} style={styles.thumbnail}/><View style={{ flex: 1 }}><T style={styles.eyebrow}>SELECTED BY YOU</T><T accessibilityRole="header" style={styles.artTitle}>{art.title}</T><T style={s.small}>{art.artist} · {art.year}</T></View></View>
          <Button title="Open artwork details" icon="arrow-forward" onPress={() => nav.navigate('Artwork', { id: art.id })}/>
          {busy && <View style={styles.darkAnimation}><ArtworkScanTransition compact label="Preparing your AI interpretation…"/></View>}
          {!!error && <><T accessibilityRole="alert" style={s.small}>{error}</T><Button title="Retry interpretation" secondary onPress={() => { void confirm(selected); }}/></>}
          {!busy && !result && !error && <><T style={s.small}>Interpretation was interrupted. Your selection is still available.</T><Button title="Retry interpretation" secondary onPress={() => { void confirm(selected); }}/></>}
          {!!result?.warning && <T style={s.small}>{result.warning}</T>}
          {!!explanation && <><Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide AI interpretation' : 'Read AI interpretation'} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.interpretation}><Icon name="sparkles-outline" size={17}/><T style={s.label}>AI interpretation</T><Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16}/></Pressable>{expanded && <View style={{ gap: 10 }}><T style={s.small}>{result?.interpretationLabel}</T><T>{explanation.summary}</T><T>{explanation.historicalContext}</T>{explanation.interestingFacts.map((fact, i) => <T key={i}>• {fact}</T>)}<T>{explanation.whyItMatters}</T>{explanation.suggestedNextArtwork && <Button title="Explore suggested artwork" secondary onPress={() => nav.navigate('Artwork', { id: explanation.suggestedNextArtwork! })}/>}</View>}</>}
        </ScrollView> : <>
          {candidates.length > 0 && <View style={styles.candidatePanel}><View style={styles.candidateHeading}><T style={styles.candidateTitle}>Possible matches</T><T style={styles.candidateHint}>Tap the work you see</T></View><ScrollView style={styles.candidateList}>{candidates.map(candidate => <Pressable key={candidate.artwork.id} accessibilityRole="button" accessibilityLabel={'Select ' + candidate.artwork.title} onPress={() => { void confirm(candidate); }} style={styles.candidate}><Image source={images[candidate.artwork.id]} style={styles.candidateImage}/><View style={{ flex: 1 }}><T numberOfLines={1} style={styles.candidateName}>{candidate.artwork.title}</T><T numberOfLines={1} style={styles.candidateHint}>{candidate.artwork.artist}</T></View><Icon name="chevron-forward" color="#DBCBAA" size={18}/></Pressable>)}</ScrollView></View>}
          {busy && <ArtworkScanTransition compact label={analysing ? (slowAnalysis ? 'Taking a closer look…' : 'Looking closer…') : 'Finding a match…'}/>}
          {!analysing && !candidates.length && !error && !!message && <T accessibilityLiveRegion="polite" style={styles.statusText}>{message}</T>}
          {!busy && !candidates.length && !error && (photo || paused) && <View style={styles.status} accessibilityLiveRegion="polite"><T style={styles.statusText}>{photo ? 'Try another photo or look closer' : 'Scanning paused'}</T></View>}
          {!!error && <T accessibilityRole="alert" style={styles.error}>{error}</T>}
        </>}
        {!!uploadError && <T accessibilityRole="alert" style={styles.error}>{uploadError}</T>}
        {!active && !selected && !analysis && !analysing && !candidates.length && !!(photo || lastFrame.current) && <Pressable accessibilityRole="button" accessibilityLabel="Analyse any artwork" onPress={() => { const frame = photo || lastFrame.current; if (frame) void analyse(frame); }} style={styles.scanButton}><T style={styles.controlLabel}>Analyse any artwork</T></Pressable>}
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Upload photo" onPress={() => input.current?.click()} style={styles.controlButton}><Icon name="images-outline" color="white" size={21}/><T style={styles.controlLabel}>Photos</T></Pressable>
          {active && <Pressable accessibilityRole="button" accessibilityLabel="Capture frame" accessibilityState={{ disabled: !lastFrame.current }} disabled={!lastFrame.current} onPress={captureNow} style={styles.controlButton}><Icon name="radio-button-on-outline" color="white" size={36}/></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={analysing ? 'Cancel analysis' : active ? 'Pause scanning' : photo ? 'Scan again' : 'Resume scanning'} onPress={analysing ? cancelAnalysis : active ? pause : resume} style={styles.scanButton}><Icon name={active ? 'pause' : analysing ? 'close' : 'scan-outline'} color="#DBCBAA" size={19}/><T style={styles.controlLabel}>{analysing ? 'Cancel analysis' : active ? 'Pause' : photo ? 'Scan again' : 'Resume scanning'}</T></Pressable>
        </View>
      </View>
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
  finderArea: { position: 'absolute', top: 82, left: 24, right: 24, bottom: 180, justifyContent: 'center', alignItems: 'center', gap: 16 }, finderWithCandidates: { bottom: 335 },
  finder: { width: '100%', maxWidth: 310, flex: 1, maxHeight: 340, minHeight: 35 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: '#FFFAE9' },
  topLeft: { left: 0, top: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 12 }, topRight: { right: 0, top: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 12 },
  bottomLeft: { left: 0, bottom: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 12 }, bottomRight: { right: 0, bottom: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 12 },
  hint: { color: 'white', fontSize: 11, lineHeight: 17, textAlign: 'center', backgroundColor: '#101915AD', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
  cameraMessage: { alignItems: 'center', gap: 12, padding: 10 }, light: { color: 'white', fontSize: 12, lineHeight: 19, textAlign: 'center' }, retry: { padding: 12, borderRadius: 20, borderWidth: 1, borderColor: '#FFFFFF55' },
  pausedBackdrop: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingBottom: 180 },
  resultPhoto: { top: 82, left: 20, right: 20, bottom: '54%' },
  dock: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '70%', backgroundColor: '#101915F0', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 10, overflow: 'hidden' }, selectedDock: { height: '50%', maxHeight: '76%' },
  candidatePanel: { flexShrink: 1, paddingHorizontal: 18, paddingTop: 14 }, candidateHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 5 }, candidateTitle: { color: '#F9F4E9', fontSize: 12, fontWeight: '600' }, candidateHint: { color: '#B9C4BC', fontSize: 10, lineHeight: 16 }, candidateList: { maxHeight: 202, flexShrink: 1 },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FFFFFF17' }, candidateImage: { width: 38, height: 46, borderRadius: 6 }, candidateName: { color: 'white', fontSize: 14, lineHeight: 20 },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 37, paddingHorizontal: 18, paddingTop: 8 }, statusText: { color: '#DBCBAA', fontSize: 11, lineHeight: 17, flexShrink: 1, textAlign: 'center' },
  controls: { paddingHorizontal: 22, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  controlButton: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, scanButton: { minHeight: 44, borderRadius: 24, backgroundColor: '#FFFFFF16', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17 }, controlLabel: { color: '#F2F2E8', fontSize: 12, lineHeight: 18 },
  error: { color: '#FFD6C4', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 20, paddingTop: 8 },
  sheet: { flex: 1, minHeight: 0, backgroundColor: c.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 }, sheetContent: { padding: 20, gap: 14 }, darkAnimation: { backgroundColor: '#24372F', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 14 }, thumbnail: { width: 56, height: 68, borderRadius: 9 }, eyebrow: { fontSize: 9, lineHeight: 15, color: c.muted, letterSpacing: 1.3 }, artTitle: { fontSize: 20, lineHeight: 26, marginVertical: 3 }, interpretation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 8 },
});
