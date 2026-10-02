import React, { useState } from 'react';
import { Info, Check, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Logo } from '../common/Logo';

/** تسجيل الدخول برقم الهوية (لا يوجد تسجيل ذاتي: الحسابات تُنشأ من إدارة المدرسة) */
export const AuthScreen: React.FC = () => {
  const { login, theme, toggleTheme } = useApp();

  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleStandardLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      login(nationalId, password);
      setIsLoading(false);
    }, 250);
  };

  const input =
    'w-full h-[52px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition';

  return (
    <div className="w-full min-h-[calc(100vh-72px)] grid lg:grid-cols-2">
      <div className="relative flex flex-col justify-center px-5 sm:px-12 xl:px-24 py-12 bg-white dark:bg-slate-950">
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute top-4 left-4 w-11 h-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
          aria-label="تبديل مظهر العرض"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="w-full max-w-md mx-auto space-y-7">
          <Logo size="md" />
          <div>
            <h1 className="text-[32px] sm:text-[38px] font-extrabold text-slate-900 dark:text-white leading-tight">أهلاً بعودتك</h1>
            <p className="mt-2 text-[17px] text-slate-500 dark:text-slate-400">ادخل برقم الهوية وكلمة المرور التي استلمتها من المدرسة.</p>
          </div>

          <form onSubmit={handleStandardLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-id" className="block text-[15px] font-semibold text-slate-800 dark:text-slate-200">
                رقم الهوية أو الرقم الأكاديمي
              </label>
              <input
                id="login-id"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                required
                placeholder="10XXXXXXXX"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                className={`${input} tracking-wider tabular-nums`}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="login-pw" className="block text-[15px] font-semibold text-slate-800 dark:text-slate-200">كلمة المرور</label>
              <div className="relative">
                <input
                  id="login-pw"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${input} pl-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[54px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-[17px] font-bold flex items-center justify-center"
            >
              {isLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'دخول'}
            </button>
          </form>

          <div className="flex gap-3 items-start rounded-xl bg-slate-50 dark:bg-slate-900 px-4 py-3.5">
            <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">
              لا يوجد تسجيل ذاتي. إذا نسيت كلمة المرور أو لم يصلك حساب، تواصل مع إدارة المدرسة لإعادة تعيينها.
            </p>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex relative overflow-hidden bg-indigo-600 text-white flex-col justify-center px-16 xl:px-24 gap-7">
        <span className="pointer-events-none absolute -left-20 -top-20 w-80 h-80 rounded-full border-[48px]" style={{ borderColor: 'rgba(255,255,255,.07)' }} />
        <span className="pointer-events-none absolute right-16 -bottom-28 w-64 h-64 rounded-[40px] rotate-[24deg] bg-white/[0.06]" />
        <h2 className="relative text-[44px] font-extrabold leading-[1.35]">اختبارات المدرسة<br />في مكان واحد</h2>
        <ul className="relative space-y-4 text-[17px]">
          {['اختبارات إلكترونية بنتيجة فورية', 'نقاط وأوسمة تحفّز الطلاب', 'تقارير دقيقة للمعلم والإدارة'].map((t) => (
            <li key={t} className="flex items-center gap-3"><Check className="w-[22px] h-[22px] text-amber-300" strokeWidth={2.5} />{t}</li>
          ))}
        </ul>
        <p className="relative text-[13px] text-white/80">منظومة الاختبارات والتقييم الذكي</p>
      </div>
    </div>
  );
};
