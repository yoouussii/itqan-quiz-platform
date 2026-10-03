import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldX, ShieldAlert, Search, Loader2 } from 'lucide-react';
import { verifyCertificate, VerifyResult } from '../../services/certificateService';
import { defaultCertTitle, certReasonPrefix } from '../../utils/certificate';
import { t, uiDir, isEn } from '../../i18n';

/**
 * صفحة التحقق العامة من الشهادات (/verify/<الرمز>): تعمل بدون تسجيل دخول،
 * وتعرض بيانات الشهادة كما سُجّلت أو أنها ملغاة أو غير موجودة.
 */
export const VerifyPage: React.FC = () => {
  const initial = decodeURIComponent(window.location.pathname.split('/')[2] || '');
  const [code, setCode] = useState(initial);
  const [state, setState] = useState<{ loading: boolean; result?: VerifyResult; error?: string }>({ loading: !!initial });

  const run = async (c: string) => {
    if (!c.trim()) return;
    setState({ loading: true });
    const r = await verifyCertificate(c.trim());
    setState({ loading: false, result: r.data, error: r.ok ? undefined : r.error });
    const path = `/verify/${encodeURIComponent(c.trim().toUpperCase())}`;
    if (window.location.pathname !== path) window.history.replaceState(null, '', path);
  };
  useEffect(() => { if (initial) void run(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const r = state.result;
  const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString(isEn() ? 'en-GB' : 'ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const row = (label: string, value?: string) => (value ? (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <dt className="sm:w-36 shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  ) : null);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] py-10 px-4" dir={uiDir()}>
      <div className="max-w-xl mx-auto space-y-5">
        <div className="text-center space-y-1">
          <ShieldCheck className="w-10 h-10 mx-auto text-indigo-600" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">{t('التحقق من شهادة')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('اكتب رمز التحقق المطبوع أسفل الشهادة، أو امسح رمز QR.')}</p>
        </div>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(code); }}>
          <input aria-label={t('رمز التحقق')} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1B2C3D4E5" maxLength={20}
            className="flex-1 h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" className="h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center gap-1.5"><Search className="w-4 h-4" />{t('تحقق')}</button>
        </form>

        {state.loading && <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" aria-label={t('جارٍ التحميل')} /></div>}

        {!state.loading && state.error && (
          <div className="rounded-2xl p-5 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm flex gap-3"><ShieldAlert className="w-5 h-5 shrink-0" />{t('تعذر الاتصال بالخادم. حاول مرة أخرى.')}</div>
        )}

        {!state.loading && r && !r.found && (
          <div className="rounded-2xl p-5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex gap-3" data-testid="verify-result" role="status">
            <ShieldX className="w-7 h-7 text-rose-600 shrink-0" />
            <div><b className="block text-rose-900 dark:text-rose-200">{t('لا توجد شهادة بهذا الرمز')}</b><span className="text-sm text-rose-800 dark:text-rose-300">{t('تأكد من كتابة الرمز كما هو مطبوع. الشهادة غير المسجّلة لا يمكن التحقق منها.')}</span></div>
          </div>
        )}

        {!state.loading && r?.found && (
          <div className={`rounded-2xl border overflow-hidden bg-white dark:bg-slate-900 ${r.revoked ? 'border-rose-300 dark:border-rose-900' : 'border-emerald-300 dark:border-emerald-900'}`} data-testid="verify-result" role="status">
            <div className={`p-5 flex items-center gap-3 ${r.revoked ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-emerald-50 dark:bg-emerald-950/40'}`}>
              {r.revoked ? <ShieldX className="w-8 h-8 text-rose-600" /> : <ShieldCheck className="w-8 h-8 text-emerald-600" />}
              <div>
                <b className={`block text-lg ${r.revoked ? 'text-rose-900 dark:text-rose-200' : 'text-emerald-900 dark:text-emerald-200'}`}>{r.revoked ? t('هذه الشهادة ملغاة') : t('شهادة أصلية وسارية')}</b>
                <span className="text-xs text-slate-600 dark:text-slate-300">{r.revoked ? t('ألغتها المدرسة بتاريخ {d}', { d: date(r.revoked_at) }) : t('صادرة ومسجّلة في المنصة باسم المدرسة')}</span>
              </div>
            </div>
            <dl className="px-5 py-2">
              {row(t('رقم الشهادة'), r.serial)}
              {row(t('الاسم'), r.student_name)}
              {row(t('الصف'), r.class_name)}
              {row(t('الشهادة'), r.title || (r.kind ? defaultCertTitle(r.kind) : ''))}
              {row(t('السبب'), [r.kind ? certReasonPrefix(r.kind) : '', r.reason].filter(Boolean).join(' '))}
              {row(t('الدرجة'), r.score)}
              {row(t('المدرسة'), r.school_name)}
              {row(t('الموقّع'), [r.signer_name, r.signer_title].filter(Boolean).join(' — '))}
              {row(t('تاريخ الإصدار'), date(r.issued_on))}
            </dl>
          </div>
        )}

        <p className="text-center"><a href="/" className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{t('الذهاب إلى المنصة')}</a></p>
      </div>
    </div>
  );
};
