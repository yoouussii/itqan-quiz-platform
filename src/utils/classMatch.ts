/**
 * مطابقة اسم الصف القادم من ملف Excel مع صفوف النظام.
 * - تُتجاهل الفروق في الهمزات (أ/ا)، والأقواس، والمسافات الزائدة، والتشكيل، والأرقام العربية/اللاتينية.
 * - المطابقة التامة أولاً، ثم الجزئية بشرط أن تكون صفاً واحداً فقط (غير ذلك = غير محسوم، ويختاره المستخدم).
 * - لا يوجد أبداً "صف احتياطي" صامت: ما لا يُطابق بوضوح يُترك لاختيار المستخدم.
 */
export type ClassMatchStatus = 'exact' | 'partial' | 'ambiguous' | 'none';

export interface ClassMatch {
  id: string | null;
  status: ClassMatchStatus;
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeClassName(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[()\[\]{}\-–—_،,.:/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveClass(classes: Array<{ id: string; name: string }>, text: string): ClassMatch {
  const q = normalizeClassName(text);
  if (!q) return { id: null, status: 'none' };

  const norm = classes.map((c) => ({ id: c.id, n: normalizeClassName(c.name) }));

  const exact = norm.filter((x) => x.n === q);
  if (exact.length === 1) return { id: exact[0].id, status: 'exact' };
  if (exact.length > 1) return { id: null, status: 'ambiguous' };

  const partial = norm.filter((x) => x.n && (x.n.includes(q) || q.includes(x.n)));
  if (partial.length === 1) return { id: partial[0].id, status: 'partial' };
  if (partial.length > 1) return { id: null, status: 'ambiguous' };

  return { id: null, status: 'none' };
}
