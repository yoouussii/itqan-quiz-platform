import type { SchoolClass } from '../types';
import { parseGrade } from './schoolYear';

/**
 * ترتيب الفصول ترتيباً مدرسياً: المرحلة (روضة ← ابتدائي ← متوسط ← ثانوي)، ثم رقم الصف
 * (الأول ← الثاني …)، ثم المسار (عام ← تحفيظ ← غيره)، ثم الشعبة. بدل الترتيب الأبجدي أو ترتيب الإضافة.
 */
export type Stage = 0 | 1 | 2 | 3 | 9;
export const STAGE_LABELS: Record<Stage, string> = {
  0: 'رياض الأطفال', 1: 'المرحلة الابتدائية', 2: 'المرحلة المتوسطة', 3: 'المرحلة الثانوية', 9: 'فصول أخرى',
};

const text = (c: Pick<SchoolClass, 'name'> & { grade_level?: string | null }) => `${c.name || ''} ${c.grade_level || ''}`;

export function stageOf(c: Pick<SchoolClass, 'name'> & { grade_level?: string | null }): Stage {
  const s = text(c);
  if (/روض|تمهيد|حضان/.test(s)) return 0;
  if (/ابتدا/.test(s)) return 1;
  if (/متوسط/.test(s)) return 2;
  if (/ثانو/.test(s)) return 3;
  return 9;
}

const trackOf = (s: string) => (/عام/.test(s) ? 0 : /تحفيظ|قرآن|قران/.test(s) ? 1 : 2);

export function classSortKey(c: Pick<SchoolClass, 'name'> & { grade_level?: string | null }): [number, number, number, string] {
  // «ثانوي» تُشبه «ثاني»: تُحذف كلمات المرحلة قبل استخراج رقم الصف
  const bare = (c.name || '').replace(/(ال)?(ثانوي(ة)?|متوسط(ة)?|ابتدائي(ة)?|المرحلة)/g, ' ');
  return [stageOf(c), parseGrade(bare).grade ?? 99, trackOf(text(c)), c.name || ''];
}

export function compareClasses(a: Pick<SchoolClass, 'name'> & { grade_level?: string | null }, b: Pick<SchoolClass, 'name'> & { grade_level?: string | null }): number {
  const ka = classSortKey(a), kb = classSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || ka[3].localeCompare(kb[3], 'ar', { numeric: true });
}

export const sortClasses = <T extends Pick<SchoolClass, 'name'> & { grade_level?: string | null }>(list: T[]): T[] => [...list].sort(compareClasses);

/** تجميع الفصول (المرتبة) حسب المرحلة، بترتيب المراحل */
export function groupByStage<T extends Pick<SchoolClass, 'name'> & { grade_level?: string | null }>(list: T[]): Array<{ stage: Stage; items: T[] }> {
  const m = new Map<Stage, T[]>();
  sortClasses(list).forEach((c) => { const st = stageOf(c); m.set(st, [...(m.get(st) || []), c]); });
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([stage, items]) => ({ stage, items }));
}
