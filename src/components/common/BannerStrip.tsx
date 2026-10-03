import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, X, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Banner, BANNER_THEMES, isBannerVisible } from '../../services/bannerService';
import { BannerEffects } from './BannerEffects';
import { uiDir, isEn, t } from '../../i18n';

const themeBg = (theme: string) => {
  const t = BANNER_THEMES[theme] || BANNER_THEMES.indigo;
  return { background: `linear-gradient(135deg, ${t.from}, ${t.to})` };
};

/** بانر واحد: صورة عريضة مع نص، أو معرض صور طلاب مع نص */
export const BannerCard: React.FC<{ banner: Banner }> = ({ banner: b }) => {
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
/** فتح بانر محدد للتعديل في صفحة البانرات */
export const EDIT_BANNER_KEY = 'itqan_edit_banner_id';

/** شريط البانرات أعلى الصفحة الرئيسية (يتبدّل تلقائياً عند وجود أكثر من بانر) */
export const BannerStrip: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { currentUser, banners, deleteBanner, setCurrentView } = useApp();
  const allVisible = useMemo(
    () => (currentUser ? banners.filter((b) => isBannerVisible(b, currentUser.role)).sort((a, b) => a.sort - b.sort || b.created_at.localeCompare(a.created_at)) : []),
    [banners, currentUser]
  );
  // الإخفاء يخص البانرات العادية فقط؛ البانر «الدائم» يبقى ظاهراً دائماً
  const signature = allVisible.filter((b) => !b.pinned).map((b) => `${b.id}:${b.updated_at}`).join('|');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) || '';
    } catch {
      return '';
    }
  });
  const visible = !!signature && dismissed === signature ? allVisible.filter((b) => b.pinned) : allVisible;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  // إيقاف مؤقت فقط أثناء وجود مؤشر الفأرة فوق البانر (لا عند اللمس في الجوال)
  const [hovering, setHovering] = useState(false);
  const touchX = React.useRef<number | null>(null);
  const count = visible.length;
  const safeIndex = count ? index % count : 0;

  // كل تغيير (تلقائي أو يدوي) يبدأ عدّاً جديداً، فيستمر التبديل بلا توقف
  useEffect(() => {
    if (count < 2 || hovering) return;
    const t = setTimeout(() => {
      setDir(1);
      setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [count, hovering, safeIndex]);

  if (!count) return null;
  const current = visible[safeIndex];
  const go = (d: 1 | -1) => {
    setDir(d);
    setIndex((i) => (i + d + count) % count);
  };
  const isAdmin = currentUser?.role === 'admin';

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
        <div key={`${current.id}-${safeIndex}`} className={dir === 1 ? 'banner-in' : 'banner-in-rev'}>
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
            <button type="button" aria-label={t('إخفاء البانر')} title={t('إخفاء')}
              onClick={() => {
                setDismissed(signature);
                setIndex(0);
                try { sessionStorage.setItem(DISMISS_KEY, signature); } catch { /* ignore */ }
              }}
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
