import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { KPICard } from '../common/KPICard';
import { AnalyticsCharts } from '../analytics/AnalyticsCharts';
import { SubmissionsTable } from '../analytics/SubmissionsTable';
import { ReassignQuizModal } from '../common/ReassignQuizModal';
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
} from 'lucide-react';
import { describeQuizTarget } from '../../utils/quizTarget';

export const TeacherDashboard: React.FC = () => {
  const {
    currentUser,
    quizzes,
    submissions,
    subjects,
    kpis,
    classes,
    setCurrentView,
    setEditingQuizId,
    setDuplicateQuizId,
  } = useApp();

  const [selectedQuizForReassign, setSelectedQuizForReassign] = useState<Quiz | null>(null);

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
    <div className="space-y-8" dir="rtl">
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
          icon={FileText}
          colorScheme="indigo"
        />
        <KPICard
          title="الاختبارات النشطة"
          value={activeQuizzes}
          icon={Clock}
          colorScheme="emerald"
        />
        <KPICard
          title="إجمالي التسليمات"
          value={totalSubmissions}
          icon={Users}
          colorScheme="purple"
        />
        <KPICard
          title="متوسط الدرجات"
          value={`${avgScore}%`}
          icon={CheckCircle}
          colorScheme="amber"
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
                    onClick={() => handleDuplicateQuiz(quiz.id)}
                    title="نسخ هذا الاختبار وتعديله كاختبار جديد"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>تكرار مع التعديل</span>
                  </button>

                  <button
                    onClick={() => setSelectedQuizForReassign(quiz)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة تعيين</span>
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

      {/* النافذة المنبثقة لإعادة التعيين */}
      {selectedQuizForReassign && (
        <ReassignQuizModal
          quiz={selectedQuizForReassign}
          onClose={() => setSelectedQuizForReassign(null)}
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
