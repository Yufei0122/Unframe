import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { images } from '../assets';
import { useMuseumLocation } from '../location';
import { Icon, T, c, useRootNavigation } from '../ui';

export function NearbyArtworksScreen() {
  const { museum } = useMuseumLocation();
  const nav = useRootNavigation();
  return <SafeAreaView edges={['bottom']} style={styles.screen}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View><T accessibilityRole="header" style={styles.title}>Nearby Artworks</T><T style={styles.subtitle}>{museum.shortName}</T></View>
    <View style={styles.grid}>{museum.artworks.map(art => <Pressable key={art.id} accessibilityRole="button" accessibilityLabel={`Explore ${art.title}`} onPress={() => nav.navigate('Artwork', { id: art.id })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Image source={images[art.id]} accessibilityLabel={art.title} style={styles.image}/><View style={styles.distance}><Icon name="location-outline" size={12} color={c.white}/><T style={styles.distanceText}>{art.demoDistance} m</T></View>
    </Pressable>)}</View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: c.bg }, content: { padding: 18, paddingBottom: 34, gap: 20 }, title: { fontFamily: 'Georgia', fontSize: 31, lineHeight: 38, color: c.ink }, subtitle: { fontSize: 11, lineHeight: 18, color: c.muted }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, card: { width: '48.5%', aspectRatio: .82, borderRadius: 14, overflow: 'hidden', backgroundColor: c.sand }, pressed: { opacity: .78, transform: [{ scale: .98 }] }, image: { width: '100%', height: '100%' }, distance: { position: 'absolute', left: 9, bottom: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#17271FCC', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14 }, distanceText: { color: c.white, fontSize: 10, lineHeight: 13 } });
