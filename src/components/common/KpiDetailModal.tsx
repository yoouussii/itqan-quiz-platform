import React, { useEffect, useState } from 'react';
import { X, Search } from 'lucide-react';
import { KpiSection } from '../../utils/kpiSections';
import { uiDir, t } from '../../i18n';
import { EmptyMascot } from './Mascot';

const MAX_ROWS = 300;

const SectionTable: React.FC<{ section: KpiSection }> = ({ section }) => {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const rows = term ? section.rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(term))) : section.rows;
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
          {section.title} <span className="text-xs font-semibold text-slate-400">({section.rows.length})</span>
        </h4>
        {section.rows.length > 8 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('بحث في الجدول...')}
              aria-label={t('بحث في {title}', { title: section.title })}
              className="ps-8 pe-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyMascot compact text={term ? t('لا نتائج مطابقة للبحث') : section.emptyText || t('لا توجد بيانات')} className="border border-dashed border-slate-200 dark:border-slate-700 rounded-xl" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold">
                {section.headers.map((h) => (
                  <th key={h} className="py-2 px-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  {r.map((c, j) => (
                    <td key={j} className={`py-2 px-3 ${j === 0 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > MAX_ROWS && (
        <p className="text-[11px] text-slate-400">{t('يُعرض أول')}{' '}{MAX_ROWS}{' '}{t('صف من')}{' '}{rows.length}{' '}{t('— استخدم البحث لتضييق النتائج.')}</p>
      )}
    </div>
  );
};

export const KpiDetailModal: React.FC<{
  title: string;
  subtitle?: string;
  sections: KpiSection[];
  onClose: () => void;
}> = ({ title, subtitle, sections, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      dir={uiDir()}
    >
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[88vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-5"
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-black text-lg text-slate-900 dark:text-white font-cairo">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={t('إغلاق')}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {sections.map((s) => (
          <SectionTable key={s.title} section={s} />
        ))}
      </div>
    </div>
  );
};
