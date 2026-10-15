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

/** «لوحة الشرف»: أسماء من حصلوا على «ممتاز» تلقائياً من جميع الفصول */
const HonorCard: React.FC<{ banner: Banner }> = ({ banner: b }) => {
  const list = useHonorRoll(b);
  return (
    <div className="rounded-3xl p-5 sm:p-7 text-white text-center shadow-lg" style={themeBg(b.theme)} data-testid="honor-banner">
      <h2 className="text-lg sm:text-2xl font-black leading-snug">{b.title || t('🏆 لوحة الشرف')}</h2>
      {b.body && <p className="text-xs sm:text-sm mt-1 opacity-95 leading-relaxed whitespace-pre-line">{b.body}</p>}
      {list === null ? (
        <p className="text-xs mt-4 opacity-80">{t('جارٍ التحميل...')}</p>
      ) : list.length === 0 ? (
        <p className="text-xs mt-4 opacity-90">{t('لا توجد أسماء حالياً. يظهر البانر تلقائياً عند حصول أول طالب على «ممتاز».')}</p>
      ) : (
        <ul className="flex flex-wrap justify-center gap-2 sm:gap-2.5 mt-5 max-h-64 overflow-y-auto">
          {list.map((e, i) => (
            <li key={`${e.name}-${i}`} title={e.quiz ? `${e.quiz} — ${e.pct}%` : `${e.pct}%`}
              className="flex items-center gap-2 rounded-2xl bg-white/15 ring-1 ring-white/25 ps-2 pe-3 py-1.5 backdrop-blur-sm">
              <span className="w-8 h-8 rounded-full bg-white/90 text-amber-600 flex items-center justify-center text-base shrink-0" aria-hidden>{i < 3 ? ['🥇', '🥈', '🥉'][i] : '⭐'}</span>
              <span className="text-start leading-tight">
                <span className="block text-sm font-black">{e.name}</span>
                <span className="block text-[11px] opacity-90">{[e.class, `${e.pct}%`].filter(Boolean).join(' • ')}</span>
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
