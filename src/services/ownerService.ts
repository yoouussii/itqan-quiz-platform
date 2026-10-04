import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';
import { safe } from './remote';

export interface License { plan?: string; expires_at?: string; max_students?: number; block_on_expiry?: boolean; note?: string; days_left?: number | null; students?: number }
export interface OwnerSchool { id: string; name: string; url: string; anon_key: string; notes: string; created_at?: string }
export interface SchoolStats {
  school_name: string | null; users: Record<string, number>; classes: number; quizzes: number; submissions: number;
  submissions_30d: number; active_users_7d: number; last_activity: string | null; db_bytes: number; license: License; checked_at: string;
}

/** استدعاء دالة على قاعدة بيانات مدرسة (قد تكون غير المدرسة الحالية) */
async function remoteRpc<T>(url: string, anonKey: string, fn: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!r.ok) return { ok: false, error: /forbidden/.test(text) ? 'forbidden' : json?.message || `HTTP ${r.status}` };
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'network' };
  }
}

/** المدرسة الحالية (نسخة صاحب المنصة) تُضاف للقائمة تلقائياً */
export const THIS_SCHOOL: OwnerSchool = { id: '__this__', name: '', url: supabaseUrl, anon_key: supabaseAnonKey, notes: '' };

export const fetchSchoolStats = (s: OwnerSchool, key: string) => remoteRpc<SchoolStats>(s.url, s.anon_key, 'itqan_owner_stats', { p_key: key });
export const setSchoolLicense = (s: OwnerSchool, key: string, lic: License) => remoteRpc<License>(s.url, s.anon_key, 'itqan_owner_set_license', { p_key: key, p: lic });

export async function fetchOwnerSchools(key: string) {
  const r = await safe<OwnerSchool[]>(() => supabase.rpc('itqan_owner_schools', { p_key: key }) as any);
  return { ok: r.ok, rows: r.data || [], error: r.error };
}
export async function saveOwnerSchool(key: string, s: Partial<OwnerSchool>) {
  const r = await safe<OwnerSchool>(() => supabase.rpc('itqan_owner_school_save', { p_key: key, p: s }) as any);
  return r.data || null;
}
export async function deleteOwnerSchool(key: string, id: string) {
  return (await safe(() => supabase.rpc('itqan_owner_school_delete', { p_key: key, p_id: id }) as any)).ok;
}

/** الاشتراك كما تراه المدرسة الحالية ({} = بلا اشتراك محدد) */
export async function fetchLicense(): Promise<License> {
  const r = await safe<License>(() => supabase.rpc('itqan_license') as any);
  return r.ok && r.data ? r.data : {};
}

export const licenseState = (l: License): 'none' | 'ok' | 'soon' | 'expired' => {
  if (l.days_left == null) return 'none';
  if (l.days_left < 0) return 'expired';
  return l.days_left <= 14 ? 'soon' : 'ok';
};
