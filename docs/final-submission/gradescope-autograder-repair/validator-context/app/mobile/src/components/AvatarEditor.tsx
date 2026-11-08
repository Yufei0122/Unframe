import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { avatarCrop, clamp, isAvatarDataUri } from '../avatar';
import { chooseAvatarImage, editAvatarImage, type AvatarImage } from '../avatarImage';
import { Button, Icon, Notice, T, serif, type IconName } from '../ui';
import { PortraitPlaceholder } from './ProfileIllustrations';

// React Native Web accepts these CSS properties; native views never receive them.
const webDragStyle = { touchAction: 'none', cursor: 'move' } as unknown as ViewStyle;

export function AvatarEditor({ uri, onSave, onClose }: { uri?: string; onSave: (uri: string) => void; onClose: () => void }) {
  const [photo, setPhoto] = useState<AvatarImage | null>(uri ? { uri, width: 512, height: 512 } : null);
  const [zoom, setZoom] = useState(1), [position, setPosition] = useState({ x: .5, y: .5 });
  const [size, setSize] = useState(230), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const crop = avatarCrop(photo?.width || 512, photo?.height || 512, zoom, position.x, position.y);
  const currentCrop = useRef(crop); currentCrop.current = crop;
  const dragStart = useRef(crop);
  const gestures = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !!photo && !busy,
    onMoveShouldSetPanResponder: () => !!photo && !busy,
    onPanResponderGrant: () => { dragStart.current = currentCrop.current; },
    onPanResponderMove: (_event, gesture) => {
      if (!photo || busy) return;
      const start = dragStart.current, scale = start.width / size;
      setPosition({ x: (photo.width - start.width) > 0 ? clamp((start.originX - gesture.dx * scale) / (photo.width - start.width), 0, 1) : .5, y: (photo.height - start.height) > 0 ? clamp((start.originY - gesture.dy * scale) / (photo.height - start.height), 0, 1) : .5 });
    },
  }), [photo, busy, size]);

  async function choose() {
    setBusy(true); setError('');
    try {
      const selected = await chooseAvatarImage();
      if (active.current && selected) { setPhoto(selected); setZoom(1); setPosition({ x: .5, y: .5 }); }
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Your photo could not be opened. Please try again.'); }
    finally { if (active.current) setBusy(false); }
  }
  async function rotate() {
    if (!photo || busy) return;
    setBusy(true); setError('');
    try {
      const next = await editAvatarImage(photo.uri, [{ rotate: 90 }]);
      if (active.current) { setPhoto(next); setZoom(1); setPosition({ x: .5, y: .5 }); }
    } catch { if (active.current) setError('This photo could not be rotated. Please try again.'); }
    finally { if (active.current) setBusy(false); }
  }
  async function save() {
    if (!photo || busy) return;
    setBusy(true); setError('');
    try {
      const result = await editAvatarImage(photo.uri, [{ crop }, { resize: { width: 512, height: 512 } }]);
      if (!isAvatarDataUri(result.uri)) throw new Error('This photo is too detailed to save. Try another image.');
      if (active.current) onSave(result.uri);
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Your avatar could not be saved. Please try again.'); }
    finally { if (active.current) setBusy(false); }
  }
  function move(dx: number, dy: number) {
    if (!photo) return;
    setPosition({ x: photo.width > crop.width ? clamp((crop.originX - dx * crop.width * .08) / (photo.width - crop.width), 0, 1) : .5, y: photo.height > crop.height ? clamp((crop.originY - dy * crop.width * .08) / (photo.height - crop.width), 0, 1) : .5 });
  }
  function control(label: string, icon: IconName, run: () => void, disabled = !photo || busy) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={run} style={[styles.control, disabled && { opacity: .35 }]}><Icon name={icon} size={20} color="#665646"/></Pressable>;
  }

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.card}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}><T accessibilityRole="header" style={styles.title}>Edit avatar</T><Pressable accessibilityRole="button" accessibilityLabel="Cancel avatar editing" onPress={onClose} style={styles.control}><Icon name="close-outline" size={25}/></Pressable></View>
        <T style={styles.copy}>{photo ? 'Drag to position your photo, then zoom or rotate to find your frame.' : 'Choose a photo to make this space yours.'}</T>
        <View style={styles.previewArea} onLayout={event => setSize(Math.min(230, event.nativeEvent.layout.width))}>
          <View testID="avatar-crop-preview" {...gestures.panHandlers} style={[styles.preview, { width: size, height: size, borderRadius: size / 2 }, Platform.OS === 'web' && webDragStyle]}>
            {photo ? <Image accessibilityLabel="Avatar crop preview" source={{ uri: photo.uri }} style={{ position: 'absolute', width: photo.width * size / crop.width, height: photo.height * size / crop.width, left: -crop.originX * size / crop.width, top: -crop.originY * size / crop.width }}/> : <PortraitPlaceholder/>}
          </View>
        </View>
        {photo && <>
          <View style={styles.controls}>{control('Zoom out', 'remove-outline', () => setZoom(z => clamp(z - .25, 1, 3)), busy || zoom <= 1)}<T accessibilityLiveRegion="polite" style={styles.zoom}>{Math.round(zoom * 100)}%</T>{control('Zoom in', 'add-outline', () => setZoom(z => clamp(z + .25, 1, 3)), busy || zoom >= 3)}<View style={styles.divider}/>{control('Rotate photo', 'refresh-outline', () => { void rotate(); })}{control('Reset crop', 'expand-outline', () => { setZoom(1); setPosition({ x: .5, y: .5 }); })}</View>
          <View style={styles.controls}><T style={styles.copy}>Position</T>{control('Move photo left', 'arrow-back-outline', () => move(-1, 0))}{control('Move photo up', 'arrow-up-outline', () => move(0, -1))}{control('Move photo down', 'arrow-down-outline', () => move(0, 1))}{control('Move photo right', 'arrow-forward-outline', () => move(1, 0))}</View>
        </>}
        {!!error && <Notice>{error}</Notice>}
        {busy && <T accessibilityLiveRegion="polite" style={styles.copy}>Preparing your photo…</T>}
        <Button title={photo ? 'Choose another photo' : 'Upload photo'} icon="image-outline" secondary disabled={busy} onPress={() => { void choose(); }}/>
        <Button title="Save avatar" disabled={!photo || busy} onPress={() => { void save(); }}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={styles.cancel}><T style={styles.copy}>Cancel</T></Pressable>
        <T style={styles.privacy}>Your avatar is saved only on this device.</T>
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#221D1866', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 370, maxHeight: '94%', borderRadius: 20, backgroundColor: '#FFFCF7', overflow: 'hidden' },
  content: { padding: 20, gap: 12 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: serif, fontSize: 26, lineHeight: 32, color: '#292520', flex: 1 },
  copy: { fontSize: 12, lineHeight: 18, color: '#776D63' }, previewArea: { width: '100%', alignItems: 'center', paddingVertical: 4 },
  preview: { overflow: 'hidden', backgroundColor: '#E9E1D6' }, controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  control: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, zoom: { fontSize: 12, lineHeight: 18, width: 39, textAlign: 'center', color: '#776D63' },
  divider: { width: 1, height: 22, backgroundColor: '#E6DED3', marginHorizontal: 5 }, cancel: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  privacy: { fontSize: 10, lineHeight: 15, color: '#94897D', textAlign: 'center' },
});
