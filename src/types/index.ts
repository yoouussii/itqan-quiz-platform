export type Role = 'admin' | 'teacher' | 'student' | 'supervisor' | 'parent';
export type Gender = 'male' | 'female';

export interface TeacherPermissions {
  can_add_custom_subjects?: boolean;
  can_manage_classes?: boolean;
  can_view_all_reports?: boolean;
  can_add_students?: boolean;
  can_add_teachers?: boolean;
  /** للمشرف: عرض أداء المعلمين */
  can_view_teachers_performance?: boolean;
  /** للمشرف: تصدير التقارير (CSV / PDF) */
  can_export_reports?: boolean;
  /** للمشرف: منح الطلاب إعادة محاولة الاختبار */
  can_manage_retakes?: boolean;
  [key: string]: boolean | undefined;
}

export interface User {
  id: string;
  national_id: string;
  name: string;
  role: Role;
  /** مسمى وظيفي نصي حر للعرض فقط (لا يغيّر الصلاحيات) */
  job_title?: string | null;
  password?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;      // 👈 تم إضافتها لإنهاء خطأ TS2551
  email?: string | null;           // 👈 تم إضافتها لإنهاء خطأ TS2339
  username?: string | null;        // 👈 لدعم حقل اسم المستخدم

  // قبول null أو undefined لإنهاء أخطاء TS2322
  class_id?: string | null;
  specialty_id?: string | null;
  assigned_subject_ids?: string[];
  assigned_class_ids?: string[];

  teacher_permissions?: TeacherPermissions;
  permissions?: TeacherPermissions;

  /** فرع المدرسة (يحدده المدير). المعلم/المشرف المسند لفرع يرى فرعه فقط */
  branch_id?: string | null;
  gender?: Gender | null;
  /** لولي الأمر: معرّفات أبنائه */
  child_ids?: string[];
}

export interface Branch {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon identifier
  color: string; // hex or color token
  code: string;
  created_by?: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  grade_level: string;
  student_count?: number;
  created_by?: string;
  branch_id?: string | null;
}

export type QuizStatus = 'published' | 'draft' | 'archived' | 'pending_approval' | 'rejected';

export interface Quiz {
  id: string;
  title: string;
  description: string;
  subject_id: string;
  teacher_id: string;
  created_by?: string;
  total_marks: number;
  duration_minutes: number;
  pass_percentage: number;
  status: QuizStatus;
  /** سبب الرفض عند اعتماد الاختبارات */
  review_note?: string;
  created_at: string;
  updated_at?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  allowed_retake_student_ids?: string[];
  /** الحد من الغش: ترتيب مختلف للأسئلة لكل طالب */
  shuffle_questions?: boolean;
  /** ترتيب مختلف لاختيارات أسئلة الاختيار من متعدد */
  shuffle_options?: boolean;
  /** يُطلب من الطالب ملء الشاشة أثناء الاختبار */
  require_fullscreen?: boolean;
  /** أسئلة مختلفة لكل طالب: عدد الأسئلة التي يأخذها كل طالب من أسئلة الاختبار (فارغ = الكل) */
  questions_per_student?: number | null;
}

export type QuestionType = 'mcq' | 'true_false' | 'essay' | 'fill_blank' | 'matching' | 'passage';

export interface MatchingPair {
  left: string;
  right: string;
}

// هيكل السؤال الفرعي المندرج تحت سؤال القطعة
export interface SubQuestion {
  id: string;
  question_text: string;
  type: 'mcq' | 'true_false' | 'essay' | 'fill_blank';
  options?: string[];
  correct_option_index?: number;
  correctAnswer?: string;
  marks: number;
  explanation?: string;
}

export interface Question {
  id: string;
  quiz_id?: string;
  type?: QuestionType;

  // الخصائص الأساسية
  question_text: string; // عند استخدام type === 'passage' يُمثل هذا نص القطعة الرئيسي
  options?: string[];
  marks: number; // للقطعة: يمثل مجموع درجات الأسئلة الفرعية

  // الإجابات
  correct_option_index?: number;
  correctAnswer?: string; // تستخدم أيضاً لأسئلة صح/خطأ والمقالي

  // الخصائص الاختيارية الأخرى
  text?: string;
  explanation?: string;
  blankAnswer?: string;
  pairs?: MatchingPair[];

  // الأسئلة الفرعية (خاصة بأسئلة القطعة)
  sub_questions?: SubQuestion[];

  /** ناتج التعلم أو المهارة التي يقيسها السؤال (أسئلة القطعة الفرعية ترثه) */
  outcome?: string;
}

export type TargetType = 'all' | 'class' | 'specific_students' | 'assigned_teacher';

export interface QuizAssignment {
  id: string;
  quiz_id: string;
  target_type: TargetType;
  target_id: string | null;
  target_name?: string;
  assigned_by_teacher_id: string;
  created_at: string;
}

// هيكل إجابة السؤال الفرعي داخل القطعة
export interface SubAnswerItem {
  sub_question_id: string;
  selected_option?: number | null;
  text_answer?: string;
  is_correct?: boolean;
  marks_awarded?: number;
  /** صحّحه المعلم يدوياً (أسئلة المقالي) */
  graded?: boolean;
}

// هيكل إجابة السؤال الرئيسي
export interface AnswerItem {
  question_id: string;
  selected_option?: number | null;
  text_answer?: string; // للإجابات النصية/المقالية
  is_correct: boolean;
  marks_awarded: number;
  sub_answers?: SubAnswerItem[]; // يحوي إجابات الأسئلة الفرعية للقطعة
  /** صحّحه المعلم يدوياً (أسئلة المقالي) */
  graded?: boolean;
}

export type SubmissionStatus = 'completed' | 'in_progress';

export interface Submission {
  id: string;
  quiz_id: string;
  student_id: string;
  score: number;
  total_possible_score: number;
  percentage: number;
  answers_json: AnswerItem[];
  completed_at: string;
  status: SubmissionStatus;
  time_spent_seconds?: number;
  is_retake?: boolean;
  /** سجل الخروج من صفحة الاختبار أثناء الحل */
  integrity?: QuizIntegrity | null;
}

export interface QuizIntegrity {
  leaves: number;
  away_seconds: number;
  fullscreen_exits?: number;
}

export interface QuizWithDetails extends Quiz {
  subject?: Subject;
  teacher?: User;
  questions?: Question[];
  assignments?: QuizAssignment[];
  submissions_count?: number;
  average_score?: number;
  user_submission?: Submission; // For student view
}

export interface SubmissionWithDetails extends Submission {
  student?: User;
  quiz?: Quiz;
  subject?: Subject;
  student_class?: SchoolClass;
}
