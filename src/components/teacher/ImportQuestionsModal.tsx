import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUp, X, AlertTriangle, CheckCircle2, ClipboardPaste, Copy, Sparkles, ExternalLink, Wand2 } from 'lucide-react';
import { AI_SITES, GenType, QuestionsPromptInput, copyText, questionsPrompt } from '../../utils/aiPrompt';
import { useApp } from '../../context/AppContext';
import { Card, Button, Chip } from '../common/ui';
import { uiDir, t } from '../../i18n';
import { parseQuestionsText } from '../../utils/questionImport';
import { extractFileContent } from '../../utils/fileText';
import { ImportReview, Row, rowPending } from './ImportReview';
import { cleanArabicText } from '../../utils/arabicText';
import { QUESTION_TYPES, QuestionItem } from './QuizEditor';
import { structurePrompt } from '../../utils/aiPrompt';
import type { QuizPaper } from '../../types';
import type { LinePos } from '../../utils/fileText';
import { paperFromPdf } from './PaperSetup';

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


export const ImportQuestionsModal: React.FC<{ onClose: () => void; onAdd: (qs: QuestionItem[], extra?: { paper?: QuizPaper | null }) => void; mode?: 'file' | 'ai'; subjectName?: string }> = ({ onClose, onAdd, mode = 'file', subjectName = '' }) => {
  const { showToast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  // نص الملف كما استُخرج (لترتيبه بالذكاء الاصطناعي إن لم تكن القراءة دقيقة)
  const [rawText, setRawText] = useState('');
  const [aiFix, setAiFix] = useState(false);
  const [aiReply, setAiReply] = useState('');
  // ملف PDF: إرفاقه كورقة أصلية يحل الطالب عليها، ومواضع أسطره لتحديد مكان كل سؤال
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [positions, setPositions] = useState<LinePos[]>([]);
  const [attachPaper, setAttachPaper] = useState(true);
  const [adding, setAdding] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [showExample, setShowExample] = useState(false);
  // توليد بالذكاء الاصطناعي مجاناً: طلب جاهز يُنسخ لأي شات، ثم يُلصق الرد في خانة الأسئلة
  const [lesson, setLesson] = useState('');
  const [gen, setGen] = useState<Omit<QuestionsPromptInput, 'lesson' | 'subject'>>({ count: 10, types: ['mcq', 'true_false'], difficulty: 'mixed', grade: '' });
  const toggleType = (x: GenType) => setGen((g) => ({ ...g, types: g.types.includes(x) ? g.types.filter((y) => y !== x) : [...g.types, x] }));
  const copyPrompt = async () => {
    if (lesson.trim().length < 40) return showToast(t('الصق نص الدرس أولاً (فقرة على الأقل).'), 'info');
    const ok = await copyText(questionsPrompt({ ...gen, lesson, subject: subjectName }));
    showToast(ok ? t('تم نسخ الطلب. الصقه في الشات ثم انسخ الرد إلى الخانة بالأسفل.') : t('تعذر النسخ'), ok ? 'success' : 'error');
  };

  const parse = (text: string, imgs: string[] = []) => {
    const r = parseQuestionsText(cleanArabicText(text), imgs);
    if (!r.questions.length) {
      showToast(t('لم يُعثر على أسئلة. تأكد أن كل سؤال يبدأ برقم (1. أو 1-) وأن الخيارات تبدأ بحرف (أ) ب)...).'), 'info');
      return;
    }
    setRows(r.questions.map((q, i) => ({ q, meta: r.meta?.[i] || {}, review: r.needsReview.includes(i + 1), subReview: r.meta?.[i]?.subReview })));
    setIgnored(r.ignored || []);
    setImages(imgs);
    setAiFix(false);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const c = await extractFileContent(file);
      setRawText(c.text);
      setPdfFile(file.name.toLowerCase().endsWith('.pdf') ? file : null);
      setPositions(c.positions || []);
      parse(c.text, c.images);
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

  const items = rows?.map((r) => r.q) || null;
  const pending = rows ? rows.filter(rowPending).length : 0;
  // ترتيب الملف بالذكاء الاصطناعي: نص الملف + الصيغة المطلوبة، والرد يُقرأ بنفس المحلل (الصور تبقى بعلاماتها)
  const copyStructure = async () => {
    const ok = await copyText(structurePrompt(rawText || paste));
    showToast(ok ? t('تم نسخ الطلب. الصقه في الشات ثم الصق الرد هنا.') : t('تعذر النسخ'), ok ? 'success' : 'error');
  };
  const counts = rows ? (['mcq', 'true_false', 'fill_blank', 'matching', 'passage', 'essay'] as const).map((ty) => [ty, rows.filter((r) => r.q.type === ty).length] as const).filter(([, n]) => n > 0) : [];

  const doAdd = async () => {
    if (!rows) return;
    let qs = rows.map((r) => r.q);
    let paper: QuizPaper | null = null;
    if (pdfFile && attachPaper) {
      setAdding(true);
      try {
        paper = await paperFromPdf(pdfFile);
        // مكان كل سؤال على الورقة من موضع سطره في الملف (بجانب رقمه)
        // سؤالان في سطر واحد: كلٌّ عند رقمه في عموده
        const seen = new Map<number, number>();
        qs = rows.map((r) => {
          const pos = r.meta.line != null ? positions[r.meta.line] : undefined;
          if (!pos) return r.q;
          const k = seen.get(r.meta.line!) || 0;
          seen.set(r.meta.line!, k + 1);
          const x = pos.qx?.[k] ?? pos.x;
          return { ...r.q, pin: { page: pos.page, x: Math.min(0.985, x + 0.025), y: pos.y + 0.008 } };
        });
      } catch { showToast(t('تعذر تجهيز الورقة الأصلية، أُضيفت الأسئلة فقط'), 'info'); }
      setAdding(false);
    }
    onAdd(qs, paper ? { paper } : undefined);
    showToast(t('أُضيف {n} سؤالاً للاختبار', { n: qs.length }), 'success');
    onClose();
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
                    <li>{t('ورقة الامتحان العادية تعمل كما هي: عناوين الأقسام («اختر…»، «ضع علامة ✓ أو ✗»، «أكمل…»، «صل…»، «أجب…») تحدد نوع الأسئلة، و( ) في آخر العبارة تعني صح أو خطأ، والنقاط …… تعني أكمل الفراغ. وترويسة الورقة وجدول الدرجات والتوقيعات تُتجاهل.')}</li>
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
                <Chip tone="info">{t('{n} سؤال', { n: rows!.length })}</Chip>
                {counts.map(([ty, n]) => <Chip key={ty}>{typeLabel(ty)}: {n}</Chip>)}
                {pending > 0
                  ? <Chip tone="warn"><AlertTriangle className="w-3.5 h-3.5" />{t('{n} يحتاج تحديد الإجابة الصحيحة', { n: pending })}</Chip>
                  : <Chip tone="ok"><CheckCircle2 className="w-3.5 h-3.5" />{t('كل الأسئلة جاهزة')}</Chip>}
                {images.length > 0 && <Chip>{t('{n} صورة', { n: images.length })}</Chip>}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('راجع كل سؤال: غيّر نوعه أو درجته، واضغط على الخيار الصحيح. يمكنك تعديل أي شيء بعد الإضافة من المحرر.')}</p>

              {(rawText || paste) && (
                <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2" data-testid="ai-structure">
                  <div className="flex flex-wrap items-center gap-2">
                    <Wand2 className="w-4 h-4 text-violet-600 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 min-w-[12rem]">{t('القراءة غير دقيقة؟ رتّب الملف بالذكاء الاصطناعي مجاناً في نصف دقيقة.')}</span>
                    <Button size="sm" variant="secondary" onClick={() => setAiFix(!aiFix)}>{aiFix ? t('إخفاء') : t('رتّبه بالذكاء الاصطناعي')}</Button>
                  </div>
                  {aiFix && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('1) انسخ الطلب وافتح أي شات:')}</span>
                        <Button size="sm" icon={Copy} onClick={() => void copyStructure()}>{t('نسخ الطلب')}</Button>
                        {AI_SITES.map((x) => (
                          <a key={x.name} href={x.url} target="_blank" rel="noopener noreferrer" className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800">{x.name}<ExternalLink className="w-3 h-3" /></a>
                        ))}
                      </div>
                      <textarea value={aiReply} onChange={(e) => setAiReply(e.target.value)} rows={4} dir="auto" placeholder={t('2) الصق رد الشات هنا')} aria-label={t('رد الذكاء الاصطناعي')}
                        className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                      <Button size="sm" disabled={!aiReply.trim()} onClick={() => parse(aiReply, images)}>{t('قراءة الرد')}</Button>
                    </div>
                  )}
                </div>
              )}

              <ImportReview rows={rows!} setRows={setRows} ignored={ignored} setIgnored={setIgnored} images={images} />
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">
          {items && pdfFile && (
            <label className="me-auto inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer" data-testid="attach-paper">
              <input type="checkbox" checked={attachPaper} onChange={(e) => setAttachPaper(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              {t('أرفق الورقة الأصلية: يحل الطالب على ملفك بشكله نفسه')}
            </label>
          )}
          {items && <Button variant="secondary" onClick={() => { setRows(null); setIgnored([]); setImages([]); setRawText(''); setAiReply(''); }}>{t('ملف آخر')}</Button>}
          <Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button>
          {items && (
            <Button icon={CheckCircle2} disabled={!items.length || pending > 0 || adding} onClick={() => void doAdd()}
              title={pending ? t('حدد الإجابة الصحيحة للأسئلة المعلّمة أولاً') : undefined}>
              {adding ? t('جارٍ تجهيز الورقة...') : t('إضافة {n} سؤال للاختبار', { n: items.length })}
            </Button>
          )}
        </div>
      </Card>
    </div>,
    document.body
  );
};
