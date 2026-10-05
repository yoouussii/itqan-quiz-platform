import React, { useMemo } from 'react';
import { ArrowRight, Clock, Award, CheckCircle2, Printer, KeyRound } from 'lucide-react';
import { printQuizPaper } from '../../utils/quizPaper';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { RichText } from './RichText';
import { uiDir, optionLetters, t } from '../../i18n';
import { MascotHere } from './Mascot';

/**
 * معاينة اختبار للقراءة فقط (زر "عرض" عند الآدمن والمعلم).
 * كانت الأزرار تنتقل إلى العرض quiz_preview ولا توجد له صفحة، فتظهر شاشة فارغة.
 */
export const QuizPreview: React.FC = () => {
  const { activeQuizId, setActiveQuizId, setCurrentView, quizzes } = useApp();

  const quiz = useMemo(() => {
    if (!activeQuizId) return null;
    return (
      (quizzes || []).find((q) => q?.id === activeQuizId) ||
      StorageService.getQuizWithDetails(activeQuizId) ||
      null
    );
  }, [activeQuizId, quizzes]);

  const questions = useMemo(
    () => (activeQuizId ? StorageService.getQuestionsByQuizId(activeQuizId) : []),
    [activeQuizId, quiz]
  );

  const goBack = () => {
    setActiveQuizId(null);
    setCurrentView('dashboard');
  };

  if (!activeQuizId || !quiz) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center" dir={uiDir()}>
        <MascotHere className="mx-auto mb-1" />
        <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-1">
          {t('لم يتم العثور على هذا الاختبار')}
        </h2>
        <button
          onClick={goBack}
          className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
        >
          {t('العودة للوحة التحكم')}
        </button>
      </div>
    );
  }

  const letters = optionLetters();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6" dir={uiDir()}>
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
            {t('معاينة:')}{' '}{quiz.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{quiz.subject?.name || t('مادة عامة')}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {quiz.duration_minutes}{' '}{t('دقيقة')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Award className="w-3.5 h-3.5" /> {quiz.total_marks}{' '}{t('درجة')}
            </span>
            <span>{questions.length}{' '}{t('سؤال')}</span>
          </div>
          {quiz.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">{quiz.description}</p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {questions.length > 0 && (
            <>
              <button onClick={() => void printQuizPaper(quiz, questions, false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">
                <Printer className="w-4 h-4" /><span>{t('طباعة ورقة الاختبار')}</span>
              </button>
              <button onClick={() => void printQuizPaper(quiz, questions, true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                <KeyRound className="w-4 h-4" /><span>{t('طباعة نموذج الإجابة')}</span>
              </button>
            </>
          )}
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowRight className="w-4 h-4 dir-icon" />
            <span>{t('رجوع')}</span>
          </button>
        </div>
      </div>

      {questions.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-500">
          {t('لا توجد أسئلة محفوظة لهذا الاختبار.')}
        </div>
      )}

      {questions.map((q, i) => (
        <div
          key={q.id || i}
          className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 shrink-0 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <div className="font-bold text-sm text-slate-900 dark:text-white leading-relaxed">
                <RichText html={q.question_text} />
              </div>
            </div>
            <span className="text-[11px] font-bold text-slate-500 shrink-0">{q.marks}{' '}{t('درجة')}</span>
          </div>

          {(q.options || []).length > 0 && (
            <div className="space-y-2">
              {(q.options || []).map((opt, idx) => {
                const correct = q.correct_option_index === idx;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                      correct
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-bold">{letters[idx] || idx + 1}.</span>
                      <RichText html={opt} inline />
                    </span>
                    {correct && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                );
              })}
            </div>
          )}

          {(q.sub_questions || []).length > 0 && (
            <div className="space-y-3 ps-4 border-s-2 border-indigo-200 dark:border-indigo-900">
              {(q.sub_questions || []).map((sq, si) => (
                <div key={sq.id || si} className="text-xs space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {si + 1}. <RichText html={sq.question_text} inline />
                    <span className="text-slate-400 font-normal"> ({sq.marks}{' '}{t('درجة)')}</span>
                  </div>
                  {(sq.options || []).map((opt, oi) => (
                    <div
                      key={oi}
                      className={
                        sq.correct_option_index === oi
                          ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'text-slate-600 dark:text-slate-400'
                      }
                    >
                      {letters[oi] || oi + 1}. <RichText html={opt} inline />
                      {sq.correct_option_index === oi ? ' ✓' : ''}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {q.explanation && (
            <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-3 text-amber-900 dark:text-amber-200">
              <span className="font-bold">{t('الشرح:')}{' '}</span>
              <RichText html={q.explanation} inline />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
