import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, PenLine, MoreHorizontal, Copy, Trash2, BellRing, Eye, Link2 } from 'lucide-react';
import { copyQuizLink } from '../../utils/router';
import { useApp } from '../../context/AppContext';
import { Quiz, Submission } from '../../types';
import { StorageService } from '../../services/storage';
import { InsightsPanels } from '../staff/InsightsPanels';
import { hasPerm } from '../../utils/permissions';
import { getWindowState, parseWindowEnd, formatQuizDateTime } from '../../utils/quizWindow';
import { describeQuizTarget } from '../../utils/quizTarget';
import { targetStudents } from '../../utils/quizAudience';
import { SUBMISSIONS_FILTER_KEY, ungradedSummary } from '../../utils/grading';
import { Button, Card, Chip, PageHeader, Tone } from '../common/ui';
import { uiDir, t, isEn } from '../../i18n';
import { daysCount } from '../../i18n/count';

type Tab = 'all' | 'open' | 'upcoming' | 'pending' | 'draft' | 'ended';

const quizState = (q: Quiz): Exclude<Tab, 'all'> => {
  if (q.status === 'draft' || q.status === 'archived') return 'draft';
  if (q.status === 'pending_approval' || q.status === 'rejected') return 'pending';
  const w = getWindowState(q.start_date, q.end_date);
  return w === 'open' ? 'open' : w === 'upcoming' ? 'upcoming' : 'ended';
};

/** «ينتهي بعد 5 أيام» / «ينتهي اليوم» */
const endsIn = (end?: string): { text: string; urgent: boolean } => {
  const e = parseWindowEnd(end);
  if (!e) return { text: t('بلا موعد انتهاء'), urgent: false };
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(e) - startOf(new Date())) / 864e5);
  if (days <= 0) return { text: t('ينتهي اليوم'), urgent: true };
  if (days === 1) return { text: t('ينتهي غداً'), urgent: true };
  if (days === 2) return { text: t('ينتهي بعد يومين'), urgent: false };
  return { text: t('ينتهي بعد {time}', { time: daysCount(days) }), urgent: false };
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'all', label: 'الكل' },
  { id: 'open', label: 'متاح الآن' },
  { id: 'upcoming', label: 'لم يبدأ' },
  { id: 'pending', label: 'بانتظار الاعتماد' },
  { id: 'draft', label: 'مسودات' },
  { id: 'ended', label: 'منتهية' },
];

const QuizMenu: React.FC<{ items: Array<{ label: string; icon: React.ElementType; onClick: () => void; danger?: boolean }> }> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={t('خيارات أخرى')} onClick={() => setOpen(!open)} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute end-0 top-10 z-20 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button key={it.label} type="button" onClick={() => { setOpen(false); it.onClick(); }}
                className={`w-full flex items-center gap-2.5 px-3 h-10 rounded-lg text-sm font-semibold text-start ${it.danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <Icon className="w-4 h-4" />{it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** صفحة المعلم الرئيسية «اختباراتي»: بطاقات الاختبارات حسب الحالة + تنبيه التصحيح */
export const TeacherDashboard: React.FC = () => {
  const {
    currentUser, quizzes, submissions, subjects, classes, users, setCurrentView, setEditingQuizId, setDuplicateQuizId,
    deleteQuizItem, setActiveQuizId, remindLateStudents, showToast,
  } = useApp();
  const [tab, setTab] = useState<Tab>('all');
  const [reminding, setReminding] = useState<string | null>(null);

  const staffData = useMemo(
    () => (currentUser ? StorageService.getStaffData(currentUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, quizzes, submissions, users]
  );

  const myQuizzes = useMemo(
    () => quizzes
      .filter((q: Quiz) => !q.is_deleted && (currentUser?.role === 'admin' || q.teacher_id === currentUser?.id))
      .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')),
    [quizzes, currentUser]
  );
  const myIds = useMemo(() => new Set(myQuizzes.map((q) => q.id)), [myQuizzes]);
  const mySubs = useMemo(() => submissions.filter((s: Submission) => myIds.has(s.quiz_id)), [submissions, myIds]);
  const grading = useMemo(() => ungradedSummary(mySubs), [mySubs]);
  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: myQuizzes.length, open: 0, upcoming: 0, pending: 0, draft: 0, ended: 0 };
    myQuizzes.forEach((q) => { c[quizState(q)]++; });
    return c;
  }, [myQuizzes]);
  const shown = tab === 'all' ? myQuizzes : myQuizzes.filter((q) => quizState(q) === tab);

  const mySubjects = subjects.filter((s) => currentUser?.assigned_subject_ids?.includes(s.id)).map((s) => s.name);
  const myClassCount = currentUser?.assigned_class_ids?.length || 0;
  const myStudentCount = students.filter((s) => s.class_id && currentUser?.assigned_class_ids?.includes(s.class_id)).length;
  const subtitle = [mySubjects.join('، '), myClassCount ? (isEn() ? `${myClassCount} ${myClassCount === 1 ? 'class' : 'classes'}` : `${myClassCount} ${myClassCount === 1 ? 'شعبة' : 'شعب'}`) : '', myStudentCount ? (isEn() ? `${myStudentCount} students` : `${myStudentCount} طالباً`) : '']
    .filter(Boolean).join(' · ') || t('إنشاء الاختبارات ومتابعة نتائج طلابك');

  const newQuiz = () => { setEditingQuizId(null); setDuplicateQuizId(null); setCurrentView('create_quiz'); };
  const edit = (id: string) => { setEditingQuizId(id); setCurrentView('create_quiz'); };
  const duplicate = (id: string) => { setEditingQuizId(null); setDuplicateQuizId(id); setCurrentView('create_quiz'); };
  const results = (id: string) => { setActiveQuizId(id); setCurrentView('quiz_results'); };
  const preview = (id: string) => { setActiveQuizId(id); setCurrentView('quiz_preview'); };
  const remove = async (q: Quiz) => {
    if (window.confirm(t('حذف الاختبار «{title}»؟\nسيختفي من قوائم الطلاب، وتبقى درجاتهم السابقة محفوظة ومستبعدة من المعدل.', { title: q.title }))) await deleteQuizItem(q.id);
  };
  const copyLink = async (id: string) => { if (await copyQuizLink(id)) showToast(t('تم نسخ رابط الاختبار، أرسله للطلاب'), 'success'); };
  const remind = async (id: string) => { setReminding(id); await remindLateStudents(id); setReminding(null); };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir={uiDir()}>
      <PageHeader title={t('اختباراتي')} subtitle={subtitle} actions={<Button icon={Plus} onClick={newQuiz}>{t('اختبار جديد')}</Button>} />

      {grading.essays > 0 && (
        <Card className="p-4 sm:px-5 flex flex-wrap items-center gap-4 !border-indigo-200 dark:!border-indigo-900 !bg-indigo-50/60 dark:!bg-indigo-950/30">
          <span className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0"><PenLine className="w-5 h-5" /></span>
          <div className="flex-1 min-w-[12rem]">
            <div className="font-bold text-base text-slate-900 dark:text-white">{grading.essays}{' '}{t('إجابة مقالية بانتظار تصحيحك')}</div>
            <div className="text-[13.5px] text-slate-600 dark:text-slate-400">{t('الطلاب لا يرون درجتهم النهائية حتى تُصحَّح')}</div>
          </div>
          <Button onClick={() => { try { sessionStorage.setItem(SUBMISSIONS_FILTER_KEY, 'ungraded'); } catch { /* ignore */ } setCurrentView('analytics'); }}>
            {t('ابدأ التصحيح')}
          </Button>
        </Card>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-slate-800/70 w-fit max-w-full overflow-x-auto" role="tablist" aria-label={t('تصفية الاختبارات')}>
        {TABS.filter((tb) => tb.id === 'all' || counts[tb.id] > 0).map((tb) => (
          <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}
            className={`h-10 px-4 rounded-lg text-[14.5px] font-semibold whitespace-nowrap ${tab === tb.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
            {t(tb.label)} <span className="tabular-nums">{counts[tb.id]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map((quiz) => {
          const st = quizState(quiz);
          const subject = subjects.find((s) => s.id === quiz.subject_id);
          const quizSubs = mySubs.filter((s) => s.quiz_id === quiz.id);
          const target = targetStudents((quiz as any).assignments, students).length;
          const done = new Set(quizSubs.map((s) => s.student_id)).size;
          const avg = quizSubs.length ? Math.round(quizSubs.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / quizSubs.length) : 0;
          const qCount = (quiz as any).questions?.length ?? StorageService.getQuestionsByQuizId(quiz.id).length;
          const ends = endsIn(quiz.end_date);
          const chip: { label: string; tone: Tone } =
            st === 'open' ? { label: `${t('متاح')} · ${ends.text}`, tone: ends.urgent ? 'warn' : 'ok' }
              : st === 'upcoming' ? { label: t('يبدأ {date}', { date: formatQuizDateTime(quiz.start_date, 'start') }), tone: 'info' }
              : st === 'pending' ? (quiz.status === 'rejected' ? { label: t('مرفوض'), tone: 'bad' } : { label: t('بانتظار الاعتماد'), tone: 'info' })
              : st === 'draft' ? { label: t('مسودة'), tone: 'muted' }
              : { label: t('منتهٍ'), tone: 'muted' };
          const menu = [
            { label: t('معاينة'), icon: Eye, onClick: () => preview(quiz.id) },
            ...(quiz.status === 'published' ? [{ label: t('نسخ رابط الاختبار للطلاب'), icon: Link2, onClick: () => copyLink(quiz.id) }] : []),
            { label: t('نسخ كاختبار جديد'), icon: Copy, onClick: () => duplicate(quiz.id) },
            ...(st === 'open' && done < target ? [{ label: t('تذكير المتأخرين'), icon: BellRing, onClick: () => remind(quiz.id) }] : []),
            { label: t('حذف'), icon: Trash2, onClick: () => remove(quiz), danger: true },
          ];
          return (
            <Card key={quiz.id} className="p-5 flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-2">
                <Chip tone={chip.tone}>{chip.label}</Chip>
                <QuizMenu items={menu} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-snug">{quiz.title}</h3>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[13.5px] text-slate-500 dark:text-slate-400">
                  {subject && <span>{subject.name}</span>}
                  <span>{qCount} {qCount === 1 ? t('سؤال') : qCount === 2 ? t('سؤالان') : qCount <= 10 ? t('أسئلة') : t('سؤالاً')}</span>
                  <span>{quiz.duration_minutes}{' '}{t('دقيقة')}</span>
                  <span>{describeQuizTarget((quiz as any).assignments, classes)}</span>
                </div>
              </div>

              {st === 'pending' ? (
                <div className={`text-[13.5px] leading-relaxed rounded-xl px-3 py-2.5 ${quiz.status === 'rejected' ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'}`}>
                  {quiz.status === 'rejected'
                    ? t('سبب الرفض: {reason}. عدّله لإعادة الإرسال.', { reason: quiz.review_note || t('لم يُذكر') })
                    : t('أُرسل للاعتماد. سيصلك إشعار عند الموافقة، ولن يظهر للطلاب قبلها.')}
                </div>
              ) : st === 'draft' ? (
                <div className="text-[13.5px] text-slate-500 dark:text-slate-400">{t('لم يُنشر بعد للطلاب')}</div>
              ) : (
                <div>
                  <div className="flex justify-between text-[13.5px] mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">{t('سلّم')}{' '}{done}{' '}{t('من')}{' '}{target || '—'}</span>
                    {quizSubs.length > 0 && <span className="font-bold text-slate-900 dark:text-white tabular-nums">{t('متوسط')}{' '}{avg}%</span>}
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-2 rounded-full ${st === 'ended' ? 'bg-emerald-600' : 'bg-indigo-600'}`} style={{ width: `${target ? Math.min(100, (done / target) * 100) : 0}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-auto pt-1">
                {st === 'draft' ? (
                  <Button className="flex-1" size="sm" onClick={() => edit(quiz.id)}>{t('أكمل التحرير')}</Button>
                ) : (
                  <>
                    <Button className="flex-1" size="sm" variant="secondary" onClick={() => (st === 'pending' ? preview(quiz.id) : results(quiz.id))}>
                      {st === 'pending' ? t('معاينة') : t('النتائج')}
                    </Button>
                    {st === 'open' && done < target ? (
                      <Button className="flex-1" size="sm" variant="secondary" icon={BellRing} disabled={reminding === quiz.id} onClick={() => remind(quiz.id)}>
                        {t('تذكير المتأخرين')}
                      </Button>
                    ) : (
                      <Button className="flex-1" size="sm" variant="secondary" onClick={() => edit(quiz.id)}>{t('تعديل')}</Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}

        {tab === 'all' && (
          <button type="button" onClick={newQuiz}
            className="min-h-[220px] rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-indigo-700 dark:text-indigo-400 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors">
            <Plus className="w-8 h-8" />
            <span className="font-bold text-base">{t('اختبار جديد')}</span>
            <span className="text-[13.5px] text-slate-500 dark:text-slate-400">{t('ابدأ من الصفر أو انسخ اختباراً سابقاً')}</span>
          </button>
        )}
      </div>

      {hasPerm(currentUser, 'can_view_insights') && staffData && (
        <InsightsPanels
          mode="extra"
          students={staffData.students}
          teachers={staffData.teachers}
          quizzes={staffData.quizzes}
          submissions={staffData.submissions}
          showTeacherPerformance={hasPerm(currentUser, 'can_view_teachers_performance')}
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
