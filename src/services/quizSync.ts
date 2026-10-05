/**
 * مزامنة الاختبارات والتسليمات مع Supabase.
 *
 * المشكلة التي يحلها هذا الملف: كان التطبيق يحفظ الاختبارات والتسليمات في
 * localStorage داخل متصفح كل مستخدم فقط، فلا يراها الآدمن ولا أي جهاز آخر.
 * الآن Supabase هو المصدر الرئيسي، و localStorage مجرد نسخة سريعة (كاش).
 */
import { supabase, isSupabaseConfigured, getSessionToken, isMissingRpc } from './supabase';
import { canonSubjectId } from '../utils/subjectAliases';
import { StorageService, extractMissingColumn } from './storage';
import {
  Quiz,
  Question,
  QuizAssignment,
  Submission,
  QuizStatus,
  TargetType,
  User,
  QuizIntegrity,
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
    review_note: quiz.review_note ?? null,
    start_date: quiz.start_date || null,
    end_date: quiz.end_date || null,
    is_active: quiz.is_active ?? true,
    is_deleted: quiz.is_deleted ?? false,
    deleted_at: quiz.deleted_at ?? null,
    allowed_retake_student_ids: quiz.allowed_retake_student_ids ?? [],
    shuffle_questions: quiz.shuffle_questions ?? false,
    shuffle_options: quiz.shuffle_options ?? false,
    require_fullscreen: quiz.require_fullscreen ?? false,
    questions_per_student: quiz.questions_per_student || null,
    // يُرسل فقط عند وجوده، فلا يتعطل الحفظ قبل تشغيل 055
    ...(quiz.student_questions ? { student_questions: quiz.student_questions } : {}),
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

/** توحيد أسئلة صف الاختبار (معرّفات ثابتة + رقم الاختبار) */
export function normalizeQuestions(quizId: string, raw: any): Question[] {
  return asArray<Question>(raw).map((q, i) => ({
    ...q,
    id: q.id || `q-${quizId}-${i + 1}`,
    quiz_id: quizId,
  }));
}

function rowToBundle(row: any): {
  quiz: Quiz;
  questions: Question[];
  assignments: QuizAssignment[];
} {
  const questions: Question[] = normalizeQuestions(row.id, row.questions);

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
    subject_id: (canonSubjectId(row.subject_id) as string) || '',
    teacher_id: row.teacher_id || '',
    created_by: row.created_by || undefined,
    total_marks: Number(row.total_marks) || 0,
    duration_minutes: Number(row.duration_minutes) || 30,
    pass_percentage: Number(row.pass_percentage) || 50,
    status: ((row.status as QuizStatus) || 'published') as QuizStatus,
    review_note: row.review_note || undefined,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || undefined,
    start_date: row.start_date || undefined,
    end_date: row.end_date || undefined,
    is_active: row.is_active ?? true,
    is_deleted: row.is_deleted ?? false,
    deleted_at: row.deleted_at ?? null,
    allowed_retake_student_ids: asArray<string>(row.allowed_retake_student_ids),
    shuffle_questions: !!row.shuffle_questions,
    shuffle_options: !!row.shuffle_options,
    require_fullscreen: !!row.require_fullscreen,
    questions_per_student: Number(row.questions_per_student) > 0 ? Number(row.questions_per_student) : null,
    student_questions: row.student_questions && typeof row.student_questions === 'object' ? row.student_questions : null,
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
    else if (/row-level security|42501|متاح لصاحبه|متاح للمدير|باسم معلم آخر/i.test(res.error || '')) {
      // رفض صلاحيات (ليس انقطاع شبكة): لا نعيد المحاولة، ونترك نسخة الخادم تحل محل التعديل المحلي
      StorageService.removePendingSync('quiz', quizId);
      const b = StorageService.getQuizBundle(quizId);
      if (b) StorageService.saveQuizBundleFromRemote({ ...b.quiz, updated_at: '1970-01-01T00:00:00Z' }, b.questions, b.assignments);
      return { ok: false, error: 'لا تملك صلاحية تعديل هذا الاختبار (التعديل متاح لصاحبه أو للمدير)' };
    } else StorageService.addPendingSync('quiz', quizId);
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
export async function pullQuizzes(currentUser: User | null, serverRole?: string): Promise<void> {
  if (!isSupabaseConfigured() || !currentUser) return;

  // الطالب في الوضع الآمن: اختباراته فقط، والإجابات النموذجية محذوفة حتى يسلّم
  // (serverRole يمنع هذا المسار عند معاينة المدير لحساب طالب)
  if ((serverRole ?? currentUser.role) === 'student' && getSessionToken()) {
    const { data, error } = await supabase.rpc('itqan_student_quizzes');
    if (!error) {
      const rows = asArray<any>(data);
      StorageService.pruneQuizzesExcept(new Set(rows.map((r) => r.id)));
      const users = StorageService.getUsers();
      for (const row of rows) {
        const b = rowToBundle(row);
        StorageService.saveQuizBundleFromRemote(b.quiz, b.questions, b.assignments);
        // اسم المعلم فقط لعرضه على الطالب
        if (row.teacher?.id && !users.some((u) => u.id === row.teacher.id)) {
          users.push({ id: row.teacher.id, name: row.teacher.name, role: row.teacher.role, national_id: '', job_title: row.teacher.job_title ?? null } as User);
        }
      }
      localStorage.setItem('itqan_users_v2', JSON.stringify(users));
      return;
    }
    if (!isMissingRpc(error)) {
      console.warn('[sync] تعذر جلب اختبارات الطالب:', error.message);
      return;
    }
    // دوال الحماية غير موجودة بعد: نكمل بالطريقة القديمة
  }

  // ولي الأمر: اختبارات كل ابن عبر دالة المتابعة (بدون الإجابات النموذجية قبل وقتها)
  if ((serverRole ?? currentUser.role) === 'parent') {
    const keep = new Set<string>();
    const users = StorageService.getUsers();
    for (const childId of currentUser.child_ids || []) {
      const { data, error } = await supabase.rpc('itqan_child_quizzes', { p_child: childId });
      if (error) {
        console.warn('[sync] تعذر جلب اختبارات الابن:', error.message);
        return;
      }
      for (const row of asArray<any>(data)) {
        keep.add(row.id);
        const b = rowToBundle(row);
        StorageService.saveQuizBundleFromRemote(b.quiz, b.questions, b.assignments);
        if (row.teacher?.id && !users.some((u) => u.id === row.teacher.id)) {
          users.push({ id: row.teacher.id, name: row.teacher.name, role: row.teacher.role, national_id: '', job_title: row.teacher.job_title ?? null } as User);
        }
      }
    }
    StorageService.pruneQuizzesExcept(keep);
    localStorage.setItem('itqan_users_v2', JSON.stringify(users));
    return;
  }

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
    ...(s.integrity ? { integrity: s.integrity } : {}),
  };
}

export function rowToSubmission(row: any): Submission {
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
    integrity: row.integrity && typeof row.integrity === 'object' ? row.integrity : null,
  };
}

// ---------------------------------------------------------------------
// التسليم الآمن: يُرسل الطالب إجاباته فقط ويصحّحها الخادم (itqan_submit_quiz)
// ---------------------------------------------------------------------
export interface QuizAttempt {
  client_id: string;
  student_id: string;
  quiz_id: string;
  answers: any[];
  time_spent: number;
  integrity?: QuizIntegrity;
}

export type AttemptResult =
  | { kind: 'ok'; submission: Submission; questions: Question[] }
  | { kind: 'rejected'; error: string; submission?: Submission; questions?: Question[] }
  | { kind: 'offline'; error: string }
  | { kind: 'legacy' };

const ATTEMPTS_KEY = 'itqan_pending_attempts_v1';
const readAttempts = (): QuizAttempt[] => {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '[]');
  } catch {
    return [];
  }
};
const writeAttempts = (list: QuizAttempt[]) => localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(list));
export const queueAttempt = (a: QuizAttempt) =>
  writeAttempts([...readAttempts().filter((x) => x.client_id !== a.client_id), a]);
export const hasPendingAttempt = (quizId: string) => readAttempts().some((a) => a.quiz_id === quizId);

/** حفظ نتيجة الخادم محلياً مع الأسئلة الكاملة (لصفحة المراجعة) */
function storeGraded(submission: Submission, questions: Question[]) {
  StorageService.saveSubmissionFromRemote(submission);
  const bundle = StorageService.getQuizBundle(submission.quiz_id);
  if (bundle && questions.length) {
    StorageService.saveQuizBundleFromRemote(bundle.quiz, questions, bundle.assignments);
  }
}

export async function submitAttemptRemote(a: QuizAttempt): Promise<AttemptResult> {
  try {
    const args = { p_quiz_id: a.quiz_id, p_answers: a.answers, p_time_spent: a.time_spent, p_client_id: a.client_id };
    // سجل الخروج يحتاج 014؛ بدونه نسلّم بالدالة القديمة
    let { data, error } = a.integrity
      ? await supabase.rpc('itqan_submit_quiz_v2', { ...args, p_integrity: a.integrity })
      : await supabase.rpc('itqan_submit_quiz', args);
    if (error && a.integrity && isMissingRpc(error)) ({ data, error } = await supabase.rpc('itqan_submit_quiz', args));
    if (error) {
      if (isMissingRpc(error)) return { kind: 'legacy' };
      return { kind: 'offline', error: error.message };
    }
    const questions = normalizeQuestions(a.quiz_id, data?.questions);
    const submission = data?.submission ? rowToSubmission(data.submission) : undefined;
    if (data?.ok && submission) {
      storeGraded(submission, questions);
      return { kind: 'ok', submission, questions };
    }
    if (submission) storeGraded(submission, questions);
    return { kind: 'rejected', error: data?.error || 'unknown', submission, questions };
  } catch (e: any) {
    return { kind: 'offline', error: e?.message || 'تعذر الاتصال بالخادم' };
  }
}

export type StartResult =
  | { kind: 'ok'; startedAt: number; endsAt: number; offset: number }
  | { kind: 'rejected'; error: string }
  | { kind: 'offline' }
  | { kind: 'legacy' };

/** أسئلة هذا الطالب في اختبار «أسئلة مختلفة لكل طالب» (null: كل الأسئلة أو تعذّر السؤال) */
export async function servedQuestionIds(quizId: string): Promise<string[] | null> {
  if (!getSessionToken()) return null;
  try {
    const { data, error } = await supabase.rpc('itqan_served_questions', { p_quiz_id: quizId });
    if (error || !data?.ok || !Array.isArray(data.question_ids)) return null;
    return data.question_ids.map(String);
  } catch {
    return null;
  }
}

/** تسجيل بدء المحاولة على الخادم (أو استئنافها): يُرجع وقت النهاية الفعلي */
export async function startAttemptRemote(quizId: string): Promise<StartResult> {
  if (!getSessionToken()) return { kind: 'legacy' };
  try {
    const { data, error } = await supabase.rpc('itqan_start_quiz', { p_quiz_id: quizId });
    if (error) return isMissingRpc(error) ? { kind: 'legacy' } : { kind: 'offline' };
    if (!data?.ok) return { kind: 'rejected', error: data?.error || 'unknown' };
    const serverNow = new Date(data.server_now).getTime();
    return {
      kind: 'ok',
      startedAt: new Date(data.started_at).getTime(),
      endsAt: new Date(data.ends_at).getTime(),
      offset: serverNow - Date.now(),
    };
  } catch {
    return { kind: 'offline' };
  }
}

/** إعادة إرسال المحاولات التي لم تصل للخادم (انقطاع الإنترنت لحظة التسليم) */
export async function flushAttempts(me: User | null): Promise<number> {
  if (!getSessionToken() || me?.role !== 'student') return 0;
  let sent = 0;
  // محاولات هذا الطالب فقط (الجهاز قد يكون مشتركاً)
  for (const a of readAttempts().filter((x) => x.student_id === me.id)) {
    const res = await submitAttemptRemote(a);
    if (res.kind === 'offline' || res.kind === 'legacy') continue;
    writeAttempts(readAttempts().filter((x) => x.client_id !== a.client_id));
    if (res.kind === 'ok') sent++;
  }
  return sent;
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
  } else if (currentUser.role === 'parent') {
    query = query.in('student_id', currentUser.child_ids?.length ? currentUser.child_ids : ['-']);
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

  // مشاركات كانت على الخادم ثم اختفت = حذفها المدير: تُحذف من الجهاز ولا تُعاد
  const seenKey = `itqan_seen_remote_submission_ids_${currentUser.id}`;
  let seen = new Set<string>();
  try {
    seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || '[]'));
  } catch {
    /* ignore */
  }
  const complete = currentUser.role === 'student' || currentUser.role === 'parent' || data.length < 5000;
  if (complete) {
    for (const s of StorageService.getSubmissions()) {
      if (remoteIds.has(s.id) || pending.has(s.id)) continue;
      // الطاقم: الخادم هو المرجع. الطالب: نحذف فقط ما سبق أن رأيناه على الخادم
      if (currentUser.role !== 'student' || seen.has(s.id)) StorageService.removeSubmissionLocal(s.id);
    }
    localStorage.setItem(seenKey, JSON.stringify(Array.from(remoteIds)));
  }

  // تسليمات محلية لهذا الطالب لم تصل للخادم: نرفعها
  if (currentUser.role === 'student') {
    const secure = !!getSessionToken();
    for (const s of StorageService.getSubmissionsByStudentId(currentUser.id)) {
      if (remoteIds.has(s.id) || pending.has(s.id)) continue;
      if (secure) {
        // الوضع الآمن: ما لم يُرسل يكون في قائمة الانتظار؛ غير ذلك حُذف على الخادم (حذفه المدير)
        StorageService.removeSubmissionLocal(s.id);
      } else {
        void pushSubmission(s.id);
      }
    }
  }
}

/** حذف مشاركات نهائياً (المدير أو صاحب الصلاحية). يُرجع المعرّفات التي حُذفت فعلاً */
export async function deleteSubmissionsRemote(ids: string[]): Promise<{ deleted: string[]; error?: string }> {
  const deleted: string[] = [];
  let error: string | undefined;
  if (!isSupabaseConfigured()) {
    ids.forEach((id) => StorageService.removeSubmissionLocal(id));
    return { deleted: ids };
  }
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error: e } = await supabase.from('submissions').delete().in('id', chunk).select('id');
    if (e) error = e.message;
    else (data || []).forEach((r: any) => deleted.push(r.id));
  }
  deleted.forEach((id) => {
    StorageService.removeSubmissionLocal(id);
    StorageService.removePendingSync('submission', id);
  });
  return { deleted, error };
}

/** إعادة محاولة إرسال كل ما بقي في قائمة الانتظار */
export async function flushPending(me: User | null = null): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (getSessionToken()) {
    // التسليمات القديمة المعلّقة لهذا الطالب تتحول لمحاولات يصحّحها الخادم
    if (me?.role === 'student') {
      for (const id of StorageService.getPendingSync('submission')) {
        const s = StorageService.getSubmissionById(id);
        if (s && s.student_id !== me.id) continue;
        StorageService.removePendingSync('submission', id);
        if (!s) continue;
        queueAttempt({ client_id: s.id, student_id: s.student_id, quiz_id: s.quiz_id, answers: s.answers_json || [], time_spent: s.time_spent_seconds || 0 });
        StorageService.removeSubmissionLocal(s.id);
      }
    }
    await flushAttempts(me);
    // في الوضع الآمن يرفع الطاقم الاختبارات وتصحيحات المقالي المعلّقة
    if (me && me.role !== 'student' && me.role !== 'parent') {
      for (const id of StorageService.getPendingSync('quiz')) await pushQuiz(id);
      for (const id of StorageService.getPendingSync('submission')) await pushSubmission(id);
    }
    return;
  }
  for (const id of StorageService.getPendingSync('quiz')) {
    await pushQuiz(id);
  }
  for (const id of StorageService.getPendingSync('submission')) {
    await pushSubmission(id);
  }
}
