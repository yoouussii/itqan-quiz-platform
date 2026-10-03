import React from 'react';
import { FileDown } from 'lucide-react';
import { t } from '../../i18n';

export const PdfExportButton: React.FC<{ onClick: () => void; label?: string }> = ({
  onClick,
  label = t('تصدير الرسوم البيانية PDF'),
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
  >
    <FileDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
    <span>{label}</span>
  </button>
);
