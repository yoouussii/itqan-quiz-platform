import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Award,
  TrendingUp,
  Play,
  Eye,
  FileQuestion,
  User as UserIcon,
  Sparkles,
  Lock,
  Calendar,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { KPICard } from '../common/KPICard';
import { Avatar } from '../common/Avatar';
import { formatArabicQuizDate } from '../../utils/dateUtils';
import { parseWindowStart, parseWindowEnd, formatQuizDateTime } from '../../utils/quizWindow';
import { PencilLine } from 'lucide-react';
import { KpiDetailModal } from '../common/KpiDetailModal';
import { KpiSection, studentQuizzesSection, studentResultsSection, studentSubjectsSection, topResultsSection } from '../../utils/kpiSections';

interface StudentDashboardProps {
  onStartQuiz: (quizId: string) => void;
  onViewReview: (submissionId: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onStartQuiz,
  onViewReview,
}) => {
  const { currentUser, quizzes, submissions, classes } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'available' | 'completed'>('all');
  const [kpiModal, setKpiModal] = useState<'available' | 'completed' | 'avg' | 'best' | null>(null);

  const studentClass = classes.find((c) => c.id === currentUser?.class_id);

  // STRICT PRIVACY: Student's personal submissions ONLY
  const mySubmissions = useMemo(
    () => submissions.filter((s) => s.student_id === currentUser?.id),
    [submissions, currentUser?.id]
  );

  // CRITICAL REQUIREMENT 3: STRICTLY EXCLUDE DELETED QUIZZES FROM GPA / AVERAGE CALCULATION
  const validActiveSubmissions = useMemo(
    () => mySubmissions.filter((s) => !s.quiz?.is_deleted),
    [mySubmissions]
  );

  const deletedSubmissionsCount = mySubmissions.length - validActiveSubmissions.length;

  const completedQuizzesCount = validActiveSubmissions.length;
  const availableQuizzesCount = quizzes.filter(
    (q) => !q.user_submission || q.allowed_retake_student_ids?.includes(currentUser?.id || '')
  ).length;

  const averageScore =
    validActiveSubmissions.length > 0
      ? Math.round(
          validActiveSubmissions.reduce((acc, curr) => acc + curr.percentage, 0) /
            validActiveSubmissions.length
        )
      : 0;

  const highestScore =
    validActiveSubmissions.length > 0
      ? Math.max(...validActiveSubmissions.map((s) => s.percentage))
      : 0;

  // Filter quizzes according to tab
  const displayedQuizzes = quizzes.filter((quiz) => {
    const isRetakeAllowed = quiz.allowed_retake_student_ids?.includes(currentUser?.id || '');
    if (activeFilter === 'available') return !quiz.user_submission || isRetakeAllowed;
    if (activeFilter === 'completed') return !!quiz.user_submission;
    return true;
  });

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir="rtl">
      {/* Welcome Hero Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-primary-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser?.name || ''} role={currentUser?.role} userId={currentUser?.id} size="xl" showBadge />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm font-bold text-amber-300">
                  لوحة الطالب الشخصية
                </span>
                <span className="text-xs text-white/80 font-medium">
                  {studentClass?.name || 'طالب مسجل'} • هوية: {currentUser?.national_id}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-cairo">
                أهلاً بك، {currentUser?.name} 👋
              </h1>
              <p className="text-xs sm:text-sm text-indigo-100 mt-1 max-w-lg leading-relaxed">
                مرحباً بك في منصة إتقان التعليمية. أداء الاختبارات المجدولة ومتابعة التحصيل الدراسي والاطلاع على أوراق الإجابة بكل خصوصية.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 shrink-0">
            <Sparkles className="w-8 h-8 text-amber-400 shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-white/80 block font-semibold">معدلك التراكمي المعتمد</span>
                {deletedSubmissionsCount > 0 && (
                  <span
                    className="text-[9px] bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded font-bold"
                    title="تم استبعاد درجات الاختبارات المحذوفة من المعدل"
                  >
                    مستبعد المحذوف
                  </span>
                )}
              </div>
              <div className="text-2xl font-black font-cairo tracking-tight text-white">
                {averageScore}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Personal Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="اختبارات متاحة للحل"
          value={availableQuizzesCount}
          subtitle="بانتظار أدائك الآن"
          icon={PencilLine}
          colorScheme="indigo"
          onClick={() => setKpiModal('available')}
        />
        <KPICard
          title="اختبارات مكتملة معتمدة"
          value={completedQuizzesCount}
          subtitle="محسوبة في المعدل الرسمي"
          icon={CheckCircle2}
          colorScheme="emerald"
          onClick={() => setKpiModal('completed')}
        />
        <KPICard
          title="المعدل التراكمي العام"
          value={`${averageScore}%`}
          subtitle="مستبعد منه أي اختبار محذوف"
          icon={Award}
          colorScheme="amber"
          trend={{ value: `${averageScore >= 60 ? 'ناجح' : 'بحاجة لتحسين'}`, isPositive: averageScore >= 60 }}
          onClick={() => setKpiModal('avg')}
        />
        <KPICard
          title="أعلى نسبة محققة"
          value={`${highestScore}%`}
          subtitle="أفضل نتيجة في المواد"
          icon={TrendingUp}
          colorScheme="purple"
          onClick={() => setKpiModal('best')}
        />
      </div>

      {/* Assigned Quizzes Section (Strict Visibility Logic) */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-cairo">
                الاختبارات المخصصة لك
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                <Lock className="w-3 h-3" />
                <span>خصوصية تامة</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تظهر هنا الاختبارات الموجهة لصفك الدراسي أو لشخصك فقط وفق نظام الصلاحيات المدرسية
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              الكل ({quizzes.length})
            </button>
            <button
              onClick={() => setActiveFilter('available')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'available'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              المتاحة للبدء ({availableQuizzesCount})
            </button>
            <button
              onClick={() => setActiveFilter('completed')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'completed'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              المكتملة ({validActiveSubmissions.length})
            </button>
          </div>
        </div>

        {displayedQuizzes.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200/80 dark:border-slate-800 shadow-soft">
            <BookOpen className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="font-bold text-base text-slate-800 dark:text-white">لا توجد اختبارات في هذه القائمة حالياً</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              عندما يُسند معلموك اختباراً جديداً لصفك أو لشخصك، سيظهر هنا مباشرة وبشكل فوري.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedQuizzes.map((quiz) => {
              const isCompleted = !!quiz.user_submission;
              const sub = quiz.user_submission;

              // Retake Permission check
              const isRetakeAllowed = quiz.allowed_retake_student_ids?.includes(currentUser?.id || '');

              // Date & Active availability check
              // مقارنة بالوقت الفعلي (وليس بنصوص التواريخ) حتى يعمل يوم البدء ووقته بدقة
              const nowTs = new Date();
              const startAt = parseWindowStart(quiz.start_date);
              const endAt = parseWindowEnd(quiz.end_date);
              const isManualActive = quiz.is_active !== false;
              const isAfterStart = !startAt || nowTs >= startAt;
              const isBeforeEnd = !endAt || nowTs <= endAt;
              const isDateAvailable = isAfterStart && isBeforeEnd;
              const isAvailableToTake = isManualActive && isDateAvailable;
              const closedReason = !isManualActive ? 'manual' : !isAfterStart ? 'upcoming' : 'ended';

              const assignment = quiz.assignments?.[0];
              let targetLabel = 'موجه للجميع';
              if (assignment?.target_type === 'class') targetLabel = 'موجه لصفك الدراسي';
              if (assignment?.target_type === 'specific_students') targetLabel = 'موجه لك خصيصاً بالاسم ⭐';

              // Explicit Arabic date formatting
              const formattedDate = formatArabicQuizDate(quiz.start_date || quiz.created_at);

              return (
                <div
                  key={quiz.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between group ${
                    isAvailableToTake
                      ? 'border-slate-200/80 dark:border-slate-800 shadow-soft hover:shadow-card'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 opacity-90'
                  }`}
                >
                  <div>
                    {/* Top Row: Subject + Target */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span
                        className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${quiz.subject?.color || '#6366f1'}15`,
                          color: quiz.subject?.color || '#6366f1',
                        }}
                      >
                        {quiz.subject?.name}
                      </span>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {targetLabel}
                        </span>
                        {!isAvailableToTake && (
                          <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-900">
                            {closedReason === 'upcoming' ? 'لم يبدأ بعد' : closedReason === 'ended' ? 'انتهى' : 'مغلق حالياً'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quiz Title */}
                    <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1 mb-1.5">
                      {quiz.title}
                    </h3>

                    {/* Explicit Creation / Scheduled Date on Quiz Card */}
                    <div className="flex items-center gap-1.5 text-xs text-indigo-800 dark:text-indigo-300 font-bold mb-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 px-2.5 py-1 rounded-xl w-fit">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formattedDate}</span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                      {quiz.description || 'اختبار تقييمي لقياس الفهم والاستيعاب للمفاهيم الأساسية.'}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 mb-5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{quiz.duration_minutes} دقيقة</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{quiz.total_marks} درجة كليّة</span>
                      </div>
                      <div className="flex items-start gap-1.5 col-span-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          الإتاحة: من <b>{formatQuizDateTime(quiz.start_date, 'start')}</b> إلى{' '}
                          <b>{formatQuizDateTime(quiz.end_date, 'end')}</b>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>إعداد المعلم: {quiz.teacher?.name || 'الكادر التعليمي'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Status & Action */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    {isCompleted ? (
                      <>
                        <div className="flex flex-col gap-1">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${
                              (sub?.percentage || 0) >= 60
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            درجتك: {sub?.score}/{sub?.total_possible_score} ({sub?.percentage}%)
                          </span>

                          {isRetakeAllowed && (
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" />
                              <span>مصرح لك بإعادة المحاولة ✓</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onViewReview(sub!.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>ورقة إجابتي</span>
                          </button>

                          {isRetakeAllowed && isAvailableToTake && (
                            <button
                              onClick={() => onStartQuiz(quiz.id)}
                              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 transition-all hover:scale-105"
                              title="إعادة أداء الاختبار بتصريح المعلم"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>إعادة الاختبار</span>
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {isAvailableToTake ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-xl border border-amber-200 dark:border-amber-800">
                              <span>متاح للبدء</span>
                            </span>
                            <button
                              onClick={() => onStartQuiz(quiz.id)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>بدء الاختبار 🚀</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>
                                {closedReason === 'upcoming'
                                  ? `يبدأ في ${formatQuizDateTime(quiz.start_date, 'start')}`
                                  : closedReason === 'ended'
                                  ? 'انتهى وقت الاختبار'
                                  : 'مغلق حالياً من قِبل المعلم'}
                              </span>
                            </span>
                            <button
                              disabled
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                            >
                              <span>غير متاح</span>
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {kpiModal && (() => {
        const mine = validActiveSubmissions as any[];
        const sections: KpiSection[] =
          kpiModal === 'available'
            ? [studentQuizzesSection('اختباراتك المتاحة للحل', quizzes.filter((q) => !q.user_submission || q.allowed_retake_student_ids?.includes(currentUser?.id || '')) as any)]
            : kpiModal === 'completed'
            ? [studentResultsSection('اختباراتك المكتملة', mine)]
            : kpiModal === 'avg'
            ? [studentSubjectsSection('معدلك حسب المادة', mine)]
            : [topResultsSection('أعلى نتائجك', mine)];
        const titles = { available: 'اختبارات متاحة للحل', completed: 'اختبارات مكتملة معتمدة', avg: 'المعدل التراكمي العام', best: 'أعلى نسبة محققة' } as const;
        return <KpiDetailModal title={titles[kpiModal]} sections={sections} onClose={() => setKpiModal(null)} />;
      })()}

      {/* Historical Submissions Table for this student ONLY */}
      {mySubmissions.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-soft">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-cairo">
                سجل إنجازاتي واختباراتي السابقة (سجل شخصي محمي)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                قائمة بكافة التقييمات المسلمة مع تمييز الاختبارات المحذوفة واستبعادها من المعدل التراكمي
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900">
                {validActiveSubmissions.length} اختبارات معتمدة
              </span>
              {deletedSubmissionsCount > 0 && (
                <span className="text-xs font-bold bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900">
                  {deletedSubmissionsCount} اختبار محذوف
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 px-4">عنوان الاختبار</th>
                  <th className="py-3 px-4">المادة</th>
                  <th className="py-3 px-4">الدرجة</th>
                  <th className="py-3 px-4">النسبة</th>
                  <th className="py-3 px-4">حالة الاحتساب في المعدل</th>
                  <th className="py-3 px-4">تاريخ الإكمال</th>
                  <th className="py-3 px-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {mySubmissions.map((s) => {
                  const isDeleted = s.quiz?.is_deleted;
                  const formattedDeletedDate = isDeleted
                    ? formatArabicQuizDate(s.quiz?.deleted_at || '')
                    : '';

                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${
                        isDeleted
                          ? 'bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/40'
                          : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <span className={`font-bold ${isDeleted ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                            {s.quiz?.title || 'اختبار سابق'}
                          </span>

                          {/* Soft-deleted quiz badge with explicit deleted date */}
                          {isDeleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-800 w-fit">
                              <Ban className="w-3 h-3" />
                              <span>اختبار محذوف - {formattedDeletedDate}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{s.subject?.name}</span>
                      </td>

                      <td className="py-3.5 px-4 font-bold font-cairo text-slate-900 dark:text-white">
                        {s.score} / {s.total_possible_score}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isDeleted
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              : s.percentage >= 90
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : s.percentage >= 60
                              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                          }`}
                        >
                          {s.percentage}%
                        </span>
                      </td>

                      {/* Inclusion in GPA Column */}
                      <td className="py-3.5 px-4">
                        {isDeleted ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                            <AlertCircle className="w-3 h-3" />
                            <span>مستبعد من المعدل</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>معتمد في المعدل</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                        {new Date(s.completed_at).toLocaleDateString('ar-EG-u-ca-gregory-nu-latn')}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => onViewReview(s.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>ورقة إجابتي</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
