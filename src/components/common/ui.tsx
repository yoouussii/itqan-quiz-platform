import React from 'react';
import { LucideIcon } from 'lucide-react';
import { t, isEn, dateLocale } from '../../i18n';

/** عناصر الواجهة الموحدة (إتقان 2.0): بطاقة، عنوان صفحة، مؤشر رقمي، شارة حالة */

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div
    className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl ${className}`}
    {...rest}
  />
);

export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, eyebrow, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
    <div>
      {eyebrow && <div className="text-sm text-slate-500 dark:text-slate-400">{eyebrow}</div>}
      <h1 className="text-2xl sm:text-[28px] font-extrabold text-slate-900 dark:text-white leading-snug">{title}</h1>
      {subtitle && <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
  </div>
);

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  secondary:
    'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
  ghost: 'text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: LucideIcon; size?: 'md' | 'sm' }
> = ({ variant = 'primary', icon: Icon, size = 'md', className = '', children, type = 'button', ...rest }) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      size === 'sm' ? 'h-9 px-3.5 text-sm' : 'h-11 px-5 text-[15px]'
    } ${BTN[variant]} ${className}`}
    {...rest}
  >
    {Icon && <Icon className={size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]'} />}
    {children}
  </button>
);

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
export const TONE: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  bad: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  info: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  muted: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export const Chip: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode }> = ({
  tone = 'muted',
  className = '',
  children,
}) => (
  <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-xs font-semibold whitespace-nowrap ${TONE[tone]} ${className}`}>
    {children}
  </span>
);

/** درجة الطالب كشارة: أخضر ناجح، برتقالي قريب، أحمر راسب */
export const scoreTone = (pct: number, pass = 50): Tone => (pct >= Math.max(pass, 75) ? 'ok' : pct >= pass ? 'warn' : 'bad');

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: 'ok' | 'bad' | 'muted';
  progress?: number;
  onClick?: () => void;
  valueClass?: string;
}> = ({ label, value, hint, hintTone = 'muted', progress, onClick, valueClass = '' }) => {
  const body = (
    <>
      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-3xl font-bold mt-1.5 tabular-nums text-slate-900 dark:text-white ${valueClass}`}>{value}</div>
      {progress !== undefined && (
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-3">
          <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {hint && (
        <div
          className={`text-[13px] mt-1.5 ${
            hintTone === 'ok' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : hintTone === 'bad' ? 'text-rose-700 dark:text-rose-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {hint}
        </div>
      )}
    </>
  );
  const cls = 'text-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between gap-3 mb-1">
    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{children}</h2>
    {action}
  </div>
);

/** تحية حسب الوقت + تاريخ اليوم بالأرقام اللاتينية */
export const greeting = () => (new Date().getHours() < 12 ? t('صباح الخير') : t('مساء الخير'));
export const todayLabel = () =>
  new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

/** «منذ 5 دقائق» بالعربية */
export const timeAgo = (iso?: string): string => {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (isEn()) {
    if (m < 1) return 'just now';
    if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'yesterday';
    if (d < 7) return `${d} days ago`;
    return new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' });
  }
  if (m < 1) return 'الآن';
  if (m < 60) return m <= 2 ? 'منذ دقيقة' : m <= 10 ? `منذ ${m} دقائق` : `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : h <= 10 ? `منذ ${h} ساعات` : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'أمس';
  if (d === 2) return 'منذ يومين';
  if (d < 7) return `منذ ${d} أيام`;
  return new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' });
};
