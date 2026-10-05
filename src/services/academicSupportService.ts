import { supabase } from './supabase';
import { safe } from './remote';

export type AcsStatus = 'active' | 'done' | 'stopped';
export interface AcsRecord {
  id: string; student_id: string; teacher_id: string; teacher_name: string; subject_id: string | null;
  /** مادة وفصل خاصان بالدعم (047) */
  acs_subject_id?: string | null; acs_class_id?: string | null;
  start_level: number; target_level: number; current_level: number; plan: string; status: AcsStatus;
  started_at: string; closed_at: string | null; created_at: string;
}
export type AcsRating = 'excellent' | 'very_good' | 'good' | 'needs_follow';
/** قياس (level) أو ملاحظة/تقييم يومي (level = null) */
export interface AcsProgress { id: number; support_id: string; level: number | null; rating: AcsRating | null; note: string; at: string; created_by: string; created_at: string }
export const RATINGS: Array<{ k: AcsRating; label: string; tone: 'ok' | 'info' | 'warn' }> = [
  { k: 'excellent', label: 'ممتاز', tone: 'ok' }, { k: 'very_good', label: 'جيد جداً', tone: 'ok' },
  { k: 'good', label: 'جيد', tone: 'info' }, { k: 'needs_follow', label: 'يحتاج متابعة', tone: 'warn' },
];

export async function fetchSupport(studentIds?: string[]): Promise<{ ok: boolean; rows: AcsRecord[] }> {
  const r = await safe<AcsRecord[]>(() => {
    let q: any = supabase.from('academic_support').select('*');
    if (studentIds?.length) q = q.in('student_id', studentIds);
    return q.order('created_at', { ascending: false }).limit(2000);
  });
  return { ok: r.ok, rows: r.data || [] };
}

export async function fetchProgress(supportIds: string[]): Promise<AcsProgress[]> {
  if (!supportIds.length) return [];
  const r = await safe<AcsProgress[]>(() => supabase.from('academic_support_progress').select('*').in('support_id', supportIds).order('at').order('id').limit(10000) as any);
  return r.data || [];
}

export async function addSupport(rows: Array<Pick<AcsRecord, 'student_id' | 'teacher_id' | 'teacher_name' | 'subject_id' | 'start_level' | 'target_level' | 'plan'> & { started_at?: string; acs_subject_id?: string | null; acs_class_id?: string | null }>) {
  const r = await safe<AcsRecord[]>(() => supabase.from('academic_support').insert(rows).select('*') as any);
  return { ok: r.ok, rows: r.data || [], error: r.error };
}

export async function updateSupport(id: string, patch: Partial<Pick<AcsRecord, 'target_level' | 'plan' | 'status' | 'subject_id' | 'acs_subject_id' | 'acs_class_id'>>) {
  const r = await safe<AcsRecord[]>(() => supabase.from('academic_support').update(patch).eq('id', id).select('*') as any);
  return r.data?.[0] || null;
}

export async function deleteSupport(id: string) {
  const r = await safe<any[]>(() => supabase.from('academic_support').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

export async function addProgress(p: Pick<AcsProgress, 'support_id' | 'level' | 'rating' | 'note' | 'at' | 'created_by'>) {
  const r = await safe<AcsProgress[]>(() => supabase.from('academic_support_progress').insert(p).select('*') as any);
  return r.data?.[0] || null;
}

export async function deleteProgress(id: number) {
  const r = await safe<any[]>(() => supabase.from('academic_support_progress').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

export const gain = (a: Pick<AcsRecord, 'start_level' | 'current_level'>) => a.current_level - a.start_level;
export const reached = (a: Pick<AcsRecord, 'current_level' | 'target_level'>) => a.current_level >= a.target_level;

// ---------------- مواد وفصول الدعم (047) ----------------
export interface AcsSubject { id: string; name: string; created_by?: string | null }
export interface AcsClass { id: string; name: string; subject_id: string | null; teacher_id: string | null; created_by?: string | null }

/** قائمة مواد وفصول الدعم؛ فارغة إن لم يُشغَّل 047 بعد */
export async function fetchAcsCatalog(): Promise<{ ok: boolean; subjects: AcsSubject[]; classes: AcsClass[] }> {
  const [s, c] = await Promise.all([
    safe<AcsSubject[]>(() => supabase.from('acs_subjects').select('id,name,created_by').order('name') as any),
    safe<AcsClass[]>(() => supabase.from('acs_classes').select('id,name,subject_id,teacher_id,created_by').order('name') as any),
  ]);
  return { ok: s.ok && c.ok, subjects: s.data || [], classes: c.data || [] };
}

export async function saveAcsSubject(p: { id?: string; name: string; created_by?: string }) {
  const r = await safe<AcsSubject[]>(() => (p.id ? supabase.from('acs_subjects').update({ name: p.name }).eq('id', p.id) : supabase.from('acs_subjects').insert({ name: p.name, created_by: p.created_by })).select('id,name') as any);
  return { ok: r.ok && !!r.data?.length, error: r.error };
}

export async function saveAcsClass(p: { id?: string; name: string; subject_id: string | null; teacher_id: string | null; created_by?: string }) {
  const row = { name: p.name, subject_id: p.subject_id, teacher_id: p.teacher_id };
  const r = await safe<AcsClass[]>(() => (p.id ? supabase.from('acs_classes').update(row).eq('id', p.id) : supabase.from('acs_classes').insert({ ...row, created_by: p.created_by })).select('id') as any);
  return { ok: r.ok && !!r.data?.length, error: r.error };
}

export async function deleteAcsItem(kind: 'subject' | 'class', id: string) {
  const r = await safe<any[]>(() => supabase.from(kind === 'subject' ? 'acs_subjects' : 'acs_classes').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}
