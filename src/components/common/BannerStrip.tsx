import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, ChevronDown, X, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Banner, BANNER_THEMES, isBannerVisible, HonorEntry, fetchHonorRoll, cachedHonor, honorKey } from '../../services/bannerService';
import { BannerEffects } from './BannerEffects';
import { uiDir, isEn, t } from '../../i18n';

const themeBg = (theme: string) => {
  const t = BANNER_THEMES[theme] || BANNER_THEMES.indigo;
  return { background: `linear-gradient(135deg, ${t.from}, ${t.to})` };
};

/** أسماء لوحة الشرف لإعدادات بانر (تُجلب مرة كل 10 دقائق) */
export function useHonorRoll(b: Banner | null | undefined): HonorEntry[] | null {
  const key = b?.kind === 'honor' ? honorKey(b.config) : '';
  const [list, setList] = useState<HonorEntry[] | null>(() => (key ? cachedHonor(b!.config) : null));
  useEffect(() => {
    if (!key) return setList(null);
    let alive = true;
    setList(cachedHonor(b!.config));
    void fetchHonorRoll(b!.config).then((l) => alive && setList(l));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return list;
}

/** غصن غار للزينة (لوحة الشرف) */
const Laurel: React.FC<{ color: string; flip?: boolean; className?: string }> = ({ color, flip, className }) => (
  <svg viewBox="0 0 40 80" className={className} aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M30 78 C 12 62, 8 32, 22 4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    {[[24, 68, -40], [17, 57, -55], [13, 45, -70], [12, 33, -85], [14, 21, -100], [19, 10, -115], [31, 61, 30], [24, 49, 15], [20, 37, 0], [19, 25, -15], [22, 14, -30]].map(([x, y, r], i) => (
      <ellipse key={i} cx={x} cy={y} rx="6.5" ry="2.8" fill={color} transform={`rotate(${r} ${x} ${y})`} />
    ))}
  </svg>
);

export type HonorDesign = 'gold' | 'stars' | 'paper' | 'theme' | 'image';
export const HONOR_DESIGNS: Record<HonorDesign, string> = {
  gold: 'ذهبي ملكي', stars: 'سماء النجوم', paper: 'شهادة كلاسيكية', theme: 'لون البانر', image: 'صورة من رفعك',
};
const STAR_DOTS = [
  'radial-gradient(1.5px 1.5px at 12px 18px, #fff 50%, transparent 51%)',
  'radial-gradient(1px 1px at 58px 44px, #fff 50%, transparent 51%)',
  'radial-gradient(2px 2px at 92px 12px, #fde68a 50%, transparent 51%)',
  'radial-gradient(1px 1px at 30px 86px, #fff 50%, transparent 51%)',
  'radial-gradient(1.5px 1.5px at 104px 96px, #fff 50%, transparent 51%)',
].join(', ');

/** مظهر كل تصميم: الخلفية، والعنوان، وبطاقة الاسم، ودائرة الميدالية */
const honorLook = (b: Banner, design: HonorDesign) => {
  const img = b.images[0]?.src;
  switch (design) {
    case 'gold':
      return {
        style: { background: 'radial-gradient(120% 90% at 50% 0%, #1e3a8a 0%, #0f1d3a 62%, #0a1328 100%)' } as React.CSSProperties,
        text: 'text-white', title: 'bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 bg-clip-text text-transparent',
        pill: 'bg-white/[0.07] ring-1 ring-amber-300/40', medal: 'bg-gradient-to-b from-amber-100 to-amber-400', laurel: '#fbbf24',
        frame: <><div className="absolute inset-2.5 rounded-[1.25rem] border-2 border-amber-300/60 pointer-events-none" /><div className="absolute inset-4 rounded-2xl border border-amber-300/25 pointer-events-none" /></>,
      };
    case 'stars':
      return {
        style: { backgroundImage: `${STAR_DOTS}, linear-gradient(160deg, #1e1b4b 0%, #4c1d95 55%, #831843 100%)`, backgroundSize: '120px 110px, 120px 110px, 120px 110px, 120px 110px, 120px 110px, 100% 100%' } as React.CSSProperties,
        text: 'text-white', title: 'text-white drop-shadow', pill: 'bg-white/10 ring-1 ring-white/25 backdrop-blur-sm', medal: 'bg-white/90', laurel: '#fde68a', frame: null,
      };
    case 'paper':
      return {
        style: { background: 'radial-gradient(circle at 50% 0%, #fffdf5 0%, #fdf3dc 100%)' } as React.CSSProperties,
        text: 'text-slate-800', title: 'text-amber-800', pill: 'bg-white ring-1 ring-amber-300 shadow-sm', medal: 'bg-amber-50 ring-1 ring-amber-300', laurel: '#b45309',
        frame: <div className="absolute inset-2.5 rounded-[1.25rem] border-4 border-double border-amber-600/60 pointer-events-none" />,
      };
    case 'image':
      return {
        style: img ? { backgroundImage: `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.55)), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' } : themeBg(b.theme),
        text: 'text-white', title: 'text-white drop-shadow', pill: 'bg-black/35 ring-1 ring-white/30 backdrop-blur-sm', medal: 'bg-white/90', laurel: '', frame: null,
      };
    default:
      return { style: themeBg(b.theme), text: 'text-white', title: 'text-white', pill: 'bg-white/15 ring-1 ring-white/25 backdrop-blur-sm', medal: 'bg-white/90', laurel: '', frame: null };
  }
};

/** كلما زاد عدد الأسماء صغُر الخط لتتسع المساحة */
const HONOR_TIERS = [
  { name: 'text-sm sm:text-base', sub: 'text-[11px] sm:text-xs', medal: 'w-8 h-8 text-base', pill: 'ps-2 pe-3 py-1.5 gap-2', gap: 'gap-2.5' },
  { name: 'text-xs sm:text-sm', sub: 'text-[10px] sm:text-[11px]', medal: 'w-7 h-7 text-sm', pill: 'ps-1.5 pe-2.5 py-1 gap-1.5', gap: 'gap-2' },
  { name: 'text-[11px] sm:text-xs', sub: 'text-[9px] sm:text-[10px]', medal: 'w-6 h-6 text-xs', pill: 'ps-1 pe-2 py-1 gap-1.5', gap: 'gap-1.5' },
  { name: 'text-[10px] sm:text-[11px]', sub: 'text-[9px]', medal: 'w-5 h-5 text-[10px]', pill: 'ps-1 pe-1.5 py-0.5 gap-1', gap: 'gap-1' },
];

/** «لوحة الشرف»: أسماء من حصلوا على «ممتاز» تلقائياً من جميع الفصول */
const HonorCard: React.FC<{ banner: Banner }> = ({ banner: b }) => {
  const list = useHonorRoll(b);
  const design = (b.config?.design as HonorDesign) || 'theme';
  const look = honorLook(b, design);
  const n = list?.length || 0;
  const tier = HONOR_TIERS[n <= 6 ? 0 : n <= 15 ? 1 : n <= 30 ? 2 : 3];
  return (
    <div className={`relative overflow-hidden rounded-3xl px-5 py-6 sm:px-8 sm:py-8 text-center shadow-lg ${look.text}`} style={look.style} data-testid="honor-banner" data-design={design}>
      {look.frame}
      <div className="relative flex items-center justify-center gap-2 sm:gap-4">
        {look.laurel && <Laurel color={look.laurel} className="w-6 h-12 sm:w-9 sm:h-[4.5rem] shrink-0" />}
        <div>
          <h2 className={`text-lg sm:text-3xl font-black leading-snug ${look.title}`}>{b.title || t('🏆 لوحة الشرف')}</h2>
          {b.body && <p className="text-xs sm:text-sm mt-1 opacity-90 leading-relaxed whitespace-pre-line">{b.body}</p>}
        </div>
        {look.laurel && <Laurel color={look.laurel} flip className="w-6 h-12 sm:w-9 sm:h-[4.5rem] shrink-0" />}
      </div>
      {list === null ? (
        <p className="relative text-xs mt-4 opacity-80">{t('جارٍ التحميل...')}</p>
      ) : list.length === 0 ? (
        <p className="relative text-xs mt-4 opacity-90">{t('لا توجد أسماء حالياً. يظهر البانر تلقائياً عند حصول أول طالب على «ممتاز».')}</p>
      ) : (
        <ul className={`relative grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center mt-5 max-h-[26rem] overflow-y-auto ${tier.gap}`}>
          {list.map((e, i) => (
            <li key={`${e.name}-${i}`} title={e.quiz ? `${e.quiz} — ${e.pct}%` : `${e.pct}%`}
              className={`min-w-0 flex items-center rounded-2xl ${tier.pill} ${look.pill}`}>
              <span className={`rounded-full flex items-center justify-center shrink-0 ${tier.medal} ${look.medal}`} aria-hidden>{i < 3 ? ['🥇', '🥈', '🥉'][i] : '⭐'}</span>
              <span className="min-w-0 text-start leading-tight">
                <span className={`block font-black ${tier.name}`}>{e.name}</span>
                {/* على الجوال: النسبة فقط حتى لا تُقصّ الأسماء */}
                <span className={`block opacity-85 ${tier.sub}`}>{e.class && <span className="hidden sm:inline">{e.class} • </span>}<span dir="ltr">{e.pct}%</span></span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** بانر واحد: صورة عريضة مع نص، أو معرض صور طلاب مع نص، أو لوحة الشرف التلقائية */
export const BannerCard: React.FC<{ banner: Banner }> = ({ banner: b }) => {
  if (b.kind === 'honor') return <HonorCard banner={b} />;
  const text = (b.title || b.body) && (
    <div>
      {b.title && <h2 className="text-lg sm:text-2xl font-black leading-snug">{b.title}</h2>}
      {b.body && <p className="text-xs sm:text-sm mt-1 opacity-95 leading-relaxed whitespace-pre-line">{b.body}</p>}
    </div>
  );

  if (b.kind === 'gallery') {
    return (
      <div className="rounded-3xl p-5 sm:p-7 text-white text-center shadow-lg" style={themeBg(b.theme)}>
        {text}
        {b.images.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-5">
            {b.images.map((img, i) => (
              <figure key={i} className="w-20 sm:w-28">
                <img src={img.src} alt={img.caption || b.title || t('صورة')}
                  className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl object-cover ring-4 ring-white/30 shadow-md mx-auto" />
                {img.caption && <figcaption className="text-[11px] sm:text-xs font-bold mt-2 leading-tight">{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
    );
  }

  const img = b.images[0];
  if (!img) {
    return <div className="rounded-3xl p-6 sm:p-8 text-white shadow-lg" style={themeBg(b.theme)}>{text}</div>;
  }
  // الصورة تظهر كاملة بنسبتها الطبيعية (دون قص)، بحد أقصى للارتفاع
  const image = <img src={img.src} alt={b.title || t('بانر')} className="block w-full h-auto max-h-[440px] object-cover" draggable={false} />;
  if (b.text_position === 'below' || !text) {
    return (
      <div className="rounded-3xl overflow-hidden shadow-lg bg-white dark:bg-slate-900">
        {image}
        {text && <div className="p-4 sm:p-5 text-white" style={themeBg(b.theme)}>{text}</div>}
      </div>
    );
  }
  return (
    <div className="rounded-3xl overflow-hidden shadow-lg">
      <div className="relative">
        {image}
        {/* على الشاشات الكبيرة: النص فوق الصورة */}
        <div className="hidden sm:block absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="hidden sm:block absolute bottom-0 inset-x-0 p-6 text-white">{text}</div>
      </div>
      {/* على الجوال الصورة العريضة قصيرة: النص تحتها */}
      <div className="sm:hidden p-4 text-white" style={themeBg(b.theme)}>{text}</div>
    </div>
  );
};

const DISMISS_KEY = 'itqan_banners_dismissed';
/** مدة عرض كل بانر قبل الانتقال للتالي */
const ROTATE_MS = 5000;

/** أنواع الانتقال بين البانرات (مثل انتقالات العروض التقديمية) */
export const BANNER_TRANSITIONS: Record<string, string> = {
  slide: 'انزلاق', fade: 'تلاشي', zoom: 'تكبير', flip: 'قلب', push: 'دفع لأعلى', wipe: 'مسح', blur: 'ضبابي', none: 'بدون',
};
const transitionClass = (tr: string, dir: 1 | -1) =>
  tr === 'none' ? '' : tr && tr !== 'slide' && BANNER_TRANSITIONS[tr] ? `bn-${tr}` : dir === 1 ? 'banner-in' : 'banner-in-rev';
/** فتح بانر محدد للتعديل في صفحة البانرات */
export const EDIT_BANNER_KEY = 'itqan_edit_banner_id';

/** شريط البانرات أعلى الصفحة الرئيسية (يتبدّل تلقائياً عند وجود أكثر من بانر) */
export const BannerStrip: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { currentUser, banners, deleteBanner, setCurrentView, settings } = useApp();
  const slider = settings.banner_slider || {};
  // لوحة الشرف: تُجلب أسماؤها، ولا تظهر ما دامت فارغة
  const [honorTick, setHonorTick] = useState(0);
  const honorKeys = banners.filter((b) => b.kind === 'honor' && currentUser && isBannerVisible(b, currentUser.role)).map((b) => honorKey(b.config)).join(',');
  useEffect(() => {
    if (!honorKeys) return;
    let alive = true;
    const load = () => banners.filter((b) => b.kind === 'honor').forEach((b) => void fetchHonorRoll(b.config).then(() => alive && setHonorTick((n) => n + 1)));
    load();
    const id = window.setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [honorKeys]);
  const allVisible = useMemo(
    () => (currentUser ? banners.filter((b) => isBannerVisible(b, currentUser.role) && (b.kind !== 'honor' || !!cachedHonor(b.config)?.length)).sort((a, b) => a.sort - b.sort || b.created_at.localeCompare(a.created_at)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [banners, currentUser, honorTick]
  );
  // الإخفاء يخص البانرات العادية فقط؛ البانر «الدائم» يبقى ظاهراً دائماً
  const signature = allVisible.filter((b) => !b.pinned).map((b) => `${b.id}:${b.updated_at}`).join('|');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) || '';
    } catch {
      return '';
    }
  });
  const visible = !!signature && dismissed === signature ? allVisible.filter((b) => b.pinned) : allVisible;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  // إيقاف مؤقت فقط أثناء وجود مؤشر الفأرة فوق البانر (لا عند اللمس في الجوال)
  const [hovering, setHovering] = useState(false);
  // الشريط المختصر: سطر واحد، والضغط يعرض البانر كاملاً (البانر «الدائم» يظهر كاملاً دائماً)
  const [expanded, setExpanded] = useState(false);
  const touchX = React.useRef<number | null>(null);
  const count = visible.length;
  const safeIndex = count ? index % count : 0;

  // مدة البانر الحالي: مدته الخاصة، أو المدة العامة من إعدادات البانرات
  const holdMs = Math.max(2, Math.min(120, Number(visible[safeIndex]?.duration_seconds) || Number(slider.seconds) || ROTATE_MS / 1000)) * 1000;
  // كل تغيير (تلقائي أو يدوي) يبدأ عدّاً جديداً، فيستمر التبديل بلا توقف
  useEffect(() => {
    if (count < 2 || hovering || expanded) return;
    const t = setTimeout(() => {
      setDir(1);
      setIndex((i) => (i + 1) % count);
    }, holdMs);
    return () => clearTimeout(t);
  }, [count, hovering, safeIndex, holdMs, expanded]);

  if (!count) return null;
  const current = visible[safeIndex];
  const go = (d: 1 | -1) => {
    setDir(d);
    setIndex((i) => (i + d + count) % count);
  };
  const isAdmin = currentUser?.role === 'admin';
  const dismiss = () => {
    setDismissed(signature);
    setIndex(0);
    setExpanded(false);
    try { localStorage.setItem(DISMISS_KEY, signature); } catch { /* ignore */ }
  };

  if (!current.pinned && !expanded) {
    const thumb = current.images[0]?.src;
    const honor = current.kind === 'honor' ? cachedHonor(current.config) || [] : null;
    const subtitle = honor
      ? honor.slice(0, 6).map((e) => e.name).join('، ') + (honor.length > 6 ? ` ${t('و{n} آخرين', { n: honor.length - 6 })}` : '')
      : current.body;
    const bt = BANNER_THEMES[current.theme] || BANNER_THEMES.indigo;
    return (
      <section className={embedded ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4'} dir={uiDir()} aria-label={t('إعلانات المدرسة')} data-testid="banner-compact"
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHovering(false)}>
        <div className="flex items-center gap-2 rounded-2xl ps-2 pe-1.5 py-1.5 text-white shadow-sm" style={{ background: `linear-gradient(90deg, ${bt.from}, ${bt.to})` }}>
          <button type="button" onClick={() => setExpanded(true)} className="flex-1 min-w-0 flex items-center gap-2.5 text-start rounded-xl px-1 py-0.5 hover:bg-white/10" aria-label={t('عرض الإعلان كاملاً')}>
            {thumb ? <img src={thumb} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 ring-1 ring-white/30" /> : <span className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0" aria-hidden>{honor ? '🏆' : '📣'}</span>}
            <span key={`${current.id}-${safeIndex}`} className="min-w-0 flex-1 banner-in">
              <span className="block text-sm font-black truncate">{current.title || (honor ? t('🏆 لوحة الشرف') : t('إعلان'))}</span>
              {subtitle && <span className="block text-xs opacity-90 truncate">{subtitle}</span>}
            </span>
            <ChevronDown className="w-4 h-4 opacity-80 shrink-0" />
          </button>
          {count > 1 && (
            <span className="flex items-center shrink-0">
              <button type="button" aria-label={t('السابق')} onClick={() => go(-1)} className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center"><ChevronRight className="w-4 h-4 dir-icon" /></button>
              <span className="text-[11px] tabular-nums opacity-90">{safeIndex + 1}/{count}</span>
              <button type="button" aria-label={t('التالي')} onClick={() => go(1)} className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center"><ChevronLeft className="w-4 h-4 dir-icon" /></button>
            </span>
          )}
          <button type="button" aria-label={t('إخفاء الإعلانات')} title={t('إخفاء حتى يُنشر إعلان جديد')} onClick={dismiss} className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
        </div>
      </section>
    );
  }

  return (
    <section className={embedded ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6'} dir={uiDir()} aria-label={t('إعلانات المدرسة')}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovering(false)}>
      <div className="relative">
      <div
        className="relative overflow-hidden rounded-3xl"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null || count < 2) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          // في الواجهة العربية: السحب لليمين = التالي (وفي الإنجليزية العكس)
          if (Math.abs(dx) > 40) go((dx > 0) !== isEn() ? 1 : -1);
        }}
      >
        <div key={`${current.id}-${safeIndex}`} className={transitionClass(slider.transition || 'slide', dir)} data-transition={slider.transition || 'slide'}>
          <BannerCard banner={current} />
        </div>
        <div className="absolute top-3 end-3 flex items-center gap-1.5">
          {isAdmin && (
            <>
              <button type="button" aria-label={t('تعديل البانر')} title={t('تعديل البانر')}
                onClick={() => {
                  try { sessionStorage.setItem(EDIT_BANNER_KEY, current.id); } catch { /* ignore */ }
                  setCurrentView('banners');
                }}
                className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
                <Pencil className="w-4 h-4" />
              </button>
              <button type="button" aria-label={t('حذف البانر')} title={t('حذف البانر')}
                onClick={() => window.confirm(t('حذف البانر «{title}» نهائياً؟', { title: current.title || t('بدون عنوان') })) && void deleteBanner(current.id)}
                className="p-1.5 rounded-full bg-black/30 hover:bg-rose-600 text-white backdrop-blur-sm">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {!current.pinned && (
            <button type="button" aria-label={t('تصغير الإعلان')} title={t('تصغير')} onClick={() => setExpanded(false)}
              className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
              <ChevronDown className="w-4 h-4 rotate-180" />
            </button>
          )}
          {!current.pinned && (
            <button type="button" aria-label={t('إخفاء البانر')} title={t('إخفاء')} onClick={dismiss}
              className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {count > 1 && (
          <>
            <button type="button" aria-label={t('السابق')} onClick={() => go(-1)}
              className="absolute top-1/2 start-3 -translate-y-1/2 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
              <ChevronRight className="w-5 h-5 dir-icon" />
            </button>
            <button type="button" aria-label={t('التالي')} onClick={() => go(1)}
              className="absolute top-1/2 end-3 -translate-y-1/2 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
              <ChevronLeft className="w-5 h-5 dir-icon" />
            </button>
          </>
        )}
      </div>
      <BannerEffects effect={current.effect} playKey={`${current.id}-${current.updated_at}-${safeIndex}`} />
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {visible.map((b, i) => (
            <button key={b.id} type="button" aria-label={t('البانر {n}', { n: i + 1 })}
              onClick={() => { setDir(i > safeIndex ? 1 : -1); setIndex(i); }}
              className={`h-2 rounded-full transition-all duration-300 ${i === safeIndex ? 'w-6 bg-indigo-600' : 'w-2 bg-slate-300 dark:bg-slate-600'}`} />
          ))}
        </div>
      )}
    </section>
  );
};
