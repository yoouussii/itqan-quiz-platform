import {
  User,
  Subject,
  SchoolClass,
  Quiz,
  Question,
  QuizAssignment,
  Submission,
  QuizWithDetails,
  SubmissionWithDetails,
} from '../types';
import {
  initialUsers,
  initialSubjects,
  initialClasses,
  initialQuizzes,
  initialQuestions,
  initialAssignments,
  initialSubmissions,
} from '../data/seedData';

const STORAGE_KEYS = {
  USERS: 'itqan_users_v2',
  SUBJECTS: 'itqan_subjects_v2',
  CLASSES: 'itqan_classes_v2',
  QUIZZES: 'itqan_quizzes_v2',
  QUESTIONS: 'itqan_questions_v2',
  ASSIGNMENTS: 'itqan_assignments_v2',
  SUBMISSIONS: 'itqan_submissions_v2',
  CURRENT_USER_ID: 'itqan_current_user_id_v2',
  THEME: 'itqan_theme',
};

function getLocalItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`Error reading key ${key} from localStorage`, e);
    return defaultValue;
  }
}

function setLocalItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing key ${key} to localStorage`, e);
  }
}

export class StorageService {
  public static init() {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this.resetToSeedData();
    }
  }

public static resetToSeedData() {
    setLocalItem(STORAGE_KEYS.USERS, []);
    setLocalItem(STORAGE_KEYS.SUBJECTS, []);
    setLocalItem(STORAGE_KEYS.CLASSES, []);
    setLocalItem(STORAGE_KEYS.QUIZZES, []);
    setLocalItem(STORAGE_KEYS.QUESTIONS, []);
    setLocalItem(STORAGE_KEYS.ASSIGNMENTS, []);
    setLocalItem(STORAGE_KEYS.SUBMISSIONS, []);
}

// --- Auth / Current User ---
public static getCurrentUserId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID); // تم إزالة الحساب الافتراضي
}

  public static setCurrentUserId(id: string): void {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, id);
  }

public static getCurrentUser(): User | null {
  const id = this.getCurrentUserId();
  if (!id) return null;
  return this.getUserById(id) || null;
}

  public static getUserByNationalId(nationalId: string): User | undefined {
    const cleaned = nationalId.trim();
    return this.getUsers().find((u) => u.national_id === cleaned);
  }

  public static authenticate(nationalId: string, password?: string): User | null {
    const user = this.getUserByNationalId(nationalId);
    if (!user) return null;
    if (password && user.password && user.password !== password) {
      return null;
    }
    return user;
  }

  // --- Theme ---
  public static getTheme(): 'light' | 'dark' {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  public static setTheme(theme: 'light' | 'dark') {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // --- Users CRUD ---
  public static getUsers(): User[] {
    return getLocalItem<User[]>(STORAGE_KEYS.USERS, initialUsers);
  }

  public static getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  }

  public static getStudents(): User[] {
    return this.getUsers().filter((u) => u.role === 'student');
  }

  public static getTeachers(): User[] {
    return this.getUsers().filter((u) => u.role === 'teacher');
  }

  public static createUser(userData: Omit<User, 'id' | 'created_at'>): User {
    const users = this.getUsers();
    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    users.push(newUser);
    setLocalItem(STORAGE_KEYS.USERS, users);
    return newUser;
  }

  public static updateUser(id: string, updates: Partial<User>): User | null {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    setLocalItem(STORAGE_KEYS.USERS, users);
    return users[idx];
  }

  public static resetPassword(id: string, newPassword: string): boolean {
    return !!this.updateUser(id, { password: newPassword });
  }

  public static deleteUser(id: string): boolean {
    const users = this.getUsers();
    const filtered = users.filter((u) => u.id !== id);
    if (filtered.length === users.length) return false;
    setLocalItem(STORAGE_KEYS.USERS, filtered);
    return true;
  }

  // --- Subjects CRUD ---
  public static getSubjects(): Subject[] {
    return getLocalItem<Subject[]>(STORAGE_KEYS.SUBJECTS, initialSubjects);
  }

  public static getSubjectById(id: string): Subject | undefined {
    return this.getSubjects().find((s) => s.id === id);
  }

  public static createSubject(subject: Omit<Subject, 'id'>): Subject {
    const subjects = this.getSubjects();
    const newSubject: Subject = {
      ...subject,
      id: `subj-${Date.now()}`,
    };
    subjects.push(newSubject);
    setLocalItem(STORAGE_KEYS.SUBJECTS, subjects);
    return newSubject;
  }

  public static updateSubject(id: string, updates: Partial<Subject>): Subject | null {
    const subjects = this.getSubjects();
    const idx = subjects.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    subjects[idx] = { ...subjects[idx], ...updates };
    setLocalItem(STORAGE_KEYS.SUBJECTS, subjects);
    return subjects[idx];
  }

  public static deleteSubject(id: string): boolean {
    const subjects = this.getSubjects();
    const filtered = subjects.filter((s) => s.id !== id);
    if (filtered.length === subjects.length) return false;
    setLocalItem(STORAGE_KEYS.SUBJECTS, filtered);
    return true;
  }

  // --- Classes CRUD ---
  public static getClasses(): SchoolClass[] {
    return getLocalItem<SchoolClass[]>(STORAGE_KEYS.CLASSES, initialClasses);
  }

  public static getClassById(id: string): SchoolClass | undefined {
    return this.getClasses().find((c) => c.id === id);
  }

  public static createClass(classData: Omit<SchoolClass, 'id'>): SchoolClass {
    const classes = this.getClasses();
    const newClass: SchoolClass = {
      ...classData,
      id: `cls-${Date.now()}`,
      student_count: 0,
    };
    classes.push(newClass);
    setLocalItem(STORAGE_KEYS.CLASSES, classes);
    return newClass;
  }

  public static updateClass(id: string, updates: Partial<SchoolClass>): SchoolClass | null {
    const classes = this.getClasses();
    const idx = classes.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    classes[idx] = { ...classes[idx], ...updates };
    setLocalItem(STORAGE_KEYS.CLASSES, classes);
    return classes[idx];
  }

  public static deleteClass(id: string): boolean {
    const classes = this.getClasses();
    const filtered = classes.filter((c) => c.id !== id);
    if (filtered.length === classes.length) return false;
    setLocalItem(STORAGE_KEYS.CLASSES, filtered);
    return true;
  }

  // --- Quizzes ---
  public static getQuizzes(): Quiz[] {
    const list = getLocalItem<Quiz[]>(STORAGE_KEYS.QUIZZES, initialQuizzes);
    return list.map((q) => ({
      ...q,
      is_active: q.is_active ?? true,
      is_deleted: q.is_deleted ?? false,
      deleted_at: q.deleted_at ?? null,
      allowed_retake_student_ids: q.allowed_retake_student_ids ?? [],
      start_date: q.start_date || (q.created_at ? q.created_at.split('T')[0] : undefined),
    }));
  }

  public static getQuizById(id: string): Quiz | undefined {
    return this.getQuizzes().find((q) => q.id === id);
  }

  public static getQuizWithDetails(id: string): QuizWithDetails | null {
    const quiz = this.getQuizById(id);
    if (!quiz) return null;

    const subject = this.getSubjectById(quiz.subject_id);
    const teacher = this.getUserById(quiz.teacher_id);
    const questions = this.getQuestionsByQuizId(quiz.id);
    const assignments = this.getAssignmentsByQuizId(quiz.id);
    const submissions = this.getSubmissionsByQuizId(quiz.id);

    const average_score =
      submissions.length > 0
        ? Math.round(
            submissions.reduce((acc, curr) => acc + curr.percentage, 0) / submissions.length
          )
        : 0;

    return {
      ...quiz,
      subject,
      teacher,
      questions,
      assignments,
      submissions_count: submissions.length,
      average_score,
    };
  }

  public static createQuiz(
    quizData: Omit<Quiz, 'id' | 'created_at'>,
    questions: Array<Omit<Question, 'id' | 'quiz_id'>>,
    assignments: Array<Omit<QuizAssignment, 'id' | 'quiz_id' | 'created_at'>>
  ): Quiz {
    const quizzes = this.getQuizzes();
    const quizId = `quiz-${Date.now()}`;
    const newQuiz: Quiz = {
      ...quizData,
      id: quizId,
      created_at: new Date().toISOString(),
      is_active: quizData.is_active ?? true,
      is_deleted: false,
      deleted_at: null,
      allowed_retake_student_ids: [],
    };
    quizzes.push(newQuiz);
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);

    // Save questions
    const allQuestions = getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, initialQuestions);
    const newQuestions: Question[] = questions.map((q, idx) => ({
      ...q,
      id: `q-${quizId}-${idx + 1}-${Date.now()}`,
      quiz_id: quizId,
    }));
    setLocalItem(STORAGE_KEYS.QUESTIONS, [...allQuestions, ...newQuestions]);

    // Save assignments
    const allAssignments = getLocalItem<QuizAssignment[]>(
      STORAGE_KEYS.ASSIGNMENTS,
      initialAssignments
    );
    const newAssignments: QuizAssignment[] = assignments.map((a, idx) => ({
      ...a,
      id: `asg-${quizId}-${idx + 1}-${Date.now()}`,
      quiz_id: quizId,
      created_at: new Date().toISOString(),
    }));
    setLocalItem(STORAGE_KEYS.ASSIGNMENTS, [...allAssignments, ...newAssignments]);

    return newQuiz;
  }

  public static updateQuiz(id: string, updates: Partial<Quiz>): Quiz | null {
    const quizzes = this.getQuizzes();
    const idx = quizzes.findIndex((q) => q.id === id);
    if (idx === -1) return null;
    quizzes[idx] = { ...quizzes[idx], ...updates };
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);
    return quizzes[idx];
  }

  /**
   * Update full quiz including its questions and assignments in place without duplication
   */
  public static updateFullQuiz(
    quizId: string,
    quizUpdates: Partial<Quiz>,
    questions: Array<Omit<Question, 'quiz_id' | 'id'> & { id?: string }>,
    assignments: Array<Omit<QuizAssignment, 'quiz_id' | 'created_at' | 'id'> & { id?: string }>
  ): Quiz | null {
    const quizzes = this.getQuizzes();
    const idx = quizzes.findIndex((q) => q.id === quizId);
    if (idx === -1) return null;

    quizzes[idx] = { ...quizzes[idx], ...quizUpdates };
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);

    // Save updated questions for this quiz
    const allQuestions = getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, initialQuestions);
    const otherQuestions = allQuestions.filter((q) => q.quiz_id !== quizId);
    const updatedQuestions: Question[] = questions.map((q, qIdx) => ({
      ...q,
      id: q.id || `q-${quizId}-${qIdx + 1}-${Date.now()}`,
      quiz_id: quizId,
    }));
    setLocalItem(STORAGE_KEYS.QUESTIONS, [...otherQuestions, ...updatedQuestions]);

    // Save updated assignments for this quiz
    const allAssignments = getLocalItem<QuizAssignment[]>(STORAGE_KEYS.ASSIGNMENTS, initialAssignments);
    const otherAssignments = allAssignments.filter((a) => a.quiz_id !== quizId);
    const updatedAssignments: QuizAssignment[] = assignments.map((a, aIdx) => ({
      ...a,
      id: a.id || `asg-${quizId}-${aIdx + 1}-${Date.now()}`,
      quiz_id: quizId,
      created_at: new Date().toISOString(),
    }));
    setLocalItem(STORAGE_KEYS.ASSIGNMENTS, [...otherAssignments, ...updatedAssignments]);

    return quizzes[idx];
  }

  /**
   * Soft Delete Quiz: Keeps historical logs and answers for review,
   * but flags quiz as deleted with timestamp and deactivates it.
   */
  public static deleteQuiz(id: string): boolean {
    const quizzes = this.getQuizzes();
    const idx = quizzes.findIndex((q) => q.id === id);
    if (idx === -1) return false;

    quizzes[idx] = {
      ...quizzes[idx],
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      is_active: false,
    };
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);
    return true;
  }

  /**
   * Instant Manual Toggle Switch: enable/disable quiz access immediately
   */
  public static toggleQuizActive(id: string): Quiz | null {
    const quizzes = this.getQuizzes();
    const idx = quizzes.findIndex((q) => q.id === id);
    if (idx === -1) return null;

    quizzes[idx] = {
      ...quizzes[idx],
      is_active: !quizzes[idx].is_active,
    };
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);
    return quizzes[idx];
  }

  /**
   * Individual Student Retake Permission: allow specific student to retake a quiz
   */
  public static allowStudentRetake(quizId: string, studentId: string): { success: boolean; message: string } {
    const quizzes = this.getQuizzes();
    const idx = quizzes.findIndex((q) => q.id === quizId);
    if (idx === -1) return { success: false, message: 'الاختبار غير موجود' };

    const currentAllowed = quizzes[idx].allowed_retake_student_ids || [];
    if (!currentAllowed.includes(studentId)) {
      quizzes[idx] = {
        ...quizzes[idx],
        allowed_retake_student_ids: [...currentAllowed, studentId],
      };
      setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);
    }
    return { success: true, message: 'تم منح صلاحية إعادة المحاولة للطالب بنجاح' };
  }

  public static revokeStudentRetake(quizId: string, studentId: string): { success: boolean; message: string } {
    const quizzes = this.getQuizzes();
    const idx = quizzes.findIndex((q) => q.id === quizId);
    if (idx === -1) return { success: false, message: 'الاختبار غير موجود' };

    quizzes[idx] = {
      ...quizzes[idx],
      allowed_retake_student_ids: (quizzes[idx].allowed_retake_student_ids || []).filter((id) => id !== studentId),
    };
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);
    return { success: true, message: 'تم إلغاء صلاحية إعادة المحاولة' };
  }

  public static reassignQuiz(
    quizId: string,
    newTeacherId: string,
    assignedByUserId: string
  ): { success: boolean; quiz?: Quiz; message: string } {
    const quiz = this.getQuizById(quizId);
    if (!quiz) return { success: false, message: 'الاختبار غير موجود' };

    const newTeacher = this.getUserById(newTeacherId);
    if (!newTeacher || newTeacher.role !== 'teacher') {
      return { success: false, message: 'المعلم المستهدف غير صالح' };
    }

    const updatedQuiz = this.updateQuiz(quizId, { teacher_id: newTeacherId });

    const assignments = this.getAssignments();
    const newAssignment: QuizAssignment = {
      id: `asg-reassign-${Date.now()}`,
      quiz_id: quizId,
      target_type: 'assigned_teacher',
      target_id: newTeacherId,
      target_name: `إسناد إلى المعلم: ${newTeacher.name}`,
      assigned_by_teacher_id: assignedByUserId,
      created_at: new Date().toISOString(),
    };
    assignments.push(newAssignment);
    setLocalItem(STORAGE_KEYS.ASSIGNMENTS, assignments);

    return {
      success: true,
      quiz: updatedQuiz || undefined,
      message: `تم تحويل ملكية الاختبار بنجاح إلى المعلم (${newTeacher.name})`,
    };
  }

  // --- Questions ---
  public static getQuestionsByQuizId(quizId: string): Question[] {
    const questions = getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, initialQuestions);
    return questions.filter((q) => q.quiz_id === quizId);
  }

  // --- Assignments ---
  public static getAssignments(): QuizAssignment[] {
    return getLocalItem<QuizAssignment[]>(STORAGE_KEYS.ASSIGNMENTS, initialAssignments);
  }

  public static getAssignmentsByQuizId(quizId: string): QuizAssignment[] {
    return this.getAssignments().filter((a) => a.quiz_id === quizId);
  }

  // --- Submissions & Privacy Enforcement ---
  public static getSubmissions(): Submission[] {
    return getLocalItem<Submission[]>(STORAGE_KEYS.SUBMISSIONS, initialSubmissions);
  }

  public static getSubmissionById(id: string): Submission | undefined {
    return this.getSubmissions().find((s) => s.id === id);
  }

  public static getSubmissionsByQuizId(quizId: string): Submission[] {
    return this.getSubmissions().filter((s) => s.quiz_id === quizId);
  }

  public static getSubmissionsByStudentId(studentId: string): Submission[] {
    return this.getSubmissions().filter((s) => s.student_id === studentId);
  }

  public static createSubmission(
    submissionData: Omit<Submission, 'id' | 'completed_at'>
  ): Submission {
    const submissions = this.getSubmissions();
    const newSubmission: Submission = {
      ...submissionData,
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      completed_at: new Date().toISOString(),
    };
    submissions.push(newSubmission);
    setLocalItem(STORAGE_KEYS.SUBMISSIONS, submissions);
    return newSubmission;
  }

  public static getSubmissionWithDetails(id: string): SubmissionWithDetails | null {
    const submission = this.getSubmissionById(id);
    if (!submission) return null;

    const student = this.getUserById(submission.student_id);
    const quiz = this.getQuizById(submission.quiz_id);
    const subject = quiz ? this.getSubjectById(quiz.subject_id) : undefined;
    const student_class = student?.class_id ? this.getClassById(student.class_id) : undefined;

    return {
      ...submission,
      student,
      quiz,
      subject,
      student_class,
    };
  }

  // --- STRICT STUDENT VISIBILITY & PRIVACY LOGIC (Requirement 5) ---
  /**
   * Students MUST ONLY see quizzes explicitly assigned to them:
   * 1. Via 'all'
   * 2. Via their specific class_id
   * 3. Via direct student assignment (specific_students)
   */
  public static getQuizzesForStudent(studentId: string): QuizWithDetails[] {
    const student = this.getUserById(studentId);
    if (!student || student.role !== 'student') return [];

    // Strictly exclude soft-deleted quizzes from available student quizzes
    const allQuizzes = this.getQuizzes().filter((q) => !q.is_deleted && q.status === 'published');
    const allAssignments = this.getAssignments();
    const studentSubmissions = this.getSubmissionsByStudentId(studentId);

    const eligibleQuizzes: QuizWithDetails[] = [];

    for (const quiz of allQuizzes) {
      const quizAssignments = allAssignments.filter((a) => a.quiz_id === quiz.id);

      const isAssigned = quizAssignments.some((assignment) => {
        if (assignment.target_type === 'all') {
          return true;
        }
        if (assignment.target_type === 'class') {
          return student.class_id && assignment.target_id === student.class_id;
        }
        if (assignment.target_type === 'specific_students') {
          if (!assignment.target_id) return false;
          const ids = assignment.target_id.split(',').map((id) => id.trim());
          return ids.includes(studentId);
        }
        return false;
      });

      if (isAssigned) {
        const subject = this.getSubjectById(quiz.subject_id);
        const teacher = this.getUserById(quiz.teacher_id);
        const questions = this.getQuestionsByQuizId(quiz.id);
        const user_submissions = studentSubmissions.filter((s) => s.quiz_id === quiz.id);
        const user_submission = user_submissions.length > 0
          ? user_submissions.sort(
              (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
            )[0]
          : undefined;

        eligibleQuizzes.push({
          ...quiz,
          subject,
          teacher,
          questions,
          assignments: quizAssignments,
          user_submission,
        });
      }
    }

    return eligibleQuizzes;
  }

  // --- TEACHER QUIZZES ---
  public static getQuizzesForTeacher(teacherId: string, includeDeleted = false): QuizWithDetails[] {
    const quizzes = this.getQuizzes().filter((q) => q.teacher_id === teacherId && (includeDeleted ? true : !q.is_deleted));
    return quizzes.map((q) => this.getQuizWithDetails(q.id)!);
  }

  // --- ALL QUIZZES FOR ADMIN ---
  public static getAllQuizzesWithDetails(includeDeleted = false): QuizWithDetails[] {
    const quizzes = this.getQuizzes().filter((q) => (includeDeleted ? true : !q.is_deleted));
    return quizzes.map((q) => this.getQuizWithDetails(q.id)!);
  }

  // --- SUBMISSIONS WITH STRICT PRIVACY ENFORCEMENT ---
  /**
   * If requesting user is student: returns ONLY their own submissions.
   * If requesting user is teacher without global reports permission: returns only submissions for teacher's quizzes.
   * If requesting user is admin or teacher with can_view_all_reports: returns all submissions.
   */
  public static getAccessibleSubmissionsWithDetails(requestingUserId: string): SubmissionWithDetails[] {
    const requestingUser = this.getUserById(requestingUserId);
    if (!requestingUser) return [];

    let submissions = this.getSubmissions();

    // STRICT PRIVACY: If student, strictly filter to their own submissions only!
    if (requestingUser.role === 'student') {
      submissions = submissions.filter((s) => s.student_id === requestingUserId);
    } else if (requestingUser.role === 'teacher') {
      const canViewAll = requestingUser.teacher_permissions?.can_view_all_reports;
      if (!canViewAll) {
        const teacherQuizzes = this.getQuizzes().filter((q) => q.teacher_id === requestingUserId);
        const teacherQuizIds = new Set(teacherQuizzes.map((q) => q.id));
        submissions = submissions.filter((s) => teacherQuizIds.has(s.quiz_id));
      }
    }

    const users = this.getUsers();
    const quizzes = this.getQuizzes();
    const subjects = this.getSubjects();
    const classes = this.getClasses();

    return submissions.map((sub) => {
      const student = users.find((u) => u.id === sub.student_id);
      const quiz = quizzes.find((q) => q.id === sub.quiz_id);
      const subject = quiz ? subjects.find((s) => s.id === quiz.subject_id) : undefined;
      const student_class = student?.class_id
        ? classes.find((c) => c.id === student.class_id)
        : undefined;

      return {
        ...sub,
        student,
        quiz,
        subject,
        student_class,
      };
    });
  }

  // --- DYNAMIC KPI ANALYTICS CALCULATION ---
  public static getDynamicKPIs(teacherId?: string) {
    const students = this.getStudents();
    let submissions = this.getSubmissions();
    let allQuizzes = this.getQuizzes();

    // STRICT REQUIREMENT 3: Exclude deleted quizzes and their submissions from all KPI calculations
    const deletedQuizIds = new Set(allQuizzes.filter((q) => q.is_deleted).map((q) => q.id));
    let quizzes = allQuizzes.filter((q) => !q.is_deleted);
    submissions = submissions.filter((s) => !deletedQuizIds.has(s.quiz_id));

    if (teacherId) {
      quizzes = quizzes.filter((q) => q.teacher_id === teacherId);
      const quizIds = new Set(quizzes.map((q) => q.id));
      submissions = submissions.filter((s) => quizIds.has(s.quiz_id));
    }

    const totalStudents = students.length;
    const totalQuizzes = quizzes.length;

    const avgScore =
      submissions.length > 0
        ? Number(
            (
              submissions.reduce((acc, curr) => acc + curr.percentage, 0) / submissions.length
            ).toFixed(1)
          )
        : 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const activeStudentIds = new Set(
      submissions
        .filter((s) => new Date(s.completed_at) >= sevenDaysAgo)
        .map((s) => s.student_id)
    );
    const activeStudentsCount = activeStudentIds.size;

    const passingSubmissions = submissions.filter((s) => {
      const quiz = quizzes.find((q) => q.id === s.quiz_id);
      const passMark = quiz?.pass_percentage || 60;
      return s.percentage >= passMark;
    });
    const passRate =
      submissions.length > 0
        ? Number(((passingSubmissions.length / submissions.length) * 100).toFixed(1))
        : 0;

    const scoreDistribution = [
      { name: 'ممتاز (90% - 100%)', count: 0, color: '#10b981', shortName: 'ممتاز' },
      { name: 'جيد جداً (80% - 89%)', count: 0, color: '#6366f1', shortName: 'جيد جداً' },
      { name: 'جيد (65% - 79%)', count: 0, color: '#0ea5e9', shortName: 'جيد' },
      { name: 'مقبول (50% - 64%)', count: 0, color: '#f59e0b', shortName: 'مقبول' },
      { name: 'راسب (أقل من 50%)', count: 0, color: '#ef4444', shortName: 'راسب' },
    ];

    submissions.forEach((s) => {
      if (s.percentage >= 90) scoreDistribution[0].count++;
      else if (s.percentage >= 80) scoreDistribution[1].count++;
      else if (s.percentage >= 65) scoreDistribution[2].count++;
      else if (s.percentage >= 50) scoreDistribution[3].count++;
      else scoreDistribution[4].count++;
    });

    const dailyMap: Record<string, number> = {};
    submissions.forEach((s) => {
      const dateKey = s.completed_at.split('T')[0];
      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + 1;
    });

    const completionTimeline = Object.entries(dailyMap)
      .map(([date, count]) => {
        const d = new Date(date);
        const day = d.getDate();
        const monthNames = [
          'يناير',
          'فبراير',
          'مارس',
          'أبريل',
          'مايو',
          'يونيو',
          'يوليو',
          'أغسطس',
          'سبتمبر',
          'أكتوبر',
          'نوفمبر',
          'ديسمبر',
        ];
        return {
          dateKey: date,
          dateLabel: `${day} ${monthNames[d.getMonth()]}`,
          submissionsCount: count,
        };
      })
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const subjects = this.getSubjects();
    const subjectPerformance = subjects.map((subj) => {
      const subjectQuizzes = quizzes.filter((q) => q.subject_id === subj.id);
      const subjectQuizIds = new Set(subjectQuizzes.map((q) => q.id));
      const subjectSubmissions = submissions.filter((s) => subjectQuizIds.has(s.quiz_id));
      const avg =
        subjectSubmissions.length > 0
          ? Math.round(
              subjectSubmissions.reduce((a, b) => a + b.percentage, 0) /
                subjectSubmissions.length
            )
          : 0;

      return {
        subjectId: subj.id,
        subjectName: subj.name,
        averageScore: avg,
        submissionsCount: subjectSubmissions.length,
        color: subj.color,
      };
    });

    return {
      totalStudents,
      totalQuizzes,
      averageScore: avgScore,
      activeStudents: activeStudentsCount,
      totalSubmissions: submissions.length,
      passRate,
      scoreDistribution,
      completionTimeline,
      subjectPerformance,
    };
  }
}
