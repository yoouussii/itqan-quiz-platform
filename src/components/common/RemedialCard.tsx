import React, { useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RemedialPlan, currentMastery, fetchPlans } from '../../services/remedialService';
import { StorageService } from '../../services/storage';
import { t, dateLocale } from '../../i18n';

/** شريط التقدم: البداية ← الحالي، مع علامة الهدف */
export const PlanProgress: React.FC<{ start: number; now: number | null; target: number }> = ({ start, now, target }) => {
  const v = now ?? start;
  const color = v >= target ? '#10b981' : v > start ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" aria-label={t('التقدم من {a}% إلى {b}% والهدف {c}%', { a: start, b: v, c: target })}>
      <div className="absolute inset-y-0 rounded-full" style={{ insetInlineStart: 0, width: `${Math.max(2, v)}%`, background: color }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-500" style={{ insetInlineStart: `${target}%` }} title={t('الهدف')} />
    </div>
  );
};

/** الخطط العلاجية الجارية للطالب (لولي الأمر وللطالب) */
export const RemedialCard: React.FC<{ studentId: string; className?: string }> = ({ studentId, className = '' }) => {
  const { submissions, subjects } = useApp();
  // اختبارات الطالب بأسئلتها (ولي الأمر لا يملك قائمة اختبارات الطاقم)
  const quizzes = React.useMemo(() => StorageService.getQuizzesForStudent(studentId), [studentId]);
  const [plans, setPlans] = useState<RemedialPlan[]>([]);
  useEffect(() => { void fetchPlans([studentId]).then((r) => setPlans(r.rows.filter((p) => p.status === 'active'))); }, [studentId]);
  if (!plans.length) return null;
  return (
    <section className={`rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 ${className}`} data-testid="remedial-card">
      <h2 className="font-cairo font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><LifeBuoy className="w-5 h-5 text-indigo-600" />{t('الخطط العلاجية')}</h2>
      <ul className="space-y-4">
        {plans.map((p) => {
          const now = currentMastery(p, quizzes as any, submissions as any);
          return (
            <li key={p.id} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <b className="text-slate-900 dark:text-white">{p.outcome}</b>
                <span className="text-xs text-slate-500">{subjects.find((s) => s.id === p.subject_id)?.name} · {p.teacher_name}{p.due_date ? ` · ${t('المتابعة {d}', { d: new Date(`${p.due_date}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) })}` : ''}</span>
                <span className="ms-auto text-sm tabular-nums text-slate-700 dark:text-slate-200">{p.start_pct}% ← <b>{now == null ? t('لم يُقس بعد') : `${now}%`}</b> · {t('الهدف {n}%', { n: p.target_pct })}</span>
              </div>
              <PlanProgress start={p.start_pct} now={now} target={p.target_pct} />
              {p.actions && <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{p.actions}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
