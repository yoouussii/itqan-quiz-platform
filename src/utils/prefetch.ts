import type { Role } from '../types';

// تحميل مسبق لكود الصفحات الأكثر فتحاً لكل دور، في أوقات الفراغ بعد فتح المنصة،
// فتفتح الصفحة فوراً عند الضغط بدل انتظار تنزيلها. (نفس ملفات React.lazy في App.tsx)
const STUDENT = [
  () => import('../components/student/QuizTaker'),
  () => import('../components/student/HomeworkStudentPage'),
  () => import('../components/student/MyPoints'),
  () => import('../components/common/ExamCalendar'),
  () => import('../components/common/NotificationsPage'),
  () => import('../components/student/QuizReview'),
];
const PARENT = [
  () => import('../components/common/ExamCalendar'),
  () => import('../components/common/NotificationsPage'),
  () => import('../components/student/QuizReview'),
];
const STAFF = [
  () => import('../components/analytics/AnalyticsView'),
  () => import('../components/analytics/QuizResults'),
  () => import('../components/staff/GradebookPage'),
  () => import('../components/staff/HomeworkPage'),
  () => import('../components/teacher/GradingPage'),
  () => import('../components/analytics/OutcomesPage'),
  () => import('../components/common/ExamCalendar'),
  () => import('../components/common/NotificationsPage'),
];
const TEACHER = [() => import('../components/teacher/QuizEditor'), () => import('../components/teacher/QuestionBank'), ...STAFF];
const ADMIN = [() => import('../components/admin/UsersManagement'), () => import('../components/staff/IndicatorsPage'), () => import('../components/staff/AttendancePage'), ...STAFF];

const LISTS: Record<Role, Array<() => Promise<unknown>>> = { student: STUDENT, parent: PARENT, teacher: TEACHER, supervisor: ADMIN, admin: ADMIN };

let started = false;
export function prefetchPages(role: Role) {
  if (started) return;
  // لا نحمّل مسبقاً عند توفير البيانات أو الشبكة البطيئة جداً
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType || '')) return;
  started = true;
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1200));
  const queue = [...(LISTS[role] || [])];
  // واحدة تلو الأخرى حتى لا تزاحم طلبات البيانات
  const next = () => { const load = queue.shift(); if (load) idle(() => { load().catch(() => undefined).finally(next); }); };
  setTimeout(next, 2500);
}
