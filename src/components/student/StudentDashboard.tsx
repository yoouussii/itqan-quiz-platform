import React, { useMemo } from 'react';
import { Clock, FileQuestion, Star, ChevronLeft, CalendarClock, RotateCcw, BookOpen, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { QuizWithDetails, SubmissionWithDetails } from '../../types';
import { parseWindowStart, parseWindowEnd, formatQuizDateTime } from '../../utils/quizWindow';
import { bestPerQuiz, computePointEvents, levelFor, totalPoints } from '../../utils/points';
import { ungradedEssayCount } from '../../utils/grading';
import { BannerStrip } from '../common/BannerStrip';
import { Card, Chip, scoreTone, timeAgo } from '../common/ui';

interface StudentDashboardProps {
  onStartQuiz: (quizId: string) => void;
  onViewReview: (submissionId: string) => void;
}

type Item = { quiz: QuizWithDetails; retake: boolean; endAt: Date | null; startAt: Date | null };

const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** المدة المتبقية حتى نهاية الإتاحة بصيغة مختصرة */
const remaining = (end: Date | null): { text: string; urgent: boolean } => {
  if (!end) return { text: 'متاح بلا موعد انتهاء', urgent: false };
  const ms = end.getTime() - Date.now();
  const h = Math.floor(ms / 36e5);
  if (h < 1) return { text: `ينتهي خلال ${Math.max(1, Math.floor(ms / 6e4))} دقيقة`, urgent: true };
  if (h < 24) return { text: `ينتهي خلال ${h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? `${h} ساعات` : `${h} ساعة`}`, urgent: true };
  const days = Math.round((startOf(end) - startOf(new Date())) / 864e5);
  if (days === 1) return { text: 'ينتهي غداً', urgent: true };
  if (days === 2) return { text: 'ينتهي بعد يومين', urgent: false };
  return { text: `ينتهي بعد ${days} ${days <= 10 ? 'أيام' : 'يوماً'}`, urgent: false };
};

const qCountLabel = (n: number) => `${n} ${n === 1 ? 'سؤال' : n === 2 ? 'سؤالان' : n <= 10 ? 'أسئلة' : 'سؤالاً'}`;

/** الرئيسية للطالب: الاختبار التالي أولاً، ثم المتاح والقادم، والنتائج والنقاط */
export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onStartQuiz, onViewReview }) => {
  const { currentUser, quizzes, submissions, classes, awards, setCurrentView } = useApp();
  const me = currentUser?.id || '';
  const studentClass = classes.find((c) => c.id === currentUser?.class_id);

  const mySubs = useMemo(
    () => (submissions as SubmissionWithDetails[]).filter((s) => s.student_id === me).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    [submissions, me]
  );
  const validSubs = useMemo(() => mySubs.filter((s) => !s.quiz?.is_deleted), [mySubs]);

  const { available, upcoming } = useMemo(() => {
    const now = new Date();
    const av: Item[] = [];
    const up: Item[] = [];
    (quizzes as QuizWithDetails[]).forEach((quiz) => {
      const retake = !!quiz.allowed_retake_student_ids?.includes(me);
      if (quiz.user_submission && !retake) return;
      if (quiz.is_active === false) return;
      const startAt = parseWindowStart(quiz.start_date);
      const endAt = parseWindowEnd(quiz.end_date);
      if (endAt && now > endAt) return;
      const item = { quiz, retake, startAt, endAt };
      if (startAt && now < startAt) up.push(item);
      else av.push(item);
    });
    av.sort((a, b) => (a.endAt?.getTime() ?? Infinity) - (b.endAt?.getTime() ?? Infinity));
    up.sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
    return { available: av, upcoming: up };
  }, [quizzes, me]);

  const stats = useMemo(() => {
    const myAwards = (awards || []).filter((a) => a.student_id === me);
    const points = totalPoints(computePointEvents(mySubs, quizzes || [], myAwards));
    const valid = bestPerQuiz(validSubs.filter((s) => (quizzes || []).some((q) => q.id === s.quiz_id)));
    const avg = valid.length ? Math.round(valid.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / valid.length) : 0;
    return { points, avg, done: valid.length, lvl: levelFor(points) };
  }, [awards, me, mySubs, validSubs, quizzes]);

  const next = available[0];
  const others = available.slice(1);
  const firstName = (currentUser?.name || '').split(' ')[0];

  const StatsCard = (
    <Card className="p-4 grid grid-cols-3 text-center divide-x divide-x-reverse divide-slate-100 dark:divide-slate-800">
      <button type="button" onClick={() => setCurrentView('analytics')} className="py-1">
        <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{stats.done ? `${stats.avg}%` : '—'}</div>
        <div className="text-[13px] text-slate-500 dark:text-slate-400">معدلي</div>
      </button>
      <button type="button" onClick={() => setCurrentView('my_points')} className="py-1">
        <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{stats.points}</div>
        <div className="text-[13px] text-slate-500 dark:text-slate-400">نقاطي</div>
      </button>
      <button type="button" onClick={() => setCurrentView('analytics')} className="py-1">
        <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{stats.done}</div>
        <div className="text-[13px] text-slate-500 dark:text-slate-400">اختبارات أنهيتها</div>
      </button>
    </Card>
  );

  const LevelCard = (
    <button type="button" onClick={() => setCurrentView('my_points')} className="w-full text-right">
      <Card className="p-4 flex items-center gap-3.5 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
        <span className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-2xl shrink-0" aria-hidden>{stats.lvl.level.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] text-slate-900 dark:text-white">المستوى: {stats.lvl.level.name}</div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 my-2">
            <div className="h-2 rounded-full bg-amber-500" style={{ width: `${stats.lvl.progress}%` }} />
          </div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">
            {stats.lvl.next ? `${stats.lvl.toNext} نقطة للوصول إلى «${stats.lvl.next.name}»` : 'وصلت لأعلى مستوى!'}
          </div>
        </div>
      </Card>
    </button>
  );

  const ResultsCard = (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">آخر نتائجي</h2>
        {mySubs.length > 0 && (
          <button type="button" onClick={() => setCurrentView('analytics')} className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 hover:underline">الكل</button>
        )}
      </div>
      {mySubs.length === 0 ? (
        <p className="px-5 pb-6 pt-2 text-sm text-slate-500 dark:text-slate-400">لم تؤدِّ أي اختبار بعد. نتائجك ستظهر هنا.</p>
      ) : (
        mySubs.slice(0, 4).map((s) => {
          const pending = ungradedEssayCount(s) > 0;
          const pass = (s.quiz as any)?.pass_percentage || 50;
          const pct = Number(s.percentage) || 0;
          return (
            <button key={s.id} type="button" onClick={() => onViewReview(s.id)}
              className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-right hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-[15px] truncate ${s.quiz?.is_deleted ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>{s.quiz?.title || 'اختبار سابق'}</div>
                <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                  {[s.subject?.name, pending ? 'بانتظار تصحيح المعلم' : timeAgo(s.completed_at)].filter(Boolean).join(' · ')}
                </div>
              </div>
              {pending ? <Chip tone="info">قيد التصحيح</Chip> : (
                <Chip tone={scoreTone(pct, pass)}><span className="tabular-nums" dir="ltr">{s.score}/{s.total_possible_score}</span></Chip>
              )}
            </button>
          );
        })
      )}
    </Card>
  );

  const QuizRow: React.FC<{ it: Item; kind: 'available' | 'upcoming' }> = ({ it, kind }) => {
    const r = remaining(it.endAt);
    const n = it.quiz.questions?.length || 0;
    return (
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-t border-slate-100 dark:border-slate-800">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${it.quiz.subject?.color || '#4338ca'}1a`, color: it.quiz.subject?.color || '#4338ca' }}>
          <BookOpen className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15.5px] text-slate-900 dark:text-white truncate">{it.quiz.title}</div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
            {[it.quiz.subject?.name, `${it.quiz.duration_minutes} دقيقة`, n ? qCountLabel(n) : ''].filter(Boolean).join(' · ')}
          </div>
        </div>
        {kind === 'upcoming' ? (
          <Chip tone="muted"><CalendarClock className="w-3.5 h-3.5" />{formatQuizDateTime(it.quiz.start_date, 'start')}</Chip>
        ) : (
          <>
            <span className="hidden sm:inline-flex">{it.retake ? <Chip tone="warn"><RotateCcw className="w-3.5 h-3.5" />إعادة محاولة</Chip> : <Chip tone={r.urgent ? 'warn' : 'muted'}>{r.text}</Chip>}</span>
            <button type="button" onClick={() => onStartQuiz(it.quiz.id)}
              className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">
              ابدأ
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir="rtl">
      <div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{studentClass?.name || 'طالب'}</div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">أهلاً {firstName}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {next ? (
            <section className="relative overflow-hidden rounded-[20px] bg-indigo-600 text-white p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-5" aria-label="اختبارك التالي">
              <span className="pointer-events-none absolute -left-12 -top-12 w-44 h-44 rounded-full border-[28px] border-white/[0.07]" />
              <div className="relative flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-white/85">{next.retake ? 'مسموح لك بإعادة المحاولة' : 'اختبارك التالي'}</span>
                  <span className="inline-flex items-center h-[26px] px-2.5 rounded-full text-xs font-bold bg-amber-300 text-amber-950">{remaining(next.endAt).text}</span>
                </div>
                <div>
                  <div className="text-sm text-white/85">{[next.quiz.subject?.name, next.quiz.teacher?.name].filter(Boolean).join(' · ')}</div>
                  <h2 className="text-2xl sm:text-[28px] font-extrabold leading-snug">{next.quiz.title}</h2>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/95">
                  <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" />{next.quiz.duration_minutes} دقيقة</span>
                  {!!next.quiz.questions?.length && <span className="inline-flex items-center gap-1.5"><FileQuestion className="w-4 h-4" />{qCountLabel(next.quiz.questions.length)}</span>}
                  <span className="inline-flex items-center gap-1.5"><Star className="w-4 h-4" />حتى 50 نقطة</span>
                </div>
              </div>
              <button type="button" onClick={() => onStartQuiz(next.quiz.id)}
                className="relative h-[52px] px-7 rounded-2xl bg-white text-indigo-700 font-bold text-[17px] inline-flex items-center justify-center gap-2 hover:bg-indigo-50 shrink-0">
                ابدأ الاختبار <ChevronLeft className="w-5 h-5" />
              </button>
            </section>
          ) : (
            <Card className="p-6 flex items-center gap-4">
              <span className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0"><CheckCircle2 className="w-6 h-6" /></span>
              <div>
                <div className="font-bold text-base text-slate-900 dark:text-white">لا توجد اختبارات متاحة الآن</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {upcoming[0] ? `القادم: «${upcoming[0].quiz.title}» يبدأ ${formatQuizDateTime(upcoming[0].quiz.start_date, 'start')}` : 'عندما يضيف معلموك اختباراً جديداً سيظهر هنا ويصلك إشعار.'}
                </div>
              </div>
            </Card>
          )}

          <div className="lg:hidden">{StatsCard}</div>
          <BannerStrip embedded />

          {others.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">متاح لك أيضاً</h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">{others.length} {others.length === 1 ? 'اختبار' : others.length === 2 ? 'اختباران' : 'اختبارات'}</span>
              </div>
              {others.map((it) => <QuizRow key={it.quiz.id} it={it} kind="available" />)}
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 pb-2"><h2 className="text-lg font-bold text-slate-900 dark:text-white">قادمة قريباً</h2></div>
              {upcoming.slice(0, 5).map((it) => <QuizRow key={it.quiz.id} it={it} kind="upcoming" />)}
            </Card>
          )}

          <div className="lg:hidden space-y-5">
            {ResultsCard}
            {LevelCard}
          </div>
        </div>

        <aside className="hidden lg:block space-y-5">
          {StatsCard}
          {LevelCard}
          {ResultsCard}
        </aside>
      </div>
    </div>
  );
};
