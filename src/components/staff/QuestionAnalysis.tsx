import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { stripHtml } from '../common/RichText';

/** تحليل أسئلة اختبار واحد: نسبة الإجابات الصحيحة، الصعوبة، وأكثر خيار خاطئ شيوعاً */
export const QuestionAnalysis: React.FC<{ quizId: string }> = ({ quizId }) => {
  const { submissions } = useApp();
  const [hardestFirst, setHardestFirst] = useState(true);

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
          text: stripHtml(q.question_text).slice(0, 110) || '(سؤال بدون نص)',
          attempts,
          pct,
          level: pct === null ? '—' : pct >= 80 ? 'سهل' : pct >= 50 ? 'متوسط' : 'صعب',
          wrong: wrongIdx >= 0 ? `${stripHtml(q.options?.[wrongIdx] || '').slice(0, 40)} (${wrongCount})` : '—',
        };
      });
  }, [quizId, submissions]);

  const sorted = [...rows].sort((a, b) => (hardestFirst ? (a.pct ?? 101) - (b.pct ?? 101) : a.n - b.n));
  const hardest = [...rows].filter((r) => r.pct !== null).sort((a, b) => (a.pct as number) - (b.pct as number))[0];

  return (
    <section data-testid="question-analysis" className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-base text-slate-900 dark:text-white">تحليل الأسئلة ({rows.length})</h2>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={hardestFirst} onChange={(e) => setHardestFirst(e.target.checked)} className="accent-indigo-600" />
          الأصعب أولاً
        </label>
      </div>
      {hardest && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          أصعب سؤال: <b>السؤال {hardest.n}</b> — أجاب عنه صحيحاً {hardest.pct}% فقط. يُنصح بإعادة شرح موضوعه.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">لا توجد أسئلة قابلة للتحليل (الاختيار من متعدد / صح وخطأ).</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2 px-3">#</th><th className="py-2 px-3">السؤال</th><th className="py-2 px-3">الإجابات</th>
                <th className="py-2 px-3 min-w-[9rem]">نسبة الصحيح</th><th className="py-2 px-3">الصعوبة</th><th className="py-2 px-3">أكثر خيار خاطئ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map((r) => (
                <tr key={r.n}>
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
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{r.wrong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
