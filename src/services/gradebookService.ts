import { supabase } from './supabase';
import { safe } from './remote';

export interface GbColumn { id: string; class_id: string; subject_id: string; title: string; max_score: number; weight: number; created_by: string | null; created_at: string }
export interface GbMark { column_id: string; student_id: string; score: number }

export async function fetchWeights(quizIds: string[]): Promise<Record<string, number>> {
  if (!quizIds.length) return {};
  const r = await safe<{ quiz_id: string; weight: number }[]>(() => supabase.from('gradebook_weights').select('quiz_id,weight').in('quiz_id', quizIds) as any);
  const out: Record<string, number> = {};
  (r.data || []).forEach((w) => { out[w.quiz_id] = Number(w.weight); });
  return out;
}

export async function saveWeight(quizId: string, weight: number, by: string) {
  const r = await safe(() => supabase.from('gradebook_weights').upsert({ quiz_id: quizId, weight, updated_by: by, updated_at: new Date().toISOString() }) as any);
  return r.ok;
}

export async function fetchColumns(classId: string, subjectId: string): Promise<GbColumn[]> {
  const r = await safe<GbColumn[]>(() => supabase.from('gradebook_columns').select('*').eq('class_id', classId).eq('subject_id', subjectId).order('created_at') as any);
  return (r.data || []).map((c) => ({ ...c, max_score: Number(c.max_score), weight: Number(c.weight) }));
}

export async function addColumn(c: Pick<GbColumn, 'class_id' | 'subject_id' | 'title' | 'max_score' | 'weight' | 'created_by'>) {
  const r = await safe<GbColumn[]>(() => supabase.from('gradebook_columns').insert(c).select('*') as any);
  const row = r.data?.[0];
  return row ? { ...row, max_score: Number(row.max_score), weight: Number(row.weight) } : null;
}

export async function updateColumn(id: string, patch: Partial<Pick<GbColumn, 'title' | 'max_score' | 'weight'>>) {
  const r = await safe<any[]>(() => supabase.from('gradebook_columns').update(patch).eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

export async function deleteColumn(id: string) {
  const r = await safe<any[]>(() => supabase.from('gradebook_columns').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

export async function fetchMarks(columnIds: string[]): Promise<GbMark[]> {
  if (!columnIds.length) return [];
  const r = await safe<GbMark[]>(() => supabase.from('gradebook_marks').select('column_id,student_id,score').in('column_id', columnIds) as any);
  return (r.data || []).map((m) => ({ ...m, score: Number(m.score) }));
}

/** حفظ درجة (null = حذف) */
export async function saveMark(columnId: string, studentId: string, score: number | null, by: string) {
  if (score === null) {
    const r = await safe(() => supabase.from('gradebook_marks').delete().eq('column_id', columnId).eq('student_id', studentId) as any);
    return r.ok;
  }
  const r = await safe<any[]>(() => supabase.from('gradebook_marks').upsert({ column_id: columnId, student_id: studentId, score, updated_by: by, updated_at: new Date().toISOString() }).select('column_id') as any);
  return r.ok && (r.data || []).length > 0;
}
