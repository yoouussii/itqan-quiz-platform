import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUp, X, Trash2, AlertTriangle, CheckCircle2, ClipboardPaste, Copy, Sparkles, ExternalLink } from 'lucide-react';
import { AI_SITES, GenType, QuestionsPromptInput, copyText, questionsPrompt } from '../../utils/aiPrompt';
import { useApp } from '../../context/AppContext';
import { Card, Button, Chip } from '../common/ui';
import { stripHtml } from '../common/RichText';
import { uiDir, t, optionLetters } from '../../i18n';
import { marksCount } from '../../i18n/count';
import { parseQuestionsText } from '../../utils/questionImport';
import { extractFileText } from '../../utils/fileText';
import { cleanArabicText } from '../../utils/arabicText';
import { QUESTION_TYPES, QuestionItem } from './QuizEditor';

const EXAMPLE = `1. ما ناتج 5 + 3؟ (2 درجة)
أ) 7
ب) 8 *
ج) 9
د) 10

2. عاصمة المملكة العربية السعودية هي:
أ) جدة
ب) الرياض
ج) مكة المكرمة
الإجابة: ب

3. الماء يغلي عند 100 درجة مئوية.
الإجابة: صح

4. اشرح دورة الماء في الطبيعة. (5 درجات)`;

const typeLabel = (type: string) => t(QUESTION_TYPES.find((x) => x.type === type)?.label || '');

/** استيراد أسئلة من ملف Word أو PDF أو نص ملصوق، مع معاينة وتصحيح قبل الإضافة */
/** خانة نص تتمدد بطول السؤال كاملاً (بلا تمرير داخلي) */
const AutoTextarea: React.FC<{ value: string; onChange: (v: string) => void; label: string }> = ({ value, onChange, label }) => {
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
      className="flex-1 min-w-0 min-h-[36px] px-2 py-1.5 rounded-lg border border-transparent hover:border-slate-200 focus:border-indigo-400 dark:hover:border-slate-700 bg-transparent text-sm leading-relaxed font-semibold text-slate-900 dark:text-white resize-none overflow-hidden whitespace-pre-wrap" />
  );
};

export const ImportQuestionsModal: React.FC<{ onClose: () => void; onAdd: (qs: QuestionItem[]) => void; mode?: 'file' | 'ai'; subjectName?: string }> = ({ onClose, onAdd, mode = 'file', subjectName = '' }) => {
  const { showToast } = useApp();
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [review, setReview] = useState<number[]>([]);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const letters = optionLetters();
  // توليد بالذكاء الاصطناعي مجاناً: طلب جاهز يُنسخ لأي شات، ثم يُلصق الرد في خانة الأسئلة
  const [lesson, setLesson] = useState('');
  const [gen, setGen] = useState<Omit<QuestionsPromptInput, 'lesson' | 'subject'>>({ count: 10, types: ['mcq', 'true_false'], difficulty: 'mixed', grade: '' });
  const toggleType = (x: GenType) => setGen((g) => ({ ...g, types: g.types.includes(x) ? g.types.filter((y) => y !== x) : [...g.types, x] }));
  const copyPrompt = async () => {
    if (lesson.trim().length < 40) return showToast(t('الصق نص الدرس أولاً (فقرة على الأقل).'), 'info');
    const ok = await copyText(questionsPrompt({ ...gen, lesson, subject: subjectName }));
    showToast(ok ? t('تم نسخ الطلب. الصقه في الشات ثم انسخ الرد إلى الخانة بالأسفل.') : t('تعذر النسخ'), ok ? 'success' : 'error');
  };

  const parse = (text: string) => {
    const r = parseQuestionsText(cleanArabicText(text));
    if (!r.questions.length) {
      showToast(t('لم يُعثر على أسئلة. تأكد أن كل سؤال يبدأ برقم (1. أو 1-) وأن الخيارات تبدأ بحرف (أ) ب)...).'), 'info');
      return;
    }
    setItems(r.questions);
    setReview(r.needsReview.map((n) => n - 1));
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      parse(await extractFileText(file));
    } catch (e: any) {
      const msg = e?.message === 'doc'
        ? t('صيغة .doc القديمة غير مدعومة. افتح الملف في Word واحفظه بصيغة .docx ثم أعد المحاولة.')
        : e?.message === 'type'
          ? t('الملف يجب أن يكون Word (.docx) أو PDF أو نصاً (.txt).')
          : t('تعذرت قراءة الملف. جرّب نسخ الأسئلة ولصقها في الخانة.');
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<QuestionItem>) => {
    setItems((prev) => prev && prev.map((q, k) => (k === i ? { ...q, ...patch } : q)));
    if (patch.correct_option_index !== undefined) setReview((r) => r.filter((x) => x !== i));
  };
  const remove = (i: number) => {
    setItems((prev) => prev && prev.filter((_, k) => k !== i));
    setReview((r) => r.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-6" dir={uiDir()} role="dialog" aria-modal="true" aria-labelledby="imp-q-title">
      <Card className="w-full max-w-5xl max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 id="imp-q-title" className="text-lg font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
            {mode === 'ai' ? <><Sparkles className="w-5 h-5 text-violet-600" />{t('توليد أسئلة بالذكاء الاصطناعي (مجاناً)')}</> : <><FileUp className="w-5 h-5 text-indigo-600" />{t('استيراد أسئلة من ملف')}</>}
          </h3>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {!items ? (
            <>
              {mode === 'ai' ? (
                <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-3" data-testid="ai-generate">
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {t('بدون أي اشتراك: المنصة تجهّز طلباً جاهزاً، تنسخه في أي شات مجاني، ثم تلصق الرد بالأسفل فتتحول الأسئلة تلقائياً وتراجعها قبل الإضافة.')}
                  </p>
                  <div>
                    <label htmlFor="ai-lesson" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('1) الصق نص الدرس')}</label>
                    <textarea id="ai-lesson" value={lesson} onChange={(e) => setLesson(e.target.value)} rows={5} dir="auto" placeholder={t('انسخ نص الدرس من الكتاب أو الملف والصقه هنا')}
                      className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <label className="space-y-1"><span className="block font-bold text-slate-700 dark:text-slate-300">{t('عدد الأسئلة')}</span>
                      <input type="number" min={1} max={40} value={gen.count} onChange={(e) => setGen((g) => ({ ...g, count: Math.max(1, Math.min(40, Number(e.target.value) || 1)) }))}
                        className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" /></label>
                    <label className="space-y-1"><span className="block font-bold text-slate-700 dark:text-slate-300">{t('الصعوبة')}</span>
                      <select value={gen.difficulty} onChange={(e) => setGen((g) => ({ ...g, difficulty: e.target.value as QuestionsPromptInput['difficulty'] }))}
                        className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        <option value="mixed">{t('متنوعة')}</option><option value="easy">{t('سهل')}</option><option value="medium">{t('متوسط')}</option><option value="hard">{t('صعب')}</option>
                      </select></label>
                    <label className="space-y-1 col-span-2"><span className="block font-bold text-slate-700 dark:text-slate-300">{t('الصف (اختياري)')}</span>
                      <input value={gen.grade} onChange={(e) => setGen((g) => ({ ...g, grade: e.target.value }))} placeholder={t('مثال: الثالث المتوسط')}
                        className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" /></label>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-800 dark:text-slate-100" role="group" aria-label={t('أنواع الأسئلة')}>
                    {([['mcq', 'اختيار من متعدد'], ['true_false', 'صح أو خطأ'], ['essay', 'مقالي']] as const).map(([k, l]) => (
                      <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" className="accent-violet-600" checked={gen.types.includes(k)} onChange={() => toggleType(k)} />{t(l)}</label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('2) انسخ الطلب وافتح أي شات:')}</span>
                    <Button size="sm" icon={Copy} onClick={() => void copyPrompt()}>{t('نسخ الطلب')}</Button>
                    {AI_SITES.map((s) => (
                      <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800">{s.name}<ExternalLink className="w-3 h-3" /></a>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('3) انسخ رد الشات كاملاً والصقه في الخانة بالأسفل، ثم اضغط «قراءة الأسئلة». راجع الأسئلة دائماً: الذكاء الاصطناعي قد يخطئ.')}</p>
                </div>
              ) : (
              <label className={`block rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 text-center cursor-pointer hover:border-indigo-400 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                <FileUp className="w-10 h-10 mx-auto text-indigo-500" />
                <span className="block mt-2 font-bold text-slate-800 dark:text-slate-100">{busy ? t('جارٍ قراءة الملف...') : t('اختر ملف Word أو PDF')}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">{t('‎.docx أو ‎.pdf أو ‎.txt — يُقرأ على جهازك ولا يُرفع لأي مكان. ملفات Word أدق من PDF.')}</span>
                <input type="file" accept=".docx,.pdf,.txt" className="sr-only" aria-label={t('ملف الأسئلة')} onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
              )}

              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5"><ClipboardPaste className="w-4 h-4" />{mode === 'ai' ? t('الصق رد الذكاء الاصطناعي هنا') : t('أو الصق الأسئلة هنا')}</span>
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={7} placeholder={EXAMPLE} aria-label={t('نص الأسئلة')}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white leading-relaxed" dir="auto" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!paste.trim()} onClick={() => parse(paste)}>{t('قراءة الأسئلة')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowExample(!showExample)}>{t('كيف أكتب الملف؟')}</Button>
                </div>
              </div>

              {showExample && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <ul className="list-disc ps-5 space-y-1">
                    <li>{t('كل سؤال يبدأ برقم: «1.» أو «1-» أو «س1:». الأرقام التلقائية في Word تعمل أيضاً.')}</li>
                    <li>{t('الخيارات تبدأ بحرف: أ) ب) ج) د) أو a) b) c).')}</li>
                    <li>{t('الإجابة الصحيحة: ضع * أو ✓ بعدها، أو اكتبها بخط عريض أو تحتها خط في Word، أو اكتب سطر «الإجابة: ب»، أو ضع «مفتاح الإجابة» في آخر الملف (1- ب، 2- أ...).')}</li>
                    <li>{t('صح أو خطأ: اكتب «الإجابة: صح» أو «الإجابة: خطأ». والسؤال بلا خيارات يصبح مقالياً.')}</li>
                    <li>{t('الدرجة اختيارية بين قوسين في آخر السؤال: (2 درجة).')}</li>
                  </ul>
                  <pre className="whitespace-pre-wrap text-xs bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700" dir="rtl">{EXAMPLE}</pre>
                  <Button size="sm" variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard?.writeText(EXAMPLE); showToast(t('تم نسخ المثال'), 'success'); }}>{t('نسخ المثال')}</Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Chip tone="info">{t('{n} سؤال', { n: items.length })}</Chip>
                {review.length > 0
                  ? <Chip tone="warn"><AlertTriangle className="w-3.5 h-3.5" />{t('{n} يحتاج تحديد الإجابة الصحيحة', { n: review.length })}</Chip>
                  : <Chip tone="ok"><CheckCircle2 className="w-3.5 h-3.5" />{t('كل الأسئلة جاهزة')}</Chip>}
                <span className="text-xs text-slate-500 dark:text-slate-400">{t('راجع الأسئلة: اضغط على الخيار لجعله الإجابة الصحيحة، وعدّل أي شيء بعد الإضافة من المحرر.')}</span>
              </div>
              <ol className="space-y-2.5">
                {items.map((q, i) => (
                  <li key={q.uid || i} className={`rounded-2xl border p-3.5 space-y-2 ${review.includes(i) ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
                    <div className="flex items-start gap-2">
                      <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <AutoTextarea value={stripHtml(q.question_text)} onChange={(v) => update(i, { question_text: `<p>${v.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` })}
                        label={t('نص السؤال {n}', { n: i + 1 })} />
                      <Chip>{typeLabel(q.type)}</Chip>
                      <Chip>{marksCount(q.marks)}</Chip>
                      <button type="button" onClick={() => remove(i)} aria-label={t('حذف السؤال')} className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    {q.type !== 'essay' && (
                      <div className="grid sm:grid-cols-2 gap-1.5 ps-9" role="radiogroup" aria-label={t('الإجابة الصحيحة للسؤال {n}', { n: i + 1 })}>
                        {q.options.map((o, k) => {
                          const on = k === q.correct_option_index && !review.includes(i);
                          return (
                            <button key={k} type="button" role="radio" aria-checked={on} onClick={() => update(i, { correct_option_index: k })}
                              className={`text-start text-sm px-3 py-1.5 rounded-lg border flex items-center gap-2 ${on ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'}`}>
                              <span className="w-5 text-center">{letters[k]}</span><span className="flex-1" dir="auto">{q.type === 'true_false' ? t(o) : stripHtml(o)}</span>
                              {on && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {q.type === 'essay' && q.explanation && <p className="ps-9 text-xs text-slate-500 dark:text-slate-400">{t('إجابة نموذجية:')}{' '}{stripHtml(q.explanation)}</p>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">
          {items && <Button variant="secondary" onClick={() => { setItems(null); setReview([]); }}>{t('ملف آخر')}</Button>}
          <Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button>
          {items && (
            <Button icon={CheckCircle2} disabled={!items.length || review.length > 0} onClick={() => { onAdd(items); showToast(t('أُضيف {n} سؤالاً للاختبار', { n: items.length }), 'success'); onClose(); }}
              title={review.length ? t('حدد الإجابة الصحيحة للأسئلة المعلّمة أولاً') : undefined}>
              {t('إضافة {n} سؤال للاختبار', { n: items.length })}
            </Button>
          )}
        </div>
      </Card>
    </div>,
    document.body
  );
};
