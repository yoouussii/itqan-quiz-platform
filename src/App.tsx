import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/common/AppShell';
import { Footer } from './components/common/Footer';
import { Toast } from './components/common/Toast';
import { AuthScreen } from './components/auth/AuthScreen';
import { MaintenanceScreen } from './components/auth/MaintenanceScreen';
import { LicenseBanner, LicenseBlocked, isBlocked, useLicense } from './components/common/LicenseGate';


import { hasPerm } from './utils/permissions';
import { ForcePasswordChange } from './components/common/ForcePasswordChange';
import { BannerStrip } from './components/common/BannerStrip';
import { PageHeader } from './components/common/ui';
import { replaceNextNavigation, PUBLIC_PATHS } from './utils/router';
import { Lang, applyLang, loadLangPref, saveLangPref, t, uiDir } from './i18n';
import { LangContext } from './i18n/LangContext';

// الصفحات تُحمَّل عند فتحها فقط: كل مستخدم ينزّل كود صفحاته (أسرع على الجوال)
const AdminDashboard = React.lazy(() => import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminQuizBank = React.lazy(() => import('./components/admin/AdminQuizBank').then((m) => ({ default: m.AdminQuizBank })));
const UsersManagement = React.lazy(() => import('./components/admin/UsersManagement').then((m) => ({ default: m.UsersManagement })));
const SubjectsClassesManagement = React.lazy(() => import('./components/admin/SubjectsClassesManagement').then((m) => ({ default: m.SubjectsClassesManagement })));
const TeacherDashboard = React.lazy(() => import('./components/teacher/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard })));
const QuizEditor = React.lazy(() => import('./components/teacher/QuizEditor').then((m) => ({ default: m.QuizEditor })));
const StudentDashboard = React.lazy(() => import('./components/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard })));
const QuizTaker = React.lazy(() => import('./components/student/QuizTaker').then((m) => ({ default: m.QuizTaker })));
const QuizReview = React.lazy(() => import('./components/student/QuizReview').then((m) => ({ default: m.QuizReview })));
const QuizResults = React.lazy(() => import('./components/analytics/QuizResults').then((m) => ({ default: m.QuizResults })));
const AnalyticsView = React.lazy(() => import('./components/analytics/AnalyticsView').then((m) => ({ default: m.AnalyticsView })));
const SupervisorDashboard = React.lazy(() => import('./components/supervisor/SupervisorDashboard').then((m) => ({ default: m.SupervisorDashboard })));
const ParentDashboard = React.lazy(() => import('./components/parent/ParentDashboard').then((m) => ({ default: m.ParentDashboard })));
const MyPoints = React.lazy(() => import('./components/student/MyPoints').then((m) => ({ default: m.MyPoints })));
const Leaderboard = React.lazy(() => import('./components/staff/Leaderboard').then((m) => ({ default: m.Leaderboard })));
const ApprovalsPage = React.lazy(() => import('./components/staff/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })));
const ActivityLogPage = React.lazy(() => import('./components/staff/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })));
const SettingsPage = React.lazy(() => import('./components/staff/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const QuizPreview = React.lazy(() => import('./components/common/QuizPreview').then((m) => ({ default: m.QuizPreview })));
const BannersPage = React.lazy(() => import('./components/staff/BannersPage').then((m) => ({ default: m.BannersPage })));
const LegalPage = React.lazy(() => import('./components/legal/LegalPage').then((m) => ({ default: m.LegalPage })));
const OutcomesPage = React.lazy(() => import('./components/analytics/OutcomesPage').then((m) => ({ default: m.OutcomesPage })));
const SkillsCard = React.lazy(() => import('./components/analytics/OutcomesPage').then((m) => ({ default: m.SkillsCard })));
const QuestionBankPage = React.lazy(() => import('./components/teacher/QuestionBank').then((m) => ({ default: m.QuestionBankPage })));
const GradingPage = React.lazy(() => import('./components/teacher/GradingPage').then((m) => ({ default: m.GradingPage })));
const RemedialPage = React.lazy(() => import('./components/staff/RemedialPage').then((m) => ({ default: m.RemedialPage })));
const PortfolioPage = React.lazy(() => import('./components/staff/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const VisitsPage = React.lazy(() => import('./components/staff/VisitsPage').then((m) => ({ default: m.VisitsPage })));
const SurveysPage = React.lazy(() => import('./components/staff/SurveysPage').then((m) => ({ default: m.SurveysPage })));
const GradebookPage = React.lazy(() => import('./components/staff/GradebookPage').then((m) => ({ default: m.GradebookPage })));
const SchoolYearPage = React.lazy(() => import('./components/admin/SchoolYearPage').then((m) => ({ default: m.SchoolYearPage })));
const BehaviorPage = React.lazy(() => import('./components/staff/BehaviorPage').then((m) => ({ default: m.BehaviorPage })));
const ExamCalendar = React.lazy(() => import('./components/common/ExamCalendar').then((m) => ({ default: m.ExamCalendar })));
const AttendancePage = React.lazy(() => import('./components/staff/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const CertificatesPage = React.lazy(() => import('./components/staff/CertificatesPage').then((m) => ({ default: m.CertificatesPage })));
const OwnerPage = React.lazy(() => import('./components/owner/OwnerPage').then((m) => ({ default: m.OwnerPage })));
const VerifyPage = React.lazy(() => import('./components/legal/VerifyPage').then((m) => ({ default: m.VerifyPage })));
const NotificationsPage = React.lazy(() => import('./components/common/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

const KNOWN_VIEWS = [
  'take_quiz', 'quiz_review', 'create_quiz', 'users', 'users_management',
  'students_management', 'subjects_classes', 'analytics', 'reports',
  'quiz_results', 'quiz_preview', 'quizzes', 'dashboard',
  'my_points', 'leaderboard', 'approvals', 'activity_log', 'settings', 'notifications', 'banners', 'question_bank', 'outcomes', 'certificates', 'grading',
  'privacy', 'terms', 'attendance', 'calendar', 'behavior', 'school_year', 'gradebook', 'visits', 'surveys', 'remedial', 'portfolio',
];

/** المسار الحالي، ويتحدّث مع زر الرجوع والروابط الداخلية (لصفحات ما قبل الدخول) */
const usePathname = () => {
  const [path, setPath] = React.useState(window.location.pathname);
  React.useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
};

const Spinner: React.FC = () => (
  <div className="flex items-center justify-center py-24" role="status" aria-label={t('جارٍ التحميل')}>
    <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
  </div>
);

/** يُعيد المستخدم للوحة التحكم إذا وصل لصفحة غير موجودة بدلاً من إظهار شاشة فارغة */
const UnknownViewRedirect: React.FC = () => {
  const { setCurrentView } = useApp();
  React.useEffect(() => {
    replaceNextNavigation();
    setCurrentView('dashboard');
  }, [setCurrentView]);
  return null;
};

const AppContent: React.FC = () => {
  const {
    currentUser,
    currentView,
    setCurrentView,
    activeQuizId,
    setActiveQuizId,
    activeSubmissionId,
    setActiveSubmissionId,
    kpis,
    submissions,
    switchUser,
    passwordIsDefault,
    logout,
    isPreview,
    exitPreview,
    dataReady,
    quizzes,
    editingQuizId,
  } = useApp();
  const pathname = usePathname();
  const { settings } = useApp();
  const [adminLogin, setAdminLogin] = React.useState(false);
  const license = useLicense(!!currentUser);

  // If user is not logged in or in login view
  if (!currentUser || currentView === 'login') {
    const legal = PUBLIC_PATHS[pathname];
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-white transition-colors duration-200" dir={uiDir()}>
        <div className="flex-1">
          {legal ? <React.Suspense fallback={<Spinner />}><LegalPage doc={legal} /></React.Suspense>
            : settings.maintenance?.on && !adminLogin ? <MaintenanceScreen onAdminLogin={() => setAdminLogin(true)} />
            : <AuthScreen />}
        </div>
        <Footer />
        <Toast />
      </div>
    );
  }

  // انتهاء اشتراك المدرسة مع خيار الإيقاف (038): غير المدير يرى شاشة الإيقاف
  if (isBlocked(license, currentUser.role)) return <LicenseBlocked onLogout={logout} />;

  // صفحات تتطلب صلاحية أو بيانات مسبقة: إن لم تتوفر نعيد المستخدم للوحة التحكم بدل شاشة فارغة
  const isStaff = currentUser.role === 'admin' || currentUser.role === 'teacher' || currentUser.role === 'supervisor';
  const viewGuards: Record<string, boolean> = {
    take_quiz: !!activeQuizId,
    quiz_review: !!activeSubmissionId,
    my_points: currentUser.role === 'student',
    leaderboard: hasPerm(currentUser, 'can_view_leaderboard'),
    approvals: hasPerm(currentUser, 'can_approve_quizzes'),
    activity_log: hasPerm(currentUser, 'can_view_activity_log'),
    settings: currentUser.role === 'admin',
    banners: currentUser.role === 'admin',
    certificates: hasPerm(currentUser, 'can_award_badges'),
    attendance: hasPerm(currentUser, 'can_view_attendance') || hasPerm(currentUser, 'can_manage_attendance'),
    behavior: hasPerm(currentUser, 'can_view_behavior') || hasPerm(currentUser, 'can_record_behavior'),
    school_year: currentUser.role === 'admin',
    gradebook: isStaff,
    visits: isStaff,
    surveys: true,
    remedial: isStaff,
    portfolio: isStaff,
    grading: currentUser.role === 'admin' || currentUser.role === 'teacher' || hasPerm(currentUser, 'can_grade_essays'),
    quiz_results: isStaff,
    quiz_preview: isStaff,
  };
  // ولي الأمر: الرئيسية (متابعة الأبناء) وأوراق إجاباتهم والإشعارات فقط
  const parentOk = currentUser.role !== 'parent' || ['dashboard', 'quiz_review', 'notifications', 'privacy', 'terms', 'calendar'].includes(currentView);
  const viewAvailable = KNOWN_VIEWS.includes(currentView) && viewGuards[currentView] !== false && parentOk;

  // رابط مباشر لاختبار أو ورقة إجابة: ننتظر أول تحميل للبيانات بدل إظهار «غير موجود»
  const quizInView = ['take_quiz', 'quiz_preview', 'quiz_results'].includes(currentView) ? activeQuizId
    : currentView === 'create_quiz' ? editingQuizId : null;
  const waitingForData = !dataReady && (
    (!!quizInView && !(quizzes || []).some((q) => q.id === quizInView)) ||
    (currentView === 'quiz_review' && !!activeSubmissionId && !(submissions || []).some((s) => s.id === activeSubmissionId))
  );

  // Handle student starting a quiz
  const handleStartQuiz = (quizId: string) => {
    setActiveQuizId(quizId);
    setCurrentView('take_quiz');
  };

  // Handle student completing a quiz
  const handleFinishQuiz = (submissionId: string) => {
    // زر الرجوع بعد التسليم لا يعيد لصفحة الاختبار
    replaceNextNavigation();
    setActiveSubmissionId(submissionId);
    setCurrentView('quiz_review');
  };

  // Handle student viewing review of an old submission
  const handleViewReview = (submissionId: string) => {
    setActiveSubmissionId(submissionId);
    setCurrentView('quiz_review');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-white transition-colors duration-200" dir={uiDir()}>
      <AppShell
        banner={isPreview ? (
          <div className="bg-amber-100 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm font-semibold px-4 py-2 flex flex-wrap items-center justify-center gap-3" role="status">
            <span>{t('وضع المعاينة: تشاهد الموقع كما يراه «{name}». للعرض فقط، ولا يُسجَّل أي تسليم باسمه.', { name: currentUser.name })}</span>
            <button type="button" onClick={exitPreview} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white">{t('العودة لحسابي')}</button>
          </div>
        ) : settings.maintenance?.on && currentUser.role === 'admin' ? (
          <div className="bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-sm font-semibold px-4 py-2 flex flex-wrap items-center justify-center gap-3" role="status" data-testid="maintenance-banner">
            <span>{t('وضع الصيانة مفعّل: لا يستطيع أحد غيرك الدخول للمنصة الآن.')}</span>
            <button type="button" onClick={() => setCurrentView('settings')} className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white">{t('إيقاف الصيانة')}</button>
          </div>
        ) : currentUser.role === 'admin' ? <LicenseBanner lic={license} /> : null}
      >

        <React.Suspense
          fallback={
            <div className="flex items-center justify-center py-24" role="status" aria-label={t('جارٍ التحميل')}>
              <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
            </div>
          }
        >
        {waitingForData ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label={t('جارٍ التحميل')}>
            <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
          </div>
        ) : (<>
        {/* View 1: Quiz Taker Engine (Interactive testing) */}
        {currentView === 'take_quiz' && activeQuizId && (
          <QuizTaker
            quizId={activeQuizId}
            onFinish={handleFinishQuiz}
            onCancel={() => {
              setActiveQuizId(null);
              setCurrentView('dashboard');
            }}
          />
        )}

        {/* View 2: Quiz Review & Instant Score Explanations */}
        {currentView === 'quiz_review' && activeSubmissionId && (
          <QuizReview
            submissionId={activeSubmissionId}
            onBack={() => {
              setActiveSubmissionId(null);
              setCurrentView('dashboard');
            }}
          />
        )}

        {/* View 3: Create / Edit Quiz */}
        {currentView === 'create_quiz' && isStaff && <QuizEditor />}

        {/* View 4: Admin / Teacher Users Management */}
        {isStaff && (currentView === 'users' || currentView === 'users_management' || currentView === 'students_management') && (
          <UsersManagement />
        )}

        {/* View 5: Custom Subjects & Classes Management */}
        {currentView === 'subjects_classes' && isStaff && <SubjectsClassesManagement />}

        {/* View 6: General Analytics / School-Wide Reports View */}
        {(currentView === 'analytics' || currentView === 'reports') && currentUser.role !== 'parent' && (
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
            <PageHeader
              title={currentUser.role === 'student' ? t('نتائجي') : t('النتائج والتحليلات')}
              subtitle={currentUser.role === 'student' ? t('كل اختباراتك السابقة ودرجاتك') : t('توزيع الدرجات ومعدلات التسليم ونتائج كل طالب')}
            />

            {currentUser.role === 'student' && <SkillsCard studentId={currentUser.id} quizzes={quizzes} submissions={submissions} />}
            <AnalyticsView />
          </div>
        )}

        {/* الصفحات الجديدة: كل صفحة محمية بالصلاحية المناسبة */}
        {currentView === 'notifications' && <NotificationsPage />}
        {(currentView === 'privacy' || currentView === 'terms') && <LegalPage doc={currentView} />}
        {currentView === 'certificates' && <CertificatesPage />}
        {currentView === 'attendance' && <AttendancePage />}
        {currentView === 'calendar' && <ExamCalendar />}
        {currentView === 'behavior' && <BehaviorPage />}
        {currentView === 'gradebook' && <GradebookPage />}
        {currentView === 'visits' && isStaff && <VisitsPage />}
        {currentView === 'surveys' && <SurveysPage />}
        {currentView === 'remedial' && isStaff && <RemedialPage />}
        {currentView === 'portfolio' && isStaff && <PortfolioPage />}
        {currentView === 'school_year' && currentUser.role === 'admin' && <SchoolYearPage />}
        {currentView === 'grading' && <GradingPage />}
        {currentView === 'my_points' && currentUser.role === 'student' && <MyPoints />}
        {currentView === 'leaderboard' && hasPerm(currentUser, 'can_view_leaderboard') && <Leaderboard />}
        {currentView === 'approvals' && hasPerm(currentUser, 'can_approve_quizzes') && <ApprovalsPage />}
        {currentView === 'activity_log' && hasPerm(currentUser, 'can_view_activity_log') && <ActivityLogPage />}
        {currentView === 'settings' && currentUser.role === 'admin' && <SettingsPage />}
        {currentView === 'banners' && currentUser.role === 'admin' && <BannersPage />}
        {currentView === 'question_bank' && isStaff && <QuestionBankPage />}
        {currentView === 'outcomes' && isStaff && <OutcomesPage />}

        {/* View 6b: نتائج وتحليلات اختبار واحد (زر التحليلات عند الآدمن/المعلم) */}
        {currentView === 'quiz_results' && isStaff && <QuizResults />}

        {/* View 6c: معاينة اختبار للقراءة فقط (زر العرض) */}
        {currentView === 'quiz_preview' && isStaff && <QuizPreview />}

        {/* حماية من الشاشة البيضاء: أي صفحة غير معروفة تعيد المستخدم للوحة التحكم */}
        {!viewAvailable && <UnknownViewRedirect />}

        {/* View 7: Quizzes Bank View */}
        {currentView === 'quizzes' && currentUser.role !== 'parent' && (
          <>
            {currentUser.role === 'student' ? (
              <StudentDashboard
                onStartQuiz={handleStartQuiz}
                onViewReview={handleViewReview}
              />
            ) : currentUser.role === 'teacher' ? (
              <TeacherDashboard />
            ) : currentUser.role === 'supervisor' ? (
              <SupervisorDashboard />
            ) : (
              <AdminQuizBank />
            )}
          </>
        )}

        {/* View 8: Default Dashboard based on RBAC */}
        {currentView === 'dashboard' && (
          <>
            {/* بانرات المدرسة (صور وتهاني) أعلى الصفحة الرئيسية للجميع */}
            {isStaff && <BannerStrip />}
            {currentUser.role === 'admin' && <AdminDashboard />}
            {currentUser.role === 'teacher' && <TeacherDashboard />}
            {currentUser.role === 'supervisor' && <SupervisorDashboard />}
            {currentUser.role === 'parent' && <ParentDashboard onViewReview={handleViewReview} />}
            {currentUser.role === 'student' && (
              <StudentDashboard
                onStartQuiz={handleStartQuiz}
                onViewReview={handleViewReview}
              />
            )}
          </>
        )}
        </>)}
        </React.Suspense>
      </AppShell>

      {/* كلمة المرور الافتراضية: تغيير إلزامي (لا يقاطع الطالب أثناء الاختبار) */}
      {passwordIsDefault && currentView !== 'take_quiz' && <ForcePasswordChange />}

      {/* Notification Toast */}
      <Toast />
    </div>
  );
};

/** لغة الواجهة: اختيار المستخدم على جهازه، متاح لكل الأدوار */
const LangRoot: React.FC = () => {
  const [lang, setPref] = React.useState<Lang>(loadLangPref);
  // قبل رسم الأبناء حتى تُترجَم النصوص في نفس الرسم
  applyLang(lang);
  const setLang = React.useCallback((l: Lang) => { saveLangPref(l); setPref(l); }, []);
  const value = React.useMemo(() => ({ lang, setLang, canSwitch: true }), [lang, setLang]);
  return (
    <LangContext.Provider value={value}>
      {/* تغيير اللغة يعيد رسم الواجهة كاملة بالنصوص الجديدة */}
      <AppContent key={lang} />
    </LangContext.Provider>
  );
};

/** صفحة التحقق من الشهادات: عامة ومستقلة عن جلسة الدخول وتوجيه الصفحات */
const OwnerRoot: React.FC = () => {
  applyLang(loadLangPref());
  return <React.Suspense fallback={<Spinner />}><OwnerPage /></React.Suspense>;
};

const VerifyRoot: React.FC = () => {
  applyLang(loadLangPref());
  return <React.Suspense fallback={<Spinner />}><VerifyPage /></React.Suspense>;
};

export default function App() {
  if (/^\/verify(\/|$)/.test(window.location.pathname)) return <VerifyRoot />;
  if (/^\/owner\/?$/.test(window.location.pathname)) return <OwnerRoot />;
  return (
    <AppProvider>
      <LangRoot />
    </AppProvider>
  );
}
