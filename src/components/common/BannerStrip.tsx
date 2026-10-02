import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Banner, BANNER_THEMES, isBannerVisible } from '../../services/bannerService';

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
                <img src={img.src} alt={img.caption || b.title || 'صورة'}
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
  if (b.text_position === 'below' || !text) {
    return (
      <div className="rounded-3xl overflow-hidden shadow-lg bg-white dark:bg-slate-900">
        <img src={img.src} alt={b.title || 'بانر'} className="w-full h-40 sm:h-64 lg:h-80 object-cover" />
        {text && <div className="p-4 sm:p-5 text-white" style={themeBg(b.theme)}>{text}</div>}
      </div>
    );
  }
  return (
    <div className="relative rounded-3xl overflow-hidden shadow-lg">
      <img src={img.src} alt={b.title || 'بانر'} className="w-full h-44 sm:h-64 lg:h-80 object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 text-white">{text}</div>
    </div>
  );
};

const DISMISS_KEY = 'itqan_banners_dismissed';

/** شريط البانرات أعلى الصفحة الرئيسية (يتبدّل تلقائياً عند وجود أكثر من بانر) */
export const BannerStrip: React.FC = () => {
  const { currentUser, banners } = useApp();
  const visible = useMemo(
    () => (currentUser ? banners.filter((b) => isBannerVisible(b, currentUser.role)).sort((a, b) => a.sort - b.sort || b.created_at.localeCompare(a.created_at)) : []),
    [banners, currentUser]
  );
  const signature = visible.map((b) => `${b.id}:${b.updated_at}`).join('|');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) || '';
    } catch {
      return '';
    }
  });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (index >= visible.length) setIndex(0);
  }, [visible.length, index]);
  useEffect(() => {
    if (visible.length < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % visible.length), 7000);
    return () => clearInterval(t);
  }, [visible.length, paused]);

  // يُخفى لهذه الجلسة فقط، ويعود إذا أضاف المدير بانراً أو عدّله
  if (!visible.length || dismissed === signature) return null;
  const current = visible[Math.min(index, visible.length - 1)];
  const go = (d: number) => setIndex((i) => (i + d + visible.length) % visible.length);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6" dir="rtl" aria-label="إعلانات المدرسة"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative">
        <BannerCard banner={current} />
        <button type="button" aria-label="إخفاء البانر" title="إخفاء"
          onClick={() => {
            setDismissed(signature);
            try { sessionStorage.setItem(DISMISS_KEY, signature); } catch { /* ignore */ }
          }}
          className="absolute top-3 left-3 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
          <X className="w-4 h-4" />
        </button>
        {visible.length > 1 && (
          <>
            <button type="button" aria-label="السابق" onClick={() => go(-1)}
              className="absolute top-1/2 right-3 -translate-y-1/2 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button type="button" aria-label="التالي" onClick={() => go(1)}
              className="absolute top-1/2 left-3 -translate-y-1/2 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex justify-center gap-1.5 mt-3">
              {visible.map((b, i) => (
                <button key={b.id} type="button" aria-label={`البانر ${i + 1}`} onClick={() => setIndex(i)}
                  className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-indigo-600' : 'w-2 bg-slate-300 dark:bg-slate-600'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
