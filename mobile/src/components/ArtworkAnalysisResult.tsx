import React, { useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { Button, T, s } from '../ui';
import type { ArtworkAnalysis } from '../../../shared/ai-types';

export function ArtworkAnalysisResult({ result }: { result: ArtworkAnalysis }) {
  const [linkError, setLinkError] = useState('');
  const [details, setDetails] = useState(false);
  const reference = result.sources.filter(source => source.visualCheck === 'similar').sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1))[0];
  const suggestion = result.hypotheses[0];
  const identity = reference || suggestion;
  const otherSuggestions = result.hypotheses.filter(item => item.title !== identity?.title || item.artist !== identity?.artist);
  return <View testID="artwork-analysis-result" style={{ gap: 14 }}>
    <View style={{ gap: 5 }}>
      <T accessibilityRole="header" style={s.sectionTitle}>{identity?.title || 'Artwork not identified'}</T>
      {identity && <T>{identity.artist || 'Artist unknown'}</T>}
      <T style={s.small}>{reference ? `Possible match · ${reference.provider} · Unconfirmed` : identity ? 'AI suggestion · Unverified' : 'Visual description only'}</T>
    </View>
    {result.artworkPresence !== 'likely' && <T style={s.small}>{result.artworkPresence === 'unlikely' ? 'The model could not clearly identify an artwork in this view.' : 'A clearer view may help establish what is shown.'}</T>}
    <T numberOfLines={details ? undefined : 4}>{result.description}</T>
    <Button secondary title={details ? 'Hide details' : 'More details'} onPress={() => setDetails(!details)}/>
    {details && <>
    {!reference && !!suggestion && <T style={s.small}>{suggestion.basis}</T>}
    {result.visualFeatures.map((feature, index) => <T key={index} style={s.small}>• {feature}</T>)}
    {!!result.visibleText.length && <><T style={s.label}>Possible text in the image</T><T style={s.small}>{result.visibleText.join(' · ')}</T></>}
    {!!otherSuggestions.length && <><T style={s.label}>Other suggestions · unverified</T>{otherSuggestions.map((item, index) => <View key={index} style={{ gap: 4 }}><T>{item.title}{item.artist ? ` · ${item.artist}` : ''}</T><T style={s.small}>{item.basis}</T></View>)}</>}
    {!!result.sources.length && <T style={s.label}>Public references to compare</T>}
    {result.sources.map(source => <View key={source.id} style={{ gap: 8 }}>
      {!!source.imageUrl && source.visualCheck !== 'unavailable' && <Image source={{ uri: source.imageUrl }} accessibilityLabel={`Reference: ${source.title}`} style={{ width: '100%', height: 150 }} resizeMode="contain"/>}
      <T style={s.label}>{source.title}</T><T style={s.small}>{[source.artist, source.date, source.provider].filter(Boolean).join(' · ')}</T>
      <T style={s.small}>{source.visualCheck === 'similar' ? 'Visually similar reference · identity still unconfirmed' : source.visualCheck === 'different' ? 'Reference differs visually · this is not a confirmed match' : 'Search result only · image match not verified'}</T>
      <Button secondary title={`Open source: ${source.provider}`} icon="open-outline" onPress={() => { setLinkError(''); void Linking.openURL(source.sourceUrl).catch(() => setLinkError('The source could not be opened. Please try again.')); }}/>
    </View>)}
    {result.search.status === 'unavailable' || result.search.status === 'partial' ? <T style={s.small}>Some public sources could not be reached. The identity remains unconfirmed.</T>
      : result.search.status === 'disabled' ? <T style={s.small}>Public catalogue search is turned off on this server.</T>
      : !result.sources.length ? <T style={s.small}>No supporting public reference was found. This does not mean the image contains no art.</T> : null}
    {!!linkError && <T accessibilityRole="alert" style={s.small}>{linkError}</T>}
    </>}
  </View>;
}
