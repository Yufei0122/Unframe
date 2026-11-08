import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { museums, type MuseumId } from '../museum';
import { Icon, T, c } from '../ui';

// Shared schematic map for museums with a single illustrated gallery level.
export function GalleryFloorPlan({ museumId, room, onRoom, onSearch, height, routePaths }: { museumId: Exclude<MuseumId, 'met'>; room: string | null; onRoom: (room: string | null) => void; onSearch: () => void; height: number; routePaths: string[][] }) {
  const museum = museums[museumId];
  const { graph } = museum;
  const rooms = graph.rooms;
  return <View style={{ height, backgroundColor: c.bg }}>
    <View style={styles.plan}>
      <View style={styles.corridor}/>
      {rooms.map(r => <Pressable key={r.name} accessibilityRole="button" accessibilityLabel={`Select ${r.name}`} aria-pressed={room === r.name} accessibilityState={{ selected: room === r.name }} onPress={() => onRoom(room === r.name ? null : r.name)} style={[styles.room, { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }, room === r.name && styles.selected]}><T style={styles.label}>{r.name}</T></Pressable>)}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {routePaths.map((path, index) => {
          const nodes = path.map(id => graph.nodes.find(n => n.id === id)).filter((n): n is typeof graph.nodes[number] => !!n);
          return <G key={index}><Path d={nodes.map((n, i) => `${i ? 'L' : 'M'}${n.x} ${n.y}`).join(' ')} stroke="#A35E48" strokeWidth="1.2" fill="none"/>{nodes.slice(-1).map(n => <Circle key={n.id} cx={n.x} cy={n.y} r="2" fill="#A35E48"/>)}</G>;
        })}
        {!routePaths.length && <Circle cx="50" cy="52" r="2.6" fill="#288AFF" stroke="white" strokeWidth="1"/>}
      </Svg></View>
      <T style={styles.entrance}>Entrance</T>
    </View>
    <T style={styles.caption}>{museum.shortName.toUpperCase()} · FLOOR PLAN</T>
    <View style={styles.tools}>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset map position" onPress={() => onRoom(null)} style={styles.tool}><Icon name="locate-outline" size={20}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Search nearby artworks" onPress={onSearch} style={styles.tool}><Icon name="search-outline" size={20}/></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  plan: { position: 'absolute', left: 22, right: 45, top: 35, bottom: 12 },
  corridor: { position: 'absolute', left: '43%', top: '8%', width: '14%', height: '86%', backgroundColor: '#EAE5DC' },
  room: { position: 'absolute', backgroundColor: '#DFDCD5', borderWidth: 2, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: '#CDD9CD', borderColor: '#637F6C' },
  label: { fontSize: 10, lineHeight: 16, textAlign: 'center', padding: 4 },
  entrance: { position: 'absolute', bottom: 0, left: '30%', width: '40%', fontSize: 10, textAlign: 'center' },
  caption: { position: 'absolute', top: 12, left: 27, fontSize: 9, color: c.muted, letterSpacing: 1 },
  tools: { position: 'absolute', top: 14, right: 12, gap: 10 },
  tool: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
});
