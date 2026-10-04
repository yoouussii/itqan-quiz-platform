import React, { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { AttRecord, fetchAttendance } from '../../services/attendanceService';
import { t, dateLocale } from '../../i18n';

const KINDS = [
  { k: 'absent', label: 'غياب', color: '#e5484d' },
  { k: 'late', label: 'تأخر', color: '#f59e0b' },
  { k: 'excused', label: 'استئذان', color: '#2a78d6' },
] as const;

/** ملخص حضور طالب (للطالب نفسه ولولي أمره). لا يظهر إن لم تُفعَّل ميزة الحضور على الخادم */
export const AttendanceSummary: React.FC<{ studentId: string; className?: string }> = ({ studentId, className = '' }) => {
  const [list, setList] = useState<AttRecord[] | null | undefined>(undefined);
  useEffect(() => {
    setList(undefined);
    void fetchAttendance('2000-01-01', '2100-01-01', [studentId]).then(setList);
  }, [studentId]);
  if (!list) return null; // جارٍ التحميل أو الميزة غير مفعّلة
  const counts: Record<string, number> = { absent: 0, late: 0, excused: 0 };
  list.forEach((r) => { counts[r.kind]++; });
  return (
    <section className={`rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 ${className}`} aria-labelledby={`att-${studentId}`} data-testid="attendance-summary">
      <h2 id={`att-${studentId}`} className="font-cairo font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><CalendarCheck className="w-5 h-5 text-indigo-600" />{t('الحضور')}</h2>
      <div className="grid grid-cols-3 gap-2">
        {KINDS.map((k) => (
          <div key={k.k} className="rounded-xl p-2.5 text-center" style={{ background: `${k.color}14` }}>
            <div className="text-xl font-extrabold tabular-nums" style={{ color: k.color }}>{counts[k.k]}</div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t(k.label)}</div>
          </div>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('لا يوجد غياب أو تأخر مسجل. أحسنت! ✨')}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {list.slice(0, 4).map((r) => {
            const k = KINDS.find((x) => x.k === r.kind)!;
            return (
              <li key={r.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full" style={{ background: k.color }} />
                <span className="font-semibold">{t(k.label)}</span>
                <span className="text-slate-500">{new Date(`${r.day}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short' })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
