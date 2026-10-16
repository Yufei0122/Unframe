import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { Icon, T, c } from '../ui';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}

export function ArtworkScanTransition({ label = 'Comparing visual details…', compact = false }: { label?: string; compact?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    progress.setValue(reduced ? .5 : 0);
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 1150, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(progress, { toValue: 0, duration: 1150, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [progress, reduced]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [5, compact ? 29 : 49] });
  const glow = progress.interpolate({ inputRange: [0, .5, 1], outputRange: [.35, .95, .35] });
  return <View testID="artwork-scan-transition" accessibilityRole="progressbar" accessibilityLabel={label} style={[styles.scanWrap, compact && styles.compactWrap]}>
    <View style={[styles.scanFrame, compact && styles.compactScanFrame]}>
      <View style={styles.scanArtwork}><Icon name="image-outline" size={compact ? 17 : 22} color="#D8C79E"/></View>
      <Animated.View style={[styles.scanLine, { opacity: glow, transform: [{ translateY }] }]}/>
      <View style={[styles.corner, styles.topLeft]}/><View style={[styles.corner, styles.topRight]}/>
      <View style={[styles.corner, styles.bottomLeft]}/><View style={[styles.corner, styles.bottomRight]}/>
    </View>
    <T accessibilityLiveRegion="polite" style={[styles.label, compact && styles.compactLabel]}>{label}</T>
  </View>;
}

export function RoutePlanningTransition({ label = 'Shaping your route…' }: { label?: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    progress.setValue(reduced ? .55 : 0); pulse.setValue(reduced ? .5 : 0);
    if (reduced) return;
    const travel = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }));
    const breathing = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    travel.start(); breathing.start();
    return () => { travel.stop(); breathing.stop(); };
  }, [progress, pulse, reduced]);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 140] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [.82, 1.18] });
  return <View testID="route-planning-transition" accessibilityRole="progressbar" accessibilityLabel={label} style={styles.routeWrap}>
    <View style={styles.routeTrack}>
      <View style={styles.routeLine}/>
      {[0, 1, 2].map(index => <Animated.View key={index} style={[styles.routeStop, { left: index * 73, transform: [{ scale }] }]}><View style={styles.routeStopCore}/></Animated.View>)}
      <Animated.View style={[styles.traveller, { transform: [{ translateX }] }]}><Icon name="sparkles" size={12} color="#FFFDF6"/></Animated.View>
    </View>
    <T accessibilityLiveRegion="polite" style={styles.routeLabel}>{label}</T>
    <T style={styles.routeDetail}>Balancing your interests, time and walking preferences</T>
  </View>;
}

const styles = StyleSheet.create({
  scanWrap: { alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 8 },
  compactWrap: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  scanFrame: { width: 78, height: 64, borderRadius: 12, backgroundColor: '#24372F', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  compactScanFrame: { width: 52, height: 40, borderRadius: 9 },
  scanArtwork: { width: '64%', height: '68%', borderRadius: 7, backgroundColor: '#4E6258', alignItems: 'center', justifyContent: 'center' },
  scanLine: { position: 'absolute', top: 0, left: 9, right: 9, height: 2, borderRadius: 2, backgroundColor: '#F1D98C', shadowColor: '#F1D98C', shadowOpacity: .9, shadowRadius: 5 },
  corner: { position: 'absolute', width: 12, height: 12, borderColor: '#F6E7B8' },
  topLeft: { left: 5, top: 5, borderLeftWidth: 1.5, borderTopWidth: 1.5 }, topRight: { right: 5, top: 5, borderRightWidth: 1.5, borderTopWidth: 1.5 },
  bottomLeft: { left: 5, bottom: 5, borderLeftWidth: 1.5, borderBottomWidth: 1.5 }, bottomRight: { right: 5, bottom: 5, borderRightWidth: 1.5, borderBottomWidth: 1.5 },
  label: { color: '#F6F1E5', fontSize: 11, lineHeight: 17, textAlign: 'center' }, compactLabel: { flexShrink: 1, textAlign: 'left' },
  routeWrap: { borderRadius: 15, paddingVertical: 13, paddingHorizontal: 16, gap: 8, alignItems: 'center', backgroundColor: '#E5EADF', overflow: 'hidden' },
  routeTrack: { width: 164, height: 26, justifyContent: 'center' },
  routeLine: { position: 'absolute', left: 8, right: 8, top: 12, height: 2, borderRadius: 2, backgroundColor: '#A8B6A5' },
  routeStop: { position: 'absolute', top: 6, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.green, backgroundColor: '#E5EADF', alignItems: 'center', justifyContent: 'center' },
  routeStopCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.green },
  traveller: { position: 'absolute', left: 2, top: 1, width: 24, height: 24, borderRadius: 12, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', shadowColor: c.green, shadowOpacity: .25, shadowRadius: 5 },
  routeLabel: { color: c.green, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  routeDetail: { color: c.muted, fontSize: 9, lineHeight: 14, textAlign: 'center' },
});
