import React, { useState } from 'react';
import { CheckCircle2, XCircle, Eye, ClipboardCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { describeQuizTarget } from '../../utils/quizTarget';
import { formatQuizDateTime } from '../../utils/quizWindow';
import { timeAgo } from '../common/NotificationBell';

/** اعتماد الاختبارات: قائمة الاختبارات التي أرسلها المعلمون وتنتظر الموافقة قبل أن تظهر للطلاب */
export const ApprovalsPage: React.FC = () => {
  const { quizzes, users, subjects, classes, approveQuiz, rejectQuiz, setActiveQuizId, setCurrentView, settings } = useApp();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const pending = (quizzes || []).filter((q) => q.status === 'pending_approval');
  const rejected = (quizzes || []).filter((q) => q.status === 'rejected');

  const preview = (id: string) => { setActiveQuizId(id); setCurrentView('quiz_preview'); };
  const approve = async (id: string) => { setBusy(id); await approveQuiz(id); setBusy(null); };
  const confirmReject = async () => {
    if (!rejecting) return;
    if (!reason.trim()) return alert('اكتب سبب الرفض ليراه المعلم');
    setBusy(rejecting);
    await rejectQuiz(rejecting, reason.trim());
    setBusy(null); setRejecting(null); setReason('');
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-indigo-600" /> اعتماد الاختبارات</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {settings.require_quiz_approval
            ? 'اعتماد الاختبارات مُفعّل: لا يظهر اختبار المعلم للطلاب إلا بعد موافقتك.'
            : 'اعتماد الاختبارات غير مُفعّل حالياً (يُفعّل من الإعدادات)، وما يلي اختبارات أُرسلت سابقاً للاعتماد.'}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-base text-slate-900 dark:text-white">بانتظار الاعتماد ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">لا توجد اختبارات بانتظار الاعتماد</p>
        ) : (
          pending.map((q) => (
            <div key={q.id} data-quiz={q.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{q.title}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {subjects.find((s) => s.id === q.subject_id)?.name || '—'} • المعلم: {users.find((u) => u.id === q.teacher_id)?.name || '—'} • أُرسل {timeAgo(q.created_at)}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">بانتظار الاعتماد</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div>الأسئلة: <b>{q.questions?.length ?? 0}</b></div>
                <div>المدة: <b>{q.duration_minutes} د</b></div>
                <div>الدرجة: <b>{q.total_marks}</b></div>
                <div>الفئة: <b>{describeQuizTarget(q.assignments, classes)}</b></div>
              </div>
              <p className="text-[11px] text-slate-500">الإتاحة: من {formatQuizDateTime(q.start_date, 'start')} إلى {formatQuizDateTime(q.end_date, 'end')}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => preview(q.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"><Eye className="w-4 h-4" /> معاينة الأسئلة</button>
                <button onClick={() => approve(q.id)} disabled={busy === q.id} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-60"><CheckCircle2 className="w-4 h-4" /> اعتماد ونشر</button>
                <button onClick={() => { setRejecting(q.id); setReason(''); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100"><XCircle className="w-4 h-4" /> رفض</button>
              </div>
            </div>
          ))
        )}
      </section>

      {rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">مرفوضة بانتظار تعديل المعلم ({rejected.length})</h2>
          {rejected.map((q) => (
            <div key={q.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900 p-4 text-xs">
              <b className="text-slate-900 dark:text-white">{q.title}</b> — {users.find((u) => u.id === q.teacher_id)?.name || '—'}
              {q.review_note && <p className="text-rose-600 mt-1">السبب: {q.review_note}</p>}
            </div>
          ))}
        </section>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div role="dialog" aria-label="سبب الرفض" onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="font-black text-base text-slate-900 dark:text-white">سبب رفض الاختبار</h3>
            <textarea aria-label="سبب الرفض" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب ما يجب على المعلم تعديله..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejecting(null)} className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-100">إلغاء</button>
              <button onClick={confirmReject} className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl">تأكيد الرفض</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
