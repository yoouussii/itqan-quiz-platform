import React, { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const inputCls =
  'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** نافذة إلزامية لتغيير كلمة المرور الافتراضية عند أول دخول (لا تُغلق قبل التغيير) */
export const ForcePasswordChange: React.FC = () => {
  const { currentUser, changeMyPassword, logout } = useApp();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cur || !next) return setError('أدخل كلمة المرور الحالية والجديدة');
    if (next.length < 6) return setError('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف');
    if (next !== again) return setError('تأكيد كلمة المرور غير مطابق');
    setBusy(true);
    const res = await changeMyPassword(cur, next);
    setBusy(false);
    if (!res.ok) setError(res.error || 'تعذر تغيير كلمة المرور');
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <form
        onSubmit={save}
        role="dialog"
        aria-label="تغيير كلمة المرور الافتراضية"
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center mx-auto">
            <KeyRound className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">غيّر كلمة المرور للمتابعة</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            أهلاً {currentUser?.name}، ما زلت تستخدم كلمة المرور الافتراضية. لحماية حسابك اختر كلمة مرور جديدة خاصة بك.
          </p>
        </div>
        <input type="password" aria-label="كلمة المرور الحالية" placeholder="كلمة المرور الحالية" value={cur}
          onChange={(e) => setCur(e.target.value)} className={inputCls} autoComplete="current-password" />
        <input type="password" aria-label="كلمة المرور الجديدة" placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)" value={next}
          onChange={(e) => setNext(e.target.value)} className={inputCls} autoComplete="new-password" />
        <input type="password" aria-label="تأكيد كلمة المرور الجديدة" placeholder="تأكيد كلمة المرور الجديدة" value={again}
          onChange={(e) => setAgain(e.target.value)} className={inputCls} autoComplete="new-password" />
        {error && <p role="alert" className="text-xs font-bold text-rose-600">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-60">
          {busy ? 'جارٍ الحفظ...' : 'حفظ ومتابعة'}
        </button>
        <button type="button" onClick={logout}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <LogOut className="w-3.5 h-3.5" /> تسجيل الخروج
        </button>
      </form>
    </div>
  );
};
