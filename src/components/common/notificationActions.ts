import { AppNotification, NotifAudience } from '../../services/notificationService';
import { QuizWithDetails, SchoolClass, SubmissionWithDetails, User } from '../../types';
import { getWindowState } from '../../utils/quizWindow';

/** سطر من نص الإشعار: «العنوان: القيمة» أو نص حر */
export interface NotifLine {
  label?: string;
  value: string;
}

/**
 * تقسيم نص الإشعار لأسطر مرتبة. الإشعارات الجديدة تُكتب سطراً لكل معلومة،
 * والقديمة كانت مفصولة بـ « • » فنقسمها بنفس الطريقة.
 */
export function notifLines(body: string): NotifLine[] {
  return (body || '')
    .split(/\n| • /)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:：]{1,20})[:：]\s*(.+)$/);
      return m ? { label: m[1].trim(), value: m[2].trim() } : { value: l };
    });
}

export interface NotifAction {
  label: string;
  /** الصفحة المطلوبة + الاختبار/التسليم النشط */
  view: string;
  quizId?: string | null;
  submissionId?: string | null;
  /** رسالة بدلاً من الانتقال (مثلاً: الاختبار لم يبدأ بعد) */
  notice?: string;
}

/** ماذا يحدث عند الضغط على الإشعار، حسب نوعه ودور المستخدم */
export function notifAction(
  n: AppNotification,
  me: User,
  quizzes: QuizWithDetails[],
  submissions: SubmissionWithDetails[]
): NotifAction | null {
  const quiz = n.ref_type === 'quiz' && n.ref_id ? quizzes.find((q) => q.id === n.ref_id) : undefined;

  if (n.type === 'award') {
    if (me.role === 'parent') return { label: 'متابعة أبنائي', view: 'dashboard' };
    return me.role === 'student' ? { label: 'عرض نقاطي وجوائزي', view: 'my_points' } : null;
  }
  if (n.type === 'quiz_pending') return { label: 'مراجعة الاختبار', view: 'approvals' };
  if (n.ref_type === 'survey') return { label: 'الإجابة على الاستبيان', view: 'surveys' };
  if (n.ref_type === 'visit') return { label: 'عرض الزيارة', view: 'visits' };

  if (me.role === 'parent') return { label: 'متابعة أبنائي', view: 'dashboard' };

  if (!quiz) {
    if (n.type === 'quiz_published' || n.type === 'retake_granted' || n.type === 'quiz_reminder') {
      return { label: 'فتح اختباراتي', view: 'dashboard', notice: 'الاختبار لم يعد متاحاً أو حُذف' };
    }
    return null;
  }

  if (me.role !== 'student') return { label: 'معاينة الاختبار', view: 'quiz_preview', quizId: quiz.id };

  const mine = submissions
    .filter((s) => s.quiz_id === quiz.id && s.student_id === me.id)
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0];
  const canRetake = !!quiz.allowed_retake_student_ids?.includes(me.id);
  if (mine && !canRetake) return { label: 'عرض نتيجتي', view: 'quiz_review', submissionId: mine.id };

  const state = getWindowState(quiz.start_date, quiz.end_date);
  if (!quiz.is_active || state === 'ended') {
    return { label: 'فتح اختباراتي', view: 'dashboard', notice: 'انتهى وقت إتاحة هذا الاختبار' };
  }
  if (state === 'upcoming') {
    return { label: 'فتح اختباراتي', view: 'dashboard', notice: 'لم يبدأ وقت هذا الاختبار بعد' };
  }
  return { label: canRetake ? 'إعادة الاختبار' : 'ابدأ الاختبار', view: 'take_quiz', quizId: quiz.id };
}

const ROLE_AR: Record<string, string> = { student: 'الطلاب', teacher: 'المعلمون', supervisor: 'المشرفون', admin: 'المدير' };

/** وصف مختصر لمستلمي الإشعار (لصفحة إدارة الإشعارات) */
export function describeAudience(a: NotifAudience, classes: SchoolClass[], users: User[]): string {
  const parts: string[] = [];
  if (a.all) parts.push(a.roles?.length ? a.roles.map((r) => ROLE_AR[r] || r).join(' و') : 'الجميع');
  else if (a.roles?.length && !a.class_ids?.length && !a.student_ids?.length) parts.push(a.roles.map((r) => ROLE_AR[r] || r).join(' و'));
  if (a.class_ids?.length) parts.push(a.class_ids.map((id) => classes.find((c) => c.id === id)?.name || 'صف').join('، '));
  const people = [...(a.student_ids || []), ...(a.user_ids || [])];
  if (people.length) {
    const names = people.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean) as string[];
    parts.push(names.length && names.length <= 3 ? names.join('، ') : `${people.length} مستخدم`);
  }
  return parts.join(' + ') || '—';
}

/** هل الإشعار موجّه للطلاب (لإجراء «حذف كل إشعارات الطلاب») */
export const isStudentAudience = (a: NotifAudience) =>
  !!(a.class_ids?.length || a.student_ids?.length || a.roles?.includes('student') || (a.all && !a.roles?.length));
