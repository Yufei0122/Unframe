import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { Button, Chip, Notice, Section, T, Title, s, useRootNavigation } from '../ui';
import { useStore } from '../store';
import { useMuseumLocation } from '../location';
import { interests } from '../model';
import { requestAI } from '../ai';
import type { AIRoute } from '../../../shared/ai-types';

export function AIPlannerScreen() {
  const { museumId } = useMuseumLocation();
  return <AIPlannerContent key={museumId}/>;
}

function AIPlannerContent() {
  const { museum, museumId } = useMuseumLocation();
  const { artworks: museumArtworks, graph } = museum;
  const nav = useRootNavigation(), { state } = useStore();
  const [selected, setSelected] = useState(state.preferences.interests), [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState(30), [location, setLocation] = useState('entrance'), [less, setLess] = useState(false), [stepFree, setStepFree] = useState(state.preferences.stepFree), [must, setMust] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => { request.current?.abort(); request.current = null; setBusy(false); setError(''); }, [selected, custom, minutes, location, less, stepFree, must]);
  async function plan() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 35000);
    setBusy(true); setError('');
    try {
      const result = await requestAI<AIRoute>('routes/plan', { museumId, interests: [...selected, ...(custom.trim() ? [custom.trim()] : [])], availableMinutes: minutes, currentLocation: location, walkingPreference: less ? 'less_walking' : 'balanced', accessibilityRequirements: stepFree ? ['step_free'] : [], mustSeeArtworkIds: must }, controller.signal);
      if (!controller.signal.aborted) nav.navigate('AIItinerary', { itinerary: result, museumId });
    } catch (error) { if (request.current === controller && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not plan this visit.'); else if (request.current === controller) setError('Planning was cancelled or timed out. Please try again.'); }
    finally { clearTimeout(timeout); if (request.current === controller) setBusy(false); }
  }
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Title>A little direction.{`\n`}Room to discover.</Title>
    <Notice>{museum.shortName} demo: {museumArtworks.length} artworks, illustrative locations and walking distances. Your device GPS cannot locate you inside a gallery; choose a starting point below.</Notice>
    <Section title="What draws you in?"/><View style={s.wrap}>{interests.map(i => <Chip key={i} label={i} active={selected.includes(i)} onPress={() => setSelected(selected.includes(i) ? selected.filter(t => t !== i) : [...selected, i])}/>)}</View>
    <TextInput accessibilityLabel="Additional interest" placeholder="An artist or movement (optional)" maxLength={80} value={custom} onChangeText={setCustom} style={s.input}/>
    <Section title="Available time"/><View style={s.wrap}>{[5, 15, 30, 60, 90].map(n => <Chip key={n} label={`${n} minutes`} active={minutes === n} onPress={() => setMinutes(n)}/>)}</View>
    <Section title="Starting point (demo)"/><View style={s.wrap}>{graph.nodes.map(n => <Chip key={n.id} label={n.label} active={location === n.id} onPress={() => setLocation(n.id)}/>)}</View>
    <View style={s.rowBetween}><T>Prefer less walking</T><Switch accessibilityLabel="Prefer less walking" value={less} onValueChange={setLess}/></View>
    <View style={s.rowBetween}><T>Step-free route</T><Switch accessibilityLabel="Step-free route" value={stepFree} onValueChange={setStepFree}/></View>
    <Section title="Must-see artworks"/><View style={s.wrap}>{museumArtworks.map(a => <Chip key={a.id} label={`Must see: ${a.title}`} active={must.includes(a.id)} onPress={() => setMust(must.includes(a.id) ? must.filter(id => id !== a.id) : [...must, a.id])}/>)}</View>
    <Button title={busy ? 'Planning your visit…' : 'Generate route'} disabled={busy} icon="sparkles-outline" onPress={() => { void plan(); }}/>
    {!!error && <T accessibilityRole="alert">{error}</T>}
  </ScrollView>;
}
