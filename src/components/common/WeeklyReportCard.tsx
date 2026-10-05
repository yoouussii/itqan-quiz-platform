import React, { useEffect, useState } from 'react';
import { CalendarRange, ChevronRight, ChevronLeft, UserCheck, ClipboardList, BookOpen, Smile, Star, AlertTriangle, HeartHandshake } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { safe } from '../../services/remote';
import { Card, Chip, scoreTone } from './ui';
import { t, dateLocale, uiDir } from '../../i18n';

interface WeekReport {
  week_start: string; week_end: string; absent: number; late: number; excused: number;
  quizzes: Array<{ id: string; title: string; pct: number; passed: boolean }>; quiz_avg: number | null;
  missed: Array<{ id: string; title: string }>;
  homework_due: number; homework_done: number; homework_missing: string[];
  behavior_pos: number; behavior_neg: number; behavior_notes: Array<{ title: string; positive: boolean; day: string }>;
  points: number; support: Array<{ current: number; target: number; start: number; entries: number }>;
}

const riyadhToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

/** تقرير الأسبوع (الأحد–الخميس) لطالب: يراه ولي الأمر، ويصله ملخصه إشعاراً كل خميس (051) */
export const WeeklyReportCard: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [back, setBack] = useState(0); // 0 = هذا الأسبوع
  const [r, setR] = useState<WeekReport | null | undefined>(undefined);
  useEffect(() => {
    const d = riyadhToday(); d.setDate(d.getDate() - back * 7);
    setR(undefined);
    void safe<WeekReport>(() => supabase.rpc('itqan_weekly_report', { p_student: studentId, p_day: iso(d) }) as any).then((x) => setR(x.ok ? x.data : null));
  }, [studentId, back]);
  if (r === null) return null; // قبل تشغيل 051
  const rtl = uiDir() === 'rtl';
  const att = r ? r.absent + r.late + r.excused : 0;
  const tiles: Array<{ icon: React.ElementType; label: string; value: string; sub: string; tone: string; ltr?: boolean }> = r ? [
    { icon: UserCheck, label: t('الحضور'), value: att === 0 ? t('منتظم') : r.absent === 0 ? t('بلا غياب') : t('{n} غياب', { n: r.absent }), sub: att === 0 ? t('طوال الأسبوع') : [r.late ? t('{n} تأخر', { n: r.late }) : '', r.excused ? t('{n} استئذان', { n: r.excused }) : ''].filter(Boolean).join(' · '), tone: r.absent > 0 ? 'warn' : 'ok' },
    { icon: ClipboardList, label: t('الاختبارات'), value: r.quiz_avg != null ? `${r.quiz_avg}%` : '—', ltr: true, sub: t('{n} اختبار', { n: r.quizzes.length }) + (r.missed.length ? ` · ${t('{n} فائت', { n: r.missed.length })}` : ''), tone: r.missed.length ? 'warn' : 'muted' },
    { icon: BookOpen, label: t('الواجبات'), value: r.homework_due ? `${r.homework_done}/${r.homework_due}` : '—', ltr: true, sub: r.homework_due ? t('تسليم') : t('لا واجبات'), tone: r.homework_missing.length ? 'warn' : 'muted' },
    { icon: Smile, label: t('السلوك'), value: r.behavior_pos + r.behavior_neg ? `${r.behavior_pos} / ${r.behavior_neg}` : '—', sub: t('إيجابي / ملاحظة'), tone: r.behavior_neg ? 'warn' : 'muted' },
    { icon: Star, label: t('النقاط'), value: `+${r.points}`, ltr: true, sub: t('هذا الأسبوع'), tone: 'muted' },
  ] : [];
  return (
    <Card className="p-4 sm:p-5 space-y-3" data-testid="weekly-report">
      <div className="flex items-center gap-2">
        <CalendarRange className="w-5 h-5 text-indigo-600" />
        <div className="min-w-0 flex flex-wrap items-baseline gap-x-2">
          <h2 className="font-bold text-slate-900 dark:text-white">{back === 0 ? t('تقرير هذا الأسبوع') : back === 1 ? t('تقرير الأسبوع الماضي') : t('تقرير الأسبوع')}</h2>
          {r && <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{fmt(r.week_start)} – {fmt(r.week_end)}</span>}
        </div>
        <div className="ms-auto flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setBack(back + 1)} disabled={back >= 12} aria-label={t('الأسبوع السابق')} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center disabled:opacity-40">{rtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</button>
          <button type="button" onClick={() => setBack(back - 1)} disabled={back === 0} aria-label={t('الأسبوع التالي')} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center disabled:opacity-40">{rtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
        </div>
      </div>
      {!r ? <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {tiles.map((x, i) => (
              <div key={i} className={`rounded-xl border p-3 ${x.tone === 'warn' ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30' : x.tone === 'ok' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5"><x.icon className="w-3.5 h-3.5 shrink-0" />{x.label}</div>
                <div className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-white mt-0.5"><bdi dir={x.ltr ? 'ltr' : undefined}>{x.value}</bdi></div>
                {x.sub && <div className="text-[11px] text-slate-500 truncate">{x.sub}</div>}
              </div>
            ))}
          </div>
          {(r.quizzes.length > 0 || r.missed.length > 0) && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {r.quizzes.map((q) => <Chip key={q.id} tone={scoreTone(q.pct)}>{q.title} · <span dir="ltr">{q.pct}%</span></Chip>)}
              {r.missed.map((q) => <Chip key={q.id} tone="bad"><AlertTriangle className="w-3 h-3 inline -mt-0.5 me-1" />{t('لم يُحل')}: {q.title}</Chip>)}
            </div>
          )}
          {r.homework_missing.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">{t('واجبات لم تُسلَّم')}: {r.homework_missing.join('، ')}</p>}
          {r.behavior_notes.length > 0 && (
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
              {r.behavior_notes.map((b, i) => <li key={i}>{b.positive ? '👍' : '⚠️'} {b.title} <span className="text-slate-400">· {fmt(b.day)}</span></li>)}
            </ul>
          )}
          {r.support.map((s, i) => (
            <p key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><HeartHandshake className="w-3.5 h-3.5 text-indigo-600" />{t('الدعم الأكاديمي: المستوى {c}% والهدف {g}% ({n} متابعة هذا الأسبوع)', { c: s.current, g: s.target, n: s.entries })}</p>
          ))}
        </>
      )}
    </Card>
  );
};
