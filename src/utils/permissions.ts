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
  { key: 'can_note_attendance', label: 'تسجيل ملاحظات على الغياب والتأخر والاستئذان', short: 'ملاحظات الحضور', group: 'الحضور' },

  { key: 'can_view_behavior', label: 'عرض السلوك والمواظبة ودرجات الطلاب', short: 'عرض السلوك', group: 'السلوك والمواظبة' },
  { key: 'can_record_behavior', label: 'تسجيل المخالفات والسلوك الإيجابي للطلاب', short: 'تسجيل السلوك', group: 'السلوك والمواظبة' },

  { key: 'can_academic_support', label: 'معلم دعم أكاديمي: يضيف الطلاب المحتاجين ويسجل مستواهم وملاحظاته (المشرف يرى الكل)', short: 'الدعم الأكاديمي', group: 'الدعم الأكاديمي' },

  { key: 'can_view_class_records', label: 'عرض سجلات المتابعة الصفية وتتبع مستويات الطلاب (من Drive)', short: 'عرض السجلات', group: 'سجلات المتابعة' },
  { key: 'can_manage_class_records', label: 'إدارة سجلات المتابعة: ربط مجلدات Drive ورفع الملفات وحذفها', short: 'إدارة السجلات', group: 'سجلات المتابعة' },

  { key: 'can_class_visits', label: 'تنفيذ الزيارات الصفية وتقييم المعلمين (مفعّلة للمشرف تلقائياً)', short: 'الزيارات الصفية', group: 'الإشراف والجودة' },
  { key: 'can_manage_surveys', label: 'إنشاء الاستبيانات وعرض نتائجها', short: 'الاستبيانات', group: 'الإشراف والجودة' },

  { key: 'can_view_activity_log', label: 'عرض سجل النشاط', short: 'سجل النشاط', group: 'النظام' },
  { key: 'can_access_preparations', label: 'رابط متابعة تحضير مزن', short: 'تحضير مزن', group: 'النظام' },
];

export const PERM_KEYS: string[] = PERMISSION_DEFS.map((d) => d.key);
export const PERM_GROUPS: string[] = Array.from(new Set(PERMISSION_DEFS.map((d) => d.group)));

export const normalizePerms = (src: any): Record<string, boolean | string[]> => {
  const out: Record<string, boolean | string[]> = Object.fromEntries(PERM_KEYS.map((k) => [k, !!src?.[k]]));
  // الأقسام والصفحات الظاهرة تُحفظ مع الصلاحيات
  if (Array.isArray(src?.tracks)) out.tracks = src.tracks.filter((x: unknown) => typeof x === 'string');
  if (Array.isArray(src?.pages)) out.pages = src.pages.filter((x: unknown) => typeof x === 'string');
  return out;
};

// ---------------------------------------------------------------------
// أقسام المعلم والصفحات الظاهرة له
// ---------------------------------------------------------------------
export type Track = 'nafes' | 'school' | 'support';
export const TRACKS: Array<{ k: Track; label: string; hint: string }> = [
  { k: 'nafes', label: 'نافس', hint: 'الاختبارات وبنك الأسئلة والتصحيح ونواتج التعلم والنتائج' },
  { k: 'school', label: 'المدرسة', hint: 'الواجبات وكشف الدرجات والحضور والسلوك والزيارات' },
  { k: 'support', label: 'الدعم الأكاديمي', hint: 'طلاب الدعم وقياساتهم وتقاريرهم' },
];
/** صفحات القائمة التي يمكن إظهارها/إخفاؤها للمعلم، والأقسام التي تتبعها */
export const PAGE_DEFS: Array<{ id: string; label: string; tracks: Track[] }> = [
  { id: 'create_quiz', label: 'اختبار جديد', tracks: ['nafes'] },
  { id: 'approvals', label: 'بانتظار الاعتماد', tracks: ['nafes'] },
  { id: 'grading', label: 'التصحيح', tracks: ['nafes'] },
  { id: 'question_bank', label: 'بنك الأسئلة', tracks: ['nafes'] },
  { id: 'outcomes', label: 'نواتج التعلم', tracks: ['nafes'] },
  { id: 'remedial', label: 'الخطط العلاجية', tracks: ['nafes', 'support'] },
  { id: 'calendar', label: 'جدول الاختبارات', tracks: ['nafes', 'school'] },
  { id: 'analytics', label: 'نتائج الطلاب', tracks: ['nafes', 'support'] },
  { id: 'reports', label: 'التقارير الشاملة', tracks: ['nafes'] },
  { id: 'leaderboard', label: 'لوحة الشرف', tracks: ['nafes', 'school'] },
  { id: 'certificates', label: 'الشهادات', tracks: ['nafes', 'school'] },
  { id: 'homework', label: 'الواجبات', tracks: ['school'] },
  { id: 'gradebook', label: 'كشف الدرجات', tracks: ['school'] },
  { id: 'attendance', label: 'الحضور والغياب', tracks: ['school'] },
  { id: 'behavior', label: 'السلوك والمواظبة', tracks: ['school'] },
  { id: 'visits', label: 'الزيارات الصفية', tracks: ['school'] },
  { id: 'class_records', label: 'سجلات المتابعة', tracks: ['school'] },
  { id: 'surveys', label: 'الاستبيانات', tracks: ['school'] },
  { id: 'academic_support', label: 'الدعم الأكاديمي', tracks: ['support'] },
  { id: 'portfolio', label: 'ملف الإنجاز', tracks: ['nafes', 'school', 'support'] },
  { id: 'users_management', label: 'المستخدمون', tracks: ['school'] },
  { id: 'subjects_classes', label: 'المواد والفصول', tracks: ['school'] },
  { id: 'activity_log', label: 'سجل النشاط', tracks: ['school'] },
  { id: 'preparations', label: 'متابعة تحضير مزن', tracks: ['school'] },
];
const PAGE_IDS = new Set(PAGE_DEFS.map((p) => p.id));
/** صفحات القسم/الأقسام */
export const pagesForTracks = (tracks: string[]) => PAGE_DEFS.filter((p) => p.tracks.some((t) => tracks.includes(t))).map((p) => p.id);

/** هل تظهر الصفحة للمستخدم؟ (المدير وكل من بلا قائمة صفحات: نعم؛ والرئيسية والإشعارات دائماً) */
export function pageAllowed(user: User | null | undefined, id: string): boolean {
  if (!user || user.role === 'admin') return true;
  const pages = (user.teacher_permissions as any)?.pages ?? (user as any).permissions?.pages;
  if (!Array.isArray(pages) || !PAGE_IDS.has(id)) return true;
  return pages.includes(id);
}

/** صلاحيات كان يملكها المعلم دائماً قبل نظام الصلاحيات (حفاظاً على السلوك القديم) */
export const TEACHER_ALWAYS = new Set(['can_export_reports', 'can_manage_retakes']);
/** صلاحيات يملكها المشرف افتراضياً */
const SUPERVISOR_DEFAULT = new Set(['can_access_preparations', 'can_class_visits']);

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
