export type Role = 'admin' | 'teacher' | 'student';

export interface TeacherPermissions {
  can_add_custom_subjects: boolean;
  can_manage_classes: boolean;
  can_view_all_reports: boolean;
  can_add_students?: boolean;  // صلاحية إضافة الطلاب
  can_add_teachers?: boolean;  // صلاحية إضافة معلمين
}

export interface User {
  id: string;
  national_id: string; // رقم الهوية / الرقم الأكاديمي (مفتاح الدخول الأساسي)
  name: string;
  email?: string;
  password?: string;
  role: Role;
  specialty_id?: string | null;          // Primary subject for teacher
  assigned_subject_ids?: string[];       // All assigned subjects for teacher
  class_id?: string | null;              // For students: enrolled class id; for teachers: advisory class
  teacher_permissions?: TeacherPermissions; // Granular teacher permissions
  avatar?: string;
  created_at: string;
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

export type QuestionType = 'mcq' | 'fill_blank' | 'matching' | 'passage';

export interface MatchingPair {
  left: string;
  right: string;
}

export interface Question {
  id: string;
  quiz_id?: string;
  type?: QuestionType;
  text?: string;
  question_text?: string;        // متوافق مع الكود الحالي
  points?: number;
  marks?: number;                // متوافق مع درجة السؤال
  explanation?: string;          // الشرح والتفسير
  options?: string[];
  correctAnswer?: string;
  correct_option_index?: number; // رقم الخيار الصحيح
  blankAnswer?: string;          // لأسئلة أكمل الفراغ
  matchingPairs?: MatchingPair[];// لأسئلة التوصيل
  subQuestions?: Question[];     // لأسئلة القطعة والقراءة
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
