import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, MicOff, Mic, MessageSquareOff, MessageSquare, PhoneOff, Loader2, RefreshCw, Pencil, Link2, Smartphone, Maximize } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LiveJoin, LiveSession, copyLiveLink, liveEnd, loadJitsiApi, pingLive, setLive } from '../../services/liveService';
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
  const [title, setTitle] = useState(session.title);
  const [micLocked, setMicLocked] = useState(false);
  // الطالب: الشاشة المشتركة (لإخفاء الشريط الجانبي وإظهار تلميح «لف الجوال»)
  const [sharing, setSharing] = useState(false);
  const filmVisible = useRef(true);
  const hidFilm = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'ended'>('loading');
  const [attempt, setAttempt] = useState(0);
  const closed = useRef(false);
  const logo = settings.school_logo || '/itqan-logo.png';

  // onClose يتغيّر مع كل رسم للصفحة الأم؛ نحفظه في مرجع حتى لا يُعاد إنشاء الاجتماع (كان يُخرج الجميع ويعيدهم)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    try { api.current?.dispose(); } catch { /* ignore */ }
    api.current = null;
    onCloseRef.current();
  }, []);
  // انتهاء الحصة (بالإنهاء للجميع أو انتهاء الوقت): تُغلق فوراً مع رسالة
  const endNow = useCallback(() => {
    try { api.current?.dispose(); } catch { /* ignore */ }
    api.current = null;
    setState('ended');
  }, []);

  // الطالب: إخفاء الشات أو إظهاره حسب قفل المعلم
  const applyChat = useCallback((locked: boolean) => {
    const a = api.current;
    if (!a || mod) return;
    try {
      // نغلق نافذة الشات المفتوحة أولاً ثم نخفي الزر
      if (locked && chatOpen.current) a.executeCommand('toggleChat');
      a.executeCommand('overwriteConfig', { toolbarButtons: studentTools(locked) });
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
      // الطالب: أنهى المعلم الحصة للجميع أو أُخرج منها ← رسالة الانتهاء فوراً
      if (!mod) a.addListener('videoConferenceLeft', endNow);
      a.addListener('chatUpdated', (e: any) => {
        chatOpen.current = !!e?.isOpen;
        // الشات مقفول: أي محاولة لفتحه عند الطالب تُغلق فوراً
        if (!mod && chatOpen.current && lockRef.current) { try { a.executeCommand('toggleChat'); } catch { /* ignore */ } }
      });
      a.addListener('filmstripDisplayChanged', (e: any) => { filmVisible.current = !!e?.visible; });
      // الطالب: عند مشاركة الشاشة نخرج من عرض الشبكة ونخفي الشريط الجانبي لتأخذ الشاشة المساحة كلها
      if (!mod) {
        a.addListener('contentSharingParticipantsChanged', (e: any) => {
          const on = Array.isArray(e?.data) && e.data.length > 0;
          setSharing(on);
          try {
            if (on) {
              a.executeCommand('setTileView', false);
              if (filmVisible.current) { a.executeCommand('toggleFilmStrip'); hidFilm.current = true; }
            } else if (hidFilm.current) {
              a.executeCommand('toggleFilmStrip'); hidFilm.current = false;
            }
          } catch { /* ignore */ }
        });
      }
      setTimeout(() => alive && setState((s) => (s === 'loading' ? 'ready' : s)), 8000);
    }).catch(() => alive && setState('error'));
    return () => {
      alive = false;
      try { api.current?.dispose(); } catch { /* ignore */ }
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [join, attempt]);

  // نبضة الحضور كل 30 ثانية (حمل قاعدة البيانات مع مئات الطلاب في وقت واحد) + متابعة انتهاء الحصة وقفل الشات
  useEffect(() => {
    const tick = async () => {
      const r = await pingLive(session.id);
      if (!r.ok) return;
      if (r.title) setTitle(r.title);
      if (typeof r.chat_locked === 'boolean' && r.chat_locked !== lockRef.current) {
        lockRef.current = r.chat_locked;
        setChatLocked(r.chat_locked);
        applyChat(r.chat_locked);
      }
      if (!mod && (r.status === 'ended' || r.status === 'cancelled')) endNow();
    };
    const iv = window.setInterval(() => void tick(), 30000);
    return () => window.clearInterval(iv);
  }, [session.id, mod, applyChat, endNow]);

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
  // قفل المايكات (إشراف الصوت في Jitsi): لا يفتح الطالب المايك إلا بإذن المعلم، فيقل الصدى والضوضاء
  const toggleMics = () => {
    const next = !micLocked;
    try {
      api.current?.executeCommand('toggleModeration', next, 'audio');
      if (next) api.current?.executeCommand('muteEveryone', 'audio');
      setMicLocked(next);
      showToast(next ? t('قُفلت المايكات: يرفع الطالب يده لتسمح له بالكلام') : t('فُتحت المايكات للطلاب'));
    } catch { showToast(t('تعذر الحفظ'), 'error'); }
  };
  const rename = async () => {
    const v = window.prompt(t('عنوان الحصة'), title)?.trim();
    if (!v || v === title) return;
    const r = await setLive(session.id, { title: v });
    if (!r.ok) { showToast(t('تعذر الحفظ'), 'error'); return; }
    setTitle(v);
    try { api.current?.executeCommand('subject', v); } catch { /* ignore */ }
    showToast(t('تم الحفظ'));
  };
  const copyLink = async () => { if (await copyLiveLink(session.id)) showToast(t('نُسخ رابط الحصة')); };
  const fullScreen = () => {
    const el: any = stage.current;
    try {
      const p = el?.requestFullscreen?.() || el?.webkitRequestFullscreen?.();
      Promise.resolve(p).then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {});
    } catch { /* ignore */ }
  };
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
    <div ref={stage} className="fixed inset-0 z-[90] bg-slate-950 flex flex-col" dir={uiDir()} role="dialog" aria-modal="true" aria-label={title} data-testid="live-room">
      <header className="h-14 shrink-0 px-2 sm:px-4 flex items-center gap-2 bg-slate-900 border-b border-slate-800 text-white">
        <img src={logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-black truncate text-sm sm:text-base">{title}</p>
          <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />{t('مباشر')} · {session.teacher_name}
            <span className={`ms-1 px-1.5 rounded-md tabular-nums ${leftMin <= 2 ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`} data-testid="live-left">
              {t('متبقٍ {n} د', { n: leftMin })}
            </span>
          </p>
        </div>
        {mod && (
          <>
            <button type="button" onClick={() => void rename()} className={`${btn} bg-slate-800 hover:bg-slate-700 hidden sm:inline-flex`} title={t('تغيير عنوان الحصة')} aria-label={t('تغيير عنوان الحصة')} data-testid="live-rename">
              <Pencil className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => void copyLink()} className={`${btn} bg-slate-800 hover:bg-slate-700`} title={t('نسخ رابط الحصة')} aria-label={t('نسخ رابط الحصة')} data-testid="live-copy">
              <Link2 className="w-4 h-4" />
            </button>
            <button type="button" onClick={toggleMics} aria-pressed={micLocked} data-testid="live-mic-lock"
              className={`${btn} ${micLocked ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 hover:bg-slate-700'}`}
              title={micLocked ? t('فتح المايكات للطلاب') : t('قفل المايكات')}>
              {micLocked ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span className="hidden lg:inline">{micLocked ? t('المايكات مقفولة') : t('قفل المايكات')}</span>
            </button>
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
        {/* الطالب على الجوال بالطول أثناء مشاركة الشاشة: تلميح لتدوير الجوال وزر ملء الشاشة */}
        {!mod && sharing && state === 'ready' && (
          <div className="portrait:flex hidden absolute bottom-24 inset-x-3 justify-center pointer-events-none" data-testid="live-rotate">
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-slate-900/90 text-white text-sm font-bold px-3 py-2 shadow-lg">
              <Smartphone className="w-4 h-4 rotate-90" />{t('لف الجوال بالعرض لترى الشرح أوضح')}
              <button type="button" onClick={fullScreen} className="ms-1 h-8 px-2 rounded-lg bg-indigo-600 inline-flex items-center gap-1"><Maximize className="w-4 h-4" />{t('ملء الشاشة')}</button>
            </div>
          </div>
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
