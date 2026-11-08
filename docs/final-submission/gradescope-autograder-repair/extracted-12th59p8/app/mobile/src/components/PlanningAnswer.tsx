import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import type { VisitPreferences } from '../../../shared/ai-types';
import { Icon, T, c, serif, type IconName } from '../ui';

/** The answer reveals independently of network/route work; it never delays a ready route. */
export function PlanningAnswer({ text, preferences, mustSeeTitles, active }: { text: string; preferences: VisitPreferences; mustSeeTitles: string[]; active: boolean }) {
  const [reduced, setReduced] = useState(false), [complete, setComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const characters = useMemo(() => Array.from(text), [text]);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!active || reduced || complete) { setProgress(1); setComplete(true); return; }
    // Short punctuation pauses and a bounded pace work for both Chinese and English.
    const weights = characters.map(char => /[。！？.!?,，:：;]/u.test(char) ? 5 : /[\u3400-\u9fff]/u.test(char) ? 2.8 : 1);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const duration = Math.max(1600, Math.min(4500, total * 26));
    const started = performance.now();
    const timer = setInterval(() => {
      const elapsed = Math.min(1, (performance.now() - started) / duration);
      let visible = 0, budget = total * elapsed;
      while (visible < weights.length && budget >= weights[visible]) budget -= weights[visible++];
      setProgress(elapsed === 1 ? 1 : visible / Math.max(1, characters.length));
      if (elapsed === 1) setComplete(true);
    }, 32);
    return () => clearInterval(timer);
  }, [active, reduced, complete, characters]);
  const finish = () => { setComplete(true); setProgress(1); };
  const points: { label: string; value: string; icon: IconName }[] = [
    { label: 'TIME', value: `${preferences.availableMinutes} minutes`, icon: 'time-outline' },
    { label: 'FOCUS', value: preferences.interests.join(', ') || 'Museum highlights', icon: 'color-palette-outline' },
    { label: 'PACE & ACCESS', value: `${preferences.walkingPreference === 'less_walking' ? 'Less walking' : 'Balanced walking'}${preferences.accessibilityRequirements.length ? ' · Step-free' : ''}`, icon: 'walk-outline' },
    ...(mustSeeTitles.length ? [{ label: 'MUST SEE', value: mustSeeTitles.join(', '), icon: 'star-outline' as IconName }] : []),
  ];
  return <>
    <View style={styles.heading}><View><T style={styles.name}>MIRA · AI CURATOR</T><T style={styles.title}>Your visit</T></View>
      {!complete && !reduced ? <Pressable accessibilityRole="button" accessibilityLabel="Show full answer" onPress={finish} style={styles.skip}><Icon name="play-skip-forward-outline" size={17} color={c.green}/></Pressable> : <Icon name="checkmark-circle-outline" size={18} color={c.green}/>}
    </View>
    <View accessible accessibilityLabel={text} style={styles.prose}>
      {/* Reserve the final height so the map and reading position stay still while typing. */}
      <T accessible={false} aria-hidden style={[styles.reply, { opacity: 0 }]}>{text}</T>
      <T accessible={false} aria-hidden testID="planning-reply-text" style={[styles.reply, styles.reveal]}>{characters.slice(0, Math.floor(progress * characters.length)).join('')}{!complete && <T style={styles.cursor}>▏</T>}</T>
    </View>
    {points.map((point, index) => {
      const visible = complete || progress >= (index + 1) / (points.length + 1);
      return <View key={point.label} accessibilityElementsHidden={!visible} aria-hidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[styles.point, !visible && { opacity: 0 }]}>
        <Icon name={point.icon} size={15} color={c.green}/><View style={styles.copy}><T style={styles.label}>{point.label}</T><T style={styles.value}>{point.value}</T></View>
      </View>;
    })}
  </>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 }, name: { fontSize: 8, lineHeight: 12, letterSpacing: 1.3, color: c.muted }, title: { fontFamily: serif, fontSize: 18, lineHeight: 23, color: c.green }, skip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', margin: -10 },
  prose: { position: 'relative' }, reply: { fontSize: 13, lineHeight: 21, color: c.ink }, reveal: { position: 'absolute', top: 0, left: 0, right: 0 }, cursor: { color: '#728578' },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, copy: { flex: 1, gap: 1 }, label: { fontSize: 8, lineHeight: 12, letterSpacing: 1.2, color: c.muted }, value: { fontSize: 12, lineHeight: 18, color: c.ink },
});
