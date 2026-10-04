import React, { useEffect, useState } from 'react';
import { CalendarX2 } from 'lucide-react';
import { License, fetchLicense, licenseState } from '../../services/ownerService';
import { t, dateLocale } from '../../i18n';

const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** اشتراك المدرسة: null أثناء التحميل */
export function useLicense(enabled: boolean): License | null {
  const [lic, setLic] = useState<License | null>(null);
  useEffect(() => { if (enabled) void fetchLicense().then(setLic); }, [enabled]);
  return lic;
}

/** هل يُوقَف هذا المستخدم بسبب انتهاء الاشتراك؟ (المدير لا يُوقف أبداً) */
export const isBlocked = (lic: License | null, role?: string) =>
  !!lic && role !== 'admin' && !!lic.block_on_expiry && licenseState(lic) === 'expired';

/** شريط تنبيه للمدير: الاشتراك يقترب من الانتهاء أو انتهى، أو تجاوز حد الطلاب */
export const LicenseBanner: React.FC<{ lic: License | null }> = ({ lic }) => {
  if (!lic) return null;
  const st = licenseState(lic);
  const over = !!lic.max_students && (lic.students || 0) > lic.max_students;
  if (st !== 'soon' && st !== 'expired' && !over) return null;
  return (
    <div className={`${st === 'expired' ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'} border-b text-sm font-semibold px-4 py-2 text-center`} role="status" data-testid="license-banner">
      {st === 'expired'
        ? t('انتهى اشتراك المدرسة في {d}.{b} تواصل مع صاحب المنصة للتجديد.', { d: fmt(lic.expires_at), b: lic.block_on_expiry ? ` ${t('المنصة موقوفة الآن لغير مدير النظام.')}` : '' })
        : st === 'soon' ? t('اشتراك المدرسة ينتهي في {d} (بعد {n} يوم). تواصل مع صاحب المنصة للتجديد.', { d: fmt(lic.expires_at), n: lic.days_left ?? 0 }) : ''}
      {over && <span className="ms-2">{t('عدد الطلاب ({a}) تجاوز حد الاشتراك ({b}).', { a: lic.students || 0, b: lic.max_students || 0 })}</span>}
    </div>
  );
};

/** شاشة الإيقاف عند انتهاء الاشتراك */
export const LicenseBlocked: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0b0f19]" data-testid="license-blocked">
    <div className="max-w-md text-center space-y-3">
      <CalendarX2 className="w-14 h-14 mx-auto text-rose-500" />
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('المنصة متوقفة مؤقتاً')}</h1>
      <p className="text-slate-600 dark:text-slate-300">{t('انتهى اشتراك المدرسة في المنصة. بياناتك محفوظة، وستعود المنصة فور التجديد. للاستفسار تواصل مع إدارة المدرسة.')}</p>
      <button type="button" onClick={onLogout} className="h-10 px-5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold">{t('تسجيل الخروج')}</button>
    </div>
  </div>
);
