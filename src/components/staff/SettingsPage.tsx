import React, { useRef, useState } from 'react';
import { Settings, ImagePlus, Trash2, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BRAND_PRESETS, applyBrandColor, resizeLogo } from '../../utils/brand';
import { uiDir, t } from '../../i18n';

/** إعدادات النظام (لمدير النظام) */
export const SettingsPage: React.FC = () => {
  const { settings, updateSettings } = useApp();
  const [approval, setApproval] = useState(settings.require_quiz_approval);
  const [url, setUrl] = useState(settings.preparations_url);
  const [schoolName, setSchoolName] = useState(settings.school_name || '');
  const [logo, setLogo] = useState(settings.school_logo || '');
  const [color, setColor] = useState(settings.brand_color || 'indigo');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickLogo = async (file?: File) => {
    if (!file) return;
    try {
      const data = await resizeLogo(file);
      if (data.length > 300_000) return alert(t('الصورة كبيرة جداً بعد التصغير، جرّب شعاراً أبسط أو بصيغة PNG'));
      setLogo(data);
    } catch (e: any) {
      alert(e?.message || t('تعذرت قراءة الصورة'));
    }
  };

  // معاينة اللون فوراً، والرجوع للون المحفوظ إن خرج المدير بلا حفظ
  const previewColor = (id: string) => { setColor(id); applyBrandColor(id); };
  React.useEffect(() => () => applyBrandColor(settings.brand_color), [settings.brand_color]);

  const save = async () => {
    const clean = url.trim();
    if (clean && !/^https?:\/\//i.test(clean)) return alert(t('الرابط يجب أن يبدأ بـ https://'));
    setBusy(true);
    await updateSettings({
      require_quiz_approval: approval,
      preparations_url: clean || settings.preparations_url,
      school_name: schoolName.trim(),
      school_logo: logo,
      brand_color: color,
    });
    setBusy(false);
  };

  const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5';

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 space-y-6" dir={uiDir()}>
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo flex items-center gap-2"><Settings className="w-6 h-6 text-indigo-600" />{' '}{t('إعدادات النظام')}</h1>
      </div>

      <section className={`${card} space-y-5`} aria-labelledby="brand-title">
        <div>
          <h2 id="brand-title" className="text-base font-bold text-slate-900 dark:text-white">{t('هوية المدرسة')}</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">{t('تظهر في شاشة الدخول وأعلى الصفحات وعنوان التبويب. اتركها فارغة لاستخدام هوية «منصة إتقان».')}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="school-name" className="block text-sm font-bold text-slate-900 dark:text-white">{t('اسم المدرسة')}</label>
          <input id="school-name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} maxLength={60} placeholder={t('مثال: مدارس المستقبل الأهلية')}
            className="w-full h-11 px-3 text-[15px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">{t('الشعار')}</span>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800 overflow-hidden shrink-0">
              {logo ? <img src={logo} alt={t('شعار المدرسة')} className="max-w-full max-h-full object-contain" /> : <ImagePlus className="w-7 h-7 text-slate-400" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">
                {logo ? t('تغيير الشعار') : t('رفع شعار')}
              </button>
              {logo && (
                <button type="button" onClick={() => setLogo('')} className="h-10 px-3 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 inline-flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4" />{t('إزالة')}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" aria-label={t('ملف الشعار')}
                onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">{t('يفضّل PNG بخلفية شفافة. يُصغَّر تلقائياً.')}</p>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">{t('لون الواجهة')}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('لون الواجهة')}>
            {BRAND_PRESETS.map((p) => {
              const on = color === p.id;
              return (
                <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => previewColor(p.id)}
                  className={`h-11 pe-4 ps-2 rounded-xl border inline-flex items-center gap-2 text-sm font-semibold ${on ? 'border-slate-900 dark:border-white' : 'border-slate-200 dark:border-slate-700'} text-slate-800 dark:text-slate-100`}>
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: p.shades[600] }}>
                    {on && <Check className="w-4 h-4 text-white" />}
                  </span>
                  {t(p.label)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <label className={`flex items-start gap-3 ${card} cursor-pointer`}>
        <input type="checkbox" aria-label={t('اشتراط اعتماد الاختبارات')} checked={approval} onChange={(e) => setApproval(e.target.checked)} className="accent-indigo-600 w-4 h-4 mt-1" />
        <span>
          <b className="text-sm text-slate-900 dark:text-white">{t('اشتراط اعتماد الاختبارات قبل نشرها')}</b>
          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t('عند التفعيل: اختبار المعلم يُحفظ «بانتظار الاعتماد» ولا يراه الطلاب حتى يعتمده مدير النظام أو من يملك صلاحية «اعتماد الاختبارات». مدير النظام ومن يملك الصلاحية يُنشرون مباشرة. الخيار مفعّل افتراضياً، ويُطبَّق على الخادم أيضاً.')}
          </span>
        </span>
      </label>

      <div className={`${card} space-y-2`}>
        <label className="block text-sm font-bold text-slate-900 dark:text-white">{t('رابط متابعة التحضير')}</label>
        <input aria-label={t('رابط متابعة التحضير')} dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        <p className="text-[11px] text-slate-500">{t('يفتح في تبويب جديد عند الضغط على زر «متابعة التحضير».')}</p>
      </div>

      <button onClick={save} disabled={busy} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-60">{t('حفظ الإعدادات')}</button>
    </div>
  );
};
