import React, { useEffect, useState } from 'react';
import { ClipboardList, X, Star } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from './ui';
import { Survey, fetchMySurveys, submitSurvey } from '../../services/visitsSurveysService';
import { uiDir, t } from '../../i18n';

export const SurveyAnswerModal: React.FC<{ survey: Survey; onClose: () => void; onDone: () => void }> = ({ survey, onClose, onDone }) => {
  const { showToast } = useApp();
  const [ans, setAns] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const miss = survey.questions.find((q) => q.required !== false && (ans[q.id] === undefined || ans[q.id] === ''));
    if (miss) return showToast(t('أجب عن السؤال: {q}', { q: miss.text }), 'error');
    setBusy(true);
    const r = await submitSurvey(survey.id, ans);
    setBusy(false);
    if (!r.ok) return showToast(/already/.test(r.error || '') ? t('أجبت عن هذا الاستبيان من قبل') : /closed/.test(r.error || '') ? t('الاستبيان مغلق') : t('تعذر الإرسال'), 'error');
    showToast(t('شكراً لك! وصلت إجابتك'), 'success');
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={survey.title} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1"><h2 className="font-bold text-lg text-slate-900 dark:text-white">{survey.title}</h2>{survey.description && <p className="text-sm text-slate-500 mt-0.5">{survey.description}</p>}
            {survey.anonymous && <p className="text-xs text-emerald-700 mt-1">{t('إجابتك مجهولة الهوية')}</p>}</div>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {survey.questions.map((q, i) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="font-semibold text-slate-900 dark:text-white text-[15px]">{i + 1}. {q.text}{q.required !== false && <span className="text-rose-500"> *</span>}</legend>
              {q.type === 'rating' && (
                <div className="flex gap-2" role="radiogroup" aria-label={q.text}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={ans[q.id] === n} aria-label={String(n)} onClick={() => setAns({ ...ans, [q.id]: n })}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${Number(ans[q.id]) >= n ? 'bg-amber-400 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}><Star className="w-5 h-5" fill="currentColor" /></button>
                  ))}
                </div>
              )}
              {q.type === 'choice' && (q.options || []).map((o) => (
                <label key={o} className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer text-sm ${ans[q.id] === o ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="radio" name={q.id} checked={ans[q.id] === o} onChange={() => setAns({ ...ans, [q.id]: o })} />{o}
                </label>
              ))}
              {q.type === 'text' && <textarea value={String(ans[q.id] ?? '')} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value.slice(0, 2000) })} rows={3} aria-label={q.text} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />}
            </fieldset>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800"><Button className="w-full" disabled={busy} onClick={() => void send()}>{busy ? t('جارٍ الإرسال…') : t('إرسال الإجابة')}</Button></div>
      </div>
    </div>
  );
};

/** بطاقة في الصفحة الرئيسية لولي الأمر/الطالب/المعلم عند وجود استبيان لم يُجب عنه */
export const SurveyPrompt: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [list, setList] = useState<Survey[]>([]);
  const [open, setOpen] = useState<Survey | null>(null);
  useEffect(() => { void fetchMySurveys().then((l) => setList(l.filter((s) => !s.answered))); }, []);
  if (!list.length) return null;
  const s = list[0];
  return (
    <>
      <section className={`rounded-3xl border border-indigo-200 dark:border-indigo-900 bg-gradient-to-l from-indigo-50 to-white dark:from-indigo-950/40 dark:to-slate-900 p-5 flex flex-wrap items-center gap-3 ${className}`} data-testid="survey-prompt">
        <ClipboardList className="w-8 h-8 text-indigo-600 shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <div className="font-bold text-slate-900 dark:text-white">{t('استبيان جديد: {t}', { t: s.title })}</div>
          <div className="text-sm text-slate-600 dark:text-slate-300">{list.length > 1 ? t('لديك {n} استبيانات بانتظار رأيك', { n: list.length }) : t('رأيك يهمنا، ولن يستغرق أكثر من دقيقة')}</div>
        </div>
        <Button onClick={() => setOpen(s)}>{t('أجب الآن')}</Button>
      </section>
      {open && <SurveyAnswerModal survey={open} onClose={() => setOpen(null)} onDone={() => { setList((l) => l.filter((x) => x.id !== open.id)); setOpen(null); }} />}
    </>
  );
};
