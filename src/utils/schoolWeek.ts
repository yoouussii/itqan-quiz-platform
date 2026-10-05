import { supabase } from '../services/supabase';
import { t, dateLocale } from '../i18n';

/** بداية الفصل الدراسي (من إعداد الحضور) — تُقرأ مرة واحدة */
let startCache: Promise<string | null> | null = null;
export function schoolStart(): Promise<string | null> {
  startCache ||= Promise.resolve(supabase.rpc('itqan_school_calendar') as any)
    .then((r: any) => (r?.data?.start_date as string) || null)
    .catch(() => null);
  return startCache;
}

/** رقم الأسبوع الدراسي ليوم (الأسبوع يبدأ الأحد)؛ null قبل بداية الفصل أو بلا إعداد */
export function schoolWeek(day: string, start: string | null): number | null {
  if (!start) return null;
  const d = new Date(`${day}T12:00:00`), s = new Date(`${start}T12:00:00`);
  s.setDate(s.getDate() - s.getDay()); // أحد أسبوع البداية
  const w = Math.floor((d.getTime() - s.getTime()) / (7 * 864e5)) + 1;
  return w >= 1 ? w : null;
}

/** «الأسبوع 3 · الأحد 5 أكتوبر» (أو اليوم والتاريخ فقط بلا إعداد) */
export function weekLabel(day: string, start: string | null): string {
  const d = new Date(`${day}T12:00:00`);
  const txt = d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
  const w = schoolWeek(day, start);
  return w ? `${t('الأسبوع {n}', { n: w })} · ${txt}` : txt;
}
