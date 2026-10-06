/**
 * قسم نافس (062): طلاب نافس ومستوياتهم، والقياسات، والمهارات.
 * الاختبارات التجريبية اختبارات عادية عليها quizzes.nafes، وبنك نافس = question_bank.track = 'nafes'.
 */
import { supabase } from './supabase';
import { safe } from './remote';

export type NafesSubject = 'math' | 'science' | 'reading';
export type NafesGrade = '3' | '6' | '9';
export const NAFES_SUBJECTS: Array<{ k: NafesSubject; label: string }> = [
  { k: 'math', label: 'الرياضيات' }, { k: 'science', label: 'العلوم' }, { k: 'reading', label: 'القراءة (لغتي)' },
];
export const NAFES_GRADES: Array<{ k: NafesGrade; label: string }> = [
  { k: '3', label: 'الثالث الابتدائي' }, { k: '6', label: 'السادس الابتدائي' }, { k: '9', label: 'الثالث المتوسط' },
];
export const subjectLabel = (k?: string) => NAFES_SUBJECTS.find((s) => s.k === k)?.label || k || '';
export const gradeLabel = (k?: string) => NAFES_GRADES.find((g) => g.k === k)?.label || k || '';

/** مستويات الأداء بالدرجة المئوية */
export type NafesLevel = 'advanced' | 'proficient' | 'basic' | 'beginner';
export const LEVELS: Array<{ k: NafesLevel; label: string; min: number; tone: 'ok' | 'info' | 'warn' | 'bad'; color: string }> = [
  { k: 'advanced', label: 'متقدم', min: 85, tone: 'ok', color: '#059669' },
  { k: 'proficient', label: 'متمكن', min: 70, tone: 'info', color: '#4f46e5' },
  { k: 'basic', label: 'مُلِمّ', min: 50, tone: 'warn', color: '#d97706' },
  { k: 'beginner', label: 'مبتدئ', min: 0, tone: 'bad', color: '#e11d48' },
];
export const levelOf = (score: number | null | undefined) => (score == null || Number.isNaN(score) ? null : LEVELS.find((l) => score >= l.min) || LEVELS[LEVELS.length - 1]);

export interface NafesSkill { id: string; subject: NafesSubject; grade: NafesGrade; domain: string; name: string; sort: number }
export interface NafesStudent { id: string; student_id: string; subject: NafesSubject; grade: NafesGrade; baseline: number | null; target: number; teacher_id: string | null; note: string; created_at: string }
export interface NafesMeasure { id: string; student_id: string; subject: NafesSubject; measured_on: string; score: number; skills: Record<string, number>; title: string; note: string; created_by: string | null; created_at: string }

export async function fetchNafes(): Promise<{ ok: boolean; skills: NafesSkill[]; students: NafesStudent[]; measures: NafesMeasure[] }> {
  const [sk, st, ms] = await Promise.all([
    safe<NafesSkill[]>(() => supabase.from('nafes_skills').select('*').order('subject').order('grade').order('sort').order('name') as any),
    safe<NafesStudent[]>(() => supabase.from('nafes_students').select('*').limit(5000) as any),
    safe<NafesMeasure[]>(() => supabase.from('nafes_measures').select('*').order('measured_on').limit(20000) as any),
  ]);
  return {
    ok: sk.ok && st.ok && ms.ok,
    skills: sk.data || [],
    students: (st.data || []).map((s) => ({ ...s, baseline: s.baseline == null ? null : Number(s.baseline), target: Number(s.target) || 85 })),
    measures: (ms.data || []).map((m) => ({ ...m, score: Number(m.score) || 0, skills: m.skills || {} })),
  };
}

export async function fetchNafesSkills(): Promise<NafesSkill[]> {
  const r = await safe<NafesSkill[]>(() => supabase.from('nafes_skills').select('*').order('sort').order('name') as any);
  return r.data || [];
}
/** يُضبط من صفحة نافس لفتح «اختبار جديد» كاختبار تجريبي */
export const NAFES_NEW_QUIZ_KEY = 'itqan_nafes_new_quiz';

export async function addNafesStudents(rows: Array<Pick<NafesStudent, 'student_id' | 'subject' | 'grade' | 'baseline' | 'target' | 'teacher_id'>>) {
  const r = await safe<NafesStudent[]>(() => supabase.from('nafes_students').upsert(rows, { onConflict: 'student_id,subject', ignoreDuplicates: true }).select('*') as any);
  return { ok: r.ok, rows: r.data || [], error: r.error };
}
export async function updateNafesStudent(id: string, patch: Partial<Pick<NafesStudent, 'baseline' | 'target' | 'note' | 'grade' | 'teacher_id'>>) {
  const r = await safe<NafesStudent[]>(() => supabase.from('nafes_students').update(patch).eq('id', id).select('*') as any);
  return r.data?.[0] || null;
}
export async function deleteNafesStudent(id: string) {
  const r = await safe<any[]>(() => supabase.from('nafes_students').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

export async function addMeasures(rows: Array<Pick<NafesMeasure, 'student_id' | 'subject' | 'measured_on' | 'score' | 'skills' | 'title' | 'note' | 'created_by'>>) {
  const r = await safe<NafesMeasure[]>(() => supabase.from('nafes_measures').insert(rows).select('*') as any);
  return { ok: r.ok, rows: r.data || [], error: r.error };
}
export async function deleteMeasure(id: string) {
  const r = await safe<any[]>(() => supabase.from('nafes_measures').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

export async function saveSkill(p: { id?: string; subject: NafesSubject; grade: NafesGrade; domain: string; name: string; created_by?: string }) {
  const body = { subject: p.subject, grade: p.grade, domain: p.domain.trim(), name: p.name.trim() };
  const r = await safe<NafesSkill[]>(() => (p.id ? supabase.from('nafes_skills').update(body).eq('id', p.id) : supabase.from('nafes_skills').insert({ ...body, created_by: p.created_by })).select('*') as any);
  return { ok: r.ok && !!r.data?.length, row: r.data?.[0], error: r.error };
}
export async function deleteSkill(id: string) {
  const r = await safe<any[]>(() => supabase.from('nafes_skills').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

/** متوسط */
export const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
