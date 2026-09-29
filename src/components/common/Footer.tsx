import React from 'react';
import { Phone, MessageCircle } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-5 px-4 text-center transition-colors duration-200 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium" dir="rtl">
        <div>
          جميع الحقوق محفوظة © تصميم وتطوير: <strong className="text-slate-800 dark:text-slate-200 font-bold">يوسف العزب</strong>
        </div>
        
        <div className="flex items-center gap-2">
          <span>للتواصل واتساب:</span>
          <a
            href="https://wa.me/966543119854"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors font-mono font-bold"
            dir="ltr"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>+966543119854</span>
          </a>
        </div>
      </div>
    </footer>
  );
};
