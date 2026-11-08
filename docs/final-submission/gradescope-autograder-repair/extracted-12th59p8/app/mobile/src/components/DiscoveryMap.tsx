import React from 'react';
import { Pressable, View } from 'react-native';
import { T } from '../ui';
import type { MuseumPlace } from '../discovery';
import type { DeviceCoordinates } from '../location';

export type DiscoveryMapProps = { places: MuseumPlace[]; selectedId: string; coordinates: DeviceCoordinates | null; onSelect: (id: string) => void; height: number; active: boolean };
// OpenLayers is loaded only by the web implementation.
export function DiscoveryMap({ places, onSelect, height }: DiscoveryMapProps) {
  return <View style={{ minHeight: height, padding: 20 }}><T>Explore these museums on the web map.</T>{places.map(place => <Pressable key={place.id} onPress={() => onSelect(place.id)}><T style={{ padding: 12 }}>{place.name}</T></Pressable>)}</View>;
}
