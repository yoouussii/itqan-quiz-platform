import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, ArrowRight, ArrowLeft, CheckCircle2, Flag, Send, X, Eye, Maximize } from 'lucide-react';
import { StorageService } from '../../services/storage';
import { useApp, QuizAttemptAnswer } from '../../context/AppContext';
import { RichText } from '../common/RichText';
import { Question, QuizIntegrity } from '../../types';
import { seededShuffle } from '../../utils/shuffle';
import { loadAttempt, saveAttempt, clearAttempt, secondsLeft, markAttemptLeft } from '../../utils/activeAttempt';
import { NewTypeAnswer, NewTypeAnswerInput, hasNewAnswer, isNewType } from '../common/QuestionTypes';
import { startAttemptRemote, servedQuestionIds } from '../../services/quizSync';
import { uiDir, t, optionLetters, isEn } from '../../i18n';
import { questionsCount, marksCount, minutesCount } from '../../i18n/count';

const subKey = (questionId: string, subId: string) => `${questionId}::${subId}`;

interface QuizTakerProps {
  quizId: string;
  onFinish: (submissionId: string) => void;
  onCancel: () => void;
}

export const QuizTaker: React.FC<QuizTakerProps> = ({ quizId, onFinish, onCancel }) => {
  const { submitQuizAttempt, currentUser, showToast, isPreview } = useApp();
  const quiz = StorageService.getQuizWithDetails(quizId);
  const rawQuestions = StorageService.getQuestionsByQuizId(quizId);
  const studentId = currentUser?.id || '';
  // ترتيب ثابت لكل طالب عند تفعيل «ترتيب مختلف للأسئلة»
  const shuffleKey = `${studentId}:${quizId}`;
  // «أسئلة مختلفة لكل طالب»: الخادم يحدد أسئلة هذا الطالب (يُحفظ مع المحاولة للاستئناف)
  const [servedIds, setServedIds] = useState<string[] | null>(() => loadAttempt(studentId, quizId)?.served_ids || null);
  const pooled = !!quiz?.questions_per_student;
  const questions = useMemo(() => {
    const mine = pooled && servedIds ? rawQuestions.filter((q) => servedIds.includes(q.id)) : rawQuestions;
    const list = mine.length ? mine : rawQuestions;
    return quiz?.shuffle_questions ? seededShuffle(list, shuffleKey) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawQuestions.map((q) => q.id).join(','), quiz?.shuffle_questions, shuffleKey, pooled, servedIds?.join(',')]);
  useEffect(() => {
    if (!pooled || isPreview) return;
    void servedQuestionIds(quizId).then((ids) => ids && setServedIds(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pooled, quizId]);

  // محاولة جارية محفوظة (تحديث الصفحة أثناء الاختبار يكمل من نفس المكان ونفس المؤقت)
  const [saved] = useState(() => (studentId ? loadAttempt(studentId, quizId) : null));
  const [hasStarted, setHasStarted] = useState(!!saved);
  const [starting, setStarting] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(saved?.index || 0);
  // الاختيارات والإجابات النصية؛ مفتاح السؤال الفرعي: subKey(معرّف القطعة، معرّف السؤال الفرعي)
  const [userAnswers, setUserAnswers] = useState<Record<string, number | null>>(saved?.answers || {});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(saved?.texts || {});
  const [extraAnswers, setExtraAnswers] = useState<Record<string, NewTypeAnswer>>(saved?.extra || {});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>(saved?.flagged || {});
  const [timing, setTiming] = useState<{ endsAt: number; offset: number; startedAt: number } | null>(
    saved ? { endsAt: saved.ends_at, offset: saved.offset, startedAt: saved.started_at } : null
  );
  const [secondsRemaining, setSecondsRemaining] = useState(
    saved ? secondsLeft(saved) : (quiz?.duration_minutes || 20) * 60
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startTime = timing?.startedAt ? timing.startedAt - timing.offset : Date.now();
  const submittedRef = useRef(false);

  // سجل الخروج من صفحة الاختبار (يُحفظ مع المحاولة ويُرسل مع التسليم)
  const integrityRef = useRef<QuizIntegrity>({ leaves: 0, away_seconds: 0, fullscreen_exits: 0, ...(saved?.integrity || {}) });
  const [integrity, setIntegrity] = useState<QuizIntegrity>(integrityRef.current);
  const awaySinceRef = useRef<number | null>(null);
  // نافذة تأكيد من المنصة نفسها (مثل «الخروج من الاختبار») لا تُحسب خروجاً
  const ignoreAwayRef = useRef(false);
  const outRef = useRef(false);
  const wantsFullscreen = !!quiz?.require_fullscreen && !isPreview && typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const [outOfFullscreen, setOutOfFullscreen] = useState(false);
  const bumpIntegrity = (patch: Partial<QuizIntegrity>) => {
    integrityRef.current = { ...integrityRef.current, ...patch };
    setIntegrity(integrityRef.current);
  };
  /** إنهاء فترة غياب جارية (تُحتسب إذا زادت عن ثانية، حتى لا تُحسب النقرات العابرة) */
  const closeAway = (notify: boolean) => {
    const since = awaySinceRef.current;
    if (since == null) return;
    awaySinceRef.current = null;
    const secs = (Date.now() - since) / 1000;
    if (secs < 1) return;
    const leaves = integrityRef.current.leaves + 1;
    bumpIntegrity({ leaves, away_seconds: Math.round(integrityRef.current.away_seconds + secs) });
    if (notify) showToast(t('سُجّل خروجك من صفحة الاختبار ({n}). يظهر هذا لمعلمك.', { n: leaves }), 'info');
  };

  useEffect(() => {
    if (!hasStarted || isPreview) return;
    // العودة لمحاولة غادرها الطالب (أغلق التبويب أو خرج من الاختبار ثم رجع): الغياب يُحتسب
    if (saved?.left_at && !submittedRef.current) {
      const secs = (Date.now() - saved.left_at) / 1000;
      if (secs >= 5) bumpIntegrity({ leaves: integrityRef.current.leaves + 1, away_seconds: Math.round(integrityRef.current.away_seconds + secs) });
    }
    const away = () => {
      if (!submittedRef.current && !ignoreAwayRef.current && awaySinceRef.current == null) awaySinceRef.current = Date.now();
    };
    const back = () => closeAway(true);
    const onVisibility = () => (document.visibilityState === 'hidden' ? away() : back());
    const onLeave = () => {
      if (!submittedRef.current && studentId) markAttemptLeft(studentId, quizId);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', away);
    window.addEventListener('focus', back);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', away);
      window.removeEventListener('focus', back);
      window.removeEventListener('pagehide', onLeave);
      onLeave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, isPreview]);

  // ملء الشاشة: الخروج منه يُسجَّل ويغطي الأسئلة حتى يعود الطالب
  useEffect(() => {
    if (!hasStarted || !wantsFullscreen) return;
    const sync = () => {
      const out = !document.fullscreenElement && !submittedRef.current;
      if (out && !outRef.current) bumpIntegrity({ fullscreen_exits: (integrityRef.current.fullscreen_exits || 0) + 1 });
      outRef.current = out;
      setOutOfFullscreen(out);
    };
    document.addEventListener('fullscreenchange', sync);
    // بعد تحديث الصفحة لا تكون الشاشة ممتلئة: نطلب العودة بدون احتساب خروج جديد
    if (!document.fullscreenElement) {
      outRef.current = true;
      setOutOfFullscreen(true);
    }
    return () => document.removeEventListener('fullscreenchange', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, wantsFullscreen]);

  const enterFullscreen = () => {
    if (!wantsFullscreen || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const leaveFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  };

  // عند الاستئناف: مزامنة وقت النهاية مع الخادم (قد تكون ساعة الجهاز غير دقيقة)
  useEffect(() => {
    if (!saved || isPreview) return;
    void startAttemptRemote(quizId).then((r) => {
      if (r.kind === 'ok') setTiming({ endsAt: r.endsAt, offset: r.offset, startedAt: r.startedAt });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // المؤقت: يُحسب من وقت النهاية كل ثانية (لا يتأثر بتحديث الصفحة أو إيقاف الجهاز مؤقتاً)
  useEffect(() => {
    if (!hasStarted || !timing) return;
    const tick = () => setSecondsRemaining(secondsLeft({ ends_at: timing.endsAt, offset: timing.offset }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hasStarted, timing]);

  // حفظ الإجابات على الجهاز أولاً بأول
  useEffect(() => {
    if (!hasStarted || !timing || !studentId || submittedRef.current) return;
    saveAttempt({
      student_id: studentId,
      quiz_id: quizId,
      ends_at: timing.endsAt,
      offset: timing.offset,
      started_at: timing.startedAt,
      answers: userAnswers,
      texts: textAnswers,
      extra: extraAnswers,
      flagged: flaggedQuestions,
      index: currentQuestionIndex,
      integrity,
      ...(servedIds ? { served_ids: servedIds } : {}),
    });
  }, [hasStarted, timing, studentId, quizId, userAnswers, textAnswers, extraAnswers, flaggedQuestions, currentQuestionIndex, integrity, servedIds]);

  const startMessages: Record<string, string> = {
    ended: t('انتهى وقت إتاحة هذا الاختبار'),
    not_started: t('لم يبدأ وقت هذا الاختبار بعد'),
    quiz_not_available: t('هذا الاختبار غير متاح لك'),
    already_submitted: t('سبق أن سلّمت هذا الاختبار'),
    quiz_not_found: t('الاختبار غير موجود'),
    no_session: t('انتهت الجلسة، سجّل الدخول من جديد'),
  };

  const handleStart = async () => {
    if (!quiz) return;
    // يجب طلب ملء الشاشة مباشرة بعد ضغطة الزر (قبل انتظار الخادم)
    enterFullscreen();
    setStarting(true);
    // في المعاينة لا نسجّل محاولة على الخادم باسم الطالب (مؤقت محلي للتصفح فقط)
    // «أسئلة مختلفة لكل طالب»: لا نبدأ قبل وصول أسئلة هذا الطالب من الخادم
    if (pooled && !servedIds && !isPreview) {
      const ids = await servedQuestionIds(quizId);
      if (ids) setServedIds(ids);
    }
    const r = isPreview ? ({ kind: 'legacy' } as const) : await startAttemptRemote(quizId);
    setStarting(false);
    if (r.kind === 'rejected') {
      showToast(startMessages[r.error] || t('تعذر بدء الاختبار ({error})', { error: r.error }), 'error');
      leaveFullscreen();
      onCancel();
      return;
    }
    // بدون خادم (انقطاع الشبكة أو قبل تحديث قاعدة البيانات): وقت محلي
    const now = Date.now();
    const tm =
      r.kind === 'ok'
        ? { endsAt: r.endsAt, offset: r.offset, startedAt: r.startedAt }
        : { endsAt: now + (quiz.duration_minutes || 20) * 60_000, offset: 0, startedAt: now };
    setTiming(tm);
    setSecondsRemaining(secondsLeft({ ends_at: tm.endsAt, offset: tm.offset }));
    setHasStarted(true);
  };

  // التسليم التلقائي عند انتهاء الوقت (يستخدم أحدث الإجابات عبر المرجع)
  const finalSubmitRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (hasStarted && secondsRemaining === 0) finalSubmitRef.current();
  }, [hasStarted, secondsRemaining]);

  if (!quiz || questions.length === 0) {
    return (
      <div className="p-8 text-center" dir={uiDir()}>
        <p className="text-slate-500 dark:text-slate-400">{t('عذراً، لم يتم العثور على أسئلة لهذا الاختبار.')}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 h-11 px-5 bg-indigo-600 text-white rounded-xl font-semibold"
        >
          {t('العودة')}
        </button>
      </div>
    );
  }

  const currentQ = questions[currentQuestionIndex];

  const hasAnswer = (key: string, type?: string) =>
    type === 'essay'
      ? !!(textAnswers[key] || '').trim()
      : userAnswers[key] !== undefined && userAnswers[key] !== null;

  const isQuestionAnswered = (q: Question) =>
    isNewType(q.type) ? hasNewAnswer(q.type, extraAnswers[q.id], q as any)
    : q.type === 'passage'
      ? (q.sub_questions || []).length > 0 &&
        (q.sub_questions || []).every((sq) => hasAnswer(subKey(q.id, sq.id), sq.type))
      : hasAnswer(q.id, q.type);

  const answeredCount = questions.filter(isQuestionAnswered).length;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = secondsRemaining < 120;

  const handleSelectOption = (key: string, optIdx: number) => {
    setUserAnswers((prev) => ({ ...prev, [key]: optIdx }));
  };

  const handleTextChange = (key: string, text: string) => {
    setTextAnswers((prev) => ({ ...prev, [key]: text }));
  };

  const toggleFlag = (qId: string) => {
    setFlaggedQuestions({
      ...flaggedQuestions,
      [qId]: !flaggedQuestions[qId],
    });
  };

  const handleFinalSubmit = async () => {
    if (submittedRef.current) return; // منع التسليم المزدوج (زر + انتهاء الوقت)
    submittedRef.current = true;
    // غياب جارٍ لحظة التسليم (مثل انتهاء الوقت والطالب خارج الصفحة)
    closeAway(false);
    setSubmitting(true);
    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    const answersArray: QuizAttemptAnswer[] = questions.map((q) => isNewType(q.type) ? ({
      question_id: q.id, selected_option: null,
      ...(extraAnswers[q.id] || {}),
      text_answer: extraAnswers[q.id]?.text_answer?.trim() || undefined,
    }) : ({
      question_id: q.id,
      selected_option: userAnswers[q.id] ?? null,
      text_answer: textAnswers[q.id]?.trim() || undefined,
      sub_answers:
        q.type === 'passage'
          ? (q.sub_questions || []).map((sq) => ({
              sub_question_id: sq.id,
              selected_option: userAnswers[subKey(q.id, sq.id)] ?? null,
              text_answer: textAnswers[subKey(q.id, sq.id)]?.trim() || undefined,
            }))
          : undefined,
    }));

    try {
      const submission = await submitQuizAttempt(quiz.id, answersArray, timeSpent, isPreview ? undefined : integrityRef.current);
      leaveFullscreen();
      // سُلّم أو حُفظ للإرسال لاحقاً: لم يعد اختباراً جارياً
      if (studentId) clearAttempt(studentId, quiz.id);
      // null: حُفظت المحاولة للإرسال لاحقاً أو رفضها الخادم (رسالة السبب ظاهرة)
      if (submission) onFinish(submission.id);
      else onCancel();
    } catch (e) {
      submittedRef.current = false;
      setSubmitting(false);
      throw e;
    }
  };
  finalSubmitRef.current = () => void handleFinalSubmit();

  const letters = optionLetters();

  // «ترتيب مختلف للاختيارات»: يتغيّر مكان العرض فقط، والإجابة تُحفظ برقم الاختيار الأصلي
  const optionOrder = (key: string, count: number, type?: string) => {
    const idx = Array.from({ length: count }, (_, i) => i);
    return quiz?.shuffle_options && type !== 'true_false' ? seededShuffle(idx, `${shuffleKey}:${key}`) : idx;
  };

  const renderOptions = (key: string, options: string[], compact = false, type?: string) => (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'} role="radiogroup">
      {optionOrder(key, options.length, type).map((optIdx, pos) => {
        const optionText = options[optIdx];
        const isSelected = userAnswers[key] === optIdx;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={isSelected}
            key={optIdx}
            onClick={() => handleSelectOption(key, optIdx)}
            className={`w-full text-start flex items-center gap-3.5 ${compact ? 'min-h-[50px] px-3.5 py-2' : 'min-h-[58px] px-4 py-2.5'} rounded-2xl border-2 transition-colors ${
              isSelected
                ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-700'
            }`}
          >
            <span
              className={`w-8 h-8 rounded-full border-2 text-sm font-bold flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
              }`}
            >
              {letters[pos] || pos + 1}
            </span>
            <span className={`${compact ? 'text-[15px]' : 'text-[17px]'} font-semibold text-slate-900 dark:text-slate-100`}>
              <RichText html={optionText} inline />
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderEssay = (key: string, compact = false) => (
    <div>
      <textarea
        value={textAnswers[key] || ''}
        onChange={(e) => handleTextChange(key, e.target.value)}
        rows={compact ? 3 : 7}
        placeholder={t('اكتب إجابتك هنا...')}
        aria-label={t('إجابتك')}
        className="w-full p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base leading-relaxed text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none transition-colors"
      />
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5">{t('سؤال مقالي: يصحّحه المعلم بعد التسليم.')}</p>
    </div>
  );

  const qCountLabel = questionsCount;
  const marksLabel = marksCount;

  // شاشة ما قبل البدء
  if (!hasStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center py-10 px-4" dir={uiDir()}>
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{[quiz.subject?.name, quiz.teacher?.name].filter(Boolean).join(' · ')}</div>
          <h1 className="text-[26px] font-extrabold text-slate-900 dark:text-white leading-snug mt-1">{quiz.title}</h1>
          {quiz.description && <p className="text-[15px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{quiz.description}</p>}

          <div className="grid grid-cols-3 gap-2 mt-6 text-center">
            {[
              { v: qCountLabel(questions.length), l: t('الأسئلة') },
              { v: minutesCount(quiz.duration_minutes), l: t('الوقت') },
              { v: marksLabel(pooled ? questions.reduce((sum, q) => sum + (q.type === 'passage' ? (q.sub_questions || []).reduce((x, sq) => x + (Number(sq.marks) || 0), 0) : Number(q.marks) || 0), 0) : quiz.total_marks), l: t('الدرجة الكلية') },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 py-3 px-2">
                <div className="font-bold text-base text-slate-900 dark:text-white">{x.v}</div>
                <div className="text-[13px] text-slate-500 dark:text-slate-400">{x.l}</div>
              </div>
            ))}
          </div>

          <ul className="mt-6 space-y-2.5 text-[15px] text-slate-700 dark:text-slate-300">
            <li className="flex gap-2.5"><Clock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />{t('المؤقت يبدأ عند الضغط على «ابدأ»، ولا يتوقف إذا خرجت أو حدّثت الصفحة.')}</li>
            <li className="flex gap-2.5"><Flag className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />{t('تنقّل بين الأسئلة بحرية، وعلّم أي سؤال لتراجعه قبل التسليم.')}</li>
            <li className="flex gap-2.5"><CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />{t('إجاباتك تُحفظ تلقائياً، ونتيجتك تظهر فور التسليم.')}</li>
            <li className="flex gap-2.5"><Eye className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />{t('الخروج من صفحة الاختبار أو فتح تطبيق آخر يُسجَّل ويظهر لمعلمك.')}</li>
            {wantsFullscreen && <li className="flex gap-2.5"><Maximize className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />{t('الاختبار يعمل بملء الشاشة، والخروج منها يُسجَّل.')}</li>}
          </ul>

          {isPreview && (
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-xl p-3 mt-5">
              {t('وضع المعاينة: تصفّح الأسئلة فقط، ولا يُسجَّل تسليم باسم الطالب.')}
            </p>
          )}

          <div className="flex gap-2.5 mt-7">
            <button type="button" onClick={onCancel} className="h-[52px] px-5 rounded-2xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
              {t('رجوع')}
            </button>
            <button type="button" onClick={() => void handleStart()} disabled={starting}
              className="flex-1 h-[52px] rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[17px] disabled:opacity-60">
              {starting ? t('جارٍ التجهيز...') : t('ابدأ الاختبار')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isLast = currentQuestionIndex === questions.length - 1;
  const flagged = !!flaggedQuestions[currentQ.id];
  const exitQuiz = () => {
    ignoreAwayRef.current = true;
    const ok = window.confirm(t('الخروج لا يوقف المؤقت. يمكنك العودة وإكمال الاختبار قبل انتهاء الوقت. هل تريد الخروج؟'));
    ignoreAwayRef.current = false;
    awaySinceRef.current = null;
    if (ok) {
      outRef.current = true; // الخروج بالزر يُحسب غياباً عند العودة، لا خروجاً من ملء الشاشة
      leaveFullscreen();
      onCancel();
    }
  };

  return (
    <div className="min-h-screen flex flex-col" dir={uiDir()}>
      {/* الشريط العلوي: خروج، العنوان، المؤقت، والتقدم */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 pt-2.5 pb-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={exitQuiz} aria-label={t('الخروج من الاختبار')} className="w-11 h-11 -ms-2 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-6 h-6" />
            </button>
            <div className="text-center min-w-0">
              <div className="font-bold text-[15.5px] text-slate-900 dark:text-white truncate">{quiz.title}</div>
              <div className="text-[12.5px] text-slate-500 dark:text-slate-400">{t('إجاباتك تُحفظ تلقائياً')}</div>
            </div>
            <div
              role="timer"
              aria-label={t('الوقت المتبقي')}
              className={`h-9 px-3 rounded-xl flex items-center gap-1.5 font-bold text-base tabular-nums shrink-0 ${
                isLowTime ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
              dir="ltr"
            >
              <Clock className="w-4 h-4" />{formatTimer(secondsRemaining)}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-1.5 rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }} />
            </div>
            <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{t('{a} من {m}', { a: currentQuestionIndex + 1, m: questions.length })}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{t('السؤال {n}', { n: currentQuestionIndex + 1 })} · {marksLabel(Number(currentQ.marks) || 0)}</span>
          <button
            type="button"
            onClick={() => toggleFlag(currentQ.id)}
            aria-pressed={flagged}
            className={`h-9 px-3 rounded-xl border text-[13px] font-semibold inline-flex items-center gap-1.5 ${
              flagged ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Flag className={`w-4 h-4 ${flagged ? 'fill-amber-500 text-amber-600' : ''}`} />
            {flagged ? t('معلَّم للمراجعة') : t('راجعه لاحقاً')}
          </button>
        </div>

        <div className="text-[21px] sm:text-[23px] font-bold leading-[1.7] text-slate-900 dark:text-white font-cairo">
          <RichText html={currentQ.question_text} />
        </div>

        {currentQ.type === 'passage' ? (
          <div className="space-y-4">
            {(currentQ.sub_questions || []).map((sq, sqIdx) => {
              const key = subKey(currentQ.id, sq.id);
              return (
                <div key={sq.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                      <span className="text-indigo-700 dark:text-indigo-400">{sqIdx + 1}.</span>
                      <RichText html={sq.question_text} />
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-slate-500">{marksLabel(Number(sq.marks) || 0)}</span>
                  </div>
                  {sq.type === 'essay' ? renderEssay(key, true) : renderOptions(key, sq.options || [], true, sq.type)}
                </div>
              );
            })}
          </div>
        ) : isNewType(currentQ.type) ? (
          <NewTypeAnswerInput type={currentQ.type} q={currentQ as any} value={extraAnswers[currentQ.id]} studentView={currentUser?.role === 'student'}
            onChange={(v) => setExtraAnswers((prev) => ({ ...prev, [currentQ.id]: v }))} />
        ) : currentQ.type === 'essay' ? (
          renderEssay(currentQ.id)
        ) : (
          renderOptions(currentQ.id, currentQ.options || [], false, currentQ.type)
        )}

        {/* خريطة الأسئلة */}
        <nav aria-label={t('خريطة الأسئلة')} className="pt-3">
          <div className="flex flex-wrap justify-center gap-1.5">
            {questions.map((q, idx) => {
              const isCurrent = currentQuestionIndex === idx;
              const isFlagged = flaggedQuestions[q.id];
              const isAnswered = isQuestionAnswered(q);
              const cls = isCurrent
                ? 'bg-white dark:bg-slate-900 border-2 border-indigo-600 text-indigo-700 dark:text-indigo-300'
                : isFlagged
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300'
                : isAnswered
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
              return (
                <button key={q.id} type="button" onClick={() => setCurrentQuestionIndex(idx)} aria-current={isCurrent ? 'step' : undefined}
                  aria-label={[t('السؤال {n}', { n: idx + 1 }), isAnswered ? t('تمت الإجابة') : '', isFlagged ? t('معلَّم للمراجعة') : ''].filter(Boolean).join(isEn() ? ', ' : '، ')}
                  className={`w-9 h-9 rounded-lg text-[13px] font-bold tabular-nums ${cls}`}>
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-[12.5px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-600" />{t('أُجيب')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-900" />{t('للمراجعة')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-700" />{t('لم يُجب')}</span>
          </div>
        </nav>
      </main>

      {/* أزرار التنقل ثابتة أسفل الشاشة */}
      <footer className="sticky bottom-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-2.5">
          <button
            type="button"
            onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="h-[52px] px-5 rounded-2xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <ArrowRight className="w-5 h-5 dir-icon" />{t('السابق')}
          </button>
          {isLast ? (
            <button type="button" onClick={() => setShowConfirmModal(true)}
              className="flex-1 h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[17px] inline-flex items-center justify-center gap-2">
              <Send className="w-5 h-5 rotate-180" />{t('مراجعة وتسليم')}
            </button>
          ) : (
            <button type="button" onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              className="flex-1 h-[52px] rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[17px] inline-flex items-center justify-center gap-2">
              {t('التالي')}<ArrowLeft className="w-5 h-5 dir-icon" />
            </button>
          )}
          {!isLast && (
            <button type="button" onClick={() => setShowConfirmModal(true)} title={t('تسليم الاختبار')}
              className="hidden sm:inline-flex h-[52px] px-5 rounded-2xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-semibold items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
              {t('تسليم')}
            </button>
          )}
        </div>
      </footer>

      {outOfFullscreen && !submitting && (
        <div className="fixed inset-0 z-40 bg-slate-900 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="fs-title">
          <div className="max-w-sm text-center text-white space-y-4">
            <Maximize className="w-12 h-12 mx-auto text-amber-400" />
            <h3 id="fs-title" className="text-xl font-bold">{t('هذا الاختبار يعمل بملء الشاشة')}</h3>
            <p className="text-[15px] text-slate-300 leading-relaxed">{t('خرجت من ملء الشاشة، وسُجّل ذلك. المؤقت مستمر، فارجع لإكمال الاختبار.')}</p>
            <button type="button" onClick={enterFullscreen} className="h-12 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold inline-flex items-center gap-2">
              <Maximize className="w-5 h-5" />{t('العودة لملء الشاشة')}
            </button>
          </div>
        </div>
      )}

      {submitting && !showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl px-8 py-6 text-base font-bold text-slate-900 dark:text-white">{t('جارٍ تسليم الاختبار وتصحيحه...')}</div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
            <h3 id="submit-title" className="text-xl font-bold text-slate-900 dark:text-white">{t('تسليم الاختبار؟')}</h3>
            <p className="text-[15px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              {t('أجبت على {a} من {m}.', { a: answeredCount, m: questions.length })}
            </p>
            {answeredCount < questions.length && (
              <p className="text-[15px] font-semibold text-rose-700 dark:text-rose-400 mt-1">{t('بقي {n} بلا إجابة.', { n: questions.length - answeredCount })}</p>
            )}
            {Object.values(flaggedQuestions).some(Boolean) && (
              <p className="text-[15px] font-semibold text-amber-800 dark:text-amber-300 mt-1">{t('لديك أسئلة معلَّمة للمراجعة.')}</p>
            )}
            <div className="flex gap-2.5 mt-6">
              <button type="button" onClick={() => setShowConfirmModal(false)} className="flex-1 h-12 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">
                {t('العودة للأسئلة')}
              </button>
              <button type="button" onClick={() => void handleFinalSubmit()} disabled={submitting}
                className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-60">
                {submitting ? t('جارٍ التسليم...') : t('نعم، سلّم')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
