import React, { Fragment, useMemo, useState } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { stripHtml } from '../common/RichText';
import { t } from '../../i18n';
import { itemAnalysis } from '../../utils/analytics';
import { EmptyMascot } from '../common/Mascot';

/** تصنيف معامل التمييز (المعايير الشائعة في القياس التربوي) */
const discLabel = (d: number) => (d >= 0.4 ? 'ممتاز' : d >= 0.3 ? 'جيد' : d >= 0.2 ? 'مقبول' : 'ضعيف');

/** تحليل أسئلة اختبار واحد: نسبة الإجابات الصحيحة، الصعوبة، وأكثر خيار خاطئ شيوعاً */
export const QuestionAnalysis: React.FC<{ quizId: string }> = ({ quizId }) => {
  const { submissions } = useApp();
  const [hardestFirst, setHardestFirst] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo(() => {
    const questions = StorageService.getQuestionsByQuizId(quizId);
    const subs = (submissions || []).filter((s) => s.quiz_id === quizId);
    return questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => q.type !== 'passage')
      .map(({ q, idx }) => {
        const answers = subs
          .map((s) => (s.answers_json || []).find((a: any) => a.question_id === q.id))
          .filter(Boolean) as Array<{ selected_option?: number | null; is_correct: boolean }>;
        const ia = itemAnalysis(q.id, subs, (q.options || []).length);
        const attempts = answers.length;
        const correct = answers.filter((a) => a.is_correct).length;
        const pct = attempts ? Math.round((correct / attempts) * 100) : null;
        const counts = (q.options || []).map((_, i) => answers.filter((a) => a.selected_option === i).length);
        let wrongIdx = -1;
        let wrongCount = 0;
        counts.forEach((c, i) => {
          if (i !== q.correct_option_index && c > wrongCount) {
            wrongCount = c;
            wrongIdx = i;
          }
        });
        return {
          n: idx + 1,
          text: stripHtml(q.question_text).slice(0, 110) || t('(سؤال بدون نص)'),
          attempts,
          pct,
          level: pct === null ? '—' : pct >= 80 ? t('سهل') : pct >= 50 ? t('متوسط') : t('صعب'),
          disc: ia.discrimination,
          options: (q.options || []).map((o, i) => ({ text: stripHtml(o).slice(0, 60) || `${i + 1}`, count: ia.choices[i], correct: i === q.correct_option_index })),
          blank: ia.blank,
          wrong: wrongIdx >= 0 ? `${stripHtml(q.options?.[wrongIdx] || '').slice(0, 40)} (${wrongCount})` : '—',
        };
      });
  }, [quizId, submissions]);

  const sorted = [...rows].sort((a, b) => (hardestFirst ? (a.pct ?? 101) - (b.pct ?? 101) : a.n - b.n));
  const hardest = [...rows].filter((r) => r.pct !== null).sort((a, b) => (a.pct as number) - (b.pct as number))[0];

  return (
    <section data-testid="question-analysis" className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-base text-slate-900 dark:text-white">{t('تحليل الأسئلة (')}{rows.length})</h2>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={hardestFirst} onChange={(e) => setHardestFirst(e.target.checked)} className="accent-indigo-600" />
          {t('الأصعب أولاً')}
        </label>
      </div>
      {hardest && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {t('أصعب سؤال:')}{' '}<b>{t('السؤال')}{' '}{hardest.n}</b>{' '}{t('— أجاب عنه صحيحاً')}{' '}{hardest.pct}{t('% فقط. يُنصح بإعادة شرح موضوعه.')}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyMascot text={t('لا توجد أسئلة قابلة للتحليل (الاختيار من متعدد / صح وخطأ).')} compact />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2 px-3">#</th><th className="py-2 px-3">{t('السؤال')}</th><th className="py-2 px-3">{t('الإجابات')}</th>
                <th className="py-2 px-3 min-w-[9rem]">{t('نسبة الصحيح')}</th><th className="py-2 px-3">{t('الصعوبة')}</th>
                <th className="py-2 px-3" title={t('الفرق بين نسبة الصواب في أعلى 27% من الطلاب وأدنى 27%. كلما ارتفع كان السؤال أقدر على التمييز بين المتمكن وغيره.')}>{t('معامل التمييز')}</th>
                <th className="py-2 px-3">{t('أكثر خيار خاطئ')}</th><th className="py-2 px-3"><span className="sr-only">{t('توزيع الاختيارات')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map((r) => (
                <Fragment key={r.n}>
                <tr>
                  <td className="py-2 px-3 font-bold">{r.n}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">{r.text}</td>
                  <td className="py-2 px-3">{r.attempts}</td>
                  <td className="py-2 px-3">
                    {r.pct === null ? '—' : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className={`h-full ${r.pct >= 80 ? 'bg-emerald-500' : r.pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="font-bold w-9">{r.pct}%</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3">{r.level}</td>
                  <td className="py-2 px-3">
                    {r.disc === null ? <span className="text-slate-400" title={t('يحتاج 5 تسليمات على الأقل')}>—</span> : (
                      <span className={`inline-flex items-center gap-1 font-bold ${r.disc < 0.2 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                        {r.disc < 0.2 && <AlertTriangle className="w-3.5 h-3.5" aria-hidden />}
                        {r.disc.toFixed(2)} <span className="font-normal">({t(discLabel(r.disc))})</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{r.wrong}</td>
                  <td className="py-2 px-3">
                    {r.options.length > 0 && (
                      <button type="button" aria-expanded={open === r.n} onClick={() => setOpen(open === r.n ? null : r.n)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap">
                        {t('الاختيارات')}<ChevronDown className={`w-3.5 h-3.5 transition ${open === r.n ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </td>
                </tr>
                {open === r.n && (
                  <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                    <td />
                    <td colSpan={7} className="py-3 px-3">
                      <div className="space-y-1.5 max-w-xl" data-testid="distractors">
                        {r.options.map((o, i) => {
                          const share = r.attempts ? Math.round((o.count / r.attempts) * 100) : 0;
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <span className={`w-48 shrink-0 truncate ${o.correct ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`} title={o.text}>
                                {o.correct ? '✓ ' : ''}{o.text}
                              </span>
                              <div className="flex-1 h-2 rounded-full bg-slate-200/70 dark:bg-slate-700 overflow-hidden">
                                <div className={`h-full ${o.correct ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'}`} style={{ width: `${share}%` }} />
                              </div>
                              <span className="w-20 text-end font-bold text-slate-700 dark:text-slate-200">{share}% ({o.count})</span>
                            </div>
                          );
                        })}
                        {r.blank > 0 && <p className="text-[11px] text-slate-500">{t('بدون إجابة: {n}', { n: r.blank })}</p>}
                        {r.options.some((o) => !o.correct && o.count === 0) && r.attempts >= 5 && (
                          <p className="text-[11px] text-slate-500">{t('خيار لم يختره أحد لا يعمل كمشتّت؛ فكّر في استبداله بخيار أقرب.')}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
