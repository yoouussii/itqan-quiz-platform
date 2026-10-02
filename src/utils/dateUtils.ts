/**
 * Arabic date utilities — التقويم الميلادي دائماً (بأرقام لاتينية وأسماء الأشهر بالعربية)
 */
import { parseWindowStart } from './quizWindow';

const GREG = 'ar-EG-u-ca-gregory-nu-latn';

export function formatArabicQuizDate(dateStr?: string): string {
  if (!dateStr) return 'بتاريخ حديث';
  try {
    const d = parseWindowStart(dateStr);
    if (!d) return 'بتاريخ حديث';
    return `بتاريخ: ${new Intl.DateTimeFormat(GREG, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)}`;
  } catch {
    return 'بتاريخ حديث';
  }
}

export function formatFullArabicDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(GREG, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return dateStr;
  }
}
