import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, T, serif, useRootNavigation } from '../ui';

export function HelpSupportDialog({ visible, onClose, artworkId }: { visible: boolean; onClose: () => void; artworkId?: string }) {
  const navigation = useRootNavigation();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.card}><ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}><T accessibilityRole="header" style={styles.title}>Help &amp; Support</T><Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={onClose} style={styles.close}><Icon name="close-outline" size={25}/></Pressable></View>
      <T style={styles.body}>Unframe helps you discover artworks, keep your favourites and plan a museum visit. Your preferences and saved collection stay on this device.</T>
      <Button title="Share feedback" onPress={() => { onClose(); navigation.navigate('Feedback', artworkId ? { artworkId } : undefined); }}/>
      <Button title="Done" secondary onPress={onClose}/>
    </ScrollView></View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#221D1866', padding: 20 },
  card: { width: '100%', maxWidth: 370, maxHeight: '90%', padding: 20, borderRadius: 20, backgroundColor: '#FFFCF7' },
  content: { gap: 18 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: serif, fontSize: 23, lineHeight: 28, color: '#292520', flex: 1 },
  body: { fontSize: 14, lineHeight: 22, color: '#70675E' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
