import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, ChevronLeft, Clock, Plus, X, Trash2, FileDown, Save, MonitorSmartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { PageHeader, Card, Button, Chip } from './ui';
import { parseWindowStart, parseWindowEnd } from '../../utils/quizWindow';
import { describeQuizTarget } from '../../utils/quizTarget';
import { EXAM_PERIODS, ExamEntry, ExamPeriod, addExamEntries, deleteExamEntry, fetchExamSchedule, periodLabel, periodShort } from '../../services/examScheduleService';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t, dateLocale } from '../../i18n';
import type { QuizWithDetails, User } from '../../types';

/** مصدر الموعد: اختبار إلكتروني على المنصة، أو موعد أضافه المعلم في الجدول */
interface Ev {
  id: string; title: string; subject: string; color: string; start: Date; end: Date | null; who: string; done: boolean;
  period: ExamPeriod | 'online'; lessons?: string; entry?: ExamEntry;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PALETTE = ['#4F46E5', '#0E9384', '#EB6834', '#2A78D6', '#7C3AED', '#DB2777', '#CA8A04'];
const PERIOD_TONE: Record<Ev['period'], 'info' | 'ok' | 'warn' | 'bad' | 'muted'> = { p1: 'info', p2: 'ok', final: 'bad', short: 'warn', other: 'muted', online: 'muted' };
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FILTERS: Array<{ k: Ev['period'] | ''; label: string }> = [
  { k: '', label: 'الكل' },
  ...EXAM_PERIODS.map((p) => ({ k: p.k, label: p.short })),
  { k: 'online', label: 'الاختبارات الإلكترونية' },
];

/** جدول الاختبارات: تقويم شهري + القادمة (الطالب: اختباراته، ولي الأمر: اختبارات أبنائه، الطاقم: كل الاختبارات مع تصفية بالفصل)
 *  ويضيف المعلم مواعيد اختبارات فصوله (ومنها الورقية) مصنّفة بالفترة الأولى أو الثانية… */
export const ExamCalendar: React.FC = () => {
  const { currentUser, quizzes, users, classes, subjects, showToast } = useApp();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [classId, setClassId] = useState('');
  const [period, setPeriod] = useState<Ev['period'] | ''>('');
  const [picked, setPicked] = useState<string | null>(null);
  const [entries, setEntries] = useState<ExamEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [openEv, setOpenEv] = useState<Ev | null>(null);
  const role = currentUser?.role;
  const isStaff = role === 'admin' || role === 'teacher' || role === 'supervisor';
  const canAdd = role === 'admin' || role === 'teacher';

  useEffect(() => { void fetchExamSchedule().then((r) => setEntries(r.rows)); }, []);

  const events = useMemo<Ev[]>(() => {
    if (!currentUser) return [];
    const subjColor = (id: string) => (subjects.find((s) => s.id === id) as any)?.color || PALETTE[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length];
    const subjName = (id: string | null | undefined) => subjects.find((s) => s.id === id)?.name || '';
    const toEv = (q: QuizWithDetails, who = ''): Ev | null => {
      if (q.is_deleted || (q.status && q.status !== 'published') || q.is_active === false) return null;
      const start = parseWindowStart(q.start_date) || parseWindowEnd(q.end_date);
      if (!start) return null;
      return { id: `${q.id}|${who}`, title: q.title, subject: q.subject?.name || subjName(q.subject_id), color: subjColor(q.subject_id || ''), start, end: parseWindowEnd(q.end_date), who, done: !!q.user_submission, period: 'online' };
    };
    const entryEv = (e: ExamEntry, who: string): Ev => {
      const [h, m] = (e.start_time || '').split(':').map(Number);
      const start = new Date(`${e.exam_date}T${e.start_time ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '12:00'}:00`);
      return { id: `${e.id}|${who}`, title: e.title, subject: subjName(e.subject_id), color: subjColor(e.subject_id || ''), start, end: null, who, done: false, period: e.period, lessons: e.lessons, entry: e };
    };
    const className = (id: string) => classes.find((c) => c.id === id)?.name || '';
    let list: Ev[];
    if (role === 'parent') {
      const kids = (currentUser.child_ids || []).map((id) => (users as User[]).find((u) => u.id === id)).filter(Boolean) as User[];
      list = [
        ...kids.flatMap((k) => StorageService.getQuizzesForStudent(k.id).map((q) => toEv(q, k.name.split(/\s+/)[0]))).filter(Boolean) as Ev[],
        ...kids.flatMap((k) => entries.filter((e) => e.class_id === k.class_id).map((e) => entryEv(e, k.name.split(/\s+/)[0]))),
      ];
    } else if (role === 'student') {
      list = [
        ...(quizzes as QuizWithDetails[]).map((q) => toEv(q)).filter(Boolean) as Ev[],
        ...entries.filter((e) => !currentUser.class_id || e.class_id === currentUser.class_id).map((e) => entryEv(e, '')),
      ];
    } else {
      list = [
        ...(quizzes as QuizWithDetails[]).filter((q) => {
          if (!classId) return true;
          const asg = StorageService.getAssignmentsByQuizId(q.id);
          return asg.some((a: any) => a.target_type === 'all' || (a.target_type === 'class' && a.target_id === classId));
        }).map((q) => { const e = toEv(q); if (e) e.who = describeQuizTarget(StorageService.getAssignmentsByQuizId(q.id), classes); return e; }).filter(Boolean) as Ev[],
        ...entries.filter((e) => !classId || e.class_id === classId).map((e) => entryEv(e, className(e.class_id))),
      ];
    }
    return period ? list.filter((e) => e.period === period) : list;
  }, [currentUser, role, quizzes, users, classes, subjects, classId, entries, period]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    events.forEach((e) => m.set(dayKey(e.start), [...(m.get(dayKey(e.start)) || []), e]));
    m.forEach((l) => l.sort((a, b) => a.start.getTime() - b.start.getTime()));
    return m;
  }, [events]);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = events.filter((e) => (e.end || e.start) >= (e.entry ? todayStart : now)).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 12);

  // شبكة الشهر تبدأ من الأحد
  const first = new Date(month);
  const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const weeks = cells[35].getMonth() !== month.getMonth() ? 5 : 6;
  const dow = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + i).toLocaleDateString(dateLocale(), { weekday: 'short' }));
  const time = (d: Date) => d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
  const fullDay = (d: Date) => d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const pickedList = picked ? byDay.get(picked) || [] : null;

  // طباعة جدول الاختبارات المضافة (حسب التصفية الحالية)
  const exportPdf = async () => {
    const rows = events.filter((e) => e.entry).sort((a, b) => a.start.getTime() - b.start.getTime());
    if (!rows.length) return showToast(t('لا توجد مواعيد مضافة في الجدول لطباعتها'), 'info');
    const body = `<table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('اليوم والتاريخ'))}</th><th>${esc(t('الوقت'))}</th><th>${esc(t('المادة'))}</th><th>${esc(t('الاختبار'))}</th><th>${esc(t('التصنيف'))}</th><th>${esc(t('الفصل'))}</th><th>${esc(t('المقرر'))}</th></tr></thead><tbody>${
      rows.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(fullDay(e.start))}</td><td>${esc(e.entry!.start_time ? time(e.start) : '—')}</td><td>${esc(e.subject)}</td><td>${esc(e.title)}</td><td>${esc(t(periodShort(e.period)))}</td><td>${esc(e.who)}</td><td>${esc(e.lessons || '')}</td></tr>`).join('')}</tbody></table>`;
    await exportElementToPdf({ bodyHtml: body, orientation: 'landscape', title: t('جدول الاختبارات'), subtitle: [period ? t(FILTERS.find((f) => f.k === period)!.label) : '', classId ? classes.find((c) => c.id === classId)?.name : ''].filter(Boolean).join(' · ') });
  };

  const EvRow: React.FC<{ e: Ev; showDay?: boolean }> = ({ e, showDay }) => (
    <button type="button" onClick={() => setOpenEv(e)} className="w-full text-start flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg">
      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: e.color }} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] text-slate-900 dark:text-white truncate">{e.title}</div>
        <div className="text-xs text-slate-500 truncate">{[e.subject, e.who].filter(Boolean).join(' · ')}</div>
        <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />{showDay ? fullDay(e.start) : ''}
          {(!e.entry || e.entry.start_time) && `${showDay ? ' · ' : ''}${time(e.start)}`}
          {e.end ? ` ← ${e.end.toDateString() === e.start.toDateString() ? time(e.end) : fullDay(e.end)}` : ''}
        </div>
      </div>
      <span className="flex flex-col items-end gap-1 shrink-0">
        <Chip tone={PERIOD_TONE[e.period]}>{e.period === 'online' ? <><MonitorSmartphone className="w-3 h-3" />{t('إلكتروني')}</> : t(periodShort(e.period))}</Chip>
        {e.done && <span className="text-xs font-bold text-emerald-600">{t('أُدّي')}</span>}
      </span>
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><CalendarDays className="w-7 h-7 text-indigo-600" />{t('جدول الاختبارات')}</span>}
        subtitle={role === 'parent' ? t('مواعيد اختبارات أبنائك') : role === 'student' ? t('مواعيد اختباراتك القادمة') : t('مواعيد الاختبارات: ما يضيفه المعلمون في الجدول، والاختبارات الإلكترونية المنشورة')}
        actions={isStaff ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={FileDown} onClick={() => void exportPdf()}>{t('طباعة الجدول')}</Button>
            {canAdd && <Button icon={Plus} onClick={() => setAdding(true)} data-testid="exam-add">{t('إضافة موعد اختبار')}</Button>}
          </div>
        ) : undefined} />

      {/* التصنيف: الفترة الأولى / الثانية / النهائي … */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('التصنيف')}>
        {FILTERS.map((f) => (
          <button key={f.k || 'all'} type="button" aria-pressed={period === f.k} onClick={() => { setPeriod(f.k); setPicked(null); }}
            className={`h-9 px-3 rounded-xl text-sm font-bold transition ${period === f.k ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300'}`}>
            {t(f.label)}
          </button>
        ))}
      </div>

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
                    <span key={e.id} className={`text-[11px] leading-tight font-semibold rounded-md px-1 py-0.5 truncate text-white ${e.entry ? '' : 'opacity-90'}`} style={{ background: e.color }} title={`${e.title}${e.period !== 'online' ? ` · ${t(periodShort(e.period))}` : ''}`}>{e.entry ? [e.subject, t(periodShort(e.period))].filter(Boolean).join(' · ') || e.title : e.title}</span>
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

      {adding && <AddExamModal onClose={() => setAdding(false)} onSaved={(rows) => { setEntries((p) => [...p, ...rows]); setAdding(false); showToast(t('أُضيف الموعد وأُشعر الطلاب وأولياء أمورهم'), 'success'); const d = new Date(`${rows[0].exam_date}T12:00:00`); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} />}
      {openEv && (
        <EventModal ev={openEv} canDelete={!!openEv.entry && (role === 'admin' || openEv.entry.teacher_id === currentUser?.id)} fullDay={fullDay} time={time}
          onClose={() => setOpenEv(null)}
          onDeleted={() => { setEntries((p) => p.filter((x) => x.id !== openEv.entry!.id)); setOpenEv(null); }} />
      )}
    </div>
  );
};

const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-full text-slate-900 dark:text-white';

/** إضافة موعد اختبار لفصل أو أكثر من فصول المعلم */
const AddExamModal: React.FC<{ onClose: () => void; onSaved: (rows: ExamEntry[]) => void }> = ({ onClose, onSaved }) => {
  const { currentUser, classes, subjects, showToast } = useApp();
  const me = currentUser!;
  const myClassIds = me.assigned_class_ids?.length ? me.assigned_class_ids : me.class_id ? [me.class_id] : [];
  const mySubIds = me.assigned_subject_ids?.length ? me.assigned_subject_ids : me.specialty_id ? [me.specialty_id] : [];
  const assigned = classes.filter((c) => myClassIds.includes(c.id));
  const classList = me.role === 'admin' || !assigned.length ? classes : assigned;
  const subjList = me.role === 'admin' || !mySubIds.length ? subjects : subjects.filter((s) => mySubIds.includes(s.id));
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState(subjList[0]?.id || '');
  const [period, setPeriod] = useState<ExamPeriod>('p1');
  const [date, setDate] = useState(() => isoDay(new Date()));
  const [timeV, setTimeV] = useState('');
  const [lessons, setLessons] = useState('');
  const [picked, setPicked] = useState<string[]>(() => (classList.length === 1 ? [classList[0].id] : []));
  const [busy, setBusy] = useState(false);
  const subjName = subjects.find((s) => s.id === subjectId)?.name || '';
  const save = async () => {
    if (!picked.length) return showToast(t('اختر فصلاً واحداً على الأقل'), 'error');
    if (!date) return showToast(t('حدد تاريخ الاختبار'), 'error');
    const name = title.trim() || [t(periodLabel(period)), subjName].filter(Boolean).join(' - ');
    setBusy(true);
    const r = await addExamEntries(picked.map((class_id) => ({
      class_id, subject_id: subjectId || null, title: name.slice(0, 200), period, exam_date: date, start_time: timeV || null,
      lessons: lessons.trim().slice(0, 1000), teacher_id: me.id, teacher_name: me.name,
    })));
    setBusy(false);
    if (!r.ok) return showToast(t('تعذر الحفظ. تأكد من تشغيل تحديث قاعدة البيانات 063.'), 'error');
    onSaved(r.rows);
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={t('إضافة موعد اختبار')} onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white flex-1">{t('إضافة موعد اختبار')}</h2>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('التصنيف')}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t('التصنيف')}>
              {EXAM_PERIODS.map((p) => (
                <button key={p.k} type="button" role="radio" aria-checked={period === p.k} onClick={() => setPeriod(p.k)}
                  className={`h-10 px-2 rounded-xl text-sm font-bold border transition ${period === p.k ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300'}`}>{t(p.short)}</button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('المادة')}
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inp}><option value="">—</option>{subjList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('عنوان الاختبار (اختياري)')}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={[t(periodLabel(period)), subjName].filter(Boolean).join(' - ')} className={inp} />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('التاريخ')}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('الوقت (اختياري)')}
              <input type="time" value={timeV} onChange={(e) => setTimeV(e.target.value)} className={inp} />
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('الفصول ({n})', { n: picked.length })}</span>
              {classList.length > 1 && (
                <button type="button" className="text-xs font-bold text-indigo-600 hover:underline" onClick={() => setPicked(picked.length === classList.length ? [] : classList.map((c) => c.id))}>
                  {picked.length === classList.length ? t('إلغاء تحديد الكل') : t('تحديد الكل')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto">
              {classList.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <label key={c.id} className={`flex items-center gap-2 p-2 rounded-xl border text-sm cursor-pointer ${on ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 font-bold' : 'border-slate-200 dark:border-slate-700'}`}>
                    <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])} className="accent-indigo-600" />
                    <span className="truncate">{c.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('المقرر / الدروس (اختياري)')}
            <textarea value={lessons} onChange={(e) => setLessons(e.target.value)} rows={3} maxLength={1000} placeholder={t('مثال: الوحدة الأولى والثانية')} className={`${inp} h-auto py-2`} />
          </label>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <span className="text-xs text-slate-500">{t('يصل إشعار للطلاب وأولياء أمورهم')}</span>
          <Button className="ms-auto" icon={Save} disabled={busy} onClick={() => void save()} data-testid="exam-save">{busy ? t('جارٍ الحفظ…') : t('حفظ الموعد')}</Button>
        </div>
      </div>
    </div>
  );
};

const EventModal: React.FC<{ ev: Ev; canDelete: boolean; fullDay: (d: Date) => string; time: (d: Date) => string; onClose: () => void; onDeleted: () => void }> = ({ ev, canDelete, fullDay, time, onClose, onDeleted }) => {
  const { showToast } = useApp();
  const del = async () => {
    if (!window.confirm(t('حذف هذا الموعد من الجدول؟'))) return;
    if (await deleteExamEntry(ev.entry!.id)) { onDeleted(); showToast(t('حُذف الموعد'), 'success'); } else showToast(t('تعذر الحذف'), 'error');
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={ev.title} onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3">
          <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: ev.color }} />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">{ev.title}</h2>
            <p className="text-sm text-slate-500">{[ev.subject, ev.who].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tone={PERIOD_TONE[ev.period]}>{ev.period === 'online' ? t('اختبار إلكتروني على المنصة') : t(periodLabel(ev.period))}</Chip>
          <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200"><Clock className="w-4 h-4" />{fullDay(ev.start)}{(!ev.entry || ev.entry.start_time) && ` · ${time(ev.start)}`}</span>
        </div>
        {ev.lessons && <div><div className="text-xs font-bold text-slate-500 mb-0.5">{t('المقرر')}</div><p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{ev.lessons}</p></div>}
        {ev.entry?.teacher_name && <p className="text-xs text-slate-500">{t('أضافه: {n}', { n: ev.entry.teacher_name })}</p>}
        {canDelete && <Button variant="ghost" icon={Trash2} className="!text-rose-600" onClick={() => void del()}>{t('حذف الموعد')}</Button>}
      </div>
    </div>
  );
};
