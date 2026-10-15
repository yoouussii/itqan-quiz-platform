import React, { useEffect, useState } from 'react';
import { Smartphone, Download, Share, PlusSquare, BellRing, CheckCircle2, MoreVertical, Monitor, LogIn } from 'lucide-react';
import { canInstall, onInstallChange, promptInstall, isStandalone } from '../../services/pushService';
import { loadSettings, syncPublicBranding } from '../../services/settingsService';
import { t, uiDir } from '../../i18n';

type Device = 'iphone' | 'android' | 'desktop';
const detect = (): Device => {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
};

const Step: React.FC<{ n: number; icon: React.ElementType; title: string; text?: string }> = ({ n, icon: Icon, title, text }) => (
  <li className="flex gap-3">
    <span className="w-8 h-8 shrink-0 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center">{n}</span>
    <div className="flex-1 pt-0.5">
      <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5"><Icon className="w-4 h-4 text-indigo-600 shrink-0" />{title}</p>
      {text && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{text}</p>}
    </div>
  </li>
);

/** صفحة عامة: «نزّل المنصة على جوالك» — التثبيت كتطبيق وتفعيل الإشعارات، لكل نوع جهاز */
export const InstallPage: React.FC = () => {
  const [device, setDevice] = useState<Device>(detect);
  const [settings, setSettings] = useState(loadSettings);
  const [installable, setInstallable] = useState(canInstall());
  const installed = isStandalone();

  useEffect(() => {
    void syncPublicBranding().then((changed) => changed && setSettings(loadSettings()));
    return onInstallChange(() => setInstallable(canInstall()));
  }, []);

  const school = settings.school_name || t('منصة إتقان');
  const logo = settings.school_logo || '/itqan-logo.png';
  const tabs: Array<[Device, string, React.ElementType]> = [['iphone', t('آيفون'), Smartphone], ['android', t('أندرويد'), Smartphone], ['desktop', t('كمبيوتر'), Monitor]];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4" dir={uiDir()}>
      <div className="max-w-lg mx-auto space-y-5">
        <header className="text-center space-y-2">
          <img src={logo} alt="" className="w-16 h-16 mx-auto rounded-2xl object-contain bg-white shadow" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{t('نزّل {school} على جوالك', { school })}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('تفتح بضغطة من الشاشة الرئيسية مثل أي تطبيق، وتصلك إشعارات الاختبارات الجديدة والنتائج.')}</p>
        </header>

        {installed ? (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold">{t('المنصة مثبّتة على هذا الجهاز ✓')}</p>
              <p className="text-sm">{t('سجّل دخولك، ثم فعّل الإشعارات من صفحة «الإشعارات».')}</p>
            </div>
          </div>
        ) : installable && (
          <button type="button" onClick={() => void promptInstall()} data-testid="install-now"
            className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-black shadow-lg inline-flex items-center justify-center gap-2">
            <Download className="w-6 h-6" />{t('ثبّت التطبيق الآن')}
          </button>
        )}

        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800" role="tablist">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={device === k} onClick={() => setDevice(k)}
              className={`h-10 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 ${device === k ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4" data-testid={`steps-${device}`}>
          <h2 className="font-black text-slate-900 dark:text-white">{t('١) تثبيت المنصة')}</h2>
          {device === 'iphone' && (
            <ol className="space-y-4">
              <Step n={1} icon={Smartphone} title={t('افتح الرابط من Safari')} text={t('يجب فتحه من Safari تحديداً (وليس من واتساب أو كروم). إن فتحته من واتساب: اضغط زر المشاركة أو النقاط واختر «فتح في Safari».')} />
              <Step n={2} icon={Share} title={t('اضغط زر المشاركة')} text={t('المربع الذي يخرج منه سهم لأعلى، أسفل الشاشة.')} />
              <Step n={3} icon={PlusSquare} title={t('اختر «إضافة إلى الشاشة الرئيسية»')} text={t('مرّر القائمة لأسفل حتى تجدها، ثم اضغط «إضافة».')} />
              <Step n={4} icon={CheckCircle2} title={t('افتح المنصة من الأيقونة الجديدة')} text={t('مهم: لا تعمل الإشعارات على الآيفون إلا عند فتح المنصة من الأيقونة (iOS 16.4 أو أحدث).')} />
            </ol>
          )}
          {device === 'android' && (
            <ol className="space-y-4">
              <Step n={1} icon={Smartphone} title={t('افتح الرابط من Chrome')} text={t('إن فتحته من واتساب: اضغط النقاط الثلاث واختر «فتح في Chrome».')} />
              <Step n={2} icon={Download} title={t('اضغط «تثبيت التطبيق»')} text={t('يظهر زر التثبيت أعلى الصفحة أو في شريط أسفل الشاشة.')} />
              <Step n={3} icon={MoreVertical} title={t('أو من القائمة ⋮')} text={t('إن لم يظهر الزر: النقاط الثلاث أعلى Chrome ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».')} />
            </ol>
          )}
          {device === 'desktop' && (
            <ol className="space-y-4">
              <Step n={1} icon={Monitor} title={t('افتح الرابط من Chrome أو Edge')} />
              <Step n={2} icon={Download} title={t('اضغط أيقونة التثبيت في شريط العنوان')} text={t('أيقونة شاشة صغيرة عليها سهم بجانب الرابط، أو من القائمة ← «تثبيت».')} />
            </ol>
          )}
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h2 className="font-black text-slate-900 dark:text-white">{t('٢) تفعيل الإشعارات')}</h2>
          <ol className="space-y-4">
            <Step n={1} icon={LogIn} title={t('سجّل دخولك في المنصة')} text={device === 'iphone' ? t('من الأيقونة على الشاشة الرئيسية، وليس من Safari.') : undefined} />
            <Step n={2} icon={BellRing} title={t('اضغط «تفعيل» في تنبيه الإشعارات')} text={t('يظهر في الصفحة الرئيسية، أو من صفحة «الإشعارات» ← «هذا الجهاز».')} />
            <Step n={3} icon={CheckCircle2} title={t('اختر «سماح» عندما يسألك الجوال')} text={t('إن ضغطت «رفض» بالخطأ: فعّلها من إعدادات الجوال ← الإشعارات ← المنصة.')} />
          </ol>
        </section>

        <a href="/" className="block w-full h-12 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-center leading-[3rem]">{t('الذهاب لتسجيل الدخول')}</a>
      </div>
    </div>
  );
};
