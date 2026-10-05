import React, { useEffect, useState } from 'react';
import { Sunrise, UserX, Clock, ClipboardCheck, BookOpen, ShieldAlert, FolderSync, Repeat, Bell, BellOff, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../services/supabase';
import { safe } from '../../services/remote';
import { Card } from '../common/ui';
import { t, dateLocale } from '../../i18n';

interface Summary {
  day: string; prev_day: string; students: number; absent: number; late: number; excused: number;
  top_classes: Array<{ id: string; name: string; n: number }>; repeat_absent: number;
  quizzes_today: Array<{ id: string; title: string }>; quizzes_open: number; pending_approval: number;
  homework_due_today: number; homework_ungraded: number; behavior_negative: number; records_stale: number;
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const tm = 'h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums disabled:opacity-50';
const dayName = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

/** الملخص الصباحي: أرقام اليوم في سطر واحد، كل رقم ينقل لصفحته (050) */
export const MorningSummaryCard: React.FC = () => {
  const { setCurrentView, settings, updateSettings, currentUser } = useApp();
  const [s, setS] = useState<Summary | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => { void safe<Summary>(() => supabase.rpc('itqan_morning_summary') as any).then((r) => setS(r.ok ? r.data : null)); }, []);
  if (!s) return null; // قبل تشغيل 050 أو لغير المدير/المشرف لا يظهر شيء
  const cfg = settings.morning_summary || {};
  const enabled = cfg.enabled !== false;
  const roles = cfg.roles?.length ? cfg.roles : ['admin'];
  const isAdmin = currentUser?.role === 'admin';
  const msTime = cfg.time || '06:45';
  const save = (patch: { enabled?: boolean; roles?: string[]; time?: string }) => void updateSettings({ morning_summary: { enabled, roles, time: msTime, ...patch } });
  const wr = settings.weekly_report || {};
  const wrOn = wr.enabled !== false, wrDay = wr.day ?? 4, wrTime = wr.time || '14:40';
  const saveWr = (patch: { enabled?: boolean; day?: number; time?: string }) => void updateSettings({ weekly_report: { enabled: wrOn, day: wrDay, time: wrTime, ...patch } });

  const items: Array<{ icon: React.ElementType; label: string; value: number | string; sub?: string; warn?: boolean; go?: string }> = [
    { icon: UserX, label: t('غياب {d}', { d: dayName(s.prev_day) }), value: s.absent, sub: t('{l} متأخر · {e} مستأذن', { l: s.late, e: s.excused }) + (s.top_classes[0] ? ` · ${t('الأكثر: {c} ({n})', { c: s.top_classes[0].name, n: s.top_classes[0].n })}` : ''), warn: s.students > 0 && s.absent / s.students > 0.1, go: 'attendance' },
    { icon: Repeat, label: t('غياب متكرر'), value: s.repeat_absent, sub: t('3 أيام فأكثر خلال أسبوعين'), warn: s.repeat_absent > 0, go: 'attendance' },
    { icon: Clock, label: t('اختبارات تنتهي اليوم'), value: s.quizzes_today.length, sub: t('{n} مفتوحة الآن', { n: s.quizzes_open }), go: 'quizzes' },
    { icon: ClipboardCheck, label: t('بانتظار اعتمادك'), value: s.pending_approval, warn: s.pending_approval > 0, go: 'approvals' },
    { icon: BookOpen, label: t('واجبات اليوم'), value: s.homework_due_today, sub: s.homework_ungraded ? t('{n} تسليم لم يُصحح', { n: s.homework_ungraded }) : undefined, warn: s.homework_ungraded > 0, go: 'homework' },
    { icon: ShieldAlert, label: t('مخالفات سلوكية'), value: s.behavior_negative, sub: t('آخر يوم دراسي'), warn: s.behavior_negative > 0, go: 'behavior' },
    { icon: FolderSync, label: t('سجلات متأخرة'), value: s.records_stale, sub: t('لم تُعدَّل منذ 10 أيام'), warn: s.records_stale > 0, go: 'class_records' },
  ];
  return (
    <Card className="p-4 sm:p-5 space-y-3" data-testid="morning-summary">
      <div className="flex flex-wrap items-center gap-2">
        <Sunrise className="w-5 h-5 text-amber-500" />
        <h2 className="font-bold text-slate-900 dark:text-white">{t('ملخص الصباح')}</h2>
        <span className="text-xs text-slate-500">{dayName(s.day)}</span>
        {isAdmin && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="ms-auto h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5">
            {enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}{enabled ? t('يصلك كإشعار كل صباح الساعة {t}', { t: msTime }) : t('الإشعار الصباحي موقوف')}<ChevronDown className={`w-3.5 h-3.5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {open && isAdmin && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-3 text-sm" data-testid="auto-schedule">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(e) => save({ enabled: e.target.checked })} className="w-4 h-4 accent-indigo-600" />{t('إرسال الملخص إشعاراً كل صباح دراسي الساعة')}</label>
            <input type="time" value={msTime} disabled={!enabled} onChange={(e) => e.target.value && save({ time: e.target.value })} aria-label={t('موعد ملخص الصباح')} className={tm} />
            <label className="inline-flex items-center gap-2"><input type="checkbox" disabled={!enabled} checked={roles.includes('supervisor')} onChange={(e) => save({ roles: e.target.checked ? ['admin', 'supervisor'] : ['admin'] })} className="w-4 h-4 accent-indigo-600" />{t('والمشرفون أيضاً')}</label>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={wrOn} onChange={(e) => saveWr({ enabled: e.target.checked })} className="w-4 h-4 accent-indigo-600" />{t('إرسال تقرير أسبوعي لكل ولي أمر عن أبنائه كل')}</label>
            <select value={wrDay} disabled={!wrOn} onChange={(e) => saveWr({ day: Number(e.target.value) })} aria-label={t('يوم التقرير الأسبوعي')} className={tm}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{t(WEEKDAYS[d])}</option>)}
            </select>
            <span>{t('الساعة')}</span>
            <input type="time" value={wrTime} disabled={!wrOn} onChange={(e) => e.target.value && saveWr({ time: e.target.value })} aria-label={t('موعد التقرير الأسبوعي')} className={tm} />
          </div>
          <p className="text-[11px] text-slate-500">{t('بتوقيت السعودية. يصل الإشعار خلال 5 دقائق من الموعد.')}</p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {items.map((it, i) => (
          <button key={i} type="button" onClick={() => it.go && setCurrentView(it.go)} className={`text-start rounded-xl border p-3 transition hover:shadow-sm ${it.warn ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5"><it.icon className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{it.label}</span></div>
            <div className={`text-xl font-extrabold tabular-nums mt-0.5 ${it.warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{it.value}</div>
            {it.sub && <div className="text-[11px] text-slate-500 truncate">{it.sub}</div>}
          </button>
        ))}
      </div>
    </Card>
  );
};
