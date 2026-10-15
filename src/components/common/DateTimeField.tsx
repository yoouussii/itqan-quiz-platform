import React from 'react';
import { t } from '../../i18n';

/**
 * التاريخ من التقويم والوقت من قوائم (ساعة / دقيقة / ص-م) بدل الكتابة بلوحة المفاتيح.
 * القيمة بنفس صيغة الحقول الأصلية: «YYYY-MM-DDTHH:mm» للتاريخ والوقت، و«HH:mm» للوقت وحده.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const sel = 'h-10 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50';

export const TimeField: React.FC<{ value: string; onChange: (v: string) => void; disabled?: boolean; label?: string; className?: string; defaultTime?: string; optional?: boolean }> = ({ value, onChange, disabled, label, className = '', defaultTime = '08:00', optional }) => {
  const empty = optional && !/^\d{1,2}:\d{2}/.test(value);
  const [hh, mm] = (/^\d{1,2}:\d{2}/.test(value) ? value : defaultTime).split(':').map(Number);
  const pm = hh >= 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const set = (h: number, m: number, isPm: boolean) => onChange(`${pad((h % 12) + (isPm ? 12 : 0))}:${pad(m)}`);
  const mins = MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort((a, b) => a - b);
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} dir="ltr" role="group" aria-label={label || t('الوقت')}>
      <select aria-label={t('الساعة')} disabled={disabled} value={empty ? '' : h12} onChange={(e) => (e.target.value === '' ? onChange('') : set(Number(e.target.value), mm, pm))} className={sel}>
        {optional && <option value="">{t('بدون')}</option>}
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-slate-400 font-bold">:</span>
      <select aria-label={t('الدقيقة')} disabled={disabled || empty} value={mm} onChange={(e) => set(h12, Number(e.target.value), pm)} className={sel}>
        {mins.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
      </select>
      <select aria-label={t('صباحاً أو مساءً')} disabled={disabled || empty} value={pm ? 'pm' : 'am'} onChange={(e) => set(h12, mm, e.target.value === 'pm')} className={sel}>
        <option value="am">{t('ص')}</option>
        <option value="pm">{t('م')}</option>
      </select>
    </div>
  );
};

export const DateTimeField: React.FC<{ value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean; label?: string; className?: string; defaultTime?: string }> = ({ value, onChange, required, disabled, label, className = '', defaultTime = '08:00' }) => {
  const [d, tm] = (value || '').split('T');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '';
  const time = /^\d{2}:\d{2}/.test(tm || '') ? tm.slice(0, 5) : defaultTime;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="group" aria-label={label}>
      <input type="date" required={required} disabled={disabled} aria-label={label ? `${label} — ${t('التاريخ')}` : t('التاريخ')} value={date}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}T${time}` : '')} className={`${sel} px-3 min-w-[9.5rem]`} />
      <TimeField value={time} disabled={disabled || !date} label={label} onChange={(v) => date && onChange(`${date}T${v}`)} />
    </div>
  );
};
