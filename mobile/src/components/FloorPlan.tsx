import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Icon, T, c } from '../ui';
import graph from '../../../shared/met-graph.json';
import { GomaFloorPlan } from './GomaFloorPlan';
import type { MuseumId } from '../museum';

export const floors = ['3', '2', '1', 'B1'] as const;
export type Floor = typeof floors[number];
type Room = { label: string; x: number; y: number; w: number; h: number };
const layouts: Record<Floor, Room[]> = {
  '1': [
    { label: 'European\nPaintings', x: 35, y: 3, w: 32, h: 16 },
    { label: 'Arms and\nArmor', x: 12, y: 27, w: 21, h: 20 },
    { label: 'Egyptian\nArt', x: 76, y: 28, w: 23, h: 20 },
    { label: 'The Great\nHall', x: 37, y: 31, w: 32, h: 53 },
    { label: 'Greek and\nRoman Art', x: 8, y: 72, w: 29, h: 20 },
    { label: 'Modern and\nContemporary\nArt', x: 74, y: 55, w: 25, h: 39 },
  ],
  '2': [
    { label: 'European\nPaintings', x: 33, y: 3, w: 37, h: 29 },
    { label: 'Asian Art', x: 7, y: 29, w: 26, h: 38 },
    { label: 'Musical\nInstruments', x: 73, y: 26, w: 25, h: 27 },
    { label: 'Balcony', x: 37, y: 39, w: 32, h: 42 },
    { label: 'European\nSculpture', x: 8, y: 72, w: 28, h: 20 },
    { label: 'The American\nWing', x: 73, y: 57, w: 25, h: 36 },
  ],
  '3': [
    { label: 'Drawings\nand Prints', x: 33, y: 3, w: 37, h: 29 },
    { label: 'Photography', x: 8, y: 32, w: 26, h: 37 },
    { label: 'Special\nExhibitions', x: 73, y: 30, w: 25, h: 36 },
    { label: 'Gallery\nLanding', x: 37, y: 40, w: 32, h: 42 },
    { label: 'Study Room', x: 8, y: 74, w: 27, h: 19 },
    { label: 'Terrace', x: 73, y: 72, w: 25, h: 21 },
  ],
  'B1': [
    { label: 'Education\nCentre', x: 33, y: 3, w: 37, h: 28 },
    { label: 'Auditorium', x: 8, y: 32, w: 26, h: 37 },
    { label: 'Cloakroom', x: 73, y: 30, w: 25, h: 25 },
    { label: 'Lower\nLobby', x: 37, y: 39, w: 32, h: 42 },
    { label: 'Family Room', x: 8, y: 74, w: 27, h: 19 },
    { label: 'Café', x: 73, y: 61, w: 25, h: 32 },
  ],
};

export function FloorPlan({ museumId = 'met', floor, setFloor, room, onRoom, onSearch, height = 376, routePaths = [] }: { museumId?: MuseumId; floor: Floor; setFloor: (floor: Floor) => void; room: string | null; onRoom: (room: string | null) => void; onSearch: () => void; height?: number; routePaths?: string[][] }) {
  if (museumId === 'goma') return <GomaFloorPlan room={room} onRoom={onRoom} onSearch={onSearch} height={height} routePaths={routePaths}/>;
  return <View style={[styles.container, { height }]}>
    <View style={styles.plan}>
      <Svg width="100%" height="100%" viewBox="0 0 330 390" preserveAspectRatio="none" accessible={false}>
        <Defs><LinearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#438EDA" stopOpacity=".35"/><Stop offset="1" stopColor="#438EDA" stopOpacity="0"/></LinearGradient></Defs>
        <G fill="#E4E1DA" stroke="#F8F6F2" strokeWidth="2.5">
          <Path d="M113 1H215V12H278V33H295V111H322V203H311V368H283V384H217V356H134V390H33V376H13V275H19V199H34V94H54V24H113Z"/>
          <Rect x="48" y="64" width="62" height="19"/><Rect x="47" y="84" width="31" height="28"/><Rect x="80" y="84" width="31" height="24"/>
          <Rect x="215" y="23" width="42" height="45"/><Rect x="215" y="69" width="42" height="37"/><Rect x="258" y="23" width="21" height="83"/>
          <Rect x="113" y="80" width="27" height="18"/><Rect x="145" y="83" width="30" height="16"/><Rect x="179" y="82" width="27" height="18"/>
          <Rect x="46" y="198" width="33" height="85"/><Rect x="80" y="185" width="34" height="98"/><Rect x="20" y="219" width="26" height="99"/>
          <Rect x="211" y="201" width="31" height="68"/><Rect x="211" y="273" width="23" height="41"/><Rect x="211" y="318" width="24" height="44"/>
        </G>
      </Svg>
      {layouts[floor].map(item => {
        const label = item.label.replace(/\n/g, ' ');
        return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Select ${label}`} accessibilityState={{ selected: room === label }} aria-pressed={room === label} onPress={() => onRoom(room === label ? null : label)} style={[styles.room, { left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` }, room === label && styles.selectedRoom]}><T style={styles.roomText}>{item.label}</T></Pressable>;
      })}
      {floor === '1' && routePaths.length > 0 && <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">{routePaths.map((ids, i) => { const nodes = ids.map(id => graph.nodes.find(n => n.id === id)).filter((n): n is typeof graph.nodes[number] => !!n); return <G key={i}><Path d={nodes.map((n, j) => `${j ? 'L' : 'M'}${n.x} ${n.y}`).join(' ')} stroke="#A35E48" strokeWidth="1.2" fill="none"/>{nodes.slice(-1).map(n => <Circle key={n.id} cx={n.x} cy={n.y} r="2" fill="#A35E48"/>)}</G>; })}</Svg></View>}
      {floor === '1' && routePaths.length === 0 && <View pointerEvents="none" style={styles.position}>
        <Svg width={58} height={76} viewBox="0 0 58 76"><Path d="M29 16L3 73H55Z" fill="url(#localBeam)"/><Defs><LinearGradient id="localBeam" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#2584F7" stopOpacity=".3"/><Stop offset="1" stopColor="#2584F7" stopOpacity="0"/></LinearGradient></Defs><Circle cx="29" cy="15" r="13" fill="#278AFF" opacity=".14"/><Circle cx="29" cy="15" r="9" fill="#288AFF" stroke="white" strokeWidth="3"/></Svg>
      </View>}
      <View pointerEvents="none" style={styles.entrance}><Icon name="caret-up" size={12}/><T style={styles.entranceText}>{floor === '1' ? 'Entrance' : 'Stairs / lift'}</T></View>
    </View>
    <View style={styles.floors}>{floors.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Floor ${value}`} accessibilityState={{ selected: floor === value }} aria-pressed={floor === value} onPress={() => setFloor(value)} style={[styles.floor, floor === value && styles.activeFloor]}><T style={[styles.floorText, floor === value && { color: 'white' }]}>{value}</T></Pressable>)}</View>
    <View style={styles.tools}>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset demo map position" onPress={() => { setFloor('1'); onRoom(null); }} style={styles.tool}><Icon name="locate-outline" size={21}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Search nearby artworks" onPress={onSearch} style={styles.tool}><Icon name="search-outline" size={22}/></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', height: 376, position: 'relative', backgroundColor: c.bg },
  plan: { position: 'absolute', top: 12, bottom: 12, left: 23, right: 30 },
  room: { position: 'absolute', backgroundColor: '#DFDCD5', borderWidth: 2, borderColor: c.bg, justifyContent: 'center', alignItems: 'center' },
  selectedRoom: { backgroundColor: '#CDD9CD', borderColor: '#637F6C' },
  roomText: { fontSize: 9, lineHeight: 15, color: '#262924', textAlign: 'center', paddingHorizontal: 2 },
  position: { position: 'absolute', left: '44%', top: '29%' },
  entrance: { position: 'absolute', bottom: -3, left: '40%', width: '27%', alignItems: 'center', backgroundColor: c.bg }, entranceText: { fontSize: 9, lineHeight: 15 },
  floors: { position: 'absolute', left: 14, top: 35, gap: 6 }, floor: { width: 29, height: 37, borderRadius: 9, backgroundColor: '#EEEBE5E8', alignItems: 'center', justifyContent: 'center' }, activeFloor: { backgroundColor: c.green }, floorText: { fontSize: 12, lineHeight: 17 },
  tools: { position: 'absolute', right: 16, top: 14, gap: 10 }, tool: { width: 39, height: 39, backgroundColor: 'white', borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .10, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
});
