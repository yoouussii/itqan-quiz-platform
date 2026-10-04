import React, { useMemo, useState } from 'react';
import { PlusCircle, ClipboardCheck, PenLine, AlertTriangle, CheckCircle2, Star, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { KpiDetailModal } from '../common/KpiDetailModal';
import {
  KpiSection, studentsSection, quizzesSection, perQuizSection, perSubjectSection,
  activeStudentsSection, inactiveStudentsSection,
} from '../../utils/kpiSections';
import { getWindowState, parseWindowEnd } from '../../utils/quizWindow';
import { ungradedSummary } from '../../utils/grading';
import { hasPerm } from '../../utils/permissions';
import { Avatar } from '../common/Avatar';
import { Button, Card, Chip, PageHeader, SectionTitle, StatTile, greeting, scoreTone, timeAgo, todayLabel } from '../common/ui';
import { uiDir, t, isEn } from '../../i18n';

const avgOf = (vals: number[]) => (vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0);

/** الرئيسية للمدير: مؤشرات مختصرة + «يحتاج انتباهك» + أداء الفصول + آخر التسليمات + الأوائل.
 *  الجداول الكاملة في صفحاتها: بنك الاختبارات، والنتائج والتحليلات. */
export const AdminDashboard: React.FC = () => {
  const {
    currentUser, quizzes = [], submissions = [], kpis, setCurrentView, users = [], classes = [], subjects = [],
    pendingApprovalsCount, setEditingQuizId, setDuplicateQuizId,
  } = useApp();
  const [kpiModal, setKpiModal] = useState<'students' | 'quizzes' | 'avg' | 'active' | 'struggling' | null>(null);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const liveQuizzes = useMemo(() => quizzes.filter((q) => q && !q.is_deleted), [quizzes]);
  const openNow = useMemo(
    () => liveQuizzes.filter((q) => q.status === 'published' && getWindowState(q.start_date, q.end_date) === 'open'),
    [liveQuizzes]
  );
  const endingToday = openNow.filter((q) => {
    const e = parseWindowEnd(q.end_date);
    return e && e.toDateString() === new Date().toDateString();
  }).length;

  const perStudent = useMemo(() => {
    const m = new Map<string, number[]>();
    submissions.forEach((s) => m.set(s.student_id, [...(m.get(s.student_id) || []), Number(s.percentage) || 0]));
    return m;
  }, [submissions]);
  const struggling = useMemo(() => students.filter((st) => { const v = perStudent.get(st.id); return v && avgOf(v) < 50; }), [students, perStudent]);
  const topStudents = useMemo(
    () => students
      .map((st) => ({ st, v: perStudent.get(st.id) || [] }))
      .filter((x) => x.v.length > 0)
      .map((x) => ({ st: x.st, avg: avgOf(x.v) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5),
    [students, perStudent]
  );
  const classPerf = useMemo(() => {
    const byClass = new Map<string, number[]>();
    submissions.forEach((s) => {
      const cid = students.find((u) => u.id === s.student_id)?.class_id;
      if (cid) byClass.set(cid, [...(byClass.get(cid) || []), Number(s.percentage) || 0]);
    });
    return classes
      .map((c) => ({ c, avg: avgOf(byClass.get(c.id) || []), n: (byClass.get(c.id) || []).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 6);
  }, [submissions, students, classes]);
  const recent = useMemo(
    () => [...submissions].sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).slice(0, 5),
    [submissions]
  );
  const grading = useMemo(() => ungradedSummary(submissions), [submissions]);

  const totalStudents = kpis?.totalStudents ?? students.length;
  const activeStudents = kpis?.activeStudents ?? 0;
  const firstName = (currentUser?.name || '').replace(/^(د\.|أ\.|م\.)\s*/, '').split(' ')[0];

  const attention: Array<{ key: string; icon: React.ElementType; tone: string; title: string; desc: string; action: string; go: () => void }> = [];
  if (pendingApprovalsCount > 0) {
    attention.push({
      key: 'approvals', icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
      title: isEn() ? `${pendingApprovalsCount} ${pendingApprovalsCount === 1 ? 'quiz' : 'quizzes'} awaiting your approval` : `${pendingApprovalsCount} ${pendingApprovalsCount === 1 ? 'اختبار' : 'اختبارات'} بانتظار اعتمادك`,
      desc: liveQuizzes.filter((q) => q.status === 'pending_approval').slice(0, 2).map((q) => `«${q.title}»`).join(isEn() ? ' and ' : ' و') || t('راجعها قبل نشرها للطلاب'),
      action: t('مراجعة'), go: () => setCurrentView('approvals'),
    });
  }
  if (grading.essays > 0) {
    attention.push({
      key: 'grading', icon: PenLine, tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
      title: t('{n} إجابة مقالية لم تُصحَّح', { n: grading.essays }),
      desc: isEn() ? `In ${grading.quizzes} ${grading.quizzes === 1 ? 'quiz' : 'quizzes'}; students do not see their final score until marked` : `في ${grading.quizzes} ${grading.quizzes === 1 ? 'اختبار' : 'اختبارات'}، والطالب لا يرى درجته النهائية قبل التصحيح`,
      action: t('تصحيح'), go: () => setCurrentView('grading'),
    });
  }
  if (struggling.length > 0) {
    attention.push({
      key: 'struggling', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
      title: isEn() ? `${struggling.length} ${struggling.length === 1 ? 'student averages' : 'students average'} below 50%` : `${struggling.length} ${struggling.length === 1 ? 'طالب متوسطه' : 'طلاب متوسطهم'} أقل من 50%`,
      desc: t('يحتاجون متابعة من معلميهم'),
      action: t('عرض'), go: () => setKpiModal('struggling'),
    });
  }

  const modal = ((): { title: string; subtitle?: string; sections: KpiSection[] } | null => {
    switch (kpiModal) {
      case 'students': return { title: t('الطلاب'), sections: [studentsSection(t('قائمة الطلاب (حسب الصف)'), students, submissions, classes)] };
      case 'quizzes': return { title: t('الاختبارات'), sections: [quizzesSection(t('قائمة الاختبارات'), liveQuizzes as any, submissions, subjects, users, classes)] };
      case 'avg': return {
        title: t('متوسط النتائج'), subtitle: t('المتوسط {avg}% • نسبة النجاح {pass}%', { avg: kpis?.averageScore ?? 0, pass: kpis?.passRate ?? 0 }),
        sections: [perQuizSection(t('حسب الاختبار'), liveQuizzes as any, submissions), perSubjectSection(t('حسب المادة'), liveQuizzes as any, submissions, subjects)],
      };
      case 'active': return {
        title: t('نشاط الطلاب (آخر 7 أيام)'),
        sections: [activeStudentsSection(t('الطلاب النشطون'), students, submissions, classes), inactiveStudentsSection(t('لم يؤدوا اختباراً خلال هذه الفترة'), students, submissions, classes)],
      };
      case 'struggling': return { title: t('طلاب يحتاجون متابعة'), subtitle: t('متوسطهم أقل من 50%'), sections: [studentsSection(t('الطلاب'), struggling, submissions, classes)] };
      default: return null;
    }
  })();

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir={uiDir()}>
      <PageHeader
        eyebrow={todayLabel()}
        title={`${greeting()}${isEn() ? ', ' : '، '}${firstName || t('مدير النظام')}`}
        actions={
          <>
            <Button variant="secondary" icon={UserPlus} onClick={() => setCurrentView('users')}>{t('إضافة مستخدم')}</Button>
            <Button icon={PlusCircle} onClick={() => { setEditingQuizId?.(null); setDuplicateQuizId?.(null); setCurrentView('create_quiz'); }}>{t('اختبار جديد')}</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label={t('الطلاب')} value={totalStudents} hint={isEn() ? `In ${classes.length} ${classes.length === 1 ? 'class' : 'classes'}` : `في ${classes.length} ${classes.length === 1 ? 'فصل' : 'فصول'}`} onClick={() => setKpiModal('students')} />
        <StatTile label={t('اختبارات متاحة الآن')} value={openNow.length} hint={endingToday > 0 ? t('{n} تنتهي اليوم', { n: endingToday }) : t('من {n} اختباراً', { n: liveQuizzes.length })} hintTone={endingToday > 0 ? 'bad' : 'muted'} onClick={() => setKpiModal('quizzes')} />
        <StatTile label={t('متوسط النتائج')} value={`${kpis?.averageScore ?? 0}%`} hint={t('نسبة النجاح {pass}%', { pass: kpis?.passRate ?? 0 })} onClick={() => setKpiModal('avg')} />
        <StatTile label={t('الطلاب النشطون (7 أيام)')} value={activeStudents} progress={totalStudents ? (activeStudents / totalStudents) * 100 : 0} onClick={() => setKpiModal('active')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-5 sm:p-6">
          <SectionTitle action={attention.length > 0 && <Chip tone="warn">{attention.length} {attention.length === 1 ? t('مهمة') : t('مهام')}</Chip>}>{t('يحتاج انتباهك')}</SectionTitle>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 py-8 justify-center text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
              <span className="font-semibold">{t('لا توجد مهام معلّقة. كل شيء على ما يرام.')}</span>
            </div>
          ) : (
            attention.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.key} className="flex items-center gap-3.5 py-3.5 border-t border-slate-100 dark:border-slate-800 first-of-type:border-t-0">
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${a.tone}`}><Icon className="w-5 h-5" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] text-slate-900 dark:text-white">{a.title}</div>
                    <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{a.desc}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={a.go}>{a.action}</Button>
                </div>
              );
            })
          )}
        </Card>

        <Card className="lg:col-span-2 p-5 sm:p-6 flex flex-col gap-4">
          <SectionTitle>{t('أداء الفصول')}</SectionTitle>
          {classPerf.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">{t('لا توجد نتائج بعد')}</p>}
          {classPerf.map(({ c, avg }) => (
            <div key={c.id}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</span>
                <span className={`tabular-nums ${avg < 50 ? 'text-rose-700 dark:text-rose-400 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>{avg}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-2 rounded-full ${avg < 50 ? 'bg-amber-500' : 'bg-indigo-600'}`} style={{ width: `${avg}%` }} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setCurrentView('analytics')} className="mt-auto text-sm font-semibold text-indigo-700 dark:text-indigo-400 text-start hover:underline">
            {t('كل الفصول والتحليلات ←')}
          </button>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-5 sm:p-6">
          <SectionTitle action={<button type="button" onClick={() => setCurrentView('analytics')} className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 hover:underline">{t('عرض الكل')}</button>}>
            {t('آخر التسليمات')}
          </SectionTitle>
          {recent.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">{t('لا توجد تسليمات بعد')}</p>}
          {recent.map((s) => {
            const st = users.find((u) => u.id === s.student_id);
            const q = quizzes.find((x) => x.id === s.quiz_id);
            return (
              <div key={s.id} className="flex items-center gap-3 py-3 border-t border-slate-100 dark:border-slate-800 first-of-type:border-t-0">
                <Avatar name={st?.name || t('طالب')} role="student" userId={st?.id} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] text-slate-900 dark:text-white truncate">{st?.name || t('طالب')}</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{q?.title || t('اختبار')} · {timeAgo(s.completed_at)}</div>
                </div>
                <Chip tone={scoreTone(Number(s.percentage) || 0, q?.pass_percentage)}>
                  <span className="tabular-nums" dir="ltr">{s.score}/{s.total_possible_score}</span>
                </Chip>
              </div>
            );
          })}
        </Card>

        <Card className="lg:col-span-2 p-5 sm:p-6">
          <SectionTitle action={<Star className="w-5 h-5 fill-amber-400 text-amber-400" />}>{t('الأوائل')}</SectionTitle>
          {topStudents.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">{t('لا توجد نتائج بعد')}</p>}
          {topStudents.map(({ st, avg }, i) => (
            <div key={st.id} className="flex items-center gap-3 py-3 border-t border-slate-100 dark:border-slate-800 first-of-type:border-t-0">
              <span className={`w-6 font-bold tabular-nums ${i === 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}>{i + 1}</span>
              <span className="flex-1 font-semibold text-[15px] text-slate-900 dark:text-white truncate">{st.name}</span>
              <span className="font-bold tabular-nums text-slate-900 dark:text-white">{avg}%</span>
            </div>
          ))}
          {hasPerm(currentUser, 'can_view_leaderboard') && topStudents.length > 0 && (
            <button type="button" onClick={() => setCurrentView('leaderboard')} className="mt-3 text-sm font-semibold text-indigo-700 dark:text-indigo-400 hover:underline">
              {t('لوحة الشرف كاملة ←')}
            </button>
          )}
        </Card>
      </div>

      {modal && <KpiDetailModal title={modal.title} subtitle={modal.subtitle} sections={modal.sections} onClose={() => setKpiModal(null)} />}
    </div>
  );
};

