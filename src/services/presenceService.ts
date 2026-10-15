import { supabase, isSupabaseConfigured, getSessionToken } from './supabase';

/** آخر دخول وآخر ظهور لكل مستخدم (072) */
export interface Presence { l?: string | null; n?: number; s?: string | null }

const TOUCH_KEY = 'itqan_touch_at';
const TOUCH_EVERY = 15 * 60_000;

/** «أنا هنا»: طلب خفيف مرة كل 15 دقيقة على الأكثر من كل جهاز */
export async function touchPresence(userId: string): Promise<void> {
  if (!isSupabaseConfigured() || !getSessionToken()) return;
  try {
    const last = JSON.parse(localStorage.getItem(TOUCH_KEY) || '{}');
    if (last.u === userId && Date.now() - Number(last.t || 0) < TOUCH_EVERY) return;
    localStorage.setItem(TOUCH_KEY, JSON.stringify({ u: userId, t: Date.now() }));
  } catch { /* التخزين غير متاح: نرسل الطلب */ }
  await supabase.rpc('itqan_touch').then(() => undefined, () => undefined);
}

let cache: { at: number; data: Record<string, Presence> } | null = null;

/** للموظفين: خريطة user_id ← آخر دخول/ظهور (تُحفظ دقيقتين لتجنّب تكرار الطلب) */
export async function fetchPresence(force = false): Promise<Record<string, Presence>> {
  if (!isSupabaseConfigured()) return {};
  if (!force && cache && Date.now() - cache.at < 120_000) return cache.data;
  const { data, error } = await supabase.rpc('itqan_presence');
  if (error || !data || typeof data !== 'object') return cache?.data || {};
  cache = { at: Date.now(), data: data as Record<string, Presence> };
  return cache.data;
}
