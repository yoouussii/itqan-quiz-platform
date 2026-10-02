import { supabase } from './supabase';
import { safe, readJson, writeJson, newId } from './remote';
import { StudentAward } from '../utils/points';

const KEY = 'itqan_awards_v1';
const PKEY = 'itqan_awards_pending_v1';

export const loadAwardsCache = (): StudentAward[] => readJson<StudentAward[]>(KEY, []);

export function makeAward(p: Omit<StudentAward, 'id' | 'created_at'>): StudentAward {
  return { id: newId('awd'), created_at: new Date().toISOString(), ...p };
}

export async function pushAward(a: StudentAward): Promise<{ ok: boolean; error?: string }> {
  const cache = loadAwardsCache();
  if (!cache.some((x) => x.id === a.id)) writeJson(KEY, [a, ...cache].slice(0, 500));
  const res = await safe(() => supabase.from('student_awards').insert(a) as any);
  if (!res.ok) writeJson(PKEY, [...readJson<StudentAward[]>(PKEY, []), a]);
  return { ok: res.ok, error: res.error };
}

export async function pullAwards(): Promise<boolean> {
  const stillPending: StudentAward[] = [];
  for (const a of readJson<StudentAward[]>(PKEY, [])) {
    const r = await safe(() => supabase.from('student_awards').upsert(a, { onConflict: 'id' }) as any);
    if (!r.ok) stillPending.push(a);
  }
  writeJson(PKEY, stillPending);

  const res = await safe<StudentAward[]>(
    () => supabase.from('student_awards').select('*').order('created_at', { ascending: false }).limit(300) as any
  );
  if (!res.ok || !Array.isArray(res.data)) return false;
  const remoteIds = new Set(res.data.map((r) => r.id));
  const pend = new Set(stillPending.map((p) => p.id));
  const keep = loadAwardsCache().filter((a) => pend.has(a.id) && !remoteIds.has(a.id));
  const merged = [...res.data, ...keep].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const changed = JSON.stringify(merged.map((m) => m.id)) !== JSON.stringify(loadAwardsCache().map((m) => m.id));
  writeJson(KEY, merged);
  return changed;
}
