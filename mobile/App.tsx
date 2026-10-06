import React from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider, useStore } from './src/store';
import { LocationProvider } from './src/location';
import type { RootStackParams, TabParams } from './src/model';
import { Icon, c, type IconName } from './src/ui';
import { WelcomeScreen } from './src/screens/Welcome';
import { MuseumSelectScreen } from './src/screens/MuseumSelect';
import { MuseumScreen } from './src/screens/Museum';
import { ExploreScreen } from './src/screens/Explore';
import { GuideScreen } from './src/screens/Guide';
import { SavedScreen } from './src/screens/Saved';
import { PreferencesScreen } from './src/screens/Preferences';
import { ArtworkScreen } from './src/screens/Details';
import { AboutScreen, FeedbackScreen, PlannerScreen } from './src/screens/Modals';
import { LookupScreen } from './src/screens/Lookup';
import { AIPlannerScreen } from './src/screens/AIPlanner';
import { AIItineraryScreen } from './src/screens/AIItinerary';

const Stack = createNativeStackNavigator<RootStackParams>();
const Tabs = createBottomTabNavigator<TabParams>();
const tabIcons: Record<keyof TabParams, [IconName, IconName]> = {
  Discover: ['home-outline', 'home'],
  Plan: ['chatbubble-ellipses-outline', 'chatbubble-ellipses'],
  Scan: ['scan-outline', 'scan'], Guide: ['sparkles-outline', 'sparkles'],
  Saved: ['bookmark-outline', 'bookmark'], You: ['person-outline', 'person'],
};
function ScanScreen() { return Platform.OS === 'web' ? <LookupScreen/> : <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}><LookupScreen/></SafeAreaView>; }
function MainTabs() {
  const { state } = useStore();
  return <Tabs.Navigator screenOptions={({ route }) => ({
    headerShown: false, tabBarActiveTintColor: c.green, tabBarInactiveTintColor: '#777771',
    tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, height: Platform.OS === 'web' ? 74 : undefined, paddingTop: 9, paddingBottom: Platform.OS === 'web' ? 14 : undefined },
    tabBarLabelStyle: { fontSize: 10, lineHeight: 12, fontWeight: '400', flexShrink: 0 },
    tabBarHideOnKeyboard: true,
    tabBarIcon: ({ color, focused }) => <Icon name={tabIcons[route.name][focused ? 1 : 0]} size={21} color={color}/>,
  })}>
    <Tabs.Screen name="Discover" component={MuseumScreen} options={{ title: 'Home' }}/>
    <Tabs.Screen name="Plan" component={AIPlannerScreen}/>
    <Tabs.Screen name="Scan" component={ScanScreen}/>
    <Tabs.Screen name="Saved" component={SavedScreen} options={{ title: 'Saved', tabBarBadge: state.saved.length || undefined, tabBarBadgeStyle: { backgroundColor: c.sage, color: c.green, fontSize: 9 } }}/>
    <Tabs.Screen name="You" component={PreferencesScreen} options={{ title: 'Profile' }}/>
    <Tabs.Screen name="Guide" component={GuideScreen} options={{ tabBarItemStyle: { display: 'none' }, tabBarButton: () => null }}/>
  </Tabs.Navigator>;
}
function AppNavigation() {
  return <NavigationContainer documentTitle={{ formatter: () => 'Unframe' }} theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: c.green, background: c.bg, card: c.bg, text: c.ink, border: c.border } }}>
    <Stack.Navigator initialRouteName="MuseumSelect" screenOptions={{ headerTintColor: c.green, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg }, headerTitleStyle: { fontSize: 15 }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="MuseumSelect" component={MuseumSelectScreen} options={{ headerShown: false }}/>
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }}/>
      <Stack.Screen name="Home" component={MainTabs} options={{ headerShown: false }}/>
      <Stack.Screen name="Artwork" component={ArtworkScreen} options={{ headerShown: false }}/>
      <Stack.Screen name="Tour" component={ExploreScreen} options={{ title: 'Sample gallery tour' }}/>
      <Stack.Screen name="AIItinerary" component={AIItineraryScreen} options={{ title: 'Visit route' }}/>
      <Stack.Group screenOptions={({ navigation }) => ({ presentation: 'modal', headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => navigation.goBack()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close-circle-outline"/></Pressable> })}>
        <Stack.Screen name="Planner" component={PlannerScreen} options={{ title: 'Plan your visit' }}/>
        <Stack.Screen name="Lookup" component={LookupScreen} options={{ title: 'Find an artwork', headerShown: Platform.OS !== 'web' }}/>
        <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: 'Your feedback' }}/>
        <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About Unframe' }}/>
      </Stack.Group>
    </Stack.Navigator>
  </NavigationContainer>;
}
export default function App() {
  const { width, height } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 600;
  return <View style={[styles.canvas, desktop && styles.desktop]}>
    <View testID="mobile-viewport" style={[styles.viewport, desktop && { width: 406, height: Math.min(860, height - 40), borderRadius: 39, borderWidth: 8, borderColor: '#252723', boxShadow: '0 22px 70px #25392D26, 0 0 0 1px #C8C4BA' }]}>
      <SafeAreaProvider><StoreProvider><LocationProvider><StatusBar style="dark"/><AppNavigation/></LocationProvider></StoreProvider></SafeAreaProvider>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: c.bg }, desktop: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9E7E1' },
  viewport: { height: '100%', width: '100%', overflow: 'hidden', backgroundColor: c.bg },
});
