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
  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  // Auth methods (National ID + Password)
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
  // Student Quiz Submission
  submitQuizAttempt: (
    quizId: string,
    answers: Array<{ question_id: string; selected_option: number | null }>,
    timeSpentSeconds: number
  ) => Submission;
  // User Management
  addUser: (userData: Omit<User, 'id' | 'created_at'>) => User;
  updateUserData: (id: string, updates: Partial<User>) => void;
  resetUserPassword: (id: string, newPass: string) => boolean;
  deleteUserItem: (id: string) => void;
  // Dynamic Subjects & Classes CRUD
  addSubject: (subject: Omit<Subject, 'id'>) => Subject;
  updateSubjectData: (id: string, updates: Partial<Subject>) => void;
  deleteSubjectItem: (id: string) => void;
  addClass: (classData: Omit<SchoolClass, 'id'>) => SchoolClass;
  updateClassData: (id: string, updates: Partial<SchoolClass>) => void;
  deleteClassItem: (id: string) => void;
  // System Reset
  resetSystemData: () => void;
  refreshData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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

  const [currentUser, setCurrentUser] = useState<User | null>(() => StorageService.getCurrentUser());
  const [users, setUsers] = useState<User[]>(() => StorageService.getUsers());
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

  const refreshData = useCallback(() => {
    const updatedUsers = StorageService.getUsers();
    const updatedSubjects = StorageService.getSubjects();
    const updatedClasses = StorageService.getClasses();
    const updatedUser = StorageService.getCurrentUser();

    setUsers(updatedUsers);
    setSubjects(updatedSubjects);
    setClasses(updatedClasses);
    setCurrentUser(updatedUser);

    if (updatedUser) {
      if (updatedUser.role === 'admin') {
        setQuizzes(StorageService.getAllQuizzesWithDetails());
        setKpis(StorageService.getDynamicKPIs());
      } else if (updatedUser.role === 'teacher') {
        setQuizzes(StorageService.getQuizzesForTeacher(updatedUser.id));
        setKpis(StorageService.getDynamicKPIs(updatedUser.id));
      } else if (updatedUser.role === 'student') {
        setQuizzes(StorageService.getQuizzesForStudent(updatedUser.id));
        setKpis(StorageService.getDynamicKPIs());
      }
      // Strict privacy enforcement on submissions
      setSubmissions(StorageService.getAccessibleSubmissionsWithDetails(updatedUser.id));
    } else {
      setQuizzes([]);
      setSubmissions([]);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [currentUser?.id, currentUser?.role, refreshData]);

  // Auth: Switch User
  const switchUser = (userId: string) => {
    StorageService.setCurrentUserId(userId);
    const user = StorageService.getUserById(userId) || null;
    setCurrentUser(user);
    setCurrentView('dashboard');
    setActiveQuizId(null);
    setActiveSubmissionId(null);
    showToast(`تم التبديل إلى: ${user?.name} (${getRoleBadge(user?.role)})`, 'info');
  };

  // Auth: Login by National ID + Password from Supabase
const login = async (nationalId: string, password?: string) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('national_id', nationalId)
      .eq('password', password)
      .single();

    if (user && !error) {
      StorageService.setCurrentUserId(user.id);
      setCurrentUser(user);
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

  // Quiz: Create
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
    showToast('تم حذف الاختبار واستبعاد درجاته من حساب المعدل العام للطلاب', 'info');
  };

  const toggleQuizActive = (id: string) => {
    const updated = StorageService.toggleQuizActive(id);
    refreshData();
    if (updated) {
      showToast(
        updated.is_active ? 'تم تفعيل إتاحة الاختبار للطلاب بنجاح' : 'تم إيقاف إتاحة الاختبار فورياً للطلاب',
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

  // Student: Submit Quiz Attempt
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

    // If this was an authorized retake, revoke the retake permission so they don't retake infinitely
    if (isRetake) {
      StorageService.revokeStudentRetake(quizId, currentUser.id);
    }

    refreshData();
    showToast(`تم تسليم الاختبار! حصلت على ${percentage}%`, percentage >= 60 ? 'success' : 'info');
    return newSubmission;
  };

  // Users Management
  const addUser = (userData: Omit<User, 'id' | 'created_at'>) => {
    const newUser = StorageService.createUser(userData);
    refreshData();
    showToast(`تمت إضافة المستخدم (${newUser.name}) بنجاح`, 'success');
    return newUser;
  };

  const updateUserData = (id: string, updates: Partial<User>) => {
    StorageService.updateUser(id, updates);
    refreshData();
    showToast('تم تحديث بيانات المستخدم بنجاح', 'success');
  };

  const resetUserPassword = (id: string, newPass: string) => {
    const ok = StorageService.resetPassword(id, newPass);
    if (ok) {
      refreshData();
      showToast('تمت إعادة تعيين كلمة المرور بنجاح', 'success');
    }
    return ok;
  };

  const deleteUserItem = (id: string) => {
    StorageService.deleteUser(id);
    refreshData();
    showToast('تم حذف المستخدم من النظام', 'info');
  };

  // Dynamic Subjects CRUD
  const addSubject = (subj: Omit<Subject, 'id'>) => {
    const created = StorageService.createSubject({
      ...subj,
      created_by: currentUser?.id,
    });
    refreshData();
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

  // Dynamic Classes CRUD
  const addClass = (cls: Omit<SchoolClass, 'id'>) => {
    const created = StorageService.createClass({
      ...cls,
      created_by: currentUser?.id,
    });
    refreshData();
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

function getRoleBadge(role?: string) {
  if (role === 'admin') return 'مدير النظام';
  if (role === 'teacher') return 'معلم';
  if (role === 'student') return 'طالب';
  return '';
}
