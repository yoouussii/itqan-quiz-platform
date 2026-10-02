/**
 * جداول تفاصيل بطاقات المؤشرات (تظهر عند الضغط على أي بطاقة).
 * كل دالة تُرجع قسماً جاهزاً للعرض: عنوان + أعمدة + صفوف نصية.
 */
import {
  User, SchoolClass, Subject, QuizWithDetails, SubmissionWithDetails, Submission,
} from '../types';
import { describeQuizTarget } from './quizTarget';
import { formatQuizDateTime, getWindowState } from './quizWindow';
import { formatFullArabicDate } from './dateUtils';

export interface KpiSection {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  emptyText?: string;
}

const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);
const pct = (n: number) => `${Math.round(n)}%`;
const passOf = (s: Submission, quizzes: QuizWithDetails[]) => {
  const q = quizzes.find((x) => x.id === s.quiz_id);
  return (Number(s.percentage) || 0) >= (q?.pass_percentage || 50);
};
const classNameOf = (u: User, classes: SchoolClass[]) =>
  classes.find((c) => c.id === (u.class_id || u.assigned_class_ids?.[0]))?.name || 'بدون صف';

export function studentsSection(title: string, students: User[], subs: Array<Submission>, classes: SchoolClass[]): KpiSection {
  const rows = [...students]
    .sort((a, b) => classNameOf(a, classes).localeCompare(classNameOf(b, classes), 'ar') || a.name.localeCompare(b.name, 'ar'))
    .map((st) => {
      const mine = subs.filter((s) => s.student_id === st.id);
      return [st.name, st.national_id, classNameOf(st, classes), mine.length, mine.length ? pct(avg(mine.map((s) => Number(s.percentage) || 0))) : '—'];
    });
  return { title, headers: ['الطالب', 'رقم الهوية', 'الصف', 'اختبارات مؤداة', 'المتوسط'], rows, emptyText: 'لا يوجد طلاب' };
}

export function activeStudentsSection(title: string, students: User[], subs: Array<Submission>, classes: SchoolClass[], days = 7): KpiSection {
  const since = Date.now() - days * 864e5;
  const rows = students
    .map((st) => {
      const recent = subs.filter((s) => s.student_id === st.id && new Date(s.completed_at).getTime() >= since);
      const last = recent.map((s) => new Date(s.completed_at).getTime()).sort((a, b) => b - a)[0];
      return { st, count: recent.length, last };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => (b.last || 0) - (a.last || 0))
    .map((x) => [x.st.name, classNameOf(x.st, classes), x.count, formatFullArabicDate(new Date(x.last).toISOString())]);
  return { title, headers: ['الطالب', 'الصف', 'اختبارات آخر ' + days + ' أيام', 'آخر تسليم'], rows, emptyText: 'لا يوجد طلاب نشطون خلال هذه الفترة' };
}

export function inactiveStudentsSection(title: string, students: User[], subs: Array<Submission>, classes: SchoolClass[], days = 7): KpiSection {
  const since = Date.now() - days * 864e5;
  const rows = students
    .filter((st) => !subs.some((s) => s.student_id === st.id && new Date(s.completed_at).getTime() >= since))
    .map((st) => {
      const mine = subs.filter((s) => s.student_id === st.id);
      const last = mine.map((s) => new Date(s.completed_at).getTime()).sort((a, b) => b - a)[0];
      return [st.name, classNameOf(st, classes), mine.length, last ? formatFullArabicDate(new Date(last).toISOString()) : 'لم يؤدِّ أي اختبار'];
    });
  return { title, headers: ['الطالب', 'الصف', 'إجمالي اختباراته', 'آخر تسليم'], rows, emptyText: 'كل الطلاب نشطون' };
}

export function quizzesSection(
  title: string, quizzes: QuizWithDetails[], subs: Array<Submission>, subjects: Subject[], users: User[], classes: SchoolClass[]
): KpiSection {
  const rows = quizzes.map((q) => {
    const mine = subs.filter((s) => s.quiz_id === q.id);
    const state = getWindowState(q.start_date, q.end_date);
    const status = !q.is_active ? 'موقوف' : state === 'upcoming' ? 'لم يبدأ' : state === 'ended' ? 'انتهى' : 'متاح';
    return [
      q.title,
      subjects.find((s) => s.id === q.subject_id)?.name || '—',
      users.find((u) => u.id === q.teacher_id)?.name || '—',
      describeQuizTarget(q.assignments, classes),
      mine.length,
      mine.length ? pct(avg(mine.map((s) => Number(s.percentage) || 0))) : '—',
      status,
    ];
  });
  return { title, headers: ['الاختبار', 'المادة', 'المعلم', 'الفئة المستهدفة', 'التسليمات', 'المتوسط', 'الحالة'], rows, emptyText: 'لا توجد اختبارات' };
}

export function perQuizSection(title: string, quizzes: QuizWithDetails[], subs: Array<Submission>): KpiSection {
  const rows = quizzes
    .map((q) => {
      const mine = subs.filter((s) => s.quiz_id === q.id);
      return { q, mine };
    })
    .filter((x) => x.mine.length > 0)
    .map(({ q, mine }) => {
      const passed = mine.filter((s) => passOf(s, quizzes)).length;
      return [q.title, mine.length, pct(avg(mine.map((s) => Number(s.percentage) || 0))), pct((passed / mine.length) * 100)];
    });
  return { title, headers: ['الاختبار', 'التسليمات', 'متوسط النتائج', 'نسبة النجاح'], rows, emptyText: 'لا توجد تسليمات بعد' };
}

export function perSubjectSection(title: string, quizzes: QuizWithDetails[], subs: Array<Submission>, subjects: Subject[]): KpiSection {
  const rows = subjects
    .map((sub) => {
      const qs = quizzes.filter((q) => q.subject_id === sub.id);
      const ids = new Set(qs.map((q) => q.id));
      const mine = subs.filter((s) => ids.has(s.quiz_id));
      return { sub, qs, mine };
    })
    .filter((x) => x.qs.length > 0)
    .map(({ sub, qs, mine }) => {
      const passed = mine.filter((s) => passOf(s, quizzes)).length;
      return [sub.name, qs.length, mine.length, mine.length ? pct(avg(mine.map((s) => Number(s.percentage) || 0))) : '—', mine.length ? pct((passed / mine.length) * 100) : '—'];
    });
  return { title, headers: ['المادة', 'الاختبارات', 'التسليمات', 'المتوسط', 'نسبة النجاح'], rows, emptyText: 'لا توجد بيانات' };
}

export function submissionsSection(title: string, subs: SubmissionWithDetails[]): KpiSection {
  const rows = [...subs]
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .map((s) => [
      s.student?.name || '—', s.student_class?.name || '—', s.quiz?.title || '—',
      `${s.score}/${s.total_possible_score}`, pct(Number(s.percentage) || 0), formatFullArabicDate(s.completed_at),
    ]);
  return { title, headers: ['الطالب', 'الصف', 'الاختبار', 'الدرجة', 'النسبة', 'تاريخ التسليم'], rows, emptyText: 'لا توجد تسليمات' };
}

/** للطالب: اختباراته المتاحة/المخصصة مع فترة الإتاحة */
export function studentQuizzesSection(title: string, quizzes: QuizWithDetails[]): KpiSection {
  const rows = quizzes.map((q) => {
    const state = getWindowState(q.start_date, q.end_date);
    const status = q.is_active === false ? 'مغلق من المعلم' : state === 'upcoming' ? 'لم يبدأ بعد' : state === 'ended' ? 'انتهى' : 'متاح الآن';
    return [
      q.title, q.subject?.name || '—', q.teacher?.name || '—', `${q.duration_minutes} دقيقة`,
      `${formatQuizDateTime(q.start_date, 'start')} ← ${formatQuizDateTime(q.end_date, 'end')}`, status,
    ];
  });
  return { title, headers: ['الاختبار', 'المادة', 'المعلم', 'المدة', 'فترة الإتاحة', 'الحالة'], rows, emptyText: 'لا توجد اختبارات' };
}

export function studentResultsSection(title: string, subs: SubmissionWithDetails[]): KpiSection {
  const rows = [...subs]
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .map((s) => [s.quiz?.title || '—', s.subject?.name || '—', `${s.score}/${s.total_possible_score}`, pct(Number(s.percentage) || 0), formatFullArabicDate(s.completed_at)]);
  return { title, headers: ['الاختبار', 'المادة', 'الدرجة', 'النسبة', 'التاريخ'], rows, emptyText: 'لا توجد نتائج بعد' };
}

export function studentSubjectsSection(title: string, subs: SubmissionWithDetails[]): KpiSection {
  const map = new Map<string, number[]>();
  subs.forEach((s) => {
    const k = s.subject?.name || 'مادة عامة';
    map.set(k, [...(map.get(k) || []), Number(s.percentage) || 0]);
  });
  const rows = Array.from(map.entries()).map(([name, arr]) => [name, arr.length, pct(avg(arr)), pct(Math.max(...arr))]);
  return { title, headers: ['المادة', 'عدد الاختبارات', 'المتوسط', 'أعلى نسبة'], rows, emptyText: 'لا توجد نتائج بعد' };
}

export function topResultsSection(title: string, subs: SubmissionWithDetails[], n = 5): KpiSection {
  const rows = [...subs]
    .sort((a, b) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0))
    .slice(0, n)
    .map((s) => [s.quiz?.title || '—', s.subject?.name || '—', pct(Number(s.percentage) || 0), formatFullArabicDate(s.completed_at)]);
  return { title, headers: ['الاختبار', 'المادة', 'النسبة', 'التاريخ'], rows, emptyText: 'لا توجد نتائج بعد' };
}
