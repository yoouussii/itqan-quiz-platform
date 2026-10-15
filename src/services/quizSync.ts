/**
 * مزامنة الاختبارات والتسليمات مع Supabase.
 *
 * المشكلة التي يحلها هذا الملف: كان التطبيق يحفظ الاختبارات والتسليمات في
 * localStorage داخل متصفح كل مستخدم فقط، فلا يراها الآدمن ولا أي جهاز آخر.
 * الآن Supabase هو المصدر الرئيسي، و localStorage مجرد نسخة سريعة (كاش).
 */
import { supabase, isSupabaseConfigured, getSessionToken, isMissingRpc } from './supabase';
import { externalizeQuestions, uploadImage } from '../utils/quizMedia';
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
import { setOldUngraded } from './ungradedOld';

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
    // الورقة الأصلية تُرسل عند وجودها فقط (حتى لا يتعطل الحفظ قبل تشغيل 061)، وتُحذف بـ null صراحةً
    ...(quiz.paper !== undefined ? { paper: quiz.paper } : {}),
    ...(quiz.nafes !== undefined ? { nafes: quiz.nafes } : {}),
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
    paper: row.paper && Array.isArray(row.paper.pages) && row.paper.pages.length ? row.paper : null,
    nafes: row.nafes && row.nafes.subject ? row.nafes : null,
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
    // صور الأسئلة تُرفع وتُستبدل بروابط قصيرة، فيبقى الاختبار خفيفاً في التحميل
    const media = await externalizeQuestions(bundle.questions);
    // صفحات الورقة الأصلية كذلك
    if (bundle.quiz.paper?.pages?.some((p) => p.startsWith('data:'))) {
      const pages = await Promise.all(bundle.quiz.paper.pages.map((p) => (p.startsWith('data:') ? uploadImage(p).then((r) => r || p) : p)));
      bundle.quiz = { ...bundle.quiz, paper: { ...bundle.quiz.paper, pages } };
      media.changed = true;
    }
    if (media.changed) {
      bundle.questions = media.questions;
      StorageService.saveQuizBundleFromRemote(bundle.quiz, bundle.questions, bundle.assignments);
    }
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
    // إجابات لم تُحمَّل بعد على هذا الجهاز: لا نرسل قائمة فارغة فوق الإجابات الحقيقية
    ...(s.answers_pending ? {} : { answers_json: s.answers_json ?? [] }),
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
    ...(row.updated_at ? { updated_at: row.updated_at } : {}),
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

/** بعد تعديل الإجابات المقبولة في «أكمل الفراغ»: إعادة تصحيحها في تسليمات الاختبار على الخادم (070) */
export async function regradeBlanks(quizId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data, error } = await supabase.rpc('itqan_regrade_blanks', { p_quiz_id: quizId });
  if (error) {
    if (!isMissingRpc(error)) console.warn('[sync] تعذرت إعادة تصحيح الفراغات:', error.message);
    return 0;
  }
  return data?.ok ? Number(data.updated) || 0 : 0;
}

/** «اعتبرها صحيحة»: إضافة إجابة طالب للإجابات المقبولة وإعادة تصحيح التسليمات (070) */
export async function acceptBlank(quizId: string, questionId: string, answer: string): Promise<{ ok: boolean; updated: number; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, updated: 0, error: 'not_configured' };
  const { data, error } = await supabase.rpc('itqan_accept_blank', { p_quiz_id: quizId, p_question_id: questionId, p_answer: answer });
  if (error) return { ok: false, updated: 0, error: isMissingRpc(error) ? 'missing' : error.message };
  return { ok: !!data?.ok, updated: Number(data?.updated) || 0, error: data?.error };
}

// ---- تحميل التسليمات بالفرق (079) ----
// أول مرة (أو كل 24 ساعة): تحميل كامل. بعدها كل دقيقتين: ما تغيّر منذ آخر مرة فقط + معرّفات ما حُذف.
// للطاقم: إجابات التسليمات الأقدم من 30 يوماً لا تُحمَّل في التحميل الكامل؛ تُجلب عند الحاجة (ensureAnswers).
const SUB_LIGHT_COLS = 'id,quiz_id,student_id,score,total_possible_score,percentage,completed_at,status,time_spent_seconds,is_retake,integrity,updated_at';
const RECENT_ANSWER_DAYS = 30;
const FULL_SYNC_EVERY_MS = 24 * 3600_000;
const DELTA_OVERLAP_MS = 2 * 60_000;
const DELTA_MAX = 1000;
const STAFF_MAX = 5000;
/** null = لم نعرف بعد، false = 079 لم يُشغَّل (تحميل كامل كالسابق) */
let deltaSupported: boolean | null = null;

interface SubCursor { at: string; full: number; v: 1 }
const cursorKey = (uid: string) => `itqan_sub_cursor_${uid}`;
function readCursor(uid: string): SubCursor | null {
  try {
    const c = JSON.parse(localStorage.getItem(cursorKey(uid)) || 'null');
    return c && c.v === 1 && typeof c.at === 'string' ? c : null;
  } catch {
    return null;
  }
}
function writeCursor(uid: string, c: SubCursor | null) {
  try {
    if (c) localStorage.setItem(cursorKey(uid), JSON.stringify(c));
    else localStorage.removeItem(cursorKey(uid));
  } catch { /* ignore */ }
}
const maxUpdated = (rows: any[], start = '1970-01-01T00:00:00Z') =>
  rows.reduce((m, r) => (r?.updated_at && Date.parse(r.updated_at) > Date.parse(m) ? r.updated_at : m), start);
const isMissingUpdatedAt = (e: any) => /updated_at/.test(e?.message || '') && /(column|does not exist|schema cache)/i.test(e?.message || '');

function scoped(q: any, user: User) {
  if (user.role === 'student') return q.eq('student_id', user.id);
  if (user.role === 'parent') return q.in('student_id', user.child_ids?.length ? user.child_ids : ['-']);
  return q;
}

/** صف خفيف (بلا إجابات): نُبقي إجابات النسخة المحلية إن لم يتغيّر التسليم */
function lightToSubmission(row: any, local?: Submission): Submission {
  const sub = rowToSubmission(row);
  if (local && !local.answers_pending && local.answers_json?.length && local.updated_at && local.updated_at === row.updated_at) {
    return { ...sub, answers_json: local.answers_json };
  }
  return { ...sub, answers_json: [], answers_pending: true };
}

export async function pullSubmissions(currentUser: User | null, opts: { full?: boolean } = {}): Promise<void> {
  if (!isSupabaseConfigured() || !currentUser) return;
  const cursor = readCursor(currentUser.id);
  const pending = new Set(StorageService.getPendingSync('submission'));

  // ---- بالفرق ----
  if (!opts.full && deltaSupported !== false && cursor && Date.now() - cursor.full < FULL_SYNC_EVERY_MS) {
    const since = new Date(Date.parse(cursor.at) - DELTA_OVERLAP_MS).toISOString();
    const { data, error } = await scoped(supabase.from('submissions').select('*').gt('updated_at', since), currentUser)
      .order('updated_at', { ascending: true }).limit(DELTA_MAX);
    if (error && isMissingUpdatedAt(error)) {
      deltaSupported = false;
    } else if (error || !Array.isArray(data)) {
      console.warn('[sync] تعذر جلب التسليمات:', error?.message);
      return;
    } else if (data.length < DELTA_MAX) {
      deltaSupported = true;
      const del = await supabase.rpc('itqan_deleted_submissions', { p_since: since });
      const removed = (Array.isArray(del.data) ? (del.data as string[]) : []).filter((id) => !pending.has(id));
      const rows = data.filter((r: any) => r?.id && !pending.has(r.id)).map(rowToSubmission);
      if (rows.length || removed.length) {
        const ok = StorageService.mergeSubmissionsFromRemote(rows, removed);
        // لم تُحفظ على الجهاز (المساحة ممتلئة): المرة القادمة تحميل كامل
        if (!ok) return writeCursor(currentUser.id, null);
      }
      writeCursor(currentUser.id, { ...cursor, at: maxUpdated(data, cursor.at) });
      return;
    }
    // تغييرات كثيرة جداً أو 079 غير موجود: تحميل كامل
  }

  // ---- تحميل كامل ----
  let data: any[] = [];
  let complete = true;
  const staff = currentUser.role !== 'student' && currentUser.role !== 'parent';
  if (staff && deltaSupported !== false) {
    const cutoff = new Date(Date.now() - RECENT_ANSWER_DAYS * 86400_000).toISOString();
    const recent = await supabase.from('submissions').select('*').gte('updated_at', cutoff).order('updated_at', { ascending: false }).limit(STAFF_MAX);
    if (recent.error && isMissingUpdatedAt(recent.error)) {
      deltaSupported = false;
    } else if (recent.error || !Array.isArray(recent.data)) {
      console.warn('[sync] تعذر جلب التسليمات:', recent.error?.message);
      return;
    } else {
      const older = await supabase.from('submissions').select(SUB_LIGHT_COLS).lt('updated_at', cutoff).order('completed_at', { ascending: false }).limit(STAFF_MAX);
      if (older.error || !Array.isArray(older.data)) {
        console.warn('[sync] تعذر جلب التسليمات:', older.error?.message);
        return;
      }
      deltaSupported = true;
      // عدد المقالات غير المصححة في التسليمات القديمة (081) — لعدّاد «التصحيح»
      const old = await supabase.rpc('itqan_ungraded_old', { p_before: cutoff });
      if (!old.error && old.data && typeof old.data === 'object') setOldUngraded(old.data as Record<string, number>);
      const local = new Map(StorageService.getSubmissions().map((x) => [x.id, x] as const));
      complete = recent.data.length < STAFF_MAX && older.data.length < STAFF_MAX;
      data = recent.data;
      const light = older.data.filter((r: any) => r?.id && !pending.has(r.id)).map((r: any) => lightToSubmission(r, local.get(r.id)));
      return finishFull(currentUser, [...recent.data.filter((r: any) => r?.id && !pending.has(r.id)).map(rowToSubmission), ...light],
        [...recent.data, ...older.data], complete, pending);
    }
  }
  const plain = () => {
    const q = scoped(supabase.from('submissions').select('*'), currentUser);
    return staff ? q.order('completed_at', { ascending: false }).limit(STAFF_MAX) : q;
  };
  let res: any;
  if (!staff && deltaSupported !== false) {
    // الطالب وولي الأمر: نرتّب بوقت التعديل لنعرف هل 079 موجود (حتى لو لم توجد تسليمات بعد)
    res = await scoped(supabase.from('submissions').select('*'), currentUser).order('updated_at', { ascending: false });
    if (res.error && isMissingUpdatedAt(res.error)) {
      deltaSupported = false;
      res = await plain();
    } else if (!res.error) deltaSupported = true;
  } else res = await plain();
  if (res.error || !Array.isArray(res.data)) {
    // الجدول قد لا يكون أُنشئ بعد (لم يُنفَّذ ملف SQL)
    console.warn('[sync] تعذر جلب التسليمات:', res.error?.message);
    return;
  }
  data = res.data;
  complete = !staff || data.length < STAFF_MAX;
  return finishFull(currentUser, data.filter((r: any) => r?.id && !pending.has(r.id)).map(rowToSubmission), data, complete, pending);
}

/** بعد التحميل الكامل: دمج بكتابة واحدة، وحذف ما اختفى من الخادم، ورفع ما لم يصل */
function finishFull(currentUser: User, subs: Submission[], rawRows: any[], complete: boolean, pending: Set<string>) {
  const remoteIds = new Set<string>(rawRows.filter((r) => r?.id).map((r) => r.id));
  // مشاركات كانت على الخادم ثم اختفت = حذفها المدير: تُحذف من الجهاز ولا تُعاد
  const seenKey = `itqan_seen_remote_submission_ids_${currentUser.id}`;
  let seen = new Set<string>();
  try {
    seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || '[]'));
  } catch {
    /* ignore */
  }
  const removed: string[] = [];
  const secure = !!getSessionToken();
  const toPush: string[] = [];
  if (complete) {
    for (const s of StorageService.getSubmissions()) {
      if (remoteIds.has(s.id) || pending.has(s.id)) continue;
      // الطاقم: الخادم هو المرجع. الطالب: نحذف فقط ما سبق أن رأيناه على الخادم
      if (currentUser.role !== 'student' || seen.has(s.id)) removed.push(s.id);
      // تسليمات محلية لهذا الطالب لم تصل للخادم
      else if (s.student_id === currentUser.id) {
        // الوضع الآمن: ما لم يُرسل يكون في قائمة الانتظار؛ غير ذلك حُذف على الخادم (حذفه المدير)
        if (secure) removed.push(s.id);
        else toPush.push(s.id);
      }
    }
    try {
      localStorage.setItem(seenKey, JSON.stringify(Array.from(remoteIds)));
    } catch { /* ignore */ }
  }
  const ok = StorageService.mergeSubmissionsFromRemote(subs, removed);
  toPush.forEach((id) => void pushSubmission(id));
  if (deltaSupported) writeCursor(currentUser.id, ok ? { at: maxUpdated(rawRows), full: Date.now(), v: 1 } : null);
}

/** جلب إجابات التسليمات التي لم تُحمَّل إجاباتها بعد (الأقدم من 30 يوماً للطاقم) */
let answersInflight: Promise<number> | null = null;
export function ensureAnswers(filter?: (s: Submission) => boolean): Promise<number> {
  if (!isSupabaseConfigured()) return Promise.resolve(0);
  const missing = StorageService.getSubmissions().filter((s) => s.answers_pending && (!filter || filter(s)));
  if (!missing.length) return answersInflight || Promise.resolve(0);
  const run = async (prev: Promise<number> | null) => {
    if (prev) await prev.catch(() => 0);
    const still = StorageService.getSubmissions().filter((s) => s.answers_pending && (!filter || filter(s)));
    let n = 0;
    for (let i = 0; i < still.length; i += 200) {
      const chunk = still.slice(i, i + 200);
      const { data, error } = await supabase.from('submissions').select('*').in('id', chunk.map((s) => s.id));
      if (error || !Array.isArray(data)) break;
      StorageService.mergeSubmissionsFromRemote(data.map(rowToSubmission));
      n += data.length;
    }
    return n;
  };
  const p = run(answersInflight).finally(() => { if (answersInflight === p) answersInflight = null; });
  answersInflight = p;
  return p;
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
