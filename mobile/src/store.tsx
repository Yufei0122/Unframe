import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { artworks, initialState, type MobileState } from './model';
import { reducer, restoreState, type Action } from './state';

const KEY = 'unframe.mobile.v1';
const Context = createContext<{ state: MobileState; dispatch: React.Dispatch<Action>; storageError: string | null } | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const writes = useRef(Promise.resolve());
  const [attempt, setAttempt] = useState(0);
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
  return <Context.Provider value={{ state, dispatch, storageError }}>{children}</Context.Provider>;
}
export function useStore() { const value = useContext(Context); if (!value) throw new Error('StoreProvider is required'); return value; }
