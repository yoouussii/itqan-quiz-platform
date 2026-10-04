import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, RotateCcw, BookOpen, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { QuizWithDetails, SubmissionWithDetails } from '../../types';
import { parseWindowStart, parseWindowEnd, formatQuizDateTime } from '../../utils/quizWindow';
import { LEVELS, bestPerQuiz, computePointEvents, levelFor, totalPoints } from '../../utils/points';
import { ungradedEssayCount } from '../../utils/grading';
import { BannerStrip } from '../common/BannerStrip';
import { Card, Chip, greeting, scoreTone, timeAgo, todayLabel } from '../common/ui';
import { uiDir, t, isEn, dateLocale } from '../../i18n';
import { questionsCount, minutesCount, hoursCount, daysCount } from '../../i18n/count';
import { DevicePushCard } from '../common/DevicePushCard';
import { DailyChallenge } from './DailyChallenge';
import { shortName } from '../../utils/names';
import { AttendanceSummary } from '../common/AttendanceSummary';
import { ConductSummary } from '../common/ConductSummary';
import { SurveyPrompt } from '../common/SurveyPrompt';
import { RemedialCard } from '../common/RemedialCard';
import { HomeworkCard } from '../common/Homework';
import { StudentHomeData, fetchStudentHome } from '../../services/studentHomeService';

interface StudentDashboardProps {
  onStartQuiz: (quizId: string) => void;
  onViewReview: (submissionId: string) => void;
}

type Item = { quiz: QuizWithDetails; retake: boolean; endAt: Date | null; startAt: Date | null };

const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** المدة المتبقية حتى نهاية الإتاحة بصيغة مختصرة */
const remaining = (end: Date | null): { text: string; urgent: boolean } => {
  if (!end) return { text: t('متاح بلا موعد انتهاء'), urgent: false };
  const ms = end.getTime() - Date.now();
  const h = Math.floor(ms / 36e5);
  if (h < 1) return { text: t('ينتهي خلال {time}', { time: minutesCount(Math.max(1, Math.floor(ms / 6e4))) }), urgent: true };
  if (h < 24) return { text: t('ينتهي خلال {time}', { time: hoursCount(h) }), urgent: true };
  const days = Math.round((startOf(end) - startOf(new Date())) / 864e5);
  if (days === 1) return { text: t('ينتهي غداً'), urgent: true };
  if (days === 2) return { text: t('ينتهي بعد يومين'), urgent: false };
  return { text: t('ينتهي بعد {time}', { time: daysCount(days) }), urgent: false };
};

/** «يوم واحد / يومان / 3 أيام» لعدّاد الأيام المتتالية */
const streakDays = (n: number) => (isEn() ? daysCount(n) : n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : daysCount(n));
/** مدة التحدي: «دقيقتين» أو «72 ثانية» */
const challengeTime = (sec: number) => {
  if (sec % 60) return isEn() ? `${sec} seconds` : `${sec} ثانية`;
  const m = sec / 60;
  return isEn() ? `${m} minute${m === 1 ? '' : 's'}` : m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? `${m} دقائق` : `${m} دقيقة`;
};
const RING_COLORS = ['#2a78d6', '#1baf7a', '#eb6834', '#4a3aa7'];
const MILESTONES = [3, 7, 14, 30, 60, 100];
const card = 'rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800';

/** رئيسية الطالب: تحدي اليوم، الاختبارات المتاحة والقادمة، مستواه في المواد، السلسلة والمستوى وترتيب الفصل */
export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onStartQuiz, onViewReview }) => {
  const { currentUser, quizzes, submissions, classes, awards, setCurrentView, refreshData } = useApp();
  const me = currentUser?.id || '';
  const studentClass = classes.find((c) => c.id === currentUser?.class_id);
  const [home, setHome] = useState<StudentHomeData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [, setTick] = useState(0);

  const loadHome = useCallback(() => { void fetchStudentHome().then(setHome); }, []);
  useEffect(() => { loadHome(); }, [loadHome, submissions.length]);
  // تحديث العدّاد التنازلي كل 30 ثانية
  useEffect(() => { const id = window.setInterval(() => setTick((x) => x + 1), 30_000); return () => window.clearInterval(id); }, []);

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
    return { points, lvl: levelFor(points) };
  }, [awards, me, mySubs, quizzes]);

  // متوسط الطالب في كل مادة (أفضل محاولة لكل اختبار)
  const rings = useMemo(() => {
    const best = bestPerQuiz(validSubs.filter((s) => (quizzes || []).some((q) => q.id === s.quiz_id)));
    const by = new Map<string, { name: string; color?: string; sum: number; n: number }>();
    best.forEach((s) => {
      const key = s.subject?.id || (s.quiz as any)?.subject_id || '';
      if (!key || !s.subject?.name) return;
      const cur = by.get(key) || { name: s.subject.name, color: s.subject.color, sum: 0, n: 0 };
      cur.sum += Number(s.percentage) || 0;
      cur.n += 1;
      by.set(key, cur);
    });
    return Array.from(by.values()).sort((a, b) => b.n - a.n).slice(0, 4)
      .map((x, i) => ({ name: x.name, pct: Math.round(x.sum / x.n), color: RING_COLORS[i] }));
  }, [validSubs, quizzes]);

  const firstName = (currentUser?.name || '').split(' ')[0];
  const ch = home?.challenge;
  const showChallenge = !!ch && (ch.enabled || ch.done);
  const showStreak = !!home && home.settings.streak;
  const showBoard = !!home && home.settings.leaderboard && home.leaderboard.length > 0;
  const nextUp = upcoming[0];
  const lvlIdx = LEVELS.indexOf(stats.lvl.level);

  const closeChallenge = (finished: boolean) => {
    setPlaying(false);
    if (finished) { loadHome(); void refreshData(); }
  };

  const ChallengeCard = showChallenge && ch && (
    ch.done ? (
      <section className={`${card} p-5 sm:p-6 flex items-center gap-4`} data-testid="challenge-done">
        <span className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-3xl shrink-0" aria-hidden>✅</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t('تحدي اليوم')}</p>
          <h2 className="font-cairo text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">{t('أنهيت تحدي اليوم: {c} من {n}', { c: ch.correct, n: ch.total })}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('عد غداً لتحدٍّ جديد وحافظ على سلسلتك')}</p>
        </div>
        <span className="shrink-0 inline-flex items-center h-10 px-3 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-black whitespace-nowrap">⭐ <span dir="ltr">+{ch.points}</span></span>
      </section>
    ) : (
      <section className="relative overflow-hidden rounded-3xl p-6 md:p-7 text-white bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 shadow-xl shadow-indigo-600/20" data-testid="challenge-card">
        <span className="pointer-events-none absolute -top-16 -start-16 w-56 h-56 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-20 end-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="space-y-3 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/15 rounded-full px-3 py-1">🎯 {t('تحدي اليوم')}</span>
            <h2 className="font-cairo text-2xl md:text-3xl font-black leading-snug">
              {t('{q} في {time}', { q: questionsCount(ch.count), time: challengeTime(ch.count * 24) })}
            </h2>
            <p className="text-white/85 text-sm">{t('أسئلة سريعة من موادك، تصحح فوراً مع الشرح')}</p>
            <div className="flex items-center gap-1.5 pt-1" aria-hidden>
              {Array.from({ length: ch.count }, (_, i) => <span key={i} className="w-7 h-2 rounded-full bg-white/30" />)}
            </div>
          </div>
          <div className="shrink-0 text-center bg-white/15 rounded-2xl px-4 py-3">
            <div className="text-2xl font-black" dir="ltr">+{ch.count * 3 + 5}</div>
            <div className="text-[11px] text-white/85">{t('نقطة')}</div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setPlaying(true)} className="h-12 px-7 rounded-xl bg-white text-indigo-700 font-bold text-base shadow-lg hover:bg-indigo-50">{t('ابدأ التحدي')}</button>
          {ch.solved_by_classmates > 0 && <span className="text-sm text-white/85">👥 {t('حلّه {n} من فصلك اليوم', { n: ch.solved_by_classmates })}</span>}
        </div>
      </section>
    )
  );

  const AvailableCard = available.length > 0 && (
    <section className={`${card} p-5 md:p-6 space-y-2`} aria-labelledby="available-title">
      <div className="flex items-center justify-between">
        <h2 id="available-title" className="font-cairo text-lg font-extrabold text-slate-900 dark:text-white">{t('متاح الآن')}</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">{available.length} {available.length === 1 ? t('اختبار') : available.length === 2 ? t('اختباران') : t('اختبارات')}</span>
      </div>
      {available.map((it, i) => {
        const r = remaining(it.endAt);
        const n = it.quiz.questions?.length || 0;
        const color = it.quiz.subject?.color || '#4338ca';
        return (
          <div key={it.quiz.id} className={`flex items-center gap-3 sm:gap-4 p-3 rounded-2xl ${i === 0 ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}><BookOpen className="w-5 h-5" /></span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15.5px] text-slate-900 dark:text-white truncate">{it.quiz.title}</p>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                {[it.quiz.subject?.name, minutesCount(it.quiz.duration_minutes), n ? questionsCount(n) : ''].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="hidden sm:inline-flex">{it.retake ? <Chip tone="warn"><RotateCcw className="w-3.5 h-3.5" />{t('إعادة محاولة')}</Chip> : <Chip tone={r.urgent ? 'warn' : 'muted'}>{r.text}</Chip>}</span>
            <button type="button" onClick={() => onStartQuiz(it.quiz.id)}
              className={`h-10 px-4 rounded-xl text-sm font-bold shrink-0 ${i === 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              {t('ابدأ')}
            </button>
          </div>
        );
      })}
    </section>
  );

  const countdown = (() => {
    if (!nextUp?.startAt) return null;
    const ms = Math.max(0, nextUp.startAt.getTime() - Date.now());
    return { d: Math.floor(ms / 864e5), h: Math.floor((ms % 864e5) / 36e5), m: Math.floor((ms % 36e5) / 6e4) };
  })();
  const NextCard = nextUp && (
    <section className={`${card} p-5 md:p-6 space-y-4`} aria-labelledby="next-title">
      <div className="flex flex-wrap items-center gap-4 sm:gap-5">
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${nextUp.quiz.subject?.color || '#0284c7'}1a`, color: nextUp.quiz.subject?.color || '#0284c7' }}>
          <CalendarClock className="w-7 h-7" />
        </span>
        <div className="flex-1 min-w-[12rem]">
          <p id="next-title" className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('الاختبار القادم')}</p>
          <h3 className="font-cairo text-lg font-extrabold text-slate-900 dark:text-white">{nextUp.quiz.title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {[nextUp.quiz.subject?.name, nextUp.quiz.questions?.length ? questionsCount(nextUp.quiz.questions.length) : '', minutesCount(nextUp.quiz.duration_minutes), nextUp.quiz.teacher?.name].filter(Boolean).join(' · ')}
          </p>
        </div>
        {countdown && (
          <div className="flex gap-2 text-center" aria-label={t('يبدأ {date}', { date: formatQuizDateTime(nextUp.quiz.start_date, 'start') })}>
            {([[countdown.d, t('يوم')], [countdown.h, t('ساعة')], [countdown.m, t('دقيقة')]] as const).map(([v, l]) => (
              <div key={l} className="w-16 rounded-xl bg-slate-100 dark:bg-slate-800 py-2">
                <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white">{String(v).padStart(l === t('يوم') ? 1 : 2, '0')}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {upcoming.length > 1 && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1.5">
          {upcoming.slice(1, 4).map((it) => (
            <div key={it.quiz.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-700 dark:text-slate-300">{it.quiz.title}</span>
              <span className="shrink-0 text-slate-500 dark:text-slate-400">{formatQuizDateTime(it.quiz.start_date, 'start')}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const EmptyCard = !available.length && !nextUp && (
    <Card className="p-6 flex items-center gap-4">
      <span className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0"><CheckCircle2 className="w-6 h-6" /></span>
      <div>
        <div className="font-bold text-base text-slate-900 dark:text-white">{t('لا توجد اختبارات متاحة الآن')}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{t('عندما يضيف معلموك اختباراً جديداً سيظهر هنا ويصلك إشعار.')}</div>
      </div>
    </Card>
  );

  const RingsCard = rings.length > 0 && (
    <section className={`${card} p-5 md:p-6`} aria-labelledby="rings-title">
      <div className="flex items-center justify-between mb-4">
        <h2 id="rings-title" className="font-cairo text-lg font-extrabold text-slate-900 dark:text-white">{t('مستواي في المواد')}</h2>
        <button type="button" onClick={() => setCurrentView('analytics')} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{t('التفاصيل')}</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {rings.map((r) => (
          <div key={r.name} className="flex flex-col items-center gap-2">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90" aria-hidden>
                <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={r.color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${Math.max(1, r.pct) * 0.974} 100`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-black tabular-nums text-slate-900 dark:text-white">{r.pct}%</span>
            </div>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 text-center">{r.name}</span>
          </div>
        ))}
      </div>
    </section>
  );

  const ResultsCard = (
    <section className={`${card} overflow-hidden`} aria-labelledby="results-title">
      <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-2">
        <h2 id="results-title" className="font-cairo text-lg font-extrabold text-slate-900 dark:text-white">{t('آخر نتائجي')}</h2>
        {mySubs.length > 0 && (
          <button type="button" onClick={() => setCurrentView('analytics')} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{t('الكل')}</button>
        )}
      </div>
      {mySubs.length === 0 ? (
        <p className="px-6 pb-6 pt-2 text-sm text-slate-500 dark:text-slate-400">{t('لم تؤدِّ أي اختبار بعد. نتائجك ستظهر هنا.')}</p>
      ) : (
        mySubs.slice(0, 4).map((s) => {
          const pending = ungradedEssayCount(s) > 0;
          const pass = (s.quiz as any)?.pass_percentage || 50;
          const pct = Number(s.percentage) || 0;
          return (
            <button key={s.id} type="button" onClick={() => onViewReview(s.id)}
              className="w-full flex items-center gap-3 px-5 md:px-6 py-3 border-t border-slate-100 dark:border-slate-800 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-[15px] truncate ${s.quiz?.is_deleted ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>{s.quiz?.title || t('اختبار سابق')}</div>
                <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                  {[s.subject?.name, pending ? t('بانتظار تصحيح المعلم') : timeAgo(s.completed_at)].filter(Boolean).join(' · ')}
                </div>
              </div>
              {pending ? <Chip tone="info">{t('قيد التصحيح')}</Chip> : (
                <Chip tone={scoreTone(pct, pass)}><span className="tabular-nums" dir="ltr">{s.score}/{s.total_possible_score}</span></Chip>
              )}
            </button>
          );
        })
      )}
    </section>
  );

  const streak = home?.streak;
  const todayActive = !!streak?.week[6]?.active;
  const milestone = streak ? MILESTONES.find((m) => m > streak.current) : undefined;
  const StreakCard = showStreak && streak && (
    <section className={`${card} p-5`} aria-labelledby="streak-title" data-testid="streak-card">
      <div className="flex items-center gap-3">
        <span className={`text-4xl ${streak.current ? 'streak-flame' : 'grayscale opacity-60'}`} aria-hidden>🔥</span>
        <div>
          <p id="streak-title" className="font-cairo text-2xl font-black text-orange-600 dark:text-orange-400">
            {streak.current ? t('سلسلة {d}', { d: streakDays(streak.current) }) : t('ابدأ سلسلتك اليوم')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{streak.longest ? t('أطول سلسلة لك: {d}', { d: streakDays(streak.longest) }) : t('كل يوم تحل فيه تحدياً أو اختباراً يُحسب')}</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
        {streak.week.map((w, i) => {
          const isToday = i === 6;
          const label = isToday ? t('اليوم') : new Date(`${w.day}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'narrow' });
          return (
            <div key={w.day} className="space-y-1">
              <div className={`aspect-square rounded-xl flex items-center justify-center text-base ${w.active ? 'bg-orange-100 dark:bg-orange-950/60' : isToday ? 'border-2 border-dashed border-orange-300 dark:border-orange-700' : 'bg-slate-100 dark:bg-slate-800'}`}>{w.active ? '🔥' : ''}</div>
              <div className={isToday ? 'font-bold text-orange-600 dark:text-orange-400' : ''}>{label}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200 text-xs font-semibold p-3 leading-relaxed">
        {todayActive ? t('أحسنت! نشاط اليوم محسوب ✅') : ch?.enabled && !ch.done ? t('حلّ تحدي اليوم لتحافظ على سلسلتك 💪') : t('أدِّ اختباراً اليوم لتستمر سلسلتك 💪')}
        {milestone && <> · {t('باقي {d} على سلسلة {m}', { d: streakDays(milestone - streak.current), m: streakDays(milestone) })}</>}
      </div>
    </section>
  );

  const LevelCard = (
    <button type="button" onClick={() => setCurrentView('my_points')} className={`${card} w-full text-start p-5 hover:border-amber-300 dark:hover:border-amber-700 transition-colors`} data-testid="level-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white font-black text-xl flex items-center justify-center shadow-md">{lvlIdx + 1}</span>
          <div>
            <p className="font-cairo font-extrabold text-slate-900 dark:text-white">{t('المستوى {n}', { n: lvlIdx + 1 })}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{stats.lvl.level.emoji} {t(stats.lvl.level.name)}</p>
          </div>
        </div>
        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums" dir="ltr">{stats.lvl.next ? `${stats.points} / ${stats.lvl.next.min}` : stats.points}</span>
      </div>
      <div className="mt-3 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-orange-500" style={{ width: `${Math.max(3, stats.lvl.progress)}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {stats.lvl.next ? t('باقي {n} نقطة للمستوى {next}', { n: stats.lvl.toNext, next: lvlIdx + 2 }) : t('وصلت لأعلى مستوى!')}
      </p>
    </button>
  );

  const board = home?.leaderboard || [];
  const meInTop = board.some((b) => b.me);
  // الميدالية لمن جمع نقاطاً فقط (لا ميداليات لتعادل على صفر)
  const medal = (r: number, pts: number) => (!pts ? String(r) : r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : String(r));
  const BoardCard = showBoard && (
    <section className={`${card} p-5`} aria-labelledby="board-title" data-testid="class-board">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 id="board-title" className="font-cairo font-extrabold text-slate-900 dark:text-white">🏆 {t('ترتيب فصلي هذا الأسبوع')}</h2>
        {studentClass?.name && <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{studentClass.name}</span>}
      </div>
      <ol className="space-y-1.5 text-sm">
        {board.map((b) => (
          <li key={`${b.rank}-${b.name}`} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${b.me ? 'bg-indigo-50 dark:bg-indigo-950/50 font-bold text-indigo-800 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}`}>
            <span className="w-6 text-center">{medal(b.rank, b.points)}</span>
            <span className="flex-1 truncate">{shortName(b.name)}{b.me ? ` ${t('(أنت)')}` : ''}</span>
            <span className="text-slate-500 dark:text-slate-400 font-semibold tabular-nums">{b.points}</span>
          </li>
        ))}
        {!meInTop && home?.my_rank && (
          <li className="flex items-center gap-3 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 font-bold text-indigo-800 dark:text-indigo-200 mt-2">
            <span className="w-6 text-center">{home.my_rank}</span>
            <span className="flex-1 truncate">{shortName(currentUser?.name || '')} {t('(أنت)')}</span>
            <span className="tabular-nums">{home.my_week_points}</span>
          </li>
        )}
      </ol>
      {board.every((b) => !b.points) && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('اجمع نقاطاً هذا الأسبوع لتتصدر فصلك')}</p>}
    </section>
  );

  return (
    <div className="max-w-6xl mx-auto py-5 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <section className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">{[todayLabel(), studentClass?.name].filter(Boolean).join(' · ')}</p>
          <h1 className="font-cairo text-2xl md:text-3xl font-black text-slate-900 dark:text-white">{t('{greeting} يا {name}', { greeting: greeting(), name: firstName })} 👋</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showStreak && streak && (
            <span className="inline-flex items-center gap-1 h-9 px-3 rounded-full whitespace-nowrap bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-300 font-bold text-sm" title={t('أيام متتالية')}>
              <span className={streak.current ? 'streak-flame' : 'grayscale'} aria-hidden>🔥</span>{streak.current}
            </span>
          )}
          <button type="button" onClick={() => setCurrentView('my_points')} className="inline-flex items-center gap-1 h-9 px-3 rounded-full whitespace-nowrap bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-bold text-sm" title={t('نقاطي')}>
            ⭐ <span className="tabular-nums">{stats.points}</span>
          </button>
        </div>
      </section>
      <SurveyPrompt />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {ChallengeCard}
          {AvailableCard}
          {currentUser && <HomeworkCard student={currentUser} canSubmit />}
          {NextCard}
          {EmptyCard}
          <BannerStrip embedded />
          <DevicePushCard compact />
          {RingsCard}
          <div className="lg:hidden space-y-5">
            {StreakCard}
            {LevelCard}
            {BoardCard}
            {me && <AttendanceSummary studentId={me} />}
            {me && <ConductSummary studentId={me} />}
            {me && <RemedialCard studentId={me} />}
          </div>
          {ResultsCard}
        </div>

        <aside className="hidden lg:block space-y-5">
          {StreakCard}
          {LevelCard}
          {BoardCard}
          {me && <AttendanceSummary studentId={me} />}
            {me && <ConductSummary studentId={me} />}
            {me && <RemedialCard studentId={me} />}
        </aside>
      </div>

      {playing && <DailyChallenge onClose={closeChallenge} />}
    </div>
  );
};
