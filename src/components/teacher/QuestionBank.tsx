import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Library, Search, Trash2, Pencil, Lock, Users as UsersIcon, Plus, Shuffle, Download, X, CheckCircle2, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Button, Card, Chip } from '../common/ui';
import { RichText } from '../common/RichText';
import { uiDir, t, optionLetters } from '../../i18n';
import { marksCount } from '../../i18n/count';
import { QUESTION_TYPES, QuestionItem } from './QuizEditor';
import {
  BankItem, Difficulty, DIFFICULTIES, loadBankCache, syncBank, saveBankItems, deleteBankItems,
  newBankItem, sameQuestion, pickRandom, toQuizQuestion, markBankUsed,
} from '../../services/bankService';

/** تمرير أسئلة من البنك إلى محرر اختبار جديد */
export const BANK_TO_EDITOR_KEY = 'itqan_bank_to_editor';

const DIFF_TONE: Record<Difficulty, 'ok' | 'warn' | 'bad'> = { easy: 'ok', medium: 'warn', hard: 'bad' };
const typeLabel = (type: string) => t(QUESTION_TYPES.find((x) => x.type === type)?.label || 'اختيار من متعدد');
const inputCls = 'h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** تحميل البنك ومزامنته مع الخادم عند الفتح */
function useBank() {
  const [items, setItems] = useState<BankItem[]>(loadBankCache);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const reload = async () => {
    const r = await syncBank();
    setItems(loadBankCache());
    setState(r.ok ? 'ready' : 'error');
  };
  useEffect(() => {
    void reload();
  }, []);
  return { items, setItems: () => setItems(loadBankCache()), state, reload };
}

interface Filters {
  subject: string;
  unit: string;
  difficulty: '' | Difficulty;
  type: string;
  q: string;
  mine: boolean;
}

/** الفلاتر + القائمة (مشتركة بين صفحة البنك ونافذة الاختيار في المحرر) */
const BankList: React.FC<{
  items: BankItem[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  onEdit?: (b: BankItem) => void;
  onDelete?: (b: BankItem) => void;
}> = ({ items, filters, setFilters, selected, setSelected, onEdit, onDelete }) => {
  const { subjects, users, currentUser } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const me = currentUser?.id || '';
  const isAdmin = currentUser?.role === 'admin';
  const letters = optionLetters();

  const units = useMemo(
    () => Array.from(new Set(items.filter((b) => !filters.subject || b.subject_id === filters.subject).map((b) => b.unit).filter(Boolean))).sort(),
    [items, filters.subject]
  );
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name || t('بدون مادة');
  const userName = (id: string) => users.find((u) => u.id === id)?.name || '—';

  const shown = filterBank(items, filters, me);
  const allShown = shown.length > 0 && shown.every((b) => selected.includes(b.id));
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t('ابحث في نص الأسئلة')} aria-label={t('ابحث في نص الأسئلة')} className={`${inputCls} w-full ps-9`} />
        </div>
        <select aria-label={t('المادة')} value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value, unit: '' })} className={inputCls}>
          <option value="">{t('كل المواد')}</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label={t('الوحدة أو الدرس')} value={filters.unit} onChange={(e) => setFilters({ ...filters, unit: e.target.value })} className={inputCls}>
          <option value="">{t('كل الوحدات')}</option>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select aria-label={t('الصعوبة')} value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value as Filters['difficulty'] })} className={inputCls}>
          <option value="">{t('كل المستويات')}</option>
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => <option key={d} value={d}>{t(DIFFICULTIES[d])}</option>)}
        </select>
        <select aria-label={t('نوع السؤال')} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={inputCls}>
          <option value="">{t('كل الأنواع')}</option>
          {QUESTION_TYPES.map((x) => <option key={x.type} value={x.type}>{t(x.label)}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} className="accent-indigo-600" />
          {t('أسئلتي فقط')}
        </label>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allShown} onChange={() => setSelected(allShown ? selected.filter((id) => !shown.some((b) => b.id === id)) : Array.from(new Set([...selected, ...shown.map((b) => b.id)])))} className="accent-indigo-600" aria-label={t('تحديد كل الأسئلة المعروضة')} />
          {t('{n} سؤال مطابق', { n: shown.length })}
        </label>
        {selected.length > 0 && <span className="font-semibold text-indigo-700 dark:text-indigo-300">{t('محدد: {n}', { n: selected.length })}</span>}
      </div>

      {shown.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">{t('لا توجد أسئلة مطابقة')}</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((b) => {
            const q = b.question;
            const canEdit = isAdmin || b.created_by === me;
            const isOpen = open === b.id;
            return (
              <li key={b.id} className={`rounded-2xl border bg-white dark:bg-slate-900 ${selected.includes(b.id) ? 'border-indigo-400 dark:border-indigo-600' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-start gap-3 p-3.5">
                  <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggle(b.id)} className="mt-1 w-4 h-4 accent-indigo-600 shrink-0" aria-label={t('تحديد السؤال')} />
                  <div className="flex-1 min-w-0">
                    <button type="button" onClick={() => setOpen(isOpen ? null : b.id)} className="w-full text-start" aria-expanded={isOpen}>
                      <div className={`text-[15px] font-semibold text-slate-900 dark:text-white leading-relaxed ${isOpen ? '' : 'line-clamp-2'}`}>
                        <RichText html={q.question_text} />
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Chip tone="info">{typeLabel(b.type)}</Chip>
                      <Chip tone={DIFF_TONE[b.difficulty]}>{t(DIFFICULTIES[b.difficulty])}</Chip>
                      <Chip>{marksCount(b.marks)}</Chip>
                      <Chip>{subjectName(b.subject_id)}{b.unit ? ` · ${b.unit}` : ''}</Chip>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        {b.shared ? <UsersIcon className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        {b.created_by === me ? t('أنت') : userName(b.created_by)}
                        {b.used_count > 0 && <> · {t('استُخدم {n} مرة', { n: b.used_count })}</>}
                      </span>
                    </div>
                    {isOpen && (
                      <div className="mt-3 space-y-1.5">
                        {(q.type === 'passage' ? q.sub_questions || [] : [q]).map((x, i) => (
                          <div key={i} className="space-y-1">
                            {q.type === 'passage' && <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{i + 1}. <RichText html={x.question_text} inline /></div>}
                            {x.type === 'essay' ? (
                              <div className="text-xs text-slate-500">{t('سؤال مقالي: يصحّحه المعلم بعد التسليم.')}</div>
                            ) : (
                              (x.options || []).map((o, k) => (
                                <div key={k} className={`text-sm flex items-center gap-2 ${k === x.correct_option_index ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
                                  <span className="w-5 text-center">{letters[k]}</span><RichText html={o} inline />
                                  {k === x.correct_option_index && <CheckCircle2 className="w-4 h-4" />}
                                </div>
                              ))
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => setOpen(isOpen ? null : b.id)} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={isOpen ? t('إخفاء التفاصيل') : t('عرض الإجابات')} title={isOpen ? t('إخفاء التفاصيل') : t('عرض الإجابات')}>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {canEdit && onEdit && (
                      <button type="button" onClick={() => onEdit(b)} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('تعديل التصنيف')} title={t('تعديل التصنيف')}>
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canEdit && onDelete && (
                      <button type="button" onClick={() => onDelete(b)} className="w-9 h-9 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label={t('حذف من البنك')} title={t('حذف من البنك')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export function filterBank(items: BankItem[], f: Filters, me: string): BankItem[] {
  const q = f.q.trim().toLowerCase();
  return items
    .filter((b) => (!f.subject || b.subject_id === f.subject) && (!f.unit || b.unit === f.unit) && (!f.difficulty || b.difficulty === f.difficulty)
      && (!f.type || b.type === f.type) && (!f.mine || b.created_by === me) && (!q || b.search_text.toLowerCase().includes(q) || b.unit.toLowerCase().includes(q)))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

const emptyFilters = (subject = ''): Filters => ({ subject, unit: '', difficulty: '', type: '', q: '', mine: false });

/** تعديل تصنيف سؤال أو مجموعة أسئلة (المادة، الوحدة، الصعوبة، المشاركة) */
const MetaModal: React.FC<{ items: BankItem[]; units: string[]; onClose: () => void; onSaved: () => void }> = ({ items, units, onClose, onSaved }) => {
  const { subjects, showToast } = useApp();
  const first = items[0];
  const many = items.length > 1;
  const [subject, setSubject] = useState(first?.subject_id || '');
  const [unit, setUnit] = useState(many ? '' : first?.unit || '');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(many ? '' : first?.difficulty || 'medium');
  const [shared, setShared] = useState(first?.shared ?? true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const next = items.map((b) => ({
      ...b,
      subject_id: subject || null,
      unit: many && !unit.trim() ? b.unit : unit.trim(),
      difficulty: (difficulty || b.difficulty) as Difficulty,
      shared,
    }));
    const r = await saveBankItems(next);
    setBusy(false);
    if (!r.ok) return showToast(t('تعذر الحفظ: {error}', { error: r.error || '' }), 'error');
    showToast(t('تم حفظ التصنيف'), 'success');
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="meta-title">
      <Card className="w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="meta-title" className="text-lg font-bold text-slate-900 dark:text-white">{many ? t('تصنيف {n} أسئلة', { n: items.length }) : t('تصنيف السؤال')}</h3>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('المادة')}</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className={`${inputCls} w-full`}>
            <option value="">{t('بدون مادة')}</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('الوحدة أو الدرس')}</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} list="bank-units" placeholder={many ? t('اتركه فارغاً للإبقاء على الحالي') : t('مثال: الوحدة الثانية - الكسور')} className={`${inputCls} w-full`} />
          <datalist id="bank-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
        </label>
        <div className="space-y-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('الصعوبة')}</span>
          <div className="flex gap-2" role="radiogroup" aria-label={t('الصعوبة')}>
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={difficulty === d} onClick={() => setDifficulty(d)}
                className={`flex-1 h-10 rounded-xl border text-sm font-semibold ${difficulty === d ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {t(DIFFICULTIES[d])}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-1 w-4 h-4 accent-indigo-600" />
          <span>
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{t('مشترك مع كل المعلمين')}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{t('بدونه يراه صاحبه ومدير النظام فقط.')}</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? t('جارٍ الحفظ...') : t('حفظ')}</Button>
        </div>
      </Card>
    </div>
  );
};

/** إضافة أسئلة اختبارات موجودة إلى البنك */
const ImportModal: React.FC<{ existing: BankItem[]; onClose: () => void; onDone: () => void }> = ({ existing, onClose, onDone }) => {
  const { quizzes, currentUser, showToast } = useApp();
  const me = currentUser?.id || '';
  const mineOnly = currentUser?.role !== 'admin';
  const list = quizzes.filter((q) => !q.is_deleted && (q.questions?.length || 0) > 0 && (!mineOnly || q.teacher_id === me || q.created_by === me));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const items: BankItem[] = [];
    let skipped = 0;
    for (const quiz of list.filter((q) => picked.includes(q.id))) {
      for (const raw of quiz.questions || []) {
        const q = raw as unknown as QuestionItem;
        if ([...existing, ...items].some((b) => sameQuestion(b.question, q))) { skipped++; continue; }
        items.push(newBankItem({ ...q, options: q.options || [], explanation: q.explanation || '' }, { subject_id: quiz.subject_id || null, created_by: me }));
      }
    }
    const r = await saveBankItems(items);
    setBusy(false);
    if (!r.ok) return showToast(t('تعذر الحفظ: {error}', { error: r.error || '' }), 'error');
    showToast(skipped ? t('أُضيف {n} سؤالاً للبنك، وتُخطّي {s} موجود مسبقاً.', { n: items.length, s: skipped }) : t('أُضيف {n} سؤالاً للبنك.', { n: items.length }), 'success');
    onDone();
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="imp-title">
      <Card className="w-full max-w-lg p-5 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h3 id="imp-title" className="text-lg font-bold text-slate-900 dark:text-white">{t('إضافة أسئلة من اختبارات سابقة')}</h3>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('تُنسخ الأسئلة بمادة الاختبار، والأسئلة الموجودة في البنك تُتخطّى. صنّفها بعدها حسب الوحدة والصعوبة.')}</p>
        <div className="overflow-y-auto flex-1 space-y-1.5">
          {list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t('لا توجد اختبارات بأسئلة')}</p>}
          {list.map((q) => (
            <label key={q.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <input type="checkbox" checked={picked.includes(q.id)} onChange={() => setPicked(picked.includes(q.id) ? picked.filter((x) => x !== q.id) : [...picked, q.id])} className="w-4 h-4 accent-indigo-600" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{q.title}</span>
                <span className="block text-xs text-slate-500">{q.subject?.name || ''} · {t('{n} سؤال', { n: q.questions?.length || 0 })}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button>
          <Button icon={Download} onClick={() => void run()} disabled={busy || picked.length === 0}>{busy ? t('جارٍ الإضافة...') : t('إضافة للبنك')}</Button>
        </div>
      </Card>
    </div>
  );
};

/** صفحة بنك الأسئلة */
export const QuestionBankPage: React.FC = () => {
  const { currentUser, showToast, setCurrentView, setEditingQuizId } = useApp();
  const { items, setItems, state, reload } = useBank();
  const me = currentUser?.id || '';
  const canAdd = currentUser?.role === 'admin' || currentUser?.role === 'teacher';
  const [filters, setFilters] = useState<Filters>(() => emptyFilters());
  const [selected, setSelected] = useState<string[]>([]);
  const [metaFor, setMetaFor] = useState<BankItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const units = useMemo(() => Array.from(new Set(items.map((b) => b.unit).filter(Boolean))).sort(), [items]);
  const selItems = items.filter((b) => selected.includes(b.id));
  const editable = selItems.filter((b) => currentUser?.role === 'admin' || b.created_by === me);

  const remove = async (list: BankItem[]) => {
    if (!list.length || !window.confirm(list.length === 1 ? t('حذف هذا السؤال من البنك؟ لا يؤثر على الاختبارات التي استخدمته.') : t('حذف {n} أسئلة من البنك؟ لا يؤثر على الاختبارات التي استخدمتها.', { n: list.length }))) return;
    const r = await deleteBankItems(list.map((b) => b.id));
    if (!r.ok) return showToast(t('تعذر الحذف: {error}', { error: r.error || '' }), 'error');
    setSelected(selected.filter((id) => !list.some((b) => b.id === id)));
    setItems();
  };

  const newQuiz = () => {
    try {
      sessionStorage.setItem(BANK_TO_EDITOR_KEY, JSON.stringify({ ids: selected, subject_id: selItems[0]?.subject_id || '' }));
    } catch { /* ignore */ }
    setEditingQuizId(null);
    setCurrentView('create_quiz');
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader
        title={<span className="inline-flex items-center gap-2"><Library className="w-7 h-7 text-indigo-600" />{t('بنك الأسئلة')}</span>}
        subtitle={t('{n} سؤال · احفظ أسئلتك مرة واحدة وابنِ منها اختبارات جديدة بضغطة', { n: items.length })}
        actions={canAdd ? <Button variant="secondary" icon={Download} onClick={() => setImporting(true)}>{t('من اختبارات سابقة')}</Button> : undefined}
      />

      {state === 'error' && (
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-xl p-3">
          {t('تعذر تحميل بنك الأسئلة من الخادم. إذا كانت هذه أول مرة، شغّل تحديث قاعدة البيانات 015.')}
        </p>
      )}

      {selected.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-indigo-600 text-white shadow-lg">
          <span className="text-sm font-bold me-auto">{t('محدد: {n}', { n: selected.length })}</span>
          {currentUser?.role !== 'supervisor' && <Button size="sm" variant="secondary" icon={Plus} onClick={newQuiz}>{t('اختبار جديد من المحدد')}</Button>}
          {editable.length > 0 && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setMetaFor(editable)}>{t('تصنيف')}</Button>}
          {editable.length > 0 && <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove(editable)}>{t('حذف')}</Button>}
          <button type="button" onClick={() => setSelected([])} className="h-9 px-3 rounded-xl text-sm font-semibold hover:bg-white/10">{t('إلغاء التحديد')}</button>
        </div>
      )}

      {state === 'loading' && items.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">{t('جارٍ التحميل')}</p>
      ) : items.length === 0 && state === 'ready' ? (
        <Card className="p-10 text-center space-y-3">
          <Library className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-bold text-slate-800 dark:text-slate-100">{t('البنك فارغ')}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{t('أضف أسئلة من اختباراتك السابقة، أو احفظ أي سؤال من محرر الاختبار بزر «حفظ في البنك».')}</p>
          {canAdd && <Button icon={Download} onClick={() => setImporting(true)}>{t('من اختبارات سابقة')}</Button>}
        </Card>
      ) : (
        <BankList items={items} filters={filters} setFilters={setFilters} selected={selected} setSelected={setSelected}
          onEdit={(b) => setMetaFor([b])} onDelete={(b) => void remove([b])} />
      )}

      {metaFor && <MetaModal items={metaFor} units={units} onClose={() => setMetaFor(null)} onSaved={() => { setMetaFor(null); setItems(); }} />}
      {importing && <ImportModal existing={items} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void reload(); }} />}
    </div>
  );
};

/** نافذة «إضافة من بنك الأسئلة» داخل محرر الاختبار */
export const BankPickerModal: React.FC<{ subjectId: string; onClose: () => void; onAdd: (qs: QuestionItem[]) => void }> = ({ subjectId, onClose, onAdd }) => {
  const { currentUser, showToast } = useApp();
  const { items, state } = useBank();
  const [filters, setFilters] = useState<Filters>(() => emptyFilters(subjectId));
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(5);
  const shown = filterBank(items, filters, currentUser?.id || '');

  const add = (list: BankItem[]) => {
    if (!list.length) return;
    markBankUsed(list.map((b) => b.id));
    onAdd(list.map(toQuizQuestion));
    showToast(t('أُضيف {n} سؤالاً للاختبار', { n: list.length }), 'success');
  };

  // خارج نموذج المحرر: Enter في البحث لا يحفظ الاختبار
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-6" dir={uiDir()} role="dialog" aria-modal="true" aria-labelledby="pick-title">
      <Card className="w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 id="pick-title" className="text-lg font-bold text-slate-900 dark:text-white inline-flex items-center gap-2"><Library className="w-5 h-5 text-indigo-600" />{t('إضافة من بنك الأسئلة')}</h3>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {state === 'error' && <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-xl p-3 mb-3">{t('تعذر تحميل بنك الأسئلة من الخادم. إذا كانت هذه أول مرة، شغّل تحديث قاعدة البيانات 015.')}</p>}
          {state === 'loading' && items.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">{t('جارٍ التحميل')}</p> : (
            <BankList items={items} filters={filters} setFilters={setFilters} selected={selected} setSelected={setSelected} />
          )}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 me-auto">
            <span className="text-sm text-slate-600 dark:text-slate-300">{t('سحب عشوائي:')}</span>
            <input type="number" min={1} max={Math.max(1, shown.length)} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} aria-label={t('عدد الأسئلة العشوائية')} className={`${inputCls} w-20`} />
            <Button size="sm" variant="secondary" icon={Shuffle} disabled={!shown.length} onClick={() => add(pickRandom(shown, count))}>
              {t('من {n} مطابق', { n: shown.length })}
            </Button>
          </div>
          <Button variant="secondary" onClick={onClose}>{t('إغلاق')}</Button>
          <Button icon={Plus} disabled={!selected.length} onClick={() => { add(items.filter((b) => selected.includes(b.id))); setSelected([]); }}>
            {t('إضافة المحدد ({n})', { n: selected.length })}
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  );
};
