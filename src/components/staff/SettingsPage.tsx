import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** إعدادات النظام (لمدير النظام) */
export const SettingsPage: React.FC = () => {
  const { settings, updateSettings } = useApp();
  const [approval, setApproval] = useState(settings.require_quiz_approval);
  const [url, setUrl] = useState(settings.preparations_url);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const clean = url.trim();
    if (clean && !/^https?:\/\//i.test(clean)) return alert('الرابط يجب أن يبدأ بـ https://');
    setBusy(true);
    await updateSettings({ require_quiz_approval: approval, preparations_url: clean || settings.preparations_url });
    setBusy(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 space-y-6" dir="rtl">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo flex items-center gap-2"><Settings className="w-6 h-6 text-indigo-600" /> إعدادات النظام</h1>
      </div>

      <label className="flex items-start gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 cursor-pointer">
        <input type="checkbox" aria-label="اشتراط اعتماد الاختبارات" checked={approval} onChange={(e) => setApproval(e.target.checked)} className="accent-indigo-600 w-4 h-4 mt-1" />
        <span>
          <b className="text-sm text-slate-900 dark:text-white">اشتراط اعتماد الاختبارات قبل نشرها</b>
          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            عند التفعيل: اختبار المعلم يُحفظ «بانتظار الاعتماد» ولا يراه الطلاب حتى يعتمده مدير النظام أو من يملك صلاحية «اعتماد الاختبارات». مدير النظام ومن يملك الصلاحية يُنشرون مباشرة.
          </span>
        </span>
      </label>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-2">
        <label className="block text-sm font-bold text-slate-900 dark:text-white">رابط متابعة التحضيرات</label>
        <input aria-label="رابط متابعة التحضيرات" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        <p className="text-[11px] text-slate-500">يفتح في تبويب جديد عند الضغط على زر «متابعة التحضيرات».</p>
      </div>

      <button onClick={save} disabled={busy} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-60">حفظ الإعدادات</button>
    </div>
  );
};
