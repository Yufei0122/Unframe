import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Speech from 'expo-speech';
import { artwork, type RootStackParams } from '../model';
import { museumForArtwork } from '../museum';
import { images } from '../assets';
import { useStore } from '../store';
import { Button, Empty, Icon, Notice, T, c, s, serif } from '../ui';

export function ArtworkScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, 'Artwork'>) {
  const a = artwork(route.params.id);
  const museum = museumForArtwork(route.params.id);
  const museumArt = museum?.artworks.find(item => item.id === route.params.id);
  const { state, dispatch, storageError } = useStore();
  const insets = useSafeAreaInsets(); const { height } = useWindowDimensions();
  const [speaking, setSpeaking] = useState(false), [error, setError] = useState(''), [language, setLanguage] = useState<'en' | 'zh'>('en');
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [screenHeight, setScreenHeight] = useState(height);
  const generation = useRef(0);
  const isSpeaking = useRef(false);
  useEffect(() => {
    const stop = () => { generation.current++; isSpeaking.current = false; void Speech.stop(); setSpeaking(false); setElapsed(0); };
    const unsubscribe = navigation.addListener('blur', stop);
    return () => { unsubscribe(); generation.current++; isSpeaking.current = false; void Speech.stop(); };
  }, [navigation]);
  useEffect(() => { if (!speaking) return; const id = setInterval(() => setElapsed(value => value + 1), 1000); return () => clearInterval(id); }, [speaking]);
  if (!a) return <View style={[s.page, { paddingTop: insets.top + 30 }]}><Empty title="This work is unavailable." body="Return to the collection and choose another artwork."/><Button title="Back to the collection" onPress={() => navigation.goBack()}/></View>;
  const saved = state.saved.includes(a.id);
  const save = () => dispatch({ type: 'save', id: a.id });
  async function listen() {
    const token = ++generation.current;
    setError('');
    try {
      if (isSpeaking.current) { isSpeaking.current = false; setSpeaking(false); await Speech.stop(); return; }
      isSpeaking.current = true; setSpeaking(true); setElapsed(0);
      const done = () => { if (generation.current === token) { isSpeaking.current = false; setSpeaking(false); } };
      Speech.speak(language === 'zh' && museumArt ? museumArt.chineseIntroduction : `${a!.title}, by ${a!.artist}. ${a!.description} ${a!.detail}`, {
        language: language === 'zh' ? 'zh-CN' : 'en-US', rate: .9,
        onDone: done, onStopped: done, onError: () => { if (generation.current === token) { done(); setError('Audio is unavailable. You can read the introduction above.'); } },
      });
    } catch { if (generation.current === token) { isSpeaking.current = false; setSpeaking(false); setError('Audio is unavailable on this device.'); } }
  }
  function changeLanguage() { generation.current++; isSpeaking.current = false; void Speech.stop(); setSpeaking(false); setElapsed(0); setLanguage(value => value === 'en' ? 'zh' : 'en'); }
  return <View style={styles.screen} onLayout={event => setScreenHeight(event.nativeEvent.layout.height)}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 22) }}>
      <Image source={images[a.id]} style={[styles.image, { height: Math.max(245, Math.min(465, screenHeight * (screenHeight >= 800 ? .48 : .42))) }]} accessibilityLabel={a.title}/>
      <View style={styles.sheet}>
        <View style={styles.titleRow}><T accessibilityRole="header" style={styles.title}>{a.title}</T><Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved artworks' : 'Save artwork'} accessibilityState={{ selected: saved }} aria-pressed={saved} onPress={save} style={styles.heart}><Icon name={saved ? 'heart' : 'heart-outline'} size={27} color={saved ? '#A35E48' : '#17241D'}/></Pressable></View>
        <T style={styles.artist}>{a.artist}</T><T style={styles.metadata}>{a.year}</T><T style={styles.metadata}>{museumArt?.medium || a.category}</T><T style={styles.metadata}>{museum ? museum.name : 'Northbank Gallery · Fictional collection'}</T>
        {museum?.id === 'goma' && <T style={styles.metadata}>QAGOMA Collection · demo placement, display not confirmed</T>}
        <T accessibilityRole="header" style={styles.aboutTitle}>{language === 'zh' ? '关于作品' : 'About the Artwork'}</T>
        <T style={styles.description}>{language === 'zh' && museumArt ? museumArt.chineseIntroduction : `${a.description}${expanded ? `\n\n${a.detail}` : ''}`}</T>
        {language === 'en' && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Read less about the artwork' : 'Read more about the artwork'} onPress={() => setExpanded(!expanded)} style={{ paddingVertical: 7, alignSelf: 'flex-start' }}><T style={{ fontSize: 11, lineHeight: 18, color: c.muted }}>{expanded ? 'Read less −' : 'A closer look +'}</T></Pressable>}
        <View style={styles.audio}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Audio language: ${language === 'en' ? 'English. Switch to Chinese' : 'Chinese. Switch to English'}`} disabled={!museumArt} onPress={changeLanguage} style={styles.language}><Icon name="language-outline" size={23}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={speaking ? 'Stop introduction' : 'Play introduction'} onPress={() => { void listen(); }} style={({ pressed }) => [styles.play, pressed && { opacity: .8 }]}><Icon name={speaking ? 'stop' : 'play'} color="#FFFEF9" size={30}/></Pressable>
          <T style={styles.time}>{elapsed > 0 ? `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}` : language === 'en' ? 'EN' : '中文'}</T>
        </View>
        <T accessibilityLiveRegion="polite" style={styles.audioHint}>{speaking ? 'Playing introduction · tap to stop' : 'Tap play to hear the introduction'}</T>
        {(error || storageError) && <Notice>{error || storageError}</Notice>}
        {museumArt ? <Pressable accessibilityRole="link" accessibilityLabel={`View artwork source at ${museum?.collectionName}`} onPress={() => { void Linking.openURL(museumArt.sourceUrl).catch(() => setError('The source could not be opened. Please try again.')); }} style={styles.source}><T style={styles.sourceText}>From {museum?.collectionName} collection</T><Icon name="arrow-up-outline" size={12} color={c.muted}/></Pressable> : <View style={{ gap: 12, marginTop: 20 }}><Notice>{a.source}</Notice><Button title="Ask the guide" icon="sparkles-outline" onPress={() => navigation.popTo('Home', { screen: 'Guide', params: { artworkId: a.id } })}/></View>}
        {!!museumArt?.imageCredit && <T style={styles.sourceText}>{museumArt.imageCredit}</T>}
      </View>
    </ScrollView>
    <View pointerEvents="box-none" style={[styles.topButtons, { top: insets.top + 18 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to museum" onPress={() => navigation.goBack()} style={styles.topButton}><Icon name="chevron-back" size={23}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Unsave artwork' : 'Bookmark artwork'} accessibilityState={{ selected: saved }} aria-pressed={saved} onPress={save} style={styles.topButton}><Icon name={saved ? 'bookmark' : 'bookmark-outline'} size={21}/></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg }, image: { width: '100%', backgroundColor: '#637D7D' },
  topButtons: { position: 'absolute', left: 19, right: 19, flexDirection: 'row', justifyContent: 'space-between' }, topButton: { width: 39, height: 39, borderRadius: 22, backgroundColor: '#FFFEFC', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  sheet: { marginTop: -25, paddingHorizontal: 23, paddingTop: 20, backgroundColor: c.bg, borderTopLeftRadius: 27, borderTopRightRadius: 27 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, title: { fontFamily: serif, fontSize: 31, lineHeight: 40, letterSpacing: -.8, flex: 1, color: '#111C16' }, heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  artist: { fontSize: 15, lineHeight: 24, marginTop: 2, marginBottom: 2 }, metadata: { fontSize: 12, lineHeight: 20, color: '#494B45' },
  aboutTitle: { fontSize: 15, lineHeight: 23, fontWeight: '500', marginTop: 20, marginBottom: 8 }, description: { fontSize: 13, lineHeight: 20, color: '#333731' },
  audio: { height: 66, marginTop: 12, borderWidth: 1, borderColor: c.border, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  language: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  play: { width: 69, height: 69, borderRadius: 36, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#172E24', shadowColor: '#22372F', shadowOpacity: .18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  time: { width: 44, textAlign: 'center', fontSize: 13, lineHeight: 20 }, audioHint: { textAlign: 'center', marginTop: 13, fontSize: 11, lineHeight: 17, color: '#5C6059' },
  source: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }, sourceText: { fontSize: 10, lineHeight: 16, color: c.muted },
});
