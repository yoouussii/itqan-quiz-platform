import React, { useEffect, useRef, useState } from 'react';
import {
  FileQuestion, BarChart2, Users, PlusCircle, Menu, X, LogOut, Moon, Sun,
  Layers, ChevronDown, UserCheck, ClipboardCheck, Trophy, ScrollText, Settings as SettingsIcon,
  ExternalLink, Sparkles, Images, Bell, Home, LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { ProfileModal } from './ProfileModal';
import { NotificationBell } from './NotificationBell';
import { Footer } from './Footer';
import { hasPerm } from '../../utils/permissions';
import { User } from '../../types';

type NavItem = { id: string; label: string; icon: LucideIcon; href?: string; badge?: number };
type NavGroup = { title?: string; items: NavItem[] };

const roleText = (u: User) =>
  u.job_title?.trim() ||
  ({ admin: 'مدير النظام', teacher: 'معلم', supervisor: 'مشرف', student: u.gender === 'female' ? 'طالبة' : 'طالب', parent: 'ولي أمر' } as Record<string, string>)[u.role] ||
  '';

const perms = (u: User): Record<string, boolean | undefined> =>
  (u.teacher_permissions || (u as any).permissions || {}) as Record<string, boolean | undefined>;

/** أقسام القائمة الجانبية للطاقم حسب الدور والصلاحيات (كل الأقسام ظاهرة، بلا «المزيد») */
const staffGroups = (u: User, pendingApprovals: number, preparationsUrl: string): NavGroup[] => {
  const p = perms(u);
  const isAdmin = u.role === 'admin';
  const quizzes: NavItem[] = [];
  const school: NavItem[] = [];
  const system: NavItem[] = [];

  if (isAdmin) quizzes.push({ id: 'quizzes', label: 'بنك الاختبارات', icon: FileQuestion });
  if (u.role === 'teacher') quizzes.push({ id: 'create_quiz', label: 'اختبار جديد', icon: PlusCircle });
  if (hasPerm(u, 'can_approve_quizzes')) quizzes.push({ id: 'approvals', label: 'بانتظار الاعتماد', icon: ClipboardCheck, badge: pendingApprovals });
  quizzes.push({ id: 'analytics', label: u.role === 'teacher' ? 'نتائج طلابي' : 'النتائج والتحليلات', icon: BarChart2 });
  if (u.role === 'teacher' && p.can_view_all_reports) quizzes.push({ id: 'reports', label: 'التقارير الشاملة', icon: BarChart2 });

  if (isAdmin) school.push({ id: 'users', label: 'المستخدمون', icon: Users });
  else if (p.can_add_students || p.can_add_teachers) school.push({ id: 'users_management', label: 'المستخدمون', icon: Users });
  if (isAdmin || p.can_add_custom_subjects || p.can_manage_classes) school.push({ id: 'subjects_classes', label: 'المواد والشعب', icon: Layers });
  if (isAdmin) school.push({ id: 'banners', label: 'الإعلانات والبانرات', icon: Images });
  if (hasPerm(u, 'can_view_leaderboard')) school.push({ id: 'leaderboard', label: 'لوحة الشرف', icon: Trophy });

  system.push({ id: 'notifications', label: 'الإشعارات', icon: Bell });
  if (hasPerm(u, 'can_view_activity_log')) system.push({ id: 'activity_log', label: 'سجل النشاط', icon: ScrollText });
  if (isAdmin) system.push({ id: 'settings', label: 'الإعدادات', icon: SettingsIcon });
  if (hasPerm(u, 'can_access_preparations') && preparationsUrl) system.push({ id: 'preparations', label: 'متابعة التحضيرات', icon: ExternalLink, href: preparationsUrl });

  const home: NavItem = { id: 'dashboard', label: u.role === 'teacher' ? 'اختباراتي' : 'الرئيسية', icon: u.role === 'teacher' ? FileQuestion : Home };
  return [
    { items: [home] },
    { title: 'الاختبارات', items: quizzes },
    ...(school.length ? [{ title: 'المدرسة', items: school }] : []),
    { title: 'النظام', items: system },
  ];
};

const PARENT_TABS: NavItem[] = [
  { id: 'dashboard', label: 'أبنائي', icon: Users },
  { id: 'notifications', label: 'الإشعارات', icon: Bell },
];

const STUDENT_TABS: NavItem[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: Home },
  { id: 'analytics', label: 'نتائجي', icon: BarChart2 },
  { id: 'my_points', label: 'نقاطي', icon: Sparkles },
  { id: 'notifications', label: 'الإشعارات', icon: Bell },
];

const ThemeButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme } = useApp();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
      aria-label="تبديل مظهر العرض"
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
        title="معاينة الموقع بحساب مستخدم آخر"
        className="h-11 flex items-center gap-1.5 px-3 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <UserCheck className="w-4 h-4" />
        <span className="hidden xl:inline">معاينة كمستخدم</span>
        <ChevronDown className="w-4 h-4 opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 text-right">
          <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
            شاهد الموقع كما يراه المستخدم (للعرض فقط)
          </p>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { setOpen(false); switchUser(u.id); }}
                className={`w-full flex items-center gap-2 p-2 rounded-xl text-sm text-right ${u.id === currentUser.id ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
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
      <span className="flex-1 text-right truncate">{item.label}</span>
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
    <button type="button" onClick={() => onGo(item.id)} aria-current={active ? 'page' : undefined} className={cls}>{inner}</button>
  );
};

const SidebarBody: React.FC<{ onNavigate?: () => void; onProfile: () => void }> = ({ onNavigate, onProfile }) => {
  const { currentUser, currentView, setCurrentView, logout, pendingApprovalsCount, settings } = useApp();
  if (!currentUser) return null;
  const groups = staffGroups(currentUser, pendingApprovalsCount, settings.preparations_url);
  const go = (id: string) => { setCurrentView(id); onNavigate?.(); };
  const activeId = currentView === 'students_management' ? 'users_management' : currentView;
  return (
    <div className="h-full flex flex-col">
      <button type="button" onClick={() => go('dashboard')} className="px-3 pt-1 pb-4 text-right" aria-label="الرئيسية">
        <Logo size="sm" />
      </button>
      <nav className="flex-1 overflow-y-auto space-y-0.5" aria-label="القائمة الرئيسية">
        {groups.map((g, i) => (
          <div key={i}>
            {g.title && <div className="px-3.5 pt-4 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{g.title}</div>}
            {g.items.map((it) => <NavLink key={it.id} item={it} active={activeId === it.id} onGo={go} />)}
          </div>
        ))}
      </nav>
      <div className="mt-3 flex items-center gap-2 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
        <button type="button" onClick={onProfile} aria-label="الملف الشخصي" className="flex-1 min-w-0 flex items-center gap-2.5 text-right rounded-xl p-1 hover:bg-white dark:hover:bg-slate-800">
          <Avatar name={currentUser.name} role={currentUser.role} userId={currentUser.id} size="sm" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{roleText(currentUser)}</span>
          </span>
        </button>
        <button type="button" onClick={logout} title="تسجيل الخروج" aria-label="تسجيل الخروج" className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">
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
    <div className="min-h-screen lg:pr-64">
      <aside className="hidden lg:block fixed inset-y-0 right-0 w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 px-3 py-5 z-30">
        <SidebarBody onProfile={() => setProfile(true)} />
      </aside>

      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="القائمة">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 right-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 px-3 py-5 shadow-xl">
            <button type="button" onClick={() => setDrawer(false)} aria-label="إغلاق القائمة" className="absolute top-4 left-3 w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
            <SidebarBody onNavigate={() => setDrawer(false)} onProfile={() => { setDrawer(false); setProfile(true); }} />
          </aside>
        </div>
      )}

      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDrawer(true)} aria-label="فتح القائمة" className="lg:hidden w-11 h-11 flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Menu className="w-6 h-6" />
            </button>
            <div className="lg:hidden"><Logo size="sm" showText={false} /></div>
          </div>
          <div className="flex items-center gap-1.5">
            <PreviewSwitcher />
            <ThemeButton />
            <NotificationBell />
          </div>
        </header>
        {banner}
        <main className="flex-1 pb-12">{children}</main>
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
  const tabs = currentUser.role === 'parent' ? PARENT_TABS : STUDENT_TABS;
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <button type="button" onClick={() => setCurrentView('dashboard')} aria-label="الرئيسية"><Logo size="sm" /></button>
            <nav className="hidden md:flex items-center gap-1" aria-label="القائمة الرئيسية">
              {tabs.filter((t) => t.id !== 'notifications').map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCurrentView(t.id)}
                  aria-current={currentView === t.id ? 'page' : undefined}
                  className={`h-10 px-4 rounded-xl text-[15px] font-semibold transition-colors ${currentView === t.id ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {t.id === 'my_points' ? 'نقاطي وأوسمتي' : t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <ThemeButton />
            <NotificationBell />
            <button type="button" onClick={() => setProfile(true)} aria-label="الملف الشخصي" className="flex items-center gap-2.5 rounded-xl p-1 md:pr-3 md:mr-1 md:border-r border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Avatar name={currentUser.name} role={currentUser.role} userId={currentUser.id} size="sm" showBadge />
              <span className="hidden lg:block text-right">
                <span className="block text-sm font-bold text-slate-900 dark:text-white">{currentUser.name}</span>
              </span>
            </button>
            <button type="button" onClick={logout} title="تسجيل الخروج" aria-label="تسجيل الخروج" className="hidden md:flex w-11 h-11 items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      {banner}
      <main className="flex-1 pb-24 md:pb-12">{children}</main>
      <div className="hidden md:block"><Footer /></div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex pb-[env(safe-area-inset-bottom)]" aria-label="التنقل">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = currentView === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setCurrentView(t.id)} aria-current={on ? 'page' : undefined}
              className={`flex-1 h-16 flex flex-col items-center justify-center gap-1 text-xs font-semibold ${on ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>
              <Icon className="w-[22px] h-[22px]" strokeWidth={on ? 2.4 : 1.9} />
              {t.label}
            </button>
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
        <main className="flex-1">{children}</main>
      </div>
    );
  }
  return currentUser.role === 'student' || currentUser.role === 'parent'
    ? <StudentShell banner={banner}>{children}</StudentShell>
    : <StaffShell banner={banner}>{children}</StaffShell>;
};

