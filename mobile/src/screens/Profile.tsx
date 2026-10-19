import React, { useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { images, museumImages } from '../assets';
import { GalleryIllustration, PortraitPlaceholder, ReflectionIllustration } from '../components/ProfileIllustrations';
import { AvatarEditor } from '../components/AvatarEditor';
import { BrandLogo } from '../components/BrandLogo';
import { HelpSupportDialog } from '../components/HelpSupportDialog';
import { useProfileNavigation } from '../components/ProfilePage';
import { profileActivity, savedRouteInfo } from '../profileData';
import { useMuseumLocation } from '../location';
import { artwork } from '../model';
import { museumForArtwork } from '../museum';
import { useStore } from '../store';
import { Button, Icon, Notice, T, useRootNavigation, type IconName } from '../ui';

const ink = '#292520', muted = '#77716A';
const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
type Panel = { title: string; body: string; action?: { label: string; run: () => void } };
const interestStyles: Record<string, { icon: IconName; tint: string; color: string }> = {
  Nature: { icon: 'leaf-outline', tint: '#E1E8DD', color: '#59765D' },
  Colour: { icon: 'color-palette-outline', tint: '#EFE0EF', color: '#92659D' },
  Sculpture: { icon: 'business-outline', tint: '#F0E5D4', color: '#A17E4A' },
  Form: { icon: 'cube-outline', tint: '#E1E8E0', color: '#587261' },
  Reflection: { icon: 'sparkles-outline', tint: '#DFE7F7', color: '#5577A9' },
};

function Heading({ title, icon, onPress, label }: { title: string; icon?: IconName; onPress?: () => void; label?: string }) {
  return <View style={p.heading}>
    <View style={p.headingTitle}>{icon && <Icon name={icon} size={18} color="#AD9278"/>}<T accessibilityRole="header" style={p.cardTitle}>{title}</T></View>
    {onPress && <Pressable accessibilityRole="button" accessibilityLabel={label || `View ${title.toLowerCase()}`} hitSlop={10} onPress={onPress} style={p.headingAction}><Icon name="chevron-forward-outline" size={18} color="#6A5B4B"/></Pressable>}
  </View>;
}

export function ProfileScreen() {
  const { state, dispatch, storageError } = useStore();
  const { museum, museumId } = useMuseumLocation();
  const nav = useRootNavigation();
  const profileNav = useProfileNavigation();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [supportVisible, setSupportVisible] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [message, setMessage] = useState('');
  const [width, setWidth] = useState(390);
  const compact = width < 360;
  const showQuote = !compact && !state.preferences.largeText && state.preferences.name.length <= 14;
  const roomyCards = compact && state.preferences.largeText;
  const favouriteMuseums = [...new Set(state.saved.map(id => museumForArtwork(id)?.shortName).filter(Boolean))];
  const visitedMuseums = [...new Set(state.visits.flatMap(visit => visit.artworkIds.map(id => museumForArtwork(id)?.id)).filter(Boolean))];
  const cities = visitedMuseums.map(id => id === 'met' ? 'New York' : 'Brisbane');
  const latestActivity = profileActivity(state)[0];
  const latestArtwork = latestActivity?.coverId ? artwork(latestActivity.coverId) : undefined;
  const latestRoute = state.savedRoutes?.[0];
  const latestRouteInfo = latestRoute && savedRouteInfo(latestRoute);
  const openSaved = (tab: 'saved' | 'visits' = 'saved') => tab === 'visits' ? profileNav.navigate('RecentActivity', { filter: 'Visits' }) : profileNav.navigate('SavedArtworks');
  const settings = () => nav.navigate('AppSettings');
  const notifications = () => setPanel({ title: 'Notifications', body: 'You’re all caught up. There are no notifications to show.' });
  const openRoutes = () => profileNav.navigate('SavedRoutes');
  const openSummary = () => setPanel({
    title: 'Your Unframe AI Summary',
    body: `This is a preview of your art reflection, using your interests and the activity saved on this device. An AI annual review has not been generated.\n\nYour interests: ${state.preferences.interests.join(', ') || 'still waiting to be discovered'}.\n${state.visits.length} completed visits · ${state.saved.length} saved artworks.`,
    action: { label: 'Explore your collection', run: () => openSaved() },
  });
  const stats: { value: number; label: string; icon: IconName; onPress: () => void }[] = [
    { value: state.visits.length, label: 'Visits\nCompleted', icon: 'book-outline', onPress: () => openSaved('visits') },
    { value: state.saved.length, label: 'Saved\nArtworks', icon: 'bookmark-outline', onPress: () => openSaved() },
    { value: favouriteMuseums.length, label: 'Favourite\nMuseums', icon: 'library-outline', onPress: () => setPanel({ title: 'Favourite Museums', body: favouriteMuseums.length ? `Your saved artworks come from ${favouriteMuseums.join(' and ')}.` : 'Save an artwork to start a collection of favourite museums.' }) },
    { value: cities.length, label: 'Cities\nExplored', icon: 'globe-outline', onPress: () => setPanel({ title: 'Cities Explored', body: cities.length ? `Your completed museum visits span ${cities.join(' and ')}.` : 'Cities from your completed museum visits will appear here.' }) },
  ];
  const shortcuts: { title: string; icon: IconName; onPress: () => void }[] = [
    { title: 'App Settings', icon: 'settings-outline', onPress: () => settings() },
    { title: 'Notifications', icon: 'notifications-outline', onPress: notifications },
    { title: 'Help & Support', icon: 'help-circle-outline', onPress: () => setSupportVisible(true) },
    { title: 'Invite Friends', icon: 'people-outline', onPress: () => { void Share.share({ message: 'Discover a new perspective with Unframe — explore art, save your favourites and make your next museum visit your own.' }).catch(() => setMessage('Sharing is unavailable in this browser. Try sharing from your phone.')); } },
  ];

  return <SafeAreaView edges={['top']} style={p.safe} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <ScrollView testID="profile-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={p.content}>
      <View style={p.hero}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><GalleryIllustration/></View>
        <View style={p.topBar}>
          <View accessibilityLabel="Unframe. Art lives wider." accessible><BrandLogo width={164}/><T style={p.tagline}>ART LIVES WIDER</T></View>
          <View style={p.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open notifications" onPress={notifications} style={p.iconButton}><Icon name="notifications-outline" size={24} color={ink}/></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open app settings" onPress={() => settings()} style={p.iconButton}><Icon name="settings-outline" size={23} color={ink}/></Pressable>
          </View>
        </View>
        {showQuote && <T style={p.quote}>“Different{`\n`}perspectives,{`\n`}richer worlds.”</T>}
        <View style={[p.identity, !showQuote && { width: '100%' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit avatar" onPress={() => setEditingAvatar(true)} style={p.avatarButton}>
            <View style={p.avatar}>{state.avatarUri ? <Image source={{ uri: state.avatarUri }} accessibilityLabel="Your avatar" style={{ width: '100%', height: '100%' }}/> : <PortraitPlaceholder/>}</View><View style={p.pencil}><Icon name="pencil" size={13} color="#FFF"/></View>
          </Pressable>
          <View style={p.identityText}>
            <T accessibilityRole="header" numberOfLines={2} style={[p.name, compact && { fontSize: 25 }]}>{state.preferences.name}</T>
            <T style={p.bio}>Curious minds visit{`\n`}more often.</T>
            <Pressable accessibilityRole="button" accessibilityLabel="Explore museums" onPress={() => nav.popTo('MuseumSelect')} style={p.location}><Icon name="location-outline" size={13} color="#8A796B"/><T style={p.locationText}>{museum.shortName}</T></Pressable>
          </View>
        </View>
      </View>
      <View style={p.cards}>
        {storageError && <Notice>{storageError}</Notice>}{!!message && <Notice>{message}</Notice>}
        <View style={p.card}>
          <View style={p.heading}><T accessibilityRole="header" style={p.cardTitle}>My Interests</T><Pressable accessibilityRole="button" accessibilityLabel="Edit interests" hitSlop={10} onPress={() => settings()} style={p.headingAction}><T style={p.edit}>Edit</T></Pressable></View>
          <View style={p.interests}>{state.preferences.interests.length ? state.preferences.interests.map(interest => {
            const theme = interestStyles[interest] || interestStyles.Reflection;
            return <Pressable key={interest} accessibilityRole="button" accessibilityLabel={`Edit interest: ${interest}`} onPress={() => settings()} style={[p.interest, { backgroundColor: theme.tint }]}><Icon name={theme.icon} size={18} color={theme.color}/><T style={p.interestText}>{interest}</T></Pressable>;
          }) : <Pressable accessibilityRole="button" onPress={() => settings()}><T style={p.emptyCopy}>Find what draws you in. Add your interests.</T></Pressable>}</View>
        </View>
        <View style={[p.card, p.stats]}>{stats.map((stat, index) => <Pressable accessibilityRole="button" accessibilityLabel={`${stat.value} ${stat.label.replace('\n', ' ')}`} key={stat.label} onPress={stat.onPress} style={[p.stat, index > 0 && p.statBorder]}><Icon name={stat.icon} size={24} color="#423D37"/><T style={p.statValue}>{stat.value}</T><T style={p.statLabel}>{stat.label}</T></Pressable>)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="View your Unframe AI summary preview" onPress={openSummary} style={[p.card, p.summary]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}><ReflectionIllustration/></View>
          <View style={p.summaryHeading}><View style={p.headingTitle}><Icon name="sparkles" size={18} color="#AA75BD"/><T style={p.summaryTitle}>Your Unframe AI Summary</T></View><T style={p.summaryPreview}>Preview</T></View>
          <View style={p.summaryContent}>
            <View style={{ width: '67%' }}><T style={[p.reflectionTitle, compact && { fontSize: 20, lineHeight: 23 }]}>You seek what challenges,{`\n`}moves, and connects.</T><T style={p.reflectionBody}>{state.visits.length ? 'Every visit opens a new perspective. Return to the works that moved you, and discover where curiosity leads next.' : 'From timeless sculptures to bold new worlds, there’s always more to discover. Your art story starts with curiosity.'}</T></View>
            <View style={p.explorer}><T style={p.explorerTitle}>Curious{`\n`}Explorer</T><T style={p.explorerTagline}>ART BRINGS{`\n`}OUT A BRIGHTER{`\n`}YOU</T></View>
          </View><Icon name="chevron-forward-outline" size={18} color="#685E68"/>
        </Pressable>
        <View style={[p.splitRow, roomyCards && { flexDirection: 'column' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="View saved routes" onPress={openRoutes} style={[p.card, p.halfCard]}>
            <Heading title="Saved Routes" icon="location"/>
            <View style={p.miniContent}><Image source={latestRouteInfo?.museumId ? museumImages[latestRouteInfo.museumId] : latestRouteInfo ? images[latestRouteInfo.ids[0]] : museumImages[museumId]} style={p.miniImage}/><View style={p.miniText}><T numberOfLines={2} style={p.miniTitle}>{latestRoute?.title || 'Your next art trail'}</T><T style={p.miniDetail}>{latestRouteInfo ? `${latestRouteInfo.ids.length} artworks` : 'A little room to wander'}</T></View><Icon name="chevron-forward-outline" size={15} color={ink}/></View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="View recent activity" onPress={() => profileNav.navigate('RecentActivity', { filter: 'All' })} style={[p.card, p.halfCard]}>
            <Heading title="Recent Activity" icon="stats-chart"/>
            <View style={p.miniContent}>{latestArtwork ? <Image source={images[latestArtwork.id]} style={p.miniImage}/> : <View style={[p.miniImage, { overflow: 'hidden' }]}><ReflectionIllustration/></View>}<View style={p.miniText}><T numberOfLines={2} style={p.miniTitle}>{latestActivity?.title || 'Your story awaits'}</T><T style={p.miniDetail}>{latestActivity?.date ? new Date(latestActivity.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Your museum moments'}</T></View><Icon name="chevron-forward-outline" size={15} color={ink}/></View>
          </Pressable>
        </View>
        <View style={[p.shortcuts, roomyCards && { flexWrap: 'wrap' }]}>{shortcuts.map(shortcut => <Pressable accessibilityRole="button" accessibilityLabel={shortcut.title} key={shortcut.title} onPress={shortcut.onPress} style={[p.card, p.shortcut, roomyCards && { flexBasis: '46%' }]}><View style={p.shortcutIcons}><Icon name={shortcut.icon} size={22} color="#6E6257"/><Icon name="chevron-forward-outline" size={12} color="#6E6257"/></View><T style={p.shortcutLabel}>{shortcut.title}</T></Pressable>)}</View>
      </View>
    </ScrollView>
    {editingAvatar && <AvatarEditor uri={state.avatarUri} onClose={() => setEditingAvatar(false)} onSave={uri => { dispatch({ type: 'avatar', uri }); setEditingAvatar(false); }}/>}
    <HelpSupportDialog visible={supportVisible} onClose={() => setSupportVisible(false)}/>
    <Modal transparent visible={panel !== null} animationType="fade" onRequestClose={() => setPanel(null)}>
      <View style={p.modalBackdrop}><View accessibilityViewIsModal style={p.modalCard}><ScrollView contentContainerStyle={{ gap: 18 }}>
        <View style={p.heading}><T accessibilityRole="header" style={p.modalTitle}>{panel?.title}</T><Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={() => setPanel(null)} style={p.iconButton}><Icon name="close-outline" size={25}/></Pressable></View>
        <T style={p.modalBody}>{panel?.body}</T>
        {panel?.action && <Button title={panel.action.label} onPress={() => { const action = panel.action; setPanel(null); action?.run(); }}/>}
        <Button title="Done" secondary onPress={() => setPanel(null)}/>
      </ScrollView></View></View>
    </Modal>
  </SafeAreaView>;
}

const p = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2EEE8' }, content: { paddingBottom: 14 },
  hero: { minHeight: 184, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, overflow: 'hidden' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tagline: { fontSize: 6.5, lineHeight: 10, letterSpacing: 3.4, color: '#34342F', marginLeft: 38, marginTop: 5 },
  headerActions: { flexDirection: 'row', marginRight: -8, marginTop: 2, gap: 1 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  quote: { position: 'absolute', top: 79, right: 22, fontFamily: serif, fontSize: 14, lineHeight: 17, color: '#8D7760', textAlign: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 17, width: '78%' },
  avatarButton: { width: 88, height: 88 },
  avatar: { width: '100%', height: '100%', overflow: 'hidden', borderRadius: 50, borderWidth: 2.5, borderColor: '#FFFDF9', backgroundColor: '#DDD0BB' },
  pencil: { position: 'absolute', right: -2, bottom: 6, width: 25, height: 25, borderRadius: 20, backgroundColor: '#3B3B37', borderWidth: 1.5, borderColor: '#FFFDFA', alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, gap: 3 }, name: { fontFamily: serif, fontSize: 29, lineHeight: 33, color: '#191A17' },
  bio: { fontSize: 12, lineHeight: 16, color: '#5A5550' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, minHeight: 22 },
  locationText: { fontSize: 10, lineHeight: 14, color: '#625A53' }, cards: { paddingHorizontal: 12, gap: 8 },
  card: { backgroundColor: '#FFFDFA', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 13, padding: 10, gap: 7 },
  plus: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#D6B991', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  crown: { width: 32, height: 32, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  plusTitle: { fontFamily: serif, fontSize: 21, lineHeight: 25, color: '#8A581D' },
  plusBody: { fontSize: 10, lineHeight: 15, color: '#695743' },
  previewPill: { borderWidth: 1, borderColor: '#DDCBB2', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, lineHeight: 13, color: '#786448' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 21 },
  headingTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  cardTitle: { fontFamily: serif, fontSize: 17, lineHeight: 22, color: ink, flexShrink: 1 },
  headingAction: { minWidth: 26, minHeight: 26, alignItems: 'flex-end', justifyContent: 'center' },
  edit: { fontFamily: serif, fontSize: 12, lineHeight: 17, color: '#496C91', textDecorationLine: 'underline' },
  interests: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  interest: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 18, paddingHorizontal: 10, minHeight: 31 },
  interestText: { fontSize: 10, lineHeight: 14, color: '#49463F' }, emptyCopy: { fontSize: 12, lineHeight: 18, color: muted },
  stats: { flexDirection: 'row', paddingHorizontal: 0, paddingVertical: 9, gap: 0 },
  stat: { flex: 1, alignItems: 'center', gap: 2 }, statBorder: { borderLeftWidth: 1, borderLeftColor: '#EAE4DC' },
  statValue: { fontFamily: serif, fontSize: 25, lineHeight: 28, color: '#272824' },
  statLabel: { fontSize: 10, lineHeight: 12, color: '#4A4640', textAlign: 'center' },
  summary: { overflow: 'hidden', padding: 12, minHeight: 153, gap: 9, alignItems: 'flex-end' },
  summaryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 4 },
  summaryTitle: { fontFamily: serif, fontSize: 14, lineHeight: 18, color: '#352B3B', flexShrink: 1 },
  summaryPreview: { fontFamily: serif, fontSize: 10, lineHeight: 14, color: '#8C7F8A' },
  summaryContent: { flexDirection: 'row', width: '100%', gap: 6 },
  reflectionTitle: { fontFamily: serif, fontSize: 20, lineHeight: 22, letterSpacing: -0.55, color: '#493653' },
  reflectionBody: { fontSize: 10, lineHeight: 14, color: '#80747D', marginTop: 7 },
  explorer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 15 },
  explorerTitle: { fontFamily: serif, fontSize: 18, lineHeight: 20, color: '#493452', textAlign: 'center' },
  explorerTagline: { fontSize: 5.5, lineHeight: 9, letterSpacing: 1.4, color: '#66516D', marginTop: 7 },
  splitRow: { flexDirection: 'row', gap: 7 }, halfCard: { flex: 1, padding: 9, gap: 8 },
  miniContent: { flexDirection: 'row', alignItems: 'center', gap: 6 }, miniImage: { width: 40, height: 40, borderRadius: 5, backgroundColor: '#ECE1E7' },
  miniText: { flex: 1, gap: 4 }, miniTitle: { fontFamily: serif, fontSize: 12, lineHeight: 14, color: ink }, miniDetail: { fontSize: 8, lineHeight: 11, color: muted },
  shortcuts: { flexDirection: 'row', gap: 6 }, shortcut: { flex: 1, padding: 8, gap: 7, minHeight: 61 },
  shortcutIcons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, shortcutLabel: { fontSize: 9, lineHeight: 12, color: '#3C3833' },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#221D1866', padding: 20 },
  modalCard: { width: '100%', maxWidth: 370, maxHeight: '90%', padding: 20, borderRadius: 20, backgroundColor: '#FFFCF7' },
  modalTitle: { fontFamily: serif, fontSize: 23, lineHeight: 28, color: ink, flex: 1 }, modalBody: { fontSize: 14, lineHeight: 22, color: '#70675E' },
});
