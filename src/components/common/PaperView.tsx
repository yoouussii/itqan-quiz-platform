import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PaperPin, QuizPaper } from '../../types';
import { MEDIA_ID_RE, loadMedia } from '../../utils/quizMedia';
import { t } from '../../i18n';

export type PinState = 'answered' | 'flagged' | 'empty' | 'current';
export interface PaperPinItem { idx: number; pin: PaperPin; label: string; state: PinState }

/** صورة صفحة (data URL أو صورة محفوظة في الخادم) */
export const PageImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const m = src.match(MEDIA_ID_RE);
  const [url, setUrl] = useState<string | null>(m ? null : src);
  useEffect(() => {
    if (!m) { setUrl(src); return; }
    let live = true;
    void loadMedia(m[1]).then((u) => live && setUrl(u));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return url
    ? <img src={url} alt={alt} draggable={false} className="absolute inset-0 w-full h-full object-contain select-none" />
    : <div className="absolute inset-0 animate-pulse bg-slate-100" aria-hidden />;
};

const PIN_CLS: Record<PinState, string> = {
  answered: 'bg-indigo-600 text-white border-white',
  flagged: 'bg-amber-400 text-amber-950 border-white',
  empty: 'bg-white text-indigo-700 border-indigo-600',
  current: 'bg-emerald-600 text-white border-white ring-4 ring-emerald-300/60',
};

/**
 * ورقة الاختبار الأصلية: الصفحات كما هي، وعليها علامة مرقّمة لكل سؤال.
 * - للطالب: الضغط على العلامة يفتح الإجابة عندها (أو ينقل إلى السؤال في ورقة الإجابة).
 * - للمعلم: الضغط على الصفحة يضع علامة السؤال المحدد، والعلامة تُسحب لتعديل مكانها.
 */
export const PaperView: React.FC<{
  paper: QuizPaper;
  pins: PaperPinItem[];
  onPin?: (idx: number) => void;
  /** وضع التحرير: الضغط على الصفحة يحدد مكاناً، والسحب ينقل العلامة */
  onPlace?: (pin: PaperPin) => void;
  onMove?: (idx: number, pin: PaperPin) => void;
  /** نافذة الإجابة عند علامة سؤال */
  popover?: { idx: number; title: React.ReactNode; content: React.ReactNode; onClose: () => void } | null;
  /** يمرّر الصفحة إلى علامة هذا السؤال */
  focusIdx?: number | null;
  className?: string;
}> = ({ paper, pins, onPin, onPlace, onMove, popover, focusIdx, className = '' }) => {
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const drag = useRef<{ idx: number; page: number } | null>(null);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useEffect(() => {
    if (focusIdx == null) return;
    const p = pins.find((x) => x.idx === focusIdx);
    const el = p ? pageRefs.current[p.pin.page] : null;
    if (!p || !el) return;
    const r = el.getBoundingClientRect();
    const target = r.top + window.scrollY + r.height * p.pin.y - window.innerHeight * 0.35;
    // داخل حاوية قابلة للتمرير أو الصفحة نفسها
    const scroller = el.closest('[data-paper-scroll]') as HTMLElement | null;
    if (scroller) scroller.scrollTo({ top: el.offsetTop + el.offsetHeight * p.pin.y - scroller.clientHeight * 0.35, behavior: 'smooth' });
    else window.scrollTo({ top: target, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx]);

  const pos = (page: number, e: { clientX: number; clientY: number }): PaperPin | null => {
    const el = pageRefs.current[page];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { page, x: Math.max(0.01, Math.min(0.99, (e.clientX - r.left) / r.width)), y: Math.max(0.005, Math.min(0.995, (e.clientY - r.top) / r.height)) };
  };

  return (
    <div className={`space-y-3 ${className}`} dir="ltr">
      {paper.pages.map((src, page) => (
        <div key={page} ref={(el) => { pageRefs.current[page] = el; }} data-testid="paper-page"
          className={`relative w-full bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-visible ${onPlace ? 'cursor-crosshair' : ''}`}
          style={{ paddingTop: `${(paper.ratios[page] || 1.414) * 100}%` }}
          onClick={(e) => { if (onPlace && e.target === e.currentTarget.querySelector('img')) { const p = pos(page, e); if (p) onPlace(p); } }}
          onPointerMove={(e) => { if (drag.current && drag.current.page === page && onMove) { const p = pos(page, e); if (p) onMove(drag.current.idx, p); } }}
          onPointerUp={() => { drag.current = null; }}>
          <PageImage src={src} alt={t('صفحة {n}', { n: page + 1 })} />
          {pins.filter((p) => p.pin.page === page).map((p) => (
            <button key={p.idx} type="button" data-testid="paper-pin"
              onClick={(e) => { e.stopPropagation(); onPin?.(p.idx); }}
              onPointerDown={(e) => { if (onMove) { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { idx: p.idx, page }; } }}
              onPointerUp={() => { drag.current = null; }}
              aria-label={p.label}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 min-w-[20px] h-5 px-1 text-[10px] sm:min-w-[28px] sm:h-7 sm:px-1.5 sm:text-xs rounded-full border-2 shadow-md font-extrabold flex items-center justify-center ${PIN_CLS[p.state]} ${onMove ? 'cursor-grab active:cursor-grabbing touch-none' : 'hover:scale-110 transition-transform'}`}
              style={{ left: `${p.pin.x * 100}%`, top: `${p.pin.y * 100}%` }}>
              {p.label}
            </button>
          ))}
          {popover && !narrow && (() => {
            const p = pins.find((x) => x.idx === popover.idx);
            if (!p || p.pin.page !== page) return null;
            const side: React.CSSProperties = p.pin.x > 0.5 ? { right: `${(1 - p.pin.x) * 100}%` } : { left: `${p.pin.x * 100}%` };
            return (
              <div className="absolute z-20 w-[min(360px,92%)] mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 space-y-2.5" dir="rtl"
                style={{ ...side, top: `${p.pin.y * 100}%` }} role="dialog" aria-label={t('إجابة السؤال')} data-testid="paper-popover" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100">{popover.title}</div>
                  <button type="button" onClick={popover.onClose} aria-label={t('إغلاق')} className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-[55vh] overflow-y-auto">{popover.content}</div>
              </div>
            );
          })()}
        </div>
      ))}
      {popover && narrow && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-3xl border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3" dir="rtl" role="dialog" aria-label={t('إجابة السؤال')} data-testid="paper-popover">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100">{popover.title}</div>
            <button type="button" onClick={popover.onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
          </div>
          {popover.content}
        </div>
      )}
    </div>
  );
};
