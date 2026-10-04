import type { SchoolClass } from '../types';

// ---------------------------------------------------------------------
// اقتراح فصل السنة التالية من اسم الفصل (الثالث / أ ← الرابع / أ)
// ---------------------------------------------------------------------
const ORD: [RegExp, number][] = [
  [/(ال)?حادي(ة)? ?عشر/, 11], [/(ال)?ثاني(ة)? ?عشر/, 12],
  [/(ال)?[أاإ]ول(ى)?/, 1], [/(ال)?ثاني(ة)?/, 2], [/(ال)?ثالث(ة)?/, 3], [/(ال)?رابع(ة)?/, 4], [/(ال)?خامس(ة)?/, 5],
  [/(ال)?سادس(ة)?/, 6], [/(ال)?سابع(ة)?/, 7], [/(ال)?ثامن(ة)?/, 8], [/(ال)?تاسع(ة)?/, 9], [/(ال)?عاشر(ة)?/, 10],
];
const norm = (s: string) => s.replace(/[\s/\-_.،,()]+/g, ' ').replace(/(^|\s)(ال)?صف(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

/** رقم الصف وبقية الاسم (الشعبة والمرحلة) */
export function parseGrade(name: string): { grade: number | null; rest: string } {
  const n = norm(name || '');
  for (const [re, g] of ORD) {
    const m = n.match(re);
    if (m) return { grade: g, rest: norm(n.replace(m[0], ' ')) };
  }
  const d = n.match(/(^|\s)(\d{1,2})(\s|$)/);
  if (d) return { grade: Number(d[2]), rest: norm(n.replace(d[0], ' ')) };
  return { grade: null, rest: n };
}

export const STAY = '__stay__';

/** الاقتراح لكل فصل: فصل الصف التالي بنفس الشعبة والفرع، أو التخرّج لأعلى صف، أو البقاء */
export function suggestRollover(classes: SchoolClass[]): Record<string, string> {
  const parsed = classes.map((c) => ({ c, ...parseGrade(c.name) }));
  const maxGrade = Math.max(0, ...parsed.map((p) => p.grade || 0));
  const out: Record<string, string> = {};
  for (const p of parsed) {
    if (p.grade == null) { out[p.c.id] = STAY; continue; }
    const next = parsed.find((x) => x.grade === p.grade! + 1 && x.rest === p.rest && (x.c.branch_id || '') === (p.c.branch_id || ''));
    out[p.c.id] = next ? next.c.id : p.grade === maxGrade ? '' : STAY;
  }
  return out;
}

