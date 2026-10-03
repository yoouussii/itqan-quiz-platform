import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { QuizIntegrity } from '../../types';
import { t } from '../../i18n';

const awayText = (secs: number) => (secs < 60 ? t('{n} ث', { n: secs }) : t('{n} د', { n: Math.round(secs / 60) }));

/** سجل خروج الطالب من صفحة الاختبار (لا يظهر شيء للتسليمات القديمة قبل تسجيله) */
export const IntegrityBadge: React.FC<{ integrity?: QuizIntegrity | null }> = ({ integrity }) => {
  if (!integrity) return null;
  const leaves = integrity.leaves || 0;
  const fs = integrity.fullscreen_exits || 0;
  if (!leaves && !fs) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400" title={t('لم يغادر صفحة الاختبار')}>
        <Eye className="w-3.5 h-3.5" />{t('لم يغادر الصفحة')}
      </span>
    );
  }
  const severe = leaves >= 3 || fs >= 3;
  const parts = [
    leaves ? t('خرج {n} مرة · {d}', { n: leaves, d: awayText(integrity.away_seconds || 0) }) : '',
    fs ? t('ترك ملء الشاشة {n} مرة', { n: fs }) : '',
  ].filter(Boolean);
  const tone = severe ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  return (
    <span className="inline-flex flex-wrap gap-1" title={t('عدد مرات خروج الطالب من صفحة الاختبار أثناء الحل ومدة غيابه')}>
      {parts.map((p) => (
        <span key={p} className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap ${tone}`}>
          <EyeOff className="w-3.5 h-3.5 shrink-0" />{p}
        </span>
      ))}
    </span>
  );
};
