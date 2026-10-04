/** حساب كشف الدرجات: كل عمود (اختبار أو يدوي) له نسبة لكل طالب ووزن. */
export interface GbCol { key: string; weight: number; max: number }
/** درجة الطالب في عمود: {score, max} أو undefined إن لم يؤدِّ */
export type GbCell = { score: number; max: number } | undefined;

export interface GbRow { pct: number | null; final: number | null; counted: number }

/** المعدل الموزون: Σ(وزن × نسبة) ÷ Σ الأوزان. غير المؤدّى يُتجاهل أو يُحتسب صفراً */
export function computeRow(cols: GbCol[], cell: (key: string) => GbCell, outOf: number, missingAsZero: boolean): GbRow {
  let sw = 0, sp = 0, counted = 0;
  for (const c of cols) {
    if (!(c.weight > 0)) continue;
    const v = cell(c.key);
    if (!v) { if (missingAsZero) sw += c.weight; continue; }
    const p = v.max > 0 ? Math.min(1, Math.max(0, v.score / v.max)) : 0;
    sw += c.weight; sp += c.weight * p; counted++;
  }
  if (sw === 0 || (counted === 0 && !missingAsZero)) return { pct: null, final: null, counted };
  const pct = (sp / sw) * 100;
  return { pct: Math.round(pct * 10) / 10, final: Math.round((pct / 100) * outOf * 100) / 100, counted };
}

/** التقدير (سلم وزارة التعليم) */
export function gradeLabel(pct: number | null): string {
  if (pct == null) return '—';
  if (pct >= 90) return 'ممتاز';
  if (pct >= 80) return 'جيد جداً';
  if (pct >= 65) return 'جيد';
  if (pct >= 50) return 'مقبول';
  return 'غير مجتاز';
}

/** أفضل محاولة للطالب في الاختبار (عند إعادة المحاولة) */
export function bestAttempt<T extends { percentage: number; score: number; total_possible_score: number }>(list: T[]): T | undefined {
  return list.reduce<T | undefined>((b, s) => (!b || Number(s.percentage) > Number(b.percentage) ? s : b), undefined);
}
