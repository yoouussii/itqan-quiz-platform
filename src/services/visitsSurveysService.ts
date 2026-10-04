import { supabase } from './supabase';
import { safe } from './remote';

// ---------------------------------------------------------------------
// الزيارات الصفية
// ---------------------------------------------------------------------
export interface VisitItem { title: string; max: number; score?: number }
export interface ClassVisit {
  id: string; teacher_id: string; visitor_id: string; visitor_name: string; day: string;
  class_id: string | null; subject_id: string | null; lesson: string; items: VisitItem[];
  strengths: string; recommendations: string; teacher_ack_at: string | null; teacher_note: string; created_at: string;
}

export const DEFAULT_VISIT_ITEMS: VisitItem[] = [
  'التخطيط للدرس وإعداده', 'التهيئة وإثارة الدافعية', 'وضوح أهداف الدرس وتحقيقها', 'التمكن العلمي من المادة',
  'تنوع استراتيجيات التدريس', 'توظيف الوسائل والتقنية', 'إدارة الصف وتنظيم الوقت', 'تفاعل الطلاب ومشاركتهم',
  'مراعاة الفروق الفردية', 'التقويم المستمر والتغذية الراجعة', 'الواجبات والأنشطة', 'غلق الدرس وتلخيصه',
].map((title) => ({ title, max: 5 }));

export const visitTotals = (v: Pick<ClassVisit, 'items'>) => {
  const max = v.items.reduce((a, i) => a + (Number(i.max) || 0), 0);
  const score = v.items.reduce((a, i) => a + (Number(i.score) || 0), 0);
  return { score, max, pct: max ? Math.round((score / max) * 1000) / 10 : 0 };
};

export async function fetchVisitConfig(): Promise<VisitItem[]> {
  const r = await safe<VisitItem[]>(() => supabase.rpc('itqan_visit_config') as any);
  return r.ok && Array.isArray(r.data) && r.data.length ? r.data.map((i) => ({ title: i.title, max: Number(i.max) || 5 })) : DEFAULT_VISIT_ITEMS;
}
export async function saveVisitConfig(items: VisitItem[]) {
  return (await safe(() => supabase.rpc('itqan_visit_config_save', { p_items: items }) as any)).ok;
}
export async function fetchVisits(): Promise<{ ok: boolean; rows: ClassVisit[] }> {
  const r = await safe<ClassVisit[]>(() => supabase.from('class_visits').select('*').order('day', { ascending: false }).order('created_at', { ascending: false }).limit(1000) as any);
  return { ok: r.ok, rows: r.data || [] };
}
export async function addVisit(v: Omit<ClassVisit, 'id' | 'created_at' | 'teacher_ack_at' | 'teacher_note'>) {
  const r = await safe<ClassVisit[]>(() => supabase.from('class_visits').insert(v).select('*') as any);
  return r.data?.[0] || null;
}
export async function deleteVisit(id: string) {
  const r = await safe<any[]>(() => supabase.from('class_visits').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}
export async function ackVisit(id: string, note: string) {
  return (await safe(() => supabase.rpc('itqan_visit_ack', { p_id: id, p_note: note }) as any)).ok;
}

// ---------------------------------------------------------------------
// الاستبيانات
// ---------------------------------------------------------------------
export type SurveyQType = 'rating' | 'choice' | 'text';
export interface SurveyQuestion { id: string; type: SurveyQType; text: string; options?: string[]; required?: boolean }
export interface Survey {
  id: string; title: string; description: string; roles: string[]; questions: SurveyQuestion[];
  anonymous: boolean; is_open: boolean; closes_at: string | null; created_by: string | null; created_by_name: string; created_at: string;
  answered?: boolean;
}
export interface SurveyResponse { id: number; survey_id: string; user_id: string | null; user_name: string; answers: Record<string, string | number>; created_at: string }

export async function fetchSurveys(): Promise<Survey[]> {
  const r = await safe<Survey[]>(() => supabase.from('surveys').select('*').order('created_at', { ascending: false }) as any);
  return r.data || [];
}
export async function fetchMySurveys(): Promise<Survey[]> {
  const r = await safe<Survey[]>(() => supabase.rpc('itqan_my_surveys') as any);
  return Array.isArray(r.data) ? r.data : [];
}
export async function fetchSurveyCounts(): Promise<Record<string, number>> {
  const r = await safe<Record<string, number>>(() => supabase.rpc('itqan_survey_counts') as any);
  return r.data || {};
}
export async function saveSurvey(s: Partial<Survey> & { title: string }) {
  if (s.id) {
    const { id, ...patch } = s;
    const r = await safe<Survey[]>(() => supabase.from('surveys').update(patch).eq('id', id).select('*') as any);
    return r.data?.[0] || null;
  }
  const r = await safe<Survey[]>(() => supabase.from('surveys').insert(s).select('*') as any);
  return r.data?.[0] || null;
}
export async function deleteSurvey(id: string) {
  const r = await safe<any[]>(() => supabase.from('surveys').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}
export async function fetchResponses(surveyId: string): Promise<SurveyResponse[]> {
  const r = await safe<SurveyResponse[]>(() => supabase.from('survey_responses').select('*').eq('survey_id', surveyId).order('created_at') as any);
  return r.data || [];
}
export async function submitSurvey(surveyId: string, answers: Record<string, string | number>) {
  const r = await safe(() => supabase.rpc('itqan_survey_submit', { p_survey: surveyId, p_answers: answers }) as any);
  return { ok: r.ok, error: r.error };
}

/** ملخص سؤال: متوسط التقييم وتوزيعه، أو عدّ الاختيارات، أو قائمة النصوص */
export function summarize(q: SurveyQuestion, rs: SurveyResponse[]) {
  const vals = rs.map((r) => r.answers?.[q.id]).filter((v) => v !== undefined && v !== null && v !== '');
  if (q.type === 'rating') {
    const nums = vals.map(Number).filter((n) => n >= 1 && n <= 5);
    const dist = [1, 2, 3, 4, 5].map((k) => nums.filter((n) => n === k).length);
    return { kind: 'rating' as const, n: nums.length, avg: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0, dist };
  }
  if (q.type === 'choice') {
    const opts = q.options || [];
    return { kind: 'choice' as const, n: vals.length, counts: opts.map((o) => ({ o, c: vals.filter((v) => v === o).length })) };
  }
  return { kind: 'text' as const, n: vals.length, texts: vals.map(String) };
}
