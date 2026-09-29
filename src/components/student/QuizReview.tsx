import React from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  BookOpen,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { StorageService } from '../../services/storage';

interface QuizReviewProps {
  submissionId: string;
  onBack: () => void;
}

export const QuizReview: React.FC<QuizReviewProps> = ({ submissionId, onBack }) => {
  const submission = StorageService.getSubmissionWithDetails(submissionId);

  if (!submission) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-slate-500 dark:text-slate-400">لم يتم العثور على ورقة الإجابة المطلوبة.</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
        >
          العودة للوحة الرئيسية
        </button>
      </div>
    );
  }

  const questions = submission.quiz_id
    ? StorageService.getQuestionsByQuizId(submission.quiz_id)
    : [];

  const isPassed = submission.percentage >= (submission.quiz?.pass_percentage || 60);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'دقيقتان';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} دقيقة و ${secs} ثانية`;
  };

  const getEvaluationTheme = (percentage: number) => {
    if (percentage >= 90) {
      return {
        title: 'أداء استثنائي وممتاز! 🌟',
        subtitle: 'أحسنت صنعاً! لقد أظهرت استيعاباً فائقاً لكافة مفاهيم الاختبار.',
        badge: 'ممتاز (تفوق أكاديمي)',
        color: 'emerald',
        bg: 'from-emerald-500 to-teal-600',
      };
    }
    if (percentage >= 80) {
      return {
        title: 'مستوى متقدم وجيد جداً! 👏',
        subtitle: 'إنجاز رائع ومتميز، بقيت خطوات بسيطة للوصول إلى الدرجة الكاملة.',
        badge: 'جيد جداً (متقدم)',
        color: 'indigo',
        bg: 'from-indigo-600 to-primary-700',
      };
    }
    if (percentage >= 65) {
      return {
        title: 'نتيجة جيدة ومطمئنة 👍',
        subtitle: 'أداء طيب مع إمكانية تحسين بعض النقاط بمراجعة الشروحات أدناه.',
        badge: 'جيد (تم اجتياز الاختبار)',
        color: 'sky',
        bg: 'from-sky-500 to-indigo-600',
      };
    }
    if (percentage >= 50) {
      return {
        title: 'تم الاجتياز بنجاح 🎯',
        subtitle: 'لقد حققت الحد الأدنى للنجاح، ننصحك بمراجعة الأسئلة الخاطئة لترسيخ المفاهيم.',
        badge: 'مقبول (ناجح)',
        color: 'amber',
        bg: 'from-amber-500 to-orange-600',
      };
    }
    return {
      title: 'فرصة للمراجعة والتحسين 💪',
      subtitle: 'لم تحقق نسبة النجاح المطلوبة هذه المرة، راجع الشروحات بدقة وكرر المحاولة لاحقاً.',
      badge: 'راسب (بحاجة لدعم إضافي)',
      color: 'rose',
      bg: 'from-rose-500 to-red-600',
    };
  };

  const evalTheme = getEvaluationTheme(submission.percentage);
  const correctAnswersCount = submission.answers_json.filter((a) => a.is_correct).length;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4" dir="rtl">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 mb-6 font-bold transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        <span>العودة إلى لوحة الطالب الرئيسية</span>
      </button>

      {/* Hero Score Showcase Card */}
      <div
        className={`bg-gradient-to-r ${evalTheme.bg} rounded-3xl p-8 sm:p-10 text-white shadow-xl mb-8 relative overflow-hidden`}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{evalTheme.badge}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-cairo mb-2">{evalTheme.title}</h1>
            <p className="text-xs sm:text-sm text-white/90 max-w-lg leading-relaxed">
              {evalTheme.subtitle}
            </p>
            <div className="text-xs text-white/80 mt-3 font-semibold">
              منصة إتقان • الاختبار: {submission.quiz?.title} • المادة: {submission.subject?.name}
            </div>
          </div>

          {/* Big Circular Score Display */}
          <div className="flex flex-col items-center justify-center p-5 rounded-3xl bg-white/15 backdrop-blur-md border border-white/20 shrink-0">
            <span className="text-xs text-white/80 font-bold mb-1">النسبة المحققة</span>
            <div className="text-4xl sm:text-5xl font-black font-cairo tracking-tight">
              {submission.percentage}%
            </div>
            <div className="text-xs text-white/90 font-bold mt-1">
              {submission.score} من {submission.total_possible_score} درجات
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-8 pt-6 border-t border-white/20 grid grid-cols-3 gap-4 text-center">
          <div>
            <span className="text-[11px] text-white/70 block font-medium">الأسئلة الصحيحة</span>
            <span className="text-base font-bold font-cairo">
              {correctAnswersCount} من {questions.length}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-white/70 block font-medium">الزمن المستغرق</span>
            <span className="text-base font-bold font-cairo">
              {formatDuration(submission.time_spent_seconds)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-white/70 block font-medium">حالة النتيجة</span>
            <span className="text-base font-bold font-cairo">
              {isPassed ? 'تم الاجتياز بنجاح ✅' : 'يحتاج إعادة تقييم ❌'}
            </span>
          </div>
        </div>
      </div>

      {/* Question By Question Detailed Review */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-cairo">
              مراجعة الأسئلة وتصحيح الأخطاء بالتفصيل
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              استعرض إجاباتك مقارنة بالإجابات النموذجية مع الشرح الوافي
            </p>
          </div>
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900">
            {questions.length} أسئلة مراجعة
          </span>
        </div>

        {questions.map((question, qIdx) => {
          const studentAns = submission.answers_json.find((a) => a.question_id === question.id);
          const isCorrect = studentAns?.is_correct ?? false;
          const selectedIdx = studentAns?.selected_option;

          return (
            <div
              key={question.id}
              className={`p-6 rounded-3xl border transition-all ${
                isCorrect
                  ? 'border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-slate-900 shadow-sm'
                  : 'border-rose-200 dark:border-rose-800/80 bg-rose-50/20 dark:bg-rose-950/20 shadow-sm'
              }`}
            >
              {/* Question header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                      isCorrect
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    {qIdx + 1}
                  </span>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-relaxed">
                    {question.question_text}
                  </h3>
                </div>

                <div className="shrink-0">
                  {isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-3 py-1 rounded-xl text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>+{question.marks} درجات</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 px-3 py-1 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-800">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>0 من {question.marks}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                {question.options.map((opt, optIdx) => {
                  const isCorrectOption = optIdx === question.correct_option_index;
                  const isUserSelection = selectedIdx === optIdx;

                  let optClass = 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300';

                  if (isCorrectOption) {
                    optClass =
                      'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-200 font-bold ring-1 ring-emerald-500';
                  } else if (isUserSelection && !isCorrect) {
                    optClass =
                      'border-rose-500 bg-rose-50 dark:bg-rose-950/80 text-rose-950 dark:text-rose-200 font-bold ring-1 ring-rose-500';
                  }

                  return (
                    <div
                      key={optIdx}
                      className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${optClass}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-lg bg-white/90 dark:bg-slate-700 border text-[11px] font-bold flex items-center justify-center shrink-0">
                          {['أ', 'ب', 'ج', 'د'][optIdx]}
                        </span>
                        <span>{opt}</span>
                      </div>

                      <div className="text-[10px] font-bold">
                        {isCorrectOption && (
                          <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">
                            الإجابة النموذجية ✓
                          </span>
                        )}
                        {isUserSelection && !isCorrectOption && (
                          <span className="text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 rounded-md">
                            إجابتك المسجلة ✗
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explanation Box */}
              {question.explanation && (
                <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-4 text-xs">
                  <div className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 mb-1">
                    <span>💡 الشرح والتعليل النموذجي:</span>
                  </div>
                  <p className="text-indigo-800 dark:text-indigo-200 leading-relaxed font-medium">
                    {question.explanation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Action Footer */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-4">
        <button
          onClick={onBack}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-600/30"
        >
          العودة لقائمة اختباراتي
        </button>
      </div>
    </div>
  );
};
