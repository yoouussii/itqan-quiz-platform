import React, { useEffect, useRef, useState } from 'react';
import { Camera, Headphones, Mic, Volume2, X } from 'lucide-react';
import { Button } from '../common/ui';
import { t, uiDir } from '../../i18n';

/** آخر يوم جرّب فيه الطالب المايك والكاميرا على هذا الجهاز (تجربة واحدة يومياً قبل أول حصة) */
const KEY = 'itqan_devcheck_day';
const today = () => new Date().toDateString();
export const checkedToday = () => { try { return localStorage.getItem(KEY) === today(); } catch { return true; } };
const markChecked = () => { try { localStorage.setItem(KEY, today()); } catch { /* ignore */ } };

/**
 * تجربة المايك والكاميرا والسماعة قبل الحصة: معاينة الكاميرا، وشريط يتحرك مع الصوت،
 * وصوت تجريبي. منح الإذن هنا يُغني عن طلبه داخل Zoom.
 */
const DeviceCheck: React.FC<{ onContinue?: () => void; onClose: () => void }> = ({ onContinue, onClose }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [level, setLevel] = useState(0);
  const [cam, setCam] = useState<'wait' | 'ok' | 'none'>('wait');
  const [mic, setMic] = useState<'wait' | 'ok' | 'none'>('wait');
  const [err, setErr] = useState('');
  const [heard, setHeard] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null; let ctx: AudioContext | null = null; let raf = 0; let alive = true;
    (async () => {
      const md = navigator.mediaDevices;
      if (!md?.getUserMedia) { setErr(t('هذا المتصفح لا يدعم المايك والكاميرا. استخدم Chrome أو Safari حديثاً.')); setCam('none'); setMic('none'); return; }
      try {
        stream = await md.getUserMedia({ audio: true, video: { width: 640, height: 360 } });
      } catch (e: any) {
        // بلا كاميرا: نجرب المايك وحده
        try { stream = await md.getUserMedia({ audio: true }); setCam('none'); } catch (e2: any) {
          const name = e2?.name || e?.name;
          setErr(name === 'NotAllowedError'
            ? t('المتصفح منع المايك والكاميرا. اضغط رمز القفل بجوار عنوان الموقع واسمح بهما، ثم أعد المحاولة.')
            : t('لم يُعثر على مايك أو كاميرا في هذا الجهاز.'));
          setCam('none'); setMic('none');
          return;
        }
      }
      if (!alive) { stream.getTracks().forEach((x) => x.stop()); return; }
      if (stream.getVideoTracks().length && video.current) { video.current.srcObject = stream; setCam('ok'); }
      if (stream.getAudioTracks().length) {
        setMic('ok');
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          ctx = new AC();
          const an = ctx!.createAnalyser(); an.fftSize = 512;
          ctx!.createMediaStreamSource(stream).connect(an);
          const buf = new Uint8Array(an.fftSize);
          const tick = () => {
            an.getByteTimeDomainData(buf);
            let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
            setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
            raf = requestAnimationFrame(tick);
          };
          tick();
        }
      }
    })();
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((x) => x.stop()); void ctx?.close().catch(() => undefined); };
  }, []);

  const beep = () => {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const c: AudioContext = new AC(); const o = c.createOscillator(); const g = c.createGain();
    o.frequency.value = 660; g.gain.value = 0.15; o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.8); o.onended = () => { void c.close(); };
    setHeard(true);
  };
  const go = () => { markChecked(); onContinue ? onContinue() : onClose(); };
  const row = 'flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 p-3';
  const dot = (s: 'wait' | 'ok' | 'none') => <span className={`w-2.5 h-2.5 rounded-full ${s === 'ok' ? 'bg-emerald-500' : s === 'none' ? 'bg-rose-400' : 'bg-slate-300'}`} />;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4" dir={uiDir()} role="dialog" aria-modal="true" aria-label={t('تجربة المايك والكاميرا')}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 space-y-3" data-testid="device-check">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('تجربة المايك والكاميرا')}</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center" aria-label={t('إغلاق')}><X className="w-5 h-5" /></button>
        </div>
        <div className="relative aspect-video max-w-full rounded-2xl bg-slate-900 overflow-hidden flex items-center justify-center">
          <video ref={video} autoPlay muted playsInline className={`w-full h-full object-cover -scale-x-100 ${cam === 'ok' ? '' : 'hidden'}`} />
          {cam !== 'ok' && <Camera className="w-10 h-10 text-slate-500" />}
        </div>
        <div className={row}>
          <Camera className="w-5 h-5 text-slate-500" />
          <span className="flex-1 text-sm font-semibold">{t('الكاميرا')}</span>
          {dot(cam)}
        </div>
        <div className={row}>
          <Mic className="w-5 h-5 text-slate-500" />
          <div className="flex-1 space-y-1">
            <span className="text-sm font-semibold">{t('المايك: تكلّم، ويجب أن يتحرك الشريط')}</span>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} aria-label={t('مستوى صوت المايك')}>
              <div className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          </div>
          {dot(mic)}
        </div>
        <div className={row}>
          <Volume2 className="w-5 h-5 text-slate-500" />
          <span className="flex-1 text-sm font-semibold">{heard ? t('هل سمعت الصوت؟ إن لم تسمعه ارفع صوت الجهاز.') : t('السماعة')}</span>
          <Button size="sm" variant="secondary" onClick={beep}>{t('تشغيل صوت تجريبي')}</Button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2"><Headphones className="w-4 h-4 shrink-0 mt-0.5" />{t('استخدم سماعات الأذن، وأغلق الحصة على أي جهاز آخر في الغرفة نفسها حتى لا يحدث صدى.')}</p>
        {err && <p className="text-sm font-bold text-rose-600" role="alert">{err}</p>}
        <div className="flex gap-2 justify-end">
          {onContinue && <Button variant="secondary" onClick={() => { markChecked(); onContinue(); }}>{t('تخطي')}</Button>}
          <Button onClick={go} data-testid="device-continue">{onContinue ? t('ادخل الحصة') : t('تم')}</Button>
        </div>
      </div>
    </div>
  );
};

export default DeviceCheck;
