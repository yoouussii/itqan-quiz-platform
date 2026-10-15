import React, { useEffect, useMemo, useState } from 'react';
import { Radio, ChevronDown, ChevronUp, PenLine } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LiveNow, fetchLiveNow } from '../../services/presenceService';
import { Card } from './ui';
import { Avatar } from './Avatar';
import { StudentLink } from './StudentLink';
import { t } from '../../i18n';

const ROLE: Record<string, string> = { admin: 'إدارة', supervisor: 'مشرف', teacher: 'معلم', student: 'طالب', parent: 'ولي أمر' };
const minsSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/**
 * «الآن على المنصة»: المتصلون ومن يحلّ اختباراً الآن.
 * طلب واحد خفيف كل دقيقة فقط والبطاقة ظاهرة والتبويب مفتوح (لا شيء في الخلفية).
 * quizId: يعرض من يحلّ هذا الاختبار فقط (صفحة نتائج الاختبار).
 */
export const LiveNowCard: React.FC<{ quizId?: string }> = ({ quizId }) => {
  const { users, quizzes, classes } = useApp();
  const [data, setData] = useState<LiveNow | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(!!quizId);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      const d = await fetchLiveNow();
      if (!alive) return;
      if (d) { setData(d); setMissing(false); } else setMissing(true);
    };
    void load();
    const id = window.setInterval(load, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const online = (data?.online || []).map((o) => ({ ...o, u: userMap.get(o.id) })).filter((o) => o.u);
  const inQuiz = (data?.in_quiz || []).filter((a) => !quizId || a.quiz_id === quizId);
  const byQuiz = useMemo(() => {
    const m = new Map<string, typeof inQuiz>();
    inQuiz.forEach((a) => m.set(a.quiz_id, [...(m.get(a.quiz_id) || []), a]));
    return [...m.entries()];
  }, [inQuiz]);
  const students = online.filter((o) => o.u!.role === 'student').length;

  if (missing && !data) return null; // 076 لم يُشغَّل بعد
  if (quizId && !inQuiz.length) return null;

  return (
    <Card className="p-4" data-testid="live-now">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 text-start">
        <span className="inline-flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <span className="relative flex w-2.5 h-2.5"><span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" /><span className="relative w-2.5 h-2.5 rounded-full bg-emerald-500" /></span>
          {quizId ? t('يحلّون هذا الاختبار الآن') : t('الآن على المنصة')}
        </span>
        {!quizId && (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <Radio className="w-4 h-4 text-emerald-600" />{t('متصل: {n}', { n: online.length })}
            <span className="text-xs text-slate-400">({t('{s} طالب · {o} غيرهم', { s: students, o: online.length - students })})</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <PenLine className="w-4 h-4 text-indigo-600" />{t('يحلّ اختباراً: {n}', { n: inQuiz.length })}
        </span>
        <span className="ms-auto text-slate-400">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>

      {open && (
        <div className={`mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid gap-4 ${quizId ? '' : 'md:grid-cols-2'}`}>
          <section>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">{t('يحلّون الآن')}</h3>
            {!byQuiz.length && <p className="text-sm text-slate-400">{t('لا أحد يحلّ اختباراً الآن')}</p>}
            <div className="space-y-3">
              {byQuiz.map(([qid, list]) => (
                <div key={qid}>
                  {!quizId && <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">{quizzes.find((q) => q.id === qid)?.title || '—'} ({list.length})</div>}
                  <ul className="space-y-1">
                    {list.map((a) => {
                      const st = userMap.get(a.student_id);
                      const cls = classes.find((c) => c.id === st?.class_id)?.name;
                      return (
                        <li key={a.student_id + a.quiz_id} className="flex items-center gap-2 text-sm">
                          <Avatar name={st?.name || '?'} role="student" userId={a.student_id} size="xs" />
                          {st ? <StudentLink id={st.id} name={st.name} className="font-semibold text-slate-800 dark:text-slate-100" /> : <span>{a.student_id}</span>}
                          {cls && <span className="text-[11px] text-slate-400">{cls}</span>}
                          <span className="ms-auto text-[11px] text-slate-500">{t('بدأ منذ {m} د', { m: minsSince(a.started_at) })}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
          {!quizId && (
            <section>
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">{t('المتصلون (آخر 5 دقائق)')}</h3>
              {!online.length && <p className="text-sm text-slate-400">{t('لا أحد متصل الآن')}</p>}
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {online.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 text-sm">
                    <Avatar name={o.u!.name} role={o.u!.role} userId={o.id} size="xs" />
                    {o.u!.role === 'student' ? <StudentLink id={o.id} name={o.u!.name} className="font-semibold text-slate-800 dark:text-slate-100" /> : <span className="font-semibold text-slate-800 dark:text-slate-100">{o.u!.name}</span>}
                    <span className="text-[11px] text-slate-400">{t(ROLE[o.u!.role] || '')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
};
