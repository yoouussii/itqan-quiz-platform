import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { KPICard } from '../common/KPICard';
import { AnalyticsCharts } from '../analytics/AnalyticsCharts';
import { SubmissionsTable } from '../analytics/SubmissionsTable';
import { Quiz, Submission, Subject } from '../../types';
import {
  FileText,
  Users,
  CheckCircle,
  Clock,
  Plus,
  BarChart2,
  Edit,
  RotateCcw,
  BookOpen,
  Copy,
  Trash2,
  ClipboardList,
} from 'lucide-react';
import { KpiDetailModal } from '../common/KpiDetailModal';
import { StorageService } from '../../services/storage';
import { InsightsPanels } from '../staff/InsightsPanels';
import { hasPerm } from '../../utils/permissions';
import { KpiSection, quizzesSection, perQuizSection, submissionsSection } from '../../utils/kpiSections';
import { formatQuizDateTime, getWindowState } from '../../utils/quizWindow';
import { describeQuizTarget } from '../../utils/quizTarget';

export const TeacherDashboard: React.FC = () => {
  const {
    currentUser,
    quizzes,
    submissions,
    subjects,
    kpis,
    classes,
    users,
    setCurrentView,
    setEditingQuizId,
    setDuplicateQuizId,
    deleteQuizItem,
    setActiveQuizId,
  } = useApp();


  const staffData = React.useMemo(
    () => (currentUser ? StorageService.getStaffData(currentUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, quizzes, submissions, users]
  );
  const [kpiModal, setKpiModal] = useState<'quizzes' | 'active' | 'subs' | 'avg' | null>(null);

  // تصفية الاختبارات الخاصة بالمعلم
  const teacherQuizzes =
    currentUser?.role === 'admin'
      ? quizzes
      : quizzes.filter((q: Quiz) => q.teacher_id === currentUser?.id);

  const teacherQuizIds = teacherQuizzes.map((q: Quiz) => q.id);
  const teacherSubmissions = submissions.filter((s: Submission) =>
    teacherQuizIds.includes(s.quiz_id)
  );

  // المؤشرات الرئيسية (KPIs)
  const totalQuizzes = teacherQuizzes.length;
  const activeQuizzes = teacherQuizzes.filter((q: Quiz) => q.is_active).length;
  const totalSubmissions = teacherSubmissions.length;
  const avgScore =
    teacherSubmissions.length > 0
      ? Math.round(
          teacherSubmissions.reduce((acc: number, item: Submission) => acc + (item.score || 0), 0) /
            teacherSubmissions.length
        )
      : 0;

  const handleDeleteQuiz = async (quiz: Quiz) => {
    if (
      window.confirm(
        `هل أنت متأكد من حذف الاختبار "${quiz.title}"؟\nسيختفي من قوائم الطلاب، وتبقى درجات الطلاب السابقة محفوظة ومستبعدة من المعدل.`
      )
    ) {
      await deleteQuizItem(quiz.id);
    }
  };

  const handleDuplicateQuiz = (quizId: string) => {
    setEditingQuizId(null);
    setDuplicateQuizId(quizId);
    setCurrentView('create_quiz');
  };

  const handleEditQuiz = (quizId: string) => {
    setEditingQuizId(quizId);
    setCurrentView('create_quiz');
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir="rtl">
      {/* الترويسة */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
            مرحباً، {currentUser?.name || 'المعلم'} 👋
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            لوحة تحكم المعلم - متابعة الاختبارات، التقييمات، وتحليلات أداء الطلاب
          </p>
        </div>

        <button
          onClick={() => {
            setEditingQuizId(null);
            setCurrentView('create_quiz');
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء اختبار جديد</span>
        </button>
      </div>

      {/* بطاقات المؤشرات (بدون خاصية color غير المعرفة) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="إجمالي الاختبارات"
          value={totalQuizzes}
          icon={ClipboardList}
          colorScheme="indigo"
          onClick={() => setKpiModal('quizzes')}
        />
        <KPICard
          title="الاختبارات النشطة"
          value={activeQuizzes}
          icon={Clock}
          colorScheme="emerald"
          onClick={() => setKpiModal('active')}
        />
        <KPICard
          title="إجمالي التسليمات"
          value={totalSubmissions}
          icon={Users}
          colorScheme="purple"
          onClick={() => setKpiModal('subs')}
        />
        <KPICard
          title="متوسط الدرجات"
          value={`${avgScore}%`}
          icon={CheckCircle}
          colorScheme="amber"
          onClick={() => setKpiModal('avg')}
        />
      </div>

      {/* قسم التحليلات البيانية */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
        <div className="flex items-center gap-2 mb-6">
          <BarChart2 className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-base text-slate-900 dark:text-white">
            تحليلات الأداء العام
          </h2>
        </div>
        <AnalyticsCharts
          scoreDistribution={kpis?.scoreDistribution || []}
          completionTimeline={kpis?.completionTimeline || []}
          subjectPerformance={kpis?.subjectPerformance || []}
        />
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

      {/* قائمة الاختبارات */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            إدارة الاختبارات الحالية ({teacherQuizzes.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teacherQuizzes.map((quiz: Quiz) => {
            const subject = subjects.find((s: Subject) => s.id === quiz.subject_id);
            const quizSubs = teacherSubmissions.filter((s: Submission) => s.quiz_id === quiz.id);

            return (
              <div
                key={quiz.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block px-2.5 py-1 text-[10px] font-bold rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 mb-2">
                      {subject?.name || 'مادة عامة'}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                      {quiz.title}
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      quiz.is_active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {quiz.is_active ? 'نشط' : 'موقف'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="font-bold shrink-0">الفئة المستهدفة:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {describeQuizTarget((quiz as any).assignments, classes)}
                  </span>
                </div>

                {quiz.status === 'pending_approval' && (
                  <div className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    🕓 بانتظار اعتماد المسؤول — لن يظهر للطلاب قبل الموافقة
                  </div>
                )}
                {quiz.status === 'rejected' && (
                  <div className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    ❌ مرفوض{quiz.review_note ? `: ${quiz.review_note}` : ''} — عدّله لإعادة الإرسال
                  </div>
                )}

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-start gap-x-1.5 gap-y-1">
                  <span className="font-bold shrink-0">فترة الإتاحة:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    من {formatQuizDateTime(quiz.start_date, 'start')} إلى {formatQuizDateTime(quiz.end_date, 'end')}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                      getWindowState(quiz.start_date, quiz.end_date) === 'open'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : getWindowState(quiz.start_date, quiz.end_date) === 'upcoming'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {getWindowState(quiz.start_date, quiz.end_date) === 'open'
                      ? 'جارية الآن'
                      : getWindowState(quiz.start_date, quiz.end_date) === 'upcoming'
                      ? 'لم تبدأ بعد'
                      : 'انتهت'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div>الدرجة: <span className="font-bold text-slate-700 dark:text-slate-200">{quiz.total_marks}</span></div>
                  <div>المدة: <span className="font-bold text-slate-700 dark:text-slate-200">{quiz.duration_minutes} دقيقة</span></div>
                  <div>التسليمات: <span className="font-bold text-slate-700 dark:text-slate-200">{quizSubs.length}</span></div>
                  <div>النجاح: <span className="font-bold text-slate-700 dark:text-slate-200">{quiz.pass_percentage}%</span></div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    onClick={() => handleEditQuiz(quiz.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>

                  <button
                    onClick={() => { setActiveQuizId(quiz.id); setCurrentView('quiz_results'); }}
                    title="نتائج الاختبار وتحليله"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>النتائج</span>
                  </button>

                  <button
                    onClick={() => handleDuplicateQuiz(quiz.id)}
                    title="نسخ هذا الاختبار وتعديله كاختبار جديد"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>تكرار مع التعديل</span>
                  </button>

                  <button
                    onClick={() => handleDeleteQuiz(quiz)}
                    title="حذف الاختبار"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* جدول التسليمات */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
        <h2 className="font-bold text-base text-slate-900 dark:text-white mb-4">
          سجل إجابات وتسليمات الطلاب
        </h2>
        <SubmissionsTable submissions={teacherSubmissions} />
      </div>


      {kpiModal && (() => {
        const tq = teacherQuizzes as any[];
        const ts = teacherSubmissions as any[];
        const sections: KpiSection[] =
          kpiModal === 'quizzes'
            ? [quizzesSection('اختباراتي', tq, ts, subjects, users, classes)]
            : kpiModal === 'active'
            ? [quizzesSection('الاختبارات النشطة', tq.filter((q) => q.is_active && getWindowState(q.start_date, q.end_date) !== 'ended'), ts, subjects, users, classes)]
            : kpiModal === 'subs'
            ? [submissionsSection('تسليمات الطلاب', ts)]
            : [perQuizSection('متوسط الدرجات حسب الاختبار', tq, ts)];
        const titles = { quizzes: 'إجمالي اختباراتي', active: 'الاختبارات النشطة', subs: 'إجمالي التسليمات', avg: 'متوسط الدرجات' } as const;
        return <KpiDetailModal title={titles[kpiModal]} sections={sections} onClose={() => setKpiModal(null)} />;
      })()}
    </div>
  );
};

export default TeacherDashboard;
