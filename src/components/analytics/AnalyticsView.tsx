import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AnalyticsCharts } from './AnalyticsCharts';
import { SubmissionsTable } from './SubmissionsTable';
import { PdfExportButton } from './PdfExportButton';
import { exportElementToPdf } from '../../utils/exportPdf';
import { InsightsPanels } from '../staff/InsightsPanels';
import { StorageService } from '../../services/storage';
import { t } from '../../i18n';

const MONTHS = () => [t('يناير'),t('فبراير'),t('مارس'),t('أبريل'),t('مايو'),t('يونيو'),t('يوليو'),t('أغسطس'),t('سبتمبر'),t('أكتوبر'),t('نوفمبر'),t('ديسمبر')];

/** بيانات الرسوم لاختبار واحد بنفس شكل بيانات لوحة المؤشرات العامة */
function buildQuizChartData(
  subs: Array<{ percentage: number; completed_at: string }>,
  subject?: { id: string; name: string; color: string }
) {
  const bands = [
    { name: t('ممتاز (≥85%)'), shortName: t('ممتاز'), color: '#10b981', test: (p: number) => p >= 85 },
    { name: t('جيد جداً (75-84%)'), shortName: t('جيد جداً'), color: '#6366f1', test: (p: number) => p >= 75 && p < 85 },
    { name: t('جيد (65-74%)'), shortName: t('جيد'), color: '#0ea5e9', test: (p: number) => p >= 65 && p < 75 },
    { name: t('مقبول (50-64%)'), shortName: t('مقبول'), color: '#f59e0b', test: (p: number) => p >= 50 && p < 65 },
    { name: t('دون التمرير (<50%)'), shortName: t('راسب'), color: '#f43f5e', test: (p: number) => p < 50 },
  ];
  const scoreDistribution = bands.map((b) => ({
    name: b.name,
    shortName: b.shortName,
    color: b.color,
    count: subs.filter((s) => b.test(Number(s.percentage) || 0)).length,
  }));

  const completionTimeline: Array<{ dateKey: string; dateLabel: string; submissionsCount: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    completionTimeline.push({
      dateKey: key,
      dateLabel: `${d.getDate()} ${MONTHS()[d.getMonth()]}`,
      submissionsCount: subs.filter((s) => (s.completed_at || '').slice(0, 10) === key).length,
    });
  }

  const avg = subs.length > 0 ? Math.round(subs.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / subs.length) : 0;
  const subjectPerformance = subject
    ? [{ subjectId: subject.id, subjectName: subject.name, averageScore: avg, submissionsCount: subs.length, color: subject.color }]
    : [];
  return { scoreDistribution, completionTimeline, subjectPerformance };
}

export const AnalyticsView: React.FC = () => {
  const { currentUser, quizzes, submissions, kpis, subjects, users } = useApp();
  // المدير: مؤشرات المتابعة وأداء المعلمين (انتقلت من الرئيسية إلى هنا)
  const staffData = useMemo(
    () => (currentUser?.role === 'admin' ? StorageService.getStaffData(currentUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, quizzes, submissions, users]
  );
  const isStudent = currentUser?.role === 'student';
  const [quizId, setQuizId] = useState<string>('all');
  const exportRef = useRef<HTMLDivElement>(null);

  const visibleQuizzes = useMemo(() => (quizzes || []).filter((q) => q && !q.is_deleted), [quizzes]);
  const selectedQuiz = quizId === 'all' ? null : visibleQuizzes.find((q) => q.id === quizId) || null;

  const filteredSubs = useMemo(
    () => (selectedQuiz ? (submissions || []).filter((s) => s.quiz_id === selectedQuiz.id) : submissions || []),
    [selectedQuiz, submissions]
  );

  const chartData = useMemo(() => {
    if (selectedQuiz) {
      const subj = subjects.find((s) => s.id === selectedQuiz.subject_id);
      return buildQuizChartData(filteredSubs, subj ? { id: subj.id, name: subj.name, color: subj.color } : undefined);
    }
    if (currentUser?.role === 'supervisor') {
      // المشرف: كل الرسوم تُحسب من بيانات نطاقه فقط
      const base = buildQuizChartData(filteredSubs, undefined);
      const bySubject = new Map<string, { name: string; color: string; vals: number[] }>();
      filteredSubs.forEach((x) => {
        if (!x.subject) return;
        const e = bySubject.get(x.subject.id) || { name: x.subject.name, color: x.subject.color, vals: [] };
        e.vals.push(Number(x.percentage) || 0);
        bySubject.set(x.subject.id, e);
      });
      return {
        ...base,
        subjectPerformance: Array.from(bySubject.entries()).map(([id, e]) => ({
          subjectId: id,
          subjectName: e.name,
          averageScore: Math.round(e.vals.reduce((a, b) => a + b, 0) / e.vals.length),
          submissionsCount: e.vals.length,
          color: e.color,
        })),
      };
    }
    return {
      scoreDistribution: kpis?.scoreDistribution || [],
      completionTimeline: kpis?.completionTimeline || [],
      subjectPerformance: kpis?.subjectPerformance || [],
    };
  }, [selectedQuiz, filteredSubs, kpis, subjects, currentUser?.role]);

  const total = filteredSubs.length;
  const avg = total > 0 ? Math.round(filteredSubs.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / total) : 0;
  const passMark = selectedQuiz?.pass_percentage || 50;
  const passed = filteredSubs.filter((s) => (Number(s.percentage) || 0) >= passMark).length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    const rows = filteredSubs.slice(0, 500).map((s, i) => [
      i + 1,
      s.student?.name || '—',
      s.student_class?.name || '—',
      s.quiz?.title || '—',
      `${s.score}/${s.total_possible_score}`,
      `${Number(s.percentage) || 0}%`,
    ]);
    try {
      await exportElementToPdf({
        element: exportRef.current,
        title: selectedQuiz ? t('تحليلات اختبار: {title}', { title: selectedQuiz.title }) : t('التحليلات الشاملة لجميع الاختبارات'),
        subtitle: t('{total} تسليم • المتوسط {avg}% • نسبة النجاح {pass}%', { total, avg, pass: passRate }),
        table: { headers: ['#', t('الطالب'), t('الصف'), t('الاختبار'), t('الدرجة'), t('النسبة')], rows },
        tableTitle: t('نتائج الطلاب'),
      });
    } catch (e: any) {
      alert(e?.message || t('تعذر تصدير PDF'));
    }
  };

  if (isStudent) return <SubmissionsTable submissions={submissions} />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('عرض تحليلات:')}</label>
        <select
          aria-label={t('اختيار الاختبار')}
          value={selectedQuiz ? quizId : 'all'}
          onChange={(e) => setQuizId(e.target.value)}
          className="min-w-[16rem] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">{t('كل الاختبارات')}</option>
          {visibleQuizzes.map((q) => (
            <option key={q.id} value={q.id}>{q.title}</option>
          ))}
        </select>
      </div>

      <div ref={exportRef} className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-black text-sm text-slate-900 dark:text-white">
            {selectedQuiz ? selectedQuiz.title : t('جميع الاختبارات')}
          </span>
          <span>{t('عدد التسليمات:')}{' '}<b>{total}</b></span>
          <span>{t('المتوسط:')}{' '}<b>{avg}%</b></span>
          <span>{t('نسبة النجاح:')}{' '}<b>{passRate}%</b></span>
        </div>
        <AnalyticsCharts
          scoreDistribution={chartData.scoreDistribution}
          completionTimeline={chartData.completionTimeline}
          subjectPerformance={chartData.subjectPerformance}
        />
      </div>

      {staffData && !selectedQuiz && (
        <InsightsPanels
          mode="extra"
          students={staffData.students}
          teachers={staffData.teachers}
          quizzes={staffData.quizzes}
          submissions={staffData.submissions}
          showTeacherPerformance
        />
      )}

      <SubmissionsTable
        submissions={filteredSubs}
        extraActions={<PdfExportButton onClick={handleExportPdf} />}
      />
    </div>
  );
};
