/**
 * الصور الرمزية: تُخزَّن في جدول منفصل user_avatars (لا تثقل جدول المستخدمين)،
 * وتُجلب فقط عند تغيّرها (نقارن updated_at أولاً) وتُحفظ في كاش محلي.
 * القيمة إما صورة مصغّرة (data:image/jpeg...) أو رمز جاهز بالشكل preset:rocket
 */
import { supabase, isSupabaseConfigured } from './supabase';

const CACHE_KEY = 'itqan_avatar_cache_v1';
const PENDING_KEY = 'itqan_avatar_pending_v1';
type Cache = Record<string, { data: string; updated_at: string }>;

export const loadAvatarCache = (): Cache => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
};
const saveCache = (c: Cache) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ } };
export const avatarMapFromCache = (c: Cache): Record<string, string> =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.data]));

const getPending = (): string[] => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; } };
const setPending = (ids: string[]) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(new Set(ids)))); } catch { /* ignore */ } };

async function pushOne(userId: string, entry: { data: string; updated_at: string } | null): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'لم يتم ضبط الاتصال بالخادم' };
  try {
    if (entry) {
      const { error } = await supabase.from('user_avatars').upsert({ user_id: userId, data: entry.data, updated_at: entry.updated_at }, { onConflict: 'user_id' });
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from('user_avatars').delete().eq('user_id', userId);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'تعذر الاتصال بالخادم' };
  }
}

/** حفظ صورة المستخدم (أو إزالتها عند data = null): محلياً فوراً ثم على الخادم */
export async function saveMyAvatar(userId: string, data: string | null): Promise<{ ok: boolean; error?: string }> {
  const cache = loadAvatarCache();
  const now = new Date().toISOString();
  if (data) cache[userId] = { data, updated_at: now }; else delete cache[userId];
  saveCache(cache);
  const res = await pushOne(userId, data ? { data, updated_at: now } : null);
  setPending(res.ok ? getPending().filter((x) => x !== userId) : [...getPending(), userId]);
  return res;
}

/** مزامنة الصور مع الخادم. تُرجع true إذا تغيّر شيء */
export async function syncAvatars(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data: list, error } = await supabase.from('user_avatars').select('user_id,updated_at');
  if (error || !Array.isArray(list)) return false; // الجدول غير موجود بعد: نكتفي بالكاش المحلي

  const cache = loadAvatarCache();
  let changed = false;

  // إعادة محاولة ما فشل رفعه سابقاً
  for (const id of getPending()) {
    const res = await pushOne(id, cache[id] || null);
    if (res.ok) setPending(getPending().filter((x) => x !== id));
  }
  const pending = new Set(getPending());

  const remoteIds = new Set(list.map((r: any) => r.user_id));
  for (const id of Object.keys(cache)) {
    if (!remoteIds.has(id) && !pending.has(id)) { delete cache[id]; changed = true; }
  }

  const stale = list.filter((r: any) => !pending.has(r.user_id) && (!cache[r.user_id] || new Date(cache[r.user_id].updated_at).getTime() < new Date(r.updated_at).getTime()));
  for (let i = 0; i < stale.length; i += 30) {
    const ids = stale.slice(i, i + 30).map((r: any) => r.user_id);
    const { data: rows } = await supabase.from('user_avatars').select('user_id,data,updated_at').in('user_id', ids);
    (rows || []).forEach((r: any) => { cache[r.user_id] = { data: r.data, updated_at: r.updated_at }; changed = true; });
  }
  saveCache(cache);
  return changed;
}

/** قص مربع من منتصف الصورة وتصغيرها (128px JPEG) لتبقى بضعة كيلوبايتات */
export function fileToAvatarDataUrl(file: File, size = 128, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('الملف ليس صورة'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذر فتح الصورة'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('المتصفح لا يدعم معالجة الصور'));
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
