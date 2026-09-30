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
import {
  StorageService,
  cleanUserPayloadForSupabase,
  extractMissingColumn,
  CORE_USER_FIELDS,
} from '../services/storage';
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

// دالة مساعدة لدمج كائن المستخدم والتأكد من توافق وتكامل الصلاحيات والمواد والفصول واسم المستخدم
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
    username: user.username || user.national_id,
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
    // 1. قراءة المستخدمين الحاليين من التخزين المحلي الآمن
    const localUsers = StorageService.getUsers().map(sanitizeUser);
    let mergedUsers = [...localUsers];

    if (isSupabaseConfigured()) {
      try {
        const { data: dbUsers, error } = await supabase.from('users').select('*');
        if (!error && Array.isArray(dbUsers)) {
          // دمج ذكي وآمن (Safe Merge):
          // نبدأ بكافة المستخدمين المحليين ونحدّثهم إذا وُجدت نسخة في Supabase
          // ولا نحذف أي مستخدم محلي مطلقاً حتى وإن لم يأتِ في نتائج استعلام Supabase
          mergedUsers = localUsers.map((localU) => {
            const dbU = dbUsers.find(
              (d: any) =>
                (d.id && d.id === localU.id) ||
                (d.national_id && d.national_id.trim() === localU.national_id?.trim())
            );
            if (!dbU) return localU; // الحفاظ على الحساب المحلي دون حذفه

            const localUpdated = localU.updated_at ? new Date(localU.updated_at).getTime() : 0;
            const dbUpdated = dbU.updated_at ? new Date(dbU.updated_at).getTime() : 0;

            // إذا كان التعديل المحلي أحدث أو مساوياً (تم حفظه محلياً للتو)، الأولوية الكاملة والنهائية للنسخة المحلية
            if (localUpdated >= dbUpdated && localUpdated > 0) {
              return sanitizeUser({ ...dbU, ...localU });
            }

            // في حال كانت النسخة على السيرفر أحدث زمناً:
            // نأخذ بيانات السيرفر، مع الحفاظ الكامل على الصلاحيات والمواد والفصول المحلية إذا لم تكن موجودة بالسيرفر
            const dbHasPerms = dbU.teacher_permissions && typeof dbU.teacher_permissions === 'object' && Object.keys(dbU.teacher_permissions).length > 0;
            const dbHasSubs = Array.isArray(dbU.assigned_subject_ids);
            const dbHasCls = Array.isArray(dbU.assigned_class_ids);

            return sanitizeUser({
              ...localU,
              ...dbU,
              specialty_id: dbU.specialty_id !== undefined ? dbU.specialty_id : localU.specialty_id,
              class_id: dbU.class_id !== undefined ? dbU.class_id : localU.class_id,
              assigned_subject_ids: dbHasSubs ? dbU.assigned_subject_ids : (localU.assigned_subject_ids || []),
              assigned_class_ids: dbHasCls ? dbU.assigned_class_ids : (localU.assigned_class_ids || []),
              teacher_permissions: dbHasPerms ? dbU.teacher_permissions : localU.teacher_permissions,
              permissions: dbHasPerms ? (dbU.permissions || dbU.teacher_permissions) : localU.permissions,
            });
          });

          // إضافة أي حسابات جديدة موجودة في Supabase وغير مسجلة محلياً
          const deletedIds = StorageService.getDeletedUserIds();
          for (const dbU of dbUsers) {
            if (deletedIds.includes(dbU.id)) continue;
            const alreadyExists = mergedUsers.some(
              (m) =>
                (dbU.id && m.id === dbU.id) ||
                (dbU.national_id && m.national_id?.trim() === dbU.national_id?.trim())
            );
            if (!alreadyExists) {
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

    // الحفاظ التام على جلسة المستخدم في localStorage دون تسجيل خروج قسري مطلقاً
    if (currentUserId) {
      const updatedUser =
        updatedUsers.find((u) => u.id === currentUserId) ||
        updatedUsers.find((u) => u.national_id === currentUser?.national_id) ||
        currentUser;

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
  }, [currentUser]);

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

    // 1. التحقق من التخزين المحلي الموثوق أولاً (Fast & Reliable Session Persistence)
    const localUser = StorageService.authenticate(trimmedId, password);
    if (localUser) {
      const safeU = sanitizeUser(localUser);
      StorageService.setCurrentUserId(safeU.id);
      setCurrentUser(safeU);
      setCurrentView('dashboard');
      showToast(`مرحباً بك يا ${safeU.name}`, 'success');

      // مزامنة أحدث البيانات من السيرفر بهدوء في الخلفية
      if (isSupabaseConfigured()) {
        (async () => {
          try {
            const { data: remoteUser } = await supabase
              .from('users')
              .select('*')
              .eq('national_id', trimmedId)
              .maybeSingle();
            if (remoteUser) {
              StorageService.updateUser(safeU.id, remoteUser);
            }
          } catch {
            // تجاهل أي خطأ مؤقت في الاتصال
          }
        })();
      }
      return true;
    }

    // 2. إذا لم يكن مسجلاً محلياً، التحقق من Supabase (حسابات مضافة على السيرفر مباشرة)
    if (isSupabaseConfigured()) {
      try {
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('national_id', trimmedId)
          .eq('password', password)
          .maybeSingle();

        if (user && !error) {
          const safeU = sanitizeUser(user);
          const existingUsers = StorageService.getUsers();
          const userIndex = existingUsers.findIndex(
            (u) => (user.id && u.id === user.id) || (user.national_id && u.national_id === user.national_id)
          );

          if (userIndex >= 0) {
            existingUsers[userIndex] = { ...existingUsers[userIndex], ...safeU };
          } else {
            existingUsers.push(safeU);
          }
          localStorage.setItem('itqan_users_v2', JSON.stringify(existingUsers));

          StorageService.setCurrentUserId(safeU.id);
          setCurrentUser(safeU);
          setCurrentView('dashboard');
          showToast(`مرحباً بك يا ${safeU.name}`, 'success');
          return true;
        }
      } catch (err) {
        console.warn('Supabase login check failed:', err);
      }
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

    // ✅ 3. المزامنة مع Supabase بتنقية الكائن وحذف أي حقل غير موجود تلقائياً
    if (isSupabaseConfigured()) {
      let payload = cleanUserPayloadForSupabase({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email || `${newUser.national_id}@itqan.edu.sa`,
        password: newUser.password || 'itqan123',
        role: newUser.role,
        username: newUser.username || newUser.national_id,
        national_id: newUser.national_id,
        specialty_id: newUser.specialty_id || null,
        class_id: newUser.class_id || null,
        assigned_subject_ids: newUser.assigned_subject_ids || [],
        assigned_class_ids: newUser.assigned_class_ids || [],
        permissions: newUser.permissions || {},
        teacher_permissions: newUser.teacher_permissions || {},
        created_by: newUser.created_by || currentUser?.id || null,
        created_at: newUser.created_at || now,
        updated_at: now,
      });

      let attempts = 0;
      const maxAttempts = 10;
      let isInserted = false;

      while (attempts < maxAttempts && !isInserted) {
        attempts++;
        try {
          let { error } = await supabase.from('users').insert([payload]);

          if (!error) {
            isInserted = true;
            console.log(`[addUser] Successfully saved user to Supabase (attempt ${attempts}):`, newUser.name);
            break;
          }

          // إذا كان المستخدم مسجلاً بالفعل، تحديثه
          if (error.code === '23505') {
            const updateRes = await supabase.from('users').update(payload).eq('id', newUser.id);
            if (!updateRes.error) {
              isInserted = true;
              break;
            }
            error = updateRes.error;
          }

          // التقاط الخطأ وفحص ما إذا كان ناتجاً عن عمود مفقود مثل username أو غيره
          const missingColumn = extractMissingColumn(error.message || '');
          if (missingColumn && missingColumn in payload && !['id', 'name', 'role'].includes(missingColumn)) {
            console.warn(`[addUser] Column '${missingColumn}' not found in Supabase. Removing from payload and retrying...`);
            delete payload[missingColumn];
            continue; // إعادة المحاولة بدون الحقل المسبب للخطأ
          }

          // إذا كان خطأ أعمدة عام في schema cache (PGRST204)
          if (error.message?.includes('column') || error.code === 'PGRST204') {
            console.warn(`[addUser] Schema column error, isolating core fields only:`, error.message);
            const corePayload: Record<string, any> = {
              id: newUser.id,
              name: newUser.name,
              email: newUser.email || `${newUser.national_id}@itqan.edu.sa`,
              password: newUser.password || 'itqan123',
              role: newUser.role,
            };
            if (payload.national_id) corePayload.national_id = payload.national_id;
            payload = corePayload;
            continue;
          }

          console.warn('[addUser] Supabase insert warning:', error.message);
          break;
        } catch (networkErr: any) {
          console.warn('[addUser] Network warning syncing to Supabase:', networkErr?.message);
          break;
        }
      }
    }

    // ✅ 4. تأكيد الإضافة وتحديث الواجهة مباشرة من البيانات المحلية الموثوقة
    showToast(`تمت إضافة المستخدم (${newUser.name}) بنجاح`, 'success');
    return sanitized;
  };

  // دالة تحديث بيانات المستخدم المصلحة بالكامل مع الحفاظ التام على الصلاحيات والمواد
  const updateUserData = async (id: string, updates: Partial<User>): Promise<void> => {
    try {
      const now = new Date().toISOString();

      // توحيد الصلاحيات والمصفوفات
      const hasPerms = 'teacher_permissions' in updates || 'permissions' in updates;
      const perms = hasPerms
        ? (updates.teacher_permissions || updates.permissions || undefined)
        : undefined;

      const hasAssignedSubs = Array.isArray(updates.assigned_subject_ids);
      const assignedSubs = hasAssignedSubs
        ? [...updates.assigned_subject_ids!]
        : ('specialty_id' in updates
            ? (updates.specialty_id ? [updates.specialty_id] : [])
            : undefined);

      const hasAssignedCls = Array.isArray(updates.assigned_class_ids);
      const assignedCls = hasAssignedCls
        ? [...updates.assigned_class_ids!]
        : ('class_id' in updates
            ? (updates.class_id ? [updates.class_id] : [])
            : undefined);

      // 1. تحديث التخزين المحلي فوراً (Optimistic LocalStorage Update)
      const updatedUser = StorageService.updateUser(id, { ...updates, updated_at: now });
      if (!updatedUser) {
        showToast('لم يتم العثور على المستخدم المطلوب تعديله', 'error');
        return;
      }

      // 2. تحديث الحالة في React فوراً (Optimistic UI Update)
      const sanitizedUser = sanitizeUser(updatedUser);
      setUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === id ? sanitizedUser : u))
      );

      if (currentUser?.id === id) {
        setCurrentUser(sanitizedUser);

        if (sanitizedUser.role === 'admin') {
          setQuizzes(StorageService.getAllQuizzesWithDetails());
          setKpis(StorageService.getDynamicKPIs());
        } else if (sanitizedUser.role === 'teacher') {
          const canViewAll =
            sanitizedUser.teacher_permissions?.can_view_all_reports ||
            (sanitizedUser as any).permissions?.can_view_all_reports;
          if (canViewAll) {
            setQuizzes(StorageService.getAllQuizzesWithDetails());
            setKpis(StorageService.getDynamicKPIs());
          } else {
            setQuizzes(StorageService.getQuizzesForTeacher(sanitizedUser.id));
            setKpis(StorageService.getDynamicKPIs(sanitizedUser.id));
          }
        }
      }

      showToast('تم حفظ التعديلات بنجاح', 'success');

      // 3. مزامنة التحديث مع Supabase في الخلفية
      if (isSupabaseConfigured()) {
        try {
          const cleanPayload: Record<string, any> = {
            name: sanitizedUser.name,
            email: sanitizedUser.email,
            username: sanitizedUser.username,
            national_id: sanitizedUser.national_id,
            role: sanitizedUser.role,
            specialty_id: sanitizedUser.specialty_id,
            class_id: sanitizedUser.class_id,
            assigned_subject_ids: sanitizedUser.assigned_subject_ids,
            assigned_class_ids: sanitizedUser.assigned_class_ids,
            permissions: sanitizedUser.permissions,
            teacher_permissions: sanitizedUser.teacher_permissions,
            updated_at: now,
          };
          if (updates.password && updates.password.trim()) {
            cleanPayload.password = updates.password.trim();
          }
          // إزالة المفاتيح غير المعرفة (undefined)
          Object.keys(cleanPayload).forEach((k) => cleanPayload[k] === undefined && delete cleanPayload[k]);

          let attempts = 0;
          const maxAttempts = 8;
          let isSynced = false;

          while (attempts < maxAttempts && !isSynced) {
            attempts++;
            try {
              const { error } = await supabase
                .from('users')
                .update(cleanPayload)
                .eq('id', id);

              if (!error) {
                isSynced = true;
                console.log(`[updateUserData] Supabase update succeeded on attempt ${attempts} for user ${id}`);
                break;
              }

              // فحص العمود المفقود وحذفه وإعادة المحاولة
              const missingCol = extractMissingColumn(error.message || '');
              if (missingCol && missingCol in cleanPayload) {
                console.warn(`[updateUserData] Column '${missingCol}' missing in Supabase, stripping and retrying...`);
                delete cleanPayload[missingCol];
                continue;
              }

              if (error.message?.includes('column') || error.code === 'PGRST204') {
                console.warn('[updateUserData] Column mismatch error, trying core fields:', error.message);
                const corePayload: Record<string, any> = {};
                ['name', 'email', 'password', 'role'].forEach((k) => {
                  if ((cleanPayload as any)[k] !== undefined) corePayload[k] = (cleanPayload as any)[k];
                });
                const retryCore = await supabase.from('users').update(corePayload).eq('id', id);
                if (!retryCore.error) {
                  isSynced = true;
                }
                break;
              }

              console.warn('[updateUserData] Supabase update warning:', error.message);
              break;
            } catch (netErr: any) {
              console.warn('[updateUserData] Network error syncing update:', netErr?.message);
              break;
            }
          }
        } catch (dbErr) {
          console.warn('[updateUserData] Background Supabase sync error (local state preserved):', dbErr);
        }
      }
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
    // 1. حذف من التخزين المحلي وتسجيل المعرف في قائمة المحذوفين
    StorageService.deleteUser(id);

    // 2. تحديث React State فوراً لإزالة المستخدم من الواجهة
    setUsers((prev) => prev.filter((u) => u.id !== id));

    // 3. حذف من Supabase
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) {
          console.warn('[deleteUserItem] Supabase delete warning:', error.message);
        } else {
          console.log(`[deleteUserItem] User ${id} deleted from Supabase successfully`);
        }
      } catch (err) {
        console.warn('[deleteUserItem] Network error deleting from Supabase:', err);
      }
    }

    showToast('تم حذف المستخدم من النظام نهائياً', 'info');
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
