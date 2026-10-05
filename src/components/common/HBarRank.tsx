import React from 'react';
import { t } from '../../i18n';

export interface RankItem { key: string; label: string; sub?: string; value: number }

const BANDS: Array<[number, string, () => string]> = [
  [75, 'bg-emerald-500', () => t('75% فأكثر')],
  [40, 'bg-indigo-500', () => t('40–74%')],
  [15, 'bg-amber-500', () => t('15–39%')],
  [0, 'bg-rose-500', () => t('أقل من 15%')],
];
const band = (v: number) => BANDS.find(([min]) => v >= min) || BANDS[BANDS.length - 1];

/**
 * ترتيب أفقي للمقارنة بين فئات بأسماء (معلمين، فصول، سجلات): كل اسم في سطره كاملاً،
 * مع لون حسب المستوى وخط المتوسط. للنِّسب المئوية (0–100).
 */
export const HBarRank: React.FC<{
  items: RankItem[]; label: string; avg?: number; onSelect?: (key: string) => void; selected?: string;
  fmt?: (v: number) => string; maxRows?: number; testid?: string; sort?: boolean;
}> = ({ items, label, avg, onSelect, selected, fmt = (v) => `${v}%`, maxRows = 12, testid, sort = true }) => {
  const rows = sort ? [...items].sort((a, b) => b.value - a.value) : items;
  const above = avg === undefined ? 0 : rows.filter((r) => r.value > avg).length;
  const used = new Set(rows.map((r) => band(r.value)[0]));
  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 dark:text-slate-400" aria-hidden="true">
        {BANDS.filter(([min]) => used.has(min)).map(([min, cls, text]) => <span key={min} className="inline-flex items-center gap-1"><i className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{text()}</span>)}
      </div>
      <ul className="space-y-0.5 overflow-y-auto pe-1" style={{ maxHeight: `${maxRows * 2.6}rem` }} aria-label={label}>
        {rows.map((r, i) => {
          const [, cls] = band(r.value);
          const on = selected === r.key;
          const inner = (
            <>
              <span className="w-6 shrink-0 text-[12px] text-slate-400 tabular-nums">{i + 1}</span>
              <span className="w-32 sm:w-40 shrink-0 min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={r.label}>{r.label}</span>
                {r.sub && <span className="block text-[11px] text-slate-500 truncate">{r.sub}</span>}
              </span>
              <span className="relative flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800">
                <span className={`absolute inset-y-0 start-0 rounded-full ${cls}`} style={{ width: `${Math.max(1, Math.min(100, r.value))}%` }} />
                {avg !== undefined && <span className="absolute -top-1 -bottom-1 border-s-2 border-dashed border-slate-500 dark:border-slate-400" style={{ insetInlineStart: `${Math.min(100, avg)}%` }} />}
              </span>
              <b className="w-12 shrink-0 text-end text-sm tabular-nums text-slate-900 dark:text-white">{fmt(r.value)}</b>
            </>
          );
          return (
            <li key={r.key}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(r.key)} aria-pressed={on} className={`w-full flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-start ${on ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>{inner}</button>
              ) : <div className="flex items-center gap-2 px-1.5 py-1.5">{inner}</div>}
            </li>
          );
        })}
      </ul>
      {avg !== undefined && (
        <p className="flex items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
          <span className="w-5 border-t-2 border-dashed border-slate-500 dark:border-slate-400" />{t('المتوسط')} <b className="tabular-nums" dir="ltr">{Math.round(avg)}%</b>
          <span className="text-slate-500">· {t('{a} فوق المتوسط و{b} تحته', { a: above, b: rows.length - above })}</span>
        </p>
      )}
    </div>
  );
};
