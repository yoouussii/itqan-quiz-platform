import React, { createContext, useContext } from 'react';
import { Languages } from 'lucide-react';
import type { Lang } from './index';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** هل يظهر زر تبديل اللغة لهذا المستخدم؟ */
  canSwitch: boolean;
}

export const LangContext = createContext<LangCtx>({ lang: 'ar', setLang: () => undefined, canSwitch: false });
export const useLang = () => useContext(LangContext);

/** زر «EN / ع» لتبديل لغة الواجهة */
export const LangToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { lang, setLang, canSwitch } = useLang();
  if (!canSwitch) return null;
  const next: Lang = lang === 'en' ? 'ar' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      lang={next}
      aria-label={next === 'en' ? 'Switch to English' : 'التبديل إلى العربية'}
      title={next === 'en' ? 'English' : 'العربية'}
      className={`h-10 px-3 inline-flex items-center gap-1.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 ${className}`}
    >
      <Languages className="w-[18px] h-[18px]" />
      <span>{next === 'en' ? 'EN' : 'ع'}</span>
    </button>
  );
};
