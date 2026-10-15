import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PenLine, CheckCircle2, ChevronRight, ChevronLeft, EyeOff, Eye, FileText, Sparkles, Copy, ExternalLink, Check, X } from 'lucide-react';
import { AI_SITES, copyText, gradingPrompt, parseGradingReply } from '../../utils/aiPrompt';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button } from '../common/ui';
import { RichText } from '../common/RichText';
import { EssayItem, essayItems, wrongBlankGroups, loadBlankDismissed, saveBlankDismissed } from '../../utils/grading';
import { acceptBlank } from '../../services/quizSync';
import { uiDir, t } from '../../i18n';
import { hasPerm } from '../../utils/permissions';
import { MascotHere } from '../common/Mascot';
import { useEnsureAnswers } from '../common/useEnsureAnswers';


/** مراجعة إجابات «أكمل الفراغ» المحسوبة خطأ: كل إجابة متشابهة مرة واحدة مع عدد من كتبها */
const BlankReview: React.FC<{
  groups: ReturnType<typeof wrongBlankGroups>; quizTitle: (id: string) => string; accepting: string;
  names: (ids: string[]) => string; hideNames: boolean; onToggleNames: () => void;
  onAccept: (g: ReturnType<typeof wrongBlankGroups>[number]) => void; onDismiss: (key: string) => void;
}> = ({ groups, quizTitle, accepting, names, hideNames, onToggleNames, onAccept, onDismiss }) => {
  if (!groups.length) {
    return (
      <Card className="p-10 text-center space-y-2" data-testid="blanks-empty">
        <MascotHere className="mx-auto mb-1" />
        <p className="font-bold text-slate-900 dark:text-white">{t('لا توجد إجابات «أكمل الفراغ» تحتاج مراجعة')}</p>
      </Card>
    );
  }
  let lastQ = '';
  return (
    <Card className="p-5 space-y-3" data-testid="blanks-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600 dark:text-slate-300">{t('إجابات حُسبت خطأ لأنها لا تطابق الإجابة المقبولة. إن كانت صحيحة اضغط «اعتبرها صحيحة» فتُضاف للإجابات المقبولة وتُصحَّح لكل من كتبها.')}</p>
        <button type="button" onClick={onToggleNames} className="text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 hover:text-indigo-600">
          {hideNames ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}{hideNames ? t('إظهار الأسماء') : t('إخفاء الأسماء')}
        </button>
      </div>
      {groups.map((g) => {
        const qKey = `${g.quizId}|${g.question.id}`;
        const header = qKey !== lastQ;
        lastQ = qKey;
        return (
          <React.Fragment key={g.key}>
            {header && (
              <div className="pt-3 first:pt-0 border-t first:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />{quizTitle(g.quizId)} • {t('السؤال {n}', { n: g.order })}</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5"><RichText html={g.question.question_text} /></div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                  <span className="text-slate-500">{t('المقبول:')}</span>
                  {(g.question.accepted_answers || []).filter(Boolean).map((a) => (
                    <span key={a} className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 font-semibold">{a}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20" data-testid="blank-group">
              <div className="flex-1 min-w-[10rem]">
                <div className="text-[15px] font-bold text-slate-900 dark:text-white" dir="auto">{g.text}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{t('{n} طالب', { n: g.count })}{!hideNames && ` • ${names(g.studentIds)}`}</div>
              </div>
              <Button size="sm" icon={Check} disabled={!!accepting} onClick={() => onAccept(g)}>
                {accepting === g.key ? t('جارٍ الحفظ…') : t('اعتبرها صحيحة')}
              </Button>
              <button type="button" onClick={() => onDismiss(g.key)} className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 hover:bg-white dark:hover:bg-slate-800">
                <X className="w-3.5 h-3.5" />{t('خطأ فعلاً')}
              </button>
            </div>
          </React.Fragment>
        );
      })}
    </Card>
  );
};

/**
 * «التصحيح»: كل الإجابات المقالية في مكان واحد، تُصحَّح واحدة تلو الأخرى.
 * الترتيب حسب الاختبار ثم السؤال، فيصحح المعلم نفس السؤال لكل الطلاب متتالياً (أعدل وأسرع).
 * المعلم يرى اختباراته فقط، والمدير والمشرف يرون كل ما في نطاقهم.
 */
export const GradingPage: React.FC = () => {
  const { currentUser, quizzes, submissions, users, classes, gradeEssay, showToast, refreshData } = useApp();
  // إجابات التسليمات القديمة تُجلب عند فتح الصفحة (لا تُحمَّل تلقائياً)
  const answersLoading = useEnsureAnswers('grading');
  const [quizFilter, setQuizFilter] = useState('');
  const [show, setShow] = useState<'pending' | 'graded' | 'blanks'>('pending');
  const [hideNames, setHideNames] = useState(false);
  const [index, setIndex] = useState(0);
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mySubs = useMemo(() => {
    // المعلم يصحح اختباراته، ومن لديه صلاحية «التصحيح» (والمدير) يصحح كل ما في نطاقه
    const all = hasPerm(currentUser, 'can_grade_essays');
    const mine = new Set(quizzes.filter((q) => !q.is_deleted && (all || q.teacher_id === currentUser?.id || q.created_by === currentUser?.id)).map((q) => q.id));
    return (submissions || []).filter((s) => mine.has(s.quiz_id) && s.status !== 'in_progress');
  }, [quizzes, submissions, currentUser]);

  const all = useMemo(() => essayItems(mySubs), [mySubs]);
  const quizTitle = (id: string) => quizzes.find((q) => q.id === id)?.title || '—';

  // «أكمل الفراغ»: إجابات حُسبت خطأ تلقائياً، لمراجعة المعلم (قد تكون صحيحة بصياغة أخرى)
  const [dismissed, setDismissed] = useState<string[]>(loadBlankDismissed);
  const blanks = useMemo(() => {
    const hide = new Set(dismissed);
    return wrongBlankGroups(mySubs).filter((g) => !hide.has(g.key))
      .sort((a, b) => quizTitle(a.quizId).localeCompare(quizTitle(b.quizId), 'ar') || a.order - b.order || b.count - a.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySubs, dismissed]);
  const dismiss = (key: string) => {
    const next = [...dismissed, key].slice(-2000);
    setDismissed(next);
    saveBlankDismissed(next);
  };
  const [accepting, setAccepting] = useState('');
  const accept = async (g: (typeof blanks)[number]) => {
    setAccepting(g.key);
    const r = await acceptBlank(g.quizId, g.question.id, g.text);
    if (r.ok) {
      await refreshData();
      showToast(t('أُضيفت «{a}» للإجابات المقبولة وأُعيد تصحيح {n} تسليم', { a: g.text, n: r.updated }), 'success');
    } else {
      showToast(r.error === 'missing' ? t('حدّث قاعدة البيانات (070) لتفعيل هذه الميزة') : t('تعذر الحفظ: {e}', { e: r.error || '' }), 'error');
    }
    setAccepting('');
  };
  const blankQuizzes = useMemo(() => {
    const m = new Map<string, number>();
    blanks.forEach((g) => m.set(g.quizId, (m.get(g.quizId) || 0) + g.count));
    return m;
  }, [blanks]);
  const blankTotal = blanks.reduce((n, g) => n + g.count, 0);
  // لا مقالي بانتظار التصحيح وفيه إجابات «أكمل الفراغ» تنتظر: نفتح تبويبها مباشرة (مرة واحدة)
  const autoTab = useRef(false);
  useEffect(() => {
    if (autoTab.current || !mySubs.length) return;
    autoTab.current = true;
    if (!all.some((x) => !x.graded) && blankTotal > 0) setShow('blanks');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySubs.length, blankTotal]);

  const byQuiz = useMemo(() => {
    const m = new Map<string, { pending: number; graded: number }>();
    all.forEach((it) => {
      const e = m.get(it.submission.quiz_id) || { pending: 0, graded: 0 };
      if (it.graded) e.graded++; else e.pending++;
      m.set(it.submission.quiz_id, e);
    });
    return m;
  }, [all]);

  // قائمة ثابتة أثناء التصحيح: لا تختفي الإجابة من أمام المعلم فور حفظها (يتنقل بالتالي/السابق)
  const [queueKeys, setQueueKeys] = useState<string[]>([]);
  const filterKey = `${quizFilter}|${show}`;
  useEffect(() => {
    const list = all
      .filter((it) => (!quizFilter || it.submission.quiz_id === quizFilter) && (show === 'pending' ? !it.graded : it.graded))
      .sort((a, b) => quizTitle(a.submission.quiz_id).localeCompare(quizTitle(b.submission.quiz_id), 'ar') || a.order - b.order
        || (a.subQuestionId || '').localeCompare(b.subQuestionId || '') || (a.submission.completed_at || '').localeCompare(b.submission.completed_at || ''));
    setQueueKeys(list.map((x) => x.key));
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, all.length === 0]);
  const byKey = useMemo(() => new Map(all.map((x) => [x.key, x])), [all]);
  const queue = queueKeys.map((k) => byKey.get(k)).filter(Boolean) as EssayItem[];
  const item = queue[Math.min(index, Math.max(0, queue.length - 1))];
  const pendingLeft = queue.filter((x) => !x.graded).length;

  useEffect(() => {
    setMarks(item?.graded ? String(item.awarded) : '');
    setFeedback(item?.feedback || '');
    setAiReply('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [item?.key, item?.graded, item?.awarded]);

  const student = item ? users.find((u) => u.id === item.submission.student_id) : undefined;
  const studentLabel = hideNames ? t('طالب رقم {n}', { n: index + 1 }) : student?.name || t('طالب');
  const cls = student ? classes.find((c) => c.id === student.class_id)?.name : '';

  const save = async (value?: number) => {
    if (!item) return;
    const v = value ?? Number(marks.replace(',', '.'));
    if (marks.trim() === '' && value === undefined) return inputRef.current?.focus();
    if (!Number.isFinite(v) || v < 0 || v > item.max) return;
    setBusy(true);
    const ok = await gradeEssay(item.submission.id, item.question.id, item.subQuestionId, v, feedback);
    setBusy(false);
    if (ok !== false && index < queue.length - 1) setIndex(index + 1);
  };

  const quickMarks = item ? Array.from(new Set([0, item.max / 2, item.max].map((x) => Math.round(x * 2) / 2))) : [];
  const totalPending = all.filter((x) => !x.graded).length;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={t('التصحيح')} subtitle={[
        totalPending ? t('{n} إجابة مقالية بانتظار التصحيح. الطلاب لا يرون درجتهم النهائية حتى تُصحَّح.', { n: totalPending }) : t('لا توجد إجابات مقالية بانتظار التصحيح.'),
        blankTotal ? t('{n} إجابة «أكمل الفراغ» حُسبت خطأ تحتاج مراجعتك.', { n: blankTotal }) : '',
      ].filter(Boolean).join(' ')} />

      <div className="grid lg:grid-cols-[260px_1fr] gap-5 items-start">
        <Card className="p-3 space-y-1" aria-label={t('الاختبارات')}>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-2" role="radiogroup">
            {(['pending', 'graded', 'blanks'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={show === k} onClick={() => { setShow(k); setQuizFilter(''); }}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-bold leading-tight ${show === k ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
                {k === 'pending' ? t('بانتظار التصحيح') : k === 'graded' ? t('تم تصحيحها') : t('أكمل الفراغ')}
                {k === 'blanks' && blankTotal > 0 && <span className="ms-1 inline-flex min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] items-center justify-center">{blankTotal}</span>}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setQuizFilter('')}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-start ${!quizFilter ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            {t('كل الاختبارات')}<span className="text-xs font-bold">{show === 'blanks' ? blankTotal : show === 'pending' ? totalPending : all.length - totalPending}</span>
          </button>
          {answersLoading && <p className="px-3 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">{t('جارٍ تحميل الإجابات القديمة...')}</p>}
          {show === 'blanks' && Array.from(blankQuizzes.entries()).map(([id, n]) => (
            <button key={id} type="button" onClick={() => setQuizFilter(id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm text-start ${quizFilter === id ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <span className="truncate">{quizTitle(id)}</span>
              <span className="shrink-0 min-w-6 h-6 px-1.5 rounded-full text-xs font-bold inline-flex items-center justify-center bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">{n}</span>
            </button>
          ))}
          {show !== 'blanks' && Array.from(byQuiz.entries()).filter(([, c]) => (show === 'pending' ? c.pending : c.graded) > 0).map(([id, c]) => (
            <button key={id} type="button" onClick={() => setQuizFilter(id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm text-start ${quizFilter === id ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <span className="truncate">{quizTitle(id)}</span>
              <span className={`shrink-0 min-w-6 h-6 px-1.5 rounded-full text-xs font-bold inline-flex items-center justify-center ${show === 'pending' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'}`}>{show === 'pending' ? c.pending : c.graded}</span>
            </button>
          ))}
        </Card>

        {show === 'blanks' ? (
          <BlankReview groups={blanks.filter((g) => !quizFilter || g.quizId === quizFilter)} quizTitle={quizTitle} accepting={accepting}
            names={(ids) => hideNames ? t('{n} طالب', { n: ids.length }) : ids.map((id) => users.find((u) => u.id === id)?.name || '—').join('، ')}
            hideNames={hideNames} onToggleNames={() => setHideNames((v) => !v)} onAccept={accept} onDismiss={dismiss} />
        ) : !item ? (
          <Card className="p-10 text-center space-y-2" data-testid="grading-empty">
            <MascotHere className="mx-auto mb-1" />
            <p className="font-bold text-slate-900 dark:text-white">{show === 'pending' ? t('أحسنت! لا توجد إجابات بانتظار التصحيح') : t('لا توجد إجابات مصحّحة بعد')}</p>
            {show === 'pending' && all.length > 0 && <button type="button" onClick={() => setShow('graded')} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{t('مراجعة الإجابات المصحّحة')}</button>}
          </Card>
        ) : (
          <Card className="p-5 space-y-4" data-testid="grading-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                <FileText className="w-4 h-4" />{quizTitle(item.submission.quiz_id)} • {t('السؤال {n}', { n: item.order })}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setHideNames((v) => !v)} className="text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 hover:text-indigo-600">
                  {hideNames ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}{hideNames ? t('إظهار الأسماء') : t('إخفاء الأسماء')}
                </button>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('{a} من {b}', { a: index + 1, b: queue.length })}{show === 'pending' && ` • ${t('متبقٍ {n}', { n: pendingLeft })}`}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden>
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${queue.length ? ((queue.length - pendingLeft) / queue.length) * 100 : 0}%` }} />
            </div>

            <section>
              <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{t('السؤال')} <span className="font-normal">({t('{n} درجة', { n: item.max })})</span></h2>
              <div className="text-[15px] text-slate-900 dark:text-white leading-relaxed"><RichText html={item.prompt} /></div>
            </section>
            {item.modelAnswer && (
              <section className="rounded-xl p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900">
                <h3 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">{t('الإجابة النموذجية')}</h3>
                <div className="text-sm text-slate-800 dark:text-slate-100"><RichText html={item.modelAnswer} /></div>
              </section>
            )}
            <section>
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 inline-flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5" />{t('إجابة')} {studentLabel}{!hideNames && cls ? ` • ${cls}` : ''}</h3>
              <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[15px] leading-loose text-slate-900 dark:text-white whitespace-pre-wrap min-h-[6rem]" data-testid="student-answer">{item.text}</div>
            </section>

            <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20">
              <button type="button" onClick={() => setAiOpen((v) => !v)} aria-expanded={aiOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-bold text-violet-800 dark:text-violet-300">
                <span className="inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" />{t('اقتراح درجة بالذكاء الاصطناعي (مجاناً)')}</span>
                <ChevronLeft className={`w-4 h-4 transition ${aiOpen ? '-rotate-90' : ''}`} />
              </button>
              {aiOpen && (
                <div className="px-3 pb-3 space-y-2 text-xs text-slate-700 dark:text-slate-300" data-testid="ai-grade">
                  <ol className="list-decimal ps-5 space-y-0.5">
                    <li>{t('انسخ الطلب (فيه السؤال وإجابة الطالب فقط، بدون اسمه).')}</li>
                    <li>{t('الصقه في أي شات مجاني، وانسخ الرد.')}</li>
                    <li>{t('الصق الرد هنا لتعبئة الدرجة والملاحظة، ثم راجعها واحفظ.')}</li>
                  </ol>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" icon={Copy} onClick={async () => showToast((await copyText(gradingPrompt({ question: item.prompt, modelAnswer: item.modelAnswer, answer: item.text, max: item.max }))) ? t('تم نسخ الطلب') : t('تعذر النسخ'), 'success')}>{t('نسخ الطلب')}</Button>
                    {AI_SITES.map((s) => (
                      <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1 font-bold hover:bg-white dark:hover:bg-slate-800">{s.name}<ExternalLink className="w-3 h-3" /></a>
                    ))}
                  </div>
                  <textarea aria-label={t('رد الذكاء الاصطناعي')} value={aiReply} rows={3} placeholder={t('الصق رد الذكاء الاصطناعي هنا')}
                    onChange={(e) => {
                      setAiReply(e.target.value);
                      const r = parseGradingReply(e.target.value, item.max);
                      if (r.marks !== undefined) setMarks(String(r.marks));
                      if (r.feedback) setFeedback(r.feedback);
                    }}
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                  <p className="text-[11px] text-slate-500">{t('الاقتراح للمساعدة فقط: القرار النهائي للمعلم.')}</p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="grade-feedback" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('ملاحظة للطالب (اختياري، يراها الطالب وولي الأمر)')}</label>
              <textarea id="grade-feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} maxLength={1000}
                placeholder={t('مثال: أحسنت في الفكرة الرئيسية، وينقصك مثال توضيحي.')}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <form className="flex flex-wrap items-end gap-3 pt-1" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <div>
                <label htmlFor="grade-marks" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('الدرجة (من {max})', { max: item.max })}</label>
                <input id="grade-marks" ref={inputRef} inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)}
                  className="w-28 h-11 px-3 text-lg font-black text-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-1.5" aria-label={t('درجات سريعة')}>
                {quickMarks.map((m) => (
                  <button key={m} type="button" disabled={busy} onClick={() => { setMarks(String(m)); void save(m); }}
                    className="h-11 min-w-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">{m}</button>
                ))}
              </div>
              <Button type="submit" disabled={busy || marks.trim() === '' || Number(marks) > item.max || Number(marks) < 0}>{item.graded ? t('تعديل الدرجة') : t('حفظ والتالي')}</Button>
              {marks.trim() !== '' && (Number(marks) > item.max || Number(marks) < 0 || !Number.isFinite(Number(marks))) && (
                <p role="alert" className="w-full text-xs font-bold text-rose-600">{t('الدرجة بين 0 و{max}', { max: item.max })}</p>
              )}
            </form>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40">
                <ChevronRight className="w-4 h-4 dir-icon" />{t('السابق')}
              </button>
              {item.graded && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{t('مصحّحة: {a} من {b}', { a: item.awarded, b: item.max })}</span>}
              <button type="button" disabled={index >= queue.length - 1} onClick={() => setIndex(index + 1)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40">
                {t('التالي')}<ChevronLeft className="w-4 h-4 dir-icon" />
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
