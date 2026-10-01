import React, { useState } from 'react';
import {
  Users,
  FileQuestion,
  Award,
  TrendingUp,
  ShieldCheck,
  ArrowRightLeft,
  PlusCircle,
  BookOpen,
  Calendar,
  Layers,
  Sparkles,
  Eye,
  Edit3,
  BarChart2,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { KPICard } from '../common/KPICard';
import { AnalyticsCharts } from '../analytics/AnalyticsCharts';
import { SubmissionsTable } from '../analytics/SubmissionsTable';
import { ReassignQuizModal } from '../common/ReassignQuizModal';
import { QuizWithDetails } from '../../types';
import { Avatar } from '../common/Avatar';

export const AdminDashboard: React.FC = () => {
  const {
    currentUser,
    quizzes,
    submissions,
    kpis,
    setCurrentView,
    users,
    deleteQuizItem,
    setActiveQuizId,
    setEditingQuizId,
  } = useApp();

  const [selectedQuizForReassign, setSelectedQuizForReassign] = useState<QuizWithDetails | null>(
    null
  );

  const handleDeleteQuiz = async (quizId: string, title: string) => {
    if (
      window.confirm(
        `هل أنت تأكد من حذف اختبار "${title}"؟ سيمسح ذلك جميع نتائج الطلاب المتعلقة به.`
      )
    ) {
      await deleteQuizItem(quizId);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir="rtl">
      {/* Super Admin Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-primary-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser?.name || ''} role={currentUser?.role} size="xl" showBadge />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30 font-bold text-indigo-300">
                  منصة إتقان | Super Admin
                </span>
                <span className="text-xs text-slate-300 font-medium">إشراف أكاديمي وإداري شامل</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-cairo">
                لوحة القيادة والمؤشرات العامة | {currentUser?.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                إشراف كامل على أداء المدرسة، كفاءة المعلمين، إحصائيات التقييمات، وإعادة تعيين ملكية
                الاختبارات بين أعضاء الهيئة التعليمية.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setCurrentView('subjects_classes')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold backdrop-blur-sm border border-white/20 transition-all"
            >
              <Layers className="w-4 h-4 text-indigo-300" />
              <span>المواد والشعب</span>
            </button>
            <button
              onClick={() => setCurrentView('users')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md transition-all hover:scale-105"
            >
              <Users className="w-4 h-4" />
              <span>إدارة المستخدمين</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Dynamic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="إجمالي الطلاب المسجلين"
          value={kpis.totalStudents}
          subtitle="في كافة الفصول والشعب"
          icon={Users}
          colorScheme="indigo"
        />

        <KPICard
          title="إجمالي الاختبارات"
          value={kpis.totalQuizzes}
          subtitle="بمختلف المواد والتخصصات"
          icon={FileQuestion}
          colorScheme="cyan"
        />

        <KPICard
          title="متوسط النتائج العام"
          value={`${kpis.averageScore}%`}
          subtitle={`نسبة النجاح: ${kpis.passRate}%`}
          icon={Award}
          colorScheme="emerald"
          trend={{ value: `${kpis.passRate}% نجاح`, isPositive: kpis.averageScore >= 60 }}
        />

        <KPICard
          title="الطلاب النشطون (آخر 7 أيام)"
          value={kpis.activeStudents}
          subtitle="أكملوا اختباراً واحداً على الأقل"
          icon={TrendingUp}
          colorScheme="purple"
        />
      </div>

      {/* Interactive Charts */}
      <AnalyticsCharts
        scoreDistribution={kpis.scoreDistribution}
        completionTimeline={kpis.completionTimeline}
        subjectPerformance={kpis.subjectPerformance}
      />

      {/* School Quizzes Management with Re-assignment & Full Admin Control */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-soft transition-colors duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-cairo">
              بنك الاختبارات المدرسي وإعادة الإسناد (Admin Quiz Control)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              يمكنك كمدير نظام نقل وتفويض ملكية أي اختبار من معلم إلى آخر، معاينته، تعديله، مراجعة نتائج الطلاب، أو حذفه فوراً.
            </p>
          </div>
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900">
            {quizzes.length} اختبارات معتمدة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4">عنوان الاختبار</th>
                <th className="py-3 px-4">المادة الدراسية</th>
                <th className="py-3 px-4">المعلم المالك</th>
                <th className="py-3 px-4">الفئة المستهدفة</th>
                <th className="py-3 px-4">المدة والدرجة</th>
                <th className="py-3 px-4">المحاولات</th>
                <th className="py-3 px-4 text-center">تفويض الاختبار</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {quizzes.map((quiz) => {
                const teacher = users.find((u) => u.id === quiz.teacher_id);
                const assignment = quiz.assignments?.[0];
                let targetText = 'كافة الطلاب';
                if (assignment?.target_type === 'class') targetText = assignment.target_name || 'صف محدد';
                if (assignment?.target_type === 'specific_students') targetText = 'طلاب محددون بالاسم';

                return (
                  <tr key={quiz.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{quiz.title}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold"
                        style={{
                          backgroundColor: `${quiz.subject?.color || '#6366f1'}15`,
                          color: quiz.subject?.color || '#6366f1',
                        }}
                      >
                        {quiz.subject?.name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <Avatar name={teacher?.name || 'م'} role={teacher?.role} size="xs" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {teacher?.name || 'غير معروف'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">{targetText}</td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                      {quiz.duration_minutes} دقيقة • {quiz.total_marks} درجة
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => {
                          if (quiz?.id) {
                            setActiveQuizId(quiz.id);
                            setCurrentView('quiz_results');
                          }
                        }}
                        className="font-bold text-indigo-700 dark:text-indigo-400 hover:underline"
                        title="عرض نتائج محاولات الطلاب لهذا الاختبار"
                      >
                        {quiz.submissions_count || 0} تسليم
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setSelectedQuizForReassign(quiz)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>نقل لمعلم آخر</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* 1. زر معاينة الاختبار (العرض) */}
                        <button
                          onClick={() => {
                            if (quiz?.id) {
                              setActiveQuizId(quiz.id);
                              setCurrentView('quiz_preview');
                            }
                          }}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="معاينة وعرض الاختبار"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* 2. زر تعديل الاختبار */}
                        <button
                          onClick={() => {
                            setEditingQuizId(quiz.id);
                            setCurrentView('create_quiz');
                          }}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="تعديل الاختبار"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* 3. زر تقارير ونتائج الاختبار (التحليلات) */}
                        <button
                          onClick={() => {
                            if (quiz?.id) {
                              setActiveQuizId(quiz.id);
                              setCurrentView('quiz_results');
                            }
                          }}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="تفاصيل النتائج ومَن اختبر"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </button>

                        {/* 4. زر حذف الاختبار */}
                        <button
                          onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors"
                          title="حذف الاختبار نهائياً"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comprehensive Submissions Results Table */}
      <SubmissionsTable submissions={submissions} />

      {/* Reassign Modal */}
      {selectedQuizForReassign && (
        <ReassignQuizModal
          quiz={selectedQuizForReassign}
          onClose={() => setSelectedQuizForReassign(null)}
        />
      )}
    </div>
  );
};
