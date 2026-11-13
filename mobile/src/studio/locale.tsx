import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'zh';
const Locale = createContext<{ language: Language; setLanguage: (value: Language) => void; t: (en: string, zh: string) => string }>({ language: 'en', setLanguage: () => {}, t: en => en });
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [language, update] = useState<Language>('en');
  useEffect(() => { void AsyncStorage.getItem('unframe.locale').then(value => { if (value === 'en' || value === 'zh') update(value); }).catch(() => {}); }, []);
  const setLanguage = (value: Language) => { update(value); void AsyncStorage.setItem('unframe.locale', value).catch(() => {}); };
  return <Locale.Provider value={{ language, setLanguage, t: (en, zh) => language === 'zh' ? zh : en }}>{children}</Locale.Provider>;
}
export const useLocale = () => useContext(Locale);
