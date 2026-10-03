import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { uiDir } from '../../i18n';

export const Toast: React.FC = () => {
  const { toastMessage } = useApp();

  if (!toastMessage) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-500 shrink-0" />,
  };

  const borderColors = {
    success: 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
    error: 'border-rose-200 bg-rose-50/90 text-rose-900',
    info: 'border-indigo-200 bg-indigo-50/90 text-indigo-900',
  };

  return (
    <div className="fixed bottom-6 end-6 z-50 max-w-md animate-bounce-in shadow-2xl">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md ${borderColors[toastMessage.type]}`}
        dir={uiDir()}
      >
        {icons[toastMessage.type]}
        <p className="text-sm font-semibold">{toastMessage.text}</p>
      </div>
    </div>
  );
};
