import React from 'react';
import { AnswerItem, Question } from '../../types';
import { RichText } from './RichText';

export type AnswerStatus = 'correct' | 'partial' | 'wrong' | 'pending';

/** حالة إجابة السؤال للعرض: صحيحة / جزئية (قطعة) / خاطئة / بانتظار التصحيح اليدوي (مقالي) */
export function answerStatus(question: Question, ans?: AnswerItem): AnswerStatus {
  if (ans?.is_correct) return 'correct';
  if (question.type === 'essay') return 'pending';
  if (question.type === 'passage') {
    if ((ans?.marks_awarded || 0) > 0) return 'partial';
    const hasEssay = (question.sub_questions || []).some((sq) => sq.type === 'essay');
    const autoMarks = (question.sub_questions || [])
      .filter((sq) => sq.type !== 'essay')
      .reduce((s, sq) => s + (Number(sq.marks) || 0), 0);
    if (hasEssay && autoMarks === 0) return 'pending';
  }
  return 'wrong';
}

export const STATUS_LABEL: Record<AnswerStatus, (awarded: number, marks: number) => string> = {
  correct: (_a, m) => `+${m} درجات`,
  partial: (a, m) => `${a} من ${m}`,
  wrong: (_a, m) => `0 من ${m}`,
  pending: (_a, m) => `بانتظار التصحيح (${m})`,
};

const letters = ['أ', 'ب', 'ج', 'د'];

const TextAnswer: React.FC<{ text?: string }> = ({ text }) => (
  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-xs">
    <div className="font-bold text-slate-500 dark:text-slate-400 mb-1">الإجابة المكتوبة:</div>
    <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200 leading-relaxed">
      {text?.trim() || <span className="text-slate-400">لم تتم الإجابة</span>}
    </p>
    <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mt-2">سؤال مقالي: يُصحَّح يدوياً</div>
  </div>
);

/** تفاصيل إضافية لأسئلة المقالي والقطعة (أسئلة الاختيار تعرضها الصفحة نفسها) */
export const AnswerExtras: React.FC<{ question: Question; answer?: AnswerItem }> = ({ question, answer }) => {
  if (question.type === 'essay') {
    return (
      <div className="mb-3">
        <TextAnswer text={answer?.text_answer} />
      </div>
    );
  }
  if (question.type !== 'passage') return null;

  return (
    <div className="space-y-3 mb-3">
      {(question.sub_questions || []).map((sq, i) => {
        const sa = answer?.sub_answers?.find((x) => x.sub_question_id === sq.id);
        const ok = !!sa?.is_correct;
        return (
          <div key={sq.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3 mb-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <div className="flex items-start gap-1.5">
                <span className="text-indigo-600 dark:text-indigo-400">{i + 1}.</span>
                <RichText html={sq.question_text} />
              </div>
              <span
                className={`shrink-0 ${
                  sq.type === 'essay'
                    ? 'text-amber-700 dark:text-amber-300'
                    : ok
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                {sq.type === 'essay' ? `— / ${sq.marks}` : `${sa?.marks_awarded || 0} / ${sq.marks}`}
              </span>
            </div>
            {sq.type === 'essay' ? (
              <TextAnswer text={sa?.text_answer} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(sq.options || []).map((opt, optIdx) => {
                  const isCorrectOption = optIdx === sq.correct_option_index;
                  const isSelected = sa?.selected_option === optIdx;
                  const cls = isCorrectOption
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 font-semibold'
                    : isSelected
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/80 text-rose-900 dark:text-rose-200 font-semibold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300';
                  return (
                    <div key={optIdx} className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${cls}`}>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-white/80 dark:bg-slate-700 border text-[11px] font-bold flex items-center justify-center shrink-0">
                          {letters[optIdx] || optIdx + 1}
                        </span>
                        <RichText html={opt} inline />
                      </div>
                      {isSelected && <span className="text-[10px] font-bold">الإجابة المختارة</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
