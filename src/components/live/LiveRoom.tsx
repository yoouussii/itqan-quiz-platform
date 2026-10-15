import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, MicOff, MessageSquareOff, MessageSquare, PhoneOff, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LiveJoin, LiveSession, liveEnd, loadJitsiApi, pingLive, setLive } from '../../services/liveService';
import { t, uiDir } from '../../i18n';

const STUDENT_TOOLS = ['microphone', 'camera', 'raisehand', 'tileview', 'fullscreen', 'hangup'];
const studentTools = (chatLocked: boolean) => (chatLocked ? STUDENT_TOOLS : [...STUDENT_TOOLS.slice(0, 3), 'chat', ...STUDENT_TOOLS.slice(3)]);

/** شاشة الحصة: Jitsi داخل المنصة بصلاحيات الدور، مع شعار المدرسة وأدوات المعلم والحضور التلقائي */
export const LiveRoom: React.FC<{ join: LiveJoin; onClose: () => void }> = ({ join, onClose }) => {
  const { settings, showToast } = useApp();
  const session = join.session as LiveSession;
  const mod = !!join.moderator;
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<any>(null);
  const chatOpen = useRef(false);
  const [chatLocked, setChatLocked] = useState(session.chat_locked);
  const lockRef = useRef(session.chat_locked);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'ended'>('loading');
  const [attempt, setAttempt] = useState(0);
  const closed = useRef(false);
  const logo = settings.school_logo || '/itqan-logo.png';

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    try { api.current?.dispose(); } catch { /* ignore */ }
    api.current = null;
    onClose();
  }, [onClose]);

  // الطالب: إخفاء الشات أو إظهاره حسب قفل المعلم
  const applyChat = useCallback((locked: boolean) => {
    const a = api.current;
    if (!a || mod) return;
    try {
      a.executeCommand('overwriteConfig', { toolbarButtons: studentTools(locked) });
      if (locked && chatOpen.current) a.executeCommand('toggleChat');
    } catch { /* ignore */ }
  }, [mod]);

  useEffect(() => {
    let alive = true;
    setState('loading');
    loadJitsiApi(join.domain!).then((JitsiApi) => {
      if (!alive || !box.current) return;
      box.current.innerHTML = '';
      const common = {
        prejoinConfig: { enabled: false },
        disableDeepLinking: true,
        defaultLanguage: 'ar',
        subject: session.title,
        startWithAudioMuted: !mod,
        startWithVideoMuted: !mod,
        disableInviteFunctions: true,
        readOnlyName: true,
        disableProfile: true,
      };
      const a = new JitsiApi(join.domain, {
        roomName: join.room,
        parentNode: box.current,
        jwt: join.jwt || undefined,
        lang: 'ar',
        width: '100%',
        height: '100%',
        userInfo: { displayName: join.name },
        configOverwrite: mod ? common : {
          ...common,
          toolbarButtons: studentTools(session.chat_locked),
          remoteVideoMenu: { disableKick: true, disableGrantModerator: true },
          disableReactionsModeration: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false, SHOW_WATERMARK_FOR_GUESTS: false, SHOW_BRAND_WATERMARK: false,
          MOBILE_APP_PROMO: false, SHOW_CHROME_EXTENSION_BANNER: false,
        },
      });
      api.current = a;
      a.addListener('videoConferenceJoined', () => setState('ready'));
      a.addListener('readyToClose', close);
      a.addListener('chatUpdated', (e: any) => { chatOpen.current = !!e?.isOpen; });
      // الطالب: شاشة المعلم المشتركة تملأ العرض
      if (!mod) {
        a.addListener('contentSharingParticipantsChanged', (e: any) => {
          const id = Array.isArray(e?.data) ? e.data[0] : null;
          if (!id) return;
          try { a.executeCommand('setTileView', false); a.executeCommand('setLargeVideoParticipant', id); } catch { /* ignore */ }
        });
      }
      setTimeout(() => alive && setState((s) => (s === 'loading' ? 'ready' : s)), 8000);
    }).catch(() => alive && setState('error'));
    return () => {
      alive = false;
      try { api.current?.dispose(); } catch { /* ignore */ }
      api.current = null;
    };
  }, [join, session.title, session.chat_locked, mod, close, attempt]);

  // نبضة الحضور كل 30 ثانية + متابعة انتهاء الحصة وقفل الشات
  useEffect(() => {
    const tick = async () => {
      const r = await pingLive(session.id);
      if (!r.ok) return;
      if (typeof r.chat_locked === 'boolean' && r.chat_locked !== lockRef.current) {
        lockRef.current = r.chat_locked;
        setChatLocked(r.chat_locked);
        applyChat(r.chat_locked);
      }
      if (!mod && (r.status === 'ended' || r.status === 'cancelled')) {
        try { api.current?.dispose(); } catch { /* ignore */ }
        api.current = null;
        setState('ended');
      }
    };
    const iv = window.setInterval(() => void tick(), 30000);
    return () => window.clearInterval(iv);
  }, [session.id, mod, applyChat]);

  // الإغلاق التلقائي بانتهاء وقت الحصة: تنبيه قبل دقيقتين، ثم إنهاء للجميع
  const endAt = liveEnd(session).getTime();
  const [left, setLeft] = useState(() => endAt - Date.now());
  const warned = useRef(false);
  useEffect(() => {
    const iv = window.setInterval(() => {
      const ms = endAt - Date.now();
      setLeft(ms);
      if (ms <= 2 * 60000 && ms > 0 && !warned.current) { warned.current = true; showToast(t('تنتهي الحصة خلال دقيقتين')); }
      if (ms <= 0) {
        window.clearInterval(iv);
        if (mod) { try { api.current?.executeCommand('endConference'); } catch { /* ignore */ } void setLive(session.id, { status: 'ended' }); }
        try { api.current?.dispose(); } catch { /* ignore */ }
        api.current = null;
        setState('ended');
      }
    }, 5000);
    return () => window.clearInterval(iv);
  }, [endAt, mod, session.id, showToast]);
  const leftMin = Math.max(0, Math.ceil(left / 60000));

  const muteAll = () => { try { api.current?.executeCommand('muteEveryone', 'audio'); showToast(t('تم كتم صوت جميع الطلاب')); } catch { /* ignore */ } };
  const toggleChat = async () => {
    const r = await setLive(session.id, { chat_locked: !chatLocked });
    if (r.ok && r.row) { lockRef.current = r.row.chat_locked; setChatLocked(r.row.chat_locked); showToast(r.row.chat_locked ? t('أُغلق الشات على الطلاب (خلال ثوانٍ)') : t('فُتح الشات للطلاب')); }
    else showToast(t('تعذر الحفظ'), 'error');
  };
  const endForAll = async () => {
    if (!window.confirm(t('إنهاء الحصة وإخراج جميع الطلاب؟'))) return;
    try { api.current?.executeCommand('endConference'); } catch { /* ignore */ }
    await setLive(session.id, { status: 'ended' });
    close();
  };

  const btn = 'h-9 px-2.5 sm:px-3 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap';
  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 flex flex-col" dir={uiDir()} role="dialog" aria-modal="true" aria-label={session.title} data-testid="live-room">
      <header className="h-14 shrink-0 px-2 sm:px-4 flex items-center gap-2 bg-slate-900 border-b border-slate-800 text-white">
        <img src={logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-black truncate text-sm sm:text-base">{session.title}</p>
          <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />{t('مباشر')} · {session.teacher_name}
            <span className={`ms-1 px-1.5 rounded-md tabular-nums ${leftMin <= 2 ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`} data-testid="live-left">
              {t('متبقٍ {n} د', { n: leftMin })}
            </span>
          </p>
        </div>
        {mod && (
          <>
            <button type="button" onClick={muteAll} className={`${btn} bg-slate-800 hover:bg-slate-700`} title={t('كتم الجميع')} data-testid="live-mute-all">
              <MicOff className="w-4 h-4" /><span className="hidden md:inline">{t('كتم الجميع')}</span>
            </button>
            <button type="button" onClick={() => void toggleChat()} aria-pressed={chatLocked} data-testid="live-chat-lock"
              className={`${btn} ${chatLocked ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 hover:bg-slate-700'}`}
              title={chatLocked ? t('فتح الشات للطلاب') : t('قفل الشات على الطلاب')}>
              {chatLocked ? <MessageSquareOff className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              <span className="hidden md:inline">{chatLocked ? t('الشات مقفول') : t('قفل الشات')}</span>
            </button>
            <button type="button" onClick={() => void endForAll()} className={`${btn} bg-rose-600 hover:bg-rose-700`} title={t('إنهاء الحصة للجميع')} data-testid="live-end">
              <PhoneOff className="w-4 h-4" /><span className="hidden md:inline">{t('إنهاء للجميع')}</span>
            </button>
          </>
        )}
        <button type="button" onClick={close} className={`${btn} bg-slate-800 hover:bg-slate-700`} aria-label={t('خروج')} title={t('خروج')}>
          <X className="w-4 h-4" /><span className="hidden sm:inline">{t('خروج')}</span>
        </button>
      </header>

      <div className="relative flex-1 min-h-0">
        <div ref={box} className="absolute inset-0" />
        {/* شعار المدرسة على الفيديو */}
        {state === 'ready' && (
          <img src={logo} alt="" aria-hidden="true" data-testid="live-logo"
            className="pointer-events-none absolute top-3 start-3 w-12 h-12 sm:w-16 sm:h-16 object-contain opacity-80 drop-shadow-lg" />
        )}
        {state === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
            <Loader2 className="w-10 h-10 animate-spin" />
            <p className="font-bold">{t('جارٍ تجهيز الحصة…')}</p>
          </div>
        )}
        {(state === 'error' || state === 'ended') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6 text-white">
            <p className="text-xl font-black">{state === 'ended' ? t('انتهت الحصة، شكراً لحضورك 👋') : t('تعذّر الاتصال بخادم الحصص')}</p>
            {state === 'error' && <p className="text-sm text-slate-400">{t('تأكد من اتصالك بالإنترنت ثم أعد المحاولة.')}</p>}
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
