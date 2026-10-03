import React from 'react';
import { MessageCircle } from 'lucide-react';
import { navigateTo } from '../../utils/router';
import { uiDir, t } from '../../i18n';

const FooterLink: React.FC<{ path: string; children: React.ReactNode }> = ({ path, children }) => (
  <a href={path} onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); navigateTo(path); }}
    className="hover:text-indigo-700 dark:hover:text-indigo-400 hover:underline">{children}</a>
);

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-5 px-4 text-center transition-colors duration-200 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium" dir={uiDir()}>
        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
          <span>{t('جميع الحقوق محفوظة © تصميم وتطوير:')}{' '}<strong className="text-slate-800 dark:text-slate-200 font-bold">{t('يوسف العزب')}</strong></span>
          <span className="flex items-center gap-2">
            <FooterLink path="/privacy">{t('سياسة الخصوصية')}</FooterLink>
            <span aria-hidden="true">·</span>
            <FooterLink path="/terms">{t('شروط الاستخدام')}</FooterLink>
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span>{t('للتواصل واتساب:')}</span>
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
