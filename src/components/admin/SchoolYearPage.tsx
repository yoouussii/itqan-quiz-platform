import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, DatabaseBackup, HardDrive, FileSpreadsheet, FileJson, ArrowLeftRight, GraduationCap, History, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import {
  BackupData, DbUsage, FREE_DB_LIMIT, YearHistoryRow, collectBackup, downloadBackupExcel, downloadBackupJson,
  fetchDbUsage, fetchYearHistory, fmtBytes, runRollover,
} from '../../services/schoolYearService';
import { STAY, suggestRollover } from '../../utils/schoolYear';
import { logActivity } from '../../services/activityService';
import { uiDir, t, dateLocale } from '../../i18n';
import type { User } from '../../types';

const TABLE_LABEL: Record<string, string> = {
  users: 'المستخدمون', quizzes: 'الاختبارات', submissions: 'المشاركات', question_bank: 'بنك الأسئلة', notifications: 'الإشعارات',
  notification_reads: 'قراءات الإشعارات', attendance_records: 'الحضور', behavior_records: 'السلوك', activity_log: 'سجل النشاط',
  user_avatars: 'الصور الشخصية', banners: 'البانرات', app_settings: 'الإعدادات', certificates: 'الشهادات', classes: 'الفصول',
  subjects: 'المواد', push_subscriptions: 'أجهزة الإشعارات', quiz_attempts: 'محاولات الاختبار', sessions: 'جلسات الدخول',
  daily_challenge_attempts: 'التحدي اليومي', attendance_roster: 'سجل الحضور فقط', student_awards: 'الجوائز', credentials: 'كلمات المرور (مشفرة)',
  class_visits: 'الزيارات الصفية', surveys: 'الاستبيانات', survey_responses: 'إجابات الاستبيانات', survey_respondents: 'المجيبون',
  gradebook_columns: 'أعمدة كشف الدرجات', gradebook_marks: 'درجات الكشف', gradebook_weights: 'أوزان الاختبارات', year_archive: 'سجل الترحيل',
  attendance_sync_log: 'سجل المزامنة', attendance_unmatched: 'أسماء غير مطابقة', attendance_alerts: 'تنبيهات الغياب', login_attempts: 'محاولات الدخول',
};

const defaultLabel = () => { const y = new Date().getFullYear(); return `${y}–${y + 1}`; };

/** إدارة العام الدراسي: النسخة الاحتياطية، ومساحة قاعدة البيانات، وترحيل الطلاب للسنة التالية */
export const SchoolYearPage: React.FC = () => {
  const { users, classes, showToast, currentUser } = useApp();
  const [usage, setUsage] = useState<DbUsage | null | undefined>(undefined);
  const [history, setHistory] = useState<YearHistoryRow[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [backup, setBackup] = useState<BackupData | null>(null);

  const [map, setMap] = useState<Record<string, string>>({});
  const [label, setLabel] = useState(defaultLabel);
  const [opts, setOpts] = useState({ archive_quizzes: true, clear_attendance: true, clear_behavior: true });
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<null | Record<string, number>>(null);

  useEffect(() => {
    void fetchDbUsage().then(setUsage);
    void fetchYearHistory().then(setHistory);
  }, []);
  useEffect(() => { setMap(suggestRollover(classes)); }, [classes]);

  const count = useMemo(() => {
    const m = new Map<string, number>();
    (users as User[]).forEach((u) => { if (u.role === 'student' && u.class_id) m.set(u.class_id, (m.get(u.class_id) || 0) + 1); });
    return m;
  }, [users]);
  const sortedClasses = useMemo(() => [...classes].sort((a, b) => a.name.localeCompare(b.name, 'ar')), [classes]);
  const plan = useMemo(() => {
    let moved = 0, grad = 0, stay = 0;
    for (const c of classes) {
      const n = count.get(c.id) || 0; const to = map[c.id] ?? STAY;
      if (to === STAY) stay += n; else if (to === '') grad += n; else moved += n;
    }
    return { moved, grad, stay };
  }, [classes, map, count]);

  const makeBackup = async (kind: 'xlsx' | 'json') => {
    setBusy(kind);
    try {
      const b = backup && Date.now() - new Date(backup.exported_at).getTime() < 5 * 60_000
        ? backup : await collectBackup((l) => setBusy(`${kind}:${l}`));
      setBackup(b);
      if (kind === 'xlsx') await downloadBackupExcel(b); else downloadBackupJson(b);
      showToast(b.failed.length ? t('تم التنزيل (تعذر قراءة: {t})', { t: b.failed.join('، ') }) : t('تم تنزيل النسخة الاحتياطية'), b.failed.length ? 'info' : 'success');
    } catch {
      showToast(t('تعذر إنشاء النسخة الاحتياطية'), 'error');
    } finally { setBusy(''); }
  };

  const doRollover = async () => {
    const m: Record<string, string> = {};
    Object.entries(map).forEach(([from, to]) => { if (to !== STAY && to !== from) m[from] = to; });
    setBusy('roll');
    const r = await runRollover({ label, map: m, ...opts });
    setBusy('');
    if (!r.ok || !r.data) return showToast(t('تعذر الترحيل: {e}', { e: r.error || '' }), 'error');
    setConfirm(false); setTyped('');
    setDone(r.data as any);
    void logActivity({ actor_id: currentUser?.id, actor_name: currentUser?.name, actor_role: currentUser?.role, action: 'year_rollover', target_type: 'school_year', target_name: label, details: JSON.stringify(r.data) });
    void fetchYearHistory().then(setHistory);
  };

  const pct = usage ? Math.min(100, (usage.db_bytes / FREE_DB_LIMIT) * 100) : 0;
  const barColor = pct >= 85 ? '#e11d48' : pct >= 65 ? '#f59e0b' : '#10b981';
  const sel = 'h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><CalendarRange className="w-7 h-7 text-indigo-600" />{t('إدارة العام الدراسي')}</span>}
        subtitle={t('نسخة احتياطية من بيانات المدرسة، ومتابعة مساحة قاعدة البيانات، وترحيل الطلاب للسنة التالية')} />

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Card className="p-5 space-y-3" data-testid="backup-card">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><DatabaseBackup className="w-5 h-5 text-indigo-600" />{t('النسخة الاحتياطية')}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('نزّل كل بيانات المدرسة (المستخدمون، الفصول، الاختبارات والنتائج، الحضور، السلوك…). احتفظ بها في مكان آمن لأنها تحتوي على بيانات الطلاب.')}</p>
          <div className="flex flex-wrap gap-2">
            <Button icon={FileSpreadsheet} onClick={() => void makeBackup('xlsx')} disabled={!!busy}>{busy.startsWith('xlsx') ? t('جارٍ التجهيز…') : t('Excel (للقراءة)')}</Button>
            <Button variant="secondary" icon={FileJson} onClick={() => void makeBackup('json')} disabled={!!busy}>{busy.startsWith('json') ? t('جارٍ التجهيز…') : t('JSON (نسخة كاملة)')}</Button>
          </div>
          {busy.includes(':') && <p className="text-xs text-slate-500">{t('جارٍ قراءة: {t}', { t: t(busy.split(':')[1]) })}</p>}
          <p className="text-xs text-slate-500">{t('ننصح بنسخة احتياطية شهرياً، وقبل ترحيل السنة دائماً.')}</p>
        </Card>

        <Card className="p-5 space-y-3" data-testid="usage-card">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><HardDrive className="w-5 h-5 text-indigo-600" />{t('مساحة قاعدة البيانات')}</h2>
          {usage === undefined ? <p className="text-sm text-slate-500">{t('جارٍ التحميل…')}</p> : usage === null ? (
            <p className="text-sm text-slate-500">{t('غير متاحة (شغّل تحديث قاعدة البيانات 032)')}</p>
          ) : (
            <>
              <div className="flex items-end justify-between gap-2">
                <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white" dir="ltr">{fmtBytes(usage.db_bytes)}<span className="text-sm font-semibold text-slate-500"> / 500 MB</span></span>
                <Chip tone={pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : 'ok'}>{t('{p}% مستخدم', { p: pct.toFixed(1) })}</Chip>
              </div>
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t('مساحة قاعدة البيانات')}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: barColor }} />
              </div>
              <p className="text-xs text-slate-500">{pct >= 85 ? t('اقتربت المساحة من الحد: نزّل نسخة احتياطية واحذف الإشعارات والمشاركات القديمة، أو انتقل لخطة مدفوعة.') : t('حد الخطة المجانية في Supabase هو 500 ميجابايت.')}</p>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {usage.tables.slice(0, 8).map((tb) => (
                  <li key={`${tb.schema}.${tb.name}`} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1 text-slate-700 dark:text-slate-200">{t(TABLE_LABEL[tb.name] || tb.name)}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{t('{n} صف', { n: tb.rows.toLocaleString(dateLocale()) })}</span>
                    <span className="w-20 text-end tabular-nums font-semibold text-slate-800 dark:text-slate-100" dir="ltr">{fmtBytes(tb.bytes)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card className="p-5 space-y-4" data-testid="rollover-card">
        <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-indigo-600" />{t('ترحيل السنة الدراسية')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('في نهاية العام: ينتقل طلاب كل فصل إلى فصل السنة التالية دفعة واحدة، ويُخرَّج طلاب الصف الأخير (يبقون بلا فصل). النتائج السابقة تبقى محفوظة. راجع الاقتراحات قبل التنفيذ.')}</p>
        {done && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4 text-sm text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center gap-3">
            <span className="font-bold">{t('تم الترحيل:')}</span>
            <span>{t('انتقل {m} · تخرّج {g} · أُرشف {q} اختبار', { m: done.moved, g: done.graduated, q: done.archived_quizzes })}</span>
            <Button size="sm" className="ms-auto" onClick={() => window.location.reload()}>{t('تحديث الصفحة')}</Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="text-start py-2 font-semibold">{t('الفصل الحالي')}</th>
              <th className="text-start py-2 font-semibold">{t('الطلاب')}</th>
              <th className="text-start py-2 font-semibold">{t('ينتقل إلى')}</th>
            </tr></thead>
            <tbody>
              {sortedClasses.map((c) => {
                const to = map[c.id] ?? STAY;
                return (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                    <td className="py-2 tabular-nums">{count.get(c.id) || 0}</td>
                    <td className="py-2">
                      <select aria-label={t('ينتقل إلى: {c}', { c: c.name })} value={to} onChange={(e) => setMap({ ...map, [c.id]: e.target.value })} className={`${sel} min-w-[200px] ${to === '' ? 'text-amber-700' : ''}`}>
                        <option value={STAY}>{t('يبقى في نفس الفصل')}</option>
                        <option value="">{t('تخرّج (بدون فصل)')}</option>
                        {sortedClasses.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid sm:grid-cols-3 gap-2 text-sm">
          {([['archive_quizzes', 'أرشفة الاختبارات المنشورة (تبقى نتائجها)'], ['clear_attendance', 'بدء سجل حضور جديد (حذف غياب العام الماضي)'], ['clear_behavior', 'بدء سجل سلوك جديد (حذف ملاحظات العام الماضي)']] as const).map(([k, l]) => (
            <label key={k} className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
              <span className="text-slate-700 dark:text-slate-200">{t(l)}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">{t('اسم العام الجديد')}
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${sel} w-36`} dir="ltr" />
          </label>
          <span className="text-sm text-slate-600 dark:text-slate-300">{t('سينتقل {m} طالباً · يتخرّج {g} · يبقى {s}', { m: plan.moved, g: plan.grad, s: plan.stay })}</span>
          <Button variant="danger" icon={GraduationCap} className="ms-auto" disabled={plan.moved + plan.grad === 0 && !opts.archive_quizzes && !opts.clear_attendance && !opts.clear_behavior} onClick={() => setConfirm(true)}>{t('ترحيل السنة…')}</Button>
        </div>
        {history.length > 0 && (
          <div className="pt-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-1"><History className="w-4 h-4" />{t('الترحيلات السابقة')}</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
              {history.map((h, i) => (
                <li key={i}>{new Date(h.done_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })} · <b>{h.label}</b> · {t('انتقل {m} · تخرّج {g} · أُرشف {q} اختبار', { m: h.summary.moved, g: h.summary.graduated, q: h.summary.archived_quizzes })} · {h.done_by_name}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {confirm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('تأكيد ترحيل السنة')} onClick={() => setConfirm(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{t('تأكيد ترحيل السنة')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{t('سينتقل {m} طالباً ويتخرّج {g}. لا يمكن التراجع تلقائياً، لذا نزّل نسخة احتياطية أولاً.', { m: plan.moved, g: plan.grad })}</p>
              </div>
              <button type="button" aria-label={t('إغلاق')} onClick={() => setConfirm(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <Button variant="secondary" icon={FileJson} className="w-full" disabled={!!busy} onClick={() => void makeBackup('json')}>{busy.startsWith('json') ? t('جارٍ التجهيز…') : t('تنزيل نسخة احتياطية الآن')}</Button>
            <label className="block text-sm text-slate-700 dark:text-slate-200">{t('اكتب «ترحيل» للتأكيد')}
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className={`${sel} w-full mt-1`} aria-label={t('اكتب «ترحيل» للتأكيد')} />
            </label>
            <Button variant="danger" className="w-full" disabled={typed.trim() !== 'ترحيل' || busy === 'roll'} onClick={() => void doRollover()}>{busy === 'roll' ? t('جارٍ الترحيل…') : t('تنفيذ الترحيل')}</Button>
          </div>
        </div>
      )}
    </div>
  );
};
