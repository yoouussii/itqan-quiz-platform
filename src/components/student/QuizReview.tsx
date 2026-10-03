import React from 'react';
import { CheckCircle2, XCircle, Clock, ArrowRight, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { pointsForResult } from '../../utils/points';
import { Chip } from '../common/ui';
import { StorageService } from '../../services/storage';
import { RichText } from '../common/RichText';
import { formatQuizDateTime } from '../../utils/quizWindow';
import { AnswerExtras, answerStatus, STATUS_LABEL } from '../common/AnswerExtras';
import { uiDir, t, optionLetters, isEn } from '../../i18n';

interface QuizReviewProps {
  submissionId: string;
  onBack: () => void;
}

export const QuizReview: React.FC<QuizReviewProps> = ({ submissionId, onBack }) => {
  const { currentUser } = useApp();
  const submission = StorageService.getSubmissionWithDetails(submissionId);

  if (!submission) {
    return (
      <div className="p-8 text-center" dir={uiDir()}>
        <p className="text-slate-500 dark:text-slate-400">{t('لم يتم العثور على ورقة الإجابة المطلوبة.')}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
        >
          {t('العودة للوحة الرئيسية')}
        </button>
      </div>
    );
  }

  const questions = submission.quiz_id
    ? StorageService.getQuestionsByQuizId(submission.quiz_id)
        // «أسئلة مختلفة لكل طالب»: أسئلة هذا الطالب فقط (الموجودة في إجاباته)
        .filter((q) => !submission.quiz?.questions_per_student || submission.answers_json.some((a) => a.question_id === q.id))
    : [];

  const isPassed = submission.percentage >= (submission.quiz?.pass_percentage || 60);
  // الخادم يخفي الإجابات النموذجية حتى ينتهي وقت إتاحة الاختبار (حتى لا تنتقل للزملاء)
  const answersHidden =
    questions.length > 0 &&
    questions.every((q) =>
      q.type === 'essay' ||
      (q.type === 'passage'
        ? (q.sub_questions || []).every((sq) => sq.type === 'essay' || sq.correct_option_index === undefined)
        : q.correct_option_index === undefined)
    ) &&
    questions.some((q) => q.type !== 'essay');

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const pass = submission.quiz?.pass_percentage || 50;
  const pct = Number(submission.percentage) || 0;
  const statuses = questions.map((q) => answerStatus(q, submission.answers_json.find((a) => a.question_id === q.id)));
  const correctCount = statuses.filter((x) => x === 'correct').length;
  const wrongCount = statuses.filter((x) => x === 'wrong').length;
  const pendingCount = statuses.filter((x) => x === 'pending').length;
  const earned = pointsForResult(pct, pass).total;
  const firstName = (currentUser?.role === 'student' ? currentUser.name : submission.student?.name || '').split(' ')[0];
  const ringColor = isPassed ? '#0f8a63' : pct >= pass * 0.8 ? '#d97706' : '#dc2626';
  const female = (currentUser?.role === 'student' ? currentUser.gender : submission.student?.gender) === 'female';
  const headline = pendingCount > 0
    ? t('تم التسليم، وبعض الإجابات قيد التصحيح')
    : pct >= 90 ? t(female ? t('ممتازة يا {name}!') : t('ممتاز يا {name}!'), { name: firstName }) : isPassed ? t(female ? t('أحسنتِ يا {name}!') : t('أحسنت يا {name}!'), { name: firstName }) : t('فرصة للمراجعة والتحسين');

  return (
    <div className="max-w-2xl mx-auto py-6 sm:py-8 px-4 space-y-5" dir={uiDir()}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 h-10 text-[15px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-700">
        <ArrowRight className="w-5 h-5 dir-icon" />{t('رجوع')}
      </button>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-3">
        <div className="w-[150px] h-[150px] rounded-full flex items-center justify-center" style={{ background: `conic-gradient(${ringColor} 0 ${pct}%, rgba(148,163,184,.25) ${pct}% 100%)` }}
          role="img" aria-label={t('النتيجة {pct}%', { pct })}>
          <div className="w-[118px] h-[118px] rounded-full bg-white dark:bg-slate-900 flex flex-col items-center justify-center">
            <div className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">{pct}%</div>
            <div className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">{t('{a} من {m}', { a: submission.score, m: submission.total_possible_score })}</div>
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{headline}</h1>
        <div className="text-[15px] text-slate-500 dark:text-slate-400">{[submission.quiz?.title, submission.subject?.name].filter(Boolean).join(' · ')}</div>
        <div className="flex flex-wrap justify-center gap-2">
          {pendingCount > 0 ? <Chip tone="info">{t('قيد التصحيح')}</Chip> : <Chip tone={isPassed ? 'ok' : 'bad'}>{isPassed ? (female ? t('ناجحة') : t('ناجح')) : t('دون درجة النجاح')}</Chip>}
          {currentUser?.role === 'student' && <Chip tone="warn">{t('+{n} نقطة', { n: earned })}</Chip>}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{correctCount}</div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">{t('صحيحة')}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center">
          <div className="text-xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">{wrongCount}</div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">{t('خاطئة')}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center">
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums" dir="ltr">{formatDuration(submission.time_spent_seconds)}</div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">{t('الوقت')}</div>
        </div>
      </div>

      {answersHidden && (
        <div className="flex gap-2.5 items-start rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 px-4 py-3">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-[14.5px] leading-relaxed font-medium">
            {t('الإجابات الصحيحة والشرح تظهر بعد انتهاء وقت الاختبار للجميع')}
            {submission.quiz?.end_date ? `${isEn() ? ', ' : '، '}${formatQuizDateTime(submission.quiz.end_date, 'end')}` : ''}.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white pt-1">{t('مراجعة إجاباتك')}</h2>

        {questions.map((question, qIdx) => {
          const studentAns = submission.answers_json.find((a) => a.question_id === question.id);
          const status = answerStatus(question, studentAns);
          const isCorrect = status === 'correct';
          const isNeutral = status === 'partial' || status === 'pending';
          const selectedIdx = studentAns?.selected_option;

          return (
            <div
              key={question.id}
              className={`p-5 rounded-2xl border transition-all ${
                isCorrect
                  ? 'border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-slate-900 shadow-sm'
                  : isNeutral
                  ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/20 shadow-sm'
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
                  <h3 className="font-bold text-slate-900 dark:text-white text-base leading-relaxed">
                    <RichText html={question.question_text} />
                  </h3>
                </div>

                <div className="shrink-0">
                  {isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-3 py-1 rounded-xl text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{t('+{m} درجات', { m: question.marks })}</span>
                    </span>
                  ) : isNeutral ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 px-3 py-1 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>{STATUS_LABEL[status](studentAns?.marks_awarded || 0, question.marks)}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 px-3 py-1 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-800">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>{t('0 من {m}', { m: question.marks })}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                {(question.options || []).map((opt, optIdx) => {
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
                      className={`p-3.5 rounded-xl border text-[15px] flex items-center justify-between gap-2 ${optClass}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-lg bg-white/90 dark:bg-slate-700 border text-[11px] font-bold flex items-center justify-center shrink-0">
                          {optionLetters()[optIdx]}
                        </span>
                        <span><RichText html={opt} inline /></span>
                      </div>

                      <div className="text-[10px] font-bold">
                        {isCorrectOption && (
                          <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">
                            {t('الإجابة النموذجية ✓')}
                          </span>
                        )}
                        {isUserSelection && !isCorrectOption && (
                          <span className="text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 rounded-md">
                            {t('إجابتك المسجلة ✗')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <AnswerExtras question={question} answer={studentAns} />

              {/* Explanation Box */}
              {question.explanation && (
                <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-4 text-xs">
                  <div className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 mb-1">
                    <span>{t('💡 الشرح والتعليل النموذجي:')}</span>
                  </div>
                  <p className="text-indigo-800 dark:text-indigo-200 leading-relaxed font-medium">
                    <RichText html={question.explanation} />
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Action Footer */}
      <div className="pt-2 flex items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto h-[52px] px-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-base font-bold"
        >
          {t('العودة للرئيسية')}
        </button>
      </div>
    </div>
  );
};
