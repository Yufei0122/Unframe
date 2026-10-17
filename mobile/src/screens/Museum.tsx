import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloorPlan, type Floor } from '../components/FloorPlan';
import { images } from '../assets';
import { useMuseumLocation } from '../location';
import { useStore } from '../store';
import { Button, Icon, T, c, useRootNavigation } from '../ui';
import { ArtworkRail } from '../components/ArtworkRail';

export function MuseumScreen() {
  const { museumId } = useMuseumLocation();
  return <MuseumContent key={museumId}/>;
}

function MuseumContent() {
  const { museum, museumId } = useMuseumLocation();
  const museumArtworks = museum.artworks;
  const nav = useRootNavigation();
  const { storageError } = useStore();
  const insets = useSafeAreaInsets();
  const [screenHeight, setScreenHeight] = useState(770);
  const imageHeight = screenHeight >= 660 ? 149 : 115;
  const mapHeight = Math.max(190, Math.min(376, screenHeight - insets.top - imageHeight - 272));
  const [floor, setFloor] = useState<Floor>('1');
  const [room, setRoom] = useState<string | null>(null);
  const [search, setSearch] = useState(false), [query, setQuery] = useState('');
  const available = museumId === 'goma' || (floor === '1' || floor === '2') && (!room || room === 'European Paintings' || room === 'The Great Hall');
  const works = available ? museumArtworks.filter(a => (museumId !== 'goma' || !room || a.room === room) && `${a.title} ${a.artist}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const changeFloor = (value: Floor) => { setFloor(value); setRoom(null); };
  const showSearch = () => { setSearch(true); };
  return <SafeAreaView edges={['top']} style={styles.screen} onLayout={event => setScreenHeight(event.nativeEvent.layout.height)}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose museum" onPress={() => nav.navigate('MuseumSelect')} style={styles.museumButton}><T numberOfLines={1} style={styles.museumName}>{museum.name}</T><Icon name="chevron-down" size={16}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Scan an artwork" onPress={() => nav.navigate('Lookup')} style={styles.scan}><Icon name="scan-outline" size={19}/></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <FloorPlan museumId={museumId} floor={floor} setFloor={changeFloor} room={room} onRoom={setRoom} onSearch={showSearch} height={mapHeight}/>
      <View style={styles.artworks}>
        <View style={styles.sectionHeader}><T accessibilityRole="header" style={styles.sectionTitle}>{room || 'Nearby Artworks'}</T><Pressable accessibilityRole="button" accessibilityLabel="View all nearby artworks" onPress={() => nav.navigate('NearbyArtworks')} style={styles.viewAll}><T style={styles.viewAllText}>View all</T><Icon name="arrow-forward" size={14}/></Pressable></View>
        {search && <View style={styles.search}><Icon name="search-outline" size={18}/><TextInput autoFocus accessibilityLabel="Search museum artworks" value={query} onChangeText={setQuery} placeholder="Artwork or artist" placeholderTextColor={c.muted} style={styles.searchInput}/><Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={() => { setSearch(false); setQuery(''); }} style={styles.closeSearch}><Icon name="close" size={18}/></Pressable></View>}
        {works.length ? <ArtworkRail>
          {works.map(art => <Pressable key={art.id} accessibilityRole="button" accessibilityLabel={`Explore ${art.title}`} onPress={() => nav.navigate('Artwork', { id: art.id })} style={({ pressed }) => [styles.artCard, pressed && { opacity: .75 }]}>
            <Image source={images[art.id]} style={[styles.artImage, { height: imageHeight }]} accessibilityLabel={art.title}/>
            <View style={styles.distance}><Icon name="location-outline" size={12} color={c.white}/><T style={styles.distanceText}>{art.demoDistance} m</T></View>
          </Pressable>)}
        </ArtworkRail> : <View style={styles.empty}><Icon name="images-outline" size={26}/><T style={styles.emptyTitle}>{query ? 'No matching artworks' : 'Room to discover'}</T><T style={styles.emptyText}>{query ? 'Try another artwork or artist.' : 'Choose another floor or reset the map.'}</T><Button title="Reset map" secondary onPress={() => { changeFloor('1'); setQuery(''); }}/></View>}
      </View>
      {storageError && <T accessibilityRole="alert" style={styles.storageError}>{storageError}</T>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg }, header: { height: 67, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.border, gap: 9 },
  museumButton: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8, minHeight: 44 }, museumName: { fontSize: 15, lineHeight: 22, flexShrink: 1, letterSpacing: -.3 }, scan: { width: 35, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 14 },
  artworks: { borderTopWidth: 1, borderColor: c.border, paddingTop: 17 }, sectionHeader: { paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', gap: 5, alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, lineHeight: 23, fontWeight: '500', color: '#161D19' }, viewAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 }, viewAllText: { fontSize: 12, lineHeight: 18 },
  artCard: { width: 154, borderRadius: 12, overflow: 'hidden', backgroundColor: c.sand }, artImage: { width: '100%', height: 149, backgroundColor: c.sand }, distance: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#17271FCC', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12 }, distanceText: { fontSize: 10, lineHeight: 14, color: c.white },
  search: { marginHorizontal: 18, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingLeft: 12 }, searchInput: { flex: 1, minHeight: 44, paddingHorizontal: 8, fontSize: 13, color: c.ink }, closeSearch: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { margin: 18, padding: 20, alignItems: 'center', gap: 13, borderRadius: 15, backgroundColor: '#EFEDE7' }, emptyTitle: { fontSize: 16, fontWeight: '500' }, emptyText: { fontSize: 12, lineHeight: 20, color: c.muted },
  storageError: { fontSize: 12, color: '#A34B38', margin: 18 },
});
