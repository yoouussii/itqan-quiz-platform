import React, { useEffect, useState } from 'react';
import {
  FileQuestion, BarChart2, Users, PlusCircle, Menu, X, LogOut,
  Layers, ChevronDown, ClipboardCheck, Trophy, ScrollText, Settings as SettingsIcon,
  ExternalLink, Sparkles, Store, Gauge, Images, Bell, Home, LucideIcon,
  Library,
  Target,
  Award,
  CalendarCheck,
  CalendarDays,
  ShieldCheck,
  CalendarRange,
  BookOpenCheck,
  Eye as EyeIcon,
  ClipboardList,
  LifeBuoy,
  FolderOpen,
  PenLine,
  NotebookPen,
  HeartHandshake,
  FolderSync,
  Star,
  Plus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { ProfileModal } from './ProfileModal';
import { NotificationBell } from './NotificationBell';
import { Footer } from './Footer';
import { pathFor } from '../../utils/router';
import { ungradedSummary } from '../../utils/grading';
import { UserMenu } from './UserMenu';
import { GlobalSearch } from './GlobalSearch';
import { StudentProfileHost } from './StudentProfile';
import { OnboardingTour } from './OnboardingTour';

/** رابط حقيقي للصفحة: الضغط العادي يتنقل داخل الموقع، وCtrl/الزر الأوسط يفتحها في تبويب جديد */
const linkClick = (go: () => void) => (e: React.MouseEvent) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go();
};
import { hasPerm, pageAllowed } from '../../utils/permissions';
import { shortName, parentLabel } from '../../utils/names';
import { User } from '../../types';
import { t, isEn } from '../../i18n';

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
  quizzes.push({ id: 'homework', label: t('الواجبات'), icon: NotebookPen });
  if (hasPerm(u, 'can_academic_support')) quizzes.push({ id: 'academic_support', label: t('الدعم الأكاديمي'), icon: HeartHandshake });
  if (u.role === 'supervisor' || hasPerm(u, 'can_nafes')) quizzes.push({ id: 'nafes', label: t('نافس'), icon: Target });
  quizzes.push({ id: 'remedial', label: t('الخطط العلاجية'), icon: LifeBuoy });
  quizzes.push({ id: 'calendar', label: t('جدول الاختبارات'), icon: CalendarDays });
  quizzes.push({ id: 'analytics', label: u.role === 'teacher' ? t('نتائج طلابي') : t('النتائج والتحليلات'), icon: BarChart2 });
  quizzes.push({ id: 'gradebook', label: t('كشف الدرجات'), icon: BookOpenCheck });
  if (u.role === 'teacher' && p.can_view_all_reports) quizzes.push({ id: 'reports', label: t('التقارير الشاملة'), icon: BarChart2 });

  if (isAdmin || u.role === 'supervisor' || hasPerm(u, 'can_view_all_reports')) school.push({ id: 'indicators', label: t('مؤشرات المدرسة'), icon: Gauge });
  if (isAdmin) school.push({ id: 'users', label: t('المستخدمون'), icon: Users });
  else if (p.can_add_students || p.can_add_teachers) school.push({ id: 'users_management', label: t('المستخدمون'), icon: Users });
  if (isAdmin || p.can_add_custom_subjects || p.can_manage_classes) school.push({ id: 'subjects_classes', label: t('المواد والفصول'), icon: Layers });
  if (isAdmin) school.push({ id: 'banners', label: t('الإعلانات والبانرات'), icon: Images });
  if (hasPerm(u, 'can_view_leaderboard')) school.push({ id: 'leaderboard', label: t('لوحة الشرف'), icon: Trophy });
  if (hasPerm(u, 'can_award_badges')) school.push({ id: 'certificates', label: t('الشهادات'), icon: Award });
  if (hasPerm(u, 'can_manage_store')) school.push({ id: 'points_store', label: t('متجر النقاط'), icon: Store });
  if (hasPerm(u, 'can_view_attendance') || hasPerm(u, 'can_manage_attendance') || hasPerm(u, 'can_note_attendance')) school.push({ id: 'attendance', label: t('الحضور والغياب'), icon: CalendarCheck });
  if (hasPerm(u, 'can_view_behavior') || hasPerm(u, 'can_record_behavior')) school.push({ id: 'behavior', label: t('السلوك والمواظبة'), icon: ShieldCheck });
  if (hasPerm(u, 'can_view_class_records') || hasPerm(u, 'can_manage_class_records')) school.push({ id: 'class_records', label: t('سجلات المتابعة'), icon: FolderSync });
  school.push({ id: 'visits', label: t('الزيارات الصفية'), icon: EyeIcon });
  school.push({ id: 'portfolio', label: u.role === 'teacher' ? t('ملف إنجازي') : t('ملفات إنجاز المعلمين'), icon: FolderOpen });
  if (hasPerm(u, 'can_manage_surveys')) school.push({ id: 'surveys', label: t('الاستبيانات'), icon: ClipboardList });

  system.push({ id: 'notifications', label: t('الإشعارات'), icon: Bell });
  if (hasPerm(u, 'can_view_activity_log')) system.push({ id: 'activity_log', label: t('سجل النشاط'), icon: ScrollText });
  if (isAdmin) system.push({ id: 'school_year', label: t('إدارة العام الدراسي'), icon: CalendarRange });
  if (isAdmin) system.push({ id: 'settings', label: t('الإعدادات'), icon: SettingsIcon });
  if (hasPerm(u, 'can_access_preparations') && preparationsUrl) system.push({ id: 'preparations', label: t('متابعة تحضير مزن'), icon: ExternalLink, href: preparationsUrl });

  const home: NavItem = { id: 'dashboard', label: u.role === 'teacher' ? t('اختباراتي') : t('الرئيسية'), icon: u.role === 'teacher' ? FileQuestion : Home };
  // الصفحات التي حددها المدير للمعلم (الأقسام)
  const ok = (i: NavItem) => pageAllowed(u, i.id);
  const q = quizzes.filter(ok), sc = school.filter(ok), sy = system.filter(ok);
  return [
    { items: [home] },
    ...(q.length ? [{ title: t('الاختبارات'), items: q }] : []),
    ...(sc.length ? [{ title: t('المدرسة'), items: sc }] : []),
    { title: t('النظام'), items: sy },
  ];
};

// دوال (لا ثوابت) حتى تُترجم عند كل رسم بعد تغيير اللغة
const PARENT_TABS = (): NavItem[] => [
  { id: 'dashboard', label: t('أبنائي'), icon: Users },
  { id: 'calendar', label: t('الجدول'), icon: CalendarDays },
  { id: 'notifications', label: t('الإشعارات'), icon: Bell },
];

const STUDENT_TABS = (): NavItem[] => [
  { id: 'dashboard', label: t('الرئيسية'), icon: Home },
  { id: 'homework', label: t('واجباتي'), icon: NotebookPen },
  { id: 'analytics', label: t('نتائجي'), icon: BarChart2 },
  { id: 'calendar', label: t('الجدول'), icon: CalendarDays },
  { id: 'my_points', label: t('نقاطي'), icon: Sparkles },
  { id: 'notifications', label: t('الإشعارات'), icon: Bell },
];

const NavLink: React.FC<{ item: NavItem; active: boolean; onGo: (id: string) => void; fav?: boolean; onFav?: (id: string) => void }> = ({ item, active, onGo, fav, onFav }) => {
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
  const link = item.href ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  ) : (
    <a href={pathFor({ view: item.id })} onClick={linkClick(() => onGo(item.id))} aria-current={active ? 'page' : undefined} className={cls}>{inner}</a>
  );
  if (!onFav || item.id === 'dashboard') return link;
  // نجمة التثبيت في «المفضلة»: تظهر عند المرور أو التركيز (ودائماً للمثبّتة)
  return (
    <div className="relative group">
      {link}
      <button type="button" onClick={() => onFav(item.id)} aria-pressed={fav} aria-label={fav ? t('إزالة {p} من المفضلة', { p: item.label }) : t('تثبيت {p} في المفضلة', { p: item.label })}
        title={fav ? t('إزالة من المفضلة') : t('تثبيت في المفضلة')}
        className={`absolute top-1/2 -translate-y-1/2 end-1 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white dark:hover:bg-slate-900 ${item.badge ? 'end-9' : ''} ${fav ? 'opacity-0 group-hover:opacity-100 focus:opacity-100 text-amber-500' : 'opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400'}`}>
        <Star className="w-4 h-4" fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
};

const lsGet = (k: string, d: string[]): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(v) ? v : d; } catch { return d; } };
const lsSet = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/** عدد الإجابات المقالية بانتظار التصحيح (المعلم: اختباراته فقط) */
const usePendingGrading = () => {
  const { currentUser, submissions, quizzes } = useApp();
  return React.useMemo(() => {
    if (!currentUser || !(currentUser.role === 'teacher' || hasPerm(currentUser, 'can_grade_essays'))) return 0;
    const all = hasPerm(currentUser, 'can_grade_essays');
    const mine = new Set(quizzes.filter((q) => !q.is_deleted && (all || q.teacher_id === currentUser.id || q.created_by === currentUser.id)).map((q) => q.id));
    return ungradedSummary((submissions || []).filter((x) => mine.has(x.quiz_id))).essays;
  }, [currentUser, quizzes, submissions]);
};

const SidebarBody: React.FC<{ onNavigate?: () => void; onProfile: () => void }> = ({ onNavigate, onProfile }) => {
  const { currentUser, currentView, setCurrentView, logout, pendingApprovalsCount, settings } = useApp();
  const pendingGrading = usePendingGrading();
  const uid = currentUser?.id || '';
  const [favs, setFavs] = useState<string[]>(() => lsGet(`itqan_nav_favs_${uid}`, []));
  const [folded, setFolded] = useState<string[]>(() => lsGet(`itqan_nav_folded_${uid}`, []));
  if (!currentUser) return null;
  const groups = staffGroups(currentUser, pendingApprovalsCount, settings.preparations_url, pendingGrading);
  const go = (id: string) => { setCurrentView(id); onNavigate?.(); };
  const activeId = currentView === 'students_management' ? 'users_management' : currentView;
  const all = groups.flatMap((g) => g.items);
  const favItems = favs.map((id) => all.find((i) => i.id === id)).filter(Boolean) as NavItem[];
  const toggleFav = (id: string) => { const n = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]; setFavs(n); lsSet(`itqan_nav_favs_${uid}`, n); };
  const toggleFold = (title: string) => { const n = folded.includes(title) ? folded.filter((x) => x !== title) : [...folded, title]; setFolded(n); lsSet(`itqan_nav_folded_${uid}`, n); };
  return (
    <div className="h-full flex flex-col">
      <button type="button" onClick={() => go('dashboard')} className="px-3 pt-1 pb-4 text-start" aria-label={t('الرئيسية')}>
        <Logo size="sm" />
      </button>
      <nav className="flex-1 overflow-y-auto space-y-0.5" aria-label={t('القائمة الرئيسية')} data-testid="sidebar-nav">
        {groups[0] && groups[0].items.map((it) => <NavLink key={it.id} item={it} active={activeId === it.id} onGo={go} />)}
        {favItems.length > 0 && (
          <div data-testid="nav-favs">
            <div className="px-3.5 pt-4 pb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1"><Star className="w-3.5 h-3.5" fill="currentColor" />{t('المفضلة')}</div>
            {favItems.map((it) => <NavLink key={`f-${it.id}`} item={it} active={activeId === it.id} onGo={go} fav onFav={toggleFav} />)}
          </div>
        )}
        {groups.slice(1).map((g, i) => {
          const isFolded = !!g.title && folded.includes(g.title) && !g.items.some((it) => it.id === activeId);
          const badge = g.items.reduce((a, it) => a + (it.badge || 0), 0);
          return (
            <div key={i}>
              {g.title && (
                <button type="button" onClick={() => toggleFold(g.title!)} aria-expanded={!isFolded}
                  className="w-full px-3.5 pt-4 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-200">
                  <span className="flex-1 text-start">{g.title}</span>
                  {isFolded && badge > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[11px] font-bold flex items-center justify-center">{badge}</span>}
                  {isFolded && <span className="text-[11px] font-normal">{g.items.length}</span>}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFolded ? (isEn() ? '-rotate-90' : 'rotate-90') : ''}`} />
                </button>
              )}
              {!isFolded && g.items.map((it) => <NavLink key={it.id} item={it} active={activeId === it.id} onGo={go} fav={favs.includes(it.id)} onFav={toggleFav} />)}
            </div>
          );
        })}
        {favItems.length === 0 && <p className="hidden lg:block px-3.5 pt-4 text-xs text-slate-400 dark:text-slate-500">{t('مرّر على أي صفحة واضغط ★ لتثبيتها في المفضلة')}</p>}
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

/** شريط التنقل السفلي للطاقم في الجوال: أهم أربع صفحات وزر «إنشاء» و«المزيد» */
const StaffBottomNav: React.FC<{ onMore: () => void }> = ({ onMore }) => {
  const { currentUser, currentView, setCurrentView, pendingApprovalsCount, settings, setEditingQuizId, setDuplicateQuizId } = useApp();
  const pendingGrading = usePendingGrading();
  if (!currentUser) return null;
  const all = staffGroups(currentUser, pendingApprovalsCount, settings.preparations_url, pendingGrading).flatMap((g) => g.items);
  const has = (id: string) => all.find((i) => i.id === id);
  const role = currentUser.role;
  const wanted = role === 'teacher' ? ['dashboard', 'grading', '+', 'analytics']
    : role === 'supervisor' ? ['dashboard', 'approvals', 'indicators', 'analytics']
    : ['dashboard', 'indicators', '+', 'attendance'];
  const canCreate = (role === 'teacher' || role === 'admin') && pageAllowed(currentUser, 'create_quiz');
  const items = wanted.map((id) => (id === '+' ? (canCreate ? '+' : null) : has(id) || null)).filter(Boolean) as Array<NavItem | '+'>;
  // عند غياب صفحة نكمل بأخرى متاحة حتى تبقى أربع
  for (const id of ['grading', 'analytics', 'attendance', 'homework', 'gradebook']) {
    if (items.filter((x) => x !== '+').length >= 4 - (items.includes('+') ? 1 : 0)) break;
    const it = has(id); if (it && !items.some((x) => x !== '+' && (x as NavItem).id === id)) items.push(it);
  }
  const cls = (on: boolean) => `flex-1 min-w-0 h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold relative ${on ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`;
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex pb-[env(safe-area-inset-bottom)]" aria-label={t('التنقل')} data-testid="staff-bottom-nav">
      {items.map((it) => {
        if (it === '+') {
          return (
            <button key="create" type="button" onClick={() => { setEditingQuizId(null); setDuplicateQuizId(null); setCurrentView('create_quiz'); }} className={cls(currentView === 'create_quiz')} aria-label={t('اختبار جديد')}>
              <span className="w-12 h-12 -mt-6 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30"><Plus className="w-6 h-6" strokeWidth={2.5} /></span>
              {t('إنشاء')}
            </button>
          );
        }
        const Icon = it.icon; const on = currentView === it.id;
        const label = it.id === 'dashboard' ? (role === 'teacher' ? t('اختباراتي') : t('الرئيسية')) : it.id === 'analytics' ? t('النتائج') : it.id === 'indicators' ? t('المؤشرات') : it.id === 'attendance' ? t('الحضور') : it.id === 'approvals' ? t('الاعتماد') : it.label;
        return (
          <a key={it.id} href={pathFor({ view: it.id })} onClick={linkClick(() => setCurrentView(it.id))} aria-current={on ? 'page' : undefined} className={cls(on)}>
            <span className="relative"><Icon className="w-[22px] h-[22px]" strokeWidth={on ? 2.4 : 1.9} />
              {!!it.badge && <span className="absolute -top-1.5 -end-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">{it.badge > 99 ? '99+' : it.badge}</span>}
            </span>
            <span className="truncate max-w-full px-1">{label}</span>
          </a>
        );
      })}
      <button type="button" onClick={onMore} className={cls(false)} aria-label={t('فتح القائمة')} data-testid="nav-more">
        <Menu className="w-[22px] h-[22px]" strokeWidth={1.9} />{t('المزيد')}
      </button>
    </nav>
  );
};

/** هيكل الطاقم: قائمة جانبية ثابتة على الكمبيوتر، وقائمة منزلقة وشريط سفلي في الجوال */
const StaffShell: React.FC<{ children: React.ReactNode; banner?: React.ReactNode }> = ({ children, banner }) => {
  const [drawer, setDrawer] = useState(false);
  const [profile, setProfile] = useState(false);
  const { currentView, currentUser, pendingApprovalsCount, settings } = useApp();
  useEffect(() => setDrawer(false), [currentView]);
  const searchPages = React.useMemo(() => (currentUser ? staffGroups(currentUser, pendingApprovalsCount, settings.preparations_url).flatMap((g) => g.items).map((i) => ({ id: i.id, label: i.label, href: i.href })) : []), [currentUser, pendingApprovalsCount, settings.preparations_url]);
  const searchSlot = <GlobalSearch pages={searchPages} />;
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
        <header className="sticky top-0 z-20 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 lg:gap-3 px-4 sm:px-6">
          <div className="lg:hidden min-w-0 flex-1"><Logo size="sm" /></div>
          <div className="lg:flex-1 lg:max-w-md">{searchSlot}</div>
          <div className="hidden lg:block flex-1" />
          <div className="flex items-center gap-1.5">
            <NotificationBell />
            {currentUser && <UserMenu displayName={shortName(currentUser.name || '')} roleLabel={roleText(currentUser)} onProfile={() => setProfile(true)} />}
          </div>
        </header>
        {banner}
        <main className="flex-1 pb-24 lg:pb-12 overflow-x-clip">{children}</main>
        <div className="hidden lg:block"><Footer /></div>
      </div>
      <StaffBottomNav onMore={() => setDrawer(true)} />
      <StudentProfileHost />
      <OnboardingTour />
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </div>
  );
};

/** هيكل الطالب: شريط علوي على الكمبيوتر، وشريط تنقل سفلي في الجوال */
const StudentShell: React.FC<{ children: React.ReactNode; banner?: React.ReactNode }> = ({ children, banner }) => {
  const { currentUser, currentView, setCurrentView, users } = useApp();
  const [profile, setProfile] = useState(false);
  if (!currentUser) return null;
  const tabs = currentUser.role === 'parent' ? PARENT_TABS() : STUDENT_TABS();
  const displayName = currentUser.role === 'parent' ? parentLabel(currentUser, users, t) : shortName(currentUser.name || '');
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-8 min-w-0">
            <button type="button" onClick={() => setCurrentView('dashboard')} aria-label={t('الرئيسية')} className="min-w-0"><Logo size="sm" /></button>
            <nav className="hidden md:flex items-center gap-1" aria-label={t('القائمة الرئيسية')}>
              {tabs.filter((tab) => tab.id !== 'notifications').map((tab) => (
                <a
                  key={tab.id}
                  href={pathFor({ view: tab.id })}
                  onClick={linkClick(() => setCurrentView(tab.id))}
                  aria-current={currentView === tab.id ? 'page' : undefined}
                  className={`h-10 px-3 lg:px-4 inline-flex items-center rounded-xl text-[15px] font-semibold whitespace-nowrap transition-colors ${currentView === tab.id ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {tab.id === 'my_points' ? <><span className="xl:hidden">{tab.label}</span><span className="hidden xl:inline">{t('نقاطي وأوسمتي')}</span></> : tab.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <NotificationBell />
            <UserMenu displayName={displayName} roleLabel={roleText(currentUser)} onProfile={() => setProfile(true)} showName />
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
      <OnboardingTour />
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

