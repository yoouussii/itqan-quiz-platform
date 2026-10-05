import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, X, RotateCcw } from 'lucide-react';
import { Card } from './ui';
import { uiDir, t } from '../../i18n';

/**
 * شريط الفلاتر: صف واحد على الكمبيوتر، وعلى الجوال زر «تصفية» عليه عدد الفلاتر المفعّلة
 * يفتح لوحة من الأسفل، فتظهر الأرقام مباشرة دون أن تحجبها أدوات التصفية.
 */
export const FilterBar: React.FC<{
  children: React.ReactNode; active?: number; onReset?: () => void; actions?: React.ReactNode; label?: string; className?: string;
  /** وصف مختصر للفلاتر المفعّلة يظهر بجانب الزر على الجوال */ summary?: string[];
}> = ({ children, active = 0, onReset, actions, label, className = '', summary = [] }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  return (
    <>
      <Card className={`hidden md:flex p-3 flex-wrap items-center gap-2 ${className}`} role="group" aria-label={label || t('الفلاتر')}>
        <SlidersHorizontal className="w-4 h-4 text-slate-500" aria-hidden />
        {children}
        {active > 0 && onReset && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
            <RotateCcw className="w-3.5 h-3.5" />{t('إعادة ضبط')}
          </button>
        )}
        {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
      </Card>
      <div className="md:hidden flex items-center gap-2 flex-wrap" data-testid="filter-bar-mobile">
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="filter-open"
          className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" />{t('تصفية')}
          {active > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center">{active}</span>}
        </button>
        {summary.slice(0, 3).map((x) => <span key={x} className="h-7 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 inline-flex items-center max-w-[10rem] truncate">{x}</span>)}
        {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-[65] bg-slate-900/40 flex items-end" role="dialog" aria-modal="true" aria-label={label || t('الفلاتر')} onClick={() => setOpen(false)}>
          <div className="w-full max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 shadow-2xl" dir={uiDir()} onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mx-auto" aria-hidden />
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 dark:text-white flex-1">{label || t('تصفية')}</h2>
              {active > 0 && onReset && <button type="button" onClick={onReset} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" />{t('إعادة ضبط')}</button>}
              <button type="button" onClick={() => setOpen(false)} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-col gap-2.5 [&_select]:w-full [&_select]:h-11 [&_input]:h-11">{children}</div>
            <button type="button" onClick={() => setOpen(false)} className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold" data-testid="filter-apply">{t('عرض النتائج')}</button>
          </div>
        </div>
      )}
    </>
  );
};

/** حفظ آخر اختيار للفلاتر في كل صفحة (على هذا الجهاز) */
export function useRememberedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(`itqan_f_${key}`); return raw ? { ...(initial as any), ...JSON.parse(raw) } : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(`itqan_f_${key}`, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV];
}
