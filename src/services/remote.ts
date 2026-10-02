import { isSupabaseConfigured } from './supabase';

/** تنفيذ طلب Supabase بأمان: لا يرمي أخطاء، ويُرجع ok/error (الجداول الجديدة قد لا تكون أُنشئت بعد) */
export async function safe<T = any>(
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<{ ok: boolean; data: T | null; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, data: null, error: 'لم يتم ضبط الاتصال بالخادم' };
  try {
    const { data, error } = await fn();
    if (error) return { ok: false, data: null, error: error.message };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, data: null, error: e?.message || 'تعذر الاتصال بالخادم' };
  }
}

export const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
export const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
};
export const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
