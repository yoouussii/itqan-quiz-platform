import { supabase } from './supabase';
import { safe } from './remote';
import { computeOutcomes, pct } from '../utils/outcomes';
import type { QuizWithDetails, SubmissionWithDetails } from '../types';

export type PlanStatus = 'active' | 'done' | 'cancelled';
export interface PlanNote { at: string; by: string; note: string }
export interface RemedialPlan {
  id: string; student_id: string; subject_id: string | null; outcome: string;
  teacher_id: string; teacher_name: string; start_pct: number; target_pct: number;
  actions: string; due_date: string | null; status: PlanStatus; notes: PlanNote[];
  created_at: string; closed_at: string | null;
}

/** إجراءات علاجية مقترحة (يختار المعلم منها أو يكتب غيرها) */
export const SUGGESTED_ACTIONS = [
  'إعادة شرح المهارة بأسلوب مختلف وأمثلة إضافية',
  'تدريبات فردية قصيرة على المهارة',
  'اختبار علاجي من بنك الأسئلة',
  'التعلم بالأقران مع زميل متقن',
  'واجب منزلي مركّز بمتابعة ولي الأمر',
  'مقطع شرح مرئي للمراجعة في المنزل',
];

export async function fetchPlans(studentIds?: string[]): Promise<{ ok: boolean; rows: RemedialPlan[] }> {
  const r = await safe<RemedialPlan[]>(() => {
    let q: any = supabase.from('remedial_plans').select('*');
    if (studentIds?.length) q = q.in('student_id', studentIds);
    return q.order('created_at', { ascending: false }).limit(2000);
  });
  return { ok: r.ok, rows: r.data || [] };
}

export async function createPlans(rows: Omit<RemedialPlan, 'id' | 'created_at' | 'closed_at' | 'notes' | 'status'>[]) {
  const r = await safe<RemedialPlan[]>(() => supabase.from('remedial_plans').insert(rows.map((x) => ({ ...x, status: 'active' }))).select('*') as any);
  return { ok: r.ok, rows: r.data || [], error: r.error };
}

export async function updatePlan(id: string, patch: Partial<Pick<RemedialPlan, 'status' | 'notes' | 'actions' | 'due_date' | 'target_pct' | 'closed_at'>>) {
  const r = await safe<RemedialPlan[]>(() => supabase.from('remedial_plans').update(patch).eq('id', id).select('*') as any);
  return r.data?.[0] || null;
}

export async function deletePlan(id: string) {
  const r = await safe<any[]>(() => supabase.from('remedial_plans').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

/** نسبة إتقان الطالب الحالية في مهارة (من كل تسليماته)، أو null إن لم يُقس بعد */
export function currentMastery(plan: Pick<RemedialPlan, 'student_id' | 'subject_id' | 'outcome'>, quizzes: QuizWithDetails[], submissions: SubmissionWithDetails[]): number | null {
  const mine = submissions.filter((s) => s.student_id === plan.student_id);
  const { stats } = computeOutcomes(quizzes, mine, { subjectId: plan.subject_id || undefined });
  const s = stats.find((x) => x.outcome === plan.outcome);
  const m = s?.students.get(plan.student_id);
  return m && m.possible > 0 ? pct(m) : null;
}
