import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloorPlan, type Floor } from '../components/FloorPlan';
import { images } from '../assets';
import { useMuseumLocation } from '../location';
import { useStore } from '../store';
import { Button, Icon, T, c, useRootNavigation } from '../ui';

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
  const [search, setSearch] = useState(false), [query, setQuery] = useState(''), [viewAll, setViewAll] = useState(false);
  const available = museumId === 'goma' || (floor === '1' || floor === '2') && (!room || room === 'European Paintings' || room === 'The Great Hall');
  const works = available ? museumArtworks.filter(a => (museumId !== 'goma' || !room || a.room === room) && `${a.title} ${a.artist}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const changeFloor = (value: Floor) => { setFloor(value); setRoom(null); };
  const showSearch = () => { setSearch(true); setViewAll(true); };
  return <SafeAreaView edges={['top']} style={styles.screen} onLayout={event => setScreenHeight(event.nativeEvent.layout.height)}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose museum" onPress={() => nav.navigate('MuseumSelect')} style={styles.museumButton}><T numberOfLines={1} style={styles.museumName}>{museum.name}</T><Icon name="chevron-down" size={16}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Scan an artwork" onPress={() => nav.navigate('Lookup')} style={styles.scan}><Icon name="scan-outline" size={19}/></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <FloorPlan museumId={museumId} floor={floor} setFloor={changeFloor} room={room} onRoom={setRoom} onSearch={showSearch} height={mapHeight}/>
      <View style={styles.mapCaption}><View style={styles.demoDot}/><T style={styles.caption}>Illustrative map · demo position & distances</T></View>
      <View style={styles.artworks}>
        <View style={styles.sectionHeader}><View><T accessibilityRole="header" style={styles.sectionTitle}>{room || (viewAll ? 'Museum Artworks' : 'Nearby Artworks')}</T><T style={styles.sectionSubtitle}>{floor === '1' ? 'A little discovery, just around you' : `Explore demo floor ${floor}`}</T></View><Pressable accessibilityRole="button" accessibilityLabel={viewAll ? 'Show nearby artworks' : 'View all artworks'} onPress={() => { setViewAll(!viewAll); setRoom(null); changeFloor('1'); }} style={styles.viewAll}><T style={styles.viewAllText}>{viewAll ? 'Nearby' : 'View all'}</T></Pressable></View>
        {search && <View style={styles.search}><Icon name="search-outline" size={18}/><TextInput autoFocus accessibilityLabel="Search museum artworks" value={query} onChangeText={setQuery} placeholder="Artwork or artist" placeholderTextColor={c.muted} style={styles.searchInput}/><Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={() => { setSearch(false); setQuery(''); }} style={styles.closeSearch}><Icon name="close" size={18}/></Pressable></View>}
        {works.length ? <ScrollView horizontal={!viewAll} showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.cards, viewAll && styles.grid]}>
          {works.map(art => <Pressable key={art.id} accessibilityRole="button" accessibilityLabel={`Explore ${art.title}`} onPress={() => nav.navigate('Artwork', { id: art.id })} style={({ pressed }) => [styles.artCard, viewAll && styles.gridCard, pressed && { opacity: .75 }]}>
            <Image source={images[art.id]} style={[styles.artImage, { height: imageHeight }]} accessibilityLabel={art.title}/>
            <T numberOfLines={1} style={styles.artTitle}>{art.title}</T>
            <T numberOfLines={1} style={styles.artist}>{art.artist}</T>
            <T style={styles.year}>{art.year}</T>
            <View style={styles.distance}><Icon name="location-outline" size={12}/><T style={styles.distanceText}>{art.demoDistance} m</T></View>
          </Pressable>)}
        </ScrollView> : <View style={styles.empty}><Icon name="images-outline" size={26}/><T style={styles.emptyTitle}>{query ? 'No matching artworks' : 'Room to discover'}</T><T style={styles.emptyText}>{query ? 'Try an artist name or artwork title.' : 'This demo has ' + museumArtworks.length + ' works. Reset the map to explore this collection.'}</T><Button title="Show demo artworks" secondary onPress={() => { changeFloor('1'); setQuery(''); }}/></View>}
      </View>
      {storageError && <T accessibilityRole="alert" style={styles.storageError}>{storageError}</T>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg }, header: { height: 67, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.border, gap: 9 },
  museumButton: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8, minHeight: 44 }, museumName: { fontSize: 15, lineHeight: 22, flexShrink: 1, letterSpacing: -.3 }, scan: { width: 35, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 14 }, mapCaption: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingBottom: 11, paddingTop: 1 }, demoDot: { height: 4, width: 4, borderRadius: 2, backgroundColor: '#B0A28A' }, caption: { fontSize: 9, lineHeight: 14, color: '#8A857D' },
  artworks: { borderTopWidth: 1, borderColor: c.border, paddingTop: 17 }, sectionHeader: { paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', gap: 5, alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, lineHeight: 23, fontWeight: '500', color: '#161D19' }, sectionSubtitle: { fontSize: 11, lineHeight: 18, color: '#73706A', marginTop: 1 }, viewAll: { minHeight: 44, justifyContent: 'center' }, viewAllText: { fontSize: 12, lineHeight: 18 },
  cards: { gap: 13, paddingHorizontal: 18, paddingBottom: 5 }, grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 23 }, artCard: { width: 122 }, gridCard: { width: '47%' },
  artImage: { width: '100%', height: 149, borderRadius: 11, backgroundColor: c.sand }, artTitle: { fontSize: 13, lineHeight: 19, marginTop: 9, color: '#181C19' }, artist: { fontSize: 10, lineHeight: 17, color: '#353A34' }, year: { fontSize: 10, lineHeight: 16, color: '#656660' }, distance: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 9 }, distanceText: { fontSize: 10, lineHeight: 16, color: '#60635C' },
  search: { marginHorizontal: 18, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingLeft: 12 }, searchInput: { flex: 1, minHeight: 44, paddingHorizontal: 8, fontSize: 13, color: c.ink }, closeSearch: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { margin: 18, padding: 20, alignItems: 'center', gap: 13, borderRadius: 15, backgroundColor: '#EFEDE7' }, emptyTitle: { fontSize: 16, fontWeight: '500' }, emptyText: { fontSize: 12, lineHeight: 20, color: c.muted },
  storageError: { fontSize: 12, color: '#A34B38', margin: 18 },
});
