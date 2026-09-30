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
  name: string;
  national_id: string;
  role: Role;
  email?: string;
  password?: string;
  created_at?: string;
  class_id?: string | null;           // ← حل خطأ class_id
  assigned_class_ids?: string[];      // ← حل خطأ assigned_class_ids
  assigned_subject_ids?: string[];    // ← حل خطأ assigned_subject_ids
  specialty_id?: string | null;       // ← حل خطأ specialty_id
  teacher_permissions?: TeacherPermissions; // ← حل خطأ teacher_permissions
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

export interface Question {
  id: string;
  quiz_id?: string;
  type?: QuestionType;

  // الخصائص الأساسية
  question_text: string;
  options?: string[];
  marks: number;

  // الإجابات
  correct_option_index?: number;
  correctAnswer?: string; // تستخدم أيضاً لأسئلة صح/خطأ والمقالي

  // الخصائص الاختيارية الأخرى
  text?: string;
  explanation?: string;
  blankAnswer?: string;
  pairs?: MatchingPair[];
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

export interface AnswerItem {
  question_id: string;
  selected_option: number | null;
  is_correct: boolean;
  marks_awarded: number;
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
