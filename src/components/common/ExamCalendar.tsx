import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, ChevronLeft, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { PageHeader, Card } from './ui';
import { parseWindowStart, parseWindowEnd } from '../../utils/quizWindow';
import { describeQuizTarget } from '../../utils/quizTarget';
import { uiDir, t, dateLocale } from '../../i18n';
import type { QuizWithDetails, User } from '../../types';

interface Ev { id: string; title: string; subject: string; color: string; start: Date; end: Date | null; who: string; done: boolean }

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const PALETTE = ['#4F46E5', '#0E9384', '#EB6834', '#2A78D6', '#7C3AED', '#DB2777', '#CA8A04'];

/** جدول الاختبارات: تقويم شهري + القادمة (الطالب: اختباراته، ولي الأمر: اختبارات أبنائه، الطاقم: كل الاختبارات مع تصفية بالفصل) */
export const ExamCalendar: React.FC = () => {
  const { currentUser, quizzes, users, classes, subjects } = useApp();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [classId, setClassId] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const role = currentUser?.role;
  const isStaff = role === 'admin' || role === 'teacher' || role === 'supervisor';

  const events = useMemo<Ev[]>(() => {
    if (!currentUser) return [];
    const subjColor = (id: string) => (subjects.find((s) => s.id === id) as any)?.color || PALETTE[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length];
    const toEv = (q: QuizWithDetails, who = ''): Ev | null => {
      if (q.is_deleted || (q.status && q.status !== 'published') || q.is_active === false) return null;
      const start = parseWindowStart(q.start_date) || parseWindowEnd(q.end_date);
      if (!start) return null;
      return { id: `${q.id}|${who}`, title: q.title, subject: q.subject?.name || subjects.find((s) => s.id === q.subject_id)?.name || '', color: subjColor(q.subject_id || ''), start, end: parseWindowEnd(q.end_date), who, done: !!q.user_submission };
    };
    if (role === 'parent') {
      const kids = (currentUser.child_ids || []).map((id) => (users as User[]).find((u) => u.id === id)).filter(Boolean) as User[];
      return kids.flatMap((k) => StorageService.getQuizzesForStudent(k.id).map((q) => toEv(q, k.name.split(/\s+/)[0]))).filter(Boolean) as Ev[];
    }
    if (role === 'student') return (quizzes as QuizWithDetails[]).map((q) => toEv(q)).filter(Boolean) as Ev[];
    return (quizzes as QuizWithDetails[]).filter((q) => {
      if (!classId) return true;
      const asg = StorageService.getAssignmentsByQuizId(q.id);
      return asg.some((a: any) => a.target_type === 'all' || (a.target_type === 'class' && a.target_id === classId));
    }).map((q) => { const e = toEv(q); if (e) e.who = describeQuizTarget(StorageService.getAssignmentsByQuizId(q.id), classes); return e; }).filter(Boolean) as Ev[];
  }, [currentUser, role, quizzes, users, classes, subjects, classId]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    events.forEach((e) => m.set(dayKey(e.start), [...(m.get(dayKey(e.start)) || []), e]));
    m.forEach((l) => l.sort((a, b) => a.start.getTime() - b.start.getTime()));
    return m;
  }, [events]);
  const now = new Date();
  const upcoming = events.filter((e) => (e.end || e.start) >= now).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 12);

  // شبكة الشهر تبدأ من الأحد
  const first = new Date(month);
  const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const weeks = cells[35].getMonth() !== month.getMonth() ? 5 : 6;
  const dow = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + i).toLocaleDateString(dateLocale(), { weekday: 'short' }));
  const time = (d: Date) => d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
  const fullDay = (d: Date) => d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const pickedList = picked ? byDay.get(picked) || [] : null;

  const EvRow: React.FC<{ e: Ev; showDay?: boolean }> = ({ e, showDay }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: e.color }} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] text-slate-900 dark:text-white truncate">{e.title}</div>
        <div className="text-xs text-slate-500 truncate">{[e.subject, e.who].filter(Boolean).join(' · ')}</div>
        <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{showDay ? `${fullDay(e.start)} · ` : ''}{time(e.start)}{e.end ? ` ← ${e.end.toDateString() === e.start.toDateString() ? time(e.end) : fullDay(e.end)}` : ''}</div>
      </div>
      {e.done && <span className="text-xs font-bold text-emerald-600 shrink-0">{t('أُدّي')}</span>}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><CalendarDays className="w-7 h-7 text-indigo-600" />{t('جدول الاختبارات')}</span>}
        subtitle={role === 'parent' ? t('مواعيد اختبارات أبنائك') : role === 'student' ? t('مواعيد اختباراتك القادمة') : t('كل الاختبارات المنشورة حسب موعد بدايتها')} />
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <Card className="lg:col-span-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white me-auto">{month.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}</h2>
            {isStaff && (
              <select aria-label={t('الفصل')} value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                <option value="">{t('كل الفصول')}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button type="button" aria-label={t('الشهر السابق')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center"><ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /></button>
            <button type="button" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold">{t('اليوم')}</button>
            <button type="button" aria-label={t('الشهر التالي')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center"><ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500 mb-1">{dow.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.slice(0, weeks * 7).map((d) => {
              const k = dayKey(d); const list = byDay.get(k) || [];
              const inMonth = d.getMonth() === month.getMonth();
              const isToday = d.toDateString() === now.toDateString();
              return (
                <button key={k} type="button" onClick={() => setPicked(list.length ? k : null)}
                  className={`min-h-[76px] sm:min-h-[92px] rounded-xl border p-1.5 text-start align-top flex flex-col gap-1 transition ${picked === k ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900' : 'border-slate-100 dark:border-slate-800'} ${inMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-900/40 opacity-60'} ${list.length ? 'hover:border-indigo-300 cursor-pointer' : 'cursor-default'}`}>
                  <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{d.getDate()}</span>
                  {list.slice(0, 2).map((e) => (
                    <span key={e.id} className="text-[11px] leading-tight font-semibold rounded-md px-1 py-0.5 truncate text-white" style={{ background: e.color }} title={e.title}>{e.title}</span>
                  ))}
                  {list.length > 2 && <span className="text-[11px] text-slate-500">+{list.length - 2}</span>}
                </button>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-2">{pickedList ? fullDay(pickedList[0].start) : t('الاختبارات القادمة')}</h2>
          {pickedList ? pickedList.map((e) => <EvRow key={e.id} e={e} />) : upcoming.length ? upcoming.map((e) => <EvRow key={e.id} e={e} showDay />) : <p className="text-sm text-slate-500 py-6 text-center">{t('لا توجد اختبارات قادمة')}</p>}
          {pickedList && <button type="button" onClick={() => setPicked(null)} className="mt-3 text-sm font-semibold text-indigo-600">{t('عرض كل القادمة')}</button>}
        </Card>
      </div>
    </div>
  );
};
