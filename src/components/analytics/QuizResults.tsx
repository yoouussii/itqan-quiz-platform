import React, { useMemo } from 'react';
import { ArrowRight, Users, Percent, Trophy, TrendingDown, CheckCircle2, FileQuestion } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { SubmissionsTable } from './SubmissionsTable';

/**
 * صفحة "تحليلات / نتائج" اختبار واحد.
 * كانت أزرار الآدمن تنتقل إلى العرض quiz_results ولا توجد له صفحة، فتظهر شاشة فارغة.
 * هذه الصفحة آمنة ضد البيانات الناقصة (null / undefined) وتعرض حالة فارغة واضحة.
 */
export const QuizResults: React.FC = () => {
  const { activeQuizId, setActiveQuizId, setCurrentView, quizzes, submissions } = useApp();

  const quiz = useMemo(() => {
    if (!activeQuizId) return null;
    return (
      (quizzes || []).find((q) => q?.id === activeQuizId) ||
      StorageService.getQuizWithDetails(activeQuizId) ||
      null
    );
  }, [activeQuizId, quizzes]);

  const quizSubmissions = useMemo(
    () => (submissions || []).filter((s) => s?.quiz_id === activeQuizId),
    [submissions, activeQuizId]
  );

  const goBack = () => {
    setActiveQuizId(null);
    setCurrentView('dashboard');
  };

  if (!activeQuizId || !quiz) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center" dir="rtl">
        <FileQuestion className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-1">
          لم يتم العثور على هذا الاختبار
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          قد يكون الاختبار حُذف أو لم يتم تحميله بعد. حاول التحديث أو العودة للوحة التحكم.
        </p>
        <button
          onClick={goBack}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
        >
          العودة للوحة التحكم
        </button>
      </div>
    );
  }

  const total = quizSubmissions.length;
  const percentages = quizSubmissions.map((s) => Number(s.percentage) || 0);
  const avg = total > 0 ? Math.round(percentages.reduce((a, b) => a + b, 0) / total) : 0;
  const passMark = quiz.pass_percentage || 50;
  const passed = percentages.filter((p) => p >= passMark).length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const highest = total > 0 ? Math.max(...percentages) : 0;
  const lowest = total > 0 ? Math.min(...percentages) : 0;

  const bands = [
    { label: 'ممتاز (85% فأكثر)', color: 'bg-emerald-500', test: (p: number) => p >= 85 },
    { label: 'جيد جداً (75–84%)', color: 'bg-indigo-500', test: (p: number) => p >= 75 && p < 85 },
    { label: 'جيد (65–74%)', color: 'bg-sky-500', test: (p: number) => p >= 65 && p < 75 },
    { label: 'مقبول (50–64%)', color: 'bg-amber-500', test: (p: number) => p >= 50 && p < 65 },
    { label: 'دون التمرير (أقل من 50%)', color: 'bg-rose-500', test: (p: number) => p < 50 },
  ].map((b) => ({ ...b, count: percentages.filter(b.test).length }));

  const stat = (icon: React.ReactNode, label: string, value: string | number) => (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">{label}</div>
        <div className="text-xl font-black text-slate-900 dark:text-white">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
            نتائج وتحليلات: {quiz.title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {quiz.subject?.name || 'مادة عامة'} • {quiz.duration_minutes} دقيقة • {quiz.total_marks} درجة •
            نسبة النجاح المطلوبة {passMark}%
          </p>
        </div>
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stat(<Users className="w-5 h-5" />, 'عدد التسليمات', total)}
        {stat(<Percent className="w-5 h-5" />, 'متوسط النتائج', `${avg}%`)}
        {stat(<CheckCircle2 className="w-5 h-5" />, 'نسبة النجاح', `${passRate}%`)}
        {stat(<Trophy className="w-5 h-5" />, 'أعلى نتيجة', `${highest}%`)}
        {stat(<TrendingDown className="w-5 h-5" />, 'أقل نتيجة', `${lowest}%`)}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6">
        <h2 className="font-bold text-sm text-slate-900 dark:text-white mb-4">توزيع مستويات الطلاب</h2>
        <div className="space-y-3">
          {bands.map((b) => (
            <div key={b.label} className="flex items-center gap-3 text-xs">
              <span className="w-44 shrink-0 text-slate-600 dark:text-slate-300 font-semibold">{b.label}</span>
              <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${b.color} transition-all`}
                  style={{ width: total > 0 ? `${(b.count / total) * 100}%` : '0%' }}
                />
              </div>
              <span className="w-8 text-left font-bold text-slate-700 dark:text-slate-300">{b.count}</span>
            </div>
          ))}
        </div>
        {total === 0 && (
          <p className="text-xs text-slate-400 mt-4">لم يُسلِّم أي طالب هذا الاختبار حتى الآن.</p>
        )}
      </div>

      <SubmissionsTable
        submissions={quizSubmissions}
        title="نتائج الطلاب في هذا الاختبار"
        subtitle="يمكنك فتح ورقة إجابة أي طالب أو منحه صلاحية إعادة المحاولة"
      />
    </div>
  );
};
