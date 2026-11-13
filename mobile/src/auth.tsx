import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { StudioUser } from '../../shared/studio-types';
import { StudioError, studioRequest } from './studio/api';

export interface AuthSession { token: string; user: StudioUser }
interface AuthValue {
  session: AuthSession | null;
  getSession: () => AuthSession | null;
  acceptSession: (value: AuthSession) => void;
  refreshSession: () => Promise<StudioUser | null>;
  signOut: () => Promise<void>;
}
const Auth = createContext<AuthValue | null>(null);

/** One in-memory login shared by visitor and staff screens. Permissions come from the API. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const current = useRef<AuthSession | null>(null);
  const pending = useRef<{ token: string; promise: Promise<StudioUser | null> } | null>(null);
  const acceptSession = useCallback((value: AuthSession) => { current.current = value; setSession(value); }, []);
  const getSession = useCallback(() => current.current, []);
  const signOut = useCallback(async () => {
    const previous = current.current;
    current.current = null; setSession(null);
    if (previous) await studioRequest('/auth/logout', previous.token, {}).catch(() => {});
  }, []);
  const refreshSession = useCallback((): Promise<StudioUser | null> => {
    const token = current.current?.token;
    if (!token) return Promise.resolve(null);
    if (pending.current?.token === token) return pending.current.promise;
    const promise = (async () => {
      try {
        const result = await studioRequest<{ user: StudioUser }>('/auth/session', token);
        if (current.current?.token !== token) return null;
        const value = { token, user: result.user };
        current.current = value; setSession(value);
        return result.user;
      } catch (error) {
        if (current.current?.token !== token) return null;
        if (error instanceof StudioError && error.code === 'AUTH_REQUIRED') { current.current = null; setSession(null); return null; }
        throw error;
      } finally { if (pending.current?.token === token) pending.current = null; }
    })();
    pending.current = { token, promise };
    return promise;
  }, []);
  useEffect(() => {
    if (!session?.token) return;
    const refresh = () => { void refreshSession().catch(() => {}); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, 30000);
    if (Platform.OS === 'web') window.addEventListener('focus', refresh);
    return () => { subscription.remove(); clearInterval(timer); if (Platform.OS === 'web') window.removeEventListener('focus', refresh); };
  }, [session?.token, refreshSession]);
  return <Auth.Provider value={{ session, getSession, acceptSession, refreshSession, signOut }}>{children}</Auth.Provider>;
}
export function useAuth() { const value = useContext(Auth); if (!value) throw new Error('AuthProvider is required'); return value; }
