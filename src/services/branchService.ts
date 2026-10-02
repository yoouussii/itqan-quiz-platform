/** فروع المدرسة (009): يديرها مدير النظام، وتُحفظ نسخة على الجهاز للعمل بدون شبكة */
import { supabase } from './supabase';
import { safe, readJson, writeJson, newId } from './remote';
import { Branch } from '../types';

const KEY = 'itqan_branches_v1';

export const loadBranchCache = (): Branch[] => readJson<Branch[]>(KEY, []);

/** مزامنة الفروع من الخادم: تُرجع true إذا تغيّر شيء */
export async function syncBranches(): Promise<boolean> {
  const res = await safe<Branch[]>(() => supabase.from('branches').select('*').order('created_at') as any);
  if (!res.ok || !Array.isArray(res.data)) return false; // الجدول غير موجود بعد (009)
  const next = res.data.map((b) => ({ id: b.id, name: b.name, created_at: b.created_at, updated_at: b.updated_at }));
  const changed = JSON.stringify(next) !== JSON.stringify(loadBranchCache());
  writeJson(KEY, next);
  return changed;
}

export async function saveBranchRemote(b: Branch): Promise<{ ok: boolean; error?: string }> {
  const list = loadBranchCache();
  writeJson(KEY, list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b]);
  const res = await safe(() =>
    supabase.from('branches').upsert({ id: b.id, name: b.name, updated_at: new Date().toISOString() }, { onConflict: 'id' }) as any
  );
  return { ok: res.ok, error: res.error };
}

export async function deleteBranchRemote(id: string): Promise<{ ok: boolean; error?: string }> {
  writeJson(KEY, loadBranchCache().filter((x) => x.id !== id));
  const res = await safe(() => supabase.from('branches').delete().eq('id', id) as any);
  return { ok: res.ok, error: res.error };
}

export const newBranch = (name: string): Branch => ({ id: newId('br'), name: name.trim(), created_at: new Date().toISOString() });
