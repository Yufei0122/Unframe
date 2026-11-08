import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloorPlan, type Floor } from '../components/FloorPlan';
import { images } from '../assets';
import { useMuseumLocation } from '../location';
import { useStore } from '../store';
import { Button, Icon, T, c, serif, useRootNavigation } from '../ui';
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
  const mapHeight = Math.max(210, Math.min(300, Math.round((screenHeight - insets.top) * .39)));
  const [floor, setFloor] = useState<Floor>('1');
  const [room, setRoom] = useState<string | null>(null);
  const [search, setSearch] = useState(false), [query, setQuery] = useState('');
  const available = museumId !== 'met' || (floor === '1' || floor === '2') && (!room || room === 'European Paintings' || room === 'The Great Hall');
  const works = available ? museumArtworks.filter(a => (museumId === 'met' || !room || a.room === room) && `${a.title} ${a.artist}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const changeFloor = (value: Floor) => { setFloor(value); setRoom(null); };
  const showSearch = () => { setSearch(true); };
  return <SafeAreaView edges={['top']} style={styles.screen} onLayout={event => setScreenHeight(event.nativeEvent.layout.height)}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose museum" onPress={() => nav.popTo('MuseumSelect')} style={styles.museumButton}><View><T style={styles.eyebrow}>EXPLORE</T><T numberOfLines={1} style={styles.museumName}>{museum.shortName}</T></View><Icon name="chevron-down" size={16}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Scan an artwork" onPress={() => nav.navigate('Lookup')} style={styles.scan}><Icon name="scan-outline" size={19}/></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.mapCard}><FloorPlan museumId={museumId} floor={floor} setFloor={changeFloor} room={room} onRoom={setRoom} onSearch={showSearch} height={mapHeight}/></View>
      <View style={styles.artworks}>
        <View style={styles.sectionHeader}><View style={styles.sectionHeading}><T accessibilityRole="header" style={styles.sectionTitle}>{room || 'Nearby Artworks'}</T><T style={styles.sectionSubtitle}>A little discovery, just around you</T></View><Pressable accessibilityRole="button" accessibilityLabel="View all nearby artworks" onPress={() => nav.navigate('NearbyArtworks')} style={styles.viewAll}><T style={styles.viewAllText}>View all</T></Pressable></View>
        {search && <View style={styles.search}><Icon name="search-outline" size={18}/><TextInput autoFocus accessibilityLabel="Search museum artworks" value={query} onChangeText={setQuery} placeholder="Artwork or artist" placeholderTextColor={c.muted} style={styles.searchInput}/><Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={() => { setSearch(false); setQuery(''); }} style={styles.closeSearch}><Icon name="close" size={18}/></Pressable></View>}
        {works.length ? <ArtworkRail>
          {works.map(art => <Pressable key={art.id} accessibilityRole="button" accessibilityLabel={`Explore ${art.title}`} onPress={() => nav.navigate('Artwork', { id: art.id })} style={({ pressed }) => [styles.artCard, pressed && { opacity: .75 }]}>
            <Image source={images[art.id]} style={styles.artImage} accessibilityLabel={art.title}/>
            <View style={styles.artDetails}>
              <T numberOfLines={1} style={styles.artTitle}>{art.title}</T>
              <T numberOfLines={1} style={styles.artArtist}>{art.artist}</T>
              <T numberOfLines={1} style={styles.artYear}>{art.year}</T>
              <View style={styles.distance}><Icon name="location-outline" size={12} color={c.muted}/><T style={styles.distanceText}>{art.demoDistance} m</T></View>
            </View>
          </Pressable>)}
        </ArtworkRail> : <View style={styles.empty}><Icon name="images-outline" size={26}/><T style={styles.emptyTitle}>{query ? 'No matching artworks' : 'Room to discover'}</T><T style={styles.emptyText}>{query ? 'Try another artwork or artist.' : 'Choose another floor or reset the map.'}</T><Button title="Reset map" secondary onPress={() => { changeFloor('1'); setQuery(''); }}/></View>}
      </View>
      {storageError && <T accessibilityRole="alert" style={styles.storageError}>{storageError}</T>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg }, header: { height: 82, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 9 },
  museumButton: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12, minHeight: 48 }, eyebrow: { fontSize: 8, lineHeight: 13, letterSpacing: 1.8, color: c.muted }, museumName: { fontFamily: serif, fontSize: 26, lineHeight: 32, flexShrink: 1, letterSpacing: -.6 }, scan: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8EDE4', alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 24 }, mapCard: { marginHorizontal: 16, borderRadius: 22, overflow: 'hidden', backgroundColor: '#F0EFE8', borderWidth: 1, borderColor: '#E7E4DB', paddingVertical: 5 },
  artworks: { paddingTop: 22 }, sectionHeader: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }, sectionHeading: { flex: 1, gap: 3 },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '500', color: c.ink }, sectionSubtitle: { fontSize: 11, lineHeight: 17, color: c.muted }, viewAll: { minHeight: 44, minWidth: 48, alignItems: 'flex-end', justifyContent: 'center' }, viewAllText: { fontSize: 11, lineHeight: 18, color: c.green },
  artCard: { width: 134, flexShrink: 0 }, artImage: { width: '100%', height: 162, borderRadius: 12, backgroundColor: c.sand }, artDetails: { paddingTop: 10, gap: 2 }, artTitle: { fontSize: 13, lineHeight: 19 }, artArtist: { fontSize: 11, lineHeight: 16 }, artYear: { fontSize: 10, lineHeight: 16, color: c.muted }, distance: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 4 }, distanceText: { fontSize: 10, lineHeight: 15, color: c.muted },
  search: { marginHorizontal: 18, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingLeft: 12 }, searchInput: { flex: 1, minHeight: 44, paddingHorizontal: 8, fontSize: 13, color: c.ink }, closeSearch: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { margin: 18, padding: 20, alignItems: 'center', gap: 13, borderRadius: 15, backgroundColor: '#EFEDE7' }, emptyTitle: { fontSize: 16, fontWeight: '500' }, emptyText: { fontSize: 12, lineHeight: 20, color: c.muted },
  storageError: { fontSize: 12, color: '#A34B38', margin: 18 },
});
