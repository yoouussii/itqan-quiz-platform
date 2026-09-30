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
import { supabase } from '../services/supabase';

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

// دالة مساعدة لدمج كائن المستخدم والتأكد من القيم الأمنية
const sanitizeUser = (user: User): User => {
  const perms = user.teacher_permissions || (user as any).permissions || {};
  return {
    ...user,
    assigned_class_ids: Array.isArray(user.assigned_class_ids) ? user.assigned_class_ids : [],
    assigned_subject_ids: Array.isArray(user.assigned_subject_ids) ? user.assigned_subject_ids : [],
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
  const [kpis, setKpis] = useState(() =>
    StorageService.getDynamicKPIs(currentUser?.role === 'teacher' ? currentUser.id : undefined)
  );

  const refreshData = useCallback(async () => {
    const localUsers = StorageService.getUsers();

    try {
      const { data: dbUsers, error } = await supabase.from('users').select('*');
      if (!error && dbUsers && dbUsers.length > 0) {
        const mergedUsers = dbUsers.map((dbU: any) => {
          const localU = localUsers.find((l) => l.id === dbU.id);

          const localPerms = localU?.permissions || localU?.teacher_permissions || {};
          const dbPerms = dbU.permissions && Object.keys(dbU.permissions).length > 0
            ? dbU.permissions
            : (dbU.teacher_permissions && Object.keys(dbU.teacher_permissions).length > 0 ? dbU.teacher_permissions : localPerms);

          const dbSubjects = Array.isArray(dbU.assigned_subject_ids) && dbU.assigned_subject_ids.length > 0
            ? dbU.assigned_subject_ids
            : (localU?.assigned_subject_ids || []);

          const dbClasses = Array.isArray(dbU.assigned_class_ids) && dbU.assigned_class_ids.length > 0
            ? dbU.assigned_class_ids
            : (localU?.assigned_class_ids || []);

          return sanitizeUser({
            ...localU,
            ...dbU,
            assigned_subject_ids: dbSubjects,
            assigned_class_ids: dbClasses,
            permissions: dbPerms,
            teacher_permissions: dbPerms,
          });
        });

        localStorage.setItem('itqan_users_v2', JSON.stringify(mergedUsers));
      }
    } catch (err) {
      console.error('Supabase sync error:', err);
    }

    const updatedUsers = StorageService.getUsers().map(sanitizeUser);
    const loadedSubjects = StorageService.getSubjects();
    const loadedClasses = StorageService.getClasses();
    const updatedUser = StorageService.getCurrentUser();

    setUsers(updatedUsers);
    setSubjects(loadedSubjects && loadedSubjects.length > 0 ? loadedSubjects : INITIAL_SUBJECTS);
    setClasses(loadedClasses && loadedClasses.length > 0 ? loadedClasses : INITIAL_CLASSES);

    if (updatedUser) {
      const safeUser = sanitizeUser(updatedUser);
      setCurrentUser(safeUser);

      if (safeUser.role === 'admin') {
        setQuizzes(StorageService.getAllQuizzesWithDetails());
        setKpis(StorageService.getDynamicKPIs());
      } else if (safeUser.role === 'teacher') {
        setQuizzes(StorageService.getQuizzesForTeacher(safeUser.id));
        setKpis(StorageService.getDynamicKPIs(safeUser.id));
      } else if (safeUser.role === 'student') {
        setQuizzes(StorageService.getQuizzesForStudent(safeUser.id));
        setKpis(StorageService.getDynamicKPIs());
      }

      setSubmissions(StorageService.getAccessibleSubmissionsWithDetails(safeUser.id));
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

  const login = async (nationalId: string, password?: string) => {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('national_id', nationalId)
        .eq('password', password)
        .single();

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
        return true;
      }
    } catch (err) {
      console.error('Login error:', err);
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

  const addUser = async (userData: Omit<User, 'id' | 'created_at'>) => {
    const newUser = StorageService.createUser(userData);

    try {
      await supabase.from('users').insert([
        {
          id: newUser.id,
          national_id: newUser.national_id,
          name: newUser.name,
          role: newUser.role,
          password: newUser.password || '123456',
          assigned_subject_ids: newUser.assigned_subject_ids || [],
          assigned_class_ids: newUser.assigned_class_ids || [],
          permissions: newUser.permissions || newUser.teacher_permissions || {},
          teacher_permissions: newUser.teacher_permissions || newUser.permissions || {},
        },
      ]);
    } catch (err) {
      console.error('Error syncing user to Supabase:', err);
    }

    refreshData();
    showToast(`تمت إضافة المستخدم (${newUser.name}) بنجاح`, 'success');
    return newUser;
  };

  // دالة تحديث بيانات المستخدم المصلحة بالكامل
  const updateUserData = async (id: string, updates: Partial<User>): Promise<void> => {
    try {
      const perms = updates.teacher_permissions || updates.permissions;
      const safeUpdates: Partial<User> = {
        ...updates,
        ...(perms ? { teacher_permissions: perms, permissions: perms } : {}),
      };

      // 1. تحديث التخزين المحلي فوراً بمفتاح v2
      const existingUsers = StorageService.getUsers();
      const updatedUsers = existingUsers.map((u) =>
        u.id === id ? sanitizeUser({ ...u, ...safeUpdates }) : u
      );
      localStorage.setItem('itqan_users_v2', JSON.stringify(updatedUsers));

      // 2. مزامنة التحديث مع Supabase
      try {
        const dbPayload: any = { ...safeUpdates };
        delete dbPayload.id;
        await supabase.from('users').update(dbPayload).eq('id', id);
      } catch (dbErr) {
        console.error('Error updating user in Supabase:', dbErr);
      }

      // 3. إعادة تنشيط الحالة العامة للتطبيق
      refreshData();
      showToast('تم حفظ تعديلات المستخدم والصلاحيات بنجاح', 'success');
    } catch (error) {
      console.error('Error updating user data:', error);
      showToast('حدث خطأ أثناء حفظ التعديلات', 'error');
    }
  };

  // دالة إعادة تعيين كلمة المرور المضافة
  const resetUserPassword = async (id: string, newPass: string): Promise<boolean> => {
    try {
      const existingUsers = StorageService.getUsers();
      const updatedUsers = existingUsers.map((u) =>
        u.id === id ? { ...u, password: newPass } : u
      );
      localStorage.setItem('itqan_users_v2', JSON.stringify(updatedUsers));

      try {
        await supabase.from('users').update({ password: newPass }).eq('id', id);
      } catch (dbErr) {
        console.error('Error updating password in Supabase:', dbErr);
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

    try {
      await supabase.from('users').delete().eq('id', id);
    } catch (err) {
      console.error('Error deleting user from Supabase:', err);
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
