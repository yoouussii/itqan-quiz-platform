import React, { useRef, useState } from 'react';
import { X, Upload, Trash2, KeyRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { AVATAR_PRESETS } from '../../utils/avatarPresets';
import { fileToAvatarDataUrl } from '../../services/avatarService';
import { DEFAULT_PASSWORD } from '../../services/storage';

const ROLE_TEXT: Record<string, string> = { admin: 'مدير النظام', teacher: 'معلم', student: 'طالب', supervisor: 'مشرف' };
const inputCls = 'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

export const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser, avatars, setMyAvatar, changeMyPassword, showToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!currentUser) return null;
  const current = avatars[currentUser.id] || '';
  const usingDefault = (currentUser.password || '') === DEFAULT_PASSWORD;

  const apply = async (data: string | null) => {
    setBusy(true);
    const res = await setMyAvatar(data);
    setBusy(false);
    if (res.ok) showToast(data ? 'تم تحديث صورتك الشخصية' : 'تمت إزالة الصورة', 'success');
    else showToast(`تم الحفظ على هذا الجهاز فقط (${res.error})`, 'info');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await apply(await fileToAvatarDataUrl(f));
    } catch (err: any) {
      showToast(err?.message || 'تعذر استخدام هذه الصورة', 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const savePassword = async () => {
    setPwdMsg(null);
    if (!cur || !next) return setPwdMsg({ ok: false, text: 'أدخل كلمة المرور الحالية والجديدة' });
    if (next !== again) return setPwdMsg({ ok: false, text: 'تأكيد كلمة المرور غير مطابق' });
    setBusy(true);
    const res = await changeMyPassword(cur, next);
    setBusy(false);
    if (res.ok) {
      setPwdMsg({ ok: true, text: 'تم تغيير كلمة المرور بنجاح' });
      setCur(''); setNext(''); setAgain('');
    } else {
      setPwdMsg({ ok: false, text: res.error || 'تعذر تغيير كلمة المرور' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div
        role="dialog"
        aria-label="الملف الشخصي"
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-black text-base text-slate-900 dark:text-white">الملف الشخصي</h3>
          <button onClick={onClose} aria-label="إغلاق" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <Avatar name={currentUser.name} role={currentUser.role} userId={currentUser.id} size="xl" showBadge />
          <div>
            <div className="font-bold text-slate-900 dark:text-white">{currentUser.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {currentUser.job_title?.trim() || ROLE_TEXT[currentUser.role] || ''}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">اختر صورة رمزية جاهزة:</p>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                aria-label={`avatar-${p.key}`}
                onClick={() => apply(`preset:${p.key}`)}
                style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-sm transition-transform hover:scale-110 ${
                  current === `preset:${p.key}` ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-900' : ''
                }`}
              >
                {p.emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
            <Upload className="w-4 h-4" />
            <span>رفع صورة من جهازك</span>
          </button>
          <input ref={fileRef} data-testid="avatar-file" type="file" accept="image/*" className="hidden" onChange={onFile} />
          {current && (
            <button type="button" disabled={busy} onClick={() => apply(null)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100">
              <Trash2 className="w-4 h-4" />
              <span>إزالة الصورة</span>
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">تُقصّ الصورة مربعة وتُصغَّر تلقائياً. تظهر صورتك لبقية المستخدمين في قوائمهم.</p>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600" /> تغيير كلمة المرور
          </h4>
          {usingDefault && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-2">
              تستخدم كلمة المرور الافتراضية. يُنصح بتغييرها الآن.
            </p>
          )}
          <input type="password" aria-label="كلمة المرور الحالية" placeholder="كلمة المرور الحالية" value={cur} onChange={(e) => setCur(e.target.value)} className={inputCls} autoComplete="current-password" />
          <input type="password" aria-label="كلمة المرور الجديدة" placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} autoComplete="new-password" />
          <input type="password" aria-label="تأكيد كلمة المرور الجديدة" placeholder="تأكيد كلمة المرور الجديدة" value={again} onChange={(e) => setAgain(e.target.value)} className={inputCls} autoComplete="new-password" />
          {pwdMsg && (
            <p role="status" className={`text-xs font-bold ${pwdMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{pwdMsg.text}</p>
          )}
          <button type="button" disabled={busy} onClick={savePassword}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md disabled:opacity-60">
            حفظ كلمة المرور الجديدة
          </button>
        </div>
      </div>
    </div>
  );
};
