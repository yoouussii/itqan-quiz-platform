import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  CreditCard,
  KeyRound,
  Info,
  CheckCircle2,
  Moon,
  Sun,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Logo } from '../common/Logo';

export const AuthScreen: React.FC = () => {
  const { login, theme, toggleTheme } = useApp();

  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleStandardLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      login(nationalId, password);
      setIsLoading(false);
    }, 250);
  };

  return (
    <div className="w-full flex-1 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 relative transition-colors duration-200">
      {/* Top Bar with Theme Toggle */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
        <button
          onClick={toggleTheme}
          className="p-2.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl shadow-xs transition-colors"
          title={theme === 'dark' ? 'التحويل إلى الوضع النهاري' : 'التحويل إلى الوضع الليلي'}
          aria-label="تبديل مظهر العرض"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-slate-600" />
          )}
        </button>
      </div>

      <div className="max-w-md mx-auto w-full space-y-6">
        {/* Brand Header with Official Logo */}
        <div className="flex flex-col items-center justify-center text-center">
          <Logo size="xl" showText={false} className="justify-center mb-3 scale-110" />
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-cairo">
            منصة إتقان التعليمية
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            نظام إدارة الاختبارات والتقييم الأكاديمي الذكي الموحد
          </p>
        </div>

        {/* Secure Login Form by National ID / Academic ID (NO PUBLIC SIGNUP) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-black/40 border border-slate-200/80 dark:border-slate-800">
          <div className="text-center mb-6">
            <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-2.5">
              <KeyRound className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">تسجيل الدخول للنظام</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              يرجى إدخال رقم الهوية الوطنية أو الرقم الأكاديمي المعتمد
            </p>
          </div>

          <form onSubmit={handleStandardLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-right">
                رقم الهوية الوطنية / الرقم الأكاديمي <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="أدخل رقم الهوية أو الرقم الأكاديمي"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  className="w-full pr-10 pl-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-wider transition-all placeholder:font-sans placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-right">
                كلمة المرور <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-10 pl-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>دخول آمن للمنصة</span>
                </>
              )}
            </button>
          </form>

          {/* Institutional note: No public registration notice */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2.5 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>تنبيه إداري:</strong> تم إغلاق التسجيل المباشر لدواعي أمن وحوكمة الاختبارات. يتم اعتماد وتفعيل حسابات الكادر التعليمي والطلاب حصرياً من قِبل إدارة المدرسة.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              تشفير معتمد للبيانات
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-indigo-500" />
              حوكمة صلاحيات RBAC
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
