import React, { useRef, useState } from 'react';
import { Settings, ImagePlus, Trash2, Check, Wrench, LogIn } from 'lucide-react';
import { LoginHero, LOGIN_STYLES, LoginStyle } from '../auth/LoginHero';
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
  // شاشة الدخول (019)
  const [loginStyle, setLoginStyle] = useState<LoginStyle>((LOGIN_STYLES.find((x) => x.id === settings.login_style)?.id || 'classic') as LoginStyle);
  const [loginImage, setLoginImage] = useState(settings.login_image || '');
  const [tagline, setTagline] = useState(settings.login_tagline || '');
  const [loginTitle, setLoginTitle] = useState(settings.login_title || '');
  const [loginLogo, setLoginLogo] = useState(settings.login_logo || '');
  const [loginLogo2, setLoginLogo2] = useState(settings.login_logo2 || '');
  const logo1Ref = useRef<HTMLInputElement>(null);
  const logo2Ref = useRef<HTMLInputElement>(null);
  const pickLoginLogo = async (file: File | undefined, set: (v: string) => void) => {
    if (!file) return;
    try {
      const data = await resizeLogo(file, 480);
      if (data.length > 400_000) return alert(t('الصورة كبيرة جداً بعد التصغير، جرّب شعاراً أبسط أو بصيغة PNG'));
      set(data);
    } catch (e: any) { alert(e?.message || t('تعذرت قراءة الصورة')); }
  };
  const loginDraft = { login_title: loginTitle.trim(), login_logo: loginLogo, login_logo2: loginLogo2, login_tagline: tagline.trim(), login_image: loginImage };
  const photoRef = useRef<HTMLInputElement>(null);
  // وضع الصيانة (019)
  const [mMessage, setMMessage] = useState(settings.maintenance?.message || '');
  const [mUntil, setMUntil] = useState(settings.maintenance?.until || '');
  const maintenanceOn = !!settings.maintenance?.on;
  const toggleMaintenance = async () => {
    if (!maintenanceOn && !window.confirm(t('تفعيل الصيانة سيُخرج كل المستخدمين فوراً (عدا مدير النظام)، ولن يستطيع أحد الدخول حتى تُوقفها. متابعة؟'))) return;
    setBusy(true);
    await updateSettings({ maintenance: { on: !maintenanceOn, message: mMessage.trim(), until: mUntil } });
    setBusy(false);
  };
  const pickPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const data = await resizeLogo(file, 1600, 'image/jpeg');
      if (data.length > 700_000) return alert(t('الصورة كبيرة جداً، اختر صورة أصغر'));
      setLoginImage(data);
    } catch (e: any) { alert(e?.message || t('تعذرت قراءة الصورة')); }
  };

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
      login_style: loginStyle,
      login_image: loginImage,
      login_tagline: tagline.trim(),
      login_title: loginTitle.trim(),
      login_logo: loginLogo,
      login_logo2: loginLogo2,
      ...(maintenanceOn ? { maintenance: { on: true, message: mMessage.trim(), until: mUntil } } : {}),
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

      <section className={`${card} space-y-4`} aria-labelledby="login-title">
        <div>
          <h2 id="login-title" className="text-base font-bold text-slate-900 dark:text-white inline-flex items-center gap-2"><LogIn className="w-5 h-5 text-indigo-600" />{t('تصميم شاشة الدخول')}</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">{t('الجزء الجانبي الذي يراه الجميع قبل تسجيل الدخول (على الشاشات الكبيرة).')}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label={t('تصميم شاشة الدخول')}>
          {LOGIN_STYLES.map((s) => {
            const on = loginStyle === s.id;
            return (
              <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setLoginStyle(s.id)}
                className={`text-start rounded-2xl border overflow-hidden transition ${on ? 'border-indigo-600 ring-2 ring-indigo-500/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                <div className="relative h-36 overflow-hidden bg-slate-100 dark:bg-slate-800 pointer-events-none" aria-hidden>
                  <div className="absolute top-0 start-0 w-[720px] h-[520px] origin-top-left rtl:origin-top-right" style={{ transform: 'scale(0.38)' }}>
                    <LoginHero style={s.id} preview draft={loginDraft} />
                  </div>
                </div>
                <div className="p-3">
                  <span className="flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">{t(s.label)}{on && <Check className="w-4 h-4 text-indigo-600" />}</span>
                  <span className="block text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{t(s.hint)}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-name" className="block text-sm font-bold text-slate-900 dark:text-white">{t('اسم المدرسة في شاشة الدخول')}</label>
          <input id="login-name" value={loginTitle} onChange={(e) => setLoginTitle(e.target.value)} maxLength={90} placeholder={settings.cert_school_name || settings.school_name || t('مثال: مدارس المستقبل الأهلية – فرع الشمال')}
            className="w-full h-11 px-3 text-[15px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('اتركه فارغاً لاستخدام اسم المدرسة من الشهادات أو هوية المدرسة. مفيد للفروع.')}</p>
        </div>
        <div className="space-y-1.5">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">{t('شعارا شاشة الدخول (اختياري)')}</span>
          <div className="flex flex-wrap gap-4">
            {([[loginLogo, setLoginLogo, logo1Ref, 'الشعار الأول'], [loginLogo2, setLoginLogo2, logo2Ref, 'الشعار الثاني']] as const).map(([val, set, ref, label]) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-20 h-16 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden">
                  {val ? <img src={val} alt={t(label)} className="max-w-full max-h-full object-contain" /> : <ImagePlus className="w-6 h-6 text-slate-400" />}
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => ref.current?.click()} className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">{val ? t('تغيير') : t(label)}</button>
                  {val && <button type="button" onClick={() => set('')} className="h-7 px-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">{t('إزالة')}</button>}
                </div>
                <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" aria-label={t(label)} onChange={(e) => { void pickLoginLogo(e.target.files?.[0], set); e.target.value = ''; }} />
              </div>
            ))}
          </div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('بدونهما تُستخدم شعارات الشهادات. يظهران في شاشة الدخول وصفحة الصيانة.')}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-tagline" className="block text-sm font-bold text-slate-900 dark:text-white">{t('العبارة تحت اسم المدرسة')}</label>
          <input id="login-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={90} placeholder={t('منصة الاختبارات والتقييم')}
            className="w-full h-11 px-3 text-[15px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        </div>
        {loginStyle === 'photo' && (
          <div className="space-y-1.5">
            <span className="block text-sm font-bold text-slate-900 dark:text-white">{t('صورة شاشة الدخول')}</span>
            <div className="flex items-center gap-3">
              <div className="w-32 h-20 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                {loginImage ? <img src={loginImage} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6 text-slate-400" />}
              </div>
              <button type="button" onClick={() => photoRef.current?.click()} className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">{loginImage ? t('تغيير الصورة') : t('رفع صورة')}</button>
              {loginImage && <button type="button" onClick={() => setLoginImage('')} className="h-10 px-3 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">{t('إزالة')}</button>}
              <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t('صورة شاشة الدخول')} onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('صورة عرضية واضحة (مبنى المدرسة أو فصل دراسي). تُصغَّر تلقائياً.')}</p>
          </div>
        )}
      </section>

      <section className={`${card} space-y-3 ${maintenanceOn ? '!border-rose-300 dark:!border-rose-800' : ''}`} aria-labelledby="maint-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="maint-title" className="text-base font-bold text-slate-900 dark:text-white inline-flex items-center gap-2"><Wrench className="w-5 h-5 text-amber-600" />{t('وضع الصيانة')}</h2>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">{t('أثناء الصيانة لا يدخل إلا مدير النظام، وباقي المستخدمين يرون صفحة «الموقع تحت الصيانة».')}</p>
          </div>
          <button type="button" role="switch" aria-checked={maintenanceOn} aria-label={t('وضع الصيانة')} onClick={() => void toggleMaintenance()} disabled={busy}
            className={`shrink-0 w-14 h-8 rounded-full p-1 flex transition ${maintenanceOn ? 'bg-rose-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}>
            <span className="block w-6 h-6 rounded-full bg-white shadow" />
          </button>
        </div>
        <textarea aria-label={t('رسالة الصيانة')} value={mMessage} onChange={(e) => setMMessage(e.target.value)} rows={2} maxLength={300}
          placeholder={t('نعمل على تحسين المنصة، وسنعود قريباً. شكراً لصبركم.')}
          className="w-full p-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">{t('موعد العودة المتوقع (اختياري)')}
          <input type="datetime-local" value={mUntil} onChange={(e) => setMUntil(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        </label>
        {maintenanceOn && <p role="status" className="text-sm font-bold text-rose-700 dark:text-rose-400">{t('الصيانة مفعّلة الآن. عدّل الرسالة ثم «حفظ الإعدادات»، أو أوقفها من المفتاح.')}</p>}
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
        <label className="block text-sm font-bold text-slate-900 dark:text-white">{t('رابط متابعة تحضير مزن')}</label>
        <input aria-label={t('رابط متابعة تحضير مزن')} dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        <p className="text-[11px] text-slate-500">{t('يفتح في تبويب جديد عند الضغط على زر «متابعة تحضير مزن».')}</p>
      </div>

      <button onClick={save} disabled={busy} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-60">{t('حفظ الإعدادات')}</button>
    </div>
  );
};
