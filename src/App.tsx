import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { Toast } from './components/common/Toast';
import { AuthScreen } from './components/auth/AuthScreen';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { UsersManagement } from './components/admin/UsersManagement';
import { SubjectsClassesManagement } from './components/admin/SubjectsClassesManagement';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import { QuizEditor } from './components/teacher/QuizEditor';
import { StudentDashboard } from './components/student/StudentDashboard';
import { QuizTaker } from './components/student/QuizTaker';
import { QuizReview } from './components/student/QuizReview';
import { AnalyticsCharts } from './components/analytics/AnalyticsCharts';
import { SubmissionsTable } from './components/analytics/SubmissionsTable';
import { QuizResults } from './components/analytics/QuizResults';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { QuizPreview } from './components/common/QuizPreview';

const KNOWN_VIEWS = [
  'take_quiz', 'quiz_review', 'create_quiz', 'users', 'users_management',
  'students_management', 'subjects_classes', 'analytics', 'reports',
  'quiz_results', 'quiz_preview', 'quizzes', 'dashboard',
];

/** يُعيد المستخدم للوحة التحكم إذا وصل لصفحة غير موجودة بدلاً من إظهار شاشة فارغة */
const UnknownViewRedirect: React.FC = () => {
  const { setCurrentView } = useApp();
  React.useEffect(() => {
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
  } = useApp();

  // If user is not logged in or in login view
  if (!currentUser || currentView === 'login') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-white font-cairo transition-colors duration-200" dir="rtl">
        <div className="flex-1">
          <AuthScreen />
        </div>
        <Footer />
        <Toast />
      </div>
    );
  }

  // Handle student starting a quiz
  const handleStartQuiz = (quizId: string) => {
    setActiveQuizId(quizId);
    setCurrentView('take_quiz');
  };

  // Handle student completing a quiz
  const handleFinishQuiz = (submissionId: string) => {
    setActiveSubmissionId(submissionId);
    setCurrentView('quiz_review');
  };

  // Handle student viewing review of an old submission
  const handleViewReview = (submissionId: string) => {
    setActiveSubmissionId(submissionId);
    setCurrentView('quiz_review');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-white font-cairo transition-colors duration-200" dir="rtl">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Body Content */}
      <main className="flex-1 pb-16">
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
        {currentView === 'create_quiz' && <QuizEditor />}

        {/* View 4: Admin / Teacher Users Management */}
        {(currentView === 'users' || currentView === 'users_management' || currentView === 'students_management') && (
          <UsersManagement />
        )}

        {/* View 5: Custom Subjects & Classes Management */}
        {currentView === 'subjects_classes' && <SubjectsClassesManagement />}

        {/* View 6: General Analytics / School-Wide Reports View */}
        {(currentView === 'analytics' || currentView === 'reports') && (
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
                التحليلات والمؤشرات البيانية المتقدمة
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تقارير إحصائية دقيقة لمستويات النجاح وتوزيع الدرجات ومعدلات التسليم
              </p>
            </div>

            <AnalyticsView />
          </div>
        )}

        {/* View 6b: نتائج وتحليلات اختبار واحد (زر التحليلات عند الآدمن/المعلم) */}
        {currentView === 'quiz_results' && currentUser.role !== 'student' && <QuizResults />}

        {/* View 6c: معاينة اختبار للقراءة فقط (زر العرض) */}
        {currentView === 'quiz_preview' && currentUser.role !== 'student' && <QuizPreview />}

        {/* حماية من الشاشة البيضاء: أي صفحة غير معروفة تعيد المستخدم للوحة التحكم */}
        {!KNOWN_VIEWS.includes(currentView) && <UnknownViewRedirect />}

        {/* View 7: Quizzes Bank View */}
        {currentView === 'quizzes' && (
          <>
            {currentUser.role === 'student' ? (
              <StudentDashboard
                onStartQuiz={handleStartQuiz}
                onViewReview={handleViewReview}
              />
            ) : currentUser.role === 'teacher' ? (
              <TeacherDashboard />
            ) : (
              <AdminDashboard />
            )}
          </>
        )}

        {/* View 8: Default Dashboard based on RBAC */}
        {currentView === 'dashboard' && (
          <>
            {currentUser.role === 'admin' && <AdminDashboard />}
            {currentUser.role === 'teacher' && <TeacherDashboard />}
            {currentUser.role === 'student' && (
              <StudentDashboard
                onStartQuiz={handleStartQuiz}
                onViewReview={handleViewReview}
              />
            )}
          </>
        )}
      </main>

      {/* Uniform Clean Footer on ALL layouts */}
      <Footer />

      {/* Notification Toast */}
      <Toast />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
