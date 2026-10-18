import React, { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Icon, T, serif, useRootNavigation, type IconName } from '../ui';

// Original UI-demo artworks. These are not QUT collection or exhibition records.
const works = [
  { id: 'river', title: 'River rhythm', category: 'Colour', image: require('../../assets/qut-river-rhythm.png'), medium: 'Digital colour study', description: 'Blue curves move across a warm, quiet ground. A single orange circle interrupts their rhythm, inviting your eye to slow down and find its own path.', prompt: 'Follow one blue curve with your eyes. Where does it lead you?', time: '3 min' },
  { id: 'architecture', title: 'Soft architecture', category: 'Form', image: require('../../assets/qut-soft-architecture.png'), medium: 'Digital form study', description: 'A sequence of terracotta arches frames a small, still sphere. Repeated shapes turn a familiar doorway into an imagined space between architecture and sculpture.', prompt: 'Imagine stepping through these arches. How would this space feel?', time: '4 min' },
  { id: 'places', title: 'Between places', category: 'Nature', image: require('../../assets/qut-between-places.png'), medium: 'Digital landscape study', description: 'Layered greens and a winding line suggest a landscape remembered rather than mapped. The open spaces leave room for a place of your own.', prompt: 'Which shape reminds you of somewhere you have been?', time: '3 min' },
] as const;
type DemoWork = typeof works[number];
type Tab = 'Discover' | 'Visit' | 'Saved';
const blue = '#123F70', muted = '#6F746F', paper = '#F8F6F1';
const officialWebsite = 'https://www.artmuseum.qut.edu.au/';

export function QutMuseumScreen() {
  const nav = useRootNavigation();
  const focused = useIsFocused();
  const [tab, setTab] = useState<Tab>('Discover');
  const [filter, setFilter] = useState('All');
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<DemoWork | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [linkError, setLinkError] = useState(false);
  const toggleSave = (id: string) => setSaved(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  const openLink = async (url: string) => {
    setLinkError(false);
    try { await Linking.openURL(url); } catch { setLinkError(true); }
  };
  const tourWork = tourStep !== null && tourStep < works.length ? works[tourStep] : null;
  const modalWork = selected || tourWork;
  const closeModal = () => { setSelected(null); setTourStep(null); };
  const visibleWorks = tab === 'Saved' ? works.filter(work => saved.includes(work.id)) : works.filter(work => filter === 'All' || work.category === filter);

  const saveButton = (work: DemoWork, light = false) => <Pressable accessibilityRole="button" accessibilityLabel={`${saved.includes(work.id) ? 'Unsave' : 'Save'} ${work.title}`} accessibilityState={{ selected: saved.includes(work.id) }} onPress={() => toggleSave(work.id)} style={[styles.iconButton, light && styles.saveButton]}><Icon name={saved.includes(work.id) ? 'bookmark' : 'bookmark-outline'} size={19} color={blue}/></Pressable>;

  return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
    {focused && <StatusBar style="dark"/>}
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to museum selection" onPress={() => nav.goBack()} style={styles.iconButton}><Icon name="arrow-back" size={21} color={blue}/></Pressable>
      <View style={styles.brand}><View style={styles.brandIcon}><View style={styles.brandCorner}/></View><T style={styles.brandText}>Unframe</T></View>
      <View style={styles.demoBadge}><T style={styles.demoText}>DEMO</T></View>
    </View>
    <ScrollView key={tab} testID="qut-content" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.museumHeading}>
        <View style={styles.qutMark}><T style={styles.qutText}>QUT</T></View>
        <View style={{ flex: 1 }}><T accessibilityRole="header" style={styles.museumName}>QUT Art Museum</T><View style={styles.inline}><Icon name="location-outline" size={12} color={muted}/><T style={styles.location}>Gardens Point, Brisbane</T></View></View>
        <View style={styles.freeBadge}><T style={styles.freeText}>Free entry</T></View>
      </View>

      {tab === 'Discover' && <>
        <View style={styles.intro}><T style={styles.eyebrow}>YOUR CAMPUS. A DIFFERENT PERSPECTIVE.</T><T accessibilityRole="header" style={styles.headline}>A fresh way{'\n'}to see.</T><T style={styles.introText}>Step out of the everyday. Into a little art.</T></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Explore Ways of seeing demo exhibition" onPress={() => setSelected(works[0])} style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
          <Image source={require('../../assets/qut-gallery.png')} style={styles.heroImage} accessibilityLabel="Original illustration of a light-filled gallery with abstract art"/>
          <View style={styles.heroBadge}><View style={styles.dot}/><T style={styles.heroBadgeText}>DEMO EXHIBITION</T></View>
          <View style={styles.heroCopy}><View style={{ flex: 1 }}><T style={styles.heroEyebrow}>LOOK CLOSER. FEEL SOMETHING NEW.</T><T style={styles.heroTitle}>Ways of seeing</T><T style={styles.heroSubtitle}>Colour, form & the spaces in between</T></View><View style={styles.heroArrow}><Icon name="arrow-forward" color="white" size={21}/></View></View>
        </Pressable>
        <View style={styles.tourCard}>
          <View style={styles.tourIcon}><Icon name="sparkles-outline" color={blue} size={22}/></View>
          <View style={{ flex: 1 }}><T style={styles.tourTitle}>A little time for art</T><T style={styles.smallText}>3 works · 10 minutes · your own pace</T></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Start slow-looking demo tour" onPress={() => setTourStep(0)} style={styles.startButton}><T style={styles.startText}>Start</T><Icon name="arrow-forward" color={blue} size={15}/></Pressable>
        </View>
      </>}

      {tab !== 'Visit' && <View style={styles.worksSection}>
        <View style={styles.sectionHeading}><T accessibilityRole="header" style={styles.sectionTitle}>{tab === 'Saved' ? 'Your little collection' : 'Find what moves you'}</T><T style={styles.count}>{visibleWorks.length.toString().padStart(2, '0')}</T></View>
        <T style={styles.sectionSubtitle}>{tab === 'Saved' ? 'Pieces you saved for this demo visit.' : 'No right answers. Just your curiosity.'}</T>
        {tab === 'Discover' && <View style={styles.filters}>{['All', 'Colour', 'Form', 'Nature'].map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Filter ${item}`} accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.activeFilter]}><T style={[styles.filterText, filter === item && styles.activeFilterText]}>{item}</T></Pressable>)}</View>}
        <View style={styles.grid}>{visibleWorks.map(work => <View key={work.id} style={styles.artCard}>
          <View><Pressable accessibilityRole="button" accessibilityLabel={`Explore ${work.title}`} onPress={() => setSelected(work)} style={({ pressed }) => pressed && styles.pressed}><Image source={work.image} style={styles.artImage} accessibilityLabel={`${work.title}, original ${work.category.toLowerCase()} study`}/></Pressable><View style={styles.savePosition}>{saveButton(work, true)}</View><View style={styles.timeBadge}><T style={styles.timeText}>{work.time}</T></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Read about ${work.title}`} onPress={() => setSelected(work)}><T style={styles.artTitle}>{work.title}</T><T style={styles.artSubtitle}>Unframe studio · Demo artwork</T></Pressable>
        </View>)}</View>
        {!visibleWorks.length && <View style={styles.empty}><Icon name="bookmark-outline" size={30} color={blue}/><T style={styles.emptyTitle}>Keep a little inspiration</T><T style={styles.emptyText}>Tap the bookmark on a piece you love. Find it here during your visit.</T><Pressable accessibilityRole="button" accessibilityLabel="Discover demo artworks" onPress={() => setTab('Discover')} style={styles.primaryButton}><T style={styles.primaryText}>Discover artworks</T><Icon name="arrow-forward" color="white" size={17}/></Pressable></View>}
      </View>}

      {tab === 'Discover' && <Pressable accessibilityRole="button" accessibilityLabel="Plan your QUT visit" onPress={() => setTab('Visit')} style={styles.visitTeaser}><View style={styles.visitIcon}><Icon name="walk-outline" color={blue} size={24}/></View><View style={{ flex: 1 }}><T style={styles.tourTitle}>Make a little space for art</T><T style={styles.smallText}>Find us at QUT Gardens Point</T></View><Icon name="arrow-forward" color={blue} size={20}/></Pressable>}

      {tab === 'Visit' && <View style={styles.visitSection}>
        <T style={styles.eyebrow}>A PAUSE IN THE HEART OF THE CITY</T><T accessibilityRole="header" style={styles.headline}>Come curious.{'\n'}Leave inspired.</T>
        <Image source={require('../../assets/qut-gallery.png')} style={styles.visitImage} accessibilityLabel="Illustrative gallery interior for the QUT UI demo"/>
        <T style={styles.visitLead}>Art is closer than you think.</T><T style={styles.body}>Discover Australian art at QUT’s Gardens Point campus, beside the City Botanic Gardens. Drop in, take your time, and see where your curiosity leads.</T>
        <View style={styles.infoRow}><Icon name="location-outline" color={blue}/><View style={{ flex: 1 }}><T style={styles.infoTitle}>Find the museum</T><T style={styles.body}>U Block, QUT Gardens Point{'\n'}2 George Street, Brisbane QLD 4000</T></View></View>
        <View style={styles.infoRow}><Icon name="ticket-outline" color={blue}/><View style={{ flex: 1 }}><T style={styles.infoTitle}>A little art, open to everyone</T><T style={styles.body}>Free admission. Check the museum website for opening hours, exhibitions and access information before visiting.</T></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open QUT Art Museum official website" onPress={() => { void openLink(officialWebsite); }} style={styles.primaryButton}><T style={styles.primaryText}>Museum website</T><Icon name="open-outline" color="white" size={18}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Get directions to QUT Art Museum" onPress={() => { void openLink('https://www.google.com/maps/search/?api=1&query=QUT+Art+Museum+2+George+Street+Brisbane'); }} style={styles.secondaryButton}><Icon name="navigate-outline" color={blue} size={18}/><T style={styles.secondaryText}>Get directions</T></Pressable>
      </View>}

      {linkError && <T accessibilityRole="alert" style={styles.error}>Could not open the link. Please try again.</T>}
      <View style={styles.footer}><View style={styles.footerRule}/><T style={styles.footerBrand}>A little art. A little more you.</T><T style={styles.footerNote}>Unframe concept demo · Original sample exhibition & artworks.{'\n'}Gallery illustration; no live exhibition or location data.</T></View>
    </ScrollView>
    <View style={styles.tabBar}>{(['Discover', 'Visit', 'Saved'] as Tab[]).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item === 'Saved' ? `Saved${saved.length ? `, ${saved.length} artworks` : ''}` : item} accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={styles.tab}><Icon name={(({ Discover: 'compass-outline', Visit: 'location-outline', Saved: saved.length ? 'bookmark' : 'bookmark-outline' }) as Record<Tab, IconName>)[item]} size={22} color={tab === item ? blue : '#94968F'}/><T style={[styles.tabText, tab === item && { color: blue }]}>{item}{item === 'Saved' && saved.length > 0 ? ` (${saved.length})` : ''}</T><View style={[styles.tabIndicator, tab === item && { backgroundColor: blue }]}/></Pressable>)}</View>

    <Modal visible={!!selected || tourStep !== null} transparent animationType="slide" onRequestClose={closeModal}>
      <View style={styles.modalBackdrop}><SafeAreaView style={styles.modalPage} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}><T style={styles.eyebrow}>{tourStep !== null ? 'A LITTLE TIME FOR ART' : 'LOOK A LITTLE CLOSER'}</T><Pressable accessibilityRole="button" accessibilityLabel="Close artwork preview" onPress={closeModal} style={styles.iconButton}><Icon name="close" color={blue} size={24}/></Pressable></View>
        <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
          {modalWork ? <>
            {tourStep !== null && <View style={styles.progressRow}>{works.map((work, index) => <View key={work.id} style={[styles.progress, index <= tourStep && { backgroundColor: blue }]}/>)}</View>}
            <Image source={modalWork.image} style={styles.detailImage} accessibilityLabel={modalWork.title}/>
            <View style={styles.detailHeading}><View style={{ flex: 1 }}><T accessibilityRole="header" style={styles.detailTitle}>{modalWork.title}</T><T style={styles.body}>Unframe studio · Original demo artwork</T></View>{saveButton(modalWork)}</View>
            <T style={styles.eyebrow}>{modalWork.medium} · {modalWork.time}</T><T style={styles.body}>{modalWork.description}</T>
            <View style={styles.prompt}><Icon name="sparkles-outline" color={blue} size={20}/><View style={{ flex: 1 }}><T style={styles.infoTitle}>A moment to notice</T><T style={styles.promptText}>{modalWork.prompt}</T></View></View>
            {tourStep !== null ? <Pressable accessibilityRole="button" accessibilityLabel={tourStep === works.length - 1 ? 'Finish demo tour' : 'Next demo artwork'} onPress={() => setTourStep(tourStep + 1)} style={styles.primaryButton}><T style={styles.primaryText}>{tourStep === works.length - 1 ? 'Finish your little art break' : `Next artwork · ${tourStep + 1} of ${works.length}`}</T><Icon name="arrow-forward" color="white" size={18}/></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="Back to QUT demo" onPress={closeModal} style={styles.primaryButton}><T style={styles.primaryText}>Keep exploring</T><Icon name="arrow-forward" color="white" size={18}/></Pressable>}
          </> : <View style={styles.completion}><View style={styles.completionIcon}><Icon name="checkmark" color={blue} size={34}/></View><T accessibilityRole="header" style={styles.detailTitle}>A little art, just for you.</T><T style={styles.body}>Three works. Three different perspectives. Take a moment to think about the piece that stayed with you.</T><T style={styles.smallText}>You’ve completed the sample slow-looking tour.</T><Pressable accessibilityRole="button" accessibilityLabel="Return to QUT museum" onPress={closeModal} style={styles.primaryButton}><T style={styles.primaryText}>Back to discovering</T><Icon name="arrow-forward" color="white" size={18}/></Pressable></View>}
          <T style={styles.footerNote}>Original Unframe sample content for this UI demo.</T>
        </ScrollView>
      </SafeAreaView></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: paper }, header: { minHeight: 62, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#E6E4DC' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandText: { fontFamily: serif, fontSize: 23, lineHeight: 30, letterSpacing: -.8, color: blue }, brandIcon: { height: 17, width: 17, borderColor: blue, borderWidth: 2 }, brandCorner: { position: 'absolute', right: -4, top: -4, width: 9, height: 9, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#5089BF', backgroundColor: paper },
  demoBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#D7DDD9' }, demoText: { fontSize: 8, lineHeight: 14, letterSpacing: 1, color: muted }, content: { paddingHorizontal: 22, paddingBottom: 22 },
  museumHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 23 }, qutMark: { width: 39, height: 39, backgroundColor: blue, justifyContent: 'center', alignItems: 'center' }, qutText: { fontSize: 14, lineHeight: 20, letterSpacing: -1, color: 'white', fontWeight: '800' }, museumName: { color: blue, fontSize: 16, lineHeight: 23, fontWeight: '600', letterSpacing: -.4 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 3 }, location: { fontSize: 10, lineHeight: 17, color: muted }, freeBadge: { backgroundColor: '#E8ECE4', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 }, freeText: { fontSize: 9, lineHeight: 15, color: '#49604C' },
  intro: { paddingTop: 5, paddingBottom: 22 }, eyebrow: { fontSize: 8, lineHeight: 15, letterSpacing: 1.6, color: muted, fontWeight: '500' }, headline: { fontFamily: serif, fontSize: 49, lineHeight: 50, letterSpacing: -1.8, color: blue, marginTop: 10 }, introText: { fontSize: 12, lineHeight: 20, marginTop: 12, color: muted },
  hero: { borderRadius: 15, overflow: 'hidden', backgroundColor: '#EAE4D7' }, heroImage: { height: 218, width: '100%' }, heroBadge: { position: 'absolute', left: 13, top: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#FFFCF1ED', borderRadius: 5, flexDirection: 'row', gap: 5, alignItems: 'center' }, dot: { height: 4, width: 4, borderRadius: 2, backgroundColor: blue }, heroBadgeText: { fontSize: 7, lineHeight: 12, letterSpacing: 1, color: blue }, heroCopy: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: blue, paddingHorizontal: 18, paddingVertical: 19 }, heroEyebrow: { color: '#C1D3DF', fontSize: 7, lineHeight: 13, letterSpacing: 1.3 }, heroTitle: { color: '#FFFCF2', fontFamily: serif, fontSize: 29, lineHeight: 36, letterSpacing: -.9, marginTop: 3 }, heroSubtitle: { color: '#CFDAE3', fontSize: 10, lineHeight: 17, marginTop: 3 }, heroArrow: { width: 36, height: 36, borderWidth: 1, borderColor: '#6A87A3', borderRadius: 18, justifyContent: 'center', alignItems: 'center' }, pressed: { opacity: .8 },
  tourCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18, borderBottomWidth: 1, borderColor: '#E2E1D7' }, tourIcon: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#E9EDE6', alignItems: 'center', justifyContent: 'center' }, tourTitle: { fontSize: 12, lineHeight: 19, color: blue, fontWeight: '600' }, smallText: { fontSize: 9, lineHeight: 16, color: muted }, startButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5 }, startText: { fontSize: 11, lineHeight: 18, color: blue },
  worksSection: { paddingTop: 25 }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, sectionTitle: { flex: 1, fontFamily: serif, fontSize: 25, lineHeight: 32, color: blue, letterSpacing: -.8 }, count: { fontSize: 10, lineHeight: 18, color: '#7D857A' }, sectionSubtitle: { fontSize: 11, lineHeight: 19, color: muted, marginTop: 3, marginBottom: 13 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 17 }, filter: { minHeight: 39, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: '#DFE0D8', justifyContent: 'center' }, activeFilter: { backgroundColor: blue, borderColor: blue }, filterText: { fontSize: 10, lineHeight: 17, color: muted }, activeFilterText: { color: 'white' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 21 }, artCard: { width: '47.5%' }, artImage: { width: '100%', aspectRatio: .8, borderRadius: 10 }, savePosition: { position: 'absolute', top: 5, right: 5 }, saveButton: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#FAF7EDEB' }, timeBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: '#FFF9EAE8', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }, timeText: { fontSize: 8, lineHeight: 15, color: blue }, artTitle: { fontFamily: serif, fontSize: 18, lineHeight: 24, letterSpacing: -.4, color: blue, marginTop: 9 }, artSubtitle: { fontSize: 8, lineHeight: 15, color: muted, marginTop: 2 },
  visitTeaser: { marginTop: 29, paddingVertical: 17, paddingHorizontal: 13, backgroundColor: '#ECEEE5', borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, visitIcon: { width: 29, alignItems: 'center' }, visitSection: { gap: 16, paddingTop: 10 }, visitImage: { width: '100%', height: 214, borderRadius: 12 }, visitLead: { fontFamily: serif, color: blue, fontSize: 24, lineHeight: 31 }, body: { fontSize: 12, lineHeight: 22, color: '#646C69' }, infoRow: { flexDirection: 'row', gap: 13, paddingVertical: 17, borderTopWidth: 1, borderColor: '#E2E1D7' }, infoTitle: { fontSize: 13, lineHeight: 22, color: blue, fontWeight: '600', marginBottom: 3 },
  primaryButton: { minHeight: 49, borderRadius: 9, backgroundColor: blue, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 }, primaryText: { color: 'white', fontSize: 12, lineHeight: 20, flexShrink: 1 }, secondaryButton: { minHeight: 48, borderRadius: 9, borderWidth: 1, borderColor: '#C9D1D2', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, secondaryText: { color: blue, fontSize: 12, lineHeight: 20 },
  empty: { alignItems: 'center', paddingVertical: 39, gap: 16 }, emptyTitle: { fontFamily: serif, fontSize: 24, lineHeight: 30, color: blue }, emptyText: { fontSize: 12, lineHeight: 22, color: muted, textAlign: 'center', marginBottom: 7 }, footer: { alignItems: 'center', marginTop: 30, gap: 10 }, footerRule: { height: 1, width: 32, backgroundColor: '#C7CFCC', marginBottom: 3 }, footerBrand: { fontFamily: serif, fontSize: 16, lineHeight: 23, color: '#7A887F', fontStyle: 'italic' }, footerNote: { fontSize: 8, lineHeight: 14, color: '#82877E', textAlign: 'center' }, error: { color: '#A34B38', fontSize: 12, marginTop: 16 },
  tabBar: { flexDirection: 'row', minHeight: 68, borderTopWidth: 1, borderColor: '#E2E1D7', backgroundColor: paper, paddingTop: 9, paddingBottom: 4 }, tab: { flex: 1, alignItems: 'center', gap: 3, justifyContent: 'center' }, tabText: { fontSize: 9, lineHeight: 16, color: '#8C9088' }, tabIndicator: { width: 18, height: 2, borderRadius: 1, marginTop: 1 },
  modalBackdrop: { flex: 1, backgroundColor: '#142A3A77', alignItems: 'center', justifyContent: 'center' }, modalPage: { backgroundColor: paper, width: '100%', maxWidth: 406, height: '100%' }, modalHeader: { minHeight: 66, paddingLeft: 22, paddingRight: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalContent: { paddingHorizontal: 22, paddingBottom: 25, gap: 18 }, detailImage: { width: '100%', aspectRatio: .95, borderRadius: 12 }, detailHeading: { flexDirection: 'row', gap: 8, alignItems: 'center' }, detailTitle: { fontFamily: serif, fontSize: 32, lineHeight: 39, letterSpacing: -.8, color: blue }, prompt: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#E8EDE6', padding: 17, borderRadius: 12 }, promptText: { color: blue, fontFamily: serif, fontSize: 19, lineHeight: 28 }, progressRow: { flexDirection: 'row', gap: 5 }, progress: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#D8DFD9' }, completion: { gap: 24, paddingTop: 55, paddingBottom: 40 }, completionIcon: { alignSelf: 'flex-start', width: 68, height: 68, borderRadius: 34, backgroundColor: '#E4EBDD', justifyContent: 'center', alignItems: 'center' },
});
