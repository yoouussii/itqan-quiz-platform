import React, { useEffect, useMemo, useState } from 'react';
import { X, FileText, MessageCircle, BarChart2, CalendarCheck, NotebookPen, Target, LayoutGrid } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { Chip, scoreTone } from './ui';
import { AttendanceSummary } from './AttendanceSummary';
import { ConductSummary } from './ConductSummary';
import { StudentGradebook } from './StudentGradebook';
import { RemedialCard } from './RemedialCard';
import { HomeworkCard } from './Homework';
import { GoalsCard } from './Goals';
import { EmptyMascot } from './Mascot';
import { exportStudentReport, reportExtras } from '../../utils/studentReport';
import { bestPerQuiz, computePointEvents, earnedBadges, levelFor, totalPoints } from '../../utils/points';
import { guardianPhone, waLink } from '../../utils/whatsapp';
import { navigateTo, pathFor } from '../../utils/router';
import { formatFullArabicDate } from '../../utils/dateUtils';
import { uiDir, t } from '../../i18n';
import { User } from '../../types';

/** فتح ملف الطالب الشامل من أي مكان في المنصة */
export const STUDENT_EVENT = 'itqan:student';
export const openStudentProfile = (id: string) => window.dispatchEvent(new CustomEvent(STUDENT_EVENT, { detail: { id } }));

/** اسم طالب قابل للضغط يفتح ملفه */
export const StudentLink: React.FC<{ id: string; name: string; className?: string }> = ({ id, name, className = '' }) => (
  <button type="button" onClick={(e) => { e.stopPropagation(); openStudentProfile(id); }} title={t('فتح ملف الطالب')}
    className={`text-start hover:underline decoration-indigo-400 underline-offset-4 ${className}`}>{name}</button>
);

type Tab = 'overview' | 'results' | 'attendance' | 'homework' | 'plans';

const Body: React.FC<{ student: User; onClose: () => void }> = ({ student, onClose }) => {
  const { users, classes, subjects, quizzes, submissions, awards, currentUser } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const cls = classes.find((c) => c.id === student.class_id);
  const parent = (users as User[]).find((u) => u.role === 'parent' && (u.child_ids || []).includes(student.id));
  const phone = guardianPhone(student, users as User[]);
  const subs = useMemo(() => (submissions || []).filter((s) => s.student_id === student.id && !s.quiz?.is_deleted)
    .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))), [submissions, student.id]);
  const best = useMemo(() => bestPerQuiz(subs), [subs]);
  const avg = best.length ? Math.round(best.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / best.length) : null;
  const myAwards = (awards || []).filter((a) => a.student_id === student.id);
  const points = totalPoints(computePointEvents(subs, quizzes as any, myAwards));
  const lvl = levelFor(points);
  const subjName = (id?: string | null) => subjects.find((s) => s.id === id)?.name || '';

  const report = () => exportStudentReport({
    name: student.name, nationalId: student.national_id, className: cls?.name,
    results: subs.map((x) => ({ quiz: x.quiz?.title || '—', subject: x.subject?.name || subjName(x.quiz?.subject_id) || '—', score: `${x.score}/${x.total_possible_score}`, pct: Number(x.percentage) || 0, date: formatFullArabicDate(x.completed_at) })),
    points, badgeKeys: earnedBadges(subs, quizzes as any), awards: myAwards,
    ...reportExtras(student.id, quizzes, submissions, subjName),
  });

  const TABS: Array<[Tab, string, React.ElementType]> = [
    ['overview', t('نظرة عامة'), LayoutGrid], ['results', t('النتائج'), BarChart2], ['attendance', t('الحضور والسلوك'), CalendarCheck],
    ['homework', t('الواجبات'), NotebookPen], ['plans', t('الخطط والأهداف'), Target],
  ];
  const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = '' }) => (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-xl font-black tabular-nums mt-0.5 ${tone || 'text-slate-900 dark:text-white'}`}>{value}</p>
    </div>
  );

  return (
    <div className="flex flex-col max-h-[92vh]">
      <div className="shrink-0 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
        <Avatar name={student.name} role="student" userId={student.id} size="md" />
        <div className="flex-1 min-w-[12rem]">
          <h2 className="text-lg font-black text-slate-900 dark:text-white" data-testid="sp-name">{student.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{[cls?.name, parent ? t('ولي الأمر: {n}', { n: parent.name }) : '', student.national_id].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2">
          {phone && (
            <a href={waLink(phone, t('السلام عليكم، بخصوص الطالب {n}', { n: student.name }))} target="_blank" rel="noopener noreferrer"
              className="h-10 px-3 rounded-xl text-sm font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5"><MessageCircle className="w-4 h-4" />{t('واتساب ولي الأمر')}</a>
          )}
          <button type="button" onClick={() => void report()} className="h-10 px-3 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"><FileText className="w-4 h-4" />{t('تقرير')}</button>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-10 h-10 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="shrink-0 px-4 sm:px-5 pt-3 pb-1 flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`sp-tab-${k}`}
            className={`h-9 px-3 rounded-xl text-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5 ${tab === k ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label={t('متوسط الاختبارات')} value={avg === null ? '—' : `${avg}%`} tone={avg === null ? '' : avg >= 75 ? 'text-emerald-600 dark:text-emerald-400' : avg >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'} />
              <Stat label={t('اختبارات أداها')} value={best.length} />
              <Stat label={t('النقاط')} value={points} />
              <Stat label={t("المستوى")} value={`${lvl.level.emoji} ${t(lvl.level.name)}`} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <AttendanceSummary studentId={student.id} />
              <ConductSummary studentId={student.id} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">{t('آخر النتائج')}</h3>
              {subs.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                  {subs.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="flex-1 min-w-0"><span className="block font-semibold text-slate-900 dark:text-white truncate">{s.quiz?.title || '—'}</span><span className="text-xs text-slate-500">{formatFullArabicDate(s.completed_at)}</span></span>
                      <Chip tone={scoreTone(Number(s.percentage) || 0)}>{Math.round(Number(s.percentage) || 0)}%</Chip>
                    </li>
                  ))}
                </ul>
              ) : <EmptyMascot compact text={t('لم يؤدِّ اختبارات بعد')} />}
            </div>
          </>
        )}
        {tab === 'results' && (
          <>
            <StudentGradebook student={student} />
            {subs.length > 0 && (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                {subs.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => { onClose(); navigateTo(pathFor({ view: 'quiz_review', submissionId: s.id })); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="flex-1 min-w-0"><span className="block font-semibold text-slate-900 dark:text-white truncate">{s.quiz?.title || '—'}</span><span className="text-xs text-slate-500">{[s.subject?.name || subjName(s.quiz?.subject_id), formatFullArabicDate(s.completed_at)].filter(Boolean).join(' · ')}</span></span>
                      <span className="text-xs text-slate-500 tabular-nums">{s.score}/{s.total_possible_score}</span>
                      <Chip tone={scoreTone(Number(s.percentage) || 0)}>{Math.round(Number(s.percentage) || 0)}%</Chip>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === 'attendance' && (
          <div className="grid md:grid-cols-2 gap-4">
            <AttendanceSummary studentId={student.id} />
            <ConductSummary studentId={student.id} />
          </div>
        )}
        {tab === 'homework' && <HomeworkCard student={student} />}
        {tab === 'plans' && (
          <div className="space-y-4">
            <RemedialCard studentId={student.id} />
            <GoalsCard studentId={student.id} />
            {currentUser?.role !== 'student' && <p className="text-xs text-slate-500">{t('تظهر هنا الخطط العلاجية وأهداف الطالب الشخصية إن وُجدت.')}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

/** نافذة ملف الطالب: تُفتح بحدث عام، للطاقم فقط */
export const StudentProfileHost: React.FC = () => {
  const { users, currentUser } = useApp();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setId((e as CustomEvent).detail?.id || null);
    window.addEventListener(STUDENT_EVENT, on);
    return () => window.removeEventListener(STUDENT_EVENT, on);
  }, []);
  useEffect(() => {
    if (!id) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setId(null);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [id]);
  if (!id || !currentUser || currentUser.role === 'student' || currentUser.role === 'parent') return null;
  const student = (users as User[]).find((u) => u.id === id);
  if (!student) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/50 sm:p-4" role="dialog" aria-modal="true" aria-label={t('ملف الطالب')} onClick={() => setId(null)} data-testid="student-profile">
      <div className="w-full sm:max-w-4xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" dir={uiDir()} onClick={(e) => e.stopPropagation()}>
        <Body student={student} onClose={() => setId(null)} />
      </div>
    </div>
  );
};
