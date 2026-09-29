import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  FileQuestion,
  BarChart2,
  Users,
  PlusCircle,
  Menu,
  X,
  LogOut,
  Moon,
  Sun,
  BookOpen,
  Layers,
  ChevronDown,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { Logo } from './Logo';

export const Navbar: React.FC = () => {
  const {
    currentUser,
    users,
    switchUser,
    currentView,
    setCurrentView,
    logout,
    theme,
    toggleTheme,
  } = useApp();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setIsUserSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return { text: 'مدير النظام', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
      case 'teacher':
        return { text: 'معلم / مدرب', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      case 'student':
        return { text: 'طالب', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      default:
        return { text: 'زائر', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
    }
  };

  const roleInfo = getRoleLabel(currentUser?.role);

  // Navigation items based on role & permissions
  const navItems = () => {
    if (!currentUser) return [];

    if (currentUser.role === 'admin') {
      return [
        { id: 'dashboard', label: 'لوحة المؤشرات', icon: LayoutDashboard },
        { id: 'quizzes', label: 'بنك الاختبارات', icon: FileQuestion },
        { id: 'analytics', label: 'التحليلات الشاملة', icon: BarChart2 },
        { id: 'users', label: 'إدارة المستخدمين', icon: Users },
        { id: 'subjects_classes', label: 'المواد والشعب', icon: Layers },
      ];
    }

    if (currentUser.role === 'teacher') {
      const items = [
        { id: 'dashboard', label: 'لوحة المعلم', icon: LayoutDashboard },
        { id: 'quizzes', label: 'اختباراتي', icon: FileQuestion },
        { id: 'create_quiz', label: 'إنشاء اختبار', icon: PlusCircle },
        { id: 'analytics', label: 'نتائج طلابي', icon: BarChart2 },
      ];
      if (
        currentUser.teacher_permissions?.can_add_custom_subjects ||
        currentUser.teacher_permissions?.can_manage_classes
      ) {
        items.push({ id: 'subjects_classes', label: 'المواد والشعب', icon: Layers });
      }
      return items;
    }

    // student: STRICT PRIVACY ONLY
    return [
      { id: 'dashboard', label: 'لوحة الطالب', icon: LayoutDashboard },
      { id: 'quizzes', label: 'اختباراتي المخصصة', icon: BookOpen },
      { id: 'analytics', label: 'سجل درجاتي وإنجازاتي', icon: BarChart2 },
    ];
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Brand Logo & Title */}
            <div className="flex items-center gap-3">
              <div
                onClick={() => setCurrentView('dashboard')}
                className="flex items-center cursor-pointer group"
              >
                <Logo size="md" showText={true} />
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems().map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right Controls: Theme Toggle, Quick Switcher, Reset & User Profile */}
            <div className="flex items-center gap-2">
              {/* Super Admin ONLY Quick User Switcher */}
              {currentUser?.role === 'admin' && (
                <div className="relative" ref={switcherRef}>
                  <button
                    onClick={() => setIsUserSwitcherOpen(!isUserSwitcherOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80 transition-colors shadow-xs"
                    title="معاينة وتبديل الحسابات (مخصص لمدير النظام فقط)"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="hidden sm:inline">تبديل الحساب (معاينة)</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </button>

                  {isUserSwitcherOpen && (
                    <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 text-right">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-white">تبديل الحساب السريع للمعاينة</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">خاص بمدير النظام لمعاينة وتجربة كافة واجهات المعلمين والطلاب</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {users.map((u) => {
                          const isSelf = u.id === currentUser.id;
                          return (
                            <button
                              key={u.id}
                              onClick={() => {
                                setIsUserSwitcherOpen(false);
                                switchUser(u.id);
                              }}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors text-right ${
                                isSelf
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Avatar name={u.name} role={u.role} size="sm" />
                                <div>
                                  <div className="font-bold text-slate-800 dark:text-white">{u.name}</div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{u.national_id}</div>
                                </div>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {u.role === 'admin' ? 'مدير' : u.role === 'teacher' ? 'معلم' : 'طالب'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dark Mode Toggle */}
              {/* Dark Mode Toggle - Visible and accessible to all users */}
              <button
                onClick={toggleTheme}
                className="p-2 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                title={theme === 'dark' ? 'التحويل إلى الوضع النهاري' : 'التحويل إلى الوضع الليلي'}
                aria-label="تبديل مظهر العرض"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600" />
                )}
              </button>

              {/* Current User Badge & Dropdown */}
              {currentUser ? (
                <div className="flex items-center gap-2.5 pl-1 border-r border-slate-200 dark:border-slate-800 pr-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={currentUser.name} role={currentUser.role} size="sm" showBadge />
                    <div className="hidden lg:block text-right">
                      <div className="text-xs font-bold text-slate-800 dark:text-white leading-tight">
                        {currentUser.name}
                      </div>
                      <span
                        className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded border ${roleInfo.color}`}
                      >
                        {roleInfo.text}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={logout}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                    title="تسجيل الخروج"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : null}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-3 pb-5 space-y-2">
            <div className="mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar name={currentUser?.name || ''} role={currentUser?.role} size="sm" />
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white">{currentUser?.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{roleInfo.text}</div>
                </div>
              </div>
              <button
                onClick={logout}
                className="text-xs text-rose-600 dark:text-rose-400 font-bold px-2 py-1 bg-rose-50 dark:bg-rose-950/50 rounded-lg"
              >
                خروج
              </button>
            </div>

            {navItems().map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* Super Admin ONLY user switcher in mobile drawer */}
            {currentUser?.role === 'admin' && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 px-2 mb-1.5">
                  معاينة الحسابات (خاص بمدير النظام):
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full text-right text-xs px-3 py-2 rounded-xl flex items-center justify-between ${
                        u.id === currentUser.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {u.role === 'admin' ? 'مدير' : u.role === 'teacher' ? 'معلم' : 'طالب'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </header>
    </>
  );
};
