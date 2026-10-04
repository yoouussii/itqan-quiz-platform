import React, { useMemo, useState } from 'react';
import { AttendanceSummary } from '../common/AttendanceSummary';
import { ConductSummary } from '../common/ConductSummary';
import { BookOpen, CalendarClock, CheckCircle2, Users, FileText } from 'lucide-react';
import { exportStudentReport, reportExtras } from '../../utils/studentReport';
import { earnedBadges } from '../../utils/points';
import { formatFullArabicDate } from '../../utils/dateUtils';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { SubmissionWithDetails, User } from '../../types';
import { parseWindowStart, parseWindowEnd, formatQuizDateTime } from '../../utils/quizWindow';
import { bestPerQuiz, computePointEvents, levelFor, totalPoints } from '../../utils/points';
import { ungradedEssayCount } from '../../utils/grading';
import { Avatar } from '../common/Avatar';
import { BannerStrip } from '../common/BannerStrip';
import { Card, Chip, scoreTone, timeAgo } from '../common/ui';
import { uiDir, t, dateLocale } from '../../i18n';
import { minutesCount } from '../../i18n/count';
import { SkillsCard } from '../analytics/OutcomesPage';
import { DevicePushCard } from '../common/DevicePushCard';

/** موعد الانتهاء مختصراً: «ينتهي اليوم» أو «ينتهي 4 أكتوبر» */
const shortEnd = (end?: string) => {
  const e = parseWindowEnd(end);
  if (!e) return t('بلا موعد انتهاء');
  if (e.toDateString() === new Date().toDateString()) return t('ينتهي اليوم');
  return t('ينتهي {date}', { date: e.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' }) });
};

/** «ابنك» أو «ابنتك» حسب نوع الطالب */
export const childWord = (u?: User | null) => (u?.gender === 'female' ? t('ابنتك') : t('ابنك'));

/** الرئيسية لولي الأمر: متابعة اختبارات أبنائه ونتائجهم ونقاطهم (للعرض فقط) */
export const ParentDashboard: React.FC<{ onViewReview: (submissionId: string) => void }> = ({ onViewReview }) => {
  const { currentUser, users, submissions, classes, branches, awards, quizzes, subjects } = useApp();
  const children = useMemo(
    () => (currentUser?.child_ids || []).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u),
    [currentUser, users]
  );
  const [picked, setPicked] = useState<string | null>(null);
  const child = children.find((c) => c.id === picked) || children[0];

  const data = useMemo(() => {
    if (!child) return null;
    const now = new Date();
    const subs = (submissions as SubmissionWithDetails[])
      .filter((s) => s.student_id === child.id)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    const childQuizzes = StorageService.getQuizzesForStudent(child.id);
    const waiting: typeof childQuizzes = [];
    const upcoming: typeof childQuizzes = [];
    childQuizzes.forEach((q) => {
      const retake = !!q.allowed_retake_student_ids?.includes(child.id);
      if ((q.user_submission && !retake) || q.is_active === false) return;
      const s = parseWindowStart(q.start_date);
      const e = parseWindowEnd(q.end_date);
      if (e && now > e) return;
      if (s && now < s) upcoming.push(q);
      else waiting.push(q);
    });
    waiting.sort((a, b) => (parseWindowEnd(a.end_date)?.getTime() ?? Infinity) - (parseWindowEnd(b.end_date)?.getTime() ?? Infinity));
    const valid = bestPerQuiz(subs.filter((s) => !s.quiz?.is_deleted));
    const avg = valid.length ? Math.round(valid.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / valid.length) : 0;
    const points = totalPoints(computePointEvents(subs, childQuizzes as any, (awards || []).filter((a) => a.student_id === child.id)));
    return { subs, waiting, upcoming, avg, done: valid.length, points, lvl: levelFor(points) };
  }, [child, submissions, awards, quizzes]); // eslint-disable-line react-hooks/exhaustive-deps

  const printReport = async () => {
    if (!child || !data) return;
    const subs = data.subs.filter((s) => !s.quiz?.is_deleted);
    await exportStudentReport({
      name: child.name, nationalId: child.national_id, className: cls?.name,
      results: subs.map((x) => ({ quiz: x.quiz?.title || '—', subject: x.subject?.name || '—', score: `${x.score}/${x.total_possible_score}`, pct: Number(x.percentage) || 0, date: formatFullArabicDate(x.completed_at) })),
      points: data.points,
      badgeKeys: earnedBadges(subs, quizzes),
      awards: (awards || []).filter((a) => a.student_id === child.id),
      ...reportExtras(child.id, quizzes, submissions, (id) => subjects.find((s) => s.id === id)?.name || ''),
    });
  };


  if (!child || !data) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4" dir={uiDir()}>
        <Card className="p-8 text-center space-y-2">
          <Users className="w-10 h-10 mx-auto text-slate-400" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('لا يوجد أبناء مرتبطون بحسابك بعد')}</h1>
          <p className="text-[15px] text-slate-500 dark:text-slate-400">{t('تواصل مع إدارة المدرسة لربط حسابك بحساب ابنك أو ابنتك.')}</p>
        </Card>
      </div>
    );
  }

  const cls = classes.find((c) => c.id === child.class_id);
  const branch = branches.find((b) => b.id === child.branch_id);
  const word = childWord(child);

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{t('متابعة الأبناء')}</div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('أهلاً بك')}</h1>
      </div>

      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('اختيار الابن')}>
          {children.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === child.id} onClick={() => setPicked(c.id)}
              className={`flex items-center gap-2 h-12 pe-4 ps-2 rounded-2xl border whitespace-nowrap ${c.id === child.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}>
              <Avatar name={c.name} role="student" userId={c.id} size="sm" />
              <span className="font-semibold text-[15px]">{c.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      )}

      <Card className="p-5 flex items-center gap-4">
        <Avatar name={child.name} role="student" userId={child.id} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg text-slate-900 dark:text-white truncate">{child.name}</div>
          <div className="text-[14px] text-slate-500 dark:text-slate-400">{[cls?.name, branch?.name].filter(Boolean).join(' · ') || (child.gender === 'female' ? t('طالبة') : t('طالب'))}</div>
        </div>
        <button type="button" onClick={() => void printReport()}
          className="h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 shrink-0">
          <FileText className="w-4 h-4" /><span className="hidden sm:inline">{t('تقرير للطباعة')}</span>
        </button>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { v: data.done ? `${data.avg}%` : '—', l: t('المعدل') },
          { v: data.done, l: t('اختبارات أنهاها') },
          { v: data.waiting.length, l: t('تنتظره الآن'), tone: data.waiting.length ? 'text-amber-700 dark:text-amber-400' : '' },
          { v: data.points, l: `${t('النقاط')} · ${t(data.lvl.level.name)}`, tone: 'text-amber-700 dark:text-amber-400' },
        ].map((x) => (
          <Card key={x.l} className="p-4 text-center">
            <div className={`text-2xl font-bold tabular-nums text-slate-900 dark:text-white ${x.tone || ''}`}>{x.v}</div>
            <div className="text-[13px] text-slate-500 dark:text-slate-400">{x.l}</div>
          </Card>
        ))}
      </div>

      <BannerStrip embedded />
      <DevicePushCard compact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Card className="overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('اختبارات تنتظر {who}', { who: word })}</h2>
          </div>
          {data.waiting.length === 0 ? (
            <div className="flex items-center gap-2 px-5 pb-5 pt-1 text-emerald-700 dark:text-emerald-400 text-[15px] font-semibold">
              <CheckCircle2 className="w-5 h-5" />{t('لا توجد اختبارات متأخرة حالياً')}
            </div>
          ) : (
            data.waiting.map((q) => (
              <div key={q.id} className="flex items-center gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${q.subject?.color || '#4338ca'}1a`, color: q.subject?.color || '#4338ca' }}>
                  <BookOpen className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] text-slate-900 dark:text-white truncate">{q.title}</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{[q.subject?.name, minutesCount(q.duration_minutes)].filter(Boolean).join(' · ')}</div>
                </div>
                <Chip tone="warn">{shortEnd(q.end_date)}</Chip>
              </div>
            ))
          )}
          {data.upcoming.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-1 text-sm font-semibold text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">{t('قادمة')}</div>
              {data.upcoming.slice(0, 4).map((q) => (
                <div key={q.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 min-w-0 font-semibold text-[15px] text-slate-800 dark:text-slate-200 truncate">{q.title}</div>
                  <Chip tone="muted"><CalendarClock className="w-3.5 h-3.5" />{formatQuizDateTime(q.start_date, 'start')}</Chip>
                </div>
              ))}
            </>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 pt-4 pb-2"><h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('نتائج {who}', { who: word })}</h2></div>
          {data.subs.length === 0 ? (
            <p className="px-5 pb-5 pt-1 text-[15px] text-slate-500 dark:text-slate-400">{t('لم يؤدِّ أي اختبار بعد.')}</p>
          ) : (
            data.subs.slice(0, 12).map((s) => {
              const pending = ungradedEssayCount(s) > 0;
              const pct = Number(s.percentage) || 0;
              return (
                <button key={s.id} type="button" onClick={() => onViewReview(s.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-[15px] truncate ${s.quiz?.is_deleted ? 'line-through text-slate-500' : 'text-slate-900 dark:text-white'}`}>{s.quiz?.title || t('اختبار سابق')}</div>
                    <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{[s.subject?.name, pending ? t('بانتظار تصحيح المعلم') : timeAgo(s.completed_at)].filter(Boolean).join(' · ')}</div>
                  </div>
                  {pending ? <Chip tone="info">{t('قيد التصحيح')}</Chip> : (
                    <Chip tone={scoreTone(pct, (s.quiz as any)?.pass_percentage || 50)}><span className="tabular-nums" dir="ltr">{s.score}/{s.total_possible_score}</span></Chip>
                  )}
                </button>
              );
            })
          )}
        </Card>
      </div>

      <AttendanceSummary key={`att-${child.id}`} studentId={child.id} />
      <ConductSummary key={`cond-${child.id}`} studentId={child.id} />
      <SkillsCard studentId={child.id} quizzes={quizzes} submissions={submissions} title={t('مستوى {who} في المهارات', { who: word })} />
    </div>
  );
};
