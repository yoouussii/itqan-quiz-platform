/**
 * مزامنة الاختبارات والتسليمات مع Supabase.
 *
 * المشكلة التي يحلها هذا الملف: كان التطبيق يحفظ الاختبارات والتسليمات في
 * localStorage داخل متصفح كل مستخدم فقط، فلا يراها الآدمن ولا أي جهاز آخر.
 * الآن Supabase هو المصدر الرئيسي، و localStorage مجرد نسخة سريعة (كاش).
 */
import { supabase, isSupabaseConfigured } from './supabase';
import { StorageService, extractMissingColumn } from './storage';
import {
  Quiz,
  Question,
  QuizAssignment,
  Submission,
  QuizStatus,
  TargetType,
  User,
} from '../types';

export interface SyncResult {
  ok: boolean;
  error?: string;
}

const asArray = <T = any>(v: any): T[] => (Array.isArray(v) ? v : []);
const time = (v?: string | null): number => (v ? new Date(v).getTime() || 0 : 0);

/** إرسال صف إلى Supabase مع تجاهل الأعمدة غير الموجودة (إن لم تُنفَّذ ملفات SQL بعد) */
async function upsertRow(
  table: 'quizzes' | 'submissions',
  row: Record<string, any>
): Promise<SyncResult> {
  const payload = { ...row };
  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
    if (!error) return { ok: true };

    const missing = extractMissingColumn(error.message || '');
    if (missing && missing in payload && missing !== 'id') {
      console.warn(`[sync] العمود '${missing}' غير موجود في جدول ${table}، سيتم تجاهله.`);
      delete payload[missing];
      continue;
    }
    console.error(`[sync] فشل حفظ ${table}:`, error);
    return { ok: false, error: error.message || 'خطأ غير معروف' };
  }
  return { ok: false, error: 'تعذر مطابقة أعمدة الجدول' };
}

// ---------------------------------------------------------------------
// الاختبارات
// ---------------------------------------------------------------------

function quizToRow(
  quiz: Quiz,
  questions: Question[],
  assignments: QuizAssignment[]
): Record<string, any> {
  // التعيين الأصلي (وليس سجلات نقل الملكية)
  const primary = assignments.find((a) => a.target_type !== 'assigned_teacher');
  const targetType: TargetType = primary?.target_type ?? 'all';

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description || '',
    teacher_id: quiz.teacher_id || null,
    created_by: quiz.created_by || quiz.teacher_id || null,
    subject_id: quiz.subject_id || null,
    duration_minutes: quiz.duration_minutes,
    total_marks: quiz.total_marks,
    pass_percentage: quiz.pass_percentage,
    status: quiz.status || 'published',
    start_date: quiz.start_date || null,
    end_date: quiz.end_date || null,
    is_active: quiz.is_active ?? true,
    is_deleted: quiz.is_deleted ?? false,
    deleted_at: quiz.deleted_at ?? null,
    allowed_retake_student_ids: quiz.allowed_retake_student_ids ?? [],
    target_type: targetType,
    class_id: targetType === 'class' ? primary?.target_id ?? null : null,
    student_ids:
      targetType === 'specific_students' && primary?.target_id
        ? primary.target_id.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    questions,
    assignments,
    created_at: quiz.created_at,
    updated_at: quiz.updated_at || new Date().toISOString(),
  };
}

function rowToBundle(row: any): {
  quiz: Quiz;
  questions: Question[];
  assignments: QuizAssignment[];
} {
  const questions: Question[] = asArray<Question>(row.questions).map((q, i) => ({
    ...q,
    id: q.id || `q-${row.id}-${i + 1}`,
    quiz_id: row.id,
  }));

  let assignments: QuizAssignment[] = asArray<QuizAssignment>(row.assignments).map((a, i) => ({
    ...a,
    id: a.id || `asg-${row.id}-${i + 1}`,
    quiz_id: row.id,
  }));

  if (assignments.length === 0) {
    // صفوف قديمة بدون عمود assignments: نبنيه من target_type / class_id / student_ids
    const tt: TargetType = (row.target_type as TargetType) || 'all';
    const studentIds = asArray<string>(row.student_ids);
    assignments = [
      {
        id: `asg-${row.id}-1`,
        quiz_id: row.id,
        target_type: tt,
        target_id:
          tt === 'class'
            ? row.class_id || null
            : tt === 'specific_students'
            ? studentIds.join(',')
            : null,
        assigned_by_teacher_id: row.teacher_id || '',
        created_at: row.created_at || new Date().toISOString(),
      },
    ];
  }

  const quiz: Quiz = {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    subject_id: row.subject_id || '',
    teacher_id: row.teacher_id || '',
    created_by: row.created_by || undefined,
    total_marks: Number(row.total_marks) || 0,
    duration_minutes: Number(row.duration_minutes) || 30,
    pass_percentage: Number(row.pass_percentage) || 50,
    status: ((row.status as QuizStatus) || 'published') as QuizStatus,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || undefined,
    start_date: row.start_date || undefined,
    end_date: row.end_date || undefined,
    is_active: row.is_active ?? true,
    is_deleted: row.is_deleted ?? false,
    deleted_at: row.deleted_at ?? null,
    allowed_retake_student_ids: asArray<string>(row.allowed_retake_student_ids),
  };

  return { quiz, questions, assignments };
}

/** إرسال اختبار محفوظ محلياً إلى Supabase. عند الفشل يُوضع في قائمة الانتظار. */
export async function pushQuiz(quizId: string): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'لم يتم ضبط اتصال Supabase (متغيرات البيئة)' };
  }
  const bundle = StorageService.getQuizBundle(quizId);
  if (!bundle) return { ok: false, error: 'الاختبار غير موجود محلياً' };

  try {
    const res = await upsertRow(
      'quizzes',
      quizToRow(bundle.quiz, bundle.questions, bundle.assignments)
    );
    if (res.ok) StorageService.removePendingSync('quiz', quizId);
    else StorageService.addPendingSync('quiz', quizId);
    return res;
  } catch (e: any) {
    StorageService.addPendingSync('quiz', quizId);
    return { ok: false, error: e?.message || 'تعذر الاتصال بالخادم' };
  }
}

/**
 * جلب كل الاختبارات من Supabase ودمجها محلياً.
 * - الأحدث (حسب updated_at) هو الذي يفوز.
 * - الاختبارات الموجودة محلياً فقط (قديمة) تُرفع للخادم إذا كانت تخص المستخدم الحالي.
 */
export async function pullQuizzes(currentUser: User | null): Promise<void> {
  if (!isSupabaseConfigured() || !currentUser) return;

  const { data, error } = await supabase.from('quizzes').select('*');
  if (error || !Array.isArray(data)) {
    console.warn('[sync] تعذر جلب الاختبارات:', error?.message);
    return;
  }

  const pending = new Set(StorageService.getPendingSync('quiz'));
  const remoteIds = new Set<string>();

  for (const row of data) {
    if (!row?.id) continue;
    remoteIds.add(row.id);
    if (pending.has(row.id)) continue; // النسخة المحلية أحدث وستُرفع

    const remote = rowToBundle(row);
    const local = StorageService.getQuizBundle(row.id);

    if (local) {
      const localNewer =
        time(local.quiz.updated_at) > time(remote.quiz.updated_at) && time(remote.quiz.updated_at) > 0;
      if (localNewer) {
        void pushQuiz(row.id);
        continue;
      }
      // لا نفقد الأسئلة المحلية إذا كان الصف البعيد بلا أسئلة (صفوف قديمة ناقصة)
      if (remote.questions.length === 0 && local.questions.length > 0) {
        remote.questions = local.questions;
        void pushQuiz(row.id);
      }
    }
    StorageService.saveQuizBundleFromRemote(remote.quiz, remote.questions, remote.assignments);
  }

  // اختبارات محلية غير موجودة في الخادم: نرفعها (ترحيل البيانات القديمة)
  for (const q of StorageService.getQuizzes()) {
    if (remoteIds.has(q.id)) continue;
    const isOwner =
      currentUser.role === 'admin' ||
      q.teacher_id === currentUser.id ||
      q.created_by === currentUser.id;
    if (isOwner) void pushQuiz(q.id);
  }
}

// ---------------------------------------------------------------------
// التسليمات
// ---------------------------------------------------------------------

function submissionToRow(s: Submission): Record<string, any> {
  return {
    id: s.id,
    quiz_id: s.quiz_id,
    student_id: s.student_id,
    score: s.score,
    total_possible_score: s.total_possible_score,
    percentage: s.percentage,
    answers_json: s.answers_json ?? [],
    completed_at: s.completed_at,
    status: s.status,
    time_spent_seconds: s.time_spent_seconds ?? null,
    is_retake: s.is_retake ?? false,
  };
}

function rowToSubmission(row: any): Submission {
  return {
    id: row.id,
    quiz_id: row.quiz_id,
    student_id: row.student_id,
    score: Number(row.score) || 0,
    total_possible_score: Number(row.total_possible_score) || 0,
    percentage: Number(row.percentage) || 0,
    answers_json: asArray(row.answers_json),
    completed_at: row.completed_at || row.created_at || new Date().toISOString(),
    status: (row.status as Submission['status']) || 'completed',
    time_spent_seconds: row.time_spent_seconds ?? undefined,
    is_retake: row.is_retake ?? false,
  };
}

export async function pushSubmission(submissionId: string): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'لم يتم ضبط اتصال Supabase (متغيرات البيئة)' };
  }
  const sub = StorageService.getSubmissionById(submissionId);
  if (!sub) return { ok: false, error: 'التسليم غير موجود محلياً' };

  try {
    const res = await upsertRow('submissions', submissionToRow(sub));
    if (res.ok) StorageService.removePendingSync('submission', submissionId);
    else StorageService.addPendingSync('submission', submissionId);
    return res;
  } catch (e: any) {
    StorageService.addPendingSync('submission', submissionId);
    return { ok: false, error: e?.message || 'تعذر الاتصال بالخادم' };
  }
}

export async function pullSubmissions(currentUser: User | null): Promise<void> {
  if (!isSupabaseConfigured() || !currentUser) return;

  let query = supabase.from('submissions').select('*');
  if (currentUser.role === 'student') {
    query = query.eq('student_id', currentUser.id);
  } else {
    query = query.order('completed_at', { ascending: false }).limit(5000);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    // الجدول قد لا يكون أُنشئ بعد (لم يُنفَّذ ملف SQL)
    console.warn('[sync] تعذر جلب التسليمات:', error?.message);
    return;
  }

  const pending = new Set(StorageService.getPendingSync('submission'));
  const remoteIds = new Set<string>();
  for (const row of data) {
    if (!row?.id) continue;
    remoteIds.add(row.id);
    if (pending.has(row.id)) continue;
    StorageService.saveSubmissionFromRemote(rowToSubmission(row));
  }

  // تسليمات محلية لهذا الطالب لم تصل للخادم: نرفعها
  if (currentUser.role === 'student') {
    for (const s of StorageService.getSubmissionsByStudentId(currentUser.id)) {
      if (!remoteIds.has(s.id)) void pushSubmission(s.id);
    }
  }
}

/** إعادة محاولة إرسال كل ما بقي في قائمة الانتظار */
export async function flushPending(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  for (const id of StorageService.getPendingSync('quiz')) {
    await pushQuiz(id);
  }
  for (const id of StorageService.getPendingSync('submission')) {
    await pushSubmission(id);
  }
}
