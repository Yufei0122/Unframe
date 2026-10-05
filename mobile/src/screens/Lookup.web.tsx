import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CameraCapture } from '../components/CameraCapture.web';
import { ArtRow, Button, Notice, Section, T, Title, s, useRootNavigation } from '../ui';
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
  const museumArtworks = museum.artworks;
  const nav = useRootNavigation(), focused = useIsFocused();
  const { state } = useStore();
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const [camera, setCamera] = useState(false), [photo, setPhoto] = useState<Blob | null>(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<RecognitionResult | null>(null);
  useEffect(() => { if (!focused) { setCamera(false); controller.current?.abort(); controller.current = null; setBusy(false); } return () => { controller.current?.abort(); controller.current = null; }; }, [focused]);
  useEffect(() => { if (!photo) { setPreview(''); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  function choose(blob: Blob) {
    controller.current?.abort(); controller.current = null; setBusy(false); setError(''); setResult(null); setCamera(false); setPhoto(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) { setError('Choose a JPEG, PNG or WebP image.'); return; }
    if (blob.size > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB.'); return; }
    setPhoto(blob);
  }
  async function recognise() {
    if (!photo) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 60000);
    setBusy(true); setResult(null); setError('');
    const form = new FormData(); form.append('image', photo, 'artwork-photo'); form.append('visitorPreferences', JSON.stringify(state.preferences.interests));
    try { const response = await requestAI<RecognitionResult>(`artworks/recognise?museumId=${museumId}`, form, request.signal); if (!request.signal.aborted) setResult(response); }
    catch (error) { if (controller.current === request && !request.signal.aborted) setError(error instanceof Error ? error.message : 'Recognition failed.'); else if (controller.current === request && focused) setError('Recognition was cancelled or timed out. Please try again.'); }
    finally { clearTimeout(timeout); if (controller.current === request) setBusy(false); }
  }
  const art = result?.artwork, explanation = result?.aiExplanation;
  return <ScrollView contentContainerStyle={s.page}>
    <Title>Find the work{`\n`}in front of you.</Title>
    <T style={s.muted}>Photograph an artwork or upload an image to search the {museumArtworks.length}-work {museum.shortName} demo collection.</T>
    {camera && focused ? <CameraCapture onCapture={choose} onClose={() => setCamera(false)}/> : <>
      {!!preview && <Image source={{ uri: preview }} style={{ width: '100%', height: 220, borderRadius: 16 }} resizeMode="contain" accessibilityLabel="Selected artwork photo"/>}
      <View style={s.row}><Button title="Take photo" secondary icon="camera-outline" disabled={busy} style={{ flex: 1 }} onPress={() => { setCamera(true); setError(''); }}/><Button title="Upload photo" secondary icon="images-outline" disabled={busy} style={{ flex: 1 }} onPress={() => input.current?.click()}/></View>
    </>}
    <input ref={input} aria-label="Upload artwork image" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; if (file) choose(file); event.target.value = ''; }}/>
    <Notice>Your camera opens only when requested. “Identify artwork” sends this photo to the server and Google for image matching. Unframe does not save visitor photos.</Notice>
    <Button title={busy ? 'Identifying artwork…' : 'Identify artwork'} icon="sparkles-outline" disabled={!photo || busy || camera} onPress={() => { void recognise(); }}/>
    {!!photo && !busy && <Button title="Clear photo" secondary onPress={() => { setPhoto(null); setResult(null); setError(''); }}/>}
    {!!error && <T accessibilityRole="alert" style={s.muted}>{error}</T>}
    {result && !result.matched && <Notice>{result.message || 'No confident match. Try a closer photo or browse below.'}</Notice>}
    {art && <View style={s.card}>
      <Section title="Collection match"/>
      <Image source={images[art.id]} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover" accessibilityLabel={art.title}/>
      <T style={s.sectionTitle}>{art.title}</T><T>{art.artist} · {art.year}</T><T>{art.medium}</T>
      <T style={s.small}>{museumId === 'met' ? 'European Paintings' : museumArtworks.find(a => a.id === art.id)?.room} · demo location</T>
      <T style={s.small}>Image similarity: {((result?.similarity || 0) * 100).toFixed(1)}% · not a certainty score</T>
      <T>{art.description}</T><T style={s.small}>{art.source}</T>
      <Button title="Open artwork details" onPress={() => nav.navigate('Artwork', { id: art.id })}/>
    </View>}
    {!!result?.warning && <Notice>{result.warning}</Notice>}
    {explanation && <View style={s.card}><Section title="AI interpretation"/><T style={s.small}>{result?.interpretationLabel}</T><T>{explanation.summary}</T><Section title="Historical context"/><T>{explanation.historicalContext}</T>{explanation.interestingFacts.map((fact, i) => <T key={i}>• {fact}</T>)}<Section title="Why it matters"/><T>{explanation.whyItMatters}</T>{explanation.suggestedNextArtwork && <Button title="Explore suggested artwork" secondary onPress={() => nav.navigate('Artwork', { id: explanation.suggestedNextArtwork! })}/>}</View>}
    <Section title="Browse the demo collection"/>{museumArtworks.map(item => <ArtRow key={item.id} art={item}/>)}
  </ScrollView>;
}
