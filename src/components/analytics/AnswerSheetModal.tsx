import React, { useRef } from 'react';
import { X, CheckCircle, XCircle, Clock, Calendar, Award, BookOpen, Printer } from 'lucide-react';
import { SubmissionWithDetails, Question } from '../../types';
import { StorageService } from '../../services/storage';
import { Avatar } from '../common/Avatar';
import { RichText } from '../common/RichText';
import { exportElementToPdf } from '../../utils/exportPdf';
import { useApp } from '../../context/AppContext';
import { AnswerExtras, answerStatus, STATUS_LABEL } from '../common/AnswerExtras';
import { uiDir, optionLetters, t, isEn } from '../../i18n';
import { IntegrityBadge } from '../common/IntegrityBadge';

interface AnswerSheetModalProps {
  submission: SubmissionWithDetails | null;
  onClose: () => void;
}

export const AnswerSheetModal: React.FC<AnswerSheetModalProps> = ({ submission: initial, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const { currentUser, submissions, gradeEssay } = useApp();
  // نسخة محدّثة من التسليم (تتغير بعد تصحيح المقالي)
  const fresh = initial ? submissions.find((x) => x.id === initial.id) : undefined;
  const submission = initial ? { ...initial, ...(fresh || {}) } : null;
  if (!submission) return null;
  const canGrade = !!currentUser && currentUser.role !== 'student' && currentUser.role !== 'parent';

  const questions: Question[] = submission.quiz_id
    ? StorageService.getQuestionsByQuizId(submission.quiz_id)
        // «أسئلة مختلفة لكل طالب»: أسئلة هذا الطالب فقط (الموجودة في إجاباته)
        .filter((q) => !submission.quiz?.questions_per_student || submission.answers_json.some((a) => a.question_id === q.id))
    : [];

  const getGradeBadge = (percentage: number) => {
    if (percentage >= 90) return { label: t('ممتاز'), bg: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
    if (percentage >= 80) return { label: t('جيد جداً'), bg: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
    if (percentage >= 65) return { label: t('جيد'), bg: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800' };
    if (percentage >= 50) return { label: t('مقبول'), bg: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    return { label: t('راسب (بحاجة لتحسين)'), bg: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
  };

  const grade = getGradeBadge(submission.percentage);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return t('غير محدد');
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return t('{m} دقيقة و {s} ثانية', { m: mins, s: secs });
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString(isEn() ? 'en-GB' : 'ar-EG-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // طباعة ورقة الإجابة فقط (وليس الصفحة كاملة)
  const handlePrint = () => {
    if (!contentRef.current) return;
    void exportElementToPdf({
      element: contentRef.current,
      title: t('ورقة إجابة: {name}', { name: submission.student?.name || '' }),
      subtitle: `${submission.quiz?.title || ''}${submission.subject?.name ? ` • ${submission.subject.name}` : ''}`,
      orientation: 'portrait',
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200"
        dir={uiDir()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('ورقة إجابة الطالب التفصيلية')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('منصة إتقان التعليمية | تقرير المراجعة والتحليل')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs flex items-center gap-1.5 transition-colors"
              title={t('طباعة التقرير')}
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">{t('طباعة')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="p-6 space-y-6">
          {/* Student & Quiz Overview Banner */}
          <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-indigo-950/20 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={submission.student?.name || ''} role={submission.student?.role} userId={submission.student_id} size="lg" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">{submission.student?.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>{submission.student_class?.name || t('طالب مسجل')}</span>
                    <span>•</span>
                    <span className="font-mono">{t('هوية:')}{' '}{submission.student?.national_id}</span>
                  </div>
                </div>
              </div>

              {/* Score Badge */}
              <div className="flex items-center gap-3">
                <div className="text-end sm:text-start">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white font-cairo">
                    {submission.score}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      / {submission.total_possible_score}{' '}{t('درجة')}
                    </span>
                  </div>
                  <span
                    className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border ${grade.bg}`}
                  >
                    {grade.label} ({submission.percentage}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Quiz Info Bar */}
            <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold">{submission.quiz?.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{formatDate(submission.completed_at)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{t('المدة المستغرقة:')}{' '}{formatDuration(submission.time_spent_seconds)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-500" />
                <span>{t('نسبة النجاح:')}{' '}{submission.quiz?.pass_percentage}%</span>
              </div>
              {submission.integrity && <div className="col-span-2 sm:col-span-4"><IntegrityBadge integrity={submission.integrity} /></div>}
            </div>
          </div>

          {/* Question by Question Detailed Breakdown */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>{t('تفاصيل الإجابات (')}{questions.length}{' '}{t('أسئلة):')}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                {t('مراجعة الأخطاء مع الشروحات التوضيحية')}
              </span>
            </h4>

            {questions.map((question, qIdx) => {
              const studentAnswer = submission.answers_json?.find(
                (a) => a.question_id === question.id
              );
              const status = answerStatus(question, studentAnswer);
              const isCorrect = status === 'correct';
              const isNeutral = status === 'partial' || status === 'pending';
              const selectedIdx = studentAnswer?.selected_option;

              return (
                <div
                  key={question.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    isCorrect
                      ? 'border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-slate-900 shadow-sm'
                      : isNeutral
                      ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/20'
                      : 'border-rose-200 dark:border-rose-800/80 bg-rose-50/20 dark:bg-rose-950/20'
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                          isCorrect
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {qIdx + 1}
                      </span>
                      <h5 className="font-bold text-slate-800 dark:text-white text-sm">
                        <RichText html={question.question_text} />
                      </h5>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                          isCorrect
                            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : isNeutral
                            ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {isCorrect ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>+{question.marks}{' '}{t('درجات')}</span>
                          </>
                        ) : isNeutral ? (
                          <>
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>{STATUS_LABEL[status](studentAnswer?.marks_awarded || 0, question.marks)}</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>0 / {question.marks}{' '}{t('درجات')}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {(question.options || []).map((opt, optIdx) => {
                      const isSelected = selectedIdx === optIdx;
                      const isCorrectOption = optIdx === question.correct_option_index;

                      let optClasses =
                        'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300';

                      if (isCorrectOption) {
                        optClasses =
                          'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500';
                      } else if (isSelected && !isCorrect) {
                        optClasses =
                          'border-rose-500 bg-rose-50/80 dark:bg-rose-950/80 text-rose-900 dark:text-rose-200 font-semibold ring-1 ring-rose-500';
                      }

                      return (
                        <div
                          key={optIdx}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${optClasses}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-white/80 dark:bg-slate-700 border text-[11px] font-bold flex items-center justify-center shrink-0">
                              {optionLetters()[optIdx] || optIdx + 1}
                            </span>
                            <span><RichText html={opt} inline /></span>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-bold">
                            {isCorrectOption && (
                              <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                                {t('الإجابة الصحيحة')}
                              </span>
                            )}
                            {isSelected && (
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  isCorrect
                                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/60'
                                    : 'text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-900/60'
                                }`}
                              >
                                {t('إجابة الطالب')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <AnswerExtras question={question} answer={studentAnswer}
                    onGrade={canGrade ? (subId, marks) => gradeEssay(submission.id, question.id, subId, marks) : undefined} />

                  {/* Explanation Note */}
                  {question.explanation && (
                    <div className="bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-xl p-3 text-xs text-indigo-950 dark:text-indigo-200">
                      <div className="font-bold flex items-center gap-1.5 mb-1 text-indigo-800 dark:text-indigo-300">
                        <span>{t('💡 التفسير والشرح التعليمي:')}</span>
                      </div>
                      <p className="leading-relaxed font-medium">
                        <RichText html={question.explanation} />
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            {t('إغلاق التقرير')}
          </button>
        </div>
      </div>
    </div>
  );
};
