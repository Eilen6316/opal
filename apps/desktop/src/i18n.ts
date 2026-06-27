/** 五语 i18n:中文 / English / 日本語 / Français / 한국어。t(中文) → 当前语言,缺译回退中文。 */
import { createContext, useContext } from 'react';
import { DICT } from './i18n-dict.js';

export type Lang =
  | 'zh' | 'en' | 'fr' | 'de' | 'hi' | 'id' | 'it' | 'ja' | 'ko' | 'pt' | 'es419' | 'esES';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English (United States)' },
  { id: 'fr', label: 'Français (France)' },
  { id: 'de', label: 'Deutsch (Deutschland)' },
  { id: 'hi', label: 'हिन्दी (भारत)' },
  { id: 'id', label: 'Indonesia (Indonesia)' },
  { id: 'it', label: 'Italiano (Italia)' },
  { id: 'ja', label: '日本語 (日本)' },
  { id: 'ko', label: '한국어 (대한민국)' },
  { id: 'pt', label: 'Português (Brasil)' },
  { id: 'es419', label: 'Español (Latinoamérica)' },
  { id: 'esES', label: 'Español (España)' },
];

export type T = (zh: string) => string;

/** 以中文原文为键查当前语言译文;zh 或缺译时回退原文。 */
export function makeT(lang: Lang): T {
  return (zh: string): string => (lang === 'zh' ? zh : DICT[zh]?.[lang] ?? zh);
}

export const TContext = createContext<T>((s) => s);
export const useT = (): T => useContext(TContext);
