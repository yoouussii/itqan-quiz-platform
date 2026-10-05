import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, FileQuestion, GraduationCap, LayoutGrid, CornerDownLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { openStudentProfile } from './StudentProfile';
import { navigateTo, pathFor } from '../../utils/router';
import { normalizeArabic } from '../../utils/arabicSearch';
import { uiDir, t } from '../../i18n';
import { User } from '../../types';

export type SearchPage = { id: string; label: string; href?: string };

type Hit = { key: string; group: 'students' | 'quizzes' | 'pages'; title: string; sub: string; run: () => void };

/** بحث سريع في كل المنصة (Ctrl+K): الطلاب والاختبارات والصفحات */
export const GlobalSearch: React.FC<{ pages: SearchPage[] }> = ({ pages }) => {
  const { users, quizzes, classes, setCurrentView, currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'ن')) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const s = normalizeArabic(q.trim());
    if (!s) return pages.slice(0, 8).map((p) => ({ key: `p-${p.id}`, group: 'pages', title: p.label, sub: '', run: () => (p.href ? window.open(p.href, '_blank', 'noopener') : setCurrentView(p.id)) }));
    const has = (v?: string | null) => !!v && normalizeArabic(v).includes(s);
    const className = (id?: string | null) => classes.find((c) => c.id === id)?.name || '';
    const out: Hit[] = [];
    (users as User[]).filter((u) => u.role === 'student' && (has(u.name) || String(u.national_id || '').includes(q.trim()))).slice(0, 6)
      .forEach((u) => out.push({ key: `s-${u.id}`, group: 'students', title: u.name, sub: className(u.class_id), run: () => openStudentProfile(u.id) }));
    quizzes.filter((x) => !x.is_deleted && has(x.title)).slice(0, 5)
      .forEach((x) => out.push({ key: `q-${x.id}`, group: 'quizzes', title: x.title, sub: x.subject?.name || '', run: () => navigateTo(pathFor({ view: 'quiz_results', quizId: x.id })) }));
    pages.filter((p) => has(p.label)).slice(0, 5)
      .forEach((p) => out.push({ key: `p-${p.id}`, group: 'pages', title: p.label, sub: '', run: () => (p.href ? window.open(p.href, '_blank', 'noopener') : setCurrentView(p.id)) }));
    return out;
  }, [q, users, quizzes, classes, pages, setCurrentView]);
  useEffect(() => setSel(0), [q]);

  if (!currentUser) return null;
  const go = (h?: Hit) => { if (!h) return; setOpen(false); h.run(); };
  const GROUPS: Record<Hit['group'], [string, React.ElementType]> = { students: [t('الطلاب'), GraduationCap], quizzes: [t('الاختبارات'), FileQuestion], pages: [q.trim() ? t('الصفحات') : t('انتقال سريع'), LayoutGrid] };
  let idx = -1;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('بحث في المنصة')} data-testid="global-search"
        className="lg:w-full h-11 w-11 lg:h-10 lg:px-3 flex items-center justify-center lg:justify-start gap-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:bg-slate-100 lg:dark:bg-slate-800/70 lg:text-slate-500 lg:hover:bg-slate-200/70">
        <Search className="w-5 h-5 lg:w-4 lg:h-4" />
        <span className="hidden lg:inline text-sm flex-1 text-start">{t('ابحث عن طالب أو اختبار أو صفحة…')}</span>
        <kbd className="hidden lg:inline text-[11px] font-sans px-1.5 rounded-md border border-slate-300 dark:border-slate-600" dir="ltr">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[75] bg-slate-900/40 flex items-start justify-center p-3 pt-[10vh]" role="dialog" aria-modal="true" aria-label={t('بحث في المنصة')} onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800" dir={uiDir()} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-100 dark:border-slate-800">
              <Search className="w-5 h-5 text-slate-400" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} data-testid="global-search-input"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                  else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                  else if (e.key === 'Enter') { e.preventDefault(); go(hits[sel]); }
                }}
                placeholder={t('اسم طالب أو رقم هويته، أو عنوان اختبار، أو اسم صفحة')} className="flex-1 min-w-0 bg-transparent outline-none text-base text-slate-900 dark:text-white placeholder:text-slate-400" />
              <button type="button" onClick={() => setOpen(false)} aria-label={t('إغلاق')} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-2" role="listbox">
              {hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">{t('لا نتائج لـ «{q}»', { q })}</p>}
              {(['students', 'quizzes', 'pages'] as const).map((g) => {
                const gh = hits.filter((h) => h.group === g);
                if (!gh.length) return null;
                const [title, Icon] = GROUPS[g];
                return (
                  <div key={g}>
                    <p className="px-4 pt-2 pb-1 text-xs font-bold text-slate-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{title}</p>
                    {gh.map((h) => {
                      idx += 1; const i = idx; const on = i === sel;
                      return (
                        <button key={h.key} type="button" role="option" aria-selected={on} onMouseEnter={() => setSel(i)} onClick={() => go(h)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-start text-sm ${on ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''}`}>
                          <span className="flex-1 min-w-0 font-semibold text-slate-900 dark:text-white truncate">{h.title}</span>
                          {h.sub && <span className="text-xs text-slate-500 truncate max-w-[40%]">{h.sub}</span>}
                          {on && <CornerDownLeft className="w-4 h-4 text-indigo-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
