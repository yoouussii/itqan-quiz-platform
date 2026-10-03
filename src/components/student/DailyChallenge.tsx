import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Timer, Check, XCircle, Loader2 } from 'lucide-react';
import { RichText } from '../common/RichText';
import { ChallengeQuestion, ChallengeResult, startChallenge, submitChallenge } from '../../services/studentHomeService';
import { uiDir, t } from '../../i18n';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** تحدي اليوم: أسئلة قصيرة بوقت محدد، والتصحيح على الخادم */
export const DailyChallenge: React.FC<{ onClose: (finished: boolean) => void }> = ({ onClose }) => {
  const [qs, setQs] = useState<ChallengeQuestion[] | null>(null);
  const [error, setError] = useState('');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    void startChallenge().then((r) => {
      if (r.error || !r.questions?.length) {
        setError(r.error === 'already_done' ? t('أنهيت تحدي اليوم. عد غداً لتحدٍّ جديد.') : r.error === 'no_questions' ? t('لا توجد أسئلة لتحدي اليوم في موادك بعد.') : t('تعذر تحميل التحدي. حاول مرة أخرى.'));
        return;
      }
      setQs(r.questions);
      setAnswers(r.questions.map(() => null));
      setLeft(r.seconds ?? r.questions.length * 24);
    });
  }, []);

  const finish = useCallback(async () => {
    if (busy || result) return;
    setBusy(true);
    const r = await submitChallenge(answersRef.current);
    setBusy(false);
    if (r.result) setResult(r.result);
    else setError(r.error === 'already_done' ? t('أنهيت تحدي اليوم. عد غداً لتحدٍّ جديد.') : t('تعذر إرسال الإجابات. تحقق من الاتصال وحاول مرة أخرى.'));
  }, [busy, result]);

  // العدّاد: عند انتهاء الوقت تُرسل الإجابات كما هي
  useEffect(() => {
    if (!qs || result || busy) return;
    if (left <= 0) { void finish(); return; }
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left, qs, result, busy, finish]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const q = qs?.[idx];
  const last = !!qs && idx === qs.length - 1;
  const pick = (i: number) => setAnswers((a) => a.map((v, k) => (k === idx ? i : v)));
  const optLabel = (o: string) => (q?.type === 'true_false' ? t(o) : o);

  const body = (() => {
    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 p-8">
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{error}</p>
          <button type="button" onClick={() => onClose(false)} className="h-12 px-8 rounded-xl bg-indigo-600 text-white font-bold">{t('رجوع')}</button>
        </div>
      );
    }
    if (result && qs) {
      const perfect = result.correct === result.total;
      return (
        <div className="flex-1 overflow-y-auto p-5 sm:p-8" data-testid="challenge-result">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="text-6xl" aria-hidden>{perfect ? '🏆' : result.correct >= result.total / 2 ? '🎉' : '💪'}</div>
              <h2 className="font-cairo text-3xl font-black text-slate-900 dark:text-white">
                {perfect ? t('علامة كاملة!') : result.correct >= result.total / 2 ? t('أحسنت!') : t('محاولة جيدة!')}
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300">{t('{c} من {n} إجابات صحيحة', { c: result.correct, n: result.total })}</p>
              <span className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-black text-lg">⭐ <span dir="ltr">+{result.points}</span> {t('نقطة')}</span>
            </div>
            <ol className="space-y-3">
              {qs.map((qq, i) => {
                const r = result.results[i];
                const mine = r?.answer != null ? Number(r.answer) : null;
                return (
                  <li key={qq.id} className={`rounded-2xl border p-4 space-y-2 ${r?.correct ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30'}`}>
                    <div className="flex items-start gap-2">
                      {r?.correct ? <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
                      <div dir="auto" className="font-bold text-slate-900 dark:text-white flex-1 text-start"><RichText html={qq.question_text} /></div>
                    </div>
                    {!r?.correct && (
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {mine != null && <span>{t('إجابتك:')} <b><RichText html={optLabel(qq.options[mine] || '')} inline /></b> · </span>}
                        {t('الصحيحة:')} <b className="text-emerald-700 dark:text-emerald-400"><RichText html={optLabel(qq.options[r?.correct_option_index ?? 0] || '')} inline /></b>
                      </p>
                    )}
                    {r?.explanation && <p className="text-sm text-slate-600 dark:text-slate-400">{r.explanation}</p>}
                  </li>
                );
              })}
            </ol>
            <button type="button" onClick={() => onClose(true)} className="w-full h-13 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg">{t('تم')}</button>
          </div>
        </div>
      );
    }
    if (!qs || !q) {
      return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" aria-label={t('جارٍ التحميل')} /></div>;
    }
    return (
      <div className="flex-1 overflow-y-auto p-5 sm:p-8 flex flex-col">
        <div className="max-w-xl w-full mx-auto flex-1 flex flex-col gap-6">
          {q.subject_name && (
            <span className="self-start inline-flex items-center h-7 px-3 rounded-full text-xs font-bold" style={{ backgroundColor: `${q.subject_color || '#4f46e5'}1f`, color: q.subject_color || '#4f46e5' }}>{q.subject_name}</span>
          )}
          <div dir="auto" className="text-xl sm:text-2xl font-bold leading-relaxed text-slate-900 dark:text-white"><RichText html={q.question_text} /></div>
          <div className="space-y-3" role="radiogroup" aria-label={t('الاختيارات')}>
            {q.options.map((o, i) => {
              const on = answers[idx] === i;
              return (
                <button key={i} type="button" dir="auto" role="radio" aria-checked={on} onClick={() => pick(i)}
                  className={`w-full min-h-[56px] px-4 py-3 rounded-2xl border-2 text-start text-[17px] font-semibold transition ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-slate-300'}`}>
                  <RichText html={optLabel(o)} inline />
                </button>
              );
            })}
          </div>
          <div className="mt-auto pt-2">
            <button type="button" disabled={answers[idx] == null || busy}
              onClick={() => (last ? void finish() : setIdx((i) => i + 1))}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg disabled:opacity-40 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}{last ? t('إنهاء التحدي') : t('التالي')}
            </button>
          </div>
        </div>
      </div>
    );
  })();

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-white dark:bg-slate-950 flex flex-col" dir={uiDir()} role="dialog" aria-modal="true" aria-label={t('تحدي اليوم')} data-testid="daily-challenge">
      <div className="flex items-center gap-3 px-4 sm:px-6 h-16 border-b border-slate-100 dark:border-slate-800">
        <button type="button" onClick={() => { if (result || error || !qs || window.confirm(t('الوقت يستمر حتى لو خرجت، ولن تُحسب الإجابات بعد انتهائه. هل تريد الخروج؟'))) onClose(!!result); }}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('إغلاق')}>
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center gap-1.5" aria-label={t('التقدم')}>
          {(qs || []).map((_, i) => (
            <span key={i} className={`flex-1 h-2.5 rounded-full ${result ? (result.results[i]?.correct ? 'bg-emerald-500' : 'bg-rose-400') : i < idx ? 'bg-indigo-600' : i === idx ? 'bg-indigo-300' : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
        {qs && !result && (
          <span className={`inline-flex items-center gap-1 h-9 px-3 rounded-full font-bold tabular-nums text-sm ${left <= 15 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`} dir="ltr">
            <Timer className="w-4 h-4" />{mmss(Math.max(0, left))}
          </span>
        )}
      </div>
      {body}
    </div>,
    document.body
  );
};
