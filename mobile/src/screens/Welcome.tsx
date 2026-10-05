import React from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParams } from '../model';
import { locationLabel, useMuseumLocation } from '../location';
import { Icon, T, serif } from '../ui';

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootStackParams, 'Welcome'>) {
  const { location, museum, museumId } = useMuseumLocation();
  const focused = useIsFocused();
  return <ImageBackground source={museumId === 'goma' ? require('../../assets/goma-exterior.jpg') : require('../../assets/met-exterior.jpg')} style={styles.background} resizeMode="cover">
    {focused && <StatusBar style="light"/>}
    <LinearGradient colors={['#132A3F69', '#172E3733', '#11272CEE']} locations={[0, .42, 1]} style={StyleSheet.absoluteFill}/>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Museum and location information" onPress={() => navigation.navigate('MuseumInfo')} style={styles.location}>
          <Icon name="location" color="#ECE5D5" size={21}/>
          <View style={{ flex: 1, gap: 2 }}><T style={styles.locationCaption}>{locationLabel(location.status)}</T><T style={styles.museum}>{museum.name}</T></View>
          <Icon name="chevron-down" color="white" size={15}/>
        </Pressable>
        <View style={styles.welcome}>
          <T accessibilityRole="header" style={styles.greeting}>Welcome to</T>
          <T style={styles.title}>{museum.shortName}</T>
          <T style={styles.subtitle}>Where art inspires,{`\n`}and curiosity leads.</T>
        </View>
        <View style={styles.buttonArea}>
          <View style={styles.buttonHalo}>
            <Pressable accessibilityRole="button" accessibilityLabel="Start visit" onPress={() => navigation.navigate('Home', { screen: 'Discover' })} style={({ pressed }) => [styles.start, pressed && { transform: [{ scale: .97 }], opacity: .92 }]}>
              <T style={styles.startText}>Start{`\n`}Visit</T><Icon name="arrow-forward" size={30} color="#1F3933"/>
            </Pressable>
          </View>
        </View>
        <View style={styles.footer}>
          <View style={styles.footerLine}><Icon name="sparkles" color="#DDD2B7" size={25}/><T style={styles.footerText}>A little wonder,{`\n`}at your own pace.</T></View>
          <T style={styles.demo}>{museum.shortName.toUpperCase()} · DEMO EXPERIENCE</T>
          {museumId === 'goma' && <T style={{ color: '#C9D0CA', fontSize: 8 }}>GOMA exterior · Photograph: M Sherwood © QAGOMA</T>}
        </View>
      </ScrollView>
    </SafeAreaView>
  </ImageBackground>;
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#425864' }, safe: { flex: 1 },
  content: { flexGrow: 1, minHeight: 670, paddingHorizontal: 30, paddingTop: 38, paddingBottom: 24 },
  location: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 48 },
  locationCaption: { color: '#F3EFE7', fontSize: 12, lineHeight: 19 }, museum: { color: 'white', fontSize: 13, lineHeight: 20 },
  welcome: { marginTop: 43 }, greeting: { fontFamily: serif, fontSize: 37, lineHeight: 46, color: '#FFFCF8', letterSpacing: -.8 },
  title: { fontFamily: serif, fontSize: 57, lineHeight: 66, color: '#FFFCF8', letterSpacing: -1.8 },
  subtitle: { fontSize: 19, lineHeight: 29, color: '#F8F6F2', marginTop: 14, fontWeight: '300' },
  buttonArea: { flex: 1, minHeight: 262, alignItems: 'center', justifyContent: 'center', paddingTop: 36, paddingBottom: 26 },
  buttonHalo: { padding: 7, backgroundColor: '#FFFFFF28', borderRadius: 140, shadowColor: '#FFFBEB', shadowOpacity: .4, shadowRadius: 28, shadowOffset: { width: 0, height: 0 } },
  start: { width: 211, height: 211, borderRadius: 110, backgroundColor: '#F0EBE2', borderWidth: 6, borderColor: '#FFFEFB', alignItems: 'center', justifyContent: 'center', gap: 15 },
  startText: { fontFamily: serif, color: '#203831', fontSize: 37, lineHeight: 39, textAlign: 'center' },
  footer: { alignItems: 'center', gap: 23, paddingTop: 12 }, footerLine: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  footerText: { color: '#F8F6F2', fontSize: 13, lineHeight: 20 }, demo: { color: '#C9D0CA', fontSize: 8, lineHeight: 14, letterSpacing: 2.1 },
});
