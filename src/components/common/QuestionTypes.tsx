/**
 * أنواع الأسئلة الجديدة (059): اختيار متعدد الإجابات، أكمل الفراغ، إجابة رقمية، ترتيب، توصيل.
 * - محررها في صفحة إنشاء الاختبار، وطريقة إجابتها في صفحة الاختبار، وعرضها في المراجعة وورقة الإجابة.
 * - التصحيح كله في الخادم (itqan.grade_single)، والطالب لا يستلم مفاتيح الإجابة (strip_answers).
 */
import React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import { t, optionLetters } from '../../i18n';
import { RichText } from './RichText';

export const NEW_TYPES = ['multi_select', 'fill_blank', 'numeric', 'ordering', 'matching'] as const;
export type NewType = typeof NEW_TYPES[number];
export const isNewType = (t?: string): t is NewType => !!t && (NEW_TYPES as readonly string[]).includes(t);

export interface OrderItem { id: string; text: string }
export interface PairItem { id: string; left: string; right: string }
/** حقول الأنواع الجديدة في السؤال */
export interface NewTypeFields {
  options?: string[];
  correct_indexes?: number[];
  accepted_answers?: string[];
  correct_number?: number | null;
  tolerance?: number | null;
  items?: OrderItem[];
  pairs?: PairItem[];
  /** يرسلها الخادم للطالب بدل pairs (العمود الأيمن مخلوط برموز) */
  match_left?: OrderItem[];
  match_right?: OrderItem[];
}
/** إجابة الطالب للأنواع الجديدة */
export interface NewTypeAnswer { selected_options?: number[]; text_answer?: string; order?: string[]; matches?: Record<string, string> }

const rid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const NEW_TYPE_LABELS: Record<NewType, { label: string; short: string; hint: string }> = {
  multi_select: { label: 'اختيار متعدد الإجابات', short: 'متعدد', hint: 'حدد كل الإجابات الصحيحة؛ تُحتسب الدرجة إذا اختار الطالب الصحيحة كلها فقط.' },
  fill_blank: { label: 'أكمل الفراغ', short: 'فراغ', hint: 'اكتب الإجابات المقبولة؛ لا يفرّق التصحيح بين الهمزات والتاء المربوطة والتشكيل.' },
  numeric: { label: 'إجابة رقمية', short: 'رقمي', hint: 'الإجابة رقم، مع هامش سماح اختياري (مثل 0.1).' },
  ordering: { label: 'ترتيب', short: 'ترتيب', hint: 'اكتب العناصر بالترتيب الصحيح؛ تظهر للطالب مخلوطة.' },
  matching: { label: 'توصيل', short: 'توصيل', hint: 'اكتب كل عنصر مع ما يقابله؛ تُعرض المقابلات للطالب مخلوطة، والدرجة جزئية لكل توصيلة صحيحة.' },
};

/** القيم الابتدائية عند اختيار النوع */
export function initNewType(type: NewType): NewTypeFields & { marks: number } {
  if (type === 'multi_select') return { options: ['', '', '', ''], correct_indexes: [0, 1], marks: 2 };
  if (type === 'fill_blank') return { options: [], accepted_answers: [''], marks: 1 };
  if (type === 'numeric') return { options: [], correct_number: null, tolerance: 0, marks: 1 };
  if (type === 'ordering') return { options: [], items: [0, 1, 2, 3].map(() => ({ id: rid('it'), text: '' })), marks: 2 };
  return { options: [], pairs: [0, 1, 2].map(() => ({ id: rid('pr'), left: '', right: '' })), marks: 3 };
}

/** رسالة خطأ إن كان السؤال ناقصاً، وإلا null */
export function validateNewType(type: NewType, q: NewTypeFields): string | null {
  if (type === 'multi_select') {
    if ((q.options || []).some((o) => !String(o).replace(/<[^>]+>/g, '').trim())) return t('اكتب كل الخيارات أو احذف الفارغ');
    if (!(q.correct_indexes || []).length) return t('حدد إجابة صحيحة واحدة على الأقل');
  }
  if (type === 'fill_blank' && !(q.accepted_answers || []).some((a) => a.trim())) return t('اكتب إجابة مقبولة واحدة على الأقل');
  if (type === 'numeric' && (q.correct_number === null || q.correct_number === undefined || Number.isNaN(Number(q.correct_number)))) return t('اكتب الإجابة الرقمية الصحيحة');
  if (type === 'ordering' && ((q.items || []).length < 2 || (q.items || []).some((i) => !i.text.trim()))) return t('اكتب عنصرين على الأقل بلا فراغات');
  if (type === 'matching' && ((q.pairs || []).length < 2 || (q.pairs || []).some((p) => !p.left.trim() || !p.right.trim()))) return t('اكتب زوجين على الأقل بطرفيهما');
  return null;
}

const inp = 'w-full min-w-0 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white';
const smallBtn = 'p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30';

/** محرر الأنواع الجديدة في صفحة إنشاء الاختبار */
export const NewTypeEditor: React.FC<{ type: NewType; q: NewTypeFields; onChange: (patch: Partial<NewTypeFields>) => void }> = ({ type, q, onChange }) => {
  const letters = optionLetters();
  const hint = <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{t(NEW_TYPE_LABELS[type].hint)}</p>;
  if (type === 'multi_select') {
    const opts = q.options || [], keys = q.correct_indexes || [];
    return (
      <div className="space-y-2 pt-1" data-testid="ed-multi">
        {hint}
        {opts.map((o, i) => {
          const on = keys.includes(i);
          return (
            <div key={i} className={`flex items-center gap-2 p-1.5 rounded-xl border-2 ${on ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30' : 'border-transparent'}`}>
              <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-black flex items-center justify-center">{letters[i] || i + 1}</span>
              <input value={o} onChange={(e) => onChange({ options: opts.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={t('الخيار {n}', { n: i + 1 })} className={inp} />
              <button type="button" role="checkbox" aria-checked={on} onClick={() => onChange({ correct_indexes: on ? keys.filter((k) => k !== i) : [...keys, i].sort() })}
                className={`px-2 py-1 rounded-lg text-[10px] font-black whitespace-nowrap ${on ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-100'}`}>{on ? t('✓ صحيحة') : t('صحيحة')}</button>
              {opts.length > 2 && <button type="button" aria-label={t('حذف الخيار {n}', { n: i + 1 })} onClick={() => onChange({ options: opts.filter((_, j) => j !== i), correct_indexes: keys.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)) })} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
            </div>
          );
        })}
        {opts.length < 8 && <button type="button" onClick={() => onChange({ options: [...opts, ''] })} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"><Plus className="w-3.5 h-3.5" />{t('إضافة خيار')}</button>}
      </div>
    );
  }
  if (type === 'fill_blank') {
    const ans = q.accepted_answers || [''];
    return (
      <div className="space-y-2 pt-1" data-testid="ed-blank">
        {hint}
        <p className="text-[11px] text-slate-500">{t('ضع «____» في نص السؤال مكان الفراغ (اختياري).')}</p>
        {ans.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={a} onChange={(e) => onChange({ accepted_answers: ans.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={i === 0 ? t('الإجابة الصحيحة') : t('صيغة أخرى مقبولة')} className={inp} />
            {ans.length > 1 && <button type="button" aria-label={t('حذف')} onClick={() => onChange({ accepted_answers: ans.filter((_, j) => j !== i) })} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
        {ans.length < 6 && <button type="button" onClick={() => onChange({ accepted_answers: [...ans, ''] })} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"><Plus className="w-3.5 h-3.5" />{t('صيغة أخرى مقبولة')}</button>}
      </div>
    );
  }
  if (type === 'numeric') {
    return (
      <div className="space-y-2 pt-1" data-testid="ed-numeric">
        {hint}
        <div className="grid grid-cols-2 gap-2 max-w-md">
          <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الإجابة الصحيحة')}
            <input type="number" step="any" value={q.correct_number ?? ''} onChange={(e) => onChange({ correct_number: e.target.value === '' ? null : Number(e.target.value) })} className={inp} dir="ltr" /></label>
          <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('هامش السماح (±)')}
            <input type="number" step="any" min={0} value={q.tolerance ?? 0} onChange={(e) => onChange({ tolerance: Math.max(0, Number(e.target.value) || 0) })} className={inp} dir="ltr" /></label>
        </div>
      </div>
    );
  }
  if (type === 'ordering') {
    const items = q.items || [];
    const move = (i: number, d: number) => { const a = items.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; onChange({ items: a }); };
    return (
      <div className="space-y-2 pt-1" data-testid="ed-ordering">
        {hint}
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-2">
            <span className="w-7 h-7 shrink-0 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs font-black flex items-center justify-center">{i + 1}</span>
            <input value={it.text} onChange={(e) => onChange({ items: items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)) })} placeholder={t('العنصر رقم {n}', { n: i + 1 })} className={inp} />
            <button type="button" aria-label={t('تحريك لأعلى')} disabled={i === 0} onClick={() => move(i, -1)} className={smallBtn}><ArrowUp className="w-4 h-4" /></button>
            <button type="button" aria-label={t('تحريك لأسفل')} disabled={i === items.length - 1} onClick={() => move(i, 1)} className={smallBtn}><ArrowDown className="w-4 h-4" /></button>
            {items.length > 2 && <button type="button" aria-label={t('حذف')} onClick={() => onChange({ items: items.filter((x) => x.id !== it.id) })} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
        {items.length < 10 && <button type="button" onClick={() => onChange({ items: [...items, { id: rid('it'), text: '' }] })} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"><Plus className="w-3.5 h-3.5" />{t('إضافة عنصر')}</button>}
      </div>
    );
  }
  const pairs = q.pairs || [];
  return (
    <div className="space-y-2 pt-1" data-testid="ed-matching">
      {hint}
      {pairs.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2">
          <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-black flex items-center justify-center">{i + 1}</span>
          <input value={p.left} onChange={(e) => onChange({ pairs: pairs.map((x) => (x.id === p.id ? { ...x, left: e.target.value } : x)) })} placeholder={t('العنصر')} className={inp} />
          <span className="text-slate-400 shrink-0">⟷</span>
          <input value={p.right} onChange={(e) => onChange({ pairs: pairs.map((x) => (x.id === p.id ? { ...x, right: e.target.value } : x)) })} placeholder={t('ما يقابله')} className={inp} />
          {pairs.length > 2 && <button type="button" aria-label={t('حذف')} onClick={() => onChange({ pairs: pairs.filter((x) => x.id !== p.id) })} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
        </div>
      ))}
      {pairs.length < 10 && <button type="button" onClick={() => onChange({ pairs: [...pairs, { id: rid('pr'), left: '', right: '' }] })} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"><Plus className="w-3.5 h-3.5" />{t('إضافة زوج')}</button>}
    </div>
  );
};

// ---------------- الإجابة في صفحة الاختبار ----------------

/** خلط ثابت حسب مفتاح (لعرض المعلم الذي يستلم الأسئلة كاملة) */
const seeded = <T,>(arr: T[], key: string) => {
  let h = 2166136261; for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507); const j = Math.abs(h) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
/** عناصر الترتيب كما تُعرض (الطالب يستلمها مخلوطة من الخادم) */
export const orderingStart = (q: NewTypeFields & { id: string }, studentView: boolean) => (studentView ? q.items || [] : seeded(q.items || [], q.id));
/** طرفا التوصيل كما يُعرضان */
export const matchingSides = (q: NewTypeFields & { id: string }) => ({
  left: q.match_left || (q.pairs || []).map((p) => ({ id: p.id, text: p.left })),
  right: q.match_right || seeded((q.pairs || []).map((p) => ({ id: p.id, text: p.right })), `r${q.id}`),
});

export const hasNewAnswer = (type: NewType, a: NewTypeAnswer | undefined, q: NewTypeFields & { id: string }) => {
  if (!a) return false;
  if (type === 'multi_select') return (a.selected_options || []).length > 0;
  if (type === 'fill_blank' || type === 'numeric') return !!(a.text_answer || '').trim();
  if (type === 'ordering') return (a.order || []).length > 0;
  return Object.keys(a.matches || {}).length >= matchingSides(q).left.length;
};

/** واجهة الإجابة للطالب */
export const NewTypeAnswerInput: React.FC<{ type: NewType; q: NewTypeFields & { id: string }; value: NewTypeAnswer | undefined; onChange: (v: NewTypeAnswer) => void; studentView: boolean }> = ({ type, q, value, onChange, studentView }) => {
  const letters = optionLetters();
  if (type === 'multi_select') {
    const picks = value?.selected_options || [];
    return (
      <div className="space-y-2.5" role="group" aria-label={t('اختر كل الإجابات الصحيحة')} data-testid="ans-multi">
        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{t('اختر كل الإجابات الصحيحة')}</p>
        {(q.options || []).map((o, i) => {
          const on = picks.includes(i);
          return (
            <button key={i} type="button" role="checkbox" aria-checked={on} onClick={() => onChange({ selected_options: on ? picks.filter((x) => x !== i) : [...picks, i].sort() })}
              className={`w-full text-start flex items-center gap-3.5 min-h-[56px] px-4 py-2.5 rounded-2xl border-2 transition-colors ${on ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300'}`}>
              <span className={`w-8 h-8 rounded-lg border-2 text-sm font-bold flex items-center justify-center shrink-0 ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600 text-slate-500'}`}>{on ? <Check className="w-4 h-4" /> : letters[i] || i + 1}</span>
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100"><RichText html={o} /></span>
            </button>
          );
        })}
      </div>
    );
  }
  if (type === 'fill_blank' || type === 'numeric') {
    return (
      <input value={value?.text_answer || ''} onChange={(e) => onChange({ text_answer: e.target.value })} inputMode={type === 'numeric' ? 'decimal' : 'text'} dir={type === 'numeric' ? 'ltr' : undefined}
        placeholder={type === 'numeric' ? t('اكتب الرقم') : t('اكتب الإجابة')} aria-label={t('إجابتك')} data-testid="ans-text"
        className="w-full h-14 px-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-lg font-semibold text-slate-900 dark:text-white focus:border-indigo-600 outline-none" />
    );
  }
  if (type === 'ordering') return <OrderingInput q={q} value={value} onChange={onChange} studentView={studentView} />;
  return <MatchingInput q={q} value={value} onChange={onChange} />;
};

/** الترتيب: يُسجَّل الترتيب الظاهر إجابةً أولية حتى يحرّكه الطالب */
const OrderingInput: React.FC<{ q: NewTypeFields & { id: string }; value: NewTypeAnswer | undefined; onChange: (v: NewTypeAnswer) => void; studentView: boolean }> = ({ q, value, onChange, studentView }) => {
  const start = orderingStart(q, studentView);
  React.useEffect(() => { if (!value?.order?.length && start.length) onChange({ order: start.map((i) => i.id) }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  {
    const ids = value?.order?.length ? value.order : start.map((i) => i.id);
    const byId = new Map(start.map((i) => [i.id, i]));
    const move = (i: number, d: number) => { const a = ids.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; onChange({ order: a }); };
    return (
      <div className="space-y-2" data-testid="ans-ordering">
        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{t('رتّب العناصر بالأسهم من الأول إلى الأخير')}</p>
        {ids.map((id, i) => (
          <div key={id} className="flex items-center gap-2 min-h-[54px] px-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-black flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="flex-1 text-base font-semibold text-slate-900 dark:text-slate-100">{byId.get(id)?.text}</span>
            <button type="button" aria-label={t('تحريك لأعلى')} disabled={i === 0} onClick={() => move(i, -1)} className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center disabled:opacity-30"><ArrowUp className="w-5 h-5" /></button>
            <button type="button" aria-label={t('تحريك لأسفل')} disabled={i === ids.length - 1} onClick={() => move(i, 1)} className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center disabled:opacity-30"><ArrowDown className="w-5 h-5" /></button>
          </div>
        ))}
      </div>
    );
  }
};

const MatchingInput: React.FC<{ q: NewTypeFields & { id: string }; value: NewTypeAnswer | undefined; onChange: (v: NewTypeAnswer) => void }> = ({ q, value, onChange }) => {
  const { left, right } = matchingSides(q);
  const m = value?.matches || {};
  return (
    <div className="space-y-2" data-testid="ans-matching">
      <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{t('اختر لكل عنصر ما يقابله')}</p>
      {left.map((l, i) => (
        <div key={l.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-sm font-black flex items-center justify-center shrink-0">{i + 1}</span>
          <span className="flex-1 min-w-[8rem] text-base font-semibold text-slate-900 dark:text-slate-100">{l.text}</span>
          <select value={m[l.id] || ''} onChange={(e) => onChange({ matches: { ...m, [l.id]: e.target.value } })} aria-label={t('ما يقابل {x}', { x: l.text })}
            className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold w-full sm:w-64">
            <option value="">{t('اختر…')}</option>{right.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
};

// ---------------- العرض في المراجعة وورقة الإجابة ----------------

/** إجابة الطالب والإجابة الصحيحة كنص (للمراجعة والطباعة) */
export function describeNewAnswer(type: NewType, q: NewTypeFields & { id: string }, a: (NewTypeAnswer & { parts_correct?: number; parts_total?: number }) | undefined, reveal: boolean): { mine: string; correct?: string } {
  const letters = optionLetters();
  const strip = (s: string) => String(s || '').replace(/<[^>]+>/g, '');
  const dash = t('لم يُجب');
  if (type === 'multi_select') {
    const pick = (a?.selected_options || []).map((i) => `${letters[i] || i + 1}) ${strip((q.options || [])[i])}`).join('، ');
    return { mine: pick || dash, correct: reveal && q.correct_indexes ? q.correct_indexes.map((i) => `${letters[i] || i + 1}) ${strip((q.options || [])[i])}`).join('، ') : undefined };
  }
  if (type === 'fill_blank') return { mine: a?.text_answer || dash, correct: reveal && q.accepted_answers ? q.accepted_answers.filter(Boolean).join(' / ') : undefined };
  if (type === 'numeric') return { mine: a?.text_answer || dash, correct: reveal && q.correct_number !== undefined && q.correct_number !== null ? `${q.correct_number}${q.tolerance ? ` (± ${q.tolerance})` : ''}` : undefined };
  if (type === 'ordering') {
    const byId = new Map((q.items || []).map((i) => [i.id, i.text]));
    return { mine: (a?.order || []).map((id, i) => `${i + 1}. ${byId.get(id) ?? '؟'}`).join('  ') || dash, correct: reveal && q.items ? q.items.map((i, k) => `${k + 1}. ${i.text}`).join('  ') : undefined };
  }
  const { left, right } = matchingSides(q);
  const rightText = new Map(right.map((r) => [r.id, r.text]));
  const mine = left.map((l) => `${l.text} ← ${rightText.get(a?.matches?.[l.id] || '') || '—'}`).join('، ');
  const parts = a?.parts_total ? ` (${a.parts_correct}/${a.parts_total})` : '';
  return { mine: (Object.keys(a?.matches || {}).length ? mine : dash) + parts, correct: reveal && q.pairs ? q.pairs.map((p) => `${p.left} ← ${p.right}`).join('، ') : undefined };
}

/** بطاقة العرض في المراجعة */
export const NewAnswerReview: React.FC<{ type: NewType; q: NewTypeFields & { id: string }; a: any; reveal: boolean }> = ({ type, q, a, reveal }) => {
  const d = describeNewAnswer(type, q, a, reveal);
  const ok = !!a?.is_correct;
  return (
    <div className="space-y-2 text-sm" data-testid="new-answer-review">
      <div className={`rounded-xl px-3 py-2 border ${ok ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200' : 'border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'}`}>
        <span className="inline-flex items-center gap-1 font-bold me-1">{ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}{t('إجابتك:')}</span>{d.mine}
      </div>
      {d.correct && !ok && <div className="rounded-xl px-3 py-2 border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200"><span className="font-bold me-1">{t('الإجابة الصحيحة:')}</span>{d.correct}</div>}
    </div>
  );
};
