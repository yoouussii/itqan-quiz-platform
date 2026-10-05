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


import { canonSubjectId } from '../utils/subjectAliases';

/** كلمة المرور التلقائية عند إضافة مستخدم بدون كلمة مرور (موحّدة في كل مسارات الإضافة) */
export const DEFAULT_PASSWORD = 'itqan123';

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
  DELETED_USER_IDS: 'itqan_deleted_user_ids',
  DELETED_SUBJECT_IDS: 'itqan_deleted_subject_ids',
  DELETED_CLASS_IDS: 'itqan_deleted_class_ids',
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
    // تنظيف قسري لمرة واحدة للبيانات الافتراضية القديمة من جهاز المستخدم (Force Local Purge)
    const PURGE_FLAG_KEY = 'itqan_seed_data_purged_v4';
    if (!localStorage.getItem(PURGE_FLAG_KEY)) {
      try {
        // تنظيف المستخدمين الافتراضيين
        const rawUsers = localStorage.getItem(STORAGE_KEYS.USERS);
        if (rawUsers) {
          const parsed = JSON.parse(rawUsers) as User[];
          const seedUserIds = [
            'usr-admin-1',
            'usr-teacher-1',
            'usr-teacher-2',
            'usr-teacher-3',
            'usr-student-1',
            'usr-student-2',
            'usr-student-3',
          ];
          const seedNationalIds = [
            '1010203040',
            '1020304051',
            '1020304052',
            '1020304053',
            '1030405001',
            '1030405002',
            '1030405003',
          ];
          const cleanedUsers = parsed.filter(
            (u) =>
              u.id &&
              !seedUserIds.includes(u.id) &&
              !seedNationalIds.includes(u.national_id?.trim()) &&
              !u.id.startsWith('usr-admin-') &&
              !u.id.startsWith('usr-teacher-') &&
              !u.id.startsWith('usr-student-')
          );
          setLocalItem(STORAGE_KEYS.USERS, cleanedUsers);

          // إذا كان المستخدم الحالي هو أحد الحسابات التجريبية، نظف الجلسة
          const currentId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
          if (currentId && (seedUserIds.includes(currentId) || currentId.startsWith('usr-'))) {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
          }
        }

        // تنظيف المواد الافتراضية
        const rawSubjects = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
        if (rawSubjects) {
          const parsedSubs = JSON.parse(rawSubjects) as Subject[];
          const seedSubCodes = ['MATH101', 'SCI101', 'ARAB101', 'PHYS101', 'CHEM101', 'ENG101'];
          const cleanedSubs = parsedSubs.filter(
            (s) =>
              !seedSubCodes.includes(s.code || '') &&
              !['sub_1', 'sub_2', 'sub_3', 'sub_4', 'sub_5', 'sub_6'].includes(s.id)
          );
          setLocalItem(STORAGE_KEYS.SUBJECTS, cleanedSubs);
        }

        // تنظيف الفصول الافتراضية
        const rawClasses = localStorage.getItem(STORAGE_KEYS.CLASSES);
        if (rawClasses) {
          const parsedClasses = JSON.parse(rawClasses) as SchoolClass[];
          const seedClassIds = ['class_1', 'class_2', 'class_3', 'class_4'];
          const cleanedClasses = parsedClasses.filter((c) => !seedClassIds.includes(c.id));
          setLocalItem(STORAGE_KEYS.CLASSES, cleanedClasses);
        }

        localStorage.setItem(PURGE_FLAG_KEY, 'true');
        console.log('[StorageService.init] Old seed data purged successfully from localStorage.');
      } catch (e) {
        console.error('[StorageService.init] Error during local seed data purge:', e);
      }
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
    // إذا كان للمستخدم كلمة مرور محفوظة فيجب أن تطابق تماماً (كلمة مرور فارغة لا تُقبل)
    if (user.password && user.password !== (password ?? '')) {
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
    const deletedIds = this.getDeletedUserIds();
    const users = getLocalItem<User[]>(STORAGE_KEYS.USERS, []);
    return (users || []).filter((u) => !deletedIds.includes(u.id));
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
    const existingIndex = users.findIndex(
      (u) => u.national_id && u.national_id.trim() === userData.national_id?.trim()
    );
    const now = new Date().toISOString();

    const username = userData.username || userData.national_id;

    if (existingIndex >= 0) {
      users[existingIndex] = {
        ...users[existingIndex],
        ...userData,
        username: username || users[existingIndex].username || users[existingIndex].national_id,
        updated_at: now,
      };
      setLocalItem(STORAGE_KEYS.USERS, users);
      return users[existingIndex];
    }

    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username,
      created_at: now,
      updated_at: now,
    };
    users.push(newUser);
    setLocalItem(STORAGE_KEYS.USERS, users);
    return newUser;
  }

  public static updateUser(id: string, updates: Partial<User>): User | null {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;

    const current = users[idx];
    const targetRole = updates.role || current.role;
    // المشرف مثل المعلم: له صلاحيات ومواد وفصول مسندة (كانت تُمسح عند كل حفظ)
    const isStaff = targetRole === 'teacher' || targetRole === 'supervisor';

    // توحيد الصلاحيات
    const hasPerms = 'teacher_permissions' in updates || 'permissions' in updates;
    const perms = hasPerms
      ? (updates.teacher_permissions || updates.permissions || undefined)
      : (current.teacher_permissions || current.permissions);

    // توحيد المواد
    let assignedSubs: string[] = [];
    let specialtyId: string | null = null;
    if (isStaff) {
      assignedSubs = Array.isArray(updates.assigned_subject_ids)
        ? updates.assigned_subject_ids
        : ('specialty_id' in updates
            ? (updates.specialty_id ? [updates.specialty_id] : [])
            : current.assigned_subject_ids || (current.specialty_id ? [current.specialty_id] : []));
      specialtyId = updates.specialty_id !== undefined
        ? (updates.specialty_id || null)
        : (assignedSubs[0] || current.specialty_id || null);
      if (!specialtyId && assignedSubs.length > 0) {
        specialtyId = assignedSubs[0];
      }
      if (specialtyId && assignedSubs.length === 0) {
        assignedSubs = [specialtyId];
      }
    }

    // توحيد الفصول
    let assignedCls: string[] = [];
    let classId: string | null = null;
    if (targetRole === 'student') {
      classId = updates.class_id !== undefined
        ? (updates.class_id || null)
        : (Array.isArray(updates.assigned_class_ids) && updates.assigned_class_ids.length > 0
            ? updates.assigned_class_ids[0]
            : (current.class_id || current.assigned_class_ids?.[0] || null));
      assignedCls = classId ? [classId] : (Array.isArray(updates.assigned_class_ids) ? updates.assigned_class_ids : []);
      if (!classId && assignedCls.length > 0) {
        classId = assignedCls[0];
      }
    } else if (isStaff) {
      assignedCls = Array.isArray(updates.assigned_class_ids)
        ? updates.assigned_class_ids
        : ('class_id' in updates
            ? (updates.class_id ? [updates.class_id] : [])
            : current.assigned_class_ids || (current.class_id ? [current.class_id] : []));
      classId = updates.class_id !== undefined
        ? (updates.class_id || null)
        : (assignedCls[0] || current.class_id || null);
      if (!classId && assignedCls.length > 0) {
        classId = assignedCls[0];
      }
      if (classId && assignedCls.length === 0) {
        assignedCls = [classId];
      }
    }

    const now = new Date().toISOString();

    users[idx] = {
      ...current,
      ...updates,
      ...(updates.username !== undefined ? { username: updates.username } : {}),
      teacher_permissions: isStaff ? perms : undefined,
      permissions: isStaff ? perms : undefined,
      assigned_subject_ids: assignedSubs,
      specialty_id: specialtyId,
      assigned_class_ids: assignedCls,
      class_id: classId,
      updated_at: now,
    };
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
    this.addDeletedUserId(id);
    return true;
  }

  public static getDeletedUserIds(): string[] {
    return getLocalItem<string[]>(STORAGE_KEYS.DELETED_USER_IDS, []);
  }

  public static addDeletedUserId(id: string): void {
    const ids = this.getDeletedUserIds();
    if (!ids.includes(id)) {
      ids.push(id);
      setLocalItem(STORAGE_KEYS.DELETED_USER_IDS, ids);
    }
  }

  public static getDeletedSubjectIds(): string[] {
    return getLocalItem<string[]>(STORAGE_KEYS.DELETED_SUBJECT_IDS, []);
  }

  public static addDeletedSubjectId(id: string): void {
    const ids = this.getDeletedSubjectIds();
    if (!ids.includes(id)) {
      ids.push(id);
      setLocalItem(STORAGE_KEYS.DELETED_SUBJECT_IDS, ids);
    }
  }

  /** يُلغي علامة «محذوف محلياً» عن عناصر ما زالت موجودة على الخادم (الخادم هو المرجع) */
  public static forgetDeletedIds(kind: 'subject' | 'class', ids: string[]): void {
    if (!ids.length) return;
    const key = kind === 'subject' ? STORAGE_KEYS.DELETED_SUBJECT_IDS : STORAGE_KEYS.DELETED_CLASS_IDS;
    const drop = new Set(ids);
    setLocalItem(key, getLocalItem<string[]>(key, []).filter((x) => !drop.has(x)));
  }

  public static getDeletedClassIds(): string[] {
    return getLocalItem<string[]>(STORAGE_KEYS.DELETED_CLASS_IDS, []);
  }

  public static addDeletedClassId(id: string): void {
    const ids = this.getDeletedClassIds();
    if (!ids.includes(id)) {
      ids.push(id);
      setLocalItem(STORAGE_KEYS.DELETED_CLASS_IDS, ids);
    }
  }

  // --- Subjects CRUD ---
  public static getSubjects(): Subject[] {
    const deletedIds = this.getDeletedSubjectIds();
    const subjects = getLocalItem<Subject[]>(STORAGE_KEYS.SUBJECTS, []);
    return subjects.filter((s) => !deletedIds.includes(s.id));
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
    this.addDeletedSubjectId(id);
    return true;
  }

  // --- Classes CRUD ---
  public static getClasses(): SchoolClass[] {
    const deletedIds = this.getDeletedClassIds();
    const classes = getLocalItem<SchoolClass[]>(STORAGE_KEYS.CLASSES, []);
    return classes.filter((c) => !deletedIds.includes(c.id));
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
    this.addDeletedClassId(id);
    return true;
  }

  // --- Quizzes ---
  public static getQuizzes(): Quiz[] {
    const list = getLocalItem<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    return list.map((q) => ({
      ...q,
      subject_id: (canonSubjectId(q.subject_id) as string) || q.subject_id,
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
    const allQuestions = getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, []);
    const newQuestions: Question[] = questions.map((q, idx) => ({
      ...q,
      // معرّفات الاختبار العلاجي الفردي تُحدد مسبقاً لأن أسئلة كل طالب مربوطة بها
      id: String((q as any).id || '').startsWith('rq-') ? (q as any).id : `q-${quizId}-${idx + 1}-${Date.now()}`,
      quiz_id: quizId,
    }));
    setLocalItem(STORAGE_KEYS.QUESTIONS, [...allQuestions, ...newQuestions]);

    // Save assignments
    const allAssignments = getLocalItem<QuizAssignment[]>(
      STORAGE_KEYS.ASSIGNMENTS,
      []
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
    quizzes[idx] = { ...quizzes[idx], ...updates, updated_at: new Date().toISOString() };
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

    quizzes[idx] = { ...quizzes[idx], ...quizUpdates, updated_at: new Date().toISOString() };
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);

    // Save updated questions for this quiz
    const allQuestions = getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, []);
    const otherQuestions = allQuestions.filter((q) => q.quiz_id !== quizId);
    const updatedQuestions: Question[] = questions.map((q, qIdx) => ({
      ...q,
      id: q.id || `q-${quizId}-${qIdx + 1}-${Date.now()}`,
      quiz_id: quizId,
    }));
    setLocalItem(STORAGE_KEYS.QUESTIONS, [...otherQuestions, ...updatedQuestions]);

    // Save updated assignments for this quiz
    const allAssignments = getLocalItem<QuizAssignment[]>(STORAGE_KEYS.ASSIGNMENTS, []);
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
    const questions = getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, []);
    return questions.filter((q) => q.quiz_id === quizId);
  }

  // --- Assignments ---
  public static getAssignments(): QuizAssignment[] {
    return getLocalItem<QuizAssignment[]>(STORAGE_KEYS.ASSIGNMENTS, []);
  }

  public static getAssignmentsByQuizId(quizId: string): QuizAssignment[] {
    return this.getAssignments().filter((a) => a.quiz_id === quizId);
  }

  // --- Submissions & Privacy Enforcement ---
  public static getSubmissions(): Submission[] {
    return getLocalItem<Submission[]>(STORAGE_KEYS.SUBMISSIONS, []);
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
    const teacher = this.getUserById(teacherId);
    const assignedSubs = teacher?.assigned_subject_ids || (teacher?.specialty_id ? [teacher.specialty_id] : []);
    const quizzes = this.getQuizzes().filter((q) =>
      (q.teacher_id === teacherId || q.created_by === teacherId || (assignedSubs.length > 0 && assignedSubs.includes(q.subject_id))) &&
      (includeDeleted ? true : !q.is_deleted)
    );
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
    } else if (requestingUser.role === 'parent') {
      const kids = new Set(requestingUser.child_ids || []);
      submissions = submissions.filter((s) => kids.has(s.student_id));
    } else if (requestingUser.role === 'supervisor') {
      const ids = new Set(this.getSupervisorData(requestingUser).submissions.map((x) => x.id));
      submissions = submissions.filter((x) => ids.has(x.id));
    } else if (requestingUser.role === 'teacher') {
      const canViewAll = requestingUser.teacher_permissions?.can_view_all_reports || (requestingUser as any).permissions?.can_view_all_reports;
      if (!canViewAll) {
        const assignedSubs = requestingUser.assigned_subject_ids || (requestingUser.specialty_id ? [requestingUser.specialty_id] : []);
        const teacherQuizzes = this.getQuizzes().filter((q) =>
          q.teacher_id === requestingUserId ||
          q.created_by === requestingUserId ||
          (assignedSubs.length > 0 && assignedSubs.includes(q.subject_id))
        );
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
  public static getDynamicKPIs(
    teacherId?: string,
    scope?: { studentIds: Set<string>; quizIds: Set<string> }
  ) {
    let students = this.getStudents();
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

    if (scope) {
      students = students.filter((st) => scope.studentIds.has(st.id));
      quizzes = quizzes.filter((q) => scope.quizIds.has(q.id));
      submissions = submissions.filter((sub) => scope.quizIds.has(sub.quiz_id) && scope.studentIds.has(sub.student_id));
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

  // =====================================================================
  // نطاق المشرف: لا يرى إلا الصفوف/المواد المسندة إليه (أو الكل بصلاحية التقارير العامة)
  // =====================================================================
  public static getSupervisorScope(user: User): { all: boolean; classIds: string[]; subjectIds: string[]; empty: boolean } {
    const perms = user.teacher_permissions || (user as any).permissions || {};
    const classIds = Array.from(new Set([...(user.assigned_class_ids || []), ...(user.class_id ? [user.class_id] : [])]));
    const subjectIds = Array.from(
      new Set([...(user.assigned_subject_ids || []), ...(user.specialty_id ? [user.specialty_id] : [])].map((id) => canonSubjectId(id) as string))
    );
    const all = !!perms.can_view_all_reports;
    return { all, classIds, subjectIds, empty: !all && classIds.length === 0 && subjectIds.length === 0 };
  }

  public static getSupervisorData(user: User) {
    const scope = this.getSupervisorScope(user);
    const allStudents = this.getStudents();
    const classOf = (st: User) => st.class_id || st.assigned_class_ids?.[0] || '';

    const students = scope.empty
      ? []
      : scope.all || scope.classIds.length === 0
      ? allStudents
      : allStudents.filter((st) => scope.classIds.includes(classOf(st)));
    const studentIds = new Set(students.map((st) => st.id));

    const targetsScope = (quizId: string): boolean => {
      const asg = this.getAssignmentsByQuizId(quizId).filter((a) => a.target_type !== 'assigned_teacher');
      if (asg.some((a) => a.target_type === 'all')) return true;
      if (asg.some((a) => a.target_type === 'class' && scope.classIds.includes(a.target_id || ''))) return true;
      return asg
        .filter((a) => a.target_type === 'specific_students' && a.target_id)
        .some((a) => String(a.target_id).split(',').some((id) => studentIds.has(id.trim())));
    };

    const rawQuizzes = this.getQuizzes().filter((q) => !q.is_deleted);
    const quizIdsList = scope.empty
      ? []
      : rawQuizzes
          .filter(
            (q) =>
              scope.all ||
              ((scope.subjectIds.length === 0 || scope.subjectIds.includes(q.subject_id)) &&
                (scope.classIds.length === 0 || targetsScope(q.id)))
          )
          .map((q) => q.id);
    const quizIds = new Set(quizIdsList);
    const quizzes = quizIdsList.map((id) => this.getQuizWithDetails(id)!).filter(Boolean);
    const submissions = this.getSubmissions().filter((sub) => quizIds.has(sub.quiz_id) && studentIds.has(sub.student_id));

    const teacherIdsFromQuizzes = new Set(quizzes.map((q) => q.teacher_id));
    const teachers = scope.empty
      ? []
      : this.getTeachers().filter(
          (t) =>
            scope.all ||
            teacherIdsFromQuizzes.has(t.id) ||
            (t.assigned_class_ids || []).some((c) => scope.classIds.includes(c)) ||
            (t.assigned_subject_ids || []).some((sId) => scope.subjectIds.includes(canonSubjectId(sId) as string))
        );

    return { scope, students, teachers, quizzes, submissions, studentIds, quizIds };
  }

  /** بيانات لوحات الرؤى حسب الدور: المدير = الكل، المشرف = نطاقه، المعلم = اختباراته وطلاب صفوفه (أو الكل بصلاحية التقارير العامة) */
  public static getStaffData(user: User) {
    if (user.role === 'supervisor') {
      const d = this.getSupervisorData(user);
      return { students: d.students, teachers: d.teachers, quizzes: d.quizzes, submissions: d.submissions };
    }
    const perms: any = user.teacher_permissions || (user as any).permissions || {};
    let quizList = this.getQuizzes().filter((q) => !q.is_deleted);
    let students = this.getStudents();
    let teachers = this.getTeachers();

    if (user.role === 'teacher' && !perms.can_view_all_reports) {
      quizList = quizList.filter((q) => q.teacher_id === user.id || q.created_by === user.id);
      const classIds = new Set([...(user.assigned_class_ids || []), ...(user.class_id ? [user.class_id] : [])]);
      const ownIds = new Set(quizList.map((q) => q.id));
      const seen = new Set(this.getSubmissions().filter((x) => ownIds.has(x.quiz_id)).map((x) => x.student_id));
      students = students.filter((st) => classIds.has(st.class_id || '') || seen.has(st.id));
      teachers = teachers.filter((t) => t.id === user.id);
    }

    const quizIds = new Set(quizList.map((q) => q.id));
    const studentIds = new Set(students.map((st) => st.id));
    const submissions = this.getSubmissions().filter((x) => quizIds.has(x.quiz_id) && studentIds.has(x.student_id));
    const quizzes = quizList.map((q) => this.getQuizWithDetails(q.id)!).filter(Boolean);
    return { students, teachers, quizzes, submissions };
  }

  // =====================================================================
  // دوال المزامنة مع Supabase (تُستخدم من services/quizSync.ts)
  // =====================================================================

  /** الاختبار مع أسئلته وتعييناته كما هي محلياً (يشمل المحذوف حذفاً ناعماً) */
  public static getQuizBundle(id: string): {
    quiz: Quiz;
    questions: Question[];
    assignments: QuizAssignment[];
  } | null {
    const quiz = this.getQuizById(id);
    if (!quiz) return null;
    return {
      quiz,
      questions: this.getQuestionsByQuizId(id),
      assignments: this.getAssignmentsByQuizId(id),
    };
  }

  /** إدراج/استبدال اختبار قادم من الخادم بدون إنشاء نسخ مكررة */
  public static saveQuizBundleFromRemote(
    quiz: Quiz,
    questions: Question[],
    assignments: QuizAssignment[]
  ): void {
    const quizzes = getLocalItem<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    const idx = quizzes.findIndex((q) => q.id === quiz.id);
    if (idx >= 0) quizzes[idx] = quiz;
    else quizzes.push(quiz);
    setLocalItem(STORAGE_KEYS.QUIZZES, quizzes);

    const allQuestions = getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, []);
    setLocalItem(STORAGE_KEYS.QUESTIONS, [
      ...allQuestions.filter((q) => q.quiz_id !== quiz.id),
      ...questions.map((q) => ({ ...q, quiz_id: quiz.id })),
    ]);

    const allAssignments = getLocalItem<QuizAssignment[]>(STORAGE_KEYS.ASSIGNMENTS, []);
    setLocalItem(STORAGE_KEYS.ASSIGNMENTS, [
      ...allAssignments.filter((a) => a.quiz_id !== quiz.id),
      ...assignments.map((a) => ({ ...a, quiz_id: quiz.id })),
    ]);
  }

  /** حذف الاختبارات المحلية غير الموجودة في القائمة (للطالب: لا تبقى نسخ قديمة فيها الإجابات) */
  public static pruneQuizzesExcept(keepIds: Set<string>): void {
    setLocalItem(STORAGE_KEYS.QUIZZES, getLocalItem<Quiz[]>(STORAGE_KEYS.QUIZZES, []).filter((q) => keepIds.has(q.id)));
    setLocalItem(
      STORAGE_KEYS.QUESTIONS,
      getLocalItem<Question[]>(STORAGE_KEYS.QUESTIONS, []).filter((q) => !!q.quiz_id && keepIds.has(q.quiz_id))
    );
    setLocalItem(
      STORAGE_KEYS.ASSIGNMENTS,
      getLocalItem<QuizAssignment[]>(STORAGE_KEYS.ASSIGNMENTS, []).filter((a) => keepIds.has(a.quiz_id))
    );
  }

  /**
   * عند تسجيل الخروج (الوضع الآمن): حذف البيانات المنزّلة من هذا المتصفح حتى لا يراها
   * المستخدم التالي على جهاز مشترك (معمل الحاسب). نُبقي فقط ما لم يُرفع للخادم بعد.
   */
  public static clearCachedDataForLogout(): void {
    const pendingQuizzes = new Set(this.getPendingSync('quiz'));
    const pendingSubs = new Set(this.getPendingSync('submission'));
    this.pruneQuizzesExcept(pendingQuizzes);
    setLocalItem(STORAGE_KEYS.SUBMISSIONS, this.getSubmissions().filter((x) => pendingSubs.has(x.id)));
    setLocalItem(STORAGE_KEYS.USERS, []);
    // بنك الأسئلة فيه الإجابات النموذجية: لا يبقى على جهاز مشترك
    ['itqan_activity_local_v1', 'itqan_awards_v1', 'itqan_notifs_v1', 'itqan_question_bank_v1'].forEach((k) => localStorage.removeItem(k));
  }

  public static removeSubmissionLocal(id: string): void {
    setLocalItem(STORAGE_KEYS.SUBMISSIONS, getLocalItem<Submission[]>(STORAGE_KEYS.SUBMISSIONS, []).filter((s) => s.id !== id));
  }

  /** إدراج/استبدال تسليم قادم من الخادم */
  public static saveSubmissionFromRemote(sub: Submission): void {
    const list = getLocalItem<Submission[]>(STORAGE_KEYS.SUBMISSIONS, []);
    const idx = list.findIndex((s) => s.id === sub.id);
    if (idx >= 0) list[idx] = sub;
    else list.push(sub);
    setLocalItem(STORAGE_KEYS.SUBMISSIONS, list);
  }

  // --- قائمة الانتظار: عناصر حُفظت محلياً ولم تصل للخادم بعد ---
  public static getPendingSync(kind: 'quiz' | 'submission'): string[] {
    return getLocalItem<string[]>(`itqan_pending_${kind}_ids`, []);
  }

  public static addPendingSync(kind: 'quiz' | 'submission', id: string): void {
    const list = this.getPendingSync(kind);
    if (!list.includes(id)) {
      list.push(id);
      setLocalItem(`itqan_pending_${kind}_ids`, list);
    }
  }

  public static removePendingSync(kind: 'quiz' | 'submission', id: string): void {
    setLocalItem(
      `itqan_pending_${kind}_ids`,
      this.getPendingSync(kind).filter((x) => x !== id)
    );
  }
}

/**
 * الحقول الأساسية المؤكدة في جدول المستخدمين (Core Guaranteed Fields)
 */
export const CORE_USER_FIELDS = ['id', 'name', 'email', 'password', 'role'] as const;

/**
 * استخراج اسم العمود المفقود من رسائل خطأ Supabase
 * مثل: Could not find the 'username' column of 'users' in the schema cache
 * أو: column "username" of relation "users" does not exist
 */
export function extractMissingColumn(errorMessage: string): string | null {
  if (!errorMessage || typeof errorMessage !== 'string') return null;

  const match1 = errorMessage.match(/Could not find the '([^']+)' column/i);
  if (match1 && match1[1]) return match1[1];

  const match2 = errorMessage.match(/column "([^"]+)" of relation/i);
  if (match2 && match2[1]) return match2[1];

  const match3 = errorMessage.match(/column '([^']+)' of relation/i);
  if (match3 && match3[1]) return match3[1];

  const match4 = errorMessage.match(/column "([^"]+)" does not exist/i);
  if (match4 && match4[1]) return match4[1];

  return null;
}

/**
 * تنقية وتجهيز كائن المستخدم قبل إرساله لقاعدة بيانات Supabase (Clean Payload)
 */
export function cleanUserPayloadForSupabase(user: Partial<User>): Record<string, any> {
  const now = new Date().toISOString();
  const payload: Record<string, any> = {
    id: user.id,
    name: user.name,
    email: user.email || (user.national_id ? `${user.national_id}@itqan.edu.sa` : undefined),
    password: user.password || DEFAULT_PASSWORD,
    role: user.role,
    username: user.username || user.national_id,
    national_id: user.national_id,
    specialty_id: user.specialty_id || null,
    class_id: user.class_id || null,
    assigned_subject_ids: user.assigned_subject_ids || [],
    assigned_class_ids: user.assigned_class_ids || [],
    permissions: user.permissions || {},
    teacher_permissions: user.teacher_permissions || {},
    job_title: user.job_title || null,
    branch_id: user.branch_id || null,
    gender: user.gender || null,
    child_ids: user.child_ids || [],
    phone: user.phone || null,
    created_by: user.created_by || null,
    created_at: user.created_at || now,
    updated_at: user.updated_at || now,
  };

  // إزالة أي قيم غير معرفة (undefined)
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
}
