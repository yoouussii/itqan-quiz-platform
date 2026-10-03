import React, { useRef, useState } from 'react';
import { X, Upload, Trash2, KeyRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { CHARACTER_PRESETS, CharacterSvg } from './CharacterAvatar';
import { describeUser } from '../../utils/userDescription';
import { fileToAvatarDataUrl } from '../../services/avatarService';
import { DEFAULT_PASSWORD } from '../../services/storage';
import { uiDir, t } from '../../i18n';

const ROLE_TEXT = (): Record<string, string> => ({ admin: t('مدير النظام'), teacher: t('معلم'), student: t('طالب'), supervisor: t('مشرف'), parent: t('ولي أمر') });
const inputCls = 'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

export const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser, avatars, setMyAvatar, changeMyPassword, showToast, passwordIsDefault, subjects, classes } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!currentUser) return null;
  const current = avatars[currentUser.id] || '';
  const usingDefault = passwordIsDefault || (currentUser.password || '') === DEFAULT_PASSWORD;

  const apply = async (data: string | null) => {
    setBusy(true);
    const res = await setMyAvatar(data);
    setBusy(false);
    if (res.ok) showToast(data ? t('تم تحديث صورتك الشخصية') : t('تمت إزالة الصورة'), 'success');
    else showToast(t('تم الحفظ على هذا الجهاز فقط ({error})', { error: res.error || '' }), 'info');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await apply(await fileToAvatarDataUrl(f));
    } catch (err: any) {
      showToast(err?.message || t('تعذر استخدام هذه الصورة'), 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const savePassword = async () => {
    setPwdMsg(null);
    if (!cur || !next) return setPwdMsg({ ok: false, text: t('أدخل كلمة المرور الحالية والجديدة') });
    if (next !== again) return setPwdMsg({ ok: false, text: t('تأكيد كلمة المرور غير مطابق') });
    setBusy(true);
    const res = await changeMyPassword(cur, next);
    setBusy(false);
    if (res.ok) {
      setPwdMsg({ ok: true, text: t('تم تغيير كلمة المرور بنجاح') });
      setCur(''); setNext(''); setAgain('');
    } else {
      setPwdMsg({ ok: false, text: res.error || t('تعذر تغيير كلمة المرور') });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} dir={uiDir()}>
      <div
        role="dialog"
        aria-label={t('الملف الشخصي')}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-black text-base text-slate-900 dark:text-white">{t('الملف الشخصي')}</h3>
          <button onClick={onClose} aria-label={t('إغلاق')} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <Avatar name={currentUser.name} role={currentUser.role} userId={currentUser.id} size="xl" showBadge />
          <div>
            <div className="font-bold text-slate-900 dark:text-white">{currentUser.name}</div>
            {(() => {
              const d = describeUser(currentUser, subjects, classes);
              return (
                <>
                  <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">{d.title || ROLE_TEXT()[currentUser.role]}</div>
                  {d.details.map((line) => (
                    <div key={line} className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{line}</div>
                  ))}
                </>
              );
            })()}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">{t('اختر شخصيتك:')}</p>
          <div className="grid grid-cols-6 gap-2">
            {CHARACTER_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                aria-label={`avatar-${p.key}`}
                title={p.label}
                onClick={() => apply(`preset:${p.key}`)}
                className={`w-12 h-12 rounded-2xl shadow-sm transition-transform hover:scale-110 ${
                  current === `preset:${p.key}` ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-900' : ''
                }`}
              >
                <CharacterSvg preset={p} className="w-full h-full rounded-2xl" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
            <Upload className="w-4 h-4" />
            <span>{t('رفع صورة من جهازك')}</span>
          </button>
          <input ref={fileRef} data-testid="avatar-file" type="file" accept="image/*" className="hidden" onChange={onFile} />
          {current && (
            <button type="button" disabled={busy} onClick={() => apply(null)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100">
              <Trash2 className="w-4 h-4" />
              <span>{t('إزالة الصورة')}</span>
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">{t('تُقصّ الصورة مربعة وتُصغَّر تلقائياً. تظهر صورتك لبقية المستخدمين في قوائمهم.')}</p>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600" />{' '}{t('تغيير كلمة المرور')}
          </h4>
          {usingDefault && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-2">
              {t('تستخدم كلمة المرور الافتراضية. يُنصح بتغييرها الآن.')}
            </p>
          )}
          <input type="password" aria-label={t('كلمة المرور الحالية')} placeholder={t('كلمة المرور الحالية')} value={cur} onChange={(e) => setCur(e.target.value)} className={inputCls} autoComplete="current-password" />
          <input type="password" aria-label={t('كلمة المرور الجديدة')} placeholder={t('كلمة المرور الجديدة (6 أحرف على الأقل)')} value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} autoComplete="new-password" />
          <input type="password" aria-label={t('تأكيد كلمة المرور الجديدة')} placeholder={t('تأكيد كلمة المرور الجديدة')} value={again} onChange={(e) => setAgain(e.target.value)} className={inputCls} autoComplete="new-password" />
          {pwdMsg && (
            <p role="status" className={`text-xs font-bold ${pwdMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{pwdMsg.text}</p>
          )}
          <button type="button" disabled={busy} onClick={savePassword}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md disabled:opacity-60">
            {t('حفظ كلمة المرور الجديدة')}
          </button>
        </div>
      </div>
    </div>
  );
};
