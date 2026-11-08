import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, Switch, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { artwork, sampleArtworks, interests, type RootStackParams } from '../model';
import { useStore } from '../store';
import { planRoute } from '../../../shared/domain.js';
import { Button, Chip, Eyebrow, Notice, Section, T, Title, c, s } from '../ui';
import { BrandLogo } from '../components/BrandLogo';

function ModalPage({ children }: { children: React.ReactNode }) { return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">{children}</ScrollView></KeyboardAvoidingView>; }
export function PlannerScreen({ navigation }: NativeStackScreenProps<RootStackParams, 'Planner'>) {
  const { state, dispatch } = useStore(); const initial = state.tour || state.preferences;
  const [duration, setDuration] = useState(initial.duration), [selected, setSelected] = useState(initial.interests), [stepFree, setStepFree] = useState(initial.stepFree);
  function plan() { dispatch({ type: 'plan', route: planRoute(sampleArtworks, { duration, interests: selected, stepFree }) }); navigation.popTo('Tour'); }
  return <ModalPage><Eyebrow>Your time, well wandered</Eyebrow><Title>A visit that{`\n`}feels like you.</Title><T style={s.muted}>A few starting points. We’ll leave room for discovery.</T><Section title="How long do you have?"/><View style={s.wrap}>{[15, 30, 45, 60, 90, 120].map(n => <Chip key={n} label={`${n} minutes`} active={duration === n} onPress={() => setDuration(n)}/>)}</View><Section title="What draws you in?"/><View style={s.wrap}>{interests.map(item => <Chip key={item} label={item} active={selected.includes(item)} onPress={() => setSelected(selected.includes(item) ? selected.filter(t => t !== item) : [...selected, item])}/>)}</View><View style={s.card}><View style={s.rowBetween}><View style={{ flex: 1, gap: 6 }}><T style={s.label}>Step-free route</T><T style={s.small}>Explore rooms without stairs.</T></View><Switch accessibilityLabel="Step-free route" value={stepFree} onValueChange={setStepFree} trackColor={{ true: c.green, false: c.border }}/></View></View><Notice icon="compass-outline">Routes use the sample room order and allow two minutes between works. Your active tour is saved on this device.</Notice>{state.tour && <Notice>Creating a new route replaces your current tour and its explored stops.</Notice>}<Button title="Find my route" icon="arrow-forward" onPress={plan}/></ModalPage>;
}

export function FeedbackScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, 'Feedback'>) {
  const { dispatch } = useStore(); const id = route.params?.artworkId;
  const [type, setType] = useState('Accuracy'), [message, setMessage] = useState(''), [notice, setNotice] = useState('');
  const valid = message.trim().length >= 5;
  return <ModalPage><Title>Your perspective{`\n`}matters.</Title><T style={s.muted}>{id ? `A thought about ${artwork(id)?.title}.` : 'A thought, a correction, a new possibility.'}</T><View style={s.wrap}>{['Accuracy', 'Accessibility', 'Suggestion'].map(value => <Chip key={value} label={value} active={type === value} onPress={() => setType(value)}/>)}</View><TextInput accessibilityLabel="Your feedback" value={message} onChangeText={setMessage} multiline maxLength={2000} placeholder="Tell us what you noticed…" placeholderTextColor={c.muted} style={[s.input, { minHeight: 180, textAlignVertical: 'top' }]}/><Notice>Feedback is saved as a private draft on your device. Use Share to send it through an app of your choice; it is not sent to the museum automatically.</Notice>{!!notice && <Notice>{notice}</Notice>}<Button title="Save feedback draft" disabled={!valid} icon="bookmark-outline" onPress={() => { dispatch({ type: 'feedback', feedback: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toISOString(), artworkId: id, type, message: message.trim() } }); navigation.goBack(); }}/><Button title="Share feedback" disabled={!valid} secondary icon="share-outline" onPress={() => { void Share.share({ message: `Unframe · ${type}${id ? ` · ${artwork(id)?.title}` : ''}\n\n${message.trim()}` }).catch(() => setNotice('Sharing is not available. You can save this draft instead.')); }}/></ModalPage>;
}

export function AboutScreen() {
  return <ModalPage>
    <BrandLogo width={180}/><Title>A little more{`\n`}wonder.</Title>
    <T>A personal museum companion, made for your pace and your perspective.</T>
    <View style={s.card}><Section title="Museum collections"/><T style={s.muted}>Unframe brings together selected works from The Met and QAGOMA, with museum information and visit planning in one place.</T></View>
    <View style={s.card}><Section title="AI guidance"/><T style={s.muted}>Artwork scanning uses OpenCLIP and visit planning uses Qwen on your local AI server. You confirm every suggested artwork before an interpretation is generated from collection information.</T></View>
    <View style={s.card}><Section title="Your device, your choice"/><T style={s.muted}>Bookmarks, preferences, active tours, visit reflections and feedback drafts stay on this device. Location is optional and checked on your device to identify whether you are near The Met or GOMA. Coordinates are not saved. Opening Scan with camera access starts automatic sampling and sends frames to your local AI server for OpenCLIP matching. Scanning stops when you pause, leave the screen, put the app in the background or select a work. Frames are not saved to your photo library; temporary app files are deleted after each request. Unframe does not retain visitor camera frames on its server. Planning messages and preferences are processed by local Ollama Qwen and are not written to disk by Unframe. Models run on the server computer, which may be separate from this device.</T></View>
    <Notice icon="business-outline">The museum management workspace remains in the web project. This mobile prototype has its own on-device data; collection edits and visitor data do not sync with the website.</Notice>
    <T style={s.small}>Unframe · Mobile prototype 1.0.0{`\n`}Inspired by self-directed, location-aware museum experiences.</T>
  </ModalPage>;
}
