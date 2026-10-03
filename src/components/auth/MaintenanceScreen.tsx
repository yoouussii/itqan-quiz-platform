import React from 'react';
import { Wrench, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { t, isEn } from '../../i18n';

/** صفحة «الموقع تحت الصيانة» لكل من ليس مديراً، مع زر صغير لدخول مدير النظام */
export const MaintenanceScreen: React.FC<{ onAdminLogin: () => void }> = ({ onAdminLogin }) => {
  const { settings } = useApp();
  const m = settings.maintenance || {};
  const school = settings.login_title || settings.school_name || '';
  const logo = settings.login_logo || settings.school_logo || '';
  const until = m.until ? new Date(m.until) : null;
  const untilText = until && !isNaN(until.getTime())
    ? until.toLocaleString(isEn() ? 'en-GB' : 'ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
    : '';
  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center px-5 py-16 bg-slate-50 dark:bg-slate-950" data-testid="maintenance">
      <div className="max-w-lg w-full text-center space-y-6">
        {logo && <img src={logo} alt="" className="h-20 mx-auto object-contain" />}
        <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
          <Wrench className="w-10 h-10" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">{t('الموقع تحت الصيانة')}</h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {m.message?.trim() || t('نعمل على تحسين المنصة، وسنعود قريباً. شكراً لصبركم.')}
          </p>
          {untilText && <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">{t('نتوقع العودة: {d}', { d: untilText })}</p>}
          {school && <p className="text-sm text-slate-500 dark:text-slate-400">{school}</p>}
        </div>
        <button type="button" onClick={onAdminLogin} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4" />{t('دخول مدير النظام')}
        </button>
      </div>
    </div>
  );
};
