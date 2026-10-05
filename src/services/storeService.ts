import { supabase } from './supabase';
import { safe } from './remote';

/** متجر النقاط (052) */
export interface StoreItem { id: string; title: string; description: string; emoji: string; image?: string | null; cost: number; stock: number | null; active: boolean; created_at: string }
export type RedemptionStatus = 'pending' | 'approved' | 'delivered' | 'rejected' | 'cancelled';
export interface Redemption {
  id: string; item_id: string | null; student_id: string; item_title: string; item_emoji: string; item_image?: string | null; cost: number;
  status: RedemptionStatus; note: string; handled_by_name: string; handled_at: string | null; created_at: string;
}
export interface StoreBalance { earned: number; spent: number; balance: number }

export const STATUS_LABEL: Record<RedemptionStatus, { label: string; tone: 'warn' | 'info' | 'ok' | 'bad' | 'muted' }> = {
  pending: { label: 'بانتظار الاعتماد', tone: 'warn' },
  approved: { label: 'معتمد — بانتظار التسليم', tone: 'info' },
  delivered: { label: 'سُلِّم', tone: 'ok' },
  rejected: { label: 'مرفوض', tone: 'bad' },
  cancelled: { label: 'ملغى', tone: 'muted' },
};

/** المكافآت؛ ok=false إن لم يُشغَّل 052 بعد */
export async function fetchStoreItems(): Promise<{ ok: boolean; items: StoreItem[] }> {
  const r = await safe<StoreItem[]>(() => supabase.from('store_items').select('*').order('cost') as any);
  return { ok: r.ok, items: r.data || [] };
}

export async function fetchRedemptions(studentId?: string): Promise<Redemption[]> {
  const r = await safe<Redemption[]>(() => {
    let q: any = supabase.from('store_redemptions').select('*');
    if (studentId) q = q.eq('student_id', studentId);
    return q.order('created_at', { ascending: false }).limit(1000);
  });
  return r.data || [];
}

export async function fetchBalance(studentId?: string): Promise<StoreBalance | null> {
  const r = await safe<StoreBalance>(() => supabase.rpc('itqan_store_balance', studentId ? { p_student: studentId } : {}) as any);
  return r.ok ? r.data : null;
}

export async function saveStoreItem(p: Partial<StoreItem> & { title: string; cost: number; created_by?: string }) {
  const row: Record<string, unknown> = { title: p.title, description: p.description || '', emoji: p.emoji || '🎁', cost: p.cost, stock: p.stock ?? null, active: p.active ?? true };
  if (p.image !== undefined) row.image = p.image; // قبل 054 لا يُرسل العمود
  const r = await safe<StoreItem[]>(() => (p.id ? supabase.from('store_items').update(row).eq('id', p.id) : supabase.from('store_items').insert({ ...row, created_by: p.created_by })).select('id') as any);
  return { ok: r.ok && !!r.data?.length, error: r.error };
}

export async function deleteStoreItem(id: string) {
  const r = await safe<any[]>(() => supabase.from('store_items').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

/** رسالة مفهومة لأخطاء دوال المتجر */
export const storeError = (e?: string) =>
  /not_enough/.test(e || '') ? 'نقاطك لا تكفي لهذه المكافأة'
    : /out_of_stock/.test(e || '') ? 'نفدت الكمية'
      : /unavailable/.test(e || '') ? 'المكافأة غير متاحة الآن'
        : /too_many_pending/.test(e || '') ? 'لديك 3 طلبات بانتظار الاعتماد؛ انتظر حتى تُعالج'
          : /bad_transition/.test(e || '') ? 'تغيّرت حالة الطلب، حدّث الصفحة'
            : 'تعذر تنفيذ الطلب';

export async function redeem(itemId: string) {
  const r = await safe<Redemption & { balance: number }>(() => supabase.rpc('itqan_store_redeem', { p_item: itemId }) as any);
  return { ok: r.ok && !!r.data, data: r.data, error: r.error };
}

export async function cancelRedemption(id: string) {
  const r = await safe<boolean>(() => supabase.rpc('itqan_store_cancel', { p_id: id }) as any);
  return r.ok && r.data === true;
}

export async function handleRedemption(id: string, status: 'approved' | 'delivered' | 'rejected', note = '') {
  const r = await safe<Redemption>(() => supabase.rpc('itqan_store_handle', { p_id: id, p_status: status, p_note: note }) as any);
  return { ok: r.ok && !!r.data, error: r.error };
}

/** تصغير صورة المكافأة (أقصى بُعد 320px، WebP يحفظ الشفافية) */
export function fileToStoreImage(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذرت قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف ليس صورة صالحة'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL('image/webp', 0.82);
        if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
        if (url.length > 400000) return reject(new Error('الصورة كبيرة جداً'));
        resolve(url);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
