/**
 * جدول الاختبارات اليدوي (063): مواعيد يضيفها المعلم لفصوله (ومنها الورقية)، مصنّفة بالفترة.
 */
import { supabase } from './supabase';
import { safe } from './remote';

export type ExamPeriod = 'p1' | 'p2' | 'final' | 'short' | 'other';
export const EXAM_PERIODS: Array<{ k: ExamPeriod; label: string; short: string }> = [
  { k: 'p1', label: 'اختبار الفترة الأولى', short: 'الفترة الأولى' },
  { k: 'p2', label: 'اختبار الفترة الثانية', short: 'الفترة الثانية' },
  { k: 'final', label: 'الاختبار النهائي', short: 'النهائي' },
  { k: 'short', label: 'اختبار قصير', short: 'قصير' },
  { k: 'other', label: 'أخرى', short: 'أخرى' },
];
export const periodLabel = (k?: string | null) => EXAM_PERIODS.find((p) => p.k === k)?.label || '';
export const periodShort = (k?: string | null) => EXAM_PERIODS.find((p) => p.k === k)?.short || '';

export interface ExamEntry {
  id: string; class_id: string; subject_id: string | null; title: string; period: ExamPeriod;
  exam_date: string; start_time: string | null; lessons: string; teacher_id: string; teacher_name: string; created_at: string;
}

export async function fetchExamSchedule(): Promise<{ ok: boolean; rows: ExamEntry[] }> {
  const r = await safe<ExamEntry[]>(() => supabase.from('exam_schedule').select('*').order('exam_date').limit(5000) as any);
  return { ok: r.ok, rows: r.data || [] };
}

export async function addExamEntries(rows: Array<Omit<ExamEntry, 'id' | 'created_at'>>) {
  const r = await safe<ExamEntry[]>(() => supabase.from('exam_schedule').insert(rows).select('*') as any);
  return { ok: r.ok && (r.data || []).length > 0, rows: r.data || [], error: r.error };
}

export async function updateExamEntry(id: string, patch: Partial<Omit<ExamEntry, 'id' | 'created_at' | 'teacher_id'>>) {
  const r = await safe<ExamEntry[]>(() => supabase.from('exam_schedule').update(patch).eq('id', id).select('*') as any);
  return r.data?.[0] || null;
}

export async function deleteExamEntry(id: string) {
  const r = await safe<any[]>(() => supabase.from('exam_schedule').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}
