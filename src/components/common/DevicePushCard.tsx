import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Smartphone, Download, Share, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, Button } from './ui';
import { t } from '../../i18n';
import { PushStatus, pushStatus, enablePush, disablePush, canInstall, onInstallChange, promptInstall } from '../../services/pushService';

const DISMISS_KEY = 'itqan_push_prompt_dismissed';

/**
 * «هذا الجهاز»: تثبيت الموقع كتطبيق، وتفعيل إشعارات الجوال.
 * compact: تنبيه صغير يظهر فقط إذا كانت الإشعارات متاحة وغير مفعّلة (ويمكن إخفاؤه).
 */
export const DevicePushCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { currentUser, settings, showToast } = useApp();
  const key = settings.vapid_public_key || '';
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [installable, setInstallable] = useState(canInstall());
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    void pushStatus(key).then(setStatus);
    return onInstallChange(() => setInstallable(canInstall()));
  }, [key]);

  if (!currentUser || status === null) return null;
  if (compact && (dismissed || status !== 'off')) return null;

  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush(currentUser.id, key);
    setBusy(false);
    if (r.ok) showToast(t('تم تفعيل الإشعارات على هذا الجهاز'), 'success');
    else if (r.error === 'denied') showToast(t('رفض المتصفح الإشعارات. فعّلها من إعدادات المتصفح للموقع ثم أعد المحاولة.'), 'error');
    else showToast(t('تعذر تفعيل الإشعارات: {error}', { error: r.error || '' }), 'error');
    setStatus(await pushStatus(key));
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setStatus(await pushStatus(key));
  };

  if (compact) {
    return (
      <Card className="p-4 flex items-center gap-3 border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30">
        <BellRing className="w-6 h-6 text-indigo-600 shrink-0" />
        <p className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {currentUser.role === 'parent' ? t('فعّل الإشعارات لتعرف فوراً بالاختبارات الجديدة ونتائج أبنائك.') : t('فعّل الإشعارات لتعرف فوراً بالاختبارات الجديدة والنتائج.')}
        </p>
        <Button size="sm" onClick={() => void turnOn()} disabled={busy}>{t('تفعيل')}</Button>
        <button type="button" aria-label={t('إخفاء')} onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white/70 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
      </Card>
    );
  }

  return (
    <Card className="p-4 mb-6 space-y-3">
      <h2 className="font-bold text-slate-900 dark:text-white inline-flex items-center gap-2"><Smartphone className="w-5 h-5 text-indigo-600" />{t('هذا الجهاز')}</h2>

      {installable && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[200px] text-sm text-slate-600 dark:text-slate-300">{t('ثبّت المنصة كتطبيق على شاشتك الرئيسية لتفتح بضغطة.')}</p>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => void promptInstall()}>{t('تثبيت التطبيق')}</Button>
        </div>
      )}

      {status === 'needs_install' && (
        <p className="text-sm text-slate-600 dark:text-slate-300 inline-flex items-start gap-2">
          <Share className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" />
          {t('على iPhone وiPad: اضغط زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية»، وافتح المنصة من أيقونتها لتفعيل الإشعارات.')}
        </p>
      )}

      {status === 'not_configured' && currentUser.role === 'admin' && (
        <p className="text-sm text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-xl p-3">
          {t('إشعارات الجوال غير مفعّلة بعد. شغّل 017_push_notifications.sql ثم «Setup push notifications» من GitHub Actions.')}
        </p>
      )}
      {status === 'unsupported' && <p className="text-sm text-slate-500">{t('هذا المتصفح لا يدعم الإشعارات.')}</p>}
      {status === 'denied' && <p className="text-sm text-rose-700 dark:text-rose-400">{t('الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح (رمز القفل بجانب الرابط).')}</p>}

      {(status === 'on' || status === 'off') && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[200px] text-sm text-slate-600 dark:text-slate-300">
            {status === 'on' ? t('الإشعارات مفعّلة: تصلك على هذا الجهاز حتى والمنصة مغلقة.') : t('فعّل الإشعارات لتصلك الاختبارات الجديدة والنتائج على هذا الجهاز حتى والمنصة مغلقة.')}
          </p>
          {status === 'on'
            ? <Button size="sm" variant="secondary" icon={BellOff} onClick={() => void turnOff()} disabled={busy}>{t('إيقاف')}</Button>
            : <Button size="sm" icon={BellRing} onClick={() => void turnOn()} disabled={busy}>{t('تفعيل الإشعارات')}</Button>}
        </div>
      )}
    </Card>
  );
};
