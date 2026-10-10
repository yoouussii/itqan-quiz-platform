import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Languages, LogOut, Moon, Sun, UserCheck, UserCog, Search, Compass, RefreshCw } from 'lucide-react';
import { resetLocalCache } from '../../utils/safeStorage';
import { useApp } from '../../context/AppContext';
import { useLang } from '../../i18n/LangContext';
import { Avatar } from './Avatar';
import { t, isEn } from '../../i18n';
import { User } from '../../types';

/** حدث عام لإعادة الجولة التعريفية من القائمة */
export const TOUR_EVENT = 'itqan:tour';

/**
 * قائمة المستخدم: الصورة في الترويسة تفتح قائمة فيها الملف الشخصي والوضع الليلي واللغة
 * ومعاينة الموقع كمستخدم آخر (للمدير) والجولة التعريفية وتسجيل الخروج.
 */
export const UserMenu: React.FC<{ displayName: string; roleLabel: string; onProfile: () => void; showName?: boolean }> = ({ displayName, roleLabel, onProfile, showName }) => {
  const { currentUser, users, switchUser, theme, toggleTheme, logout } = useApp();
  const { lang, setLang, canSwitch } = useLang();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => { if (!open) { setPreview(false); setQ(''); } }, [open]);
  const list = useMemo(() => {
    const s = q.trim();
    return (users as User[]).filter((u) => !s || u.name?.includes(s) || String(u.national_id || '').includes(s)).slice(0, 60);
  }, [users, q]);
  if (!currentUser) return null;
  const isAdmin = currentUser.role === 'admin';
  const Back = isEn() ? ChevronLeft : ChevronRight;
  const item = 'w-full h-11 px-3 flex items-center gap-3 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-start';
  const close = () => setOpen(false);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-label={t('قائمة المستخدم')} aria-expanded={open} aria-haspopup="menu" data-testid="user-menu"
        className="flex items-center gap-2.5 rounded-xl p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
        <Avatar name={displayName} role={currentUser.role} userId={currentUser.id} size="sm" showBadge={currentUser.role === 'student'} />
        {showName && <span className="hidden lg:block text-sm font-bold text-slate-900 dark:text-white max-w-[12rem] truncate" title={currentUser.name}>{displayName}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 text-start">
          {!preview ? (
            <>
              <div className="flex items-center gap-3 px-2 pt-1 pb-3 mb-1 border-b border-slate-100 dark:border-slate-800">
                <Avatar name={displayName} role={currentUser.role} userId={currentUser.id} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{roleLabel}</p>
                </div>
              </div>
              <button type="button" role="menuitem" className={item} onClick={() => { close(); onProfile(); }}><UserCog className="w-5 h-5 text-slate-500" />{t('الملف الشخصي وكلمة المرور')}</button>
              <button type="button" role="menuitem" className={item} onClick={toggleTheme} data-testid="menu-theme">
                {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-slate-500" />}
                <span className="flex-1">{t('الوضع الليلي')}</span>
                <span className="text-xs text-slate-500">{theme === 'dark' ? t('مفعّل') : t('مغلق')}</span>
              </button>
              {canSwitch && (
                <button type="button" role="menuitem" className={item} onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} data-testid="menu-lang">
                  <Languages className="w-5 h-5 text-slate-500" />
                  <span className="flex-1">{t('اللغة')}</span>
                  <span className="text-xs text-slate-500">{lang === 'en' ? 'English' : 'العربية'}</span>
                </button>
              )}
              {isAdmin && (
                <button type="button" role="menuitem" className={item} onClick={() => setPreview(true)} data-testid="menu-preview"><UserCheck className="w-5 h-5 text-slate-500" />{t('معاينة كمستخدم')}</button>
              )}
              <button type="button" role="menuitem" className={item} onClick={() => { close(); window.dispatchEvent(new Event(TOUR_EVENT)); }}><Compass className="w-5 h-5 text-slate-500" />{t('الجولة التعريفية')}</button>
              <button type="button" role="menuitem" className={item} data-testid="menu-refresh-data" title={t('إن لم يظهر اختبار أو صورة موجودة: يمسح النسخة المحفوظة على هذا المتصفح ويجلب كل شيء من الخادم')}
                onClick={() => { close(); resetLocalCache(); }}><RefreshCw className="w-5 h-5 text-slate-500" />{t('تحديث البيانات من الخادم')}</button>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button type="button" role="menuitem" className={`${item} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40`} onClick={() => { close(); logout(); }}><LogOut className="w-5 h-5" />{t('تسجيل الخروج')}</button>
            </>
          ) : (
            <>
              <button type="button" className={`${item} h-10`} onClick={() => setPreview(false)}><Back className="w-4 h-4" />{t('معاينة الموقع كما يراه المستخدم')}</button>
              <label className="flex items-center gap-2 h-10 px-3 mx-1 my-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <Search className="w-4 h-4 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالاسم أو الهوية')} className="flex-1 min-w-0 bg-transparent text-sm outline-none text-slate-900 dark:text-white" autoFocus />
              </label>
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                {list.map((u) => (
                  <button key={u.id} type="button" onClick={() => { close(); switchUser(u.id); }}
                    className={`w-full flex items-center gap-2 p-2 rounded-xl text-sm text-start ${u.id === currentUser.id ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <Avatar name={u.name} role={u.role} userId={u.id} size="xs" />
                    <span className="flex-1 font-semibold truncate">{u.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
