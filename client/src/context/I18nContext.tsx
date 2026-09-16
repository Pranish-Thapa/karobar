import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import en from '../lib/translations';
import ne from '../lib/translations-ne';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

type Language = 'en' | 'ne';
type Translations = typeof en;

interface I18nContextType {
  lang: Language;
  t: Translations;
  setLanguage: (lang: Language) => void;
}

const translations: Record<Language, Translations> = { en, ne };

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [lang, setLang] = useState<Language>((user?.language as Language) || 'en');

  useEffect(() => {
    if (user?.language) setLang(user.language as Language);
  }, [user?.language]);

  const setLanguage = async (l: Language) => {
    setLang(l);
    try {
      await api.settings.updateLanguage(l);
      updateUser({ language: l });
    } catch (err) {
      console.error('Failed to save language:', err);
    }
  };

  return (
    <I18nContext.Provider value={{ lang, t: translations[lang], setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
