export type Role = 'admin' | 'teacher' | 'student';

export interface TeacherPermissions {
  can_add_custom_subjects?: boolean;
  can_manage_classes?: boolean;
  can_view_all_reports?: boolean;
  can_add_students?: boolean;
  can_add_teachers?: boolean;
}

export interface User {
  id: string;
  national_id: string;
  name: string;
  role: 'admin' | 'teacher' | 'student';
  password?: string;
  created_at?: string;
  
  // 👈 أضف هذه الأسطر الخاصة بالإسنادات والصلاحيات
  assigned_subject_ids?: string[];
  assigned_class_ids?: string[];
  permissions?: {
    can_add_students?: boolean;
    can_add_teachers?: boolean;
    can_add_custom_subjects?: boolean;
    can_manage_classes?: boolean;
    can_view_all_reports?: boolean;
    [key: string]: boolean | undefined;
  };
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
}

export type QuizStatus = 'published' | 'draft' | 'archived';

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
  created_at: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  allowed_retake_student_ids?: string[];
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
}

// هيكل إجابة السؤال الرئيسي
export interface AnswerItem {
  question_id: string;
  selected_option?: number | null;
  text_answer?: string; // للإجابات النصية/المقالية
  is_correct: boolean;
  marks_awarded: number;
  sub_answers?: SubAnswerItem[]; // يحوي إجابات الأسئلة الفرعية للقطعة
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
