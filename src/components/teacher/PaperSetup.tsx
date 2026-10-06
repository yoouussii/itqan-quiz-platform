import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Upload, Trash2, MapPin, X, CheckCircle2, Columns2, MousePointerClick } from 'lucide-react';
import type { PaperPin, QuizPaper } from '../../types';
import { PaperView, PageImage } from '../common/PaperView';
import { renderPdfPages } from '../../utils/fileText';
import { uploadImage } from '../../utils/quizMedia';
import { stripHtml } from '../common/RichText';
import { useApp } from '../../context/AppContext';
import { uiDir, t } from '../../i18n';
import type { QuestionItem } from './QuizEditor';

/** صفحات PDF ← ورقة اختبار (تُرفع الصفحات فوراً إن كان الخادم جاهزاً، وإلا عند الحفظ) */
export async function paperFromPdf(file: File, mode: QuizPaper['mode'] = 'side'): Promise<QuizPaper> {
  const { pages, ratios } = await renderPdfPages(file);
  const up = await Promise.all(pages.map((p) => uploadImage(p).then((r) => r || p)));
  return { pages: up, ratios, mode };
}

/** محرر أماكن الأسئلة على الورقة */
const PinEditor: React.FC<{ paper: QuizPaper; questions: QuestionItem[]; onSave: (pins: Array<PaperPin | undefined>) => void; onClose: () => void }> = ({ paper, questions, onSave, onClose }) => {
  const [pins, setPins] = useState<Array<PaperPin | undefined>>(() => questions.map((q) => q.pin));
  const [sel, setSel] = useState(() => Math.max(0, pins.findIndex((p) => !p)));
  const place = (pin: PaperPin) => {
    setPins((prev) => prev.map((p, i) => (i === sel ? pin : p)));
    // ينتقل تلقائياً لأول سؤال بلا مكان
    setSel((s) => { const next = pins.findIndex((p, i) => i > s && !p); return next >= 0 ? next : s; });
  };
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-stretch justify-center p-2 sm:p-4" dir={uiDir()} role="dialog" aria-modal="true" aria-label={t('أماكن الأسئلة على الورقة')}>
      <div className="w-full max-w-6xl bg-white dark:bg-slate-900 rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800">
          <MapPin className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-900 dark:text-white flex-1">{t('أماكن الأسئلة على الورقة')}</h3>
          <button type="button" onClick={() => onSave(pins)} className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{t('حفظ')}</button>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <p className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 bg-indigo-50/60 dark:bg-indigo-950/30">{t('اختر السؤال من القائمة ثم اضغط مكانه على الورقة. اسحب أي علامة لتعديل مكانها.')}</p>
        <div className="flex-1 min-h-0 grid md:grid-cols-[260px_1fr]">
          <ol className="overflow-y-auto border-e border-slate-200 dark:border-slate-800 p-2 space-y-1 max-h-40 md:max-h-none">
            {questions.map((q, i) => (
              <li key={q.uid || i}>
                <button type="button" onClick={() => setSel(i)} aria-pressed={sel === i}
                  className={`w-full text-start flex items-center gap-2 p-2 rounded-lg text-xs ${sel === i ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
                  <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${pins[i] ? (sel === i ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white') : 'border border-dashed border-current'}`}>{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate">{stripHtml(q.question_text) || t('سؤال')}</span>
                  {pins[i] && <button type="button" onClick={(e) => { e.stopPropagation(); setPins((prev) => prev.map((p, k) => (k === i ? undefined : p))); }} aria-label={t('إزالة المكان')} className="opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>}
                </button>
              </li>
            ))}
          </ol>
          <div className="overflow-y-auto p-3 bg-slate-100 dark:bg-slate-950" data-paper-scroll>
            <PaperView paper={paper} focusIdx={sel}
              pins={pins.map((p, i) => (p ? { idx: i, pin: p, label: String(i + 1), state: i === sel ? 'current' as const : 'answered' as const } : null)).filter(Boolean) as any}
              onPin={(i) => setSel(i)} onPlace={place} onMove={(i, p) => setPins((prev) => prev.map((x, k) => (k === i ? p : x)))} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** بطاقة «ورقة الاختبار الأصلية» في صفحة إنشاء الاختبار */
export const PaperSetup: React.FC<{
  paper: QuizPaper | null; setPaper: (p: QuizPaper | null) => void;
  questions: QuestionItem[]; setQuestions: (qs: QuestionItem[]) => void;
}> = ({ paper, setPaper, questions, setQuestions }) => {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const placed = questions.filter((q) => q.pin).length;

  const onFile = async (f?: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) return showToast(t('الورقة الأصلية تكون ملف PDF. احفظ ملف Word بصيغة PDF ثم ارفعه.'), 'info');
    setBusy(true);
    try { setPaper(await paperFromPdf(f, paper?.mode || 'side')); }
    catch { showToast(t('تعذرت قراءة الملف'), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3" data-testid="paper-setup">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="w-5 h-5 text-indigo-600" />
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{t('ورقة الاختبار الأصلية (اختياري)')}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('يرى الطالب ملفك بشكله نفسه ويحل عليه، والتصحيح تلقائي من الأسئلة.')}</p>
        </div>
        <label className={`h-9 px-3 rounded-xl border border-indigo-300 dark:border-indigo-700 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 inline-flex items-center gap-1.5 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" />{busy ? t('جارٍ التجهيز...') : paper ? t('تغيير الملف') : t('رفع ملف PDF')}
          <input type="file" accept=".pdf" className="sr-only" aria-label={t('ملف الورقة')} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {paper && <button type="button" onClick={() => { setPaper(null); setQuestions(questions.map(({ pin: _p, ...q }) => q)); }} className="h-9 px-3 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1"><Trash2 className="w-4 h-4" />{t('إزالة')}</button>}
      </div>
      {paper && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" dir="ltr">
            {paper.pages.map((src, i) => (
              <div key={i} className="relative shrink-0 w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white overflow-hidden" style={{ height: `${80 * (paper.ratios[i] || 1.414)}px` }}>
                <PageImage src={src} alt={t('صفحة {n}', { n: i + 1 })} />
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label={t('طريقة الحل')}>
            {([
              ['side', Columns2, t('الورقة + ورقة إجابة بجانبها'), t('الأسهل على الجوال: الطالب يقرأ من الورقة ويجيب في الخانات بجانبها.')],
              ['overlay', MousePointerClick, t('الحل على الورقة نفسها'), t('الطالب يضغط علامة السؤال على الورقة فتظهر خانة الإجابة عندها.')],
            ] as const).map(([k, Icon, label, hint]) => (
              <button key={k} type="button" role="radio" aria-checked={paper.mode === k} onClick={() => setPaper({ ...paper, mode: k })}
                className={`text-start p-3 rounded-xl border-2 flex gap-2.5 ${paper.mode === k ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
                <Icon className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <span><span className="block text-xs font-bold text-slate-900 dark:text-white">{label}</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span></span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} disabled={!questions.length}
              className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" />{t('أماكن الأسئلة على الورقة')}</button>
            <span className={`text-xs ${placed < questions.length ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {t('{a} من {b} سؤال لها مكان على الورقة', { a: placed, b: questions.length })}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('مع الورقة الأصلية تبقى الأسئلة بترتيب الورقة نفسه، فلا يعمل «ترتيب مختلف للأسئلة» ولا «أسئلة مختلفة لكل طالب».')}</p>
        </>
      )}
      {editing && paper && <PinEditor paper={paper} questions={questions} onClose={() => setEditing(false)}
        onSave={(pins) => { setQuestions(questions.map((q, i) => { const { pin: _p, ...rest } = q; return pins[i] ? { ...rest, pin: pins[i] } : rest; })); setEditing(false); }} />}
    </div>
  );
};
