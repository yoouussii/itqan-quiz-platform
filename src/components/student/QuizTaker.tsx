import React, { useState, useEffect } from 'react';
import {
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Flag,
  Send,
  BookOpen,
} from 'lucide-react';
import { StorageService } from '../../services/storage';
import { useApp } from '../../context/AppContext';
import { RichText } from '../common/RichText';

interface QuizTakerProps {
  quizId: string;
  onFinish: (submissionId: string) => void;
  onCancel: () => void;
}

export const QuizTaker: React.FC<QuizTakerProps> = ({ quizId, onFinish, onCancel }) => {
  const { submitQuizAttempt } = useApp();
  const quiz = StorageService.getQuizWithDetails(quizId);
  const questions = StorageService.getQuestionsByQuizId(quizId);

  const [hasStarted, setHasStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, number | null>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});
  const [secondsRemaining, setSecondsRemaining] = useState(
    (quiz?.duration_minutes || 20) * 60
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Countdown timer
  useEffect(() => {
    if (!hasStarted) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasStarted]);

  if (!quiz || questions.length === 0) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-slate-500 dark:text-slate-400">عذراً، لم يتم العثور على أسئلة لهذا الاختبار.</p>
        <button
          onClick={onCancel}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
        >
          العودة
        </button>
      </div>
    );
  }

  const currentQ = questions[currentQuestionIndex];
  const answeredCount = Object.values(userAnswers).filter((v) => v !== null).length;
  const progressPercentage = Math.round((answeredCount / questions.length) * 100);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = secondsRemaining < 120;

  const handleSelectOption = (optIdx: number) => {
    setUserAnswers({
      ...userAnswers,
      [currentQ.id]: optIdx,
    });
  };

  const toggleFlag = (qId: string) => {
    setFlaggedQuestions({
      ...flaggedQuestions,
      [qId]: !flaggedQuestions[qId],
    });
  };

  const handleFinalSubmit = () => {
    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    const answersArray = questions.map((q) => ({
      question_id: q.id,
      selected_option: userAnswers[q.id] !== undefined ? userAnswers[q.id] : null,
    }));

    const submission = submitQuizAttempt(quiz.id, answersArray, timeSpent);
    onFinish(submission.id);
  };

  // Pre-test Briefing Screen
  if (!hasStarted) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4" dir="rtl">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-card border border-slate-200/80 dark:border-slate-800 text-center">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <BookOpen className="w-8 h-8" />
          </div>

          <span
            className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-3"
            style={{
              backgroundColor: `${quiz.subject?.color || '#6366f1'}15`,
              color: quiz.subject?.color || '#6366f1',
            }}
          >
            {quiz.subject?.name}
          </span>

          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo mb-2">{quiz.title}</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
            {quiz.description || 'اختبار تقييمي لقياس التحصيل العلمي والمعرفي في المادة الدراسية.'}
          </p>

          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 mb-8 text-right">
            <div>
              <span className="text-[11px] text-slate-400 block font-semibold">عدد الأسئلة</span>
              <span className="text-base font-bold text-slate-800 dark:text-slate-200 font-cairo">
                {questions.length} أسئلة
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-semibold">الدرجة الكلية</span>
              <span className="text-base font-bold text-slate-800 dark:text-slate-200 font-cairo">
                {quiz.total_marks} درجات
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-semibold">الزمن المتاح</span>
              <span className="text-base font-bold text-slate-800 dark:text-slate-200 font-cairo">
                {quiz.duration_minutes} دقيقة
              </span>
            </div>
          </div>

          <div className="text-right text-xs text-slate-600 dark:text-slate-300 space-y-2 mb-8 bg-amber-50/50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200/60 dark:border-amber-800/60">
            <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>إرشادات وتعليمات الاختبار في منصة إتقان:</span>
            </div>
            <p>• يبدأ المؤقت التنازلي فور الضغط على زر بدء الاختبار أدناه.</p>
            <p>• يمكنك التنقل بحرية بين الأسئلة وتعديل إجاباتك قبل التسليم النهائي.</p>
            <p>• يتم تصحيح الاختبار وتوليد تقرير تفصيلي لدرجتك فور التسليم مباشرة.</p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={onCancel}
              className="px-6 py-3 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              إلغاء وخروج
            </button>
            <button
              onClick={() => {
                setHasStarted(true);
                setStartTime(Date.now());
              }}
              className="px-10 py-3 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
            >
              ابدأ الاختبار الآن 🚀
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4" dir="rtl">
      {/* Top Test Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-soft mb-6 sticky top-20 z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${quiz.subject?.color || '#6366f1'}15`,
                  color: quiz.subject?.color || '#6366f1',
                }}
              >
                {quiz.subject?.name}
              </span>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">{quiz.title}</h2>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              تمت الإجابة على{' '}
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{answeredCount}</span> من أصل{' '}
              <span className="font-bold">{questions.length}</span> أسئلة ({progressPercentage}%)
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Countdown Timer */}
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-mono text-sm font-bold border transition-colors ${
                isLowTime
                  ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800 animate-pulse'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Clock className={`w-4 h-4 ${isLowTime ? 'text-rose-600' : 'text-slate-500'}`} />
              <span className="tracking-wider">{formatTimer(secondsRemaining)}</span>
            </div>

            {/* Submit Button */}
            <button
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
            >
              <Send className="w-4 h-4 rotate-180" />
              <span>تسليم الاختبار</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-4">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Area */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-soft">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center font-cairo">
                {currentQuestionIndex + 1}
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                السؤال {currentQuestionIndex + 1} من {questions.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg">
                +{currentQ.marks} درجات
              </span>

              <button
                onClick={() => toggleFlag(currentQ.id)}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  flaggedQuestions[currentQ.id]
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
                title="تحديد السؤال للمراجعة لاحقاً"
              >
                <Flag
                  className={`w-3.5 h-3.5 ${
                    flaggedQuestions[currentQ.id] ? 'fill-amber-600 text-amber-600' : ''
                  }`}
                />
                <span className="hidden sm:inline">
                  {flaggedQuestions[currentQ.id] ? 'مُعلَم للمراجعة' : 'تعليم'}
                </span>
              </button>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-relaxed font-cairo">
              <RichText html={currentQ.question_text} />
            </h3>
          </div>

          {/* Options */}
          <div className="space-y-3 mb-8">
            {(currentQ.options || []).map((optionText, optIdx) => {
              const isSelected = userAnswers[currentQ.id] === optIdx;
              const optionLetters = ['أ', 'ب', 'ج', 'د'];

              return (
                <div
                  key={optIdx}
                  onClick={() => handleSelectOption(optIdx)}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/70 shadow-sm ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-200 hover:bg-slate-50/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span
                      className={`w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                      }`}
                    >
                      {optionLetters[optIdx] || optIdx + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        isSelected ? 'font-bold text-indigo-950 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200 font-medium'
                      }`}
                    >
                      <RichText html={optionText} inline />
                    </span>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-slate-300 dark:border-slate-600 group-hover:border-indigo-400'
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stepper Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>السؤال السابق</span>
            </button>

            {currentQuestionIndex < questions.length - 1 ? (
              <button
                onClick={() =>
                  setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))
                }
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/20"
              >
                <span>السؤال التالي</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmModal(true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md shadow-emerald-600/20"
              >
                <span>مراجعة وتسليم الاختبار</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Questions Stepper Sidebar */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-soft h-fit">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            خريطة الأسئلة ({questions.length})
          </h4>

          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 gap-2 mb-6">
            {questions.map((q, idx) => {
              const isAnswered = userAnswers[q.id] !== undefined && userAnswers[q.id] !== null;
              const isCurrent = currentQuestionIndex === idx;
              const isFlagged = flaggedQuestions[q.id];

              let btnClasses =
                'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-400';

              if (isCurrent) {
                btnClasses = 'border-indigo-600 bg-indigo-600 text-white font-bold shadow-md';
              } else if (isFlagged) {
                btnClasses = 'border-amber-400 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-bold';
              } else if (isAnswered) {
                btnClasses = 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold';
              }

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={`h-10 rounded-xl border text-xs flex items-center justify-center relative transition-all ${btnClasses}`}
                >
                  <span>{idx + 1}</span>
                  {isFlagged && !isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 absolute top-1 right-1" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 text-[11px] text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-indigo-600" />
              <span>السؤال الحالي المعروض</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-emerald-500" />
              <span>تمت الإجابة عليه</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-amber-400" />
              <span>مُعلَم لمراجعته لاحقاً</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700" />
              <span>لم تتم الإجابة عليه بعد</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-center animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">هل أنت متأكد من تسليم الاختبار؟</h3>

            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              لقد أجبت على <span className="font-bold text-emerald-600 dark:text-emerald-400">{answeredCount}</span> من أصل{' '}
              <span className="font-bold">{questions.length}</span> أسئلة.
              {answeredCount < questions.length && (
                <span className="block text-rose-600 dark:text-rose-400 font-bold mt-1">
                  تنبيه: يوجد {questions.length - answeredCount} أسئلة متروكة دون إجابة!
                </span>
              )}
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                العودة للأسئلة
              </button>
              <button
                onClick={handleFinalSubmit}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 transition-all"
              >
                نعم، اعتمد التسليم فوراً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
