'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Lang } from './i18n';

interface LangCtxValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  isRTL: boolean;
}

const LangCtx = createContext<LangCtxValue>({ lang: 'en', setLang: () => {}, isRTL: false });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const saved = (localStorage.getItem('lang') as Lang) || 'en';
    applyLang(saved);
    setLangState(saved);
  }, []);

  const applyLang = (l: Lang) => {
    document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = l;
  };

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('lang', l);
    applyLang(l);
  }, []);

  return (
    <LangCtx.Provider value={{ lang, setLang, isRTL: lang === 'fa' }}>
      {children}
    </LangCtx.Provider>
  );
}

export function useLang(): LangCtxValue {
  return useContext(LangCtx);
}

export function LangToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
      style={{
        background: 'rgba(255,255,255,0.15)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 6,
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 10px',
        cursor: 'pointer',
        letterSpacing: '0.05em',
        ...style,
      }}
    >
      {lang === 'en' ? 'فا' : 'EN'}
    </button>
  );
}

export function LangToggleDark({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
      style={{
        background: 'transparent',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        color: '#374151',
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 10px',
        cursor: 'pointer',
        letterSpacing: '0.05em',
        ...style,
      }}
    >
      {lang === 'en' ? 'فا' : 'EN'}
    </button>
  );
}
