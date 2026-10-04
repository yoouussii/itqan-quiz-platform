import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { BehaviorConfig, BehaviorRecord, DEGREE_LABEL, conductScore, fetchBehavior, fetchBehaviorConfig } from '../../services/behaviorService';
import { AttRecord, fetchAttendance } from '../../services/attendanceService';
import { t, dateLocale } from '../../i18n';

const num = (n: number) => String(Math.round(n * 100) / 100);

/** درجتا السلوك والمواظبة وآخر الملاحظات (للطالب وولي أمره). لا تظهر إن لم يُشغَّل 031 */
export const ConductSummary: React.FC<{ studentId: string; className?: string }> = ({ studentId, className = '' }) => {
  const [data, setData] = useState<{ cfg: BehaviorConfig; beh: BehaviorRecord[]; att: AttRecord[] } | null>(null);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setData(null);
    void Promise.all([fetchBehaviorConfig(), fetchBehavior([studentId]), fetchAttendance('2000-01-01', '2100-01-01', [studentId])]).then(([cfg, beh, att]) => {
      // بدون إعداد من الخادم (031 غير مُشغَّل) لا نعرض البطاقة
      setEnabled(cfg.catalog && Object.keys(cfg.catalog).length > 0);
      setData({ cfg, beh, att: att || [] });
    });
  }, [studentId]);
  if (!data || !enabled) return null;
  const sc = conductScore(data.beh, data.att, data.cfg);
  const box = (label: string, v: number, max: number, hint: string) => {
    const color = v >= max * 0.95 ? '#10b981' : v >= max * 0.8 ? '#f59e0b' : '#ef4444';
    return (
      <div className="rounded-xl p-3" style={{ background: `${color}14` }}>
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</div>
        <div className="text-2xl font-extrabold tabular-nums" style={{ color }}><span dir="ltr">{num(v)}<span className="text-sm opacity-60"> / {num(max)}</span></span></div>
        <div className="text-[11px] text-slate-500">{hint}</div>
      </div>
    );
  };
  return (
    <section className={`rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 ${className}`} aria-labelledby={`cond-${studentId}`} data-testid="conduct-summary">
      <h2 id={`cond-${studentId}`} className="font-cairo font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><ShieldCheck className="w-5 h-5 text-indigo-600" />{t('السلوك والمواظبة')}</h2>
      <div className="grid grid-cols-2 gap-2">
        {box(t('السلوك'), sc.behavior, data.cfg.behavior_max, t('{v} مخالفة · {p} إيجابي', { v: sc.violations, p: sc.positives }))}
        {box(t('المواظبة'), sc.attendance, data.cfg.attendance_max, t('غياب {a} · تأخر {l}', { a: sc.absent, l: sc.late }))}
      </div>
      {data.beh.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {data.beh.slice(0, 3).map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: r.kind === 'positive' ? '#10b981' : '#ef4444' }} />
              <span><b>{r.title}</b> <span className="text-slate-500">· {r.kind === 'positive' ? t('سلوك إيجابي') : t(DEGREE_LABEL[r.degree || 1])} · {new Date(`${r.day}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
