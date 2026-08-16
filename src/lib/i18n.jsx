import { createContext, useContext, useEffect, useState } from 'react';
import { en } from '@/lib/translations/en';
import { el } from '@/lib/translations/el';

const STORAGE_KEY = 'expensetrack_language';
const DICTS = { en, el };
export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'el', label: 'Ελληνικά' },
];

function getInitial() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'el') return stored;
  return (navigator.language || '').toLowerCase().startsWith('el') ? 'el' : 'en';
}

function resolve(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

const LanguageContext = createContext(null);

// Same local-only pattern as useDarkMode — a device preference, not synced
// through the Google Sheets store.
export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // Falls back to English for any key missing from a non-English dictionary,
  // so a partially-translated addition never renders blank.
  const t = (key, vars) => {
    const value = resolve(DICTS[lang], key) ?? resolve(DICTS.en, key);
    if (value == null) return key;
    return typeof value === 'string' ? interpolate(value, vars) : value;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
