import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParams } from '../model';
import { Button, Icon, Notice, T, Title, c, s } from '../ui';
import { FloorPlan, type Floor } from '../components/FloorPlan';
import { museums } from '../museum';
import { useStore } from '../store';
import { saveMuseumRoute } from '../profileData';

export function AIItineraryScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, 'AIItinerary'>) {
  const itinerary = route.params.itinerary;
  const museumId = route.params.museumId || 'met';
  const { graph } = museums[museumId];
  const { state, dispatch } = useStore();
  const savedRoute = saveMuseumRoute(itinerary, museumId);
  const isSaved = state.savedRoutes?.some(r => r.id === savedRoute.id);
  const [floor, setFloor] = useState<Floor>('1'), [room, setRoom] = useState<string | null>(null);
  return <View style={styles.screen}><ScrollView contentContainerStyle={s.page}>
    <Title>Your itinerary</Title>
    <T>{itinerary.estimatedMinutes} minutes · {itinerary.estimatedWalkingDistance} m walking</T>
    {!!itinerary.warning && <Notice>{itinerary.warning}</Notice>}
    <T style={s.small}>{itinerary.recommendationSource === 'ollama' ? 'Qwen recommendation' : 'Local rules recommendation'} · {itinerary.reasoningSummary}</T>
    <FloorPlan museumId={museumId} floor={floor} setFloor={setFloor} room={room} onRoom={setRoom} onSearch={() => navigation.navigate('Lookup')} height={300} routePaths={itinerary.navigation.map(n => n.nodes)}/>
    {itinerary.route.map((stop, i) => <View key={stop.artworkId} style={s.card}>
      <T style={s.sectionTitle}>{stop.order}. {stop.title}</T>
      <T>{stop.estimatedVisitMinutes} minutes with the work · {itinerary.navigation[i].distance} m to this stop</T>
      <T style={s.small}>{itinerary.navigation[i].nodes.map(id => graph.nodes.find(n => n.id === id)?.label || id).join(' → ')}</T>
      <Button title={`Visit ${stop.title}`} secondary onPress={() => navigation.navigate('Artwork', { id: stop.artworkId })}/>
    </View>)}
    <Notice>Walking time is included. This is an open itinerary ending at the last artwork; no return walk is included.</Notice>
  </ScrollView>{!!itinerary.route.length && <Pressable accessibilityRole="button" accessibilityLabel={isSaved ? 'Unsave route' : 'Save route'} onPress={() => dispatch(isSaved ? { type: 'removeRoute', id: savedRoute.id } : { type: 'saveRoute', route: { ...savedRoute, savedAt: new Date().toISOString() } })} style={styles.save}><Icon name={isSaved ? 'bookmark' : 'bookmark-outline'} size={23} color={c.white}/></Pressable>}</View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, save: { position: 'absolute', right: 16, top: 18, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.green, shadowColor: '#1D3328', shadowOpacity: .2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 } });
