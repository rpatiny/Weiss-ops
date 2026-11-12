import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_CONFIG } from '@/lib/config';
import { setFormatLocale } from '@/lib/format';
import { de } from './de';
import { en } from './en';
import { pt } from './pt';
import type { Dictionary, Locale, TFunction, TranslationKey } from './types';

export type { Locale, TFunction, TranslationKey } from './types';

export const LOCALES: { value: Locale; label: string; short: string; flag: string }[] = [
  { value: 'pt-BR', label: 'Português', short: 'PT', flag: '🇧🇷' },
  { value: 'en-US', label: 'English', short: 'EN', flag: '🇺🇸' },
  { value: 'de-DE', label: 'Deutsch', short: 'DE', flag: '🇩🇪' },
];

const DICTS: Record<Locale, Dictionary> = { 'pt-BR': pt, 'en-US': en, 'de-DE': de };
const KEY = `${APP_CONFIG.storagePrefix}:locale`;

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY) as Locale | null;
    if (saved && saved in DICTS) return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('de')) return 'de-DE';
  if (nav.startsWith('en')) return 'en-US';
  return 'pt-BR';
}

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(pt as Dictionary, key) ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | null>(null);

// Aplica o locale de formatação antes do primeiro render.
const initial = detectLocale();
setFormatLocale(initial);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setFormatLocale(l); // antes do re-render, para que datas/números já saiam no novo idioma
    setLocaleState(l);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n deve ser usado dentro de <I18nProvider>');
  return ctx;
}
