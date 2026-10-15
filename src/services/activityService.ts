import { supabase } from './supabase';
import { safe, readJson, writeJson, newId } from './remote';

export interface ActivityEntry {
  id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  target_name?: string | null;
  details?: string | null;
  created_at: string;
}

const LKEY = 'itqan_activity_local_v1';

export const ACTION_LABELS: Record<string, string> = {
  quiz_created: 'إنشاء اختبار',
  subject_deleted: 'حذف مادة',
  quiz_updated: 'تعديل اختبار',
  quiz_deleted: 'حذف اختبار',
  quiz_approved: 'اعتماد اختبار',
  quiz_rejected: 'رفض اختبار',
  quiz_reassigned: 'نقل اختبار لمعلم آخر',
  user_added: 'إضافة مستخدم',
  user_updated: 'تعديل مستخدم',
  user_deleted: 'حذف مستخدم',
  password_reset: 'إعادة تعيين كلمة مرور',
  password_changed: 'تغيير كلمة المرور (ذاتياً)',
  award_given: 'منح جائزة',
  points_deducted: 'خصم نقاط',
  announcement_sent: 'إرسال إعلان',
  retake_granted: 'منح إعادة محاولة',
  settings_changed: 'تغيير إعدادات النظام',
  notifications_deleted: 'حذف إشعارات نهائياً',
  notifications_cleared: 'مسح إشعارات مستخدم',
  banner_saved: 'حفظ بانر الصفحة الرئيسية',
  banner_deleted: 'حذف بانر',
  submissions_deleted: 'حذف مشاركات طلاب',
  year_rollover: 'ترحيل السنة الدراسية',
};

/** تسجيل حدث (لا يعطّل أي عملية عند الفشل). يُحفظ محلياً أيضاً كاحتياط */
export async function logActivity(e: Omit<ActivityEntry, 'id' | 'created_at'>): Promise<void> {
  const row: ActivityEntry = { id: newId('act'), created_at: new Date().toISOString(), ...e };
  writeJson(LKEY, [row, ...readJson<ActivityEntry[]>(LKEY, [])].slice(0, 100));
  await safe(() => supabase.from('activity_log').insert(row) as any);
}

export async function fetchActivity(limit = 500): Promise<{ ok: boolean; rows: ActivityEntry[]; error?: string }> {
  const res = await safe<ActivityEntry[]>(
    () => supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit) as any
  );
  if (res.ok && Array.isArray(res.data)) return { ok: true, rows: res.data };
  return { ok: false, rows: readJson<ActivityEntry[]>(LKEY, []), error: res.error };
}

export interface QuizActivityRow {
  student_id: string;
  quiz_id: string;
  started_at: string;
  completed_at?: string | null;
  time_spent?: number | null;
  percentage?: number | null;
}

/** وقت دخول الطلاب للاختبارات ووقت تسليمها (071) */
export async function fetchQuizActivity(days: number): Promise<{ ok: boolean; rows: QuizActivityRow[]; missing?: boolean }> {
  const { data, error } = await supabase.rpc('itqan_quiz_activity', { p_days: days || 0 });
  if (error) return { ok: false, rows: [], missing: /itqan_quiz_activity|PGRST202|42883/.test(`${error.code} ${error.message}`) };
  return { ok: true, rows: Array.isArray(data) ? data : [] };
}
