import React, { useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { ACTION_LABELS, ActivityEntry, fetchActivity } from '../../services/activityService';
import { formatFullArabicDate } from '../../utils/dateUtils';

const ROLE_TEXT: Record<string, string> = { admin: 'مدير', teacher: 'معلم', supervisor: 'مشرف', student: 'طالب', parent: 'ولي أمر' };

/** سجل النشاط: من فعل ماذا ومتى */
export const ActivityLogPage: React.FC = () => {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [remoteOk, setRemoteOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('all');
  const [days, setDays] = useState(30);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetchActivity(500);
    setRows(res.rows);
    setRemoteOk(res.ok);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const since = days ? Date.now() - days * 864e5 : 0;
    return rows.filter((r) =>
      (action === 'all' || r.action === action) &&
      new Date(r.created_at).getTime() >= since &&
      (!q.trim() || `${r.actor_name} ${r.target_name} ${r.details}`.includes(q.trim()))
    );
  }, [rows, action, days, q]);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo flex items-center gap-2"><ScrollText className="w-6 h-6 text-indigo-600" /> سجل النشاط</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">من أضاف أو عدّل أو حذف أو اعتمد، ومتى.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="نوع الحدث" value={action} onChange={(e) => setAction(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
            <option value="all">كل الأحداث</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="المدة" value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
            <option value={1}>آخر 24 ساعة</option><option value={7}>آخر 7 أيام</option><option value={30}>آخر 30 يوماً</option><option value={0}>الكل</option>
          </select>
          <input aria-label="بحث" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"><RefreshCw className="w-4 h-4" /> تحديث</button>
        </div>
      </div>
      {!remoteOk && (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          تعذّر جلب السجل من الخادم (لم يُنفَّذ ملف SQL الخاص بالجدول بعد)، وما يظهر هو أحداث هذا الجهاز فقط.
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-right text-xs">
          <thead><tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold"><th className="py-3 px-3">الوقت</th><th className="py-3 px-3">المنفّذ</th><th className="py-3 px-3">الإجراء</th><th className="py-3 px-3">الهدف</th><th className="py-3 px-3">تفاصيل</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && <tr><td colSpan={5} className="py-10 text-center text-slate-400">جاري التحميل...</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400">لا توجد أحداث مطابقة</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} data-action={r.action}>
                <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">{formatFullArabicDate(r.created_at)}</td>
                <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{r.actor_name || '—'} <span className="text-[10px] text-slate-400 font-normal">{ROLE_TEXT[r.actor_role || ''] || ''}</span></td>
                <td className="py-2.5 px-3">{ACTION_LABELS[r.action] || r.action}</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200">{r.target_name || '—'}</td>
                <td className="py-2.5 px-3 text-slate-500">{r.details || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
