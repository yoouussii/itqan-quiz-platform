import React, { useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { ACTION_LABELS, ActivityEntry, QuizActivityRow, fetchActivity, fetchQuizActivity } from '../../services/activityService';
import { useApp } from '../../context/AppContext';
import { isEn } from '../../i18n';
import { formatFullArabicDate } from '../../utils/dateUtils';
import { uiDir, t } from '../../i18n';
import { EmptyMascot } from '../common/Mascot';

const QUIZ_ACTIVITY = 'quiz_activity';
const clock = (iso: string) => new Date(iso).toLocaleTimeString(isEn() ? 'en-GB' : 'ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

const ROLE_TEXT: Record<string, string> = { admin: 'مدير', teacher: 'معلم', supervisor: 'مشرف', student: 'طالب', parent: 'ولي أمر' };

/** سجل النشاط: من فعل ماذا ومتى */
export const ActivityLogPage: React.FC = () => {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [remoteOk, setRemoteOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('all');
  const [days, setDays] = useState(30);
  const [q, setQ] = useState('');
  const { users, quizzes, classes } = useApp();
  const [quizRows, setQuizRows] = useState<QuizActivityRow[] | null>(null);
  const [quizErr, setQuizErr] = useState<'' | 'missing' | 'error'>('');

  const load = async () => {
    setLoading(true);
    const res = await fetchActivity(500);
    setRows(res.rows);
    setRemoteOk(res.ok);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  // دخول الطلاب للاختبارات وتسليمها: من الخادم عند اختيار هذا النوع
  const loadQuiz = async () => {
    setLoading(true);
    const res = await fetchQuizActivity(days);
    setQuizRows(res.rows);
    setQuizErr(res.ok ? '' : res.missing ? 'missing' : 'error');
    setLoading(false);
  };
  useEffect(() => { if (action === QUIZ_ACTIVITY) void loadQuiz(); }, [action, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const quizShown = useMemo(() => (quizRows || []).map((r) => {
    const st = users.find((u) => u.id === r.student_id);
    return { ...r, name: st?.name || r.student_id, cls: classes.find((c) => c.id === st?.class_id)?.name || '', title: quizzes.find((z) => z.id === r.quiz_id)?.title || '—' };
  }).filter((r) => !q.trim() || `${r.name} ${r.cls} ${r.title}`.includes(q.trim())), [quizRows, users, quizzes, classes, q]);

  const shown = useMemo(() => {
    const since = days ? Date.now() - days * 864e5 : 0;
    return rows.filter((r) =>
      (action === 'all' || r.action === action) &&
      new Date(r.created_at).getTime() >= since &&
      (!q.trim() || `${r.actor_name} ${r.target_name} ${r.details}`.includes(q.trim()))
    );
  }, [rows, action, days, q]);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir={uiDir()}>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo flex items-center gap-2"><ScrollText className="w-6 h-6 text-indigo-600" />{' '}{t('سجل النشاط')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('من أضاف أو عدّل أو حذف أو اعتمد، ومتى.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('نوع الحدث')} value={action} onChange={(e) => setAction(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
            <option value="all">{t('كل الأحداث')}</option>
            <option value={QUIZ_ACTIVITY}>{t('دخول الطلاب للاختبارات وتسليمها')}</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <select aria-label={t('المدة')} value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
            <option value={1}>{t('آخر 24 ساعة')}</option><option value={7}>{t('آخر 7 أيام')}</option><option value={30}>{t('آخر 30 يوماً')}</option><option value={0}>{t('الكل')}</option>
          </select>
          <input aria-label={t('بحث')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث...')} className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
          <button onClick={() => (action === QUIZ_ACTIVITY ? loadQuiz() : load())} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"><RefreshCw className="w-4 h-4" />{' '}{t('تحديث')}</button>
        </div>
      </div>
      {action === QUIZ_ACTIVITY && quizErr && (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          {quizErr === 'missing' ? t('حدّث قاعدة البيانات (071) لعرض أوقات دخول الاختبارات وتسليمها.') : t('تعذّر جلب أوقات الاختبارات من الخادم.')}
        </p>
      )}
      {action === QUIZ_ACTIVITY ? (
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" data-testid="quiz-activity">
        <table className="w-full text-start text-xs">
          <thead><tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold"><th className="py-3 px-3">{t('الطالب')}</th><th className="py-3 px-3">{t('الاختبار')}</th><th className="py-3 px-3">{t('دخل')}</th><th className="py-3 px-3">{t('سلّم')}</th><th className="py-3 px-3">{t('المدة')}</th><th className="py-3 px-3">{t('النسبة')}</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && <tr><td colSpan={6} className="py-10 text-center text-slate-400">{t('جاري التحميل...')}</td></tr>}
            {!loading && quizShown.length === 0 && <tr><td colSpan={6}><EmptyMascot text={t('لا توجد أحداث مطابقة')} /></td></tr>}
            {!loading && quizShown.map((r) => (
              <tr key={`${r.student_id}|${r.quiz_id}|${r.started_at}`}>
                <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{r.name}{r.cls && <span className="block text-[10px] text-slate-400 font-normal">{r.cls}</span>}</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200">{r.title}</td>
                <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatFullArabicDate(r.started_at)}</td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  {r.completed_at
                    ? <span className="font-bold text-emerald-700 dark:text-emerald-300">{sameDay(r.started_at, r.completed_at) ? clock(r.completed_at) : formatFullArabicDate(r.completed_at)}</span>
                    : <span className="font-bold text-amber-700 dark:text-amber-300">{t('لم يسلّم بعد')}</span>}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{r.completed_at && r.time_spent != null ? t('{m} د {s} ث', { m: Math.floor(r.time_spent / 60), s: r.time_spent % 60 }) : '—'}</td>
                <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">{r.completed_at && r.percentage != null ? `${r.percentage}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (<>
      {!remoteOk && (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          {t('تعذّر جلب السجل من الخادم (لم يُنفَّذ ملف SQL الخاص بالجدول بعد)، وما يظهر هو أحداث هذا الجهاز فقط.')}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-start text-xs">
          <thead><tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold"><th className="py-3 px-3">{t('الوقت')}</th><th className="py-3 px-3">{t('المنفّذ')}</th><th className="py-3 px-3">{t('الإجراء')}</th><th className="py-3 px-3">{t('الهدف')}</th><th className="py-3 px-3">{t('تفاصيل')}</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && <tr><td colSpan={5} className="py-10 text-center text-slate-400">{t('جاري التحميل...')}</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={5}><EmptyMascot text={t('لا توجد أحداث مطابقة')} /></td></tr>}
            {shown.map((r) => (
              <tr key={r.id} data-action={r.action}>
                <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">{formatFullArabicDate(r.created_at)}</td>
                <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{r.actor_name || '—'} <span className="text-[10px] text-slate-400 font-normal">{ROLE_TEXT[r.actor_role || ''] ? t(ROLE_TEXT[r.actor_role || '']) : ''}</span></td>
                <td className="py-2.5 px-3">{ACTION_LABELS[r.action] ? t(ACTION_LABELS[r.action]) : r.action}</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200">{r.target_name || '—'}</td>
                <td className="py-2.5 px-3 text-slate-500">{r.details || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
};
