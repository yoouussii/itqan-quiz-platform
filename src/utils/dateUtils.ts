/**
 * Arabic date utilities — التقويم الميلادي دائماً (بأرقام لاتينية وأسماء الأشهر بالعربية)
 */
import { parseWindowStart } from './quizWindow';
import { isEn, t } from '../i18n';

const greg = () => (isEn() ? 'en-GB' : 'ar-EG-u-ca-gregory-nu-latn');

export function formatArabicQuizDate(dateStr?: string): string {
  if (!dateStr) return t('بتاريخ حديث');
  try {
    const d = parseWindowStart(dateStr);
    if (!d) return t('بتاريخ حديث');
    return t('بتاريخ: {date}', { date: new Intl.DateTimeFormat(greg(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d) });
  } catch {
    return t('بتاريخ حديث');
  }
}

export function formatFullArabicDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(greg(), {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return dateStr;
  }
}
