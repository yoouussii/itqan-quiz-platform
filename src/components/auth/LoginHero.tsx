import React from 'react';
import { Check, Timer, Award, BarChart3, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { greeting } from '../common/ui';
import { t, isEn } from '../../i18n';
import type { AppSettings } from '../../services/settingsService';

/** تصاميم الجزء الجانبي لشاشة الدخول (يختارها المدير من الإعدادات) */
export type LoginStyle = 'classic' | 'identity' | 'showcase' | 'pattern' | 'photo' | 'minimal';
export const LOGIN_STYLES: Array<{ id: LoginStyle; label: string; hint: string }> = [
  { id: 'identity', label: 'هوية المدرسة', hint: 'شعارات المدرسة واسمها على خلفية هادئة بلونها' },
  { id: 'showcase', label: 'عرض المنصة', hint: 'بطاقات توضح ما في المنصة: اختبار، نتيجة، شهادة' },
  { id: 'pattern', label: 'زخرفة وترحيب', hint: 'زخرفة إسلامية مع ترحيب حسب الوقت والتاريخ الهجري' },
  { id: 'photo', label: 'صورة المدرسة', hint: 'صورة يرفعها المدير (مبنى المدرسة مثلاً) مع اسمها' },
  { id: 'minimal', label: 'بسيط', hint: 'نموذج الدخول فقط في المنتصف بلا جزء جانبي' },
  { id: 'classic', label: 'الحالي', hint: 'التصميم الحالي بالمميزات الثلاث' },
];

const DEFAULT_TAGLINE = 'منصة الاختبارات والتقييم';

const hijriToday = () => {
  try {
    return new Intl.DateTimeFormat(isEn() ? 'en-u-ca-islamic-umalqura' : 'ar-SA-u-ca-islamic-umalqura-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return '';
  }
};

/** زخرفة نجمة ثمانية متكررة بلون أبيض شفاف */
const PATTERN = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="1.4"><path d="M32 6l7.5 18.5L58 32l-18.5 7.5L32 58l-7.5-18.5L6 32l18.5-7.5z"/><rect x="18" y="18" width="28" height="28" transform="rotate(45 32 32)"/><circle cx="32" cy="32" r="6"/></g></svg>'
)}")`;

export const LoginHero: React.FC<{ style: LoginStyle; preview?: boolean; draft?: Partial<AppSettings> }> = ({ style, preview = false, draft }) => {
  const app = useApp();
  // المعاينة في الإعدادات تعرض القيم قبل حفظها
  const settings = draft ? { ...app.settings, ...draft } : app.settings;
  const school = settings.login_title || settings.cert_school_name || settings.school_name || '';
  const tagline = settings.login_tagline || t(DEFAULT_TAGLINE);
  // شعارا شاشة الدخول إن حدّدهما المدير، وإلا شعارا الشهادات
  const custom = [settings.login_logo, settings.login_logo2].filter(Boolean) as string[];
  const logos = custom.length ? custom : ([settings.cert_school_logo || settings.school_logo, settings.cert_company_logo].filter(Boolean) as string[]);

  if (style === 'minimal') return preview ? (
    <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="w-[60%] h-[70%] rounded-3xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 p-10 space-y-5">
        <div className="h-8 w-40 rounded-lg bg-slate-200 dark:bg-slate-700" /><div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800" /><div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800" /><div className="h-12 rounded-xl bg-indigo-600" />
      </div>
    </div>
  ) : null;
  const base = preview ? 'flex h-full relative overflow-hidden flex-col justify-center' : 'hidden lg:flex relative overflow-hidden flex-col justify-center';

  if (style === 'identity') {
    return (
      <div className={`${base} items-center text-center px-14 bg-indigo-50 dark:bg-slate-900`} data-login-style="identity">
        <span className="pointer-events-none absolute -top-24 -end-24 w-96 h-96 rounded-full bg-indigo-100 dark:bg-indigo-950/60" />
        <span className="pointer-events-none absolute -bottom-32 -start-20 w-[28rem] h-[28rem] rounded-full bg-indigo-100/70 dark:bg-indigo-950/40" />
        <div className="relative space-y-8 max-w-lg">
          {logos.length > 0 && (
            <div className="flex items-center justify-center gap-8">
              {logos.map((l) => <img key={l.slice(0, 40)} src={l} alt="" className="h-36 max-w-[14rem] object-contain drop-shadow-sm" />)}
            </div>
          )}
          <div className="space-y-3">
            {school && <h2 className="text-[34px] font-extrabold leading-snug text-slate-900 dark:text-white">{school}</h2>}
            <p className="text-lg text-slate-600 dark:text-slate-300">{tagline}</p>
          </div>
          <div className="mx-auto w-24 h-1.5 rounded-full bg-indigo-600" />
        </div>
      </div>
    );
  }

  if (style === 'showcase') {
    const card = 'rounded-2xl bg-white text-slate-900 shadow-xl shadow-indigo-950/20';
    return (
      <div className={`${base} px-14 xl:px-20 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white gap-10`} data-login-style="showcase">
        <div className="relative space-y-3">
          <h2 className="text-[38px] font-extrabold leading-tight">{school || t('اختبارات المدرسة في مكان واحد')}</h2>
          <p className="text-lg text-white/85">{tagline}</p>
        </div>
        <div className="relative h-[330px]">
          <div className={`${card} absolute top-0 start-0 w-[290px] p-5 space-y-3 rotate-[-2deg]`}>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>{t('الرياضيات')}</span><span className="inline-flex items-center gap-1 text-amber-600"><Timer className="w-3.5 h-3.5" />12:40</span></div>
            <p className="font-bold">{t('ما ناتج 12 × 8؟')}</p>
            {['86', '96', '108'].map((o, i) => (
              <div key={o} className={`h-9 rounded-lg border px-3 flex items-center text-sm font-semibold ${i === 1 ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}>{o}</div>
            ))}
          </div>
          <div className={`${card} absolute top-16 end-0 w-[200px] p-5 text-center rotate-[3deg]`}>
            <div className="relative w-24 h-24 mx-auto">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="4" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="#16a34a" strokeWidth="4" strokeDasharray="89 100" strokeLinecap="round" /></svg>
              <span className="absolute inset-0 flex items-center justify-center text-2xl font-black">92%</span>
            </div>
            <p className="mt-2 text-sm font-bold text-emerald-700">{t('ممتاز! نتيجة فورية')}</p>
          </div>
          <div className={`${card} absolute bottom-0 start-16 w-[260px] p-4 flex items-center gap-3 rotate-[1deg]`}>
            <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><Award className="w-6 h-6" /></span>
            <div><p className="font-bold text-sm">{t('شهادة تفوق')}</p><p className="text-xs text-slate-500">{t('تصدر وتُطبع بهوية المدرسة')}</p></div>
          </div>
          <div className={`${card} absolute bottom-6 end-6 w-[150px] p-3 flex items-end gap-1.5 h-[88px]`} aria-hidden>
            <BarChart3 className="w-4 h-4 text-indigo-600 self-start" />
            {[40, 65, 50, 80, 72].map((h, i) => <span key={i} className="flex-1 rounded-t bg-indigo-500" style={{ height: `${h}%` }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'pattern') {
    return (
      <div className={`${base} items-center text-center px-14 bg-indigo-700 text-white`} style={{ backgroundImage: PATTERN, backgroundSize: '64px 64px' }} data-login-style="pattern">
        <div className="relative max-w-lg space-y-6 rounded-[2rem] bg-indigo-900/35 backdrop-blur-sm px-10 py-12 ring-1 ring-white/15">
          {logos[0] && <img src={logos[0]} alt="" className="h-24 mx-auto object-contain rounded-2xl bg-white p-3" />}
          <p className="text-[42px] font-extrabold leading-tight">{greeting()} <Sparkles className="inline w-8 h-8 text-amber-300 -mt-2" /></p>
          {school && <p className="text-xl font-bold text-white/95">{school}</p>}
          <p className="text-base text-white/85">{tagline}</p>
          <p className="text-sm text-amber-200 font-semibold">{hijriToday()}</p>
        </div>
      </div>
    );
  }

  if (style === 'photo') {
    const img = settings.login_image;
    return (
      <div className={`${base} justify-end p-14 text-white ${img ? '' : 'bg-gradient-to-br from-indigo-500 to-indigo-900'}`} style={img ? { backgroundImage: `url("${img}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} data-login-style="photo">
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
        <div className="relative space-y-3">
          {logos[0] && <img src={logos[0]} alt="" className="h-16 object-contain rounded-xl bg-white/95 p-2" />}
          <h2 className="text-[36px] font-extrabold leading-tight">{school || t('اختبارات المدرسة في مكان واحد')}</h2>
          <p className="text-lg text-white/85">{tagline}</p>
        </div>
      </div>
    );
  }

  // التصميم الحالي
  return (
    <div className={`${base} bg-indigo-600 text-white px-16 xl:px-24 gap-7`} data-login-style="classic">
      <span className="pointer-events-none absolute -end-20 -top-20 w-80 h-80 rounded-full border-[48px]" style={{ borderColor: 'rgba(255,255,255,.07)' }} />
      <span className="pointer-events-none absolute start-16 -bottom-28 w-64 h-64 rounded-[40px] rotate-[24deg] bg-white/[0.06]" />
      <h2 className="relative text-[44px] font-extrabold leading-[1.35]">{t('اختبارات المدرسة')}<br />{t('في مكان واحد')}</h2>
      <ul className="relative space-y-4 text-[17px]">
        {[t('اختبارات إلكترونية بنتيجة فورية'), t('نقاط وأوسمة تحفّز الطلاب'), t('تقارير دقيقة للمعلم والإدارة')].map((item) => (
          <li key={item} className="flex items-center gap-3"><Check className="w-[22px] h-[22px] text-amber-300" strokeWidth={2.5} />{item}</li>
        ))}
      </ul>
      <p className="relative text-[13px] text-white/80">{t('منظومة الاختبارات والتقييم الذكي')}</p>
    </div>
  );
};
