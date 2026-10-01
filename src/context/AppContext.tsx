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
} from '../services/storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';

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
  logout: () => Promise<void> | void;
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
  deleteQuizItem: (id: string) => Promise<void> | void;
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

const sanitizeUser = (user: User): User => {
  const rawPerms = user.teacher_permissions || (user as any).permissions || {};
  const perms = {
    can_add_custom_subjects: !!rawPerms.can_add_custom_subjects,
    can_manage_classes: !!rawPerms.can_manage_classes,
    can_view_all_reports: !!rawPerms.can_view_all_reports,
    can_add_students: !!rawPerms.can_add_students,
    can_add_teachers: !!rawPerms.can_add_teachers,
  };

  let assignedSubs: string[];
  if (Array.isArray(user.assigned_subject_ids)) {
    assignedSubs = user.assigned_subject_ids;
  } else if (user.specialty_id) {
    assignedSubs = [user.specialty_id];
  } else {
    assignedSubs = [];
  }

  let assignedCls: string[];
  if (Array.isArray(user.assigned_class_ids)) {
    assignedCls = user.assigned_class_ids;
  } else if (user.class_id) {
    assignedCls = [user.class_id];
  } else {
    assignedCls = [];
  }

  const natId = user.national_id || user.username || '';
  const usrName = user.username || user.national_id || '';

  return {
    ...user,
    national_id: natId,
    username: usrName,
    specialty_id: assignedSubs.length > 0 ? assignedSubs[0] : (user.specialty_id || null),
    class_id: assignedCls.length > 0 ? assignedCls[0] : (user.class_id || null),
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

  const [subjects, setSubjects] = useState<Subject[]>(() => StorageService.getSubjects());
  const [classes, setClasses] = useState<SchoolClass[]>(() => StorageService.getClasses());
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

  // 1️⃣ دالة التحديث الذكية ومنع استدعاء الكاش القديم عند فتح النظام
  const refreshData = useCallback(async () => {
    const localUsers = StorageService.getUsers().map(sanitizeUser);
    let mergedUsers = [...localUsers];

    if (isSupabaseConfigured()) {
      try {
        const { data: dbUsers, error } = await supabase.from('users').select('*');
        if (!error && Array.isArray(dbUsers)) {
          mergedUsers = localUsers.map((localU) => {
            const dbU = dbUsers.find(
              (d: any) =>
                (d.id && d.id === localU.id) ||
                (d.national_id && d.national_id.trim() === localU.national_id?.trim())
            );
            if (!dbU) return localU;

            const localUpdated = localU.updated_at ? new Date(localU.updated_at).getTime() : 0;
            const dbUpdated = dbU.updated_at ? new Date(dbU.updated_at).getTime() : 0;

            if (localUpdated >= dbUpdated || !dbU.updated_at) {
              return sanitizeUser({
                ...dbU,
                ...localU,
                assigned_subject_ids: localU.assigned_subject_ids ?? dbU.assigned_subject_ids ?? [],
                assigned_class_ids: localU.assigned_class_ids ?? dbU.assigned_class_ids ?? [],
                teacher_permissions: localU.teacher_permissions ?? dbU.teacher_permissions ?? {},
                permissions: localU.permissions ?? dbU.permissions ?? {},
              });
            }

            const dbHasPerms = dbU.teacher_permissions && typeof dbU.teacher_permissions === 'object' && Object.keys(dbU.teacher_permissions).length > 0;
            const dbHasSubs = Array.isArray(dbU.assigned_subject_ids);
            const dbHasCls = Array.isArray(dbU.assigned_class_ids);

            const finalCls = dbHasCls ? dbU.assigned_class_ids : (localU.assigned_class_ids ?? []);
            const finalSubs = dbHasSubs ? dbU.assigned_subject_ids : (localU.assigned_subject_ids ?? []);

            return sanitizeUser({
              ...localU,
              ...dbU,
              assigned_subject_ids: finalSubs,
              assigned_class_ids: finalCls,
              teacher_permissions: dbHasPerms ? dbU.teacher_permissions : localU.teacher_permissions,
              permissions: dbHasPerms ? (dbU.permissions || dbU.teacher_permissions) : localU.permissions,
            });
          });

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
            } else {
              subMap.set(localS.id, { ...subMap.get(localS.id)!, ...localS });
            }
          }
          localSubjects = Array.from(subMap.values());
          localStorage.setItem('itqan_subjects_v2', JSON.stringify(localSubjects));
        }
      } catch (err) {
        console.warn('[refreshData] Subjects sync skipped:', err);
      }
    }

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
            } else {
              clsMap.set(localC.id, { ...clsMap.get(localC.id)!, ...localC });
            }
          }
          localClasses = Array.from(clsMap.values());
          localStorage.setItem('itqan_classes_v2', JSON.stringify(localClasses));
        }
      } catch (err) {
        console.warn('[refreshData] Classes sync skipped:', err);
      }
    }

    const currentUserId = StorageService.getCurrentUserId();

    setUsers(updatedUsers);
    setSubjects(localSubjects);
    setClasses(localClasses);

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
  }, [currentUser?.id, currentUser?.national_id, currentUser?.role]);

  // فحص الجلسة ومزامنة البيانات فور تحميل التطبيق تلقائياً
  useEffect(() => {
    const initSession = async () => {
      if (isSupabaseConfigured()) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session && !StorageService.getCurrentUserId()) {
            setCurrentUser(null);
          }
        } catch (e) {
          console.warn('[Session Verify Error]:', e);
        }
      }
      await refreshData();
    };

    initSession();
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

    const localUser = StorageService.authenticate(trimmedId, password);
    if (localUser) {
      const safeU = sanitizeUser(localUser);
      StorageService.setCurrentUserId(safeU.id);
      setCurrentUser(safeU);
      setCurrentView('dashboard');
      showToast(`مرحباً بك يا ${safeU.name}`, 'success');

      if (isSupabaseConfigured()) {
        (async () => {
          try {
            const { data: remoteUser } = await supabase
              .from('users')
              .select('*')
              .or(`national_id.eq.${trimmedId},username.eq.${trimmedId}`)
              .maybeSingle();
            if (remoteUser) {
              StorageService.updateUser(safeU.id, remoteUser);
            }
          } catch {}
        })();
      }
      return true;
    }

    if (isSupabaseConfigured()) {
      try {
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .or(`national_id.eq.${trimmedId},username.eq.${trimmedId}`)
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

  // 2️⃣ دالة تسجيل الخروج النظيفة وتنظيف الـ LocalStorage والجلسة
  const logout = async () => {
    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[logout] Supabase signOut warning:', err);
      }
    }
    localStorage.removeItem('itqan_current_user_id_v2');
    localStorage.removeItem('itqan_user_session');
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
    const updated = StorageService.updateFullQuiz(quizId, quizUpdates, questions, assignments);

    const updatedWithDetails = StorageService.getQuizWithDetails(quizId);
    if (updatedWithDetails) {
      setQuizzes((prev) => prev.map((q) => (q.id === quizId ? updatedWithDetails : q)));
    }

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

    showToast('تم حفظ وتحديث بيانات الاختبار بنجاح', 'success');
    return updated;
  };

  const updateQuizInfo = async (id: string, updates: Partial<Quiz>) => {
    StorageService.updateQuiz(id, updates);
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

  // 3️⃣ دالة حذف الاختبار الشاملة (من الذاكرة المحلية ومن قاعدة البيانات Supabase)
  const deleteQuizItem = async (id: string) => {
    StorageService.deleteQuiz(id);
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('quizzes').delete().eq('id', id);
      } catch (err) {
        console.warn('[deleteQuizItem] Supabase delete warning:', err);
      }
    }
    await refreshData();
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
      specialty_id: assignedSubs.length > 0 ? assignedSubs[0] : (userData.specialty_id || null),
      class_id: assignedCls.length > 0 ? assignedCls[0] : (userData.class_id || null),
      assigned_subject_ids: assignedSubs,
      assigned_class_ids: assignedCls,
      teacher_permissions: perms,
      permissions: perms,
      updated_at: now,
    };

    const newUser = StorageService.createUser(safeUserData);
    const sanitized = sanitizeUser(newUser);

    setUsers((prev) => {
      const exists = prev.some((u) => u.id === sanitized.id || u.national_id === sanitized.national_id);
      return exists ? prev.map((u) => (u.id === sanitized.id ? sanitized : u)) : [...prev, sanitized];
    });

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
      while (attempts < 8) {
        attempts++;
        try {
          const { error } = await supabase.from('users').insert([payload]);
          if (!error) break;

          if (error.code === '23505') {
            await supabase.from('users').update(payload).eq('id', newUser.id);
            break;
          }

          const missingColumn = extractMissingColumn(error.message || '');
          if (missingColumn && missingColumn in payload) {
            delete payload[missingColumn];
            continue;
          }
          break;
        } catch {
          break;
        }
      }
    }

    showToast(`تم إضافة المستخدم بنجاح: ${newUser.name}`, 'success');
    return newUser;
  };

  const updateUserData = async (id: string, updates: Partial<User>): Promise<void> => {
    const now = new Date().toISOString();
    const targetNationalId = updates.national_id || updates.username;

    // فصل كلمة المرور لتجنب إعادتها أو تعديلها بشكل غير مقصود
    const { password, ...safeUpdates } = updates;

    const cleanUpdates: Partial<User> = {
      ...safeUpdates,
      updated_at: now,
    };

    if (updates.national_id) cleanUpdates.national_id = updates.national_id;
    if (updates.username) cleanUpdates.username = updates.username;

    const updatedUserObj = StorageService.updateUser(id, cleanUpdates);
    if (updatedUserObj) {
      const sanitized = sanitizeUser(updatedUserObj);

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === id || (targetNationalId && u.national_id === targetNationalId)) {
            return sanitized;
          }
          return u;
        })
      );

      if (currentUser && (currentUser.id === id || (targetNationalId && currentUser.national_id === targetNationalId))) {
        setCurrentUser(sanitized);
      }
    }

    if (isSupabaseConfigured()) {
      try {
        let payload = cleanUserPayloadForSupabase(cleanUpdates);
        const targetKey = targetNationalId || id;

        const { data, error } = await supabase
          .from('users')
          .update(payload)
          .or(`id.eq.${id},national_id.eq.${targetKey},username.eq.${targetKey}`)
          .select();

        if (error) {
          console.error('[Supabase Update Error]:', error.message, error.details, error.hint);
          showToast(`خطأ Supabase: ${error.message}`, 'error');
        } else if (!data || data.length === 0) {
          console.warn('[Supabase Warning]: لم يتم العثور على أي مستخدم يطابق المعرف في Supabase لتحديثه');
        } else {
          console.log('[Supabase Success]: تم التحديث بنجاح في Supabase', data);
        }
      } catch (err) {
        console.error('[updateUserData Exception]:', err);
      }
    } else {
      console.warn('[Supabase Warning]: الاتصال بـ Supabase غير مفعل أو ناقص بيانات .env');
    }

    showToast('تم حفظ وتحديث بيانات المستخدم بنجاح', 'success');
  };

  const resetUserPassword = async (id: string, newPass: string): Promise<boolean> => {
    await updateUserData(id, { password: newPass });
    showToast('تم إعادة تعيين كلمة المرور بنجاح', 'success');
    return true;
  };

  const deleteUserItem = async (id: string): Promise<void> => {
    StorageService.deleteUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('users').delete().eq('id', id);
      } catch (err) {
        console.warn('[deleteUserItem] Supabase delete warning:', err);
      }
    }
    showToast('تم حذف المستخدم بنجاح', 'info');
  };

  const addSubject = async (subject: Omit<Subject, 'id'>): Promise<Subject> => {
    const created = StorageService.createSubject(subject);
    setSubjects((prev) => [...prev, created]);
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('subjects').insert([created]);
      } catch (err) {
        console.warn('[addSubject] Supabase insert warning:', err);
      }
    }
    showToast(`تم إضافة المادة: ${created.name}`, 'success');
    return created;
  };

  const updateSubjectData = async (id: string, updates: Partial<Subject>): Promise<void> => {
    const updated = StorageService.updateSubject(id, updates);
    if (updated) {
      setSubjects((prev) => prev.map((s) => (s.id === id ? updated : s)));
    }
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('subjects').update(updates).eq('id', id);
      } catch (err) {
        console.warn('[updateSubjectData] Supabase update warning:', err);
      }
    }
    showToast('تم تحديث بيانات المادة', 'success');
  };

  const deleteSubjectItem = async (id: string): Promise<void> => {
    StorageService.deleteSubject(id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('subjects').delete().eq('id', id);
      } catch (err) {
        console.warn('[deleteSubjectItem] Supabase delete warning:', err);
      }
    }
    showToast('تم حذف المادة بنجاح', 'info');
  };

  const addClass = async (classData: Omit<SchoolClass, 'id'>): Promise<SchoolClass> => {
    const created = StorageService.createClass(classData);
    setClasses((prev) => [...prev, created]);
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('classes').insert([created]);
      } catch (err) {
        console.warn('[addClass] Supabase insert warning:', err);
      }
    }
    showToast(`تم إضافة الصف: ${created.name}`, 'success');
    return created;
  };

  const updateClassData = async (id: string, updates: Partial<SchoolClass>): Promise<void> => {
    const updated = StorageService.updateClass(id, updates);
    if (updated) {
      setClasses((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('classes').update(updates).eq('id', id);
      } catch (err) {
        console.warn('[updateClassData] Supabase update warning:', err);
      }
    }
    showToast('تم تحديث بيانات الصف', 'success');
  };

  const deleteClassItem = async (id: string): Promise<void> => {
    StorageService.deleteClass(id);
    setClasses((prev) => prev.filter((c) => c.id !== id));
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('classes').delete().eq('id', id);
      } catch (err) {
        console.warn('[deleteClassItem] Supabase delete warning:', err);
      }
    }
    showToast('تم حذف الصف بنجاح', 'info');
  };

  const resetSystemData = () => {
    StorageService.reset();
    refreshData();
    showToast('تم إعادة ضبط بيانات النظام', 'info');
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
