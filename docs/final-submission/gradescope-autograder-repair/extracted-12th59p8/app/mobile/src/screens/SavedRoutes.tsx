import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { artwork, type ProfileStackParams, type SavedRoute } from '../model';
import { images, museumImages } from '../assets';
import { useMuseumLocation } from '../location';
import { savedRouteInfo } from '../profileData';
import { useStore } from '../store';
import { Button, Icon, Notice, T, serif, useRootNavigation } from '../ui';
import { CollectionEmpty, ProfileFilters, ProfilePage, ProfileSearch, pageStyles, profileColors as c, useProfileNavigation } from '../components/ProfilePage';

type Filter = 'All' | 'Nearby' | 'Quick Visit' | 'The Met' | 'GOMA' | 'QUT Art Museum';
const filters = [{ label: 'All' }, { label: 'Nearby', icon: 'location-outline' }, { label: 'Quick Visit', icon: 'time-outline' }, { label: 'The Met', icon: 'library-outline' }, { label: 'GOMA', icon: 'business-outline' }, { label: 'QUT Art Museum', icon: 'business-outline' }] as const;
export function SavedRoutesScreen() {
  const { state, dispatch } = useStore(), navigation = useProfileNavigation(), nav = useRootNavigation();
  const { location, museumId } = useMuseumLocation();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<Filter>('All'), [removed, setRemoved] = useState<SavedRoute | null>(null);
  const saved = state.savedRoutes || [];
  const matching = [...saved].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)).filter(route => {
    const info = savedRouteInfo(route);
    if (filter === 'Nearby' && !(location.status === 'nearby' && info.museumId === museumId)) return false;
    if (filter === 'Quick Visit' && info.minutes > 30) return false;
    if (filter === 'The Met' && info.museumId !== 'met') return false;
    if (filter === 'GOMA' && info.museumId !== 'goma') return false;
    if (filter === 'QUT Art Museum' && info.museumId !== 'qut') return false;
    return `${route.title} ${info.place} ${info.museum} ${info.description}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <ProfilePage title="Saved Routes" subtitle="Curated paths through art and place." action={{ icon: 'map-outline', label: 'Explore museums on the map', run: () => nav.popTo('MuseumSelect') }}>
    <ProfileSearch value={query} onChange={setQuery} label="Search your saved routes…"/>
    <ProfileFilters<Filter> items={[...filters]} value={filter} onChange={setFilter}/>
    {removed && <View style={styles.undo}><T style={styles.meta}>Route removed from your saved collection.</T><Pressable accessibilityRole="button" accessibilityLabel="Undo remove route" onPress={() => { dispatch({ type: 'saveRoute', route: removed }); setRemoved(null); }}><T style={styles.undoText}>Undo</T></Pressable></View>}
    {!matching.length && <CollectionEmpty title={saved.length ? 'No routes in this view.' : 'Your next art trail awaits.'} body={filter === 'Nearby' && location.status !== 'nearby' ? 'No nearby museum is confirmed. Enable location from the museum map, or browse all saved routes.' : saved.length ? 'Try another search or filter.' : 'Create a visit in Plan, then tap Save route on your itinerary. Your routes will appear here.'} action={saved.length ? 'Show all routes' : 'Plan a visit'} onPress={() => saved.length ? (setQuery(''), setFilter('All')) : nav.navigate('Home', { screen: 'Plan' })}/>}
    {matching.map((route, index) => {
      const info = savedRouteInfo(route), cover = info.museumId ? museumImages[info.museumId] : images[info.ids[0]];
      return <View key={route.id} style={[pageStyles.card, styles.routeCard]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open route: ${route.title}`} onPress={() => navigation.navigate('SavedRouteDetails', { id: route.id })} style={styles.routeContent}>
          <View style={styles.cover}><Image source={cover} style={styles.coverImage}/>{index === 0 && <View style={styles.feature}><Icon name="sparkles" size={13} color={c.gold}/><T style={styles.featureLabel}>Featured Route</T></View>}</View>
          <View style={styles.routeText}><T style={styles.routeTitle}>{route.title}</T><T style={styles.place}>{info.place}</T><T numberOfLines={3} style={styles.description}>{info.description}</T><View style={styles.facts}><Icon name="library-outline" size={17} color={c.gold}/><T style={styles.meta}>1 museum</T><Icon name="images-outline" size={17} color={c.gold}/><T style={styles.meta}>{info.ids.length} works</T></View><View style={styles.duration}><Icon name="time-outline" size={17} color={c.gold}/><T style={styles.meta}>{Math.ceil(info.minutes)} min</T><View style={styles.arrow}><Icon name="chevron-forward-outline" size={21} color={c.gold}/></View></View></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove saved route: ${route.title}`} onPress={() => { setRemoved(route); dispatch({ type: 'removeRoute', id: route.id }); }} style={styles.bookmark}><Icon name="bookmark" size={20} color={c.gold}/></Pressable>
      </View>;
    })}
    {!!matching.length && <T style={styles.footnote}>Check current displays and access with the museum before your visit.</T>}
  </ProfilePage>;
}

export function SavedRouteDetailsScreen({ route }: NativeStackScreenProps<ProfileStackParams, 'SavedRouteDetails'>) {
  const { state } = useStore(), nav = useRootNavigation(), navigation = useProfileNavigation();
  const saved = state.savedRoutes?.find(r => r.id === route.params.id);
  if (!saved) return <ProfilePage title="Saved Route" subtitle="A little room to wander."><CollectionEmpty title="This route is no longer saved." body="Return to your routes to choose another trail." action="Saved Routes" onPress={() => navigation.navigate('SavedRoutes')}/></ProfilePage>;
  const info = savedRouteInfo(saved);
  return <ProfilePage title="Your Art Trail" subtitle={info.museum}>
    <T accessibilityRole="header" style={styles.detailTitle}>{saved.title}</T><T style={styles.description}>{info.description}</T>
    <T style={styles.place}>{info.ids.length} artworks · {Math.ceil(info.minutes)} minutes</T>
    {saved.kind === 'museum' && <Button title="Open itinerary and map" icon="map-outline" onPress={() => nav.navigate('AIItinerary', { itinerary: saved.itinerary, museumId: saved.museumId })}/>}
    {info.ids.map((id, index) => { const a = artwork(id); return a && <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${a.title}`} key={id} onPress={() => nav.navigate('Artwork', { id })} style={[pageStyles.card, styles.stop]}><Image source={images[id]} style={styles.stopImage}/><View style={{ flex: 1, gap: 4 }}><T style={styles.routeTitle}>{index + 1}. {a.title}</T><T style={styles.place}>{a.artist}</T><T style={styles.meta}>{a.minutes} min with the work</T></View><Icon name="chevron-forward-outline" color={c.gold}/></Pressable>; })}
    <Notice>{saved.kind === 'museum' ? saved.itinerary.mapNotice : (saved.plan.stepFree ? 'This route uses step-free stops.' : 'This route may include stairs.')}</Notice>
    <Button title="Back to saved routes" secondary onPress={() => navigation.navigate('SavedRoutes')}/>
  </ProfilePage>;
}
const styles = StyleSheet.create({
  routeCard: { padding: 6 }, routeContent: { flexDirection: 'row', gap: 11 }, cover: { width: '44%', minHeight: 167, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E2D7C6' }, coverImage: { width: '100%', height: '100%', position: 'absolute' },
  feature: { position: 'absolute', left: 5, top: 6, right: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFFAF1F0', borderRadius: 10, padding: 5 }, featureLabel: { fontFamily: serif, fontSize: 11, lineHeight: 14, color: '#8A622F' },
  routeText: { flex: 1, paddingTop: 29, paddingBottom: 6, gap: 5 }, routeTitle: { fontFamily: serif, fontSize: 18, lineHeight: 21, color: c.ink }, place: { fontSize: 11, lineHeight: 16, color: '#776E66' },
  description: { fontSize: 11, lineHeight: 16, color: '#8A8178', marginVertical: 2 }, facts: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 4 }, meta: { fontSize: 9, lineHeight: 14, color: '#8A8178' }, duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { marginLeft: 'auto', width: 30, height: 30, borderRadius: 20, backgroundColor: '#F4EDE2', alignItems: 'center', justifyContent: 'center' }, bookmark: { position: 'absolute', right: 9, top: 9, backgroundColor: '#F6F0E5', borderRadius: 11, width: 29, height: 32, alignItems: 'center', justifyContent: 'center' },
  undo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, undoText: { fontSize: 12, color: c.gold, textDecorationLine: 'underline' }, footnote: { fontSize: 10, lineHeight: 16, color: '#948A7F', textAlign: 'center' },
  detailTitle: { fontFamily: serif, fontSize: 27, lineHeight: 33, color: c.ink }, stop: { padding: 9, flexDirection: 'row', gap: 10, alignItems: 'center' }, stopImage: { width: 65, height: 76, borderRadius: 7 },
});
