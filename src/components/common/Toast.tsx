import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Mascot, propFor } from './Mascot';
import { uiDir, t } from '../../i18n';

export const Toast: React.FC = () => {
  const { toastMessage, hideToast, currentView } = useApp();

  if (!toastMessage) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-500 shrink-0" />,
  };

  const borderColors = {
    success: 'border-emerald-200 bg-emerald-50/95 text-emerald-900',
    error: 'border-rose-200 bg-rose-50/95 text-rose-900',
    info: 'border-indigo-200 bg-indigo-50/95 text-indigo-900',
  };

  // «إتقان الصغير» يحتفل بالإجراءات الناجحة ويقدّم المعلومات (لا يظهر مع الأخطاء)
  const withMascot = toastMessage.type !== 'error';
  return (
    <div className="fixed bottom-6 end-6 z-[80] max-w-md animate-bounce-in flex items-end gap-1" role="status" aria-live="polite" data-testid="toast">
      {withMascot && <Mascot size={36} prop={toastMessage.type === 'success' ? 'trophy' : propFor(currentView)} className="shrink-0 -mb-1" />}
      <div
        className={`flex items-center gap-3 ps-4 pe-2 py-3 rounded-xl border backdrop-blur-md shadow-2xl ${borderColors[toastMessage.type]}`}
        dir={uiDir()}
      >
        {icons[toastMessage.type]}
        <p className="text-sm font-semibold">{toastMessage.text}</p>
        <button type="button" onClick={hideToast} aria-label={t('إغلاق')} className="w-7 h-7 shrink-0 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
};
