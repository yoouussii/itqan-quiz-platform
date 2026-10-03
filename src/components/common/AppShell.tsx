import React, { useEffect, useRef, useState } from 'react';
import {
  FileQuestion, BarChart2, Users, PlusCircle, Menu, X, LogOut, Moon, Sun,
  Layers, ChevronDown, UserCheck, ClipboardCheck, Trophy, ScrollText, Settings as SettingsIcon,
  ExternalLink, Sparkles, Images, Bell, Home, LucideIcon,
  Library,
  Target,
  Award,
  PenLine,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { ProfileModal } from './ProfileModal';
import { NotificationBell } from './NotificationBell';
import { Footer } from './Footer';
import { pathFor } from '../../utils/router';
import { ungradedSummary } from '../../utils/grading';
import { LangToggle } from '../../i18n/LangContext';

/** رابط حقيقي للصفحة: الضغط العادي يتنقل داخل الموقع، وCtrl/الزر الأوسط يفتحها في تبويب جديد */
const linkClick = (go: () => void) => (e: React.MouseEvent) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go();
};
import { hasPerm } from '../../utils/permissions';
import { User } from '../../types';
import { t } from '../../i18n';

type NavItem = { id: string; label: string; icon: LucideIcon; href?: string; badge?: number };
type NavGroup = { title?: string; items: NavItem[] };

const roleText = (u: User) =>
  u.job_title?.trim() ||
  ({ admin: t('مدير النظام'), teacher: t('معلم'), supervisor: t('مشرف'), student: u.gender === 'female' ? t('طالبة') : t('طالب'), parent: t('ولي أمر') } as Record<string, string>)[u.role] ||
  '';

const perms = (u: User): Record<string, boolean | undefined> =>
  (u.teacher_permissions || (u as any).permissions || {}) as Record<string, boolean | undefined>;

/** أقسام القائمة الجانبية للطاقم حسب الدور والصلاحيات (كل الأقسام ظاهرة، بلا «المزيد») */
const staffGroups = (u: User, pendingApprovals: number, preparationsUrl: string, pendingGrading = 0): NavGroup[] => {
  const p = perms(u);
  const isAdmin = u.role === 'admin';
  const quizzes: NavItem[] = [];
  const school: NavItem[] = [];
  const system: NavItem[] = [];

  if (isAdmin) quizzes.push({ id: 'quizzes', label: t('بنك الاختبارات'), icon: FileQuestion });
  if (u.role === 'teacher') quizzes.push({ id: 'create_quiz', label: t('اختبار جديد'), icon: PlusCircle });
  if (hasPerm(u, 'can_approve_quizzes')) quizzes.push({ id: 'approvals', label: t('بانتظار الاعتماد'), icon: ClipboardCheck, badge: pendingApprovals });
  if (isAdmin || u.role === 'teacher' || hasPerm(u, 'can_grade_essays')) quizzes.push({ id: 'grading', label: t('التصحيح'), icon: PenLine, badge: pendingGrading });
  quizzes.push({ id: 'question_bank', label: t('بنك الأسئلة'), icon: Library });
  quizzes.push({ id: 'outcomes', label: t('نواتج التعلم'), icon: Target });
  quizzes.push({ id: 'analytics', label: u.role === 'teacher' ? t('نتائج طلابي') : t('النتائج والتحليلات'), icon: BarChart2 });
  if (u.role === 'teacher' && p.can_view_all_reports) quizzes.push({ id: 'reports', label: t('التقارير الشاملة'), icon: BarChart2 });

  if (isAdmin) school.push({ id: 'users', label: t('المستخدمون'), icon: Users });
  else if (p.can_add_students || p.can_add_teachers) school.push({ id: 'users_management', label: t('المستخدمون'), icon: Users });
  if (isAdmin || p.can_add_custom_subjects || p.can_manage_classes) school.push({ id: 'subjects_classes', label: t('المواد والشعب'), icon: Layers });
  if (isAdmin) school.push({ id: 'banners', label: t('الإعلانات والبانرات'), icon: Images });
  if (hasPerm(u, 'can_view_leaderboard')) school.push({ id: 'leaderboard', label: t('لوحة الشرف'), icon: Trophy });
  if (hasPerm(u, 'can_award_badges')) school.push({ id: 'certificates', label: t('الشهادات'), icon: Award });

  system.push({ id: 'notifications', label: t('الإشعارات'), icon: Bell });
  if (hasPerm(u, 'can_view_activity_log')) system.push({ id: 'activity_log', label: t('سجل النشاط'), icon: ScrollText });
  if (isAdmin) system.push({ id: 'settings', label: t('الإعدادات'), icon: SettingsIcon });
  if (hasPerm(u, 'can_access_preparations') && preparationsUrl) system.push({ id: 'preparations', label: t('متابعة تحضير مزن'), icon: ExternalLink, href: preparationsUrl });

  const home: NavItem = { id: 'dashboard', label: u.role === 'teacher' ? t('اختباراتي') : t('الرئيسية'), icon: u.role === 'teacher' ? FileQuestion : Home };
  return [
    { items: [home] },
    { title: t('الاختبارات'), items: quizzes },
    ...(school.length ? [{ title: t('المدرسة'), items: school }] : []),
    { title: t('النظام'), items: system },
  ];
};

// دوال (لا ثوابت) حتى تُترجم عند كل رسم بعد تغيير اللغة
const PARENT_TABS = (): NavItem[] => [
  { id: 'dashboard', label: t('أبنائي'), icon: Users },
  { id: 'notifications', label: t('الإشعارات'), icon: Bell },
];

const STUDENT_TABS = (): NavItem[] => [
  { id: 'dashboard', label: t('الرئيسية'), icon: Home },
  { id: 'analytics', label: t('نتائجي'), icon: BarChart2 },
  { id: 'my_points', label: t('نقاطي'), icon: Sparkles },
  { id: 'notifications', label: t('الإشعارات'), icon: Bell },
];

const ThemeButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme } = useApp();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? t('الوضع النهاري') : t('الوضع الليلي')}
      aria-label={t('تبديل مظهر العرض')}
      className={`w-11 h-11 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${className}`}
    >
      {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

/** معاينة الموقع بحساب مستخدم آخر (للمدير فقط) */
const PreviewSwitcher: React.FC = () => {
  const { currentUser, users, switchUser } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  if (currentUser?.role !== 'admin') return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={t('معاينة الموقع بحساب مستخدم آخر')}
        className="h-11 flex items-center gap-1.5 px-3 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <UserCheck className="w-4 h-4" />
        <span className="hidden xl:inline">{t('معاينة كمستخدم')}</span>
        <ChevronDown className="w-4 h-4 opacity-70" />
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 text-start">
          <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
            {t('شاهد الموقع كما يراه المستخدم (للعرض فقط)')}
          </p>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { setOpen(false); switchUser(u.id); }}
                className={`w-full flex items-center gap-2 p-2 rounded-xl text-sm text-start ${u.id === currentUser.id ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <Avatar name={u.name} role={u.role} userId={u.id} size="xs" />
                <span className="flex-1 font-semibold truncate">{u.name}</span>
                <span className="text-xs text-slate-500">{roleText(u)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const NavLink: React.FC<{ item: NavItem; active: boolean; onGo: (id: string) => void }> = ({ item, active, onGo }) => {
  const Icon = item.icon;
  const cls = `w-full h-11 flex items-center gap-3 px-3.5 rounded-xl text-[15px] transition-colors ${
    active
      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
      : 'text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
  }`;
  const inner = (
    <>
      <Icon className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-start truncate">{item.label}</span>
      {!!item.badge && (
        <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center">
          {item.badge}
        </span>
      )}
    </>
  );
  return item.href ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  ) : (
    <a href={pathFor({ view: item.id })} onClick={linkClick(() => onGo(item.id))} aria-current={active ? 'page' : undefined} className={cls}>{inner}</a>
  );
};

const SidebarBody: React.FC<{ onNavigate?: () => void; onProfile: () => void }> = ({ onNavigate, onProfile }) => {
  const { currentUser, currentView, setCurrentView, logout, pendingApprovalsCount, settings, submissions, quizzes } = useApp();
  // عدد الإجابات المقالية بانتظار التصحيح (المعلم: اختباراته فقط)
  const pendingGrading = React.useMemo(() => {
    if (!currentUser || !(currentUser.role === 'teacher' || hasPerm(currentUser, 'can_grade_essays'))) return 0;
    const all = hasPerm(currentUser, 'can_grade_essays');
    const mine = new Set(quizzes.filter((q) => !q.is_deleted && (all || q.teacher_id === currentUser.id || q.created_by === currentUser.id)).map((q) => q.id));
    return ungradedSummary((submissions || []).filter((x) => mine.has(x.quiz_id))).essays;
  }, [currentUser, quizzes, submissions]);
  if (!currentUser) return null;
  const groups = staffGroups(currentUser, pendingApprovalsCount, settings.preparations_url, pendingGrading);
  const go = (id: string) => { setCurrentView(id); onNavigate?.(); };
  const activeId = currentView === 'students_management' ? 'users_management' : currentView;
  return (
    <div className="h-full flex flex-col">
      <button type="button" onClick={() => go('dashboard')} className="px-3 pt-1 pb-4 text-start" aria-label={t('الرئيسية')}>
        <Logo size="sm" />
      </button>
      <nav className="flex-1 overflow-y-auto space-y-0.5" aria-label={t('القائمة الرئيسية')}>
        {groups.map((g, i) => (
          <div key={i}>
            {g.title && <div className="px-3.5 pt-4 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{g.title}</div>}
            {g.items.map((it) => <NavLink key={it.id} item={it} active={activeId === it.id} onGo={go} />)}
          </div>
        ))}
      </nav>
      <div className="mt-3 flex items-center gap-2 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
        <button type="button" onClick={onProfile} aria-label={t('الملف الشخصي')} className="flex-1 min-w-0 flex items-center gap-2.5 text-start rounded-xl p-1 hover:bg-white dark:hover:bg-slate-800">
          <Avatar name={currentUser.name} role={currentUser.role} userId={currentUser.id} size="sm" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{roleText(currentUser)}</span>
          </span>
        </button>
        <button type="button" onClick={logout} title={t('تسجيل الخروج')} aria-label={t('تسجيل الخروج')} className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

/** هيكل الطاقم: قائمة جانبية ثابتة على الكمبيوتر، وقائمة منزلقة في الجوال */
const StaffShell: React.FC<{ children: React.ReactNode; banner?: React.ReactNode }> = ({ children, banner }) => {
  const [drawer, setDrawer] = useState(false);
  const [profile, setProfile] = useState(false);
  const { currentView } = useApp();
  useEffect(() => setDrawer(false), [currentView]);
  return (
    <div className="min-h-screen lg:ps-64">
      <aside className="hidden lg:block fixed inset-y-0 start-0 w-64 bg-white dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800 px-3 py-5 z-30">
        <SidebarBody onProfile={() => setProfile(true)} />
      </aside>

      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('القائمة')}>
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 px-3 py-5 shadow-xl">
            <button type="button" onClick={() => setDrawer(false)} aria-label={t('إغلاق القائمة')} className="absolute top-4 end-3 w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
            <SidebarBody onNavigate={() => setDrawer(false)} onProfile={() => { setDrawer(false); setProfile(true); }} />
          </aside>
        </div>
      )}

      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDrawer(true)} aria-label={t('فتح القائمة')} className="lg:hidden w-11 h-11 flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Menu className="w-6 h-6" />
            </button>
            <div className="lg:hidden"><Logo size="sm" showText={false} /></div>
          </div>
          <div className="flex items-center gap-1.5">
            <PreviewSwitcher />
            <LangToggle />
            <ThemeButton />
            <NotificationBell />
          </div>
        </header>
        {banner}
        <main className="flex-1 pb-12 overflow-x-clip">{children}</main>
        <Footer />
      </div>
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </div>
  );
};

/** هيكل الطالب: شريط علوي على الكمبيوتر، وشريط تنقل سفلي في الجوال */
const StudentShell: React.FC<{ children: React.ReactNode; banner?: React.ReactNode }> = ({ children, banner }) => {
  const { currentUser, currentView, setCurrentView, logout } = useApp();
  const [profile, setProfile] = useState(false);
  if (!currentUser) return null;
  const tabs = currentUser.role === 'parent' ? PARENT_TABS() : STUDENT_TABS();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <button type="button" onClick={() => setCurrentView('dashboard')} aria-label={t('الرئيسية')}><Logo size="sm" /></button>
            <nav className="hidden md:flex items-center gap-1" aria-label={t('القائمة الرئيسية')}>
              {tabs.filter((tab) => tab.id !== 'notifications').map((tab) => (
                <a
                  key={tab.id}
                  href={pathFor({ view: tab.id })}
                  onClick={linkClick(() => setCurrentView(tab.id))}
                  aria-current={currentView === tab.id ? 'page' : undefined}
                  className={`h-10 px-4 inline-flex items-center rounded-xl text-[15px] font-semibold transition-colors ${currentView === tab.id ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {tab.id === 'my_points' ? t('نقاطي وأوسمتي') : tab.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <LangToggle />
            <ThemeButton />
            <NotificationBell />
            <button type="button" onClick={() => setProfile(true)} aria-label={t('الملف الشخصي')} className="flex items-center gap-2.5 rounded-xl p-1 md:ps-3 md:ms-1 md:border-s border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Avatar name={currentUser.name} role={currentUser.role} userId={currentUser.id} size="sm" showBadge />
              <span className="hidden lg:block text-start">
                <span className="block text-sm font-bold text-slate-900 dark:text-white">{currentUser.name}</span>
              </span>
            </button>
            <button type="button" onClick={logout} title={t('تسجيل الخروج')} aria-label={t('تسجيل الخروج')} className="hidden md:flex w-11 h-11 items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      {banner}
      <main className="flex-1 pb-24 md:pb-12 overflow-x-clip">{children}</main>
      <div className="hidden md:block"><Footer /></div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex pb-[env(safe-area-inset-bottom)]" aria-label={t('التنقل')}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const on = currentView === tab.id;
          return (
            <a key={tab.id} href={pathFor({ view: tab.id })} onClick={linkClick(() => setCurrentView(tab.id))} aria-current={on ? 'page' : undefined}
              className={`flex-1 h-16 flex flex-col items-center justify-center gap-1 text-xs font-semibold ${on ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>
              <Icon className="w-[22px] h-[22px]" strokeWidth={on ? 2.4 : 1.9} />
              {tab.label}
            </a>
          );
        })}
      </nav>
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </div>
  );
};

/** الهيكل العام للصفحات بعد تسجيل الدخول. أثناء حل الاختبار يُخفى التنقل (وضع التركيز) */
export const AppShell: React.FC<{ children: React.ReactNode; banner?: React.ReactNode }> = ({ children, banner }) => {
  const { currentUser, currentView } = useApp();
  if (!currentUser) return null;
  if (currentView === 'take_quiz') {
    return (
      <div className="min-h-screen flex flex-col">
        {banner}
        <main className="flex-1 overflow-x-clip">{children}</main>
      </div>
    );
  }
  return currentUser.role === 'student' || currentUser.role === 'parent'
    ? <StudentShell banner={banner}>{children}</StudentShell>
    : <StaffShell banner={banner}>{children}</StaffShell>;
};

