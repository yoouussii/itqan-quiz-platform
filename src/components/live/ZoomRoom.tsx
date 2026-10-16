import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LiveJoin, LiveSession, liveEnd, pingLive } from '../../services/liveService';
import { t, uiDir } from '../../i18n';

/** حصة Zoom داخل المنصة (Meeting SDK – Component View): الطالب يدخل بتوقيع من الخادم وباسمه الثلاثي */
const ZoomRoom: React.FC<{ join: LiveJoin; onClose: () => void }> = ({ join, onClose }) => {
  const { settings, showToast } = useApp();
  const session = join.session as LiveSession;
  const z = join.zoom!;
  const root = useRef<HTMLDivElement>(null);
  const client = useRef<any>(null);
  const sdk = useRef<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'ended'>('loading');
  const [err, setErr] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState(session.title);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const logo = settings.school_logo || '/itqan-logo.png';

  // الخروج ثم هدم عميل Zoom: العميل واحد في الصفحة، وإن بقي يُرسم في عنصر قديم فتظهر شاشة سوداء عند الدخول التالي
  const leave = useCallback(() => {
    const c = client.current;
    client.current = null;
    if (!c) return;
    Promise.resolve().then(() => c.leaveMeeting?.()).catch(() => {}).finally(() => {
      try { sdk.current?.destroyClient?.(); } catch { /* ignore */ }
    });
  }, []);
  const close = useCallback(() => { leave(); onCloseRef.current(); }, [leave]);
  const endNow = useCallback(() => { leave(); setState('ended'); }, [leave]);

  useEffect(() => {
    let alive = true;
    setState('loading');
    setErr('');
    (async () => {
      try {
        const mod: any = await import('@zoom/meetingsdk/embedded');
        const ZoomMtgEmbedded = mod.default || mod;
        sdk.current = ZoomMtgEmbedded;
        if (!alive || !root.current) return;
        try { ZoomMtgEmbedded.destroyClient?.(); } catch { /* ignore */ }
        root.current.innerHTML = '';
        const c = ZoomMtgEmbedded.createClient();
        client.current = c;
        const box = root.current.getBoundingClientRect();
        await c.init({
          zoomAppRoot: root.current,
          language: 'en-US',
          patchJsMedia: true,
          leaveOnPageUnload: true,
          // «active»: المتحدث أو الشاشة المشتركة تملأ العرض بدل المربعات الصغيرة
          customize: { video: { isResizable: false, defaultViewType: 'active' as any, viewSizes: { default: { width: Math.floor(box.width), height: Math.floor(box.height - 60) } } } },
        });
        c.on('connection-change', (p: any) => { if (p?.state === 'Closed') endNow(); });
        await c.join({ signature: z.signature, meetingNumber: z.meetingNumber, password: z.password, userName: z.userName });
        if (alive) setState('ready');
      } catch (e: any) {
        if (!alive) return;
        const reason = String(e?.reason || e?.message || e?.errorCode || '');
        setErr(reason);
        setState('error');
      }
    })();
    return () => { alive = false; leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // نبضة الحضور كل 15 ثانية + انتهاء الحصة وتغيير العنوان
  useEffect(() => {
    const iv = window.setInterval(async () => {
      const r = await pingLive(session.id);
      if (!r.ok) return;
      if (r.title) setTitle(r.title);
      if (r.status === 'ended' || r.status === 'cancelled') endNow();
    }, 15000);
    return () => window.clearInterval(iv);
  }, [session.id, endNow]);

  // الإغلاق التلقائي بانتهاء وقت الحصة
  const endAt = liveEnd(session).getTime();
  const [left, setLeft] = useState(() => endAt - Date.now());
  const warned = useRef(false);
  useEffect(() => {
    const iv = window.setInterval(() => {
      const ms = endAt - Date.now();
      setLeft(ms);
      if (ms <= 2 * 60000 && ms > 0 && !warned.current) { warned.current = true; showToast(t('تنتهي الحصة خلال دقيقتين')); }
      if (ms <= 0) { window.clearInterval(iv); endNow(); }
    }, 5000);
    return () => window.clearInterval(iv);
  }, [endAt, endNow, showToast]);
  const leftMin = Math.max(0, Math.ceil(left / 60000));
  const btn = 'h-9 px-2.5 sm:px-3 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap';

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 flex flex-col" dir={uiDir()} role="dialog" aria-modal="true" aria-label={title} data-testid="zoom-room">
      <header className="h-14 shrink-0 px-2 sm:px-4 flex items-center gap-2 bg-slate-900 border-b border-slate-800 text-white">
        <img src={logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-black truncate text-sm sm:text-base">{title}</p>
          <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />{t('مباشر')} · {session.teacher_name} · Zoom
            <span className={`ms-1 px-1.5 rounded-md tabular-nums ${leftMin <= 2 ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`}>
              {t('متبقٍ {n} د', { n: leftMin })}
            </span>
          </p>
        </div>
        <button type="button" onClick={close} className={`${btn} bg-slate-800 hover:bg-slate-700`} aria-label={t('خروج')} title={t('خروج')}>
          <X className="w-4 h-4" /><span className="hidden sm:inline">{t('خروج')}</span>
        </button>
      </header>
      <div className="relative flex-1 min-h-0" dir="ltr">
        <div ref={root} className="absolute inset-0" />
        {state === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 pointer-events-none" dir={uiDir()}>
            <Loader2 className="w-10 h-10 animate-spin" />
            <p className="font-bold">{t('جارٍ الدخول إلى Zoom…')}</p>
          </div>
        )}
        {(state === 'error' || state === 'ended') && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4 text-center px-6 text-white" dir={uiDir()}>
            <p className="text-xl font-black">{state === 'ended' ? t('انتهت الحصة، شكراً لحضورك 👋') : t('تعذّر الدخول إلى اجتماع Zoom')}</p>
            {state === 'error' && (
              <p className="text-sm text-slate-400 max-w-md">
                {/not started|has not started|3008/i.test(err) ? t('لم يبدأ المعلم الاجتماع في Zoom بعد. حاول بعد قليل.') : t('تأكد من اتصالك بالإنترنت ثم أعد المحاولة.')}
                {err && <span className="block mt-1 text-xs opacity-70" dir="ltr">{err}</span>}
              </p>
            )}
            <div className="flex gap-2">
              {state === 'error' && (
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${btn} bg-indigo-600 hover:bg-indigo-700`}>
                  <RefreshCw className="w-4 h-4" />{t('إعادة المحاولة')}
                </button>
              )}
              <button type="button" onClick={close} className={`${btn} bg-slate-800 hover:bg-slate-700`}>{t('رجوع')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZoomRoom;
