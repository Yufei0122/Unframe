import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { matchMuseum, nearestMuseum, museums, type MuseumId } from './museum';

type LocationState = { status: 'loading' | 'nearby' | 'outside' | 'denied' | 'unavailable'; distance?: number; accuracy?: number | null };
export type DeviceCoordinates = { latitude: number; longitude: number; accuracy: number | null };
const Context = createContext<{ location: LocationState; coordinates: DeviceCoordinates | null; locate: () => Promise<void>; museumId: MuseumId; museum: typeof museums[MuseumId]; selectMuseum: (id: MuseumId) => void } | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LocationState>({ status: 'loading' });
  const [coordinates, setCoordinates] = useState<DeviceCoordinates | null>(null);
  const [museumId, setMuseumId] = useState<MuseumId>('met');
  const selectedId = useRef<MuseumId>('met');
  const manualSelection = useRef(false);
  const lastCoords = useRef<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const selectMuseum = useCallback((id: MuseumId) => {
    selectedId.current = id; manualSelection.current = true; setMuseumId(id);
    if (lastCoords.current) {
      const match = matchMuseum(lastCoords.current, id);
      setLocation({ status: match.nearby ? 'nearby' : 'outside', distance: match.distance, accuracy: lastCoords.current.accuracy });
    }
  }, []);
  const active = useRef(true);
  const request = useRef(0);
  const locate = useCallback(async () => {
    const token = ++request.current;
    const update = (value: LocationState) => { if (active.current && token === request.current) setLocation(value); };
    update({ status: 'loading' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Include permission acquisition in the deadline, so an ignored prompt never blocks the demo.
      const result = await Promise.race([
        (async () => {
          if (Platform.OS === 'web') {
            if (!navigator.geolocation) throw new Error('unavailable');
            return await new Promise<GeolocationCoordinates>((resolve, reject) => navigator.geolocation.getCurrentPosition(
              value => resolve(value.coords),
              error => reject(new Error(error.code === 1 ? 'denied' : 'unavailable')),
              { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
            ));
          }
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) throw new Error('denied');
          return (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('unavailable')), 15000); }),
      ]);
      if (!active.current || token !== request.current) return;
      lastCoords.current = result;
      setCoordinates({ latitude: result.latitude, longitude: result.longitude, accuracy: result.accuracy });
      const nearbyId = nearestMuseum(result);
      if (!manualSelection.current && nearbyId) { selectedId.current = nearbyId; setMuseumId(nearbyId); }
      const match = matchMuseum(result, selectedId.current);
      update({ status: match.nearby ? 'nearby' : 'outside', distance: match.distance, accuracy: result.accuracy });
    } catch (error) {
      if (active.current && token === request.current) { lastCoords.current = null; setCoordinates(null); }
      update({ status: error instanceof Error && error.message === 'denied' ? 'denied' : 'unavailable' });
    } finally { if (timer) clearTimeout(timer); }
  }, []);
  useEffect(() => { active.current = true; void locate(); return () => { active.current = false; request.current++; }; }, [locate]);
  return <Context.Provider value={{ location, coordinates, locate, museumId, museum: museums[museumId], selectMuseum }}>{children}</Context.Provider>;
}

export function useMuseumLocation() {
  const value = useContext(Context);
  if (!value) throw new Error('LocationProvider is required');
  return value;
}

export function locationLabel(status: LocationState['status']) {
  return { loading: 'Finding your museum…', nearby: 'Near your location', outside: 'Explore a demo museum', denied: 'Location off · demo museum', unavailable: 'Location unavailable · demo museum' }[status];
}
