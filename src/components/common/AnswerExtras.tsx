import React from 'react';
import { AnswerItem, Question } from '../../types';
import { RichText } from './RichText';
import { t, optionLetters } from '../../i18n';

export type AnswerStatus = 'correct' | 'partial' | 'wrong' | 'pending';

/** حالة إجابة السؤال للعرض: صحيحة / جزئية (قطعة) / خاطئة / بانتظار التصحيح اليدوي (مقالي) */
export function answerStatus(question: Question, ans?: AnswerItem): AnswerStatus {
  if (ans?.is_correct) return 'correct';
  if (question.type === 'matching' && (ans?.marks_awarded || 0) > 0) return 'partial';
  if (question.type === 'essay') {
    if (!ans?.graded) return 'pending';
    return (ans.marks_awarded || 0) > 0 ? 'partial' : 'wrong';
  }
  if (question.type === 'passage') {
    if ((ans?.marks_awarded || 0) > 0) return 'partial';
    const hasEssay = (question.sub_questions || []).some(
      (sq) => sq.type === 'essay' && !ans?.sub_answers?.find((x) => x.sub_question_id === sq.id)?.graded
    );
    const autoMarks = (question.sub_questions || [])
      .filter((sq) => sq.type !== 'essay')
      .reduce((s, sq) => s + (Number(sq.marks) || 0), 0);
    if (hasEssay && autoMarks === 0) return 'pending';
  }
  return 'wrong';
}

export const STATUS_LABEL: Record<AnswerStatus, (awarded: number, marks: number) => string> = {
  correct: (_a, m) => t('+{m} درجات', { m }),
  partial: (a, m) => t('{a} من {m}', { a, m }),
  wrong: (_a, m) => t('0 من {m}', { m }),
  pending: (_a, m) => t('بانتظار التصحيح ({m})', { m }),
};

const letters = optionLetters;

type GradeFn = (subQuestionId: string | null, marks: number) => Promise<boolean> | void;

/** خانة درجة المقالي للمعلم */
const GradeBox: React.FC<{ max: number; current?: number; graded?: boolean; onSave: (m: number) => Promise<boolean> | void }> = ({ max, current, graded, onSave }) => {
  const [val, setVal] = React.useState<string>(graded ? String(current ?? 0) : '');
  const [busy, setBusy] = React.useState(false);
  return (
    <div data-pdf-hide className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('الدرجة:')}</label>
      <input type="number" min={0} max={max} step={0.5} value={val} onChange={(e) => setVal(e.target.value)}
        aria-label={t('درجة السؤال المقالي')}
        className="w-20 px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
      <span className="text-[11px] text-slate-500">{t('من')}{' '}{max}</span>
      <button type="button" disabled={busy || val === ''}
        onClick={async () => { setBusy(true); await onSave(Number(val)); setBusy(false); }}
        className="px-3 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
        {graded ? t('تحديث الدرجة') : t('حفظ الدرجة')}
      </button>
      {graded && <span className="text-[11px] font-bold text-emerald-600">{t('✓ مصحَّح')}</span>}
    </div>
  );
};

const TextAnswer: React.FC<{ text?: string; graded?: boolean; awarded?: number; max?: number; feedback?: string; onGrade?: (m: number) => Promise<boolean> | void }> = ({ text, graded, awarded, max = 0, feedback, onGrade }) => (
  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-xs">
    <div className="font-bold text-slate-500 dark:text-slate-400 mb-1">{t('الإجابة المكتوبة:')}</div>
    <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200 leading-relaxed">
      {text?.trim() || <span className="text-slate-400">{t('لم تتم الإجابة')}</span>}
    </p>
    {graded ? (
      <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mt-2">{t('صحّحه المعلم: {a} من {m}', { a: awarded ?? 0, m: max })}</div>
    ) : (
      <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mt-2">{t('سؤال مقالي: بانتظار تصحيح المعلم')}</div>
    )}
    {graded && feedback?.trim() && (
      <div className="mt-2 p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900" data-testid="teacher-feedback">
        <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 mb-0.5">{t('ملاحظة المعلم')}</div>
        <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100 leading-relaxed">{feedback}</p>
      </div>
    )}
    {onGrade && <GradeBox max={max} current={awarded} graded={graded} onSave={onGrade} />}
  </div>
);

/** تفاصيل إضافية لأسئلة المقالي والقطعة (أسئلة الاختيار تعرضها الصفحة نفسها) */
export const AnswerExtras: React.FC<{ question: Question; answer?: AnswerItem; onGrade?: GradeFn }> = ({ question, answer, onGrade }) => {
  if (question.type === 'essay') {
    return (
      <div className="mb-3">
        <TextAnswer text={answer?.text_answer} graded={answer?.graded} awarded={answer?.marks_awarded} max={Number(question.marks) || 0} feedback={answer?.feedback}
          onGrade={onGrade ? (m) => onGrade(null, m) : undefined} />
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
                {sq.type === 'essay' && !sa?.graded ? `— / ${sq.marks}` : `${sa?.marks_awarded || 0} / ${sq.marks}`}
              </span>
            </div>
            {sq.type === 'essay' ? (
              <TextAnswer text={sa?.text_answer} graded={sa?.graded} awarded={sa?.marks_awarded} max={Number(sq.marks) || 0} feedback={sa?.feedback}
                onGrade={onGrade ? (m) => onGrade(sq.id, m) : undefined} />
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
                          {letters()[optIdx] || optIdx + 1}
                        </span>
                        <RichText html={opt} inline />
                      </div>
                      {isSelected && <span className="text-[10px] font-bold">{t('الإجابة المختارة')}</span>}
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
