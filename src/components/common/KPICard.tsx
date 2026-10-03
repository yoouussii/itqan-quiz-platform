import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  colorScheme: 'indigo' | 'emerald' | 'amber' | 'cyan' | 'purple' | 'rose';
  trend?: {
    value: string;
    isPositive: boolean;
  };
  /** عند تمريرها تصبح البطاقة قابلة للضغط لعرض التفاصيل */
  onClick?: () => void;
}

const colorMap = {
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-100 dark:border-indigo-800/80',
    iconBg: 'bg-indigo-600 text-white',
    gradient: 'from-indigo-500/10 to-transparent',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-100 dark:border-emerald-800/80',
    iconBg: 'bg-emerald-600 text-white',
    gradient: 'from-emerald-500/10 to-transparent',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-100 dark:border-amber-800/80',
    iconBg: 'bg-amber-600 text-white',
    gradient: 'from-amber-500/10 to-transparent',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-100 dark:border-cyan-800/80',
    iconBg: 'bg-cyan-600 text-white',
    gradient: 'from-cyan-500/10 to-transparent',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-100 dark:border-purple-800/80',
    iconBg: 'bg-purple-600 text-white',
    gradient: 'from-purple-500/10 to-transparent',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-100 dark:border-rose-800/80',
    iconBg: 'bg-rose-600 text-white',
    gradient: 'from-rose-500/10 to-transparent',
  },
};

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  colorScheme,
  trend,
  onClick,
}) => {
  const scheme = colorMap[colorScheme];

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${title}: عرض التفاصيل` : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`relative overflow-hidden bg-white dark:bg-slate-900 p-5 rounded-2xl border ${scheme.border} shadow-sm hover:shadow-md transition-all duration-300 group ${onClick ? 'cursor-pointer hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400' : ''}`}
    >
      <div
        className={`absolute top-0 start-0 w-32 h-32 bg-gradient-to-br ${scheme.gradient} rounded-full blur-2xl -ms-10 -mt-10 pointer-events-none`}
      />

      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase block mb-1">
            {title}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight font-cairo">
              {value}
            </span>
            {trend && (
              <span
                className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                  trend.isPositive
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {trend.isPositive ? '↑' : '↓'} {trend.value}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
          {onClick && <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 mt-1.5">اضغط لعرض التفاصيل ←</p>}
        </div>

        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md transition-transform duration-300 group-hover:scale-110 ${scheme.iconBg}`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
