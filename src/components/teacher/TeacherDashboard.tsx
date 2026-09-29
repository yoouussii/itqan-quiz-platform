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
  Clock,
  ToggleLeft,
  ToggleRight,
  Filter,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Pencil,
  FileSpreadsheet,
  ChevronDown,
  Sparkles,
  ShieldAlert,
  GraduationCap,
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
import { QuizWithDetails, SubmissionWithDetails } from '../../types';
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
    theme,
  } = useApp();

  const [selectedQuizForReassign, setSelectedQuizForReassign] = useState<QuizWithDetails | null>(
    null
  );
  const [selectedQuizIdFilter, setSelectedQuizIdFilter] = useState<string>('all');
  const [remedialTierFilter, setRemedialTierFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const teacherSubject = subjects.find((s) => s.id === currentUser?.specialty_id);

  // Filter submissions belonging to this teacher's quizzes
  const teacherQuizIds = new Set(quizzes.map((q) => q.id));
  const teacherSubmissions = useMemo(
    () => submissions.filter((s) => teacherQuizIds.has(s.quiz_id)),
    [submissions, teacherQuizIds]
  );

  // Per-Quiz Filtered Analytics
  const activeQuizAnalytics = useMemo(() => {
    let filteredSubs = teacherSubmissions;
    let targetQuiz: QuizWithDetails | undefined;

    if (selectedQuizIdFilter !== 'all') {
      filteredSubs = teacherSubmissions.filter((s) => s.quiz_id === selectedQuizIdFilter);
      targetQuiz = quizzes.find((q) => q.id === selectedQuizIdFilter);
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

    return {
      filteredSubs,
      totalSubs,
      avgScore,
      passRate,
      distribution,
      targetQuiz,
    };
  }, [teacherSubmissions, selectedQuizIdFilter, quizzes]);

  // Smart Remedial & Actionable Student Report
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

      const associatedQuiz = quizzes.find((q) => q.id === sub.quiz_id);
      const isRetakeAllowed = associatedQuiz?.allowed_retake_student_ids?.includes(sub.student_id) || false;

      return {
        ...sub,
        tier,
        tierLabel,
        tierColor,
        tierAction,
        isRetakeAllowed,
      };
    });

    const highCount = list.filter((item) => item.tier === 'high').length;
    const mediumCount = list.filter((item) => item.tier === 'medium').length;
    const lowCount = list.filter((item) => item.tier === 'low').length;

    const filteredList = list.filter((item) => {
      if (remedialTierFilter === 'all') return true;
      return item.tier === remedialTierFilter;
    });

    return {
      list: filteredList,
      allList: list,
      highCount,
      mediumCount,
      lowCount,
      total: list.length,
    };
  }, [activeQuizAnalytics.filteredSubs, quizzes, remedialTierFilter]);

  const handleDelete = (quizId: string, title: string) => {
    if (
      window.confirm(
        `هل أنت متأكد من رغبتك في حذف الاختبار (${title})؟\n\nملاحظة: سيتم نقل الاختبار لسلة المحذوفات واستبعاد درجاته نهائياً من حساب المعدل العام للطلاب.`
      )
    ) {
      deleteQuizItem(quizId);
    }
  };

  const exportRemedialPlanCSV = () => {
    const headers = [
      'اسم الطالب',
      'رقم الهوية',
      'الفصل الدراسي',
      'عنوان الاختبار',
      'النسبة المئوية',
      'فئة التقييم',
      'الخطة التعليمية الموصى بها',
      'صلاحية الإعادة',
    ];

    const rows = remedialReport.allList.map((item) => [
      `"${item.student?.name || ''}"`,
      `"${item.student?.national_id || ''}"`,
      `"${item.student_class?.name || ''}"`,
      `"${item.quiz?.title || ''}"`,
      `"${item.percentage}%"`,
      `"${item.tierLabel}"`,
      `"${item.tierAction}"`,
      `"${item.isRetakeAllowed ? 'مصرح له بالإعادة' : 'غير مصرح'}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `خطة_علاجية_${selectedQuizIdFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasExtraPermissions =
    currentUser?.teacher_permissions?.can_add_custom_subjects ||
    currentUser?.teacher_permissions?.can_manage_classes;

  const isDark = theme === 'dark';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir="rtl">
      {/* Teacher Welcome Header */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser?.name || ''} role={currentUser?.role} size="xl" showBadge />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm font-bold text-emerald-200">
                  لوحة المعلم المعتمدة
                </span>
                <span className="text-xs text-white/80 font-medium">
                  المادة: {teacherSubject?.name || 'التعليم العام'} • هوية: {currentUser?.national_id}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-cairo">
                مرحباً بك، {currentUser?.name}
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100 mt-1 max-w-xl leading-relaxed">
                إدارة الاختبارات والتقييمات، الجدولة الزمنية، التحكم الفوري بالإتاحة، وإعداد الخطط العلاجية الذكية لطلابك.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hasExtraPermissions && (
              <button
                onClick={() => setCurrentView('subjects_classes')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold backdrop-blur-sm border border-white/20 transition-all"
              >
                <Layers className="w-4 h-4 text-emerald-200" />
                <span>إدارة المواد والشعب</span>
              </button>
            )}
            <button
              onClick={() => {
                setEditingQuizId(null);
                setCurrentView('create_quiz');
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-emerald-900 hover:bg-emerald-50 rounded-2xl text-xs font-bold shadow-lg transition-all hover:scale-105"
            >
              <PlusCircle className="w-4 h-4 text-emerald-700" />
              <span>إنشاء اختبار جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Top KPI Cards for Teacher */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="اختباراتي المُنشأة"
          value={kpis.totalQuizzes}
          subtitle="نشطة ومتاحة للطلاب"
          icon={FileQuestion}
          colorScheme="emerald"
        />
        <KPICard
          title="إجمالي التسليمات"
          value={kpis.totalSubmissions}
          subtitle="محاولات الطلاب المصححة"
          icon={Users}
          colorScheme="indigo"
        />
        <KPICard
          title="متوسط نتائج الطلاب"
          value={`${kpis.averageScore}%`}
          subtitle="المعدل العام لاختباراتك"
          icon={Award}
          colorScheme="amber"
          trend={{ value: `${kpis.passRate}% نسبة النجاح`, isPositive: kpis.averageScore >= 60 }}
        />
        <KPICard
          title="الطلاب النشطون (7 أيام)"
          value={kpis.activeStudents}
          subtitle="تفاعلوا مع تقييماتك"
          icon={TrendingUp}
          colorScheme="purple"
        />
      </div>

      {/* Teacher's Quizzes Section with Instant Toggle & Explicit Dates */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white font-cairo">
              إدارة الاختبارات والجدولة ({quizzes.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              التحكم في التفعيل الفوري، نطاق الإتاحة الزمنية، وتفويض الاختبارات
            </p>
          </div>
          <button
            onClick={() => {
              setEditingQuizId(null);
              setCurrentView('create_quiz');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إضافة اختبار جديد</span>
          </button>
        </div>

        {quizzes.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-soft">
            <FileQuestion className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="font-bold text-base text-slate-800 dark:text-white">لم تقم بإنشاء اختبارات حتى الآن</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              ابدأ الآن بإنشاء اختبارك الأول واستهداف الفصول الدراسية المناسبة.
            </p>
            <button
              onClick={() => {
                setEditingQuizId(null);
                setCurrentView('create_quiz');
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إنشاء اختبارك الأول</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.map((quiz) => {
              const assignment = quiz.assignments?.[0];
              let targetLabel = 'موجه لكافة الطلاب';
              if (assignment?.target_type === 'class') targetLabel = assignment.target_name || 'صف دراسي';
              if (assignment?.target_type === 'specific_students') targetLabel = 'طلاب محددون بالاسم';

              // Format date in Arabic Hijri
              const formattedCreationDate = formatArabicQuizDate(quiz.start_date || quiz.created_at);

              return (
                <div
                  key={quiz.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between group ${
                    quiz.is_active
                      ? 'border-slate-200/80 dark:border-slate-800 shadow-soft hover:shadow-card'
                      : 'border-slate-300 dark:border-slate-700/60 opacity-85 bg-slate-50/50 dark:bg-slate-900/60'
                  }`}
                >
                  <div>
                    {/* Top Row: Subject + Target + Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${quiz.subject?.color || '#059669'}15`,
                          color: quiz.subject?.color || '#059669',
                        }}
                      >
                        {quiz.subject?.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {targetLabel}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            quiz.is_active
                              ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {quiz.is_active ? 'متاح للطلاب' : 'موقوف مؤقتاً'}
                        </span>
                      </div>
                    </div>

                    {/* Quiz Title */}
                    <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1 mb-1.5">
                      {quiz.title}
                    </h3>

                    {/* Explicit Creation / Scheduled Date */}
                    <div className="flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-400 font-bold mb-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 px-2.5 py-1 rounded-xl w-fit">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formattedCreationDate}</span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                      {quiz.description}
                    </p>

                    {/* Duration / Marks / Submissions */}
                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 mb-4 text-center">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">المدة</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{quiz.duration_minutes} د</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">الدرجة</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{quiz.total_marks}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">التسليمات</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{quiz.submissions_count || 0}</span>
                      </div>
                    </div>

                    {/* Instant Manual Toggle Switch */}
                    <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 mb-3">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        التحكم الفوري بالإتاحة:
                      </span>
                      <button
                        onClick={() => toggleQuizActive(quiz.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                          quiz.is_active
                            ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                            : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-400'
                        }`}
                        title="انقر لتفعيل أو إيقاف إمكانية دخول الطلاب للاختبار"
                      >
                        {quiz.is_active ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>مفعل (نشط)</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-3.5 h-3.5" />
                            <span>موقوف (معطل)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingQuizId(quiz.id);
                          setCurrentView('create_quiz');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 transition-colors"
                        title="تعديل بيانات وأسئلة الاختبار"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>

                      <button
                        onClick={() => setSelectedQuizForReassign(quiz)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors"
                        title="نقل وتفويض الاختبار لزميل آخر"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>إسناد لزميل</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleDelete(quiz.id, quiz.title)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                      title="حذف الاختبار (نقل إلى المحذوفات وتجميد النتائج)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION: Per-Quiz Interactive Analytics & Performance Charts */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-soft space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-cairo">
                تحليلات ومؤشرات الأداء المخصصة لكل اختبار
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              اختر اختباراً معيناً لتحديث الرسوم البيانية وتوزيع الدرجات ومستويات الإتقان
            </p>
          </div>

          {/* Quiz Selector Dropdown */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
              تصفية الاختبار:
            </span>
            <div className="relative min-w-[260px]">
              <select
                value={selectedQuizIdFilter}
                onChange={(e) => setSelectedQuizIdFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">جميع اختباراتي (تحليل تراكمي)</option>
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selected Quiz Mini Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-center">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">إجمالي التسليمات</span>
            <span className="text-lg font-black text-indigo-900 dark:text-indigo-200 font-cairo">
              {activeQuizAnalytics.totalSubs} طالب
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">متوسط الدرجات</span>
            <span className="text-lg font-black text-indigo-900 dark:text-indigo-200 font-cairo">
              {activeQuizAnalytics.avgScore}%
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">نسبة النجاح</span>
            <span className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-cairo">
              {activeQuizAnalytics.passRate}%
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">حالة الاختبار</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {activeQuizAnalytics.targetQuiz?.is_active !== false ? 'متاح للطلاب ✓' : 'موقوف مؤقتاً ✕'}
            </span>
          </div>
        </div>

        {/* Chart Container */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
            توزيع مستويات الإنجاز للأداء المحدد:
          </h4>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeQuizAnalytics.distribution}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="shortName" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
                <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs font-bold shadow-lg border border-slate-700" dir="rtl">
                          <p>{data.name}</p>
                          <p className="text-amber-400 mt-0.5">{data.count} طلاب</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {activeQuizAnalytics.distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECTION: Smart Remedial & Actionable Student Report (الخطة العلاجية والإثرائية الذكية) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-soft space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-cairo">
                تقرير الأداء والخطة العلاجية والإثرائية الذكية
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تصنيف الطلاب تلقائياً إلى 3 مستويات أكاديمية مع تحديد التدخل الموصى به وإمكانية السماح بإعادة الاختبار فورياً
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportRemedialPlanCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>تصدير التقرير (CSV)</span>
            </button>
          </div>
        </div>

        {/* 3 Tier Summary Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            onClick={() => setRemedialTierFilter(remedialTierFilter === 'high' ? 'all' : 'high')}
            className={`cursor-pointer p-4 rounded-2xl border transition-all ${
              remedialTierFilter === 'high'
                ? 'ring-2 ring-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50'
                : 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                1) فئة المتميزين (≥ 85%)
              </span>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-cairo">
                {remedialReport.highCount}
              </span>
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
              إثراء وتفوق • مهام تحدٍ وأنشطة متقدمة
            </p>
          </div>

          <div
            onClick={() => setRemedialTierFilter(remedialTierFilter === 'medium' ? 'all' : 'medium')}
            className={`cursor-pointer p-4 rounded-2xl border transition-all ${
              remedialTierFilter === 'medium'
                ? 'ring-2 ring-blue-500 bg-blue-50/70 dark:bg-blue-950/50'
                : 'bg-blue-50/30 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 hover:bg-blue-50/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
                2) فئة في تقدم (65% - 84%)
              </span>
              <span className="text-lg font-black text-blue-700 dark:text-blue-400 font-cairo">
                {remedialReport.mediumCount}
              </span>
            </div>
            <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
              تعزيز وتثبيت المفاهيم • تدريبات داعمة
            </p>
          </div>

          <div
            onClick={() => setRemedialTierFilter(remedialTierFilter === 'low' ? 'all' : 'low')}
            className={`cursor-pointer p-4 rounded-2xl border transition-all ${
              remedialTierFilter === 'low'
                ? 'ring-2 ring-rose-500 bg-rose-50/70 dark:bg-rose-950/50'
                : 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 hover:bg-rose-50/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                3) فئة خطة علاجية عاجلة (&lt; 65%)
              </span>
              <span className="text-lg font-black text-rose-700 dark:text-rose-400 font-cairo">
                {remedialReport.lowCount}
              </span>
            </div>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
              تدخل فوري • تقوية مخصصة وإعادة محاولة
            </p>
          </div>
        </div>

        {/* Detailed Remedial Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4">الطالب</th>
                <th className="py-3 px-4">الفصل الدراسي</th>
                <th className="py-3 px-4">الاختبار</th>
                <th className="py-3 px-4">النتيجة</th>
                <th className="py-3 px-4">المستوى المصنف</th>
                <th className="py-3 px-4">الخطة التعليمية المقترحة</th>
                <th className="py-3 px-4 text-center">إتاحة الإعادة للطالب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {remedialReport.list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    لا يوجد طلاب مسجلون في هذا التصنيف حالياً
                  </td>
                </tr>
              ) : (
                remedialReport.list.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <Avatar name={item.student?.name || ''} role={item.student?.role} size="xs" />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{item.student?.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.student?.national_id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {item.student_class?.name || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white line-clamp-1">
                      {item.quiz?.title}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.score}/{item.total_possible_score}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono mr-1">({item.percentage}%)</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${item.tierColor}`}>
                        {item.tierLabel}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 max-w-xs text-[11px] leading-relaxed">
                      {item.tierAction}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {item.isRetakeAllowed ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                            مسموح له بالإعادة ✓
                          </span>
                          <button
                            onClick={() => revokeStudentRetake(item.quiz_id, item.student_id)}
                            className="text-[10px] text-slate-400 hover:text-rose-600 underline"
                            title="إلغاء إتاحة الإعادة"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => allowStudentRetake(item.quiz_id, item.student_id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all shadow-xs hover:scale-105"
                          title="منح الطالب صلاحية أداء الاختبار مرة أخرى"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>السماح بالإعادة</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teacher Submissions & Analytics Table */}
      <SubmissionsTable
        submissions={teacherSubmissions}
        title="سجل نتائج وتقييمات طلابك الكامل"
        subtitle="متابعة فورية لدرجات الطلاب الذين أتموا اختباراتك المصممة"
      />

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
