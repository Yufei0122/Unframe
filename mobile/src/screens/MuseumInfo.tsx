import React from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { museums, type MuseumId } from '../museum';
import { locationLabel, useMuseumLocation } from '../location';
import { Button, Chip, Eyebrow, Icon, Notice, Page, T, Title, c, s, useRootNavigation } from '../ui';

export function MuseumInfoScreen() {
  const { location, locate, museum, museumId, selectMuseum } = useMuseumLocation();
  const nav = useRootNavigation();
  return <Page><Eyebrow>Your museum</Eyebrow><Title>{museum.shortName}</Title>
    <View style={s.wrap}>{(Object.keys(museums) as MuseumId[]).map(id => <Chip key={id} label={`Choose ${museums[id].shortName}`} active={museumId === id} onPress={() => selectMuseum(id)}/>)}</View>
    <T>{museum.name}</T><T style={s.muted}>{museum.address}</T>
    <View style={s.card}><View style={s.row}><Icon name="location-outline"/>{location.status === 'loading' && <ActivityIndicator color={c.green}/>}<T style={s.label}>{locationLabel(location.status)}</T></View>
      <T style={s.muted}>{location.status === 'nearby' ? `Your device location is near ${museum.shortName}. The indoor visit below is a demonstration.` : location.status === 'outside' ? `Your device location does not confirm that you are near ${museum.shortName}. You can still explore this demo.` : location.status === 'denied' ? 'Location permission was not granted. Enable it in your browser or device settings, or continue with the demo.' : location.status === 'loading' ? 'Checking your device location. You can start the demo at any time.' : 'We could not get a location fix. Try again or continue with the demo.'}</T>
      {location.distance !== undefined && <T style={s.small}>Device estimate: {location.distance < 1000 ? `${Math.round(location.distance)} m` : `${(location.distance / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} km`} from {museum.shortName}{location.accuracy != null ? ` · accuracy ±${Math.round(location.accuracy)} m` : ''}</T>}
      <Button title={location.status === 'loading' ? 'Finding location…' : 'Refresh my location'} icon="locate-outline" secondary disabled={location.status === 'loading'} onPress={() => { void locate(); }}/>
    </View>
    <Notice>Demo experience: the floor plan, indoor position, gallery names, floors and artwork distances are illustrative. They are not live indoor GPS guidance.</Notice>
    <Notice>{museum.catalogueNotice} Check each artwork’s official source for current availability.</Notice>
    <Button title={`Explore ${museum.shortName}`} icon="arrow-forward" onPress={() => nav.navigate('Home', { screen: 'Discover' })}/>
    <Button title={`Visit ${museum.collectionName} website`} secondary onPress={() => { void Linking.openURL(museum.website); }}/>
    <Button title="Back to welcome" secondary onPress={() => nav.popTo('Welcome')}/>
    <T style={s.small}>Location is checked on your device with your permission. Coordinates are not saved or sent to a museum server.</T>
  </Page>;
}
