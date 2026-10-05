import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { artwork, artworks } from '../model';
import { images } from '../assets';
import { useStore } from '../store';
import { ArtCard, Button, Chip, Empty, Eyebrow, Notice, Page, T, Title, s, useRootNavigation } from '../ui';

export function SavedScreen() {
  const { state } = useStore(); const nav = useRootNavigation();
  const [tab, setTab] = useState<'saved' | 'visits'>('saved');
  useEffect(() => { if (state.visits.length) setTab('visits'); }, [state.visits.length]);
  const saved = artworks.filter(a => state.saved.includes(a.id));
  return <Page><Eyebrow>A collection of your own</Eyebrow><Title>Some things{`\n`}stay with you.</Title><T style={s.muted}>The works you loved. The paths you took.{`\n`}A little room to reflect.</T><View style={s.wrap}><Chip label={`Saved works (${saved.length})`} active={tab === 'saved'} onPress={() => setTab('saved')}/><Chip label={`Past visits (${state.visits.length})`} active={tab === 'visits'} onPress={() => setTab('visits')}/></View>{tab === 'saved' ? saved.length ? <View style={s.grid}>{saved.map(art => <ArtCard key={art.id} art={art}/>)}</View> : <><Empty title="Make room for a favourite." body="Tap the bookmark on an artwork to keep it in your own collection."/><Button title="Find something to love" onPress={() => nav.navigate('Home', { screen: 'Discover' })}/></> : state.visits.length ? state.visits.map(visit => <View key={visit.id} style={s.card}><T style={s.sectionTitle}>A day at Northbank</T><T style={s.small}>{new Date(visit.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</T><Eyebrow>Your visit reflection</Eyebrow><T style={s.muted}>{visit.summary}</T><View style={s.wrap}>{visit.artworkIds.map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Revisit ${artwork(id)?.title}`} onPress={() => nav.navigate('Artwork', { id })}><Image source={images[id]} style={{ width: 65, height: 76, borderRadius: 8 }}/></Pressable>)}</View><T style={s.small}>A reflection from your visited works · Template-generated</T></View>) : <><Empty title="Your story starts with a visit." body="Create a route, mark the works you explore, and finish your visit to keep a reflection."/><Button title="Plan a visit" icon="compass-outline" onPress={() => nav.navigate('Planner')}/></>}<Notice icon="lock-closed-outline">Your collection is saved on this device. No account or museum server is required.</Notice></Page>;
}
