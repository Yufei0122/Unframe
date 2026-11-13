import React, { createContext, useContext, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from 'react-native';
import { artworks, initialState, type MobileState } from './model';
import { reducer, restoreState, type Action } from './state';
import { studioRequest } from './studio/api';

const KEY = 'unframe.mobile.v1';
const Context = createContext<{ state: MobileState; dispatch: React.Dispatch<Action>; storageError: string | null; catalogueVersion: number; refreshCatalogue: () => Promise<void> } | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const writes = useRef(Promise.resolve());
  const [attempt, setAttempt] = useState(0);
  const [catalogueVersion, setCatalogueVersion] = useState(0);
  const catalogueRequest = useRef(0);
  const applyCatalogue = (incoming: unknown) => {
    if (!Array.isArray(incoming)) return;
    let changed = false;
    for (const item of incoming) {
      if (!item || typeof item !== 'object') continue;
      const art = artworks.find(art => art.id === item.id);
      if (!art) continue;
      const target = art as unknown as Record<string, unknown>;
      for (const field of ['year', 'description', 'detail', 'chineseIntroduction', 'sourceUrl', 'imageCredit']) {
        if (field === 'sourceUrl' && typeof item[field] === 'string') { try { const url = new URL(item[field]); if (url.protocol !== 'https:' || url.username || url.password) continue; } catch { continue; } }
        if (typeof item[field] === 'string' && item[field].length <= 5000 && target[field] !== item[field]) { target[field] = item[field]; changed = true; }
      }
    }
    if (changed) setCatalogueVersion(value => value + 1);
  };
  const refreshCatalogue = useCallback(async () => {
    const generation = ++catalogueRequest.current;
    try {
      const result = await studioRequest<{ artworks: unknown[] }>('/catalogue');
      if (generation !== catalogueRequest.current) return;
      applyCatalogue(result.artworks);
      await AsyncStorage.setItem('unframe.catalogue.v1', JSON.stringify(result.artworks));
    } catch { /* Visitor browsing remains available offline. */ }
  }, []);
  useEffect(() => {
    void AsyncStorage.getItem('unframe.catalogue.v1').then(raw => { if (raw) applyCatalogue(JSON.parse(raw)); }).catch(() => {}).finally(() => { void refreshCatalogue(); });
    const listener = AppState.addEventListener('change', status => { if (status === 'active') void refreshCatalogue(); });
    const focus = () => { void refreshCatalogue(); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focus', focus);
    return () => { listener.remove(); if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focus', focus); };
  }, [refreshCatalogue]);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY).then(raw => {
      const restored = raw ? restoreState(raw, initialState, artworks.map(a => a.id)) : initialState;
      if (active) { dispatch({ type: 'hydrate', state: restored }); setLoaded(true); }
    }).catch(error => { if (active) setLoadError(`Your saved data could not be loaded. ${error.message}`); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!loaded) return;
    const snapshot = JSON.stringify(state);
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, snapshot)).then(() => setStorageError(null)).catch(() => setStorageError('Changes could not be saved to this device. Free some storage and try again.'));
  }, [state, loaded]);
  if (!loaded) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#F7F8F2' }}>{loadError ? <><Text style={{ textAlign: 'center', marginBottom: 20 }}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => { setLoadError(''); setAttempt(n => n + 1); }}><Text>Try again</Text></Pressable></> : <><ActivityIndicator color="#344F3E"/><Text style={{ marginTop: 16 }}>Opening a new perspective…</Text></>}</View>;
  return <Context.Provider value={{ state, dispatch, storageError, catalogueVersion, refreshCatalogue }}>{children}</Context.Provider>;
}
export function useStore() { const value = useContext(Context); if (!value) throw new Error('StoreProvider is required'); return value; }
