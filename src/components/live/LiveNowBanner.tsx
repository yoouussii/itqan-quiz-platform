import React, { useEffect, useState } from 'react';
import { Radio, Video } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LiveSession, isSoon, listLive, setPendingJoin } from '../../services/liveService';
import { t, dateLocale } from '../../i18n';

/** بطاقة «حصتك المباشرة بدأت» في رئيسية الطالب (تتحدّث كل دقيقة) */
export const LiveNowBanner: React.FC = () => {
  const { setCurrentView } = useApp();
  const [rows, setRows] = useState<LiveSession[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      const r = await listLive(from, to);
      if (alive && r.ok) setRows(r.rows.filter((s) => s.status === 'live' || isSoon(s)));
    };
    void load();
    const iv = window.setInterval(() => void load(), 60000);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      {rows.map((s) => {
        const live = s.status === 'live';
        return (
          <button key={s.id} type="button" data-testid="live-banner"
            onClick={() => { if (live) setPendingJoin(s.id); setCurrentView('live'); }}
            className={`w-full text-start rounded-2xl p-4 flex items-center gap-3 shadow-sm ${live ? 'bg-rose-600 text-white' : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100 border border-indigo-200 dark:border-indigo-900'}`}>
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${live ? 'bg-white/20' : 'bg-indigo-100 dark:bg-indigo-900'}`}>
              {live ? <Radio className="w-6 h-6 animate-pulse" /> : <Video className="w-6 h-6" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-black truncate">{live ? t('حصتك المباشرة بدأت: {title}', { title: s.title }) : t('حصة مباشرة قريباً: {title}', { title: s.title })}</span>
              <span className={`block text-sm ${live ? 'text-rose-100' : 'opacity-80'}`}>
                {s.teacher_name} · {new Date(s.starts_at).toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' })}
              </span>
            </span>
            {live && <span className="h-10 px-4 rounded-xl bg-white text-rose-700 font-black inline-flex items-center">{t('ادخل الآن')}</span>}
          </button>
        );
      })}
    </div>
  );
};
