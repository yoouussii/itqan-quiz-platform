// اللغة: العربية (الأصل) أو الإنجليزية.
// النص العربي نفسه هو مفتاح الترجمة: t('نتائجي') ← «My results» بالإنجليزية، ويبقى كما هو بالعربية.
// نص بلا ترجمة يظهر بالعربية (لا تظهر مفاتيح فارغة). للتحقق: node scripts/i18n-check.mjs
import { EN } from './en';

export type Lang = 'ar' | 'en';
const KEY = 'itqan_lang';

const readPref = (): Lang => {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
};

let current: Lang = readPref();

/** اللغة التي اختارها المستخدم على هذا الجهاز */
export const loadLangPref = readPref;
export const saveLangPref = (l: Lang) => {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
};

export const getLang = () => current;
export const isEn = () => current === 'en';
export const uiDir = (): 'rtl' | 'ltr' => (current === 'en' ? 'ltr' : 'rtl');

/** تطبيق اللغة الفعلية على الصفحة (اتجاه النص ولغة المستند) */
export function applyLang(l: Lang) {
  current = l;
  const html = document.documentElement;
  html.lang = l;
  html.dir = l === 'en' ? 'ltr' : 'rtl';
}

/** ترجمة نص عربي، مع قيم متغيرة: t('ينتهي {date}', { date }) */
export function t(ar: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? EN[ar] ?? ar : ar;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  return s;
}

/** صيغة التواريخ: ميلادي بأرقام لاتينية في اللغتين */
export const dateLocale = () => (current === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn');

/** صيغة الجمع في الإنجليزية: plural(3, 'question') ← «3 questions» */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** حروف الاختيارات: أ ب ج د… أو A B C D… */
export const optionLetters = () => (current === 'en' ? ['A', 'B', 'C', 'D', 'E', 'F'] : ['أ', 'ب', 'ج', 'د', 'هـ', 'و']);
