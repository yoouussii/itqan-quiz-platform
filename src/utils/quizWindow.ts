/**
 * فترة إتاحة الاختبار (تاريخ + وقت).
 * - القيم الجديدة تُحفظ كوقت كامل (ISO).
 * - القيم القديمة (تاريخ فقط، أو منتصف الليل UTC القادم من Supabase) تُعامل كيوم كامل:
 *   البداية 00:00 والنهاية 23:59 بتوقيت الجهاز.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_UTC = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?(?:Z|\+00:00|\+00)$/;

const legacyDay = (v: string): string | null => {
  if (DATE_ONLY.test(v)) return v;
  const m = v.match(MIDNIGHT_UTC);
  return m ? m[1] : null;
};

/** قيمة مناسبة لحقل datetime-local (بتوقيت الجهاز) */
export const toLocalInputValue = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** نهاية افتراضية: بعد 30 يوماً الساعة 11:59 مساءً */
export const defaultEndInput = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setHours(23, 59, 0, 0);
  return toLocalInputValue(d);
};

export function parseWindowStart(v?: string | null): Date | null {
  if (!v) return null;
  const day = legacyDay(v);
  const d = day ? new Date(`${day}T00:00:00`) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function parseWindowEnd(v?: string | null): Date | null {
  if (!v) return null;
  const day = legacyDay(v);
  const d = day ? new Date(`${day}T23:59:59.999`) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function toInputValue(v: string | null | undefined, kind: 'start' | 'end'): string {
  const d = kind === 'start' ? parseWindowStart(v) : parseWindowEnd(v);
  return d ? toLocalInputValue(d) : '';
}

export function inputToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export type WindowState = 'upcoming' | 'open' | 'ended';

export function getWindowState(start?: string | null, end?: string | null, now = new Date()): WindowState {
  const s = parseWindowStart(start);
  const e = parseWindowEnd(end);
  if (s && now < s) return 'upcoming';
  if (e && now > e) return 'ended';
  return 'open';
}

/** تاريخ ووقت ميلادي بأرقام لاتينية: 2 أكتوبر 2026، 10:30 ص */
export function formatQuizDateTime(v?: string | null, kind: 'start' | 'end' = 'start'): string {
  const d = kind === 'start' ? parseWindowStart(v) : parseWindowEnd(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('ar-EG-u-ca-gregory-nu-latn', {
    day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}
