/**
 * بانرات الصفحة الرئيسية. الصور تُخزَّن مصغّرة داخل الصف نفسه، لذلك نجلب أولاً
 * قائمة خفيفة (المعرّف ووقت التعديل) ثم الصفوف التي تغيّرت فقط، ونحفظها على الجهاز،
 * فلا تُنزَّل الصور مع كل تحديث تلقائي (توفير لحد التنزيل في الخطة المجانية).
 */
import { supabase } from './supabase';
import { safe, readJson, writeJson, newId } from './remote';

export type BannerKind = 'wide' | 'gallery';
export type BannerAudience = 'all' | 'students' | 'staff';
export type BannerEffect = 'none' | 'confetti' | 'balloons' | 'stars' | 'trophies';

export const BANNER_EFFECTS: Record<BannerEffect, string> = {
  none: 'بدون',
  confetti: '🎉 قصاصات ملونة',
  balloons: '🎈 بالونات',
  stars: '✨ نجوم لامعة',
  trophies: '🏆 كؤوس وميداليات',
};

export interface BannerImage {
  src: string;
  caption?: string;
}

export interface Banner {
  id: string;
  kind: BannerKind;
  title: string;
  body: string;
  images: BannerImage[];
  audience: BannerAudience;
  theme: string;
  text_position: 'overlay' | 'below';
  is_active: boolean;
  /** دائم: لا يظهر عليه زر الإخفاء (013) */
  pinned?: boolean;
  /** تأثير احتفالي يخرج من البانر عند ظهوره (013) */
  effect?: BannerEffect;
  starts_at?: string | null;
  ends_at?: string | null;
  sort: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export const BANNER_THEMES: Record<string, { label: string; from: string; to: string }> = {
  indigo: { label: 'بنفسجي', from: '#4f46e5', to: '#7c3aed' },
  emerald: { label: 'أخضر', from: '#059669', to: '#0d9488' },
  amber: { label: 'ذهبي', from: '#d97706', to: '#ea580c' },
  rose: { label: 'وردي', from: '#e11d48', to: '#c026d3' },
  sky: { label: 'أزرق', from: '#0284c7', to: '#2563eb' },
  slate: { label: 'داكن', from: '#1e293b', to: '#0f172a' },
};

const KEY = 'itqan_banners_v1';
let memory: Banner[] | null = null;

export const loadBannerCache = (): Banner[] => memory ?? readJson<Banner[]>(KEY, []);
const saveCache = (list: Banner[]) => {
  memory = list;
  writeJson(KEY, list); // قد يفشل عند امتلاء مساحة المتصفح: تبقى النسخة في الذاكرة
};

export function newBanner(createdBy?: string): Banner {
  const now = new Date().toISOString();
  return {
    id: newId('bnr'), kind: 'wide', title: '', body: '', images: [], audience: 'all', theme: 'indigo',
    text_position: 'overlay', is_active: true, pinned: false, effect: 'none', starts_at: null, ends_at: null, sort: 0,
    created_by: createdBy || null, created_at: now, updated_at: now,
  };
}

/** هل البانر ظاهر الآن لهذا الدور؟ */
export function isBannerVisible(b: Banner, role: string, now = Date.now()): boolean {
  if (!b.is_active) return false;
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return false;
  if (b.ends_at && new Date(b.ends_at).getTime() < now) return false;
  if (b.audience === 'students') return role === 'student';
  if (b.audience === 'staff') return role === 'admin' || role === 'teacher' || role === 'supervisor';
  return true;
}

/** مزامنة البانرات: تُرجع true إذا تغيّر شيء */
export async function syncBanners(): Promise<boolean> {
  const list = await safe<Array<{ id: string; updated_at: string }>>(
    () => supabase.from('banners').select('id,updated_at') as any
  );
  if (!list.ok || !Array.isArray(list.data)) return false; // الجدول غير موجود بعد (006)
  const cache = loadBannerCache();
  const remoteIds = new Set(list.data.map((r) => r.id));
  const stale = list.data.filter((r) => {
    const c = cache.find((x) => x.id === r.id);
    return !c || new Date(c.updated_at).getTime() < new Date(r.updated_at).getTime();
  });
  let next = cache.filter((c) => remoteIds.has(c.id));
  if (stale.length) {
    const full = await safe<Banner[]>(() => supabase.from('banners').select('*').in('id', stale.map((s) => s.id)) as any);
    if (full.ok && Array.isArray(full.data)) {
      const map = new Map(next.map((b) => [b.id, b]));
      full.data.forEach((b) => map.set(b.id, { ...b, images: Array.isArray(b.images) ? b.images : [] }));
      next = Array.from(map.values());
    }
  }
  const changed = stale.length > 0 || next.length !== cache.length;
  if (changed) saveCache(next);
  return changed;
}

export async function saveBannerRemote(b: Banner): Promise<{ ok: boolean; error?: string; needsMigration?: boolean }> {
  const row = { ...b, pinned: !!b.pinned, effect: b.effect || 'none', updated_at: new Date().toISOString() };
  let res = await safe(() => supabase.from('banners').upsert(row, { onConflict: 'id' }) as any);
  // قبل تشغيل 013: الأعمدة الجديدة غير موجودة، فنحفظ البانر بدونها
  let needsMigration = false;
  if (!res.ok && /pinned|effect/.test(res.error || '')) {
    const { pinned: _p, effect: _e, ...legacy } = row;
    res = await safe(() => supabase.from('banners').upsert(legacy, { onConflict: 'id' }) as any);
    needsMigration = res.ok && (row.pinned || row.effect !== 'none');
  }
  if (res.ok) saveCache([...loadBannerCache().filter((x) => x.id !== b.id), row]);
  return { ok: res.ok, error: res.error, needsMigration };
}

export async function deleteBannerRemote(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await safe(() => supabase.from('banners').delete().eq('id', id) as any);
  if (res.ok) saveCache(loadBannerCache().filter((x) => x.id !== id));
  return { ok: res.ok, error: res.error };
}

/** تصغير صورة البانر العريضة (عرض أقصى 1600px، JPEG) لتبقى بحجم مناسب */
export function fileToBannerDataUrl(file: File, maxWidth = 1600, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('الملف ليس صورة'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذر فتح الصورة'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('المتصفح لا يدعم معالجة الصور'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
