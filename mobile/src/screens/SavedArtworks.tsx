import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { artwork } from '../model';
import { images } from '../assets';
import { museumForArtwork } from '../museum';
import { useStore } from '../store';
import { Icon, T, serif, useRootNavigation } from '../ui';
import { CollectionEmpty, ProfileFilters, ProfilePage, ProfileSearch, pageStyles, profileColors as c } from '../components/ProfilePage';

type Filter = 'All' | 'Paintings' | 'Sculpture' | 'Immersive' | 'Recently Saved';
const filters = [{ label: 'All' }, { label: 'Paintings', icon: 'color-palette-outline' }, { label: 'Sculpture', icon: 'business-outline' }, { label: 'Immersive', icon: 'cube-outline' }, { label: 'Recently Saved', icon: 'time-outline' }] as const;
export function SavedArtworksScreen() {
  const { state, dispatch } = useStore(), nav = useRootNavigation();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<Filter>('All');
  const input = useRef<TextInput>(null);
  const saved = state.saved.map(artwork).filter(a => a !== undefined);
  const matching = saved.filter(a => {
    const category = a.category.toLowerCase();
    if (filter === 'Paintings' && category !== 'painting') return false;
    if (filter === 'Sculpture' && category !== 'sculpture') return false;
    if (filter === 'Immersive' && category !== 'installation') return false;
    if (filter === 'Recently Saved' && (!state.savedAt?.[a.id] || Date.now() - Date.parse(state.savedAt[a.id]) > 30 * 86400000)) return false;
    return `${a.title} ${a.artist} ${museumForArtwork(a.id)?.name || 'Northbank Gallery'}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  if (filter === 'Recently Saved') matching.sort((a, b) => Date.parse(state.savedAt?.[b.id] || '') - Date.parse(state.savedAt?.[a.id] || ''));
  const [featured, ...rest] = matching;
  const open = (id: string) => nav.navigate('Artwork', { id });
  const bookmark = (id: string, title: string) => <Pressable accessibilityRole="button" accessibilityLabel={`Unsave ${title}`} onPress={() => dispatch({ type: 'save', id })} style={styles.bookmark}><Icon name="bookmark" color={c.gold} size={21}/></Pressable>;
  return <ProfilePage title="Saved Artworks" subtitle="Your collected inspirations." action={{ icon: 'search-outline', label: 'Search saved artworks', run: () => input.current?.focus() }}>
    <ProfileSearch inputRef={input} value={query} onChange={setQuery} label="Search your saved artworks…"/>
    <ProfileFilters<Filter> items={[...filters]} value={filter} onChange={setFilter}/>
    {!featured ? <CollectionEmpty title={saved.length ? 'No matching artworks.' : 'Make room for a favourite.'} body={saved.length ? 'Try another search or filter to rediscover your collection.' : 'Tap the bookmark on an artwork to keep it here.'} action={saved.length ? 'Show all artworks' : 'Explore the collection'} onPress={() => saved.length ? (setQuery(''), setFilter('All')) : nav.navigate('Home', { screen: 'Discover' })}/> : <>
      <View style={[pageStyles.card, styles.feature]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${featured.title}`} onPress={() => open(featured.id)} style={styles.featureContent}>
          <Image source={images[featured.id]} accessibilityLabel={featured.title} style={styles.featureImage}/>
          <View style={styles.featureText}><View style={styles.badge}><Icon name="sparkles" size={13} color={c.gold}/><T style={styles.featureLabel}>Featured in your collection</T></View><T style={styles.featureTitle}>{featured.title}</T><T style={styles.artist}>{featured.artist}</T><T style={styles.meta}>{museumForArtwork(featured.id)?.name || 'Northbank Gallery · Sample'}</T><T numberOfLines={3} style={styles.quote}>{featured.description}</T></View>
        </Pressable>{bookmark(featured.id, featured.title)}
      </View>
      <View style={styles.grid}>{rest.map(a => <View key={a.id} style={[pageStyles.card, styles.artCard]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${a.title}`} onPress={() => open(a.id)}><Image source={images[a.id]} accessibilityLabel={a.title} style={styles.image}/><View style={styles.cardText}><T style={styles.title}>{a.title}</T><T style={styles.artist}>{a.artist}</T><T style={styles.meta}>{museumForArtwork(a.id)?.name || 'Northbank Gallery · Sample'}</T><T style={styles.meta}>{a.year}</T></View></Pressable>{bookmark(a.id, a.title)}
      </View>)}</View>
    </>}
  </ProfilePage>;
}
const styles = StyleSheet.create({
  feature: { padding: 7 }, featureContent: { flexDirection: 'row', gap: 11 }, featureImage: { width: '44%', height: 145, borderRadius: 9 }, featureText: { flex: 1, paddingTop: 4, gap: 3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 28, marginBottom: 4 }, featureLabel: { fontFamily: serif, fontSize: 10, lineHeight: 13, color: c.gold, flex: 1 },
  featureTitle: { fontFamily: serif, fontSize: 20, lineHeight: 22, color: '#24211E' }, artist: { fontFamily: serif, fontSize: 13, lineHeight: 16, color: '#4F4740' }, meta: { fontSize: 10, lineHeight: 14, color: c.muted },
  quote: { fontFamily: serif, fontSize: 13, lineHeight: 17, fontStyle: 'italic', color: '#8C8278', marginTop: 5 },
  bookmark: { position: 'absolute', top: 10, right: 9, width: 31, height: 35, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFCF5F5' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }, artCard: { width: '48.5%', padding: 5 }, image: { width: '100%', height: 120, borderRadius: 8 }, cardText: { padding: 2, gap: 1 }, title: { fontFamily: serif, fontSize: 16, lineHeight: 19, color: c.ink },
});
