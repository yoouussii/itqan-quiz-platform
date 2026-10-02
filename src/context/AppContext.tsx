import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  User,
  Subject,
  SchoolClass,
  Quiz,
  Question,
  QuizWithDetails,
  Submission,
  SubmissionWithDetails,
} from '../types';
import {
  StorageService,
  cleanUserPayloadForSupabase,
  extractMissingColumn,
  DEFAULT_PASSWORD,
} from '../services/storage';
import { canonSubjectId, isRetiredSubject } from '../utils/subjectAliases';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import {
  pushQuiz,
  pullQuizzes,
  pushSubmission,
  pullSubmissions,
  flushPending,
} from '../services/quizSync';

// ---------------------------------------------------------------------
// إعدادات الجلسة
// ---------------------------------------------------------------------
/** مدة الجلسة القصوى بالساعات؛ بعدها يُطلب من المستخدم تسجيل الدخول من جديد */
const SESSION_MAX_HOURS = 12;
const SESSION_KEY = 'itqan_session_started_at';
/** كل كم ثانية يُحدَّث المحتوى تلقائياً من Supabase */
const AUTO_REFRESH_SECONDS = 30;

const LS_USERS = 'itqan_users_v2';
const LS_SUBJECTS = 'itqan_subjects_v2';
const LS_CLASSES = 'itqan_classes_v2';

export type ToastType = 'success' | 'error' | 'info';
export interface ToastMessage {
  text: string;
  type: ToastType;
}

type Kpis = ReturnType<typeof StorageService.getDynamicKPIs>;

export interface SyncOutcome {
  /** هل وصل الحفظ إلى Supabase فعلاً؟ */
  synced: boolean;
  error?: string;
}

interface AppContextType {
  currentUser: User | null;
  users: User[];
  subjects: Subject[];
  classes: SchoolClass[];
  quizzes: QuizWithDetails[];
  submissions: SubmissionWithDetails[];
  kpis: Kpis;

  currentView: string;
  setCurrentView: (view: string) => void;
  activeQuizId: string | null;
  setActiveQuizId: (id: string | null) => void;
  activeSubmissionId: string | null;
  setActiveSubmissionId: (id: string | null) => void;
  editingQuizId: string | null;
  setEditingQuizId: (id: string | null) => void;
  /** معرّف اختبار يُراد تكراره (نسخة جديدة قابلة للتعديل) */
  duplicateQuizId: string | null;
  setDuplicateQuizId: (id: string | null) => void;

  toastMessage: ToastMessage | null;
  showToast: (text: string, type?: ToastType) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  login: (nationalId: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchUser: (userId: string) => void;

  createNewQuiz: (
    quizData: Partial<Quiz>,
    questions: any[],
    assignments: any[]
  ) => Promise<SyncOutcome & { id: string }>;
  updateFullQuiz: (
    id: string,
    quizData: Partial<Quiz>,
    questions: any[],
    assignments: any[]
  ) => Promise<SyncOutcome>;
  updateQuizInfo: (id: string, updates: Partial<Quiz>) => Promise<void>;
  deleteQuizItem: (id: string) => Promise<void>;
  toggleQuizActive: (id: string) => void;
  allowStudentRetake: (quizId: string, studentId: string) => void;
  revokeStudentRetake: (quizId: string, studentId: string) => void;
  reassignQuizToTeacher: (quizId: string, newTeacherId: string) => boolean;
  submitQuizAttempt: (
    quizId: string,
    answers: Array<{ question_id: string; selected_option: number | null }>,
    timeSpentSeconds: number
  ) => Submission;

  addUser: (userData: any) => Promise<User>;
  updateUserData: (id: string, updates: Partial<User>) => Promise<void>;
  resetUserPassword: (id: string, newPassword: string) => Promise<boolean>;
  deleteUserItem: (id: string) => Promise<void>;
  addSubject: (data: Omit<Subject, 'id'>) => Promise<Subject>;
  updateSubjectData: (id: string, updates: Partial<Subject>) => Promise<void>;
  deleteSubjectItem: (id: string) => Promise<void>;
  addClass: (data: Omit<SchoolClass, 'id'>) => Promise<SchoolClass>;
  updateClassData: (id: string, updates: Partial<SchoolClass>) => Promise<void>;
  deleteClassItem: (id: string) => Promise<void>;
  resetSystemData: () => void;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ---------------------------------------------------------------------
// دوال مساعدة
// ---------------------------------------------------------------------
const time = (v?: string | null): number => (v ? new Date(v).getTime() || 0 : 0);

/** توحيد شكل المستخدم (الصلاحيات، المواد، الفصول) */
function normalizeUser(u: any): User {
  const perms = u.teacher_permissions || u.permissions || {};
  const normalizedPerms = {
    can_add_custom_subjects: !!perms.can_add_custom_subjects,
    can_manage_classes: !!perms.can_manage_classes,
    can_view_all_reports: !!perms.can_view_all_reports,
    can_add_students: !!perms.can_add_students,
    can_add_teachers: !!perms.can_add_teachers,
  };

  let subjectIds: string[] = [];
  if (Array.isArray(u.assigned_subject_ids) && u.assigned_subject_ids.length > 0) {
    subjectIds = [...u.assigned_subject_ids];
  } else if (u.specialty_id) {
    subjectIds = [u.specialty_id];
  }

  subjectIds = Array.from(new Set(subjectIds.map((id) => canonSubjectId(id) as string)));

  let classIds: string[] = [];
  if (Array.isArray(u.assigned_class_ids) && u.assigned_class_ids.length > 0) {
    classIds = [...u.assigned_class_ids];
  } else if (u.class_id) {
    classIds = [u.class_id];
  }

  return {
    ...u,
    username: u.username || u.national_id,
    specialty_id: (canonSubjectId(u.specialty_id) as string) || subjectIds[0] || null,
    class_id: u.class_id || classIds[0] || null,
    assigned_subject_ids: subjectIds,
    assigned_class_ids: classIds,
    teacher_permissions: normalizedPerms,
    permissions: normalizedPerms,
  } as User;
}

const canViewAllReports = (u: User | null): boolean =>
  !!u &&
  (u.role === 'admin' ||
    !!u.teacher_permissions?.can_view_all_reports ||
    !!u.permissions?.can_view_all_reports);

function computeQuizzes(u: User | null): QuizWithDetails[] {
  if (!u) return [];
  if (u.role === 'admin') return StorageService.getAllQuizzesWithDetails();
  if (u.role === 'teacher') {
    return canViewAllReports(u)
      ? StorageService.getAllQuizzesWithDetails()
      : StorageService.getQuizzesForTeacher(u.id);
  }
  if (u.role === 'student') return StorageService.getQuizzesForStudent(u.id);
  return [];
}

function computeKpis(u: User | null): Kpis {
  const teacherScope = u?.role === 'teacher' && !canViewAllReports(u) ? u.id : undefined;
  const kpis = StorageService.getDynamicKPIs(teacherScope);
  if (teacherScope && u) {
    // المعلم يرى أداء المواد المسندة إليه فقط
    const mine = new Set((u.assigned_subject_ids || []).map((id) => canonSubjectId(id) as string));
    if (mine.size > 0) {
      return { ...kpis, subjectPerformance: kpis.subjectPerformance.filter((s) => mine.has(s.subjectId)) };
    }
  }
  return kpis;
}

function clearBrowserSession() {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  try {
    // مفاتيح جلسة Supabase Auth (إن وُجدت)
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') || k.includes('supabase.auth'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  try {
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (!name) return;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
    });
  } catch {
    /* ignore */
  }
}

function isSessionExpired(): boolean {
  const started = Number(localStorage.getItem(SESSION_KEY) || 0);
  if (!started) return false;
  return Date.now() - started > SESSION_MAX_HOURS * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------
// مزامنة المستخدمين والمواد والفصول (نفس المنطق السابق)
// ---------------------------------------------------------------------
async function syncUsersFromSupabase(): Promise<void> {
  const local = StorageService.getUsers().map(normalizeUser);
  const { data, error } = await supabase.from('users').select('*');
  if (error || !Array.isArray(data)) return;

  const deleted = StorageService.getDeletedUserIds();
  const findRemote = (u: User) =>
    data.find(
      (r: any) =>
        (r.id && r.id === u.id) ||
        (r.national_id && r.national_id.trim() === u.national_id?.trim())
    );

  const merged: User[] = local.map((l) => {
    const r = findRemote(l);
    if (!r) return l;
    const localNewer = time(l.updated_at) >= time(r.updated_at) || !r.updated_at;
    const out = localNewer ? normalizeUser({ ...r, ...l }) : normalizeUser({ ...l, ...r });
    // كلمة المرور مصدرها الخادم دائماً: لا تعود كلمة قديمة من نسخة محلية قديمة
    if (r.password) out.password = r.password;
    return out;
  });

  for (const r of data as any[]) {
    if (deleted.includes(r.id)) continue;
    const exists = merged.some(
      (l) =>
        (r.id && l.id === r.id) ||
        (r.national_id && l.national_id?.trim() === r.national_id.trim())
    );
    if (!exists) merged.push(normalizeUser(r));
  }
  localStorage.setItem(LS_USERS, JSON.stringify(merged));
}

/** يُسقط محلياً العناصر التي كانت في الخادم ثم اختفت (حُذفت من مكان آخر) بدل إعادة رفعها */
function dropRemotelyDeleted<T extends { id: string }>(seenKey: string, local: T[], remoteIds: Set<string>): T[] {
  let seen: string[] = [];
  try {
    seen = JSON.parse(localStorage.getItem(seenKey) || '[]');
  } catch {
    seen = [];
  }
  const seenSet = new Set(seen);
  const kept = local.filter((item) => !(seenSet.has(item.id) && !remoteIds.has(item.id)));
  localStorage.setItem(seenKey, JSON.stringify(Array.from(remoteIds)));
  return kept;
}

async function syncSubjectsFromSupabase(): Promise<void> {
  const deleted = StorageService.getDeletedSubjectIds();
  let local = (StorageService.getSubjects() || []).filter(
    (s) => !deleted.includes(s.id) && !isRetiredSubject(s.id)
  );

  const { data, error } = await supabase.from('subjects').select('*');
  if (error || !Array.isArray(data)) return;

  const rows = data.filter(
    (r: any) => r && r.id && !deleted.includes(r.id) && !isRetiredSubject(r.id)
  );
  local = dropRemotelyDeleted('itqan_seen_remote_subject_ids', local, new Set<string>(rows.map((r: any) => r.id)));

  const map = new Map<string, Subject>();
  rows.forEach((r: any) =>
    map.set(r.id, {
      id: r.id,
      name: r.name || 'مادة بدون اسم',
      code: r.code || r.id,
      color: r.color || '#4f46e5',
      description: r.description || '',
      icon: r.icon || 'BookOpen',
      created_by: r.created_by,
    })
  );

  for (const s of local) {
    if (map.has(s.id)) {
      map.set(s.id, { ...(map.get(s.id) as Subject), ...s });
    } else {
      map.set(s.id, s);
      void supabase
        .from('subjects')
        .insert({
          id: s.id,
          name: s.name,
          code: s.code,
          color: s.color,
          description: s.description,
          icon: s.icon,
          created_by: s.created_by,
        })
        .then(({ error: e }) => e && console.warn('[sync] subject:', e.message));
    }
  }
  localStorage.setItem(LS_SUBJECTS, JSON.stringify(Array.from(map.values())));
}

async function syncClassesFromSupabase(): Promise<void> {
  const deleted = StorageService.getDeletedClassIds();
  let local = (StorageService.getClasses() || []).filter((c) => !deleted.includes(c.id));

  const { data, error } = await supabase.from('classes').select('*');
  if (error || !Array.isArray(data)) return;

  const rows = data.filter((r: any) => r && r.id && !deleted.includes(r.id));
  local = dropRemotelyDeleted('itqan_seen_remote_class_ids', local, new Set<string>(rows.map((r: any) => r.id)));

  const map = new Map<string, SchoolClass>();
  rows.forEach((r: any) =>
    map.set(r.id, {
      id: r.id,
      name: r.name || 'فصل بدون اسم',
      grade_level: r.grade_level || 'المرحلة الدراسية',
      student_count: r.student_count || 0,
      created_by: r.created_by,
    })
  );

  for (const c of local) {
    if (map.has(c.id)) {
      map.set(c.id, { ...(map.get(c.id) as SchoolClass), ...c });
    } else {
      map.set(c.id, c);
      void supabase
        .from('classes')
        .insert({
          id: c.id,
          name: c.name,
          grade_level: c.grade_level,
          student_count: c.student_count || 0,
          created_by: c.created_by,
        })
        .then(({ error: e }) => e && console.warn('[sync] class:', e.message));
    }
  }
  localStorage.setItem(LS_CLASSES, JSON.stringify(Array.from(map.values())));
}

// ---------------------------------------------------------------------
// المزوّد
// ---------------------------------------------------------------------
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    StorageService.init();
  }, []);

  // --- الوضع الليلي ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => StorageService.getTheme());
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    StorageService.setTheme(next);
  };
  useEffect(() => {
    StorageService.setTheme(theme);
  }, [theme]);

  // --- المستخدم الحالي (مع التحقق من انتهاء الجلسة عند التحميل) ---
  const [currentUser, setCurrentUserState] = useState<User | null>(() => {
    const stored = StorageService.getCurrentUser();
    if (!stored) return null;
    if (isSessionExpired()) {
      localStorage.removeItem('itqan_current_user_id_v2');
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (!localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, String(Date.now()));
    }
    return normalizeUser(stored);
  });

  const [users, setUsers] = useState<User[]>(() => StorageService.getUsers().map(normalizeUser));
  const [subjects, setSubjects] = useState<Subject[]>(() => StorageService.getSubjects());
  const [classes, setClasses] = useState<SchoolClass[]>(() => StorageService.getClasses());
  const [currentView, setCurrentView] = useState<string>(() =>
    StorageService.getCurrentUser() && !isSessionExpired() ? 'dashboard' : 'login'
  );
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [duplicateQuizId, setDuplicateQuizId] = useState<string | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const [quizzes, setQuizzes] = useState<QuizWithDetails[]>(() => computeQuizzes(currentUser));
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>(() =>
    currentUser ? StorageService.getAccessibleSubmissionsWithDetails(currentUser.id) : []
  );
  const [kpis, setKpis] = useState<Kpis>(() => computeKpis(currentUser));

  // مراجع لتفادي القيم القديمة داخل المؤقتات
  const currentUserRef = useRef<User | null>(currentUser);
  const currentViewRef = useRef<string>(currentView);
  const refreshingRef = useRef(false);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  /** إعادة حساب القوائم من النسخة المحلية فوراً (بدون شبكة) */
  const recompute = useCallback((userOverride?: User | null) => {
    const u = userOverride !== undefined ? userOverride : currentUserRef.current;
    setUsers(StorageService.getUsers().map(normalizeUser));
    setSubjects(StorageService.getSubjects() || []);
    setClasses(StorageService.getClasses() || []);
    setQuizzes(computeQuizzes(u));
    setSubmissions(u ? StorageService.getAccessibleSubmissionsWithDetails(u.id) : []);
    setKpis(computeKpis(u));
  }, []);

  /** جلب أحدث البيانات من Supabase ثم تحديث الواجهة */
  const refreshData = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      if (isSupabaseConfigured()) {
        try {
          await syncUsersFromSupabase();
          await syncSubjectsFromSupabase();
          await syncClassesFromSupabase();
        } catch (e) {
          console.warn('[refreshData] users/subjects/classes sync failed:', e);
        }
        const me = currentUserRef.current;
        try {
          await flushPending();
          await pullQuizzes(me);
          await pullSubmissions(me);
        } catch (e) {
          console.warn('[refreshData] quizzes/submissions sync failed:', e);
        }
      }

      // تحديث بيانات المستخدم الحالي (قد يكون الأدمن غيّر دوره/صلاحياته)
      const id = StorageService.getCurrentUserId();
      let me = currentUserRef.current;
      if (id) {
        const fresh = StorageService.getUserById(id);
        if (fresh) {
          me = normalizeUser(fresh);
          setCurrentUserState(me);
          currentUserRef.current = me;
        }
      }
      recompute(me);
    } finally {
      refreshingRef.current = false;
    }
  }, [recompute]);

  // تحديث فوري عند تسجيل الدخول أو تغيّر المستخدم
  useEffect(() => {
    void refreshData();
  }, [currentUser?.id, currentUser?.role, refreshData]);

  // ---------------- تسجيل الخروج وانتهاء الجلسة ----------------
  const logout = useCallback(
    (message = 'تم تسجيل الخروج بنجاح') => {
      localStorage.removeItem('itqan_current_user_id_v2');
      localStorage.removeItem(SESSION_KEY);
      clearBrowserSession();
      void supabase.auth.signOut().catch(() => undefined);

      currentUserRef.current = null;
      setCurrentUserState(null);
      setActiveQuizId(null);
      setActiveSubmissionId(null);
      setEditingQuizId(null);
      setQuizzes([]);
      setSubmissions([]);
      setCurrentView('login');
      showToast(message, 'info');
    },
    [showToast]
  );

  // تحديث تلقائي دوري + عند العودة للتبويب + فحص انتهاء الجلسة
  useEffect(() => {
    if (!currentUser) return;

    const tick = () => {
      if (isSessionExpired() && currentViewRef.current !== 'take_quiz') {
        logout('انتهت الجلسة، يرجى تسجيل الدخول من جديد');
        return;
      }
      // لا نقاطع الطالب أثناء أداء الاختبار
      if (document.visibilityState === 'visible' && currentViewRef.current !== 'take_quiz') {
        void refreshData();
      }
    };

    const interval = setInterval(tick, AUTO_REFRESH_SECONDS * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [currentUser?.id, logout, refreshData]);

  // ---------------- تسجيل الدخول ----------------
  const startSession = (user: User) => {
    StorageService.setCurrentUserId(user.id);
    localStorage.setItem(SESSION_KEY, String(Date.now()));
    currentUserRef.current = user;
    setCurrentUserState(user);
    setCurrentView('dashboard');
    showToast(`مرحباً بك يا ${user.name}`, 'success');
  };

  const login = async (nationalId: string, password: string): Promise<boolean> => {
    const id = nationalId.trim();
    const local = StorageService.authenticate(id, password);
    if (local) {
      startSession(normalizeUser(local));
      return true;
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('national_id', id)
          .eq('password', password)
          .maybeSingle();
        if (data && !error) {
          const user = normalizeUser(data);
          const all = StorageService.getUsers();
          const idx = all.findIndex(
            (u) =>
              (data.id && u.id === data.id) ||
              (data.national_id && u.national_id === data.national_id)
          );
          if (idx >= 0) all[idx] = { ...all[idx], ...user };
          else all.push(user);
          localStorage.setItem(LS_USERS, JSON.stringify(all));
          startSession(user);
          return true;
        }
      } catch (e) {
        console.warn('Supabase login check failed:', e);
      }
    }

    showToast('رقم الهوية / الرقم الأكاديمي أو كلمة المرور غير صحيحة', 'error');
    return false;
  };

  const switchUser = (userId: string) => {
    StorageService.setCurrentUserId(userId);
    const u = StorageService.getUserById(userId);
    const normalized = u ? normalizeUser(u) : null;
    localStorage.setItem(SESSION_KEY, String(Date.now()));
    currentUserRef.current = normalized;
    setCurrentUserState(normalized);
    setCurrentView('dashboard');
    setActiveQuizId(null);
    setActiveSubmissionId(null);
    showToast(`تم التبديل إلى: ${u?.name}`, 'info');
  };

  // ---------------- الاختبارات ----------------
  /** يرفع الاختبار لـ Supabase ويُظهر تنبيهاً واضحاً عند الفشل */
  const syncQuiz = async (quizId: string): Promise<SyncOutcome> => {
    const res = await pushQuiz(quizId);
    if (!res.ok) {
      showToast(
        `تم الحفظ على جهازك فقط ولم يصل للخادم (${res.error}). ستُعاد المحاولة تلقائياً.`,
        'error'
      );
    }
    return { synced: res.ok, error: res.error };
  };

  const createNewQuiz: AppContextType['createNewQuiz'] = async (
    quizData,
    questions,
    assignments
  ) => {
    const created = StorageService.createQuiz(quizData as any, questions as any, assignments as any);
    const outcome = await syncQuiz(created.id);
    recompute();
    if (outcome.synced) showToast(`تم إنشاء الاختبار بنجاح: ${created.title}`, 'success');
    return { id: created.id, ...outcome };
  };

  const updateFullQuiz: AppContextType['updateFullQuiz'] = async (
    id,
    quizData,
    questions,
    assignments
  ) => {
    StorageService.updateFullQuiz(id, quizData, questions as any, assignments as any);
    const outcome = await syncQuiz(id);
    recompute();
    if (outcome.synced) showToast('تم حفظ وتحديث بيانات الاختبار بنجاح', 'success');
    return outcome;
  };

  const updateQuizInfo = async (id: string, updates: Partial<Quiz>) => {
    StorageService.updateQuiz(id, updates);
    recompute();
    const outcome = await syncQuiz(id);
    if (outcome.synced) showToast('تم تحديث بيانات الاختبار بنجاح', 'success');
  };

  const deleteQuizItem = async (id: string) => {
    StorageService.deleteQuiz(id);
    recompute();
    const outcome = await syncQuiz(id);
    if (outcome.synced) showToast('تم حذف الاختبار واستبعاد درجاته', 'info');
  };

  const toggleQuizActive = (id: string) => {
    const q = StorageService.toggleQuizActive(id);
    recompute();
    if (q) {
      void syncQuiz(id);
      showToast(
        q.is_active ? 'تم تفعيل إتاحة الاختبار للطلاب بنجاح' : 'تم إيقاف إتاحة الاختبار',
        q.is_active ? 'success' : 'info'
      );
    }
  };

  const allowStudentRetake = (quizId: string, studentId: string) => {
    const res = StorageService.allowStudentRetake(quizId, studentId);
    recompute();
    if (res.success) void syncQuiz(quizId);
    showToast(res.message, res.success ? 'success' : 'error');
  };

  const revokeStudentRetake = (quizId: string, studentId: string) => {
    const res = StorageService.revokeStudentRetake(quizId, studentId);
    recompute();
    if (res.success) void syncQuiz(quizId);
    showToast(res.message, 'info');
  };

  const reassignQuizToTeacher = (quizId: string, newTeacherId: string): boolean => {
    const me = currentUserRef.current;
    if (!me) return false;
    const res = StorageService.reassignQuiz(quizId, newTeacherId, me.id);
    if (res.success) {
      recompute();
      void syncQuiz(quizId);
      showToast(res.message, 'success');
      return true;
    }
    showToast(res.message, 'error');
    return false;
  };

  /** تسليم اختبار الطالب: يُحفظ محلياً فوراً ثم يُرسل للخادم في الخلفية */
  const submitQuizAttempt: AppContextType['submitQuizAttempt'] = (
    quizId,
    answers,
    timeSpentSeconds
  ) => {
    const me = currentUserRef.current;
    if (!me) throw new Error('لا يوجد مستخدم مسجل');

    const quiz = StorageService.getQuizById(quizId);
    const questions: Question[] = StorageService.getQuestionsByQuizId(quizId);
    if (!quiz) throw new Error('الاختبار غير موجود');

    const isRetake = quiz.allowed_retake_student_ids?.includes(me.id) || false;

    let totalScore = 0;
    const graded = answers.map((a) => {
      const q = questions.find((x) => x.id === a.question_id);
      const isCorrect = q !== undefined && a.selected_option === q.correct_option_index;
      const awarded = (isCorrect && q?.marks) || 0;
      totalScore += awarded;
      return {
        question_id: a.question_id,
        selected_option: a.selected_option,
        is_correct: isCorrect,
        marks_awarded: awarded,
      };
    });

    const totalPossible = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

    const submission = StorageService.createSubmission({
      quiz_id: quizId,
      student_id: me.id,
      score: totalScore,
      total_possible_score: totalPossible,
      percentage,
      answers_json: graded,
      status: 'completed',
      time_spent_seconds: timeSpentSeconds,
      is_retake: isRetake,
    });

    if (isRetake) StorageService.revokeStudentRetake(quizId, me.id);
    recompute();

    // إرسال للخادم في الخلفية (عند الفشل يبقى في قائمة الانتظار ويُعاد تلقائياً)
    void pushSubmission(submission.id).then((r) => {
      if (!r.ok) {
        showToast('تم حفظ نتيجتك على جهازك، وستُرسل للخادم تلقائياً عند توفر الاتصال', 'info');
      }
    });
    if (isRetake) void pushQuiz(quizId);

    showToast(`تم تسليم الاختبار! حصلت على ${percentage}%`, percentage >= 60 ? 'success' : 'info');
    return submission;
  };

  // ---------------- المستخدمون ----------------
  const addUser = async (userData: any): Promise<User> => {
    const subjectIds: string[] = Array.isArray(userData.assigned_subject_ids)
      ? userData.assigned_subject_ids
      : userData.specialty_id
      ? [userData.specialty_id]
      : [];
    const classIds: string[] = Array.isArray(userData.assigned_class_ids)
      ? userData.assigned_class_ids
      : userData.class_id
      ? [userData.class_id]
      : [];
    const perms = userData.teacher_permissions || userData.permissions;

    const created = StorageService.createUser({
      ...userData,
      specialty_id: userData.specialty_id || subjectIds[0] || null,
      class_id: userData.class_id || classIds[0] || null,
      assigned_subject_ids: subjectIds,
      assigned_class_ids: classIds,
      teacher_permissions: perms,
      permissions: perms,
      updated_at: new Date().toISOString(),
    });
    const normalized = normalizeUser(created);
    setUsers((prev) =>
      prev.some((u) => u.id === normalized.id || u.national_id === normalized.national_id)
        ? prev
        : [...prev, normalized]
    );

    if (isSupabaseConfigured()) {
      let payload: Record<string, any> = cleanUserPayloadForSupabase(created);
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          let { error } = await supabase.from('users').insert([payload]);
          if (!error) break;
          if (error.code === '23505') {
            const upd = await supabase.from('users').update(payload).eq('id', created.id);
            if (!upd.error) break;
            error = upd.error;
          }
          const missing = extractMissingColumn(error.message || '');
          if (missing && missing in payload && !['id', 'name', 'role'].includes(missing)) {
            delete payload[missing];
            continue;
          }
          if (error.message?.includes('column') || error.code === 'PGRST204') {
            payload = {
              id: created.id,
              name: created.name,
              email: created.email || `${created.national_id}@itqan.edu.sa`,
              password: created.password || DEFAULT_PASSWORD,
              role: created.role,
              national_id: created.national_id,
            };
            continue;
          }
          console.warn('[addUser] Supabase insert warning:', error.message);
          break;
        } catch (e: any) {
          console.warn('[addUser] network warning:', e?.message);
          break;
        }
      }
    }

    showToast(`تمت إضافة المستخدم (${created.name}) بنجاح`, 'success');
    return normalized;
  };

  const updateUserData = async (id: string, updates: Partial<User>) => {
    try {
      const now = new Date().toISOString();
      const updated = StorageService.updateUser(id, { ...updates, updated_at: now });
      if (!updated) {
        showToast('لم يتم العثور على المستخدم المطلوب تعديله', 'error');
        return;
      }
      const normalized = normalizeUser(updated);
      setUsers((prev) => prev.map((u) => (u.id === id ? normalized : u)));

      const me = currentUserRef.current;
      if (me && (me.id === id || (me.national_id && me.national_id === normalized.national_id))) {
        currentUserRef.current = normalized;
        setCurrentUserState(normalized);
        StorageService.setCurrentUserId(normalized.id);
      }

      if (isSupabaseConfigured()) {
        const payload: Record<string, any> = {
          name: normalized.name,
          email: normalized.email,
          username: normalized.username,
          national_id: normalized.national_id,
          role: normalized.role,
          specialty_id: normalized.specialty_id,
          class_id: normalized.class_id,
          assigned_subject_ids: normalized.assigned_subject_ids,
          assigned_class_ids: normalized.assigned_class_ids,
          permissions: normalized.permissions,
          teacher_permissions: normalized.teacher_permissions,
          updated_at: now,
        };
        if (updates.password && updates.password.trim()) payload.password = updates.password.trim();
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            const { error } = await supabase.from('users').update(payload).eq('id', id);
            if (!error) break;
            const missing = extractMissingColumn(error.message || '');
            if (missing && missing in payload) {
              delete payload[missing];
              continue;
            }
            console.warn('[updateUserData] Supabase update warning:', error.message);
            break;
          } catch (e: any) {
            console.warn('[updateUserData] network error:', e?.message);
            break;
          }
        }
      }
      await refreshData();
    } catch (e) {
      console.error('Error updating user data:', e);
      showToast('حدث خطأ أثناء حفظ التعديلات', 'error');
    }
  };

  const resetUserPassword = async (id: string, newPassword: string): Promise<boolean> => {
    try {
      const now = new Date().toISOString();
      StorageService.updateUser(id, { password: newPassword, updated_at: now });
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, password: newPassword, updated_at: now } : u))
      );
      if (isSupabaseConfigured()) {
        try {
          const { error } = await supabase
            .from('users')
            .update({ password: newPassword, updated_at: now })
            .eq('id', id);
          if (error) {
            showToast(`تم تغيير كلمة المرور على هذا الجهاز فقط ولم تُحفظ على الخادم (${error.message})`, 'error');
            return false;
          }
        } catch (e) {
          console.warn('Error updating password in Supabase:', e);
          showToast('تعذر الاتصال بالخادم، لم تُحفظ كلمة المرور الجديدة', 'error');
          return false;
        }
      }
      void refreshData();
      showToast('تمت إعادة تعيين كلمة المرور بنجاح', 'success');
      return true;
    } catch (e) {
      console.error('Error resetting password:', e);
      showToast('حدث خطأ أثناء إعادة تعيين كلمة المرور', 'error');
      return false;
    }
  };

  const deleteUserItem = async (id: string) => {
    StorageService.deleteUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) console.warn('[deleteUserItem] Supabase delete warning:', error.message);
      } catch (e) {
        console.warn('[deleteUserItem] network error:', e);
      }
    }
    showToast('تم حذف المستخدم من النظام نهائياً', 'info');
  };

  // ---------------- المواد والفصول ----------------
  const addSubject = async (data: Omit<Subject, 'id'>): Promise<Subject> => {
    const me = currentUserRef.current;
    const subject: Subject = { ...data, id: `sub_${Date.now()}`, created_by: me?.id } as Subject;
    const list = [...(StorageService.getSubjects() || []), subject];
    localStorage.setItem(LS_SUBJECTS, JSON.stringify(list));
    setSubjects(list);

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('subjects').insert({
          id: subject.id,
          name: subject.name,
          code: subject.code,
          color: subject.color,
          description: subject.description,
          icon: subject.icon,
          created_by: subject.created_by,
        });
        if (error) console.warn('[addSubject] Supabase insert warning:', error.message);
      } catch (e) {
        console.warn('[addSubject] network error:', e);
      }
    }

    if (me && me.role === 'teacher') {
      const ids = Array.from(new Set([...(me.assigned_subject_ids || []), subject.id]));
      await updateUserData(me.id, { assigned_subject_ids: ids });
    } else {
      await refreshData();
    }
    showToast(`تمت إضافة المادة (${subject.name}) بنجاح`, 'success');
    return subject;
  };

  const updateSubjectData = async (id: string, updates: Partial<Subject>) => {
    StorageService.updateSubject(id, updates);
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('subjects').update(updates).eq('id', id);
        if (error) console.warn('[updateSubjectData] Supabase warning:', error.message);
      } catch (e) {
        console.warn('[updateSubjectData] network error:', e);
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
        if (error) console.warn('[deleteSubjectItem] Supabase warning:', error.message);
      } catch (e) {
        console.warn('[deleteSubjectItem] network error:', e);
      }
    }
    await refreshData();
    showToast('تم حذف المادة بنجاح', 'info');
  };

  const addClass = async (data: Omit<SchoolClass, 'id'>): Promise<SchoolClass> => {
    const me = currentUserRef.current;
    const cls: SchoolClass = {
      ...data,
      id: `class_${Date.now()}`,
      student_count: 0,
      created_by: me?.id,
    };
    const list = [...(StorageService.getClasses() || []), cls];
    localStorage.setItem(LS_CLASSES, JSON.stringify(list));
    setClasses(list);

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('classes').insert({
          id: cls.id,
          name: cls.name,
          grade_level: cls.grade_level,
          student_count: cls.student_count || 0,
          created_by: cls.created_by,
        });
        if (error) console.warn('[addClass] Supabase insert warning:', error.message);
      } catch (e) {
        console.warn('[addClass] network error:', e);
      }
    }

    if (me && me.role === 'teacher') {
      const ids = Array.from(new Set([...(me.assigned_class_ids || []), cls.id]));
      await updateUserData(me.id, { assigned_class_ids: ids });
    } else {
      await refreshData();
    }
    showToast(`تمت إضافة الشعبة/الصف (${cls.name}) بنجاح`, 'success');
    return cls;
  };

  const updateClassData = async (id: string, updates: Partial<SchoolClass>) => {
    StorageService.updateClass(id, updates);
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('classes').update(updates).eq('id', id);
        if (error) console.warn('[updateClassData] Supabase warning:', error.message);
      } catch (e) {
        console.warn('[updateClassData] network error:', e);
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
        if (error) console.warn('[deleteClassItem] Supabase warning:', error.message);
      } catch (e) {
        console.warn('[deleteClassItem] network error:', e);
      }
    }
    await refreshData();
    showToast('تم حذف الشعبة بنجاح', 'info');
  };

  const resetSystemData = () => {
    StorageService.resetToSeedData();
    localStorage.removeItem(LS_SUBJECTS);
    localStorage.removeItem(LS_CLASSES);
    void refreshData();
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
        editingQuizId,
        setEditingQuizId,
        duplicateQuizId,
        setDuplicateQuizId,
        toastMessage,
        showToast,
        theme,
        toggleTheme,
        login,
        logout: () => logout(),
        switchUser,
        createNewQuiz,
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
