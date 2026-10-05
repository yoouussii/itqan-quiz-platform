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

/** «مهام اليوم» من الملخص الصباحي (050): ما يحتاج إجراءً فقط، ولكل بند زر ينقل لصفحته */
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

  // «مهام اليوم»: البنود التي عليها عمل فقط، مرتبة بالأهم، ولكل بند زر ينقل لمكانه
  type Task = { icon: React.ElementType; n: number; text: string; sub?: string; tone: 'bad' | 'warn' | 'info'; go: string; action: string };
  const all: Task[] = [
    { icon: Repeat, n: s.repeat_absent, text: t('طلاب غيابهم متكرر'), sub: t('3 أيام فأكثر خلال أسبوعين'), tone: 'bad', go: 'attendance', action: t('اعرض') },
    { icon: ClipboardCheck, n: s.pending_approval, text: t('اختبار بانتظار اعتمادك'), tone: 'warn', go: 'approvals', action: t('راجع') },
    { icon: BookOpen, n: s.homework_ungraded, text: t('تسليم واجب لم يُصحح'), sub: s.homework_due_today ? t('{n} واجب موعده اليوم', { n: s.homework_due_today }) : undefined, tone: 'warn', go: 'homework', action: t('اعرض') },
    { icon: ShieldAlert, n: s.behavior_negative, text: t('مخالفات سلوكية في آخر يوم دراسي'), tone: 'bad', go: 'behavior', action: t('اعرض') },
    { icon: UserX, n: s.absent, text: t('غائب يوم {d}', { d: dayName(s.prev_day) }), sub: [t('{l} متأخر · {e} مستأذن', { l: s.late, e: s.excused }), s.top_classes[0] ? t('الأكثر: {c} ({n})', { c: s.top_classes[0].name, n: s.top_classes[0].n }) : ''].filter(Boolean).join(' · '), tone: s.students > 0 && s.absent / s.students > 0.1 ? 'bad' : 'info', go: 'attendance', action: t('اعرض') },
    { icon: FolderSync, n: s.records_stale, text: t('سجل متابعة لم يُعدَّل منذ 10 أيام'), tone: 'warn', go: 'class_records', action: t('اعرض') },
    { icon: Clock, n: s.quizzes_today.length, text: t('اختبار ينتهي اليوم'), sub: s.quizzes_today.slice(0, 2).map((q) => q.title).join('، '), tone: 'info', go: 'quizzes', action: t('اعرض') },
    { icon: BookOpen, n: s.homework_ungraded ? 0 : s.homework_due_today, text: t('واجب موعد تسليمه اليوم'), tone: 'info', go: 'homework', action: t('اعرض') },
  ];
  const tasks = all.filter((x) => x.n > 0);
  const TONE = { bad: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300', warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', info: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' };
  return (
    <Card className="p-4 sm:p-5 space-y-3" data-testid="morning-summary">
      <div className="flex flex-wrap items-center gap-2">
        <Sunrise className="w-5 h-5 text-amber-500" />
        <h2 className="font-bold text-slate-900 dark:text-white">{t('مهام اليوم')}</h2>
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
      {tasks.length ? (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="today-tasks">
          {tasks.map((x, i) => (
            <li key={i}>
              <button type="button" onClick={() => setCurrentView(x.go)} className="w-full flex items-center gap-3 py-2.5 text-start group">
                <span className={`min-w-[2.5rem] h-10 px-2 rounded-xl flex items-center justify-center text-lg font-extrabold tabular-nums ${TONE[x.tone]}`}>{x.n}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{x.text}</span>
                  {x.sub && <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{x.sub}</span>}
                </span>
                <span className="shrink-0 h-8 px-3 rounded-lg text-xs font-bold bg-indigo-600 group-hover:bg-indigo-700 text-white inline-flex items-center gap-1"><x.icon className="w-3.5 h-3.5" />{x.action}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold py-2" data-testid="today-tasks-empty">✓ {t('لا مهام تنتظرك اليوم. كل شيء على ما يرام.')}</p>
      )}
    </Card>
  );
};
