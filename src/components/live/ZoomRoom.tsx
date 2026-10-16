import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, WifiOff, Hourglass } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LiveJoin, LiveSession, liveEnd, pingLive } from '../../services/liveService';
import { t, uiDir } from '../../i18n';

/**
 * حصة Zoom داخل المنصة بواجهة Zoom الكاملة (Meeting SDK – Client View): نفس واجهة Zoom على الويب
 * (الشاشة المشتركة بعرض الشاشة، والمعرض، والدردشة…). الطالب يدخل بتوقيع من الخادم وباسمه الثلاثي،
 * وعند الخروج يعود لصفحة الحصص.
 */
const ZoomRoom: React.FC<{ join: LiveJoin; onClose: () => void }> = ({ join, onClose }) => {
  const { settings, showToast } = useApp();
  const session = join.session as LiveSession;
  const z = join.zoom!;
  const mtg = useRef<any>(null);
  // waiting: لم يبدأ المعلم بعد (دخول تلقائي عند بدئه) — reconnecting: انقطع الاتصال (رجوع تلقائي)
  const [state, setState] = useState<'loading' | 'ready' | 'waiting' | 'reconnecting' | 'error' | 'ended'>('loading');
  const [err, setErr] = useState('');
  const [attempt, setAttempt] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const logo = settings.school_logo || '/itqan-logo.png';

  const zoomRoot = () => document.getElementById('zmmtg-root');
  const hideZoom = () => { const r = zoomRoot(); if (r) r.style.display = 'none'; };
  // الخروج من الاجتماع: يعيد Zoom الصفحة إلى leaveUrl (صفحة الحصص)
  // (فقط إن كان داخل الاجتماع؛ إعادة المحاولة بانتظار المعلم لا تغادر الصفحة)
  const joinedRef = useRef(false);
  const leave = useCallback(() => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    try { mtg.current?.leaveMeeting({}); } catch { /* ignore */ }
  }, []);
  const close = useCallback(() => { leave(); hideZoom(); onCloseRef.current(); }, [leave]);
  const endNow = useCallback(() => { leave(); hideZoom(); setState('ended'); }, [leave]);
  const endAt = liveEnd(session).getTime();
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const notStarted = (e: string) => /not started|has not started|3008|meeting is not|wait for host/i.test(e);

  useEffect(() => {
    let alive = true;
    setState('loading');
    setErr('');
    (async () => {
      try {
        const mod: any = await import('@zoom/meetingsdk');
        const ZoomMtg = mod.ZoomMtg || mod.default?.ZoomMtg;
        if (!alive || !ZoomMtg) return;
        mtg.current = ZoomMtg;
        ZoomMtg.preLoadWasm();
        ZoomMtg.prepareWebSDK();
        const fail = (e: any) => {
          if (!alive) return;
          hideZoom();
          const msg = String(e?.reason || e?.errorMessage || e?.message || e?.errorCode || e?.method || '');
          setErr(msg);
          // المعلم لم يبدأ بعد، أو لا إنترنت: محاولة تلقائية بدل رسالة خطأ
          if (Date.now() < endAt && notStarted(msg)) setState('waiting');
          else if (Date.now() < endAt && !navigator.onLine) setState('reconnecting');
          else setState('error');
        };
        ZoomMtg.init({
          leaveUrl: `${window.location.origin}/live`,
          patchJsMedia: true,
          disableInvite: true,
          disableRecord: true,
          success: () => {
            ZoomMtg.join({
              signature: z.signature,
              meetingNumber: z.meetingNumber,
              passWord: z.password,
              userName: z.userName,
              success: () => {
                joinedRef.current = true;
                if (!alive) return;
                const r = zoomRoot();
                if (r) { r.style.display = 'block'; r.style.zIndex = '200'; }
                setState('ready');
              },
              error: fail,
            });
          },
          error: fail,
        });
        // انقطع الاجتماع: إما انتهت الحصة، أو انقطع الإنترنت ← رجوع تلقائي
        try {
          ZoomMtg.inMeetingServiceListener('onMeetingStatus', (d: any) => {
            if (d?.meetingStatus !== 3 || !alive) return;
            joinedRef.current = false;
            hideZoom();
            if (Date.now() >= endAt) { setState('ended'); return; }
            setState('reconnecting');
            void pingLive(session.id).then((r) => {
              if (!alive) return;
              if (r.ok && (r.status === 'ended' || r.status === 'cancelled')) setState('ended');
            });
          });
        } catch { /* ignore */ }
      } catch (e: any) {
        if (alive) { setErr(String(e?.message || '')); setState('error'); }
      }
    })();
    return () => { alive = false; leave(); hideZoom(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // نبضة الحضور كل دقيقة + إنهاء الحصة من المنصة (انتهاء الاجتماع من Zoom يصل فوراً عبر onMeetingStatus)
  useEffect(() => {
    const iv = window.setInterval(async () => {
      const r = await pingLive(session.id);
      if (r.ok && (r.status === 'ended' || r.status === 'cancelled')) endNow();
    }, 60000);
    return () => window.clearInterval(iv);
  }, [session.id, endNow]);

  // محاولة تلقائية: كل 15 ثانية بانتظار المعلم، وكل 5 ثوانٍ (أو فور عودة الإنترنت) بعد الانقطاع
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (state !== 'waiting' && state !== 'reconnecting') return undefined;
    const wait = state === 'waiting' ? 15 : 5;
    setCountdown(wait);
    let left = wait;
    const iv = window.setInterval(() => {
      if (state === 'reconnecting' && !navigator.onLine) return; // ننتظر عودة الإنترنت
      left -= 1; setCountdown(left);
      if (left <= 0) { window.clearInterval(iv); retry(); }
    }, 1000);
    const onOnline = () => { if (state === 'reconnecting') { window.clearInterval(iv); retry(); } };
    window.addEventListener('online', onOnline);
    return () => { window.clearInterval(iv); window.removeEventListener('online', onOnline); };
  }, [state, retry]);

  // الإغلاق التلقائي بانتهاء وقت الحصة (مع تنبيه قبل دقيقتين)
  const warned = useRef(false);
  useEffect(() => {
    const iv = window.setInterval(() => {
      const ms = endAt - Date.now();
      if (ms <= 2 * 60000 && ms > 0 && !warned.current) { warned.current = true; showToast(t('تنتهي الحصة خلال دقيقتين')); }
      if (ms <= 0) { window.clearInterval(iv); endNow(); }
    }, 5000);
    return () => window.clearInterval(iv);
  }, [endAt, endNow, showToast]);

  const btn = 'h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap';
  if (state === 'ready') return null; // واجهة Zoom الكاملة تملأ الصفحة
  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 flex flex-col items-center justify-center gap-4 text-center px-6 text-white" dir={uiDir()} data-testid="zoom-room">
      <img src={logo} alt="" className="w-16 h-16 rounded-2xl object-contain bg-white p-1" />
      <p className="font-black text-lg">{session.title}</p>
      {state === 'waiting' && (
        <>
          <Hourglass className="w-10 h-10 text-amber-300 animate-pulse" />
          <p className="text-xl font-black">{t('في انتظار المعلم…')}</p>
          <p className="text-sm text-slate-300 max-w-md">{t('لم يبدأ المعلم الاجتماع بعد. ستدخل الحصة تلقائياً عند بدئه، لا تغلق الصفحة.')}</p>
          <p className="text-xs text-slate-400 tabular-nums" data-testid="zoom-wait">{t('المحاولة التالية خلال {n} ث', { n: Math.max(0, countdown) })}</p>
        </>
      )}
      {state === 'reconnecting' && (
        <>
          <WifiOff className="w-10 h-10 text-rose-300" />
          <p className="text-xl font-black">{t('انقطع الاتصال بالحصة')}</p>
          <p className="text-sm text-slate-300 max-w-md">{t('جارٍ إعادة الدخول تلقائياً. تأكد من اتصالك بالإنترنت.')}</p>
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </>
      )}
      {(state === 'waiting' || state === 'reconnecting') && (
        <button type="button" onClick={close} className={`${btn} bg-slate-800 hover:bg-slate-700`}>{t('رجوع')}</button>
      )}
      {state === 'loading' && (
        <>
          <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
          <p className="font-bold text-slate-300">{t('جارٍ الدخول إلى Zoom…')}</p>
        </>
      )}
      {(state === 'error' || state === 'ended') && (
        <>
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
        </>
      )}
    </div>
  );
};

export default ZoomRoom;
