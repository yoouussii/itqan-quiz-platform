import React, { useState, useMemo } from 'react';
import {
  PlusCircle,
  FileQuestion,
  Users,
  Award,
  TrendingUp,
  ArrowRightLeft,
  Trash2,
  Layers,
  Calendar,
  ToggleLeft,
  BarChart3,
  CheckCircle2,
  RotateCcw,
  Pencil,
  FileSpreadsheet,
  Sparkles,
  UserPlus,
  UserCheck,
  FileText,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { KPICard } from '../common/KPICard';
import { SubmissionsTable } from '../analytics/SubmissionsTable';
import { ReassignQuizModal } from '../common/ReassignQuizModal';
import { QuizWithDetails } from '../../types';
import { Avatar } from '../common/Avatar';
import { formatArabicQuizDate } from '../../utils/dateUtils';

export const TeacherDashboard: React.FC = () => {
  const {
    currentUser,
    quizzes,
    submissions,
    kpis,
    setCurrentView,
    deleteQuizItem,
    toggleQuizActive,
    allowStudentRetake,
    revokeStudentRetake,
    setEditingQuizId,
    subjects,
    classes,
    theme,
  } = useApp();

  const [selectedQuizForReassign, setSelectedQuizForReassign] = useState<QuizWithDetails | null>(null);
  const [selectedQuizIdFilter, setSelectedQuizIdFilter] = useState<string>('all');
  const [remedialTierFilter, setRemedialTierFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // 1. تحديد مواد وفصول المعلم (يدعم المواد المتعددة والتخصص)
  const assignedSubjectIds = useMemo(() => {
    if (currentUser?.assigned_subject_ids && currentUser.assigned_subject_ids.length > 0) {
      return currentUser.assigned_subject_ids;
    }
    return currentUser?.specialty_id ? [currentUser.specialty_id] : [];
  }, [currentUser?.assigned_subject_ids, currentUser?.specialty_id]);

  const teacherSubjects = useMemo(() => {
    return subjects.filter((s) => assignedSubjectIds.includes(s.id));
  }, [subjects, assignedSubjectIds]);
  
  const assignedClassIds = useMemo(() => {
    if (currentUser?.assigned_class_ids && currentUser.assigned_class_ids.length > 0) {
      return currentUser.assigned_class_ids;
    }
    return currentUser?.class_id ? [currentUser.class_id] : [];
  }, [currentUser?.assigned_class_ids, currentUser?.class_id]);

  const teacherClasses = useMemo(() => {
    return classes.filter((c) => assignedClassIds.includes(c.id));
  }, [classes, assignedClassIds]);

  // 2. إرجاع جميع اختبارات المعلم (التي أنشأها أو المخصصة لمواده/فصوله)
  const teacherQuizzes = useMemo(() => {
    return quizzes.filter(
      (q) =>
        q.teacher_id === currentUser?.id ||
        q.created_by === currentUser?.id ||
        q.created_by === currentUser?.national_id ||
        assignedSubjectIds.includes(q.subject_id)
    );
  }, [quizzes, currentUser, assignedSubjectIds]);

  const teacherQuizIds = new Set(teacherQuizzes.map((q) => q.id));

  // 3. التحقق من كافة الصلاحيات الممنوحة للمعلم
  const permissions = currentUser?.teacher_permissions || (currentUser as any)?.permissions || {};
  const canViewAllReports = Boolean(
    currentUser?.role === 'admin' ||
    permissions.can_view_all_reports ||
    currentUser?.teacher_permissions?.can_view_all_reports
  );

  const teacherSubmissions = useMemo(
    () => canViewAllReports ? submissions : submissions.filter((s) => teacherQuizIds.has(s.quiz_id)),
    [submissions, teacherQuizIds, canViewAllReports]
  );

  // Per-Quiz Filtered Analytics
  const activeQuizAnalytics = useMemo(() => {
    let filteredSubs = teacherSubmissions;
    let targetQuiz: QuizWithDetails | undefined;

    if (selectedQuizIdFilter !== 'all') {
      filteredSubs = teacherSubmissions.filter((s) => s.quiz_id === selectedQuizIdFilter);
      targetQuiz = teacherQuizzes.find((q) => q.id === selectedQuizIdFilter);
    }

    const totalSubs = filteredSubs.length;
    const avgScore =
      totalSubs > 0
        ? Math.round(filteredSubs.reduce((acc, curr) => acc + curr.percentage, 0) / totalSubs)
        : 0;

    const passMark = targetQuiz?.pass_percentage || 60;
    const passingCount = filteredSubs.filter((s) => s.percentage >= passMark).length;
    const passRate = totalSubs > 0 ? Math.round((passingCount / totalSubs) * 100) : 0;

    const distribution = [
      { name: 'ممتاز (≥85%)', shortName: 'ممتاز', count: 0, color: '#10b981' },
      { name: 'جيد جداً (75-84%)', shortName: 'جيد جداً', count: 0, color: '#6366f1' },
      { name: 'جيد (65-74%)', shortName: 'جيد', count: 0, color: '#0ea5e9' },
      { name: 'مقبول (50-64%)', shortName: 'مقبول', count: 0, color: '#f59e0b' },
      { name: 'دون التمرير (<50%)', shortName: 'راسب', count: 0, color: '#f43f5e' },
    ];

    filteredSubs.forEach((s) => {
      if (s.percentage >= 85) distribution[0].count++;
      else if (s.percentage >= 75) distribution[1].count++;
      else if (s.percentage >= 65) distribution[2].count++;
      else if (s.percentage >= 50) distribution[3].count++;
      else distribution[4].count++;
    });

    return { filteredSubs, totalSubs, avgScore, passRate, distribution, targetQuiz };
  }, [teacherSubmissions, selectedQuizIdFilter, teacherQuizzes]);

  // Smart Remedial Report
  const remedialReport = useMemo(() => {
    const list = activeQuizAnalytics.filteredSubs.map((sub) => {
      let tier: 'high' | 'medium' | 'low';
      let tierLabel: string;
      let tierColor: string;
      let tierAction: string;

      if (sub.percentage >= 85) {
        tier = 'high';
        tierLabel = 'إثراء وتفوق أكاديمي';
        tierColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300';
        tierAction = 'منح شهادة تفوق وتكليف بمهام تحدٍ ومسائل متقدمة';
      } else if (sub.percentage >= 65) {
        tier = 'medium';
        tierLabel = 'في تقدم وتعزيز';
        tierColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300';
        tierAction = 'تثبيت المفاهيم بأوراق عمل موجهة ومتابعة التحسن';
      } else {
        tier = 'low';
        tierLabel = 'يحتاج خطة علاجية عاجلة';
        tierColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300';
        tierAction = 'جلسات تقوية فردية، معالجة المهارات الأساسية وإتاحة إعادة الاختبار';
      }

      const associatedQuiz = teacherQuizzes.find((q) => q.id === sub.quiz_id);
      const isRetakeAllowed = associatedQuiz?.allowed_retake_student_ids?.includes(sub.student_id) || false;

      return { ...sub, tier, tierLabel, tierColor, tierAction, isRetakeAllowed };
    });

    return {
      list: list.filter((item) => remedialTierFilter === 'all' || item.tier === remedialTierFilter),
      allList: list,
      highCount: list.filter((item) => item.tier === 'high').length,
      mediumCount: list.filter((item) => item.tier === 'medium').length,
      lowCount: list.filter((item) => item.tier === 'low').length,
    };
  }, [activeQuizAnalytics.filteredSubs, teacherQuizzes, remedialTierFilter]);

  const handleDelete = (quizId: string, title: string) => {
    if (window.confirm(`هل أنت متأكد من رغبتك في حذف الاختبار (${title})؟`)) {
      deleteQuizItem(quizId);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir="rtl">
      {/* Teacher Welcome Header */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser?.name || ''} role={currentUser?.role} size="xl" showBadge />
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm font-bold text-emerald-200">
                  لوحة المعلم
                </span>
                <span className="text-xs text-white/90 font-medium">
                  المواد: {teacherSubjects.length > 0 ? teacherSubjects.map(s => s.name).join(' ، ') : 'غير محدد'}
                </span>
                {teacherClasses.length > 0 && (
                  <span className="text-xs bg-emerald-950/60 px-2 py-0.5 rounded-md text-emerald-200 font-medium">
                    الفصول: {teacherClasses.map(c => c.name).join(' ، ')}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-cairo">
                مرحباً بك، {currentUser?.name}
              </h1>
            </div>
          </div>

          {/* أزرار الإجراءات ديناميكياً بناءً على الصلاحيات الممنوحة */}
          <div className="flex flex-wrap items-center gap-2.5">
            {permissions.can_add_students && (
              <button
                onClick={() => setCurrentView('students_management')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold backdrop-blur-sm border border-white/20 transition-all"
              >
                <UserPlus className="w-4 h-4 text-emerald-200" />
                <span>إضافة طالب</span>
              </button>
            )}

            {permissions.can_add_teachers && (
              <button
                onClick={() => setCurrentView('users_management')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold backdrop-blur-sm border border-white/20 transition-all"
              >
                <UserCheck className="w-4 h-4 text-emerald-200" />
                <span>إضافة معلم</span>
              </button>
            )}

            {(permissions.can_add_custom_subjects || permissions.can_manage_classes) && (
              <button
                onClick={() => setCurrentView('subjects_classes')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold backdrop-blur-sm border border-white/20 transition-all"
              >
                <Layers className="w-4 h-4 text-emerald-200" />
                <span>إدارة المواد والفصول</span>
              </button>
            )}

            {permissions.can_view_all_reports && (
              <button
                onClick={() => setCurrentView('reports')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold backdrop-blur-sm border border-white/20 transition-all"
              >
                <FileText className="w-4 h-4 text-emerald-200" />
                <span>التقارير الشاملة</span>
              </button>
            )}

            <button
              onClick={() => {
                setEditingQuizId(null);
                setCurrentView('create_quiz');
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-xs font-bold shadow-lg transition-all"
            >
              <PlusCircle className="w-4 h-4 text-emerald-700" />
              <span>إنشاء اختبار جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="اختباراتي المُنشأة" value={teacherQuizzes.length} subtitle="نشطة ومتاحة للطلاب" icon={FileQuestion} colorScheme="emerald" />
        <KPICard title="إجمالي التسليمات" value={teacherSubmissions.length} subtitle="محاولات الطلاب المصححة" icon={Users} colorScheme="indigo" />
        <KPICard title="متوسط النتائج" value={`${kpis.averageScore}%`} subtitle="المعدل العام لاختباراتك" icon={Award} colorScheme="amber" />
        <KPICard title="الطلاب النشطون" value={kpis.activeStudents} subtitle="تفاعلوا مع تقييماتك" icon={TrendingUp} colorScheme="purple" />
      </div>

      {/* Quizzes List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white font-cairo">
              إدارة الاختبارات والجدولة ({teacherQuizzes.length})
            </h2>
          </div>
        </div>

        {teacherQuizzes.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-soft">
            <FileQuestion className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="font-bold text-base text-slate-800 dark:text-white">لا توجد اختبارات مسجلة باسمك حالياً</h3>
            <button
              onClick={() => {
                setEditingQuizId(null);
                setCurrentView('create_quiz');
              }}
              className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إنشاء اختبار جديد</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teacherQuizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-soft flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {quiz.subject?.name || 'مادة عامة'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${quiz.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                      {quiz.is_active ? 'متاح' : 'موقوف'}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1.5">{quiz.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">{quiz.description}</p>

                  <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 mb-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">التحكم الفوري بالإتاحة:</span>
                    <button
                      onClick={() => toggleQuizActive(quiz.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${quiz.is_active ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'}`}
                    >
                      {quiz.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      <span>{quiz.is_active ? 'نشط' : 'معطل'}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingQuizId(quiz.id);
                        setCurrentView('create_quiz');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      onClick={() => setSelectedQuizForReassign(quiz)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>إسناد لزميل</span>
                    </button>
                  </div>
                  <button onClick={() => handleDelete(quiz.id, quiz.title)} className="p-1.5 text-slate-400 hover:text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analytics & Submissions */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-soft space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white font-cairo">سجل تسليمات الطلاب الأخيرة</h2>
        <SubmissionsTable submissions={teacherSubmissions} />
      </div>

      {selectedQuizForReassign && (
        <ReassignQuizModal quiz={selectedQuizForReassign} onClose={() => setSelectedQuizForReassign(null)} />
      )}
    </div>
  );
};
