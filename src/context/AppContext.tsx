import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
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
  AnswerItem,
  SubAnswerItem,
} from '../types';
import {
  StorageService,
  cleanUserPayloadForSupabase,
  extractMissingColumn,
  DEFAULT_PASSWORD,
} from '../services/storage';
import { canonSubjectId, isRetiredSubject } from '../utils/subjectAliases';
import { loadAvatarCache, avatarMapFromCache, saveMyAvatar, syncAvatars } from '../services/avatarService';
import { hasPerm, normalizePerms, PERM_KEYS } from '../utils/permissions';
import {
  AppNotification, NotifAudience, loadNotifCache, loadReads, isForUser, makeNotification,
  pushNotification, pullNotifications, pullReads, markRead,
  loadHidden, hideNotifications, hideNotificationsForUser, deleteNotificationsEverywhere,
} from '../services/notificationService';
import { logActivity } from '../services/activityService';
import { Banner, loadBannerCache, syncBanners, saveBannerRemote, deleteBannerRemote } from '../services/bannerService';
import { loadAwardsCache, makeAward, pushAward, pullAwards } from '../services/awardsService';
import { AppSettings, loadSettings, syncSettings, saveSettings } from '../services/settingsService';
import { StudentAward } from '../utils/points';
import { describeQuizTarget } from '../utils/quizTarget';
import { targetStudents } from '../utils/quizAudience';
import { loadAttempt } from '../utils/activeAttempt';
import { formatQuizDateTime } from '../utils/quizWindow';
import {
  supabase,
  isSupabaseConfigured,
  getSessionToken,
  getSessionInfo,
  setServerSession,
  updateSessionInfo,
  isMissingRpc,
} from '../services/supabase';
import {
  pushQuiz,
  pullQuizzes,
  pushSubmission,
  pullSubmissions,
  flushPending,
  submitAttemptRemote,
  queueAttempt,
  QuizAttempt,
  deleteSubmissionsRemote,
} from '../services/quizSync';

// ---------------------------------------------------------------------
// إعدادات الجلسة
// ---------------------------------------------------------------------
/** مدة الجلسة القصوى بالساعات؛ بعدها يُطلب من المستخدم تسجيل الدخول من جديد */
const SESSION_MAX_HOURS = 12;
const SESSION_KEY = 'itqan_session_started_at';
/** كل كم ثانية يُحدَّث المحتوى تلقائياً من Supabase.
 *  الطلاب كل 3 دقائق لتقليل استهلاك حد التنزيل في الخطة المجانية (الطاقم كل 30 ثانية) */
const AUTO_REFRESH_SECONDS = 30;
const STUDENT_REFRESH_SECONDS = 180;

const LS_USERS = 'itqan_users_v2';
const LS_SUBJECTS = 'itqan_subjects_v2';
const LS_CLASSES = 'itqan_classes_v2';

export type ToastType = 'success' | 'error' | 'info';
export interface ToastMessage {
  text: string;
  type: ToastType;
}

type Kpis = ReturnType<typeof StorageService.getDynamicKPIs>;

/** إجابة الطالب كما تُرسل من شاشة الاختبار قبل التصحيح */
export interface QuizAttemptAnswer {
  question_id: string;
  selected_option: number | null;
  text_answer?: string;
  sub_answers?: Array<{ sub_question_id: string; selected_option: number | null; text_answer?: string }>;
}

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
  /** الصور الرمزية: معرّف المستخدم ← (صورة مصغّرة | preset:اسم) */
  avatars: Record<string, string>;
  setMyAvatar: (data: string | null) => Promise<{ ok: boolean; error?: string }>;

  /** الإشعارات الخاصة بالمستخدم الحالي فقط */
  notifications: Array<AppNotification & { read: boolean }>;
  unreadCount: number;
  markNotificationsRead: (ids: string[] | 'all') => Promise<void>;
  sendAnnouncement: (p: { title: string; body: string; audience: NotifAudience }) => Promise<{ ok: boolean; error?: string }>;
  /** إشعار تذكير للطلاب الموجّه إليهم الاختبار ولم يسلّموه بعد. يُرجع عدد الطلاب المُذكَّرين */
  remindLateStudents: (quizId: string) => Promise<number>;
  /** بانرات الصفحة الرئيسية (كلها؛ الظاهر منها يُحدد حسب الدور والتاريخ) */
  banners: Banner[];
  saveBanner: (b: Banner) => Promise<boolean>;
  deleteBanner: (id: string) => Promise<void>;
  /** حذف إشعارات من عند المستخدم الحالي فقط */
  deleteMyNotifications: (ids: string[] | 'all') => Promise<void>;
  /** كل إشعارات النظام (للمدير: صفحة إدارة الإشعارات) */
  allNotifications: AppNotification[];
  /** حذف نهائي من الجميع (المدير، أو مُرسل الإشعار لما أرسله) */
  deleteNotificationsForAll: (ids: string[]) => Promise<void>;
  /** المدير: مسح كل إشعارات مستخدم معيّن */
  clearUserNotifications: (userId: string) => Promise<void>;
  awards: StudentAward[];
  giveAward: (p: { student: User; title: string; note?: string; points: number }) => Promise<{ ok: boolean; error?: string }>;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  changeMyPassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
  /** المستخدم الحالي ما زال يستخدم كلمة المرور الافتراضية (يُطلب منه تغييرها) */
  passwordIsDefault: boolean;
  /** المدير يعاين حساباً آخر («تبديل الحساب»): العرض فقط، والخادم يتعامل معه كمدير */
  isPreview: boolean;
  /** العودة من المعاينة إلى حساب صاحب الجلسة */
  exitPreview: () => void;
  approveQuiz: (id: string) => Promise<void>;
  rejectQuiz: (id: string, reason: string) => Promise<void>;
  pendingApprovalsCount: number;

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
  ) => Promise<SyncOutcome & { id: string; status?: string }>;
  updateFullQuiz: (
    id: string,
    quizData: Partial<Quiz>,
    questions: any[],
    assignments: any[]
  ) => Promise<SyncOutcome & { status?: string }>;
  updateQuizInfo: (id: string, updates: Partial<Quiz>) => Promise<void>;
  deleteQuizItem: (id: string) => Promise<void>;
  toggleQuizActive: (id: string) => void;
  allowStudentRetake: (quizId: string, studentId: string) => void;
  revokeStudentRetake: (quizId: string, studentId: string) => void;
  reassignQuizToTeacher: (quizId: string, newTeacherId: string) => boolean;
  /** يُرجع التسليم المصحَّح، أو null إذا لم يكتمل (حُفظ للإرسال لاحقاً أو رُفض) */
  submitQuizAttempt: (
    quizId: string,
    answers: QuizAttemptAnswer[],
    timeSpentSeconds: number
  ) => Promise<Submission | null>;

  /** حذف مشاركات طلاب نهائياً (المدير أو صاحب صلاحية «حذف مشاركات الطلاب») */
  deleteSubmissions: (ids: string[]) => Promise<void>;
  /** تصحيح سؤال مقالي يدوياً (subQuestionId للسؤال الفرعي داخل القطعة) */
  gradeEssay: (submissionId: string, questionId: string, subQuestionId: string | null, marks: number) => Promise<boolean>;

  addUser: (userData: any) => Promise<User>;
  updateUserData: (id: string, updates: Partial<User>) => Promise<void>;
  resetUserPassword: (id: string, newPassword: string) => Promise<boolean>;
  deleteUserItem: (id: string) => Promise<void>;
  /** حذف عدة مستخدمين دفعة واحدة (لا يشمل المستخدم الحالي) */
  bulkDeleteUsers: (ids: string[]) => Promise<void>;
  /** نقل عدة طلاب إلى صف آخر دفعة واحدة */
  bulkMoveStudents: (ids: string[], classId: string) => Promise<void>;
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
  const normalizedPerms = normalizePerms(perms);

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
  if (u.role === 'supervisor') return StorageService.getSupervisorData(u).quizzes;
  if (u.role === 'teacher') {
    return canViewAllReports(u) || hasPerm(u, 'can_approve_quizzes')
      ? StorageService.getAllQuizzesWithDetails()
      : StorageService.getQuizzesForTeacher(u.id);
  }
  if (u.role === 'student') return StorageService.getQuizzesForStudent(u.id);
  return [];
}

function computeKpis(u: User | null): Kpis {
  if (u?.role === 'supervisor') {
    const d = StorageService.getSupervisorData(u);
    const k = StorageService.getDynamicKPIs(undefined, { studentIds: d.studentIds, quizIds: d.quizIds });
    if (!d.scope.all && d.scope.subjectIds.length > 0) {
      return { ...k, subjectPerformance: k.subjectPerformance.filter((x) => d.scope.subjectIds.includes(x.subjectId)) };
    }
    return k;
  }
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
// حفظ الصفحة الحالية عند التحديث (Refresh): لكل تبويب على حدة (sessionStorage)
// ---------------------------------------------------------------------
const VIEW_KEY = 'itqan_view_state_v1';

function allowedViews(u: User | null): string[] {
  if (!u) return [];
  const base = ['dashboard', 'quizzes', 'analytics', 'quiz_review', 'notifications'];
  // صفحة الاختبار تُستعاد بعد التحديث فقط إذا كانت هناك محاولة جارية محفوظة (المؤقت محفوظ معها)
  if (u.role === 'student') return [...base, 'my_points', 'take_quiz'];
  const out = [...base];
  if (u.role === 'admin') {
    out.push('users', 'users_management', 'students_management', 'subjects_classes', 'reports', 'create_quiz', 'quiz_results', 'quiz_preview', 'settings', 'banners');
  } else {
    out.push('quiz_results', 'quiz_preview');
    if (u.role === 'teacher') out.push('create_quiz');
    if (hasPerm(u, 'can_view_all_reports')) out.push('reports');
    if (hasPerm(u, 'can_add_custom_subjects') || hasPerm(u, 'can_manage_classes')) out.push('subjects_classes');
    if (hasPerm(u, 'can_add_students') || hasPerm(u, 'can_add_teachers')) out.push('users_management', 'students_management');
  }
  if (hasPerm(u, 'can_approve_quizzes')) out.push('approvals');
  if (hasPerm(u, 'can_view_leaderboard')) out.push('leaderboard');
  if (hasPerm(u, 'can_view_activity_log')) out.push('activity_log');
  return out;
}

function restoreViewState(u: User | null) {
  const fallback = { view: u ? 'dashboard' : 'login', activeQuizId: null as string | null, activeSubmissionId: null as string | null, editingQuizId: null as string | null };
  if (!u) return fallback;
  try {
    const raw = sessionStorage.getItem(VIEW_KEY);
    if (!raw) return fallback;
    const st = JSON.parse(raw);
    if (st.userId !== u.id || !allowedViews(u).includes(st.view)) return fallback;
    if ((st.view === 'quiz_results' || st.view === 'quiz_preview') && !st.activeQuizId) return fallback;
    if (st.view === 'quiz_review' && !st.activeSubmissionId) return fallback;
    if (st.view === 'take_quiz' && !(st.activeQuizId && loadAttempt(u.id, st.activeQuizId))) return fallback;
    return {
      view: st.view as string,
      activeQuizId: (st.activeQuizId || null) as string | null,
      activeSubmissionId: (st.activeSubmissionId || null) as string | null,
      editingQuizId: (st.editingQuizId || null) as string | null,
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------
// مزامنة المستخدمين والمواد والفصول (نفس المنطق السابق)
// ---------------------------------------------------------------------
async function syncUsersFromSupabase(): Promise<void> {
  const { data, error } = await supabase.from('users').select('*');
  if (error || !Array.isArray(data)) return;

  const secure = !!getSessionToken();
  if (secure) {
    // الوضع الآمن: الخادم هو المرجع، ولا نحتفظ بكلمات مرور على الجهاز.
    // نستبدل النسخة المحلية كاملة: الطالب يستلم حسابه فقط فتُحذف بيانات زملائه القديمة،
    // والمحذوفون من جهاز آخر لا يعودون للظهور.
    const remote = (data as any[]).map((r) => {
      const { password: _pw, ...rest } = normalizeUser(r) as any;
      return rest as User;
    });
    localStorage.setItem(LS_USERS, JSON.stringify(remote));
    return;
  }

  const local = StorageService.getUsers().map(normalizeUser);

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
  const [restored] = useState(() => restoreViewState(currentUser));
  const [currentView, setCurrentView] = useState<string>(restored.view);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(restored.activeQuizId);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(restored.editingQuizId);
  const [duplicateQuizId, setDuplicateQuizId] = useState<string | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(restored.activeSubmissionId);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const [passwordIsDefault, setPasswordIsDefault] = useState<boolean>(() => !!getSessionInfo()?.password_is_default);
  const [avatars, setAvatars] = useState<Record<string, string>>(() => avatarMapFromCache(loadAvatarCache()));

  const [quizzes, setQuizzes] = useState<QuizWithDetails[]>(() => computeQuizzes(currentUser));
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>(() =>
    currentUser ? StorageService.getAccessibleSubmissionsWithDetails(currentUser.id) : []
  );
  const [kpis, setKpis] = useState<Kpis>(() => computeKpis(currentUser));

  // الإشعارات والجوائز والإعدادات
  const [notifCache, setNotifCache] = useState<AppNotification[]>(() => loadNotifCache());
  const [reads, setReads] = useState<Set<string>>(() => (currentUser ? loadReads(currentUser.id) : new Set<string>()));
  const [hidden, setHidden] = useState<Set<string>>(() => (currentUser ? loadHidden(currentUser.id) : new Set<string>()));
  const [awards, setAwards] = useState<StudentAward[]>(() => loadAwardsCache());
  const [banners, setBanners] = useState<Banner[]>(() => loadBannerCache());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const seenNotifRef = useRef<Set<string> | null>(null);

  const notifications = useMemo(
    () =>
      currentUser
        ? notifCache
            .filter((n) => isForUser(n, currentUser) && !hidden.has(n.id))
            .map((n) => ({ ...n, read: reads.has(n.id) }))
        : [],
    [notifCache, reads, hidden, currentUser]
  );
  const unreadCount = notifications.filter((n) => !n.read).length;
  const pendingApprovalsCount = useMemo(
    () => (hasPerm(currentUser, 'can_approve_quizzes') ? (quizzes || []).filter((q) => q.status === 'pending_approval').length : 0),
    [quizzes, currentUser]
  );

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
  useEffect(() => {
    if (!currentUser) return;
    try {
      sessionStorage.setItem(
        VIEW_KEY,
        JSON.stringify({ userId: currentUser.id, view: currentView, activeQuizId, activeSubmissionId, editingQuizId })
      );
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentView, activeQuizId, activeSubmissionId, editingQuizId]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    setToastMessage({ text, type });
    // إلغاء مؤقت التنبيه السابق حتى لا يُخفي التنبيه الجديد قبل أوانه
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 4000);
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
    // دور صاحب الجلسة على الخادم (قد يختلف عن المستخدم المعروض عند «تبديل الحساب» للمعاينة)
    let serverRole: string | undefined;
    try {
      if (isSupabaseConfigured() && currentUserRef.current) {
        // التحقق من الجلسة على الخادم: انتهت أو أُلغيت (تغيير كلمة المرور / حذف الحساب)
        // أو جلسة قديمة من قبل تفعيل الحماية ← إعادة تسجيل الدخول
        try {
          const { data, error } = await supabase.rpc('itqan_session_user');
          if (!error && !data) {
            logoutRef.current('انتهت الجلسة، يرجى تسجيل الدخول من جديد');
            return;
          }
          if (!error && data) {
            serverRole = data.role;
            if (getSessionInfo()?.user_id !== data.id) updateSessionInfo({ user_id: data.id });
          }
        } catch {
          /* انقطاع الشبكة: نكمل بالنسخة المحلية */
        }
      }
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
          await flushPending(me);
          await pullQuizzes(me, serverRole);
          await pullSubmissions(me);
        } catch (e) {
          console.warn('[refreshData] quizzes/submissions sync failed:', e);
        }
        try {
          await syncAvatars();
        } catch (e) {
          console.warn('[refreshData] avatars sync failed:', e);
        }
        try {
          await syncSettings();
          await syncBanners();
          await pullAwards();
          await pullNotifications();
          if (me) await pullReads(me.id);
        } catch (e) {
          console.warn('[refreshData] notifications/settings sync failed:', e);
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
      setAvatars(avatarMapFromCache(loadAvatarCache()));
      setNotifCache(loadNotifCache());
      setAwards(loadAwardsCache());
      setBanners(loadBannerCache());
      setSettings(loadSettings());
      if (me) {
        const rd = loadReads(me.id);
        setReads(rd);
        setHidden(loadHidden(me.id));
        // تنبيه منبثق عند وصول إشعار جديد (لا نُنبّه بالقديم عند أول تحميل)
        const relevant = loadNotifCache().filter((n) => isForUser(n, me));
        if (seenNotifRef.current === null) {
          seenNotifRef.current = new Set(relevant.map((n) => n.id));
        } else {
          const fresh = relevant.filter((n) => !rd.has(n.id) && !seenNotifRef.current!.has(n.id));
          fresh.forEach((n) => seenNotifRef.current!.add(n.id));
          if (fresh.length) showToast(`🔔 ${fresh[0].title}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`, 'info');
        }
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [recompute, showToast]);

  const logoutRef = useRef<(message?: string) => void>(() => undefined);

  // تحديث فوري عند تسجيل الدخول أو تغيّر المستخدم
  useEffect(() => {
    void refreshData();
  }, [currentUser?.id, currentUser?.role, refreshData]);

  // ---------------- تسجيل الخروج وانتهاء الجلسة ----------------
  const logout = useCallback(
    (message = 'تم تسجيل الخروج بنجاح') => {
      localStorage.removeItem('itqan_current_user_id_v2');
      localStorage.removeItem(SESSION_KEY);
      const oldToken = getSessionToken();
      if (oldToken) {
        StorageService.clearCachedDataForLogout();
        // إنهاء الجلسة على الخادم ثم حذف الرمز من الجهاز (إلا إذا سجّل مستخدم آخر الدخول في الأثناء)
        void Promise.resolve(supabase.rpc('itqan_logout')).finally(() => {
          if (getSessionToken() === oldToken) setServerSession(null);
        });
      }
      clearBrowserSession();
      void supabase.auth.signOut().catch(() => undefined);

      seenNotifRef.current = null;
      currentUserRef.current = null;
      setPasswordIsDefault(false);
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

  logoutRef.current = logout;

  // تحديث تلقائي دوري + عند العودة للتبويب + فحص انتهاء الجلسة
  useEffect(() => {
    if (!currentUser) return;

    let lastTick = Date.now();
    const tick = () => {
      lastTick = Date.now();
      if (isSessionExpired() && currentViewRef.current !== 'take_quiz') {
        logout('انتهت الجلسة، يرجى تسجيل الدخول من جديد');
        return;
      }
      // لا نقاطع الطالب أثناء أداء الاختبار
      if (document.visibilityState === 'visible' && currentViewRef.current !== 'take_quiz') {
        void refreshData();
      }
    };

    const everySeconds = currentUser.role === 'student' ? STUDENT_REFRESH_SECONDS : AUTO_REFRESH_SECONDS;
    const interval = setInterval(tick, everySeconds * 1000);
    const onVisible = () => {
      // العودة للتبويب تُحدّث البيانات، لكن مرة واحدة كل 30 ثانية على الأكثر
      if (document.visibilityState === 'visible' && Date.now() - lastTick > 30_000) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [currentUser?.id, currentUser?.role, logout, refreshData]);

  // ---------------- تسجيل الدخول ----------------
  const startSession = (user: User) => {
    StorageService.setCurrentUserId(user.id);
    localStorage.setItem(SESSION_KEY, String(Date.now()));
    seenNotifRef.current = null;
    currentUserRef.current = user;
    setCurrentUserState(user);
    setCurrentView('dashboard');
    showToast(`مرحباً بك يا ${user.name}`, 'success');
  };

  /** حفظ بيانات المستخدم القادمة من الخادم في النسخة المحلية */
  const cacheUser = (user: User) => {
    const all = StorageService.getUsers();
    const idx = all.findIndex((u) => u.id === user.id || (!!user.national_id && u.national_id === user.national_id));
    if (idx >= 0) all[idx] = { ...all[idx], ...user };
    else all.push(user);
    localStorage.setItem(LS_USERS, JSON.stringify(all));
  };

  const login = async (nationalId: string, password: string): Promise<boolean> => {
    const id = nationalId.trim();

    // الدخول الآمن: التحقق على الخادم (كلمات المرور مشفّرة ولا تصل للمتصفح)
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.rpc('itqan_login', { p_national_id: id, p_password: password });
        if (!error && data) {
          if (data.ok) {
            setServerSession(data.token, { expires_at: data.expires_at, password_is_default: !!data.password_is_default, user_id: data.user?.id });
            setPasswordIsDefault(!!data.password_is_default);
            const user = normalizeUser(data.user);
            cacheUser(user);
            startSession(user);
            return true;
          }
          showToast(
            data.error === 'locked'
              ? `تم إيقاف الدخول مؤقتاً بسبب محاولات خاطئة متكررة. حاول بعد ${Math.ceil((data.retry_after_seconds || 600) / 60)} دقائق`
              : 'رقم الهوية / الرقم الأكاديمي أو كلمة المرور غير صحيحة',
            'error'
          );
          return false;
        }
        if (error && !isMissingRpc(error)) {
          showToast(`تعذر الاتصال بالخادم (${error.message})`, 'error');
          return false;
        }
        // دوال الحماية غير موجودة بعد (لم يُشغَّل ملفات 003_security): نكمل بالطريقة القديمة
      } catch (e: any) {
        showToast('تعذر الاتصال بالخادم، تحقق من الإنترنت', 'error');
        return false;
      }
    }

    const local = StorageService.authenticate(id, password);
    if (local && local.password) {
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
          cacheUser(user);
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

  const sessionOwnerId = getSessionToken() ? getSessionInfo()?.user_id : undefined;
  const isPreview = !!currentUser && !!sessionOwnerId && currentUser.id !== sessionOwnerId;
  const exitPreview = () => {
    if (sessionOwnerId) switchUser(sessionOwnerId);
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

  const createNewQuiz: AppContextType['createNewQuiz'] = async (quizData, questions, assignments) => {
    const me = currentUserRef.current;
    // اشتراط الاعتماد: اختبار المعلم لا ينشر مباشرة إلا لمن يملك صلاحية الاعتماد (والمدير)
    const needsApproval = settings.require_quiz_approval && !hasPerm(me, 'can_approve_quizzes');
    const status = needsApproval ? 'pending_approval' : 'published';
    const created = StorageService.createQuiz({ ...(quizData as any), status } as any, questions as any, assignments as any);
    const outcome = await syncQuiz(created.id);
    recompute();
    if (status === 'published') {
      void notifyQuizPublished(created.id);
      if (outcome.synced) showToast(`تم إنشاء الاختبار بنجاح: ${created.title}`, 'success');
    } else {
      void notifyApprovers(created.id);
      showToast('تم إرسال الاختبار للاعتماد، وسيظهر للطلاب بعد الموافقة', 'info');
    }
    log('quiz_created', { type: 'quiz', id: created.id, name: created.title }, needsApproval ? 'بانتظار الاعتماد' : undefined);
    return { id: created.id, status, ...outcome };
  };

  const updateFullQuiz: AppContextType['updateFullQuiz'] = async (id, quizData, questions, assignments) => {
    const me = currentUserRef.current;
    const existing = StorageService.getQuizById(id);
    let patch: Partial<Quiz> = { ...quizData };
    let resubmitted = false;
    if (
      existing &&
      (existing.status === 'pending_approval' || existing.status === 'rejected') &&
      settings.require_quiz_approval &&
      !hasPerm(me, 'can_approve_quizzes')
    ) {
      patch = { ...patch, status: 'pending_approval', review_note: '' };
      resubmitted = existing.status === 'rejected';
    }
    StorageService.updateFullQuiz(id, patch, questions as any, assignments as any);
    const outcome = await syncQuiz(id);
    recompute();
    if (resubmitted) void notifyApprovers(id);
    if (outcome.synced) showToast('تم حفظ وتحديث بيانات الاختبار بنجاح', 'success');
    log('quiz_updated', { type: 'quiz', id, name: (patch.title as string) || existing?.title }, resubmitted ? 'أُعيد إرساله للاعتماد' : undefined);
    return { ...outcome, status: (patch.status as string) || existing?.status };
  };

  const updateQuizInfo = async (id: string, updates: Partial<Quiz>) => {
    StorageService.updateQuiz(id, updates);
    recompute();
    const outcome = await syncQuiz(id);
    if (outcome.synced) showToast('تم تحديث بيانات الاختبار بنجاح', 'success');
  };

  const deleteQuizItem = async (id: string) => {
    const qd = StorageService.getQuizById(id);
    StorageService.deleteQuiz(id);
    recompute();
    const outcome = await syncQuiz(id);
    if (outcome.synced) showToast('تم حذف الاختبار واستبعاد درجاته', 'info');
    log('quiz_deleted', { type: 'quiz', id, name: qd?.title });
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
    if (res.success) {
      void syncQuiz(quizId);
      const qz = StorageService.getQuizById(quizId);
      const st = StorageService.getUserById(studentId);
      void notify({ type: 'retake_granted', title: 'تم السماح لك بإعادة اختبار', body: `الاختبار: ${qz?.title || ''}`, audience: { user_ids: [studentId] }, ref_type: 'quiz', ref_id: quizId });
      log('retake_granted', { type: 'quiz', id: quizId, name: qz?.title }, st?.name);
    }
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
    if (me.role !== 'admin') {
      showToast('إسناد الاختبار لمعلم آخر متاح لمدير النظام فقط', 'error');
      return false;
    }
    const res = StorageService.reassignQuiz(quizId, newTeacherId, me.id);
    if (res.success) {
      recompute();
      void syncQuiz(quizId);
      showToast(res.message, 'success');
      log('quiz_reassigned', { type: 'quiz', id: quizId, name: StorageService.getQuizById(quizId)?.title }, `إلى: ${StorageService.getUserById(newTeacherId)?.name || newTeacherId}`);
      return true;
    }
    showToast(res.message, 'error');
    return false;
  };

  /** تسليم اختبار الطالب: يُحفظ محلياً فوراً ثم يُرسل للخادم في الخلفية */
  const submitQuizAttempt: AppContextType['submitQuizAttempt'] = async (
    quizId,
    answers,
    timeSpentSeconds
  ) => {
    const me = currentUserRef.current;
    if (!me) throw new Error('لا يوجد مستخدم مسجل');

    // معاينة المدير لحساب طالب: لا يُسجَّل تسليم باسم الطالب
    const ownerId = getSessionInfo()?.user_id;
    if (getSessionToken() && ownerId && ownerId !== me.id) {
      showToast('أنت في وضع معاينة حساب الطالب: يمكنك تصفح الاختبار فقط، ولا يُسجَّل التسليم. للتجربة الكاملة سجّل الدخول بحساب الطالب نفسه.', 'info');
      return null;
    }

    // الوضع الآمن: الخادم يصحّح (لا يمكن للطالب إرسال درجة جاهزة)
    if (getSessionToken()) {
      const attempt: QuizAttempt = {
        client_id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        student_id: me.id,
        quiz_id: quizId,
        answers,
        time_spent: timeSpentSeconds,
      };
      const res = await submitAttemptRemote(attempt);
      if (res.kind === 'ok') {
        recompute();
        const pct = res.submission.percentage;
        showToast(`تم تسليم الاختبار! حصلت على ${pct}%`, pct >= 60 ? 'success' : 'info');
        return res.submission;
      }
      if (res.kind === 'offline') {
        queueAttempt(attempt);
        showToast('حُفظت إجاباتك على جهازك وستُرسل للتصحيح تلقائياً عند عودة الاتصال. لا تحذف بيانات المتصفح.', 'info');
        return null;
      }
      if (res.kind === 'rejected') {
        recompute();
        if (res.error === 'already_submitted' && res.submission) {
          showToast('سبق أن سلّمت هذا الاختبار، هذه نتيجتك المسجلة', 'info');
          return res.submission;
        }
        const msg: Record<string, string> = {
          ended: 'انتهى وقت إتاحة الاختبار، لم يُقبل التسليم',
          not_started: 'لم يبدأ وقت الاختبار بعد',
          quiz_not_available: 'الاختبار لم يعد متاحاً لك',
          quiz_not_found: 'الاختبار غير موجود',
          no_session: 'انتهت الجلسة، سجّل الدخول من جديد ثم أعد المحاولة',
        };
        if (res.error === 'no_session') queueAttempt(attempt);
        showToast(msg[res.error] || `تعذر تسليم الاختبار (${res.error})`, 'error');
        return null;
      }
      // kind === 'legacy': دوال الحماية غير موجودة بعد، نكمل بالطريقة القديمة
    }

    const quiz = StorageService.getQuizById(quizId);
    const questions: Question[] = StorageService.getQuestionsByQuizId(quizId);
    if (!quiz) throw new Error('الاختبار غير موجود');

    const isRetake = quiz.allowed_retake_student_ids?.includes(me.id) || false;

    // الأسئلة المقالية لا تُصحَّح آلياً: تُحفظ الإجابة النصية بدرجة 0 لحين التصحيح اليدوي
    const gradeChoice = (
      item: { type?: string; correct_option_index?: number; marks: number },
      selected: number | null | undefined
    ) => {
      const marks = Number(item.marks) || 0;
      const isCorrect = item.type !== 'essay' && selected != null && selected === item.correct_option_index;
      return { is_correct: isCorrect, marks_awarded: isCorrect ? marks : 0 };
    };

    let totalScore = 0;
    const graded: AnswerItem[] = answers.map((a) => {
      const q = questions.find((x) => x.id === a.question_id);
      if (q?.type === 'passage') {
        const subs = q.sub_questions || [];
        const sub_answers: SubAnswerItem[] = subs.map((sq) => {
          const sa = a.sub_answers?.find((x) => x.sub_question_id === sq.id);
          return {
            sub_question_id: sq.id,
            selected_option: sa?.selected_option ?? null,
            text_answer: sa?.text_answer || undefined,
            ...gradeChoice(sq, sa?.selected_option),
          };
        });
        const awarded = sub_answers.reduce((s, x) => s + (x.marks_awarded || 0), 0);
        const possible = subs.reduce((s, sq) => s + (Number(sq.marks) || 0), 0);
        totalScore += awarded;
        return {
          question_id: a.question_id,
          selected_option: null,
          is_correct: possible > 0 && awarded === possible,
          marks_awarded: awarded,
          sub_answers,
        };
      }
      const res = q ? gradeChoice(q, a.selected_option) : { is_correct: false, marks_awarded: 0 };
      totalScore += res.marks_awarded;
      return {
        question_id: a.question_id,
        selected_option: a.selected_option,
        text_answer: a.text_answer || undefined,
        ...res,
      };
    });

    const totalPossible = questions.reduce(
      (sum, q) =>
        sum +
        (q.type === 'passage'
          ? (q.sub_questions || []).reduce((s, sq) => s + (Number(sq.marks) || 0), 0)
          : Number(q.marks) || 0),
      0
    );
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

  const deleteSubmissions: AppContextType['deleteSubmissions'] = async (ids) => {
    const me = currentUserRef.current;
    if (!hasPerm(me, 'can_delete_submissions')) return void showToast('لا تملك صلاحية حذف المشاركات', 'error');
    if (!ids.length) return;
    const res = await deleteSubmissionsRemote(ids);
    recompute();
    if (!res.deleted.length) {
      showToast(res.error ? `تعذر الحذف (${res.error})` : 'لم يُحذف شيء: لا تملك صلاحية حذف هذه المشاركات على الخادم', 'error');
      return;
    }
    showToast(
      res.deleted.length < ids.length
        ? `حُذفت ${res.deleted.length} من ${ids.length} مشاركة`
        : res.deleted.length > 1 ? `تم حذف ${res.deleted.length} مشاركات` : 'تم حذف المشاركة',
      res.deleted.length < ids.length ? 'info' : 'success'
    );
    log('submissions_deleted', { type: 'submission', name: `${res.deleted.length} مشاركة` });
  };

  const gradeEssay: AppContextType['gradeEssay'] = async (submissionId, questionId, subQuestionId, marks) => {
    const me = currentUserRef.current;
    if (!me || me.role === 'student') return false;
    const sub = StorageService.getSubmissionById(submissionId);
    if (!sub) return false;
    const q = StorageService.getQuestionsByQuizId(sub.quiz_id).find((x) => x.id === questionId);
    if (!q) return false;
    const sq = subQuestionId ? (q.sub_questions || []).find((x) => x.id === subQuestionId) : undefined;
    const max = Number((sq || q).marks) || 0;
    const value = Math.max(0, Math.min(max, Math.round((Number(marks) || 0) * 2) / 2));

    const answers = [...(sub.answers_json || [])];
    let idx = answers.findIndex((a) => a.question_id === questionId);
    if (idx < 0) {
      answers.push({ question_id: questionId, selected_option: null, is_correct: false, marks_awarded: 0 });
      idx = answers.length - 1;
    }
    const item = { ...answers[idx] };
    if (subQuestionId) {
      const subs = [...(item.sub_answers || [])];
      let si = subs.findIndex((x) => x.sub_question_id === subQuestionId);
      if (si < 0) {
        subs.push({ sub_question_id: subQuestionId, selected_option: null });
        si = subs.length - 1;
      }
      subs[si] = { ...subs[si], marks_awarded: value, is_correct: value === max && max > 0, graded: true };
      item.sub_answers = subs;
      item.marks_awarded = subs.reduce((t, x) => t + (Number(x.marks_awarded) || 0), 0);
      const possible = (q.sub_questions || []).reduce((t, x) => t + (Number(x.marks) || 0), 0);
      item.is_correct = possible > 0 && item.marks_awarded === possible;
    } else {
      item.marks_awarded = value;
      item.is_correct = value === max && max > 0;
      item.graded = true;
    }
    answers[idx] = item;

    const score = answers.reduce((t, a) => t + (Number(a.marks_awarded) || 0), 0);
    const total = Number(sub.total_possible_score) || 0;
    const updated = { ...sub, answers_json: answers, score, percentage: total > 0 ? Math.round((score / total) * 100) : 0 };
    StorageService.saveSubmissionFromRemote(updated);
    recompute();
    const res = await pushSubmission(submissionId);
    showToast(res.ok ? 'تم حفظ درجة السؤال المقالي' : `حُفظت الدرجة على جهازك فقط (${res.error})`, res.ok ? 'success' : 'error');
    return res.ok;
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

    let remoteFailure: string | null = null;
    const droppedCols: string[] = [];
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
            droppedCols.push(missing);
            continue;
          }
          if (error.message?.includes('column') || error.code === 'PGRST204') {
            droppedCols.push('الصلاحيات والإسنادات');
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
          remoteFailure = error.message;
          break;
        } catch (e: any) {
          remoteFailure = e?.message || 'تعذر الاتصال بالخادم';
          break;
        }
      }
    }
    if (!remoteFailure && droppedCols.length) {
      remoteFailure = `أعمدة غير موجودة في جدول users: ${droppedCols.join('، ')}`;
    }
    if (remoteFailure) {
      showToast(`أُضيف المستخدم على هذا الجهاز فقط ولم يصل للخادم (${remoteFailure}). شغّل ملف supabase/migrations/002_users_columns.sql`, 'error');
      log('user_added', { type: 'user', id: created.id, name: created.name }, `الدور: ${created.role} (لم يصل للخادم)`);
      return normalized;
    }

    log('user_added', { type: 'user', id: created.id, name: created.name }, `الدور: ${created.role}`);
    const clsName =
      created.role === 'student' && created.class_id
        ? StorageService.getClassById(created.class_id)?.name
        : undefined;
    showToast(
      clsName
        ? `تمت إضافة الطالب (${created.name}) إلى: ${clsName}`
        : `تمت إضافة المستخدم (${created.name}) بنجاح`,
      'success'
    );
    return normalized;
  };

  const updateUserData = async (id: string, updates: Partial<User>) => {
    try {
      const now = new Date().toISOString();
      const before = StorageService.getUserById(id);
      const updated = StorageService.updateUser(id, { ...updates, updated_at: now });
      if (!updated) {
        showToast('لم يتم العثور على المستخدم المطلوب تعديله', 'error');
        return;
      }
      const normalized = normalizeUser(updated);
      setUsers((prev) => prev.map((u) => (u.id === id ? normalized : u)));

      // سجل النشاط: نسجّل فقط تغيّر الدور أو الصلاحيات أو الصف أو المسمى
      const changes: string[] = [];
      if (before && updates.role && updates.role !== before.role) changes.push(`الدور: ${before.role} ← ${updates.role}`);
      if (updates.teacher_permissions) {
        const b = normalizePerms(before?.teacher_permissions || before?.permissions);
        const a2 = normalizePerms(updates.teacher_permissions);
        const diff = PERM_KEYS.filter((k) => a2[k] !== b[k]);
        if (diff.length) changes.push(`الصلاحيات: ${diff.map((k) => `${a2[k] ? '+' : '-'}${k}`).join('، ')}`);
      }
      if (before && updates.class_id !== undefined && (updates.class_id || null) !== (before.class_id || null)) changes.push('تغيير الصف');
      if (updates.job_title !== undefined && (updates.job_title || '') !== (before?.job_title || '')) changes.push('المسمى الوظيفي');
      if (changes.length) log('user_updated', { type: 'user', id, name: normalized.name }, changes.join(' | '));

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
          job_title: normalized.job_title ?? null,
          updated_at: now,
        };
        if (updates.password && updates.password.trim()) payload.password = updates.password.trim();
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

        const dropped: string[] = [];
        let failure: string | null = null;
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            const { error } = await supabase.from('users').update(payload).eq('id', id);
            if (!error) break;
            const missing = extractMissingColumn(error.message || '');
            if (missing && missing in payload) {
              delete payload[missing];
              dropped.push(missing);
              continue;
            }
            failure = error.message;
            break;
          } catch (e: any) {
            failure = e?.message || 'تعذر الاتصال بالخادم';
            break;
          }
        }
        // لا نُخفي فشل الحفظ: كان التعديل يظهر محفوظاً على هذا الجهاز فقط ثم يختفي عند الآخرين
        if (failure) {
          showToast(`لم يُحفظ التعديل على الخادم (${failure}). شغّل ملف supabase/migrations/002_users_columns.sql`, 'error');
          return;
        }
        if (dropped.length) {
          showToast(`حُفظ التعديل جزئياً: الأعمدة (${dropped.join('، ')}) غير موجودة في جدول users. شغّل ملف supabase/migrations/002_users_columns.sql`, 'error');
          return;
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
      if (currentUserRef.current?.id !== id) log('password_reset', { type: 'user', id, name: StorageService.getUserById(id)?.name });
      showToast('تمت إعادة تعيين كلمة المرور بنجاح', 'success');
      return true;
    } catch (e) {
      console.error('Error resetting password:', e);
      showToast('حدث خطأ أثناء إعادة تعيين كلمة المرور', 'error');
      return false;
    }
  };

  const deleteUserItem = async (id: string) => {
    const gone = StorageService.getUserById(id);
    StorageService.deleteUser(id);
    log('user_deleted', { type: 'user', id, name: gone?.name });
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

  const bulkDeleteUsers: AppContextType['bulkDeleteUsers'] = async (ids) => {
    const me = currentUserRef.current;
    const list = ids.filter((id) => id !== me?.id);
    if (!list.length) return;
    let deleted = list;
    if (isSupabaseConfigured()) {
      deleted = [];
      for (let i = 0; i < list.length; i += 100) {
        const { data, error } = await supabase.from('users').delete().in('id', list.slice(i, i + 100)).select('id');
        if (error) {
          showToast(`تعذر حذف بعض المستخدمين (${error.message})`, 'error');
          break;
        }
        (data || []).forEach((r: any) => deleted.push(r.id));
      }
    }
    deleted.forEach((id) => StorageService.deleteUser(id));
    setUsers((prev) => prev.filter((u) => !deleted.includes(u.id)));
    recompute();
    if (deleted.length) {
      log('user_deleted', { type: 'user', name: `${deleted.length} مستخدم` }, 'حذف جماعي');
      showToast(
        deleted.length < list.length ? `حُذف ${deleted.length} من ${list.length} (الباقي لا تملك صلاحية حذفه)` : `تم حذف ${deleted.length} مستخدم`,
        deleted.length < list.length ? 'info' : 'success'
      );
    } else showToast('لم يُحذف أحد: لا تملك صلاحية حذف هؤلاء المستخدمين', 'error');
  };

  const bulkMoveStudents: AppContextType['bulkMoveStudents'] = async (ids, classId) => {
    const students = ids.filter((id) => StorageService.getUserById(id)?.role === 'student');
    const cls = StorageService.getClassById(classId);
    if (!students.length || !cls) return;
    const now = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const { error } = await supabase
        .from('users')
        .update({ class_id: classId, assigned_class_ids: [classId], updated_at: now })
        .in('id', students);
      if (error) return void showToast(`تعذر نقل الطلاب (${error.message})`, 'error');
    }
    students.forEach((id) => StorageService.updateUser(id, { class_id: classId, assigned_class_ids: [classId], updated_at: now }));
    setUsers(StorageService.getUsers().map(normalizeUser));
    recompute();
    log('user_updated', { type: 'class', id: classId, name: cls.name }, `نقل ${students.length} طالب`);
    showToast(`تم نقل ${students.length} طالب إلى ${cls.name}`, 'success');
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

  // ---------------- سجل النشاط + الإشعارات (دوال داخلية) ----------------
  const log = (action: string, target?: { type?: string; id?: string; name?: string | null }, details?: string) => {
    const me = currentUserRef.current;
    void logActivity({
      actor_id: me?.id || null, actor_name: me?.name || null, actor_role: me?.role || null,
      action, target_type: target?.type || null, target_id: target?.id || null, target_name: target?.name || null, details: details || null,
    });
  };

  const notify = async (p: { type: AppNotification['type']; title: string; body: string; audience: NotifAudience; ref_type?: string; ref_id?: string }) => {
    const me = currentUserRef.current;
    const n = makeNotification({ ...p, created_by: me?.id || null, created_by_name: me?.name || null });
    await pushNotification(n);
    setNotifCache(loadNotifCache());
  };

  /** إشعار الطلاب المرتبطين بالاختبار (حسب الصف أو الأسماء المحددة أو الجميع) مع المادة والصف */
  const notifyQuizPublished = async (quizId: string) => {
    const quiz = StorageService.getQuizById(quizId);
    if (!quiz) return;
    const asg = StorageService.getAssignmentsByQuizId(quizId).filter((a) => a.target_type !== 'assigned_teacher');
    const audience: NotifAudience = {};
    if (asg.some((a) => a.target_type === 'all')) { audience.all = true; audience.roles = ['student']; }
    const classIds = asg.filter((a) => a.target_type === 'class' && a.target_id).map((a) => a.target_id as string);
    if (classIds.length) audience.class_ids = classIds;
    const studentIds = asg
      .filter((a) => a.target_type === 'specific_students' && a.target_id)
      .flatMap((a) => String(a.target_id).split(',').map((x) => x.trim()).filter(Boolean));
    if (studentIds.length) audience.student_ids = studentIds;
    if (!audience.all && !audience.class_ids && !audience.student_ids) return;
    const subject = StorageService.getSubjectById(quiz.subject_id)?.name || 'مادة عامة';
    const target = describeQuizTarget(asg, StorageService.getClasses());
    await notify({
      type: 'quiz_published',
      title: `اختبار جديد: ${quiz.title}`,
      // سطر لكل معلومة (تُعرض كجدول مرتب في الإشعارات)
      body: [
        `المادة: ${subject}`,
        `الفئة: ${target}`,
        `يبدأ: ${formatQuizDateTime(quiz.start_date, 'start')}`,
        `ينتهي: ${formatQuizDateTime(quiz.end_date, 'end')}`,
        `المدة: ${quiz.duration_minutes} دقيقة`,
      ].join('\n'),
      audience, ref_type: 'quiz', ref_id: quizId,
    });
  };

  const remindLateStudents: AppContextType['remindLateStudents'] = async (quizId) => {
    const quiz = StorageService.getQuizById(quizId);
    if (!quiz) return 0;
    const done = new Set(StorageService.getSubmissions().filter((x) => x.quiz_id === quizId).map((x) => x.student_id));
    const late = targetStudents(StorageService.getAssignmentsByQuizId(quizId), StorageService.getStudents()).filter((st) => !done.has(st.id));
    if (!late.length) {
      showToast('كل الطلاب سلّموا هذا الاختبار', 'success');
      return 0;
    }
    await notify({
      type: 'quiz_reminder',
      title: `تذكير: لم تسلّم اختبار ${quiz.title}`,
      body: [`ينتهي: ${formatQuizDateTime(quiz.end_date, 'end')}`, `المدة: ${quiz.duration_minutes} دقيقة`].join('\n'),
      audience: { student_ids: late.map((st) => st.id) }, ref_type: 'quiz', ref_id: quizId,
    });
    log('quiz_reminder', { type: 'quiz', id: quizId, name: quiz.title }, `${late.length} طالب`);
    showToast(`أُرسل تذكير إلى ${late.length === 1 ? 'طالب واحد' : late.length === 2 ? 'طالبين' : late.length <= 10 ? `${late.length} طلاب` : `${late.length} طالباً`}`, 'success');
    return late.length;
  };

  const notifyApprovers = async (quizId: string) => {
    const quiz = StorageService.getQuizById(quizId);
    if (!quiz) return;
    const approvers = StorageService.getUsers().filter((u) => u.role !== 'student' && u.role !== 'admin' && hasPerm(u, 'can_approve_quizzes')).map((u) => u.id);
    await notify({
      type: 'quiz_pending',
      title: `اختبار بانتظار الاعتماد: ${quiz.title}`,
      body: [
        `المعلم: ${StorageService.getUserById(quiz.teacher_id)?.name || 'معلم'}`,
        `المادة: ${StorageService.getSubjectById(quiz.subject_id)?.name || '—'}`,
      ].join('\n'),
      audience: { roles: ['admin'], user_ids: approvers }, ref_type: 'quiz', ref_id: quizId,
    });
  };

  const approveQuiz = async (id: string) => {
    const me = currentUserRef.current;
    if (!hasPerm(me, 'can_approve_quizzes')) return void showToast('لا تملك صلاحية اعتماد الاختبارات', 'error');
    const q = StorageService.getQuizById(id);
    if (!q) return;
    StorageService.updateQuiz(id, { status: 'published', review_note: '' });
    await syncQuiz(id);
    recompute();
    void notifyQuizPublished(id);
    void notify({ type: 'quiz_approved', title: `تم اعتماد اختبارك: ${q.title}`, body: 'أصبح الاختبار ظاهراً للطلاب.', audience: { user_ids: [q.teacher_id] }, ref_type: 'quiz', ref_id: id });
    log('quiz_approved', { type: 'quiz', id, name: q.title });
    showToast('تم اعتماد الاختبار ونشره للطلاب', 'success');
  };

  const rejectQuiz = async (id: string, reason: string) => {
    const me = currentUserRef.current;
    if (!hasPerm(me, 'can_approve_quizzes')) return void showToast('لا تملك صلاحية اعتماد الاختبارات', 'error');
    const q = StorageService.getQuizById(id);
    if (!q) return;
    StorageService.updateQuiz(id, { status: 'rejected', review_note: reason });
    await syncQuiz(id);
    recompute();
    void notify({ type: 'quiz_rejected', title: `تم رفض اختبارك: ${q.title}`, body: `السبب: ${reason}`, audience: { user_ids: [q.teacher_id] }, ref_type: 'quiz', ref_id: id });
    log('quiz_rejected', { type: 'quiz', id, name: q.title }, reason);
    showToast('تم رفض الاختبار وإبلاغ المعلم', 'info');
  };

  const markNotificationsRead = async (ids: string[] | 'all') => {
    const me = currentUserRef.current;
    if (!me) return;
    const list = ids === 'all' ? notifications.filter((n) => !n.read).map((n) => n.id) : ids;
    if (!list.length) return;
    setReads((prev) => new Set([...Array.from(prev), ...list]));
    await markRead(me.id, list);
  };

  const saveBanner: AppContextType['saveBanner'] = async (b) => {
    if (currentUserRef.current?.role !== 'admin') {
      showToast('إدارة البانرات لمدير النظام فقط', 'error');
      return false;
    }
    const res = await saveBannerRemote(b);
    setBanners(loadBannerCache());
    if (res.ok) {
      showToast('تم حفظ البانر', 'success');
      log('banner_saved', { type: 'banner', id: b.id, name: b.title || 'بانر' });
    } else {
      showToast(/banners/.test(res.error || '') ? 'شغّل تحديث قاعدة البيانات 006 أولاً' : `تعذر حفظ البانر (${res.error})`, 'error');
    }
    return res.ok;
  };

  const deleteBanner: AppContextType['deleteBanner'] = async (id) => {
    const b = banners.find((x) => x.id === id);
    const res = await deleteBannerRemote(id);
    setBanners(loadBannerCache());
    showToast(res.ok ? 'تم حذف البانر' : `تعذر الحذف (${res.error})`, res.ok ? 'info' : 'error');
    if (res.ok) log('banner_deleted', { type: 'banner', id, name: b?.title || 'بانر' });
  };

  const deleteMyNotifications: AppContextType['deleteMyNotifications'] = async (ids) => {
    const me = currentUserRef.current;
    if (!me) return;
    const list = ids === 'all' ? notifications.map((n) => n.id) : ids;
    if (!list.length) return;
    setHidden((prev) => new Set([...Array.from(prev), ...list]));
    setReads((prev) => new Set([...Array.from(prev), ...list]));
    const res = await hideNotifications(me.id, list);
    showToast(
      res.ok ? (list.length > 1 ? `تم حذف ${list.length} إشعارات` : 'تم حذف الإشعار') : res.error || 'حُذف من هذا الجهاز فقط',
      res.ok ? 'success' : 'info'
    );
  };

  const deleteNotificationsForAll: AppContextType['deleteNotificationsForAll'] = async (ids) => {
    const me = currentUserRef.current;
    if (!me || !ids.length) return;
    const allowed = ids.filter((id) => me.role === 'admin' || notifCache.find((n) => n.id === id)?.created_by === me.id);
    if (!allowed.length) return void showToast('الحذف النهائي متاح للمدير أو لمُرسل الإشعار فقط', 'error');
    const res = await deleteNotificationsEverywhere(allowed);
    setNotifCache(loadNotifCache());
    if (res.error && !res.deleted) showToast(`تعذر الحذف (${res.error})`, 'error');
    else if (res.deleted < allowed.length) showToast(`حُذف ${res.deleted} من ${allowed.length} (الباقي لا تملك صلاحية حذفه)`, 'info');
    else showToast(res.deleted > 1 ? `تم حذف ${res.deleted} إشعارات من الجميع` : 'تم حذف الإشعار من الجميع', 'success');
    log('notifications_deleted', { type: 'notification', name: `${res.deleted} إشعار` });
  };

  const clearUserNotifications: AppContextType['clearUserNotifications'] = async (userId) => {
    const me = currentUserRef.current;
    if (me?.role !== 'admin') return void showToast('هذا الإجراء للمدير فقط', 'error');
    const target = StorageService.getUserById(userId);
    if (!target) return;
    const ids = notifCache.filter((n) => isForUser(n, normalizeUser(target))).map((n) => n.id);
    if (!ids.length) return void showToast(`لا توجد إشعارات لـ ${target.name}`, 'info');
    const res = await hideNotificationsForUser(userId, ids);
    showToast(res.ok ? `تم مسح ${ids.length} إشعارات من عند ${target.name}` : `تعذر المسح (${res.error})`, res.ok ? 'success' : 'error');
    if (res.ok) log('notifications_cleared', { type: 'user', id: userId, name: target.name }, `${ids.length} إشعار`);
  };

  const sendAnnouncement: AppContextType['sendAnnouncement'] = async ({ title, body, audience }) => {
    const me = currentUserRef.current;
    if (!me || !hasPerm(me, 'can_send_announcements')) {
      showToast('لا تملك صلاحية إرسال الإعلانات', 'error');
      return { ok: false, error: 'no-permission' };
    }
    const n = makeNotification({ type: 'announcement', title, body, audience, created_by: me.id, created_by_name: me.name });
    const res = await pushNotification(n);
    setNotifCache(loadNotifCache());
    log('announcement_sent', { type: 'announcement', id: n.id, name: title });
    showToast(res.ok ? 'تم إرسال الإعلان' : `حُفظ الإعلان على جهازك وسيُرسل عند توفر الاتصال (${res.error})`, res.ok ? 'success' : 'info');
    return { ok: true };
  };

  const giveAward: AppContextType['giveAward'] = async ({ student, title, note, points }) => {
    const me = currentUserRef.current;
    if (!me || !hasPerm(me, 'can_award_badges')) {
      showToast('لا تملك صلاحية منح الجوائز', 'error');
      return { ok: false, error: 'no-permission' };
    }
    const clsName = StorageService.getClassById(student.class_id || student.assigned_class_ids?.[0] || '')?.name;
    const a = makeAward({
      student_id: student.id, student_name: student.name, class_name: clsName || null, title, note: note || null,
      points, awarded_by: me.id, awarded_by_name: me.name,
    });
    const res = await pushAward(a);
    setAwards(loadAwardsCache());
    void notify({ type: 'award', title: `🏆 حصلت على جائزة: ${title}`, body: note || (points ? `+${points} نقطة` : ''), audience: { user_ids: [student.id] }, ref_type: 'award', ref_id: a.id });
    log('award_given', { type: 'user', id: student.id, name: student.name }, `${title} (+${points})`);
    showToast(res.ok ? `تم منح الجائزة للطالب ${student.name}` : `حُفظت الجائزة على جهازك وسترفع عند توفر الاتصال (${res.error})`, res.ok ? 'success' : 'info');
    return { ok: true };
  };

  const updateSettings = async (patch: Partial<AppSettings>) => {
    if (currentUserRef.current?.role !== 'admin') return void showToast('الإعدادات لمدير النظام فقط', 'error');
    const res = await saveSettings(patch);
    setSettings(loadSettings());
    log('settings_changed', { type: 'settings', name: 'إعدادات النظام' }, Object.keys(patch).join('، '));
    showToast(res.ok ? 'تم حفظ الإعدادات' : `حُفظت الإعدادات على هذا الجهاز فقط (${res.error})`, res.ok ? 'success' : 'info');
  };

  const changeMyPassword: AppContextType['changeMyPassword'] = async (current, next) => {
    const me = currentUserRef.current;
    if (!me) return { ok: false, error: 'لا يوجد مستخدم مسجل' };
    if (next.length < 6) return { ok: false, error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' };
    if (next === current) return { ok: false, error: 'كلمة المرور الجديدة مطابقة للحالية' };

    if (getSessionToken()) {
      // الوضع الآمن: الخادم يتحقق من الكلمة الحالية ويشفّر الجديدة
      try {
        const { data, error } = await supabase.rpc('itqan_change_password', { p_current: current, p_new: next });
        if (error) return { ok: false, error: `تعذر الاتصال بالخادم (${error.message})` };
        if (!data?.ok) {
          const msg: Record<string, string> = {
            wrong_password: 'كلمة المرور الحالية غير صحيحة',
            too_short: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف',
            no_session: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد',
          };
          return { ok: false, error: msg[data?.error] || 'تعذر تغيير كلمة المرور' };
        }
        updateSessionInfo({ password_is_default: false });
        setPasswordIsDefault(false);
        log('password_changed', { type: 'user', id: me.id, name: me.name });
        return { ok: true };
      } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم، حاول لاحقاً' };
      }
    }

    const localOk = (StorageService.getUserById(me.id)?.password || '') === current;
    let valid = localOk;
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('users').select('id').eq('id', me.id).eq('password', current).maybeSingle();
        if (!error) valid = !!data; // الخادم هو المرجع
      } catch {
        valid = localOk;
      }
    }
    if (!valid) return { ok: false, error: 'كلمة المرور الحالية غير صحيحة' };
    const ok = await resetUserPassword(me.id, next);
    if (!ok) return { ok: false, error: 'تعذر حفظ كلمة المرور الجديدة على الخادم، حاول لاحقاً' };
    log('password_changed', { type: 'user', id: me.id, name: me.name });
    return { ok: true };
  };

  const setMyAvatar = async (data: string | null) => {
    const me = currentUserRef.current;
    if (!me) return { ok: false, error: 'لا يوجد مستخدم مسجل' };
    const res = await saveMyAvatar(me.id, data);
    setAvatars(avatarMapFromCache(loadAvatarCache()));
    return res;
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
        avatars,
        setMyAvatar,
        notifications,
        unreadCount,
        markNotificationsRead,
        sendAnnouncement,
        remindLateStudents,
        banners,
        saveBanner,
        deleteBanner,
        deleteMyNotifications,
        allNotifications: notifCache,
        deleteNotificationsForAll,
        clearUserNotifications,
        awards,
        giveAward,
        settings,
        updateSettings,
        changeMyPassword,
        passwordIsDefault,
        isPreview,
        exitPreview,
        approveQuiz,
        rejectQuiz,
        pendingApprovalsCount,
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
        gradeEssay,
        deleteSubmissions,
        addUser,
        updateUserData,
        resetUserPassword,
        deleteUserItem,
        bulkDeleteUsers,
        bulkMoveStudents,
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
