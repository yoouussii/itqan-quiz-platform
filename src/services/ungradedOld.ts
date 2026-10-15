/**
 * عدد المقالات غير المصححة في التسليمات القديمة (الأقدم من 30 يوماً) التي لا تُحمَّل إجاباتها تلقائياً.
 * يحسبه الخادم (081) فيبقى عدّاد «التصحيح» دقيقاً دون تنزيل تلك الإجابات.
 */
const KEY = 'itqan_ungraded_old_v1';
let map: Record<string, number> = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
})();

export const getOldUngraded = (submissionId: string): number => map[submissionId] || 0;

export const setOldUngraded = (m: Record<string, number>) => {
  map = m || {};
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
};
