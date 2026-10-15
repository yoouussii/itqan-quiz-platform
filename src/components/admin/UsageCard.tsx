import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, Chip } from '../common/ui';
import { fetchUsageSummary, FREE_EGRESS_LIMIT, UsageSummary } from '../../services/usageService';
import { fmtBytes } from '../../services/schoolYearService';
import { t, dateLocale } from '../../i18n';

/** عزل الأرقام اللاتينية داخل الجملة العربية حتى لا ينقلب ترتيبها */
const ltr = (x: string) => `\u2066${x}\u2069`;

const ROLE_LABEL: Record<string, string> = { student: 'الطلاب', teacher: 'المعلمون', admin: 'الإدارة', supervisor: 'المشرفون', parent: 'أولياء الأمور' };

let cache: { at: number; data: UsageSummary | null } | null = null;
const load = async (force = false) => {
  if (!force && cache && Date.now() - cache.at < 30 * 60_000) return cache.data;
  const data = await fetchUsageSummary(30);
  cache = { at: Date.now(), data };
  return data;
};

/** الاستهلاك المتوقع للشهر: إن كانت البيانات أقل من 30 يوماً نقدّر الشهر من متوسط الأيام المسجّلة */
const projected = (u: UsageSummary) => {
  const n = u.days.length;
  return n >= 30 || n === 0 ? u.total_bytes : (u.total_bytes / n) * 30;
};

/**
 * مراقبة حجم التنزيل من قاعدة البيانات مقارنة بحد الخطة.
 * `compact`: تنبيه في الصفحة الرئيسية للمدير يظهر فقط عند الاقتراب من الحد (70% فأكثر).
 */
export const UsageCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { setCurrentView } = useApp();
  const [u, setU] = useState<UsageSummary | null | undefined>(cache?.data);
  useEffect(() => {
    let alive = true;
    void load(!compact).then((d) => alive && setU(d));
    return () => { alive = false; };
  }, [compact]);

  const proj = u ? projected(u) : 0;
  const pct = Math.min(100, (proj / FREE_EGRESS_LIMIT) * 100);
  const tone = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok';
  const color = pct >= 90 ? '#e11d48' : pct >= 70 ? '#f59e0b' : '#10b981';

  if (compact) {
    if (!u || pct < 70) return null;
    return (
      <button type="button" onClick={() => setCurrentView('school_year')} data-testid="usage-alert"
        className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-start ${pct >= 90 ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'}`}>
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span className="flex-1 text-sm">
          <b>{t('الاستهلاك قريب من حد الخطة المجانية')}</b>{' '}
          {t('التنزيل المتوقع هذا الشهر {used} من {limit} ({p}%).', { used: ltr(fmtBytes(proj)), limit: ltr('5 GB'), p: Math.round(pct) })}
        </span>
        <span className="text-xs font-bold underline shrink-0">{t('التفاصيل')}</span>
      </button>
    );
  }

  const maxDay = u ? Math.max(1, ...u.days.map((d) => d.bytes)) : 1;
  return (
    <Card className="p-5 space-y-3" data-testid="egress-card">
      <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600" />{t('الاستهلاك الشهري (التنزيل)')}</h2>
      {u === undefined ? <p className="text-sm text-slate-500">{t('جارٍ التحميل…')}</p> : u === null ? (
        <p className="text-sm text-slate-500">{t('غير متاح (شغّل تحديث قاعدة البيانات 080)')}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white" dir="ltr">{fmtBytes(proj)}<span className="text-sm font-semibold text-slate-500"> / 5 GB</span></span>
            <Chip tone={tone}>{t('{p}% متوقع هذا الشهر', { p: pct.toFixed(1) })}</Chip>
          </div>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t('الاستهلاك الشهري (التنزيل)')}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
          </div>
          <p className="text-xs text-slate-500">
            {u.days.length < 30
              ? t('مسجّل خلال {n} يوم: {b}. الرقم أعلاه تقدير للشهر كاملاً.', { n: u.days.length, b: ltr(fmtBytes(u.total_bytes)) })
              : t('آخر 30 يوماً.')}
            {' '}{t('حد الخطة المجانية 5 جيجابايت شهرياً، وخطة {pro} ‏250 جيجابايت. الرقم تقديري من أجهزة المستخدمين.', { pro: ltr('Pro') })}
          </p>
          {u.days.length < 3 && (
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400">{t('البيانات ما زالت قليلة: كل جهاز يرسل استهلاكه مرة كل ساعتين تقريباً، فيصبح التقدير أدق بعد يومين أو ثلاثة من الاستخدام.')}</p>
          )}
          {u.days.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{t('التنزيل اليومي')}</p>
              <div className="flex items-end gap-0.5 h-16" role="img" aria-label={t('التنزيل اليومي')}>
                {u.days.map((d) => (
                  <div key={d.day} className="flex-1 min-w-[3px] rounded-t bg-indigo-500/80 hover:bg-indigo-600"
                    style={{ height: `${Math.max(4, (d.bytes / maxDay) * 100)}%` }}
                    title={`${new Date(d.day).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} — ${fmtBytes(d.bytes)} · ${t('{n} مستخدم', { n: d.users })}`} />
                ))}
              </div>
            </div>
          )}
          {u.by_role.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {u.by_role.map((r) => (
                <li key={r.role} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 text-slate-700 dark:text-slate-200">{t(ROLE_LABEL[r.role] || r.role)}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{t('{n} مستخدم', { n: r.users.toLocaleString(dateLocale()) })}</span>
                  <span className="w-20 text-end tabular-nums font-semibold text-slate-800 dark:text-slate-100" dir="ltr">{fmtBytes(r.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
};
