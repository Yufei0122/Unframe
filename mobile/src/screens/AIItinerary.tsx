import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParams } from '../model';
import { Button, Notice, T, Title, s } from '../ui';
import { FloorPlan, type Floor } from '../components/FloorPlan';
import { museums } from '../museum';

export function AIItineraryScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, 'AIItinerary'>) {
  const itinerary = route.params.itinerary;
  const museumId = route.params.museumId || 'met';
  const { graph } = museums[museumId];
  const [floor, setFloor] = useState<Floor>('1'), [room, setRoom] = useState<string | null>(null);
  return <ScrollView contentContainerStyle={s.page}>
    <Title>Your itinerary</Title>
    <T>{itinerary.estimatedMinutes} minutes · {itinerary.estimatedWalkingDistance} m walking (demo)</T>
    <Button title="Edit visit preferences" secondary icon="options-outline" onPress={() => navigation.goBack()}/>
    {!!itinerary.warning && <Notice>{itinerary.warning}</Notice>}
    <T style={s.small}>{itinerary.recommendationSource === 'gemini' ? 'AI recommendation' : 'Local recommendation'} · {itinerary.reasoningSummary}</T>
    <FloorPlan museumId={museumId} floor={floor} setFloor={setFloor} room={room} onRoom={setRoom} onSearch={() => navigation.navigate('Lookup')} height={300} routePaths={itinerary.navigation.map(n => n.nodes)}/>
    <T style={s.small}>{itinerary.mapNotice}</T>
    {itinerary.route.map((stop, i) => <View key={stop.artworkId} style={s.card}>
      <T style={s.sectionTitle}>{stop.order}. {stop.title}</T>
      <T>{stop.estimatedVisitMinutes} minutes with the work · {itinerary.navigation[i].distance} m to this stop</T>
      <T style={s.small}>{itinerary.navigation[i].nodes.map(id => graph.nodes.find(n => n.id === id)?.label || id).join(' → ')}</T>
      <Button title={`Visit ${stop.title}`} secondary onPress={() => navigation.navigate('Artwork', { id: stop.artworkId })}/>
    </View>)}
    <Notice>Walking time is included. This is an open itinerary ending at the last artwork; no return walk is included.</Notice>
  </ScrollView>;
}
