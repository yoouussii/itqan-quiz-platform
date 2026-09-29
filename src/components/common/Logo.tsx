import React from 'react';
import { useApp } from '../../context/AppContext';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
}) => {
  const { theme } = useApp();
  const isDark = theme === 'dark';

  const sizeClasses = {
    sm: { img: 'h-8 w-auto', text: 'text-base', sub: 'text-[10px]' },
    md: { img: 'h-10 w-auto', text: 'text-lg', sub: 'text-[11px]' },
    lg: { img: 'h-14 w-auto', text: 'text-2xl', sub: 'text-xs' },
    xl: { img: 'h-20 w-auto', text: 'text-3xl', sub: 'text-sm' },
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Official Itqan Logo with Cap and Checkmark */}
      <div className="relative flex items-center justify-center shrink-0">
        <img
          src={isDark ? '/itqan-logo-dark.png' : '/itqan-logo-light.png'}
          alt="شعار منصة إتقان التعليمية"
          className={`${sizeClasses.img} object-contain transition-transform duration-200 hover:scale-105 filter drop-shadow-xs`}
          onError={(e) => {
            // Fallback to light logo if dark fails or vice versa
            (e.target as HTMLImageElement).src = '/itqan-logo-light.png';
          }}
        />
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-tight font-cairo text-slate-900 dark:text-white ${sizeClasses.text}`}
            >
              منصة إتقان
            </span>
            <span className="text-[10px] px-1.5 py-0.5 font-bold rounded-md bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-300/80 dark:border-amber-700 hidden sm:inline-block">
              التقييم الذكي
            </span>
          </div>
          <p
            className={`text-slate-500 dark:text-slate-400 leading-tight hidden sm:block ${sizeClasses.sub}`}
          >
            نظام الاختبارات والتحصيل الأكاديمي الموحد
          </p>
        </div>
      )}
    </div>
  );
};
