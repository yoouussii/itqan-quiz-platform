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
// تم إلغاء البيانات الافتراضية — Supabase هو المصدر الوحيد للبيانات

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
  ) => Promise<Quiz | null> | Quiz | null;
  updateQuizInfo: (id: string, updates: Partial<Quiz>) => Promise<void> | void;
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
  addSubject: (subject: Omit<Subject, 'id'>) => Promise<Subject> | Subject;
  updateSubjectData: (id: string, updates: Partial<Subject>) => Promise<void> | void;
  deleteSubjectItem: (id: string) => Promise<void> | void;
  addClass: (classData: Omit<SchoolClass, 'id'>) => Promise<SchoolClass> | SchoolClass;
  updateClassData: (id: string, updates: Partial<SchoolClass>) => Promise<void> | void;
  deleteClassItem: (id: string) => Promise<void> | void;
  resetSystemData: () => void;
  refreshData: () => Promise<void> | void;
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
    return StorageService.getSubjects();
  });

  const [classes, setClasses] = useState<SchoolClass[]>(() => {
    return StorageService.getClasses();
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

            // إذا كان التعديل المحلي أحدث أو مساوياً (تم حفظه محلياً)، أو إذا لم يكن لدى السيرفر تاريخ تعديل صالح:
            // الأولوية الكاملة والنهائية للنسخة المحلية لمنع أي تراجع أو مسح للبيانات
            if (localUpdated >= dbUpdated || !dbU.updated_at) {
              return sanitizeUser({
                ...dbU,
                ...localU,
                // تثبيت الحقول المزدوجة وضمان عدم تفريغها
                class_id: localU.class_id || localU.assigned_class_ids?.[0] || null,
                assigned_class_ids: localU.assigned_class_ids && localU.assigned_class_ids.length > 0
                  ? localU.assigned_class_ids
                  : (localU.class_id ? [localU.class_id] : []),
                specialty_id: localU.specialty_id || localU.assigned_subject_ids?.[0] || null,
                assigned_subject_ids: localU.assigned_subject_ids && localU.assigned_subject_ids.length > 0
                  ? localU.assigned_subject_ids
                  : (localU.specialty_id ? [localU.specialty_id] : []),
              });
            }

            // في حال كانت النسخة على السيرفر أحدث زمناً:
            // نأخذ بيانات السيرفر دون مسح أي فصول أو مواد أو صلاحيات إذا كانت فارغة أو null في السيرفر
            const dbHasPerms = dbU.teacher_permissions && typeof dbU.teacher_permissions === 'object' && Object.keys(dbU.teacher_permissions).length > 0;
            const dbHasSubs = Array.isArray(dbU.assigned_subject_ids) && dbU.assigned_subject_ids.length > 0;
            const dbHasCls = Array.isArray(dbU.assigned_class_ids) && dbU.assigned_class_ids.length > 0;

            const finalCls = dbHasCls
              ? dbU.assigned_class_ids
              : (localU.assigned_class_ids && localU.assigned_class_ids.length > 0
                  ? localU.assigned_class_ids
                  : (dbU.class_id ? [dbU.class_id] : (localU.class_id ? [localU.class_id] : [])));
            const finalClassId = dbU.class_id || localU.class_id || finalCls[0] || null;

            const finalSubs = dbHasSubs
              ? dbU.assigned_subject_ids
              : (localU.assigned_subject_ids && localU.assigned_subject_ids.length > 0
                  ? localU.assigned_subject_ids
                  : (dbU.specialty_id ? [dbU.specialty_id] : (localU.specialty_id ? [localU.specialty_id] : [])));
            const finalSpecialtyId = dbU.specialty_id || localU.specialty_id || finalSubs[0] || null;

            return sanitizeUser({
              ...localU,
              ...dbU,
              specialty_id: finalSpecialtyId,
              class_id: finalClassId,
              assigned_subject_ids: finalSubs,
              assigned_class_ids: finalCls,
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

    // 2. مزامنة واستدامة المواد (Subjects) مع Supabase
    let localSubjects = StorageService.getSubjects() || [];
    const deletedSubjectIds = StorageService.getDeletedSubjectIds();
    localSubjects = localSubjects.filter((s) => !deletedSubjectIds.includes(s.id));

    if (isSupabaseConfigured()) {
      try {
        const { data: dbSubjects, error: subjErr } = await supabase.from('subjects').select('*');
        if (!subjErr && Array.isArray(dbSubjects)) {
          const validDbSubjects = dbSubjects.filter((s: any) => s && s.id && !deletedSubjectIds.includes(s.id));
          const subMap = new Map<string, Subject>();
          validDbSubjects.forEach((dbS: any) => {
            subMap.set(dbS.id, {
              id: dbS.id,
              name: dbS.name || 'مادة بدون اسم',
              code: dbS.code || dbS.id,
              color: dbS.color || '#4f46e5',
              description: dbS.description || '',
              icon: dbS.icon || 'BookOpen',
              created_by: dbS.created_by,
            });
          });
          for (const localS of localSubjects) {
            if (!subMap.has(localS.id)) {
              subMap.set(localS.id, localS);
              supabase.from('subjects').insert({
                id: localS.id,
                name: localS.name,
                code: localS.code,
                color: localS.color,
                description: localS.description,
                icon: localS.icon,
                created_by: localS.created_by,
              }).then(({ error }) => {
                if (error) console.warn('[refreshData] Sync local subject to Supabase warning:', error.message);
              });
            } else {
              subMap.set(localS.id, { ...subMap.get(localS.id)!, ...localS });
            }
          }
          localSubjects = Array.from(subMap.values());
          localStorage.setItem('itqan_subjects_v2', JSON.stringify(localSubjects));
        }
      } catch (err) {
        console.warn('[refreshData] Subjects Supabase sync skipped:', err);
      }
    }

    // 3. مزامنة واستدامة الفصول (Classes) مع Supabase
    let localClasses = StorageService.getClasses() || [];
    const deletedClassIds = StorageService.getDeletedClassIds();
    localClasses = localClasses.filter((c) => !deletedClassIds.includes(c.id));

    if (isSupabaseConfigured()) {
      try {
        const { data: dbClasses, error: clsErr } = await supabase.from('classes').select('*');
        if (!clsErr && Array.isArray(dbClasses)) {
          const validDbClasses = dbClasses.filter((c: any) => c && c.id && !deletedClassIds.includes(c.id));
          const clsMap = new Map<string, SchoolClass>();
          validDbClasses.forEach((dbC: any) => {
            clsMap.set(dbC.id, {
              id: dbC.id,
              name: dbC.name || 'فصل بدون اسم',
              grade_level: dbC.grade_level || 'المرحلة الدراسية',
              student_count: dbC.student_count || 0,
              created_by: dbC.created_by,
            });
          });
          for (const localC of localClasses) {
            if (!clsMap.has(localC.id)) {
              clsMap.set(localC.id, localC);
              supabase.from('classes').insert({
                id: localC.id,
                name: localC.name,
                grade_level: localC.grade_level,
                student_count: localC.student_count || 0,
                created_by: localC.created_by,
              }).then(({ error }) => {
                if (error) console.warn('[refreshData] Sync local class to Supabase warning:', error.message);
              });
            } else {
              clsMap.set(localC.id, { ...clsMap.get(localC.id)!, ...localC });
            }
          }
          localClasses = Array.from(clsMap.values());
          localStorage.setItem('itqan_classes_v2', JSON.stringify(localClasses));
        }
      } catch (err) {
        console.warn('[refreshData] Classes Supabase sync skipped:', err);
      }
    }

    const currentUserId = StorageService.getCurrentUserId();

    setUsers(updatedUsers);
    setSubjects(localSubjects);
    setClasses(localClasses);

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
    const createdWithDetails = StorageService.getQuizWithDetails(created.id);
    if (createdWithDetails) {
      setQuizzes((prev) => [createdWithDetails, ...prev]);
    }
    showToast(`تم إنشاء الاختبار بنجاح: ${created.title}`, 'success');
    return created;
  };

  const updateFullQuiz = async (
    quizId: string,
    quizUpdates: Partial<Quiz>,
    questions: Array<Omit<Question, 'quiz_id' | 'id'> & { id?: string }>,
    assignments: Array<Omit<QuizAssignment, 'quiz_id' | 'created_at' | 'id'> & { id?: string }>
  ) => {
    // 1. تحديث التخزين المحلي فوراً
    const updated = StorageService.updateFullQuiz(quizId, quizUpdates, questions, assignments);

    // 2. تحديث قائمة الاختبارات في React State فوراً بالبيانات الجديدة
    const updatedWithDetails = StorageService.getQuizWithDetails(quizId);
    if (updatedWithDetails) {
      setQuizzes((prev) => prev.map((q) => (q.id === quizId ? updatedWithDetails : q)));
    }

    // 3. إرسال التحديث لـ Supabase في الخلفية إن كانت مهيأة
    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('quizzes')
          .update({
            title: quizUpdates.title,
            description: quizUpdates.description,
            subject_id: quizUpdates.subject_id,
            total_marks: quizUpdates.total_marks,
            duration_minutes: quizUpdates.duration_minutes,
            pass_percentage: quizUpdates.pass_percentage,
            start_date: quizUpdates.start_date,
            end_date: quizUpdates.end_date,
            is_active: quizUpdates.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', quizId);
      } catch (err) {
        console.warn('[updateFullQuiz] Supabase update warning:', err);
      }
    }

    // يُمْنَع استدعاء refreshData() مباشرة بعد الحفظ حتى لا تُسحب النسخة القديمة من السيرفر وتلغي تعديلات المعلم
    showToast('تم حفظ وتحديث بيانات الاختبار بنجاح', 'success');
    return updated;
  };

  const updateQuizInfo = async (id: string, updates: Partial<Quiz>) => {
    const updated = StorageService.updateQuiz(id, updates);
    const updatedWithDetails = StorageService.getQuizWithDetails(id);
    if (updatedWithDetails) {
      setQuizzes((prev) => prev.map((q) => (q.id === id ? updatedWithDetails : q)));
    }
    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('quizzes')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      } catch (err) {
        console.warn('[updateQuizInfo] Supabase update warning:', err);
      }
    }
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

      if (currentUser?.id === id || (currentUser?.national_id && currentUser.national_id === sanitizedUser.national_id)) {
        setCurrentUser(sanitizedUser);
        StorageService.setCurrentUserId(sanitizedUser.id);

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
        } else if (sanitizedUser.role === 'student') {
          setQuizzes(StorageService.getQuizzesForStudent(sanitizedUser.id));
          setKpis(StorageService.getDynamicKPIs());
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

      // إعادة مزامنة البيانات فوراً لضمان تحديث الجدول في الواجهة لحظياً
      await refreshData();
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

  const addSubject = async (subj: Omit<Subject, 'id'>) => {
    const currentSubjects = StorageService.getSubjects() || [];

    const created: Subject = {
      ...subj,
      id: `sub_${Date.now()}`,
      created_by: currentUser?.id,
    };

    const newList = [...currentSubjects, created];
    localStorage.setItem('itqan_subjects_v2', JSON.stringify(newList));
    setSubjects(newList);

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('subjects').insert({
          id: created.id,
          name: created.name,
          code: created.code,
          color: created.color,
          description: created.description,
          icon: created.icon,
          created_by: created.created_by,
        });
        if (error) {
          console.warn('[addSubject] Supabase insert warning:', error.message);
        } else {
          console.log(`[addSubject] Subject ${created.id} inserted into Supabase successfully`);
        }
      } catch (err) {
        console.warn('[addSubject] Supabase network error:', err);
      }
    }

    if (currentUser && currentUser.role === 'teacher') {
      const currentAssigned = currentUser.assigned_subject_ids || [];
      const updatedAssigned = Array.from(new Set([...currentAssigned, created.id]));
      await updateUserData(currentUser.id, { assigned_subject_ids: updatedAssigned });
    } else {
      await refreshData();
    }

    showToast(`تمت إضافة المادة (${created.name}) بنجاح`, 'success');
    return created;
  };

  const updateSubjectData = async (id: string, updates: Partial<Subject>) => {
    StorageService.updateSubject(id, updates);
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('subjects').update(updates).eq('id', id);
        if (error) console.warn('[updateSubjectData] Supabase update warning:', error.message);
      } catch (err) {
        console.warn('[updateSubjectData] Supabase network error:', err);
      }
    }

    await refreshData();
    showToast('تم تحديث المادة بنجاح', 'success');
  };

  const deleteSubjectItem = async (id: string) => {
    StorageService.deleteSubject(id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('subjects').delete().eq('id', id);
        if (error) console.warn('[deleteSubjectItem] Supabase delete warning:', error.message);
      } catch (err) {
        console.warn('[deleteSubjectItem] Supabase network error:', err);
      }
    }

    await refreshData();
    showToast('تم حذف المادة بنجاح', 'info');
  };

  const addClass = async (cls: Omit<SchoolClass, 'id'>) => {
    const currentClasses = StorageService.getClasses() || [];

    const created: SchoolClass = {
      ...cls,
      id: `class_${Date.now()}`,
      student_count: 0,
      created_by: currentUser?.id,
    };

    const newList = [...currentClasses, created];
    localStorage.setItem('itqan_classes_v2', JSON.stringify(newList));
    setClasses(newList);

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('classes').insert({
          id: created.id,
          name: created.name,
          grade_level: created.grade_level,
          student_count: created.student_count || 0,
          created_by: created.created_by,
        });
        if (error) {
          console.warn('[addClass] Supabase insert warning:', error.message);
        } else {
          console.log(`[addClass] Class ${created.id} inserted into Supabase successfully`);
        }
      } catch (err) {
        console.warn('[addClass] Supabase network error:', err);
      }
    }

    if (currentUser && currentUser.role === 'teacher') {
      const currentAssigned = currentUser.assigned_class_ids || [];
      const updatedAssigned = Array.from(new Set([...currentAssigned, created.id]));
      await updateUserData(currentUser.id, { assigned_class_ids: updatedAssigned });
    } else {
      await refreshData();
    }

    showToast(`تمت إضافة الشعبة/الصف (${created.name}) بنجاح`, 'success');
    return created;
  };

  const updateClassData = async (id: string, updates: Partial<SchoolClass>) => {
    StorageService.updateClass(id, updates);
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('classes').update(updates).eq('id', id);
        if (error) console.warn('[updateClassData] Supabase update warning:', error.message);
      } catch (err) {
        console.warn('[updateClassData] Supabase network error:', err);
      }
    }

    await refreshData();
    showToast('تم تحديث الشعبة بنجاح', 'success');
  };

  const deleteClassItem = async (id: string) => {
    StorageService.deleteClass(id);
    setClasses((prev) => prev.filter((c) => c.id !== id));

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('classes').delete().eq('id', id);
        if (error) console.warn('[deleteClassItem] Supabase delete warning:', error.message);
      } catch (err) {
        console.warn('[deleteClassItem] Supabase network error:', err);
      }
    }

    await refreshData();
    showToast('تم حذف الشعبة بنجاح', 'info');
  };

  const resetSystemData = () => {
    StorageService.resetToSeedData();
    localStorage.removeItem('itqan_subjects_v2');
    localStorage.removeItem('itqan_classes_v2');
    refreshData();
    showToast('تمت إعادة ضبط بيانات النظام بنجاح', 'success');
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
