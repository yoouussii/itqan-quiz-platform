import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
import { StorageService } from '../services/storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';

// ==========================================
// البيانات الافتراضية للنظام
// ==========================================
const INITIAL_SUBJECTS: Subject[] = [
  { id: 'sub_1', name: 'الرياضيات', code: 'MATH101', color: '#10b981', description: 'مادة الرياضيات', icon: 'Calculator' },
  { id: 'sub_2', name: 'العلوم العامة', code: 'SCI101', color: '#6366f1', description: 'مادة العلوم العامة', icon: 'BookOpen' },
  { id: 'sub_3', name: 'اللغة العربية', code: 'ARAB101', color: '#0ea5e9', description: 'مادة اللغة العربية', icon: 'Languages' },
  { id: 'sub_4', name: 'الفيزياء', code: 'PHYS101', color: '#f59e0b', description: 'مادة الفيزياء', icon: 'Atom' },
  { id: 'sub_5', name: 'الكيمياء', code: 'CHEM101', color: '#ec4899', description: 'مادة الكيمياء', icon: 'FlaskConical' },
  { id: 'sub_6', name: 'اللغة الإنجليزية', code: 'ENG101', color: '#8b5cf6', description: 'مادة اللغة الإنجليزية', icon: 'Globe' },
];

const INITIAL_CLASSES: SchoolClass[] = [
  { id: 'class_1', name: 'الصف الأول الثانوي - شعبة (أ)', grade_level: '10' },
  { id: 'class_2', name: 'الصف الأول الثانوي - شعبة (ب)', grade_level: '10' },
  { id: 'class_3', name: 'الصف الثاني الثانوي - شعبة (أ)', grade_level: '11' },
  { id: 'class_4', name: 'الصف الثالث الثانوي - شعبة (أ)', grade_level: '12' },
];

interface AppContextType {
  currentUser: User | null;
  users: User[];
  subjects: Subject[];
  classes: SchoolClass[];
  quizzes: QuizWithDetails[];
  submissions: SubmissionWithDetails[];
  kpis: ReturnType<typeof StorageService.getDynamicKPIs>;
  currentView: string;
  setCurrentView: (view: string) => void;
  activeQuizId: string | null;
  setActiveQuizId: (id: string | null) => void;
  activeSubmissionId: string | null;
  setActiveSubmissionId: (id: string | null) => void;
  toastMessage: { text: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  login: (nationalId: string, password?: string) => Promise<boolean>;
  logout: () => void;
  switchUser: (userId: string) => void;
  createNewQuiz: (
    quiz: Omit<Quiz, 'id' | 'created_at'>,
    questions: Array<Omit<Question, 'id' | 'quiz_id'>>,
    assignments: Array<Omit<QuizAssignment, 'id' | 'quiz_id' | 'created_at'>>
  ) => Quiz;
  editingQuizId: string | null;
  setEditingQuizId: (id: string | null) => void;
  updateFullQuiz: (
    quizId: string,
    quizUpdates: Partial<Quiz>,
    questions: Array<Omit<Question, 'quiz_id' | 'id'> & { id?: string }>,
    assignments: Array<Omit<QuizAssignment, 'quiz_id' | 'created_at' | 'id'> & { id?: string }>
  ) => Quiz | null;
  updateQuizInfo: (id: string, updates: Partial<Quiz>) => void;
  deleteQuizItem: (id: string) => void;
  toggleQuizActive: (id: string) => void;
  allowStudentRetake: (quizId: string, studentId: string) => void;
  revokeStudentRetake: (quizId: string, studentId: string) => void;
  reassignQuizToTeacher: (quizId: string, newTeacherId: string) => boolean;
  submitQuizAttempt: (
    quizId: string,
    answers: Array<{ question_id: string; selected_option: number | null }>,
    timeSpentSeconds: number
  ) => Submission;
  addUser: (userData: Omit<User, 'id' | 'created_at'>) => Promise<User>;
  updateUserData: (id: string, updates: Partial<User>) => Promise<void>;
  resetUserPassword: (id: string, newPass: string) => Promise<boolean>;
  deleteUserItem: (id: string) => Promise<void>;
  addSubject: (subject: Omit<Subject, 'id'>) => Subject;
  updateSubjectData: (id: string, updates: Partial<Subject>) => void;
  deleteSubjectItem: (id: string) => void;
  addClass: (classData: Omit<SchoolClass, 'id'>) => SchoolClass;
  updateClassData: (id: string, updates: Partial<SchoolClass>) => void;
  deleteClassItem: (id: string) => void;
  resetSystemData: () => void;
  refreshData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// دالة مساعدة لدمج كائن المستخدم والتأكد من توافق وتكامل الصلاحيات والمواد والفصول
const sanitizeUser = (user: User): User => {
  const rawPerms = user.teacher_permissions || (user as any).permissions || {};
  const perms = {
    can_add_custom_subjects: !!rawPerms.can_add_custom_subjects,
    can_manage_classes: !!rawPerms.can_manage_classes,
    can_view_all_reports: !!rawPerms.can_view_all_reports,
    can_add_students: !!rawPerms.can_add_students,
    can_add_teachers: !!rawPerms.can_add_teachers,
  };

  // مواءمة المواد المسندة مع التخصص الأساسي
  let assignedSubs: string[] = [];
  if (Array.isArray(user.assigned_subject_ids) && user.assigned_subject_ids.length > 0) {
    assignedSubs = [...user.assigned_subject_ids];
  } else if (user.specialty_id) {
    assignedSubs = [user.specialty_id];
  }

  // مواءمة الفصول والشعب المسندة مع الشعبة الأساسية
  let assignedCls: string[] = [];
  if (Array.isArray(user.assigned_class_ids) && user.assigned_class_ids.length > 0) {
    assignedCls = [...user.assigned_class_ids];
  } else if (user.class_id) {
    assignedCls = [user.class_id];
  }

  return {
    ...user,
    specialty_id: user.specialty_id || assignedSubs[0] || null,
    class_id: user.class_id || assignedCls[0] || null,
    assigned_subject_ids: assignedSubs,
    assigned_class_ids: assignedCls,
    teacher_permissions: perms,
    permissions: perms,
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    StorageService.init();

    // التأكد من تثبيت المواد والفصول الافتراضية محلياً عند التشغيل
    const existingSubjects = StorageService.getSubjects();
    if (!existingSubjects || existingSubjects.length === 0) {
      localStorage.setItem('itqan_subjects_v2', JSON.stringify(INITIAL_SUBJECTS));
    }

    const existingClasses = StorageService.getClasses();
    if (!existingClasses || existingClasses.length === 0) {
      localStorage.setItem('itqan_classes_v2', JSON.stringify(INITIAL_CLASSES));
    }
  }, []);

  const [theme, setThemeState] = useState<'light' | 'dark'>(() => StorageService.getTheme());

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setThemeState(next);
    StorageService.setTheme(next);
  };

  useEffect(() => {
    StorageService.setTheme(theme);
  }, [theme]);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const u = StorageService.getCurrentUser();
    return u ? sanitizeUser(u) : null;
  });

  const [users, setUsers] = useState<User[]>(() =>
    StorageService.getUsers().map(sanitizeUser)
  );

  const [subjects, setSubjects] = useState<Subject[]>(() => {
    const loaded = StorageService.getSubjects();
    return loaded && loaded.length > 0 ? loaded : INITIAL_SUBJECTS;
  });

  const [classes, setClasses] = useState<SchoolClass[]>(() => {
    const loaded = StorageService.getClasses();
    return loaded && loaded.length > 0 ? loaded : INITIAL_CLASSES;
  });

  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const getFilteredQuizzes = useCallback((): QuizWithDetails[] => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') {
      return StorageService.getAllQuizzesWithDetails();
    }
    if (currentUser.role === 'teacher') {
      const canViewAll = currentUser.teacher_permissions?.can_view_all_reports || (currentUser as any).permissions?.can_view_all_reports;
      if (canViewAll) {
        return StorageService.getAllQuizzesWithDetails();
      }
      return StorageService.getQuizzesForTeacher(currentUser.id);
    }
    if (currentUser.role === 'student') {
      return StorageService.getQuizzesForStudent(currentUser.id);
    }
    return [];
  }, [currentUser]);

  const [quizzes, setQuizzes] = useState<QuizWithDetails[]>(() => getFilteredQuizzes());
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>(() =>
    currentUser ? StorageService.getAccessibleSubmissionsWithDetails(currentUser.id) : []
  );
  const [kpis, setKpis] = useState(() => {
    const isTeacher = currentUser?.role === 'teacher';
    const canViewAll = currentUser?.teacher_permissions?.can_view_all_reports || (currentUser as any)?.permissions?.can_view_all_reports;
    return StorageService.getDynamicKPIs(isTeacher && !canViewAll ? currentUser.id : undefined);
  });

  const refreshData = useCallback(async () => {
    const localUsers = StorageService.getUsers().map(sanitizeUser);

    if (isSupabaseConfigured()) {
      try {
        const { data: dbUsers, error } = await supabase.from('users').select('*');
        if (!error && Array.isArray(dbUsers)) {
          const dbUserIds = new Set(dbUsers.map((d: any) => d.id));
          const dbNationalIds = new Set(dbUsers.map((d: any) => d.national_id?.trim()));

          // ────────────────────────────────────────────────────────────────
          // 1. تسوية الحذف: مستخدم محلي غير موجود في Supabase
          //    → إذا كان حديث الإنشاء (< 120 ثانية)، حاول رفعه مجدداً قبل الحذف
          //    → إذا كان قديماً ولم يُرفع، احذفه محلياً
          // ────────────────────────────────────────────────────────────────
          const activeLocalUsers: ReturnType<typeof sanitizeUser>[] = [];

          for (const localU of localUsers) {
            const existsInDb =
              dbUserIds.has(localU.id) ||
              (localU.national_id && dbNationalIds.has(localU.national_id.trim()));

            if (existsInDb) {
              activeLocalUsers.push(localU);
              continue;
            }

            const ageMs = localU.created_at
              ? Date.now() - new Date(localU.created_at).getTime()
              : Infinity;

            if (ageMs < 120000) {
              // ─ حديث الإنشاء: حاول رفعه مرة أخرى إلى Supabase
              console.log(`[refreshData] Re-uploading local-only user to Supabase: ${localU.name}`);
              try {
                const now = new Date().toISOString();
                const retryRecord: Record<string, unknown> = {
                  id: localU.id,
                  national_id: localU.national_id,
                  name: localU.name,
                  username: localU.national_id,
                  email: localU.email || `${localU.national_id}@itqan.edu.sa`,
                  password: localU.password || 'itqan123',
                  role: localU.role,
                  specialty_id: localU.specialty_id || null,
                  class_id: localU.class_id || null,
                  assigned_subject_ids: localU.assigned_subject_ids || [],
                  assigned_class_ids: localU.assigned_class_ids || [],
                  permissions: localU.permissions || {},
                  teacher_permissions: localU.teacher_permissions || {},
                  created_by: localU.created_by || null,
                  created_at: localU.created_at || now,
                  updated_at: now,
                };
                const { error: retryErr } = await supabase
                  .from('users')
                  .upsert([retryRecord], { onConflict: 'national_id' });
                if (retryErr) {
                  console.error('[refreshData] Re-upload failed:', retryErr.code, retryErr.message);
                } else {
                  console.log('[refreshData] Re-upload succeeded for:', localU.name);
                  // أضف إلى مجموعات القاعدة حتى لا يُعامل كمحذوف
                  dbUserIds.add(localU.id);
                  dbNationalIds.add(localU.national_id?.trim());
                }
              } catch (retryNetErr) {
                console.error('[refreshData] Re-upload network error:', retryNetErr);
              }
              activeLocalUsers.push(localU);
            } else {
              // ─ قديم ولم يُرفع: حُذف من Supabase أو لم يُرفع أصلاً، احذفه محلياً
              console.log(`[refreshData] Removing stale local-only user: ${localU.name} (${localU.id})`);
            }
          }

          // التحقق مما إذا كان المستخدم الحالي النشط قد حُذف من قاعدة البيانات
          const currentUserId = StorageService.getCurrentUserId();
          const currentNationalId = currentUser?.national_id?.trim() || '';
          const currentIsRecent = currentUser?.created_at
            ? Date.now() - new Date(currentUser.created_at).getTime() < 120000
            : false;

          if (
            currentUserId &&
            !dbUserIds.has(currentUserId) &&
            !dbNationalIds.has(currentNationalId) &&
            !currentIsRecent
          ) {
            console.warn('[refreshData] Current user deleted from Supabase — logging out.');
            localStorage.removeItem('itqan_current_user_id_v2');
            setCurrentUser(null);
            setCurrentView('login');
          }

          // ────────────────────────────────────────────────────────────────
          // 2. دمج التعديلات بطريقة آمنة (local wins when newer)
          // ────────────────────────────────────────────────────────────────
          const mergedUsers = activeLocalUsers.map((localU) => {
            const dbU = dbUsers.find(
              (d: any) => d.id === localU.id || d.national_id === localU.national_id
            );
            if (!dbU) return localU;

            const localUpdated = localU.updated_at ? new Date(localU.updated_at).getTime() : 0;
            const dbUpdated = dbU.updated_at ? new Date(dbU.updated_at).getTime() : 0;

            // التعديل المحلي أحدث → الأولوية للنسخة المحلية
            if (localUpdated > dbUpdated && localUpdated > 0) {
              return sanitizeUser({ ...dbU, ...localU });
            }

            // دمج الصلاحيات بأمان
            const localPerms = localU.teacher_permissions || localU.permissions || {};
            const dbPerms = dbU.teacher_permissions || dbU.permissions || {};
            const mergedPerms = {
              can_add_custom_subjects: dbPerms.can_add_custom_subjects ?? localPerms.can_add_custom_subjects ?? false,
              can_manage_classes: dbPerms.can_manage_classes ?? localPerms.can_manage_classes ?? false,
              can_view_all_reports: dbPerms.can_view_all_reports ?? localPerms.can_view_all_reports ?? false,
              can_add_students: dbPerms.can_add_students ?? localPerms.can_add_students ?? false,
              can_add_teachers: dbPerms.can_add_teachers ?? localPerms.can_add_teachers ?? false,
            };

            // دمج المواد المسندة
            let mergedSubs = (Array.isArray(dbU.assigned_subject_ids) && dbU.assigned_subject_ids.length > 0)
              ? dbU.assigned_subject_ids
              : (localU.assigned_subject_ids || []);
            if (mergedSubs.length === 0 && (dbU.specialty_id || localU.specialty_id)) {
              mergedSubs = [dbU.specialty_id || localU.specialty_id];
            }

            // دمج الفصول المسندة
            let mergedCls = (Array.isArray(dbU.assigned_class_ids) && dbU.assigned_class_ids.length > 0)
              ? dbU.assigned_class_ids
              : (localU.assigned_class_ids || []);
            if (mergedCls.length === 0 && (dbU.class_id || localU.class_id)) {
              mergedCls = [dbU.class_id || localU.class_id];
            }

            return sanitizeUser({
              ...localU,
              ...dbU,
              specialty_id: dbU.specialty_id || localU.specialty_id || mergedSubs[0] || null,
              class_id: dbU.class_id || localU.class_id || mergedCls[0] || null,
              assigned_subject_ids: mergedSubs,
              assigned_class_ids: mergedCls,
              permissions: mergedPerms,
              teacher_permissions: mergedPerms,
            });
          });

          // إضافة أي مستخدمين جدد من السيرفر غير موجودين محلياً
          for (const dbU of dbUsers) {
            if (!mergedUsers.some((m) => m.id === dbU.id || m.national_id === dbU.national_id)) {
              mergedUsers.push(sanitizeUser(dbU));
            }
          }

          localStorage.setItem('itqan_users_v2', JSON.stringify(mergedUsers));
        }
      } catch (err) {
        console.warn('[refreshData] Supabase sync skipped/failed:', err);
      }
    }

    const updatedUsers = StorageService.getUsers().map(sanitizeUser);
    const loadedSubjects = StorageService.getSubjects();
    const loadedClasses = StorageService.getClasses();
    const currentUserId = StorageService.getCurrentUserId();

    setUsers(updatedUsers);
    setSubjects(loadedSubjects && loadedSubjects.length > 0 ? loadedSubjects : INITIAL_SUBJECTS);
    setClasses(loadedClasses && loadedClasses.length > 0 ? loadedClasses : INITIAL_CLASSES);

    if (currentUserId) {
      const updatedUser =
        updatedUsers.find((u) => u.id === currentUserId) ||
        updatedUsers.find((u) => u.national_id === currentUser?.national_id);

      if (updatedUser) {
        const safeUser = sanitizeUser(updatedUser);
        setCurrentUser(safeUser);

        if (safeUser.role === 'admin') {
          setQuizzes(StorageService.getAllQuizzesWithDetails());
          setKpis(StorageService.getDynamicKPIs());
        } else if (safeUser.role === 'teacher') {
          const canViewAll = safeUser.teacher_permissions?.can_view_all_reports || (safeUser as any).permissions?.can_view_all_reports;
          if (canViewAll) {
            setQuizzes(StorageService.getAllQuizzesWithDetails());
            setKpis(StorageService.getDynamicKPIs());
          } else {
            setQuizzes(StorageService.getQuizzesForTeacher(safeUser.id));
            setKpis(StorageService.getDynamicKPIs(safeUser.id));
          }
        } else if (safeUser.role === 'student') {
          setQuizzes(StorageService.getQuizzesForStudent(safeUser.id));
          setKpis(StorageService.getDynamicKPIs());
        }

        setSubmissions(StorageService.getAccessibleSubmissionsWithDetails(safeUser.id));
      }
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [currentUser?.id, currentUser?.role, refreshData]);

  const switchUser = (userId: string) => {
    StorageService.setCurrentUserId(userId);
    const user = StorageService.getUserById(userId) || null;
    setCurrentUser(user ? sanitizeUser(user) : null);
    setCurrentView('dashboard');
    setActiveQuizId(null);
    setActiveSubmissionId(null);
    showToast(`تم التبديل إلى: ${user?.name}`, 'info');
  };

  const login = async (nationalId: string, password?: string): Promise<boolean> => {
    const trimmedId = nationalId.trim();

    // 1. التحقق من Supabase إذا كان معداً
    if (isSupabaseConfigured()) {
      try {
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('national_id', trimmedId)
          .eq('password', password)
          .maybeSingle();

        if (user && !error) {
          const existingUsers = StorageService.getUsers();
          const userIndex = existingUsers.findIndex(
            (u) => u.id === user.id || u.national_id === user.national_id
          );

          const safeU = sanitizeUser(user);
          if (userIndex >= 0) {
            existingUsers[userIndex] = { ...existingUsers[userIndex], ...safeU };
          } else {
            existingUsers.push(safeU);
          }
          localStorage.setItem('itqan_users_v2', JSON.stringify(existingUsers));

          StorageService.setCurrentUserId(user.id);
          setCurrentUser(safeU);
          setCurrentView('dashboard');
          showToast(`مرحباً بك يا ${safeU.name}`, 'success');
          return true;
        }
      } catch (err) {
        console.warn('Supabase login check failed, falling back to local:', err);
      }
    }

    // 2. التحقق من التخزين المحلي الآمن
    const localUser = StorageService.authenticate(trimmedId, password);
    if (localUser) {
      const safeU = sanitizeUser(localUser);
      StorageService.setCurrentUserId(safeU.id);
      setCurrentUser(safeU);
      setCurrentView('dashboard');
      showToast(`مرحباً بك يا ${safeU.name}`, 'success');
      return true;
    }

    showToast('رقم الهوية / الرقم الأكاديمي أو كلمة المرور غير صحيحة', 'error');
    return false;
  };

  const logout = () => {
    localStorage.removeItem('itqan_current_user_id_v2');
    setCurrentUser(null);
    setCurrentView('login');
    showToast('تم تسجيل الخروج بنجاح', 'info');
  };

  const createNewQuiz = (
    quiz: Omit<Quiz, 'id' | 'created_at'>,
    questions: Array<Omit<Question, 'id' | 'quiz_id'>>,
    assignments: Array<Omit<QuizAssignment, 'id' | 'quiz_id' | 'created_at'>>
  ) => {
    const created = StorageService.createQuiz(quiz, questions, assignments);
    refreshData();
    showToast(`تم إنشاء الاختبار بنجاح: ${created.title}`, 'success');
    return created;
  };

  const updateFullQuiz = (
    quizId: string,
    quizUpdates: Partial<Quiz>,
    questions: Array<Omit<Question, 'quiz_id' | 'id'> & { id?: string }>,
    assignments: Array<Omit<QuizAssignment, 'quiz_id' | 'created_at' | 'id'> & { id?: string }>
  ) => {
    const updated = StorageService.updateFullQuiz(quizId, quizUpdates, questions, assignments);
    refreshData();
    showToast('تم حفظ وتحديث بيانات الاختبار بنجاح', 'success');
    return updated;
  };

  const updateQuizInfo = (id: string, updates: Partial<Quiz>) => {
    StorageService.updateQuiz(id, updates);
    refreshData();
    showToast('تم تحديث بيانات الاختبار بنجاح', 'success');
  };

  const deleteQuizItem = (id: string) => {
    StorageService.deleteQuiz(id);
    refreshData();
    showToast('تم حذف الاختبار واستبعاد درجاته', 'info');
  };

  const toggleQuizActive = (id: string) => {
    const updated = StorageService.toggleQuizActive(id);
    refreshData();
    if (updated) {
      showToast(
        updated.is_active ? 'تم تفعيل إتاحة الاختبار للطلاب بنجاح' : 'تم إيقاف إتاحة الاختبار',
        updated.is_active ? 'success' : 'info'
      );
    }
  };

  const allowStudentRetake = (quizId: string, studentId: string) => {
    const res = StorageService.allowStudentRetake(quizId, studentId);
    refreshData();
    showToast(res.message, res.success ? 'success' : 'error');
  };

  const revokeStudentRetake = (quizId: string, studentId: string) => {
    const res = StorageService.revokeStudentRetake(quizId, studentId);
    refreshData();
    showToast(res.message, 'info');
  };

  const reassignQuizToTeacher = (quizId: string, newTeacherId: string): boolean => {
    if (!currentUser) return false;
    const result = StorageService.reassignQuiz(quizId, newTeacherId, currentUser.id);
    if (result.success) {
      refreshData();
      showToast(result.message, 'success');
      return true;
    } else {
      showToast(result.message, 'error');
      return false;
    }
  };

  const submitQuizAttempt = (
    quizId: string,
    answers: Array<{ question_id: string; selected_option: number | null }>,
    timeSpentSeconds: number
  ): Submission => {
    if (!currentUser) throw new Error('لا يوجد مستخدم مسجل');

    const quiz = StorageService.getQuizById(quizId);
    const questions = StorageService.getQuestionsByQuizId(quizId);
    if (!quiz) throw new Error('الاختبار غير موجود');

    const isRetake = quiz.allowed_retake_student_ids?.includes(currentUser.id) || false;

    let totalScore = 0;
    const answerItems = answers.map((ans) => {
      const q = questions.find((item) => item.id === ans.question_id);
      const isCorrect = q !== undefined && ans.selected_option === q.correct_option_index;
      const marksAwarded = isCorrect ? (q?.marks || 0) : 0;
      totalScore += marksAwarded;
      return {
        question_id: ans.question_id,
        selected_option: ans.selected_option,
        is_correct: isCorrect,
        marks_awarded: marksAwarded,
      };
    });

    const totalPossibleScore = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalPossibleScore > 0 ? Math.round((totalScore / totalPossibleScore) * 100) : 0;

    const newSubmission = StorageService.createSubmission({
      quiz_id: quizId,
      student_id: currentUser.id,
      score: totalScore,
      total_possible_score: totalPossibleScore,
      percentage,
      answers_json: answerItems,
      status: 'completed',
      time_spent_seconds: timeSpentSeconds,
      is_retake: isRetake,
    });

    if (isRetake) {
      StorageService.revokeStudentRetake(quizId, currentUser.id);
    }

    refreshData();
    showToast(`تم تسليم الاختبار! حصلت على ${percentage}%`, percentage >= 60 ? 'success' : 'info');
    return newSubmission;
  };

  const addUser = async (userData: Omit<User, 'id' | 'created_at'>): Promise<User> => {
    const perms = userData.teacher_permissions || userData.permissions;
    const assignedSubs = Array.isArray(userData.assigned_subject_ids)
      ? userData.assigned_subject_ids
      : (userData.specialty_id ? [userData.specialty_id] : []);
    const assignedCls = Array.isArray(userData.assigned_class_ids)
      ? userData.assigned_class_ids
      : (userData.class_id ? [userData.class_id] : []);

    const now = new Date().toISOString();
    const safeUserData = {
      ...userData,
      specialty_id: userData.specialty_id || assignedSubs[0] || null,
      class_id: userData.class_id || assignedCls[0] || null,
      assigned_subject_ids: assignedSubs,
      assigned_class_ids: assignedCls,
      teacher_permissions: perms,
      permissions: perms,
      updated_at: now,
    };

    // ✅ 1. حفظ محلي فوري في localStorage
    const newUser = StorageService.createUser(safeUserData);

    // ✅ 2. تحديث React state فوراً (optimistic UI) لتجنب الاختفاء
    const sanitized = sanitizeUser(newUser);
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === sanitized.id || u.national_id === sanitized.national_id);
      return exists ? prev : [...prev, sanitized];
    });

    // ✅ 3. await مزامنة Supabase قبل استدعاء refreshData
    if (isSupabaseConfigured()) {
      try {
        // payload كامل مع جميع الحقول المطلوبة
        const dbRecord: Record<string, unknown> = {
          id: newUser.id,
          national_id: newUser.national_id,
          name: newUser.name,
          // username و email — قد تكون مطلوبة حسب إعداد الجدول
          username: newUser.national_id,
          email: newUser.email || `${newUser.national_id}@itqan.edu.sa`,
          password: newUser.password || 'itqan123',
          role: newUser.role,
          specialty_id: newUser.specialty_id || null,
          class_id: newUser.class_id || null,
          // مصفوفات jsonb / text[]
          assigned_subject_ids: newUser.assigned_subject_ids || [],
          assigned_class_ids: newUser.assigned_class_ids || [],
          // كائنات jsonb للصلاحيات
          permissions: newUser.permissions || {},
          teacher_permissions: newUser.teacher_permissions || {},
          created_by: newUser.created_by || null,
          created_at: newUser.created_at || now,
          updated_at: now,
        };

        // محاولة #1: upsert بالـ payload الكامل
        const { error: upsertError } = await supabase
          .from('users')
          .upsert([dbRecord], { onConflict: 'national_id' });

        if (upsertError) {
          console.error('[addUser] Supabase upsert (full schema) failed:', upsertError.code, upsertError.message, upsertError.details);

          // محاولة #2: مخطط بيانات أدنى لتخطي أعمدة غير موجودة
          const minimalRecord: Record<string, unknown> = {
            id: newUser.id,
            national_id: newUser.national_id,
            name: newUser.name,
            password: newUser.password || 'itqan123',
            role: newUser.role,
            specialty_id: newUser.specialty_id || null,
            class_id: newUser.class_id || null,
            created_at: newUser.created_at || now,
            updated_at: now,
          };

          const { error: minimalError } = await supabase
            .from('users')
            .upsert([minimalRecord], { onConflict: 'national_id' });

          if (minimalError) {
            console.error('[addUser] Supabase upsert (minimal schema) also failed:', minimalError.code, minimalError.message, minimalError.details);
            console.error('[addUser] Hint:', minimalError.hint, '| Details:', minimalError.details);
            showToast('تم الحفظ محلياً — تحقق من إعدادات RLS وأعمدة جدول users في Supabase', 'info');
          } else {
            console.log('[addUser] Supabase minimal upsert succeeded for:', newUser.name);
          }
        } else {
          console.log('[addUser] Supabase upsert succeeded for:', newUser.name);
        }
      } catch (networkErr) {
        console.error('[addUser] Network error syncing to Supabase:', networkErr);
        showToast('تم الحفظ محلياً — لا يوجد اتصال بالسيرفر', 'info');
      }
    }

    // ✅ 4. تحديث شامل للحالة بعد اكتمال مزامنة Supabase
    await refreshData();
    showToast(`تمت إضافة المستخدم (${newUser.name}) بنجاح`, 'success');
    return newUser;
  };

  // دالة تحديث بيانات المستخدم المصلحة بالكامل مع الحفاظ التام على الصلاحيات والمواد
  const updateUserData = async (id: string, updates: Partial<User>): Promise<void> => {
    try {
      const perms = updates.teacher_permissions || updates.permissions;
      const assignedSubs = Array.isArray(updates.assigned_subject_ids)
        ? updates.assigned_subject_ids
        : (updates.specialty_id ? [updates.specialty_id] : undefined);
      const assignedCls = Array.isArray(updates.assigned_class_ids)
        ? updates.assigned_class_ids
        : (updates.class_id ? [updates.class_id] : undefined);

      const now = new Date().toISOString();
      const safeUpdates: Partial<User> = {
        ...updates,
        ...(perms ? { teacher_permissions: perms, permissions: perms } : {}),
        ...(assignedSubs !== undefined ? { assigned_subject_ids: assignedSubs, specialty_id: assignedSubs[0] || null } : {}),
        ...(assignedCls !== undefined ? { assigned_class_ids: assignedCls, class_id: assignedCls[0] || null } : {}),
        updated_at: now,
      };

      // 1. تحديث التخزين المحلي فوراً
      StorageService.updateUser(id, safeUpdates);

      // 2. تحديث الحالة في React فوراً دون انتظار أي ردود شبكية
      setUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === id ? sanitizeUser({ ...u, ...safeUpdates }) : u))
      );

      if (currentUser?.id === id) {
        const updatedSelf = sanitizeUser({ ...currentUser, ...safeUpdates });
        setCurrentUser(updatedSelf);
      }

      // 3. مزامنة التحديث مع Supabase إن وُجد وبطريقة تضمن عدم الفشل
      if (isSupabaseConfigured()) {
        try {
          const dbPayload: any = {
            name: safeUpdates.name,
            national_id: safeUpdates.national_id,
            role: safeUpdates.role,
            specialty_id: safeUpdates.specialty_id,
            class_id: safeUpdates.class_id,
            assigned_subject_ids: safeUpdates.assigned_subject_ids,
            assigned_class_ids: safeUpdates.assigned_class_ids,
            permissions: safeUpdates.permissions,
            teacher_permissions: safeUpdates.teacher_permissions,
            updated_at: now,
          };
          if (safeUpdates.password) {
            dbPayload.password = safeUpdates.password;
          }
          Object.keys(dbPayload).forEach((k) => dbPayload[k] === undefined && delete dbPayload[k]);

          const { error } = await supabase.from('users').update(dbPayload).eq('id', id);
          if (error) {
            console.warn('Supabase full update failed, retrying minimal fields:', error.message);
            const fallbackPayload: any = {
              name: safeUpdates.name,
              national_id: safeUpdates.national_id,
              role: safeUpdates.role,
              specialty_id: safeUpdates.specialty_id,
              class_id: safeUpdates.class_id,
            };
            if (safeUpdates.password) fallbackPayload.password = safeUpdates.password;
            Object.keys(fallbackPayload).forEach((k) => fallbackPayload[k] === undefined && delete fallbackPayload[k]);
            await supabase.from('users').update(fallbackPayload).eq('id', id);
          }
        } catch (dbErr) {
          console.warn('Error updating user in Supabase:', dbErr);
        }
      }

      // 4. إعادة تنشيط الحالة العامة للتطبيق
      refreshData();
      showToast('تم حفظ تعديلات المستخدم والصلاحيات والمواد بنجاح', 'success');
    } catch (error) {
      console.error('Error updating user data:', error);
      showToast('حدث خطأ أثناء حفظ التعديلات', 'error');
    }
  };

  // دالة إعادة تعيين كلمة المرور
  const resetUserPassword = async (id: string, newPass: string): Promise<boolean> => {
    try {
      const now = new Date().toISOString();
      StorageService.updateUser(id, { password: newPass, updated_at: now });

      setUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === id ? { ...u, password: newPass, updated_at: now } : u))
      );

      if (currentUser?.id === id) {
        setCurrentUser((prev) => (prev ? { ...prev, password: newPass, updated_at: now } : null));
      }

      if (isSupabaseConfigured()) {
        try {
          await supabase.from('users').update({ password: newPass, updated_at: now }).eq('id', id);
        } catch (dbErr) {
          console.warn('Error updating password in Supabase:', dbErr);
        }
      }

      refreshData();
      showToast('تمت إعادة تعيين كلمة المرور بنجاح', 'success');
      return true;
    } catch (error) {
      console.error('Error resetting password:', error);
      showToast('حدث خطأ أثناء إعادة تعيين كلمة المرور', 'error');
      return false;
    }
  };

  const deleteUserItem = async (id: string) => {
    StorageService.deleteUser(id);

    if (isSupabaseConfigured()) {
      try {
        await supabase.from('users').delete().eq('id', id);
      } catch (err) {
        console.warn('Error deleting user from Supabase:', err);
      }
    }

    refreshData();
    showToast('تم حذف المستخدم من النظام', 'info');
  };

  const addSubject = (subj: Omit<Subject, 'id'>) => {
    const currentSubjects = StorageService.getSubjects();
    const existingList = currentSubjects && currentSubjects.length > 0 ? currentSubjects : INITIAL_SUBJECTS;

    const created: Subject = {
      ...subj,
      id: `sub_${Date.now()}`,
      created_by: currentUser?.id,
    };

    const newList = [...existingList, created];
    localStorage.setItem('itqan_subjects_v2', JSON.stringify(newList));
    setSubjects(newList);

    if (currentUser && currentUser.role === 'teacher') {
      const currentAssigned = currentUser.assigned_subject_ids || [];
      const updatedAssigned = Array.from(new Set([...currentAssigned, created.id]));
      updateUserData(currentUser.id, { assigned_subject_ids: updatedAssigned });
    } else {
      refreshData();
    }

    showToast(`تمت إضافة المادة (${created.name}) بنجاح`, 'success');
    return created;
  };

  const updateSubjectData = (id: string, updates: Partial<Subject>) => {
    StorageService.updateSubject(id, updates);
    refreshData();
    showToast('تم تحديث المادة بنجاح', 'success');
  };

  const deleteSubjectItem = (id: string) => {
    StorageService.deleteSubject(id);
    refreshData();
    showToast('تم حذف المادة بنجاح', 'info');
  };

  const addClass = (cls: Omit<SchoolClass, 'id'>) => {
    const currentClasses = StorageService.getClasses();
    const existingList = currentClasses && currentClasses.length > 0 ? currentClasses : INITIAL_CLASSES;

    const created: SchoolClass = {
      ...cls,
      id: `class_${Date.now()}`,
      created_by: currentUser?.id,
    };

    const newList = [...existingList, created];
    localStorage.setItem('itqan_classes_v2', JSON.stringify(newList));
    setClasses(newList);

    if (currentUser && currentUser.role === 'teacher') {
      const currentAssigned = currentUser.assigned_class_ids || [];
      const updatedAssigned = Array.from(new Set([...currentAssigned, created.id]));
      updateUserData(currentUser.id, { assigned_class_ids: updatedAssigned });
    } else {
      refreshData();
    }

    showToast(`تمت إضافة الشعبة/الصف (${created.name}) بنجاح`, 'success');
    return created;
  };

  const updateClassData = (id: string, updates: Partial<SchoolClass>) => {
    StorageService.updateClass(id, updates);
    refreshData();
    showToast('تم تحديث الشعبة بنجاح', 'success');
  };

  const deleteClassItem = (id: string) => {
    StorageService.deleteClass(id);
    refreshData();
    showToast('تم حذف الشعبة بنجاح', 'info');
  };

  const resetSystemData = () => {
    StorageService.resetToSeedData();
    localStorage.setItem('itqan_subjects_v2', JSON.stringify(INITIAL_SUBJECTS));
    localStorage.setItem('itqan_classes_v2', JSON.stringify(INITIAL_CLASSES));
    refreshData();
    showToast('تمت استعادة البيانات التجريبية لمنصة إتقان بنجاح', 'success');
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        subjects,
        classes,
        quizzes,
        submissions,
        kpis,
        currentView,
        setCurrentView,
        activeQuizId,
        setActiveQuizId,
        activeSubmissionId,
        setActiveSubmissionId,
        toastMessage,
        showToast,
        theme,
        toggleTheme,
        login,
        logout,
        switchUser,
        createNewQuiz,
        editingQuizId,
        setEditingQuizId,
        updateFullQuiz,
        updateQuizInfo,
        deleteQuizItem,
        toggleQuizActive,
        allowStudentRetake,
        revokeStudentRetake,
        reassignQuizToTeacher,
        submitQuizAttempt,
        addUser,
        updateUserData,
        resetUserPassword,
        deleteUserItem,
        addSubject,
        updateSubjectData,
        deleteSubjectItem,
        addClass,
        updateClassData,
        deleteClassItem,
        resetSystemData,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
