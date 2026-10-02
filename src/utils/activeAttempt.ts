/**
 * الاختبار الجاري للطالب: يُحفظ على الجهاز حتى لا يضيع شيء عند تحديث الصفحة.
 * وقت النهاية يأتي من الخادم (itqan_start_quiz) فلا يتجدد المؤقت بالتحديث.
 */
export interface ActiveAttempt {
  student_id: string;
  quiz_id: string;
  /** نهاية المحاولة بتوقيت الخادم (ميلي ثانية) */
  ends_at: number;
  /** فرق ساعة الخادم عن ساعة الجهاز (ميلي ثانية) */
  offset: number;
  started_at: number;
  answers: Record<string, number | null>;
  texts: Record<string, string>;
  flagged: Record<string, boolean>;
  index: number;
}

const KEY = 'itqan_active_attempt_v1';

const readAll = (): ActiveAttempt[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeAll = (list: ActiveAttempt[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
};

export const loadAttempt = (studentId: string, quizId: string): ActiveAttempt | null =>
  readAll().find((a) => a.student_id === studentId && a.quiz_id === quizId) || null;

export const saveAttempt = (a: ActiveAttempt) =>
  writeAll([...readAll().filter((x) => !(x.student_id === a.student_id && x.quiz_id === a.quiz_id)), a]);

export const clearAttempt = (studentId: string, quizId: string) =>
  writeAll(readAll().filter((x) => !(x.student_id === studentId && x.quiz_id === quizId)));

/** الثواني المتبقية حسب ساعة الخادم */
export const secondsLeft = (a: Pick<ActiveAttempt, 'ends_at' | 'offset'>): number =>
  Math.max(0, Math.round((a.ends_at - (Date.now() + a.offset)) / 1000));
