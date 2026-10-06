import React, { useLayoutEffect, useRef, useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle2, X, Plus, EyeOff, ChevronDown, Layers, ImagePlus, BookOpen, Ungroup } from 'lucide-react';
import { Chip } from '../common/ui';
import { t, optionLetters } from '../../i18n';
import type { ImportMeta } from '../../utils/questionImport';
import { compressImage } from '../../utils/quizMedia';
import { QUESTION_TYPES, QuestionItem, SubQuestion } from './QuizEditor';

export type Row = { q: QuestionItem; meta: ImportMeta; review: boolean; subReview?: boolean[] };

const typeLabel = (type: string) => t(QUESTION_TYPES.find((x) => x.type === type)?.label || '');
/** الأنواع التي يمكن التحويل بينها في المعاينة */
export const SWITCHABLE = ['mcq', 'true_false', 'fill_blank', 'essay'] as const;
const SUB_TYPES = ['mcq', 'true_false', 'essay'] as const;
const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const newUid = () => `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const IMG_TAG = /<img[^>]*?src="([^"]+)"[^>]*>/g;

/** HTML السؤال ← نص بأسطر + صور */
export function splitHtml(h: string): { text: string; images: string[] } {
  const images = Array.from((h || '').matchAll(IMG_TAG)).map((m) => m[1]);
  const text = (h || '').replace(IMG_TAG, '').replace(/<\/p>\s*<p[^>]*>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{2,}/g, '\n').trim();
  return { text, images };
}
/** نص بأسطر + صور ← HTML السؤال */
export function joinHtml(text: string, images: string[]): string {
  const paras = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `<p>${escHtml(l)}</p>`);
  return (paras.join('') || (images.length ? '' : '<p></p>')) + images.map((src) => `<p><img src="${src}" alt=""></p>`).join('');
}
export const plainHtml = (v: string) => joinHtml(v, []);

/** تحويل نوع السؤال مع الإبقاء على ما يمكن الإبقاء عليه */
export function convert(q: QuestionItem, type: QuestionItem['type']): { q: QuestionItem; review: boolean } {
  const base: QuestionItem = { uid: q.uid, question_text: q.question_text, explanation: q.explanation, marks: q.marks, outcome: q.outcome, type, options: [], correct_option_index: -1 };
  if (type === 'mcq') {
    const keep = q.type === 'mcq' && q.options.length >= 2;
    return { q: { ...base, options: keep ? q.options : ['', '', '', ''], correct_option_index: keep ? q.correct_option_index : 0 }, review: !keep };
  }
  if (type === 'true_false') return { q: { ...base, options: ['صح', 'خطأ'], correct_option_index: 0 }, review: true };
  if (type === 'fill_blank') return { q: { ...base, accepted_answers: q.accepted_answers?.length ? q.accepted_answers : [''] }, review: false };
  return { q: { ...base, marks: Math.max(q.marks, 2) }, review: false };
}

/** هل يحتاج السؤال تدخلاً قبل الإضافة */
export const rowPending = (r: Row) =>
  r.review || (r.subReview || []).some(Boolean) || (r.q.type === 'mcq' && r.q.options.some((o) => !splitHtml(o).text && !splitHtml(o).images.length));

const fieldCls = 'min-w-0 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:border-indigo-400';

/** خانة نص تتمدد بطول السؤال كاملاً (بلا تمرير داخلي) */
export const AutoTextarea: React.FC<{ value: string; onChange: (v: string) => void; label: string; weight?: 'bold' | 'normal' }> = ({ value, onChange, label, weight = 'bold' }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el.parentElement || el);
    return () => ro.disconnect();
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={1} aria-label={label} dir="auto"
      className={`flex-1 min-w-0 min-h-[36px] px-2 py-1.5 rounded-lg border border-transparent hover:border-slate-200 focus:border-indigo-400 dark:hover:border-slate-700 bg-transparent text-sm leading-relaxed ${weight === 'bold' ? 'font-semibold' : ''} text-slate-900 dark:text-white resize-none overflow-hidden whitespace-pre-wrap`} />
  );
};

/** صور السؤال: عرض وحذف وإضافة */
const ImageStrip: React.FC<{ images: string[]; onChange: (imgs: string[]) => void }> = ({ images, onChange }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-2">
      {images.map((src, k) => (
        <div key={k} className="relative group">
          <img src={src} alt="" className="h-24 max-w-[12rem] object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white" />
          <button type="button" onClick={() => onChange(images.filter((_, j) => j !== k))} aria-label={t('حذف الصورة')}
            className="absolute -top-2 -end-2 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <label className={`h-8 px-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
        <ImagePlus className="w-3.5 h-3.5" />{t('صورة')}
        <input type="file" accept="image/*" className="sr-only" aria-label={t('إضافة صورة')} onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          const url = await compressImage(f);
          setBusy(false);
          if (url) onChange([...images, url]);
        }} />
      </label>
    </div>
  );
};

type QLike = Pick<QuestionItem, 'type' | 'question_text' | 'options' | 'correct_option_index' | 'marks' | 'explanation' | 'accepted_answers' | 'pairs'>;

/** جسم سؤال واحد (يُستخدم للأسئلة والأسئلة الفرعية في القطعة) */
const QuestionBody: React.FC<{
  q: QLike; review: boolean; types: readonly string[]; label: string; num: React.ReactNode;
  bank?: string[]; note?: string; compact?: boolean;
  onPatch: (patch: Partial<QuestionItem>, confirm?: boolean) => void; onType: (type: QuestionItem['type']) => void; onRemove: () => void;
}> = ({ q, review, types, label, num, bank, note, compact, onPatch, onType, onRemove }) => {
  const letters = optionLetters();
  const body = splitHtml(q.question_text);
  return (
    <>
      <div className="flex items-start gap-2">
        {num}
        <AutoTextarea value={body.text} onChange={(v) => onPatch({ question_text: joinHtml(v, body.images) })} label={label} weight={compact ? 'normal' : 'bold'} />
        <button type="button" onClick={onRemove} aria-label={t('حذف السؤال')} className="w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="sm:ps-9"><ImageStrip images={body.images} onChange={(imgs) => onPatch({ question_text: joinHtml(body.text, imgs) })} /></div>
      <div className="flex flex-wrap items-center gap-2 sm:ps-9">
        <select className={`${fieldCls} h-8 text-xs font-bold`} value={q.type} onChange={(e) => onType(e.target.value as QuestionItem['type'])} aria-label={t('نوع السؤال')} data-testid="imp-type">
          {types.map((ty) => <option key={ty} value={ty}>{typeLabel(ty)}</option>)}
          {!types.includes(q.type) && <option value={q.type}>{typeLabel(q.type)}</option>}
        </select>
        <label className="inline-flex items-center gap-1 text-xs text-slate-500">
          {t('الدرجة')}
          <input type="number" min={0.5} step={0.5} value={q.marks} onChange={(e) => onPatch({ marks: Math.max(0.5, Number(e.target.value) || 1) })} className={`${fieldCls} h-8 w-16 text-xs`} aria-label={t('الدرجة')} />
        </label>
        {review && <Chip tone="warn"><AlertTriangle className="w-3.5 h-3.5" />{q.type === 'true_false' ? t('اختر صح أو خطأ') : t('اختر الإجابة الصحيحة')}</Chip>}
        {note && <Chip tone="info">{t(note)}</Chip>}
      </div>

      {q.type === 'mcq' && (
        <div className="grid sm:grid-cols-2 gap-1.5 sm:ps-9" role="radiogroup" aria-label={t('الإجابة الصحيحة للسؤال {n}', { n: label })}>
          {q.options.map((o, k) => {
            const on = k === q.correct_option_index && !review;
            const ob = splitHtml(o);
            return (
              <div key={k} className={`flex items-center gap-1.5 rounded-lg border px-1.5 ${on ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                <button type="button" role="radio" aria-checked={on} onClick={() => onPatch({ correct_option_index: k }, true)} title={t('اجعله الإجابة الصحيحة')}
                  className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-100'}`}>
                  {on ? <CheckCircle2 className="w-4 h-4" /> : letters[k]}
                </button>
                {ob.images.map((src, j) => <img key={j} src={src} alt="" className="h-12 max-w-[6rem] object-contain rounded bg-white" />)}
                <input value={ob.text} dir="auto" onChange={(e) => onPatch({ options: q.options.map((x, j) => (j === k ? joinHtml(e.target.value, ob.images) : x)) })} aria-label={t('الخيار {n}', { n: k + 1 })}
                  className="flex-1 min-w-0 h-9 bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none" />
                {q.options.length > 2 && <button type="button" onClick={() => onPatch({ options: q.options.filter((_, j) => j !== k), correct_option_index: q.correct_option_index > k ? q.correct_option_index - 1 : q.correct_option_index === k ? 0 : q.correct_option_index })} aria-label={t('حذف الخيار')} className="w-6 h-6 rounded text-slate-400 hover:text-rose-600 shrink-0"><X className="w-3.5 h-3.5 mx-auto" /></button>}
              </div>
            );
          })}
          {q.options.length < 6 && <button type="button" onClick={() => onPatch({ options: [...q.options, ''] })} className="h-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 hover:text-indigo-600 inline-flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" />{t('خيار')}</button>}
        </div>
      )}

      {q.type === 'true_false' && (
        <div className="flex gap-1.5 sm:ps-9" role="radiogroup" aria-label={t('الإجابة الصحيحة للسؤال {n}', { n: label })}>
          {q.options.map((o, k) => {
            const on = k === q.correct_option_index && !review;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onPatch({ correct_option_index: k }, true)}
                className={`h-9 px-5 rounded-lg border text-sm font-bold inline-flex items-center gap-1.5 ${on ? (k === 0 ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300') : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'}`}>
                {on && <CheckCircle2 className="w-4 h-4" />}{t(o)}
              </button>
            );
          })}
        </div>
      )}

      {q.type === 'fill_blank' && (
        <div className="sm:ps-9 space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <span className="shrink-0 font-bold">{t('الإجابة المقبولة')}</span>
            <input value={(q.accepted_answers || []).join('، ')} dir="auto" placeholder={t('اكتب الإجابة (وافصل البدائل بفاصلة)')}
              onChange={(e) => onPatch({ accepted_answers: e.target.value.split(/[،,]/).map((x) => x.trimStart()) })} className={`${fieldCls} flex-1`} />
          </label>
          {bank && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">{t('كلمات القسم:')}</span>
              {bank.map((w) => <button key={w} type="button" onClick={() => onPatch({ accepted_answers: [w] })} className="h-7 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/50">{w}</button>)}
            </div>
          )}
        </div>
      )}

      {q.type === 'matching' && (
        <div className="sm:ps-9 space-y-1.5">
          {(q.pairs || []).map((p, k) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <input value={p.left} dir="auto" onChange={(e) => onPatch({ pairs: q.pairs!.map((x, j) => (j === k ? { ...x, left: e.target.value } : x)) })} className={`${fieldCls} flex-1`} aria-label={t('العنصر {n}', { n: k + 1 })} />
              <span className="text-slate-400">←</span>
              <input value={p.right} dir="auto" onChange={(e) => onPatch({ pairs: q.pairs!.map((x, j) => (j === k ? { ...x, right: e.target.value } : x)) })} className={`${fieldCls} flex-1`} aria-label={t('ما يقابله')} />
            </div>
          ))}
        </div>
      )}

      {q.type === 'essay' && q.explanation && <p className="sm:ps-9 text-xs text-slate-500 dark:text-slate-400">{t('إجابة نموذجية:')}{' '}{splitHtml(q.explanation).text}</p>}
    </>
  );
};

const NumBadge: React.FC<{ n: React.ReactNode; small?: boolean }> = ({ n, small }) => (
  <span className={`${small ? 'w-6 h-6 text-[11px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'w-7 h-7 text-xs bg-indigo-600 text-white'} mt-1 rounded-lg font-bold flex items-center justify-center shrink-0`}>{n}</span>
);

/** قائمة المعاينة: الأسئلة مجمّعة تحت أقسامها */
export const ImportReview: React.FC<{
  rows: Row[]; setRows: React.Dispatch<React.SetStateAction<Row[] | null>>;
  ignored: string[]; setIgnored: React.Dispatch<React.SetStateAction<string[]>>; images: string[];
}> = ({ rows, setRows, ignored, setIgnored, images }) => {
  const [showIgnored, setShowIgnored] = useState(false);
  const letters = optionLetters();
  const patchRow = (i: number, fn: (r: Row) => Row) => setRows((prev) => prev && prev.map((r, k) => (k === i ? fn(r) : r)));
  const update = (i: number, patch: Partial<QuestionItem>, confirm = false) => patchRow(i, (r) => ({ ...r, q: { ...r.q, ...patch }, review: confirm ? false : r.review }));
  const setType = (i: number, type: QuestionItem['type']) => patchRow(i, (r) => ({ ...r, ...convert(r.q, type) }));
  const setSectionType = (section: string, type: QuestionItem['type']) =>
    setRows((prev) => prev && prev.map((r) => (r.meta.section === section && !['matching', 'passage'].includes(r.q.type) && r.q.type !== type ? { ...r, ...convert(r.q, type) } : r)));
  const remove = (i: number) => setRows((prev) => prev && prev.filter((_, k) => k !== i));
  const updateSub = (i: number, s: number, patch: Partial<SubQuestion>, confirm = false) => patchRow(i, (r) => {
    const subs = (r.q.sub_questions || []).map((x, k) => (k === s ? { ...x, ...patch } : x));
    const subReview = (r.subReview || []).map((v, k) => (k === s && confirm ? false : v));
    return { ...r, q: { ...r.q, sub_questions: subs, marks: subs.reduce((n, x) => n + (Number(x.marks) || 0), 0) }, subReview };
  });
  const setSubType = (i: number, s: number, type: QuestionItem['type']) => patchRow(i, (r) => {
    const cur = r.q.sub_questions![s];
    const c = convert({ ...cur, uid: '', type: cur.type } as QuestionItem, type);
    const subs = r.q.sub_questions!.map((x, k) => (k === s ? { question_text: c.q.question_text, type: c.q.type as SubQuestion['type'], options: c.q.options, correct_option_index: c.q.correct_option_index, marks: c.q.marks, explanation: c.q.explanation } : x));
    return { ...r, q: { ...r.q, sub_questions: subs, marks: subs.reduce((n, x) => n + (Number(x.marks) || 0), 0) }, subReview: (r.subReview || []).map((v, k) => (k === s ? c.review : v)) };
  });
  const removeSub = (i: number, s: number) => patchRow(i, (r) => {
    const subs = r.q.sub_questions!.filter((_, k) => k !== s);
    return { ...r, q: { ...r.q, sub_questions: subs, marks: subs.reduce((n, x) => n + (Number(x.marks) || 0), 0) }, subReview: (r.subReview || []).filter((_, k) => k !== s) };
  });
  // فك القطعة إلى أسئلة منفصلة (النص يُلحق بأول سؤال)
  const ungroup = (i: number) => setRows((prev) => {
    if (!prev) return prev;
    const r = prev[i];
    const subs = r.q.sub_questions || [];
    const passage = splitHtml(r.q.question_text);
    const out: Row[] = subs.map((s, k) => {
      const sb = splitHtml(s.question_text);
      const text = k === 0 && passage.text ? `${passage.text}\n${sb.text}` : sb.text;
      return { q: { uid: newUid(), type: s.type, question_text: joinHtml(text, k === 0 ? [...passage.images, ...sb.images] : sb.images), options: s.options, correct_option_index: s.correct_option_index, marks: s.marks, explanation: s.explanation || '' }, meta: { section: r.meta.section }, review: !!r.subReview?.[k] };
    });
    return [...prev.slice(0, i), ...out, ...prev.slice(i + 1)];
  });
  const addIgnored = (line: string) => {
    const img = line.match(/^\[\[IMG:(\d+)\]\]$/);
    const qh = img ? joinHtml('', [images[Number(img[1])]].filter(Boolean)) : plainHtml(line);
    setRows((prev) => [...(prev || []), { q: { uid: newUid(), type: 'essay', question_text: qh, options: [], correct_option_index: -1, marks: 2, explanation: '' }, meta: {}, review: false }]);
    setIgnored((g) => g.filter((x) => x !== line));
  };

  return (
    <>
      <ol className="space-y-2.5">
        {rows.map((row, i) => {
          const q = row.q;
          const sec = row.meta.section;
          const newSec = sec && sec !== rows[i - 1]?.meta.section;
          const pend = rowPending(row);
          return (
            <React.Fragment key={q.uid || i}>
              {newSec && (
                <li className="flex flex-wrap items-center gap-2 pt-2" data-testid="imp-section">
                  <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 flex-1 min-w-[min(100%,14rem)]">{sec}</span>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    {t('حوّل أسئلة القسم إلى')}
                    <select className={`${fieldCls} h-8 text-xs`} value="" onChange={(e) => e.target.value && setSectionType(sec!, e.target.value as QuestionItem['type'])} aria-label={t('نوع أسئلة القسم')}>
                      <option value="">—</option>
                      {SWITCHABLE.map((ty) => <option key={ty} value={ty}>{typeLabel(ty)}</option>)}
                    </select>
                  </label>
                </li>
              )}
              <li className={`rounded-2xl border p-3.5 space-y-2.5 ${pend ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800'}`} data-testid="imp-q">
                {q.type === 'passage' ? (() => {
                  const pb = splitHtml(q.question_text);
                  return (
                    <>
                      <div className="flex items-start gap-2">
                        <NumBadge n={i + 1} />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip tone="info"><BookOpen className="w-3.5 h-3.5" />{typeLabel('passage')}</Chip>
                            <span className="text-xs text-slate-500">{t('{n} أسئلة فرعية • {m} درجات', { n: q.sub_questions?.length || 0, m: q.marks })}</span>
                            <button type="button" onClick={() => ungroup(i)} className="ms-auto h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-300 inline-flex items-center gap-1"><Ungroup className="w-3.5 h-3.5" />{t('أسئلة منفصلة')}</button>
                          </div>
                          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-1">
                            <AutoTextarea value={pb.text} onChange={(v) => update(i, { question_text: joinHtml(v, pb.images) })} label={t('نص القطعة')} weight="normal" />
                          </div>
                          <ImageStrip images={pb.images} onChange={(imgs) => update(i, { question_text: joinHtml(pb.text, imgs) })} />
                        </div>
                        <button type="button" onClick={() => remove(i)} aria-label={t('حذف السؤال')} className="w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="sm:ps-9 space-y-3">
                        {(q.sub_questions || []).map((s, k) => (
                          <div key={k} className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 space-y-2" data-testid="imp-sub">
                            <QuestionBody q={s as QLike} review={!!row.subReview?.[k]} types={SUB_TYPES} compact label={`${i + 1}-${letters[k]}`} num={<NumBadge n={letters[k]} small />}
                              onPatch={(p, c) => updateSub(i, k, p as Partial<SubQuestion>, c)} onType={(ty) => setSubType(i, k, ty)} onRemove={() => removeSub(i, k)} />
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })() : (
                  <QuestionBody q={q} review={row.review} types={SWITCHABLE} label={String(i + 1)} num={<NumBadge n={i + 1} />} bank={row.meta.bank} note={row.meta.note}
                    onPatch={(p, c) => update(i, p, c)} onType={(ty) => setType(i, ty)} onRemove={() => remove(i)} />
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>

      {ignored.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800">
          <button type="button" onClick={() => setShowIgnored(!showIgnored)} aria-expanded={showIgnored} className="w-full flex items-center gap-2 p-3 text-sm text-slate-600 dark:text-slate-300">
            <EyeOff className="w-4 h-4" />
            <span className="flex-1 text-start">{t('تم تجاهل {n} سطر (ترويسة الورقة، التوقيعات، جدول الدرجات…)', { n: ignored.length })}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showIgnored ? 'rotate-180' : ''}`} />
          </button>
          {showIgnored && (
            <ul className="px-3 pb-3 space-y-1">
              {ignored.map((l, k) => {
                const img = l.match(/^\[\[IMG:(\d+)\]\]$/);
                return (
                  <li key={k} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {img && images[Number(img[1])]
                      ? <span className="flex-1 min-w-0"><img src={images[Number(img[1])]} alt="" className="h-12 max-w-[10rem] object-contain rounded bg-white border border-slate-200 dark:border-slate-700" /></span>
                      : <span className="flex-1 min-w-0 truncate" dir="auto">{l}</span>}
                    <button type="button" onClick={() => addIgnored(l)} className="shrink-0 h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 inline-flex items-center gap-1"><Plus className="w-3 h-3" />{t('أضفه كسؤال')}</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </>
  );
};
