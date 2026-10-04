import { User } from '../types';

export interface PermDef {
  key: string;
  label: string; // يظهر في نافذة المستخدم
  short: string; // يظهر كشارة في جدول المستخدمين
  group: string;
}

/**
 * كل الصلاحيات المتاحة. تُمنح لأي معلم أو مشرف من نافذة المستخدم.
 * مدير النظام يملكها جميعاً تلقائياً.
 */
export const PERMISSION_DEFS: PermDef[] = [
  { key: 'can_add_students', label: 'صلاحية إضافة طلاب جدد', short: 'إضافة طلاب', group: 'الإدارة والتسجيل' },
  { key: 'can_add_teachers', label: 'صلاحية إضافة معلمين', short: 'إضافة معلمين', group: 'الإدارة والتسجيل' },
  { key: 'can_add_custom_subjects', label: 'صلاحية إضافة مواد دراسية', short: 'إضافة مواد', group: 'الإدارة والتسجيل' },
  { key: 'can_manage_classes', label: 'صلاحية إدارة الفصول', short: 'إدارة فصول', group: 'الإدارة والتسجيل' },

  { key: 'can_view_all_reports', label: 'صلاحية عرض جميع التقارير', short: 'تقارير عامة', group: 'التقارير والتحليل' },
  { key: 'can_view_insights', label: 'المؤشرات المتقدمة: المشاركة، المتابعة، الأوائل، أداء الصفوف', short: 'مؤشرات متقدمة', group: 'التقارير والتحليل' },
  { key: 'can_view_teachers_performance', label: 'عرض أداء المعلمين ضمن نطاقه', short: 'أداء المعلمين', group: 'التقارير والتحليل' },
  { key: 'can_view_question_analysis', label: 'تحليل أسئلة الاختبارات (الأصعب والأسهل)', short: 'تحليل الأسئلة', group: 'التقارير والتحليل' },
  { key: 'can_view_branch_comparison', label: 'مقارنة أداء الفروع والمدارس', short: 'مقارنة الفروع', group: 'التقارير والتحليل' },
  { key: 'can_export_reports', label: 'تصدير التقارير وكشوف الدرجات CSV / PDF', short: 'تصدير', group: 'التقارير والتحليل' },

  { key: 'can_approve_quizzes', label: 'اعتماد الاختبارات قبل نشرها للطلاب', short: 'اعتماد الاختبارات', group: 'الاختبارات' },
  { key: 'can_manage_retakes', label: 'منح الطلاب إعادة محاولة', short: 'إعادة محاولات', group: 'الاختبارات' },
  { key: 'can_delete_submissions', label: 'حذف مشاركات (نتائج) الطلاب', short: 'حذف مشاركات', group: 'الاختبارات' },
  { key: 'can_grade_essays', label: 'تصحيح الإجابات المقالية في كل الاختبارات ضمن نطاقه (المعلم يصحح اختباراته دائماً)', short: 'تصحيح', group: 'الاختبارات' },

  { key: 'can_send_announcements', label: 'إرسال إعلانات وإشعارات للطلاب', short: 'إعلانات', group: 'التفاعل والتحفيز' },
  { key: 'can_view_leaderboard', label: 'لوحة المتصدرين ونقاط الطلاب', short: 'المتصدرون', group: 'التفاعل والتحفيز' },
  { key: 'can_award_badges', label: 'منح الأوسمة والجوائز للطلاب', short: 'منح جوائز', group: 'التفاعل والتحفيز' },

  { key: 'can_view_attendance', label: 'عرض لوحة الحضور والغياب والتأخر', short: 'عرض الحضور', group: 'الحضور' },
  { key: 'can_manage_attendance', label: 'إدارة الحضور: استيراد سجل الغياب والتسجيل والربط مع Google Sheets', short: 'إدارة الحضور', group: 'الحضور' },

  { key: 'can_view_behavior', label: 'عرض السلوك والمواظبة ودرجات الطلاب', short: 'عرض السلوك', group: 'السلوك والمواظبة' },
  { key: 'can_record_behavior', label: 'تسجيل المخالفات والسلوك الإيجابي للطلاب', short: 'تسجيل السلوك', group: 'السلوك والمواظبة' },

  { key: 'can_view_activity_log', label: 'عرض سجل النشاط', short: 'سجل النشاط', group: 'النظام' },
  { key: 'can_access_preparations', label: 'رابط متابعة تحضير مزن', short: 'تحضير مزن', group: 'النظام' },
];

export const PERM_KEYS: string[] = PERMISSION_DEFS.map((d) => d.key);
export const PERM_GROUPS: string[] = Array.from(new Set(PERMISSION_DEFS.map((d) => d.group)));

export const normalizePerms = (src: any): Record<string, boolean> =>
  Object.fromEntries(PERM_KEYS.map((k) => [k, !!src?.[k]]));

/** صلاحيات كان يملكها المعلم دائماً قبل نظام الصلاحيات (حفاظاً على السلوك القديم) */
export const TEACHER_ALWAYS = new Set(['can_export_reports', 'can_manage_retakes']);
/** صلاحيات يملكها المشرف افتراضياً */
const SUPERVISOR_DEFAULT = new Set(['can_access_preparations']);

export function hasPerm(user: User | null | undefined, key: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true; // المدير يملك كل شيء تلقائياً
  if (user.role === 'student' || user.role === 'parent') return false;
  const perms: any = user.teacher_permissions || (user as any).permissions || {};
  if (perms[key]) return true;
  if (user.role === 'teacher' && TEACHER_ALWAYS.has(key)) return true;
  if (user.role === 'supervisor' && SUPERVISOR_DEFAULT.has(key)) return true;
  return false;
}
