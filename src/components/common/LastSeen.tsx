import React, { useEffect, useState } from 'react';
import { Presence, fetchPresence } from '../../services/presenceService';
import { formatFullArabicDate } from '../../utils/dateUtils';
import { timeAgo } from './ui';
import { t } from '../../i18n';

/** خريطة آخر دخول/ظهور للمستخدمين (طلب واحد عند فتح الصفحة) */
export function usePresence(): Record<string, Presence> {
  const [map, setMap] = useState<Record<string, Presence>>({});
  useEffect(() => {
    let alive = true;
    void fetchPresence().then((m) => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, []);
  return map;
}

/** «آخر ظهور منذ …» مع التفاصيل عند المرور (آخر تسجيل دخول وعدد مرات الدخول) */
export const LastSeen: React.FC<{ p?: Presence; className?: string }> = ({ p, className = '' }) => {
  const seen = p?.s || p?.l;
  if (!seen) return <span className={`text-[11px] text-slate-400 ${className}`} data-testid="last-seen">{t('لا يوجد دخول مسجّل')}</span>;
  const recent = Date.now() - new Date(seen).getTime() < 6 * 60_000;
  const title = [
    p?.l ? t('آخر تسجيل دخول: {d}', { d: formatFullArabicDate(p.l) }) : '',
    p?.s ? t('آخر ظهور: {d}', { d: formatFullArabicDate(p.s) }) : '',
    p?.n ? t('مرات تسجيل الدخول: {n}', { n: p.n }) : '',
  ].filter(Boolean).join('\n');
  return (
    <span title={title} data-testid="last-seen" className={`inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${recent ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden />
      {recent ? t('متصل الآن') : t('آخر ظهور {ago}', { ago: timeAgo(seen) })}
    </span>
  );
};
