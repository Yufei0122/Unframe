import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import type { RootStackParams } from '../model';
import { distanceMeters } from '../museum';
import { cityPlaces, type CityId } from '../discovery';
import { useMuseumLocation, locationLabel } from '../location';
import { useStore } from '../store';
import { DiscoveryMap } from '../components/DiscoveryMap';
import { SwipeScene } from '../components/SwipeScene';
import { PreviewBackdrop } from '../components/PreviewBackdrop';
import { Icon, T, serif } from '../ui';

export function MuseumSelectScreen({ navigation }: NativeStackScreenProps<RootStackParams, 'MuseumSelect'>) {
  const { museumId, location, coordinates, selectMuseum, locate } = useMuseumLocation();
  const { state } = useStore();
  const focused = useIsFocused();
  const [city, setCity] = useState<CityId>(museumId === 'goma' ? 'brisbane' : 'new-york');
  const [previewId, setPreviewId] = useState<string>(museumId);
  const [held, setHeld] = useState(false), [visible, setVisible] = useState(true);
  const [drag, setDrag] = useState(0);
  const [interaction, setInteraction] = useState(0);
  const [height, setHeight] = useState(820), [reduceMotion, setReduceMotion] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const manual = useRef(false);
  const places = useMemo(() => cityPlaces(city), [city]);
  const cityImages = useMemo(() => places.map(item => item.image), [places]);
  const place = places.find(item => item.id === previewId) || places[0];
  const fade = useRef(new Animated.Value(1)).current;
  const direction = useRef(1);
  const adjacent = drag === 0 ? null : places[(places.findIndex(item => item.id === place.id) + (drag < 0 ? 1 : -1) + places.length) % places.length];
  const heroHeight = Math.max(510, Math.min(590, height * .64)) + (state.preferences.largeText ? 90 : 0);
  const mapHeight = Math.max(360, height - heroHeight - 65 + 28);
  useEffect(() => {
    if (!manual.current) { setCity(museumId === 'goma' ? 'brisbane' : 'new-york'); setPreviewId(museumId); }
  }, [museumId]);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (!focused || held || !visible || reduceMotion) return;
    const timer = setTimeout(() => { direction.current = 1; setPreviewId(places[(places.findIndex(item => item.id === place.id) + 1) % places.length].id); }, 10000);
    return () => clearTimeout(timer);
  }, [place.id, places, focused, held, visible, reduceMotion, interaction]);
  useEffect(() => { if (!focused) setHeld(false); }, [focused]);
  useEffect(() => {
    setLinkError(false);
    if (reduceMotion || !focused) { fade.setValue(1); return; }
    fade.setValue(0);
    const animation = Animated.timing(fade, { toValue: 1, duration: 620, useNativeDriver: Platform.OS !== 'web' });
    animation.start(); return () => animation.stop();
  }, [place.id, reduceMotion, focused, fade]);
  const preview = (id: string, step?: number) => { manual.current = true; direction.current = step ?? (places.findIndex(item => item.id === id) >= places.findIndex(item => item.id === place.id) ? 1 : -1); setPreviewId(id); setInteraction(value => value + 1); };
  const changeCity = (next: CityId) => { manual.current = true; direction.current = 1; setCity(next); setPreviewId(cityPlaces(next)[0].id); setInteraction(value => value + 1); };
  const cycle = (step: number) => preview(places[(places.findIndex(item => item.id === place.id) + step + places.length) % places.length].id, step);
  const choose = () => {
    if (place.demoMuseumId) { selectMuseum(place.demoMuseumId); navigation.navigate('Welcome'); }
    else { void Linking.openURL(place.website).catch(() => setLinkError(true)); }
  };
  const meters = coordinates ? distanceMeters(coordinates, place) : null;
  const distance = meters == null ? locationLabel(location.status) : (meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toLocaleString('en', { maximumFractionDigits: 1 }) + ' km') + ' · straight line';
  return <SafeAreaView edges={['top']} style={styles.screen} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
    {focused && <StatusBar style="dark"/>}
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
      <SwipeScene onSwipe={cycle} onDrag={setDrag} onHold={setHeld} onVisibility={setVisible}>
      <View testID="museum-scene" style={[styles.hero, { height: heroHeight }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PreviewBackdrop id={place.id} image={place.image} cityImages={cityImages} adjacentImage={adjacent?.image ?? null} drag={drag} direction={direction.current} reducedMotion={reduceMotion} fade={fade}/>
          <LinearGradient colors={['#E9F2F5F5', '#E6EFF6CF', '#EFF2E68A', '#172D3F20', '#F5F5EDDE']} locations={[0, .18, .53, .86, 1]} style={StyleSheet.absoluteFill}/>
        </View>
        <View style={styles.header}><View style={{ width: 42 }}/><T accessibilityRole="header" style={styles.brand}>Unframe</T><Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => navigation.navigate('Home', { screen: 'You' })} style={styles.profile}><Icon name="person-circle-outline" size={32} color="#213F49"/></Pressable></View>
        <View style={styles.location}>
          <Icon name="location" size={24} color="#29434C"/><View style={{ flex: 1 }}><T style={styles.eyebrow}>{meters != null && meters < 800 && coordinates?.accuracy != null && coordinates.accuracy <= 300 ? 'LOCATED NEAR' : 'EXPLORE MUSEUMS'}</T><T style={styles.area}>{place.area}</T></View>
        </View>
        <Animated.View pointerEvents="none" style={[styles.copy, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [13, 0] }) }] }]}>
          <T style={styles.featured}>{place.demoMuseumId ? 'FEATURED · VISIT DEMO' : 'AROUND YOU · MUSEUM PREVIEW'}</T>
          <T testID="preview-title" accessibilityRole="header" style={[styles.museumTitle, height < 700 && { fontSize: 36, lineHeight: 39 }]}>{place.title}</T>
          <T style={styles.subtitle}>{place.description}</T>
        </Animated.View>
        <Animated.View style={[styles.choice, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <View style={styles.distanceRow}><Icon name="location-outline" color="#233C44" size={17}/><T style={styles.distance}>{distance}</T></View>
          <Pressable accessibilityRole="button" accessibilityLabel={place.demoMuseumId ? 'Choose ' + place.shortName : 'Visit ' + place.shortName + ' website'} onPress={choose} style={({ pressed }) => [styles.choose, pressed && { opacity: .8 }]}><T style={styles.chooseText}>{place.demoMuseumId ? 'Choose' : 'Explore'}</T><Icon name={place.demoMuseumId ? 'arrow-forward' : 'open-outline'} size={22} color="white"/></Pressable>
          {linkError && <T style={styles.distance}>Could not open website. Please try again.</T>}
        </Animated.View>
        <View style={styles.pager} pointerEvents="none">
          <View style={styles.dots}>{places.map(item => <View key={item.id} style={styles.dotTouch}><View style={[styles.dot, place.id === item.id && styles.activeDot]}/></View>)}</View>
          <T style={{ fontSize: 9, color: '#415E69', marginLeft: 12 }}>{reduceMotion ? 'Swipe to discover' : 'Swipe · changes every 10s'}</T>
        </View>
      </View>
      </SwipeScene>
      <View style={styles.mapSheet}>
        <View style={styles.handle}/>
        <View style={styles.mapHeader}><View style={styles.cities}>{(['new-york', 'brisbane'] as CityId[]).map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel={'Show ' + (id === 'new-york' ? 'New York' : 'Brisbane')} accessibilityState={{ selected: city === id }} aria-pressed={city === id} onPress={() => changeCity(id)} style={[styles.city, city === id && styles.activeCity]}><T style={[styles.cityText, city === id && { color: '#184C88' }]}>{id === 'new-york' ? 'New York' : 'Brisbane'}</T></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Refresh my location" accessibilityState={{ disabled: location.status === 'loading' }} disabled={location.status === 'loading'} onPress={() => { void locate(); }} style={styles.locate}>{location.status === 'loading' ? <ActivityIndicator color="#245994" size="small"/> : <Icon name="navigate-outline" size={20} color="#245994"/>}</Pressable></View>
        <View>
          <DiscoveryMap places={places} selectedId={place.id} coordinates={coordinates} onSelect={preview} height={mapHeight} active={focused}/>
          <Pressable accessibilityRole="button" accessibilityLabel={place.demoMuseumId ? 'Open ' + place.shortName + ' welcome' : 'Open ' + place.shortName + ' official website'} onPress={choose} style={styles.mapLabel}><Image source={place.image} style={styles.thumbnail}/><View style={{ flex: 1 }}><T style={styles.mapName}>{place.name}</T><T style={styles.mapDistance}>{place.demoMuseumId ? 'Visit demo available' : 'Preview · official website'}</T></View><Icon name="chevron-forward" size={18} color="#40515C"/></Pressable>
        </View>
      </View>
      <T style={styles.credit}>{place.credit}</T>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E5EDF0' }, hero: { overflow: 'hidden', backgroundColor: '#BACCD7' },
  header: { marginHorizontal: 22, marginTop: 12, height: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { fontFamily: serif, fontSize: 31, lineHeight: 40, color: '#123943', letterSpacing: -1 }, profile: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  location: { marginHorizontal: 26, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }, eyebrow: { fontSize: 8, lineHeight: 14, letterSpacing: 1.8, color: '#324A54' }, area: { fontSize: 13, lineHeight: 21, color: '#2C4350' },
  copy: { position: 'absolute', top: 137, left: 28, right: 23 }, featured: { fontSize: 9, lineHeight: 16, letterSpacing: 2.5, color: '#2F536C' }, museumTitle: { fontFamily: serif, fontSize: 40, lineHeight: 43, letterSpacing: -1.8, color: '#153541', marginTop: 8 }, subtitle: { fontSize: 14, lineHeight: 21, marginTop: 13, color: '#304550' },
  choice: { position: 'absolute', bottom: 77, left: 28, right: 24, gap: 9 }, distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, distance: { fontSize: 10, lineHeight: 16, color: '#233C44', backgroundColor: '#FAFCF2C7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  choose: { alignSelf: 'flex-start', minWidth: 133, minHeight: 47, borderRadius: 27, borderWidth: 1.5, borderColor: '#FFFEF4', backgroundColor: '#1D548E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 20, shadowColor: '#173750', shadowOpacity: .2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, chooseText: { fontFamily: serif, fontSize: 23, lineHeight: 30, color: 'white' },
  pager: { position: 'absolute', bottom: 30, left: 38, right: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40 }, dots: { flexDirection: 'row' }, dotTouch: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' }, dot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#AEBAC0' }, activeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#245995' },
  mapSheet: { marginTop: -28, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', borderTopWidth: 1.5, borderColor: '#FFFFFF', backgroundColor: '#F5F7F2', paddingTop: 8 }, handle: { alignSelf: 'center', height: 4, width: 36, borderRadius: 3, backgroundColor: '#B7C0BC' },
  mapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 51 }, cities: { flexDirection: 'row', gap: 6 }, city: { paddingHorizontal: 14, minHeight: 34, borderRadius: 18, justifyContent: 'center' }, activeCity: { backgroundColor: '#E3EBEE' }, cityText: { fontSize: 11, lineHeight: 17, color: '#747F81' }, locate: { height: 40, width: 40, justifyContent: 'center', alignItems: 'center' },
  mapLabel: { position: 'absolute', top: 13, right: 20, left: 78, flexDirection: 'row', gap: 10, alignItems: 'center', padding: 8, borderRadius: 15, backgroundColor: '#FFFFFDF2', shadowColor: '#36474E', shadowOpacity: .16, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } }, thumbnail: { height: 55, width: 48, borderRadius: 9 }, mapName: { fontFamily: serif, fontSize: 16, lineHeight: 19, color: '#233D46' }, mapDistance: { fontSize: 10, lineHeight: 16, color: '#77818A' }, credit: { textAlign: 'center', fontSize: 8, lineHeight: 14, color: '#63746D', padding: 3 },
});
