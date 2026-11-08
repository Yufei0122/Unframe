import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { artwork, type ProfileStackParams } from '../model';
import { images, museumImages } from '../assets';
import { activityDateGroup, activityDateLabel, profileActivity } from '../profileData';
import { useStore } from '../store';
import { Icon, T, serif, useRootNavigation, type IconName } from '../ui';
import { ReflectionIllustration } from '../components/ProfileIllustrations';
import { CollectionEmpty, ProfileFilters, ProfilePage, ProfileSearch, pageStyles, profileColors as c, useProfileNavigation } from '../components/ProfilePage';

type Filter = 'All' | 'Visits' | 'Saves' | 'Routes' | 'AI';
const filters = [{ label: 'All' }, { label: 'Visits', icon: 'location' }, { label: 'Saves', icon: 'bookmark-outline' }, { label: 'Routes', icon: 'trail-sign-outline' }, { label: 'AI', icon: 'sparkles' }] as const;
const icons: Record<string, IconName> = { Visits: 'location', Saves: 'bookmark-outline', Routes: 'trail-sign-outline' };
export function RecentActivityScreen({ route }: NativeStackScreenProps<ProfileStackParams, 'RecentActivity'>) {
  const { state } = useStore(), nav = useRootNavigation(), navigation = useProfileNavigation();
  const [filter, setFilter] = useState<Filter>(route.params?.filter || 'All'), [query, setQuery] = useState(''), [searching, setSearching] = useState(false);
  const input = useRef<TextInput>(null);
  useEffect(() => { if (route.params?.filter) setFilter(route.params.filter); }, [route.params]);
  useEffect(() => { if (searching) input.current?.focus(); }, [searching]);
  const entries = profileActivity(state).filter(entry => (filter === 'All' || entry.kind === filter || (filter === 'AI' && entry.ai)) && `${entry.title} ${entry.subtitle} ${entry.body}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = ['TODAY', 'THIS MONTH', 'EARLIER', 'SAVED ON THIS DEVICE'].map(label => ({ label, entries: entries.filter(e => activityDateGroup(e.date) === label) })).filter(group => group.entries.length);
  return <ProfilePage title="Recent Activity" subtitle="A timeline of your museum moments." action={{ icon: 'search-outline', label: 'Search recent activity', run: () => { setSearching(true); input.current?.focus(); } }}>
    {searching && <ProfileSearch inputRef={input} value={query} onChange={setQuery} label="Search your activity…"/>}
    <ProfileFilters<Filter> items={[...filters]} value={filter} onChange={setFilter}/>
    {!entries.length && <CollectionEmpty title="Your story is still unfolding." body={filter === 'AI' ? 'Saved itineraries recommended by Qwen will appear here.' : filter === 'Visits' ? 'Finish a visit with visit history enabled to keep a reflection here.' : 'Save an artwork or a route, or complete a visit, to add a new moment.'} action={filter !== 'All' || query ? 'Show all activity' : 'Explore the collection'} onPress={() => filter !== 'All' || query ? (setFilter('All'), setQuery('')) : nav.navigate('Home', { screen: 'Discover' })}/>}
    {groups.map(group => <View style={styles.group} key={group.label}><T style={styles.dateGroup}>{group.label}</T>{group.entries.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`View activity: ${entry.title}`} onPress={() => entry.artworkId ? nav.navigate('Artwork', { id: entry.artworkId }) : entry.routeId ? navigation.navigate('SavedRouteDetails', { id: entry.routeId }) : entry.visitId ? navigation.navigate('VisitDetails', { id: entry.visitId }) : undefined} style={[pageStyles.card, styles.row]}>
      <View style={styles.thumbnail}>{entry.ai ? <ReflectionIllustration/> : entry.coverId || entry.museumId ? <Image source={entry.coverId ? images[entry.coverId] : museumImages[entry.museumId!]} style={styles.image}/> : <ReflectionIllustration/>}</View>
      <View style={styles.body}><View style={styles.metaRow}><Icon name={entry.ai ? 'sparkles' : icons[entry.kind]} size={16} color={entry.ai ? '#AB76BF' : c.gold}/><T style={styles.event}>{entry.label}</T><T style={styles.time}>{activityDateLabel(entry.date)}</T></View><T style={styles.title}>{entry.title}</T><T style={styles.subtitle}>{entry.subtitle}</T><T numberOfLines={2} style={styles.description}>{entry.body}</T></View><Icon name="chevron-forward-outline" size={18} color="#4D4841"/>
    </Pressable>)}</View>)}
  </ProfilePage>;
}
export function VisitDetailsScreen({ route }: NativeStackScreenProps<ProfileStackParams, 'VisitDetails'>) {
  const { state } = useStore(), nav = useRootNavigation();
  const visit = state.visits.find(item => item.id === route.params.id);
  return <ProfilePage title="Visit reflection" subtitle={visit ? new Date(visit.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Your museum moments.'}>
    {visit ? <>
      <View style={pageStyles.card}><T>{visit.summary}</T><T style={styles.description}>A reflection from your visited works · Template-generated</T></View>
      {visit.artworkIds.map(id => {
        const a = artwork(id); if (!a) return null;
        return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Revisit ${a.title}`} onPress={() => nav.navigate('Artwork', { id })} style={[pageStyles.card, styles.row]}>
          <Image source={images[id]} style={styles.thumbnail}/><View style={styles.body}><T style={styles.title}>{a.title}</T><T style={styles.subtitle}>{a.artist}</T></View><Icon name="chevron-forward-outline" size={18}/>
        </Pressable>;
      })}
    </> : <CollectionEmpty title="This visit is no longer saved." body="Visit history may have been cleared on this device."/>}
  </ProfilePage>;
}
const styles = StyleSheet.create({
  group: { gap: 8 }, dateGroup: { fontSize: 11, lineHeight: 18, letterSpacing: 2.4, color: '#72695F', marginTop: 3, marginLeft: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 6, minHeight: 102 }, thumbnail: { width: 82, height: 90, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E9E0D5' }, image: { width: '100%', height: '100%' },
  body: { flex: 1, gap: 3 }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }, event: { fontFamily: serif, fontSize: 12, lineHeight: 16, color: '#946A33', flexShrink: 1 }, time: { marginLeft: 'auto', fontSize: 9, lineHeight: 13, color: '#968C82' },
  title: { fontFamily: serif, fontSize: 18, lineHeight: 21, color: c.ink }, subtitle: { fontFamily: serif, fontSize: 13, lineHeight: 17, color: '#665B50' }, description: { fontSize: 10, lineHeight: 14, color: '#8C8278' },
});
