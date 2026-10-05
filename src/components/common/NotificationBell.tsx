import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Megaphone, X, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { hasPerm } from '../../utils/permissions';
import { AppNotification, NotifAudience } from '../../services/notificationService';
import { notifAction, notifLines } from './notificationActions';
import { uiDir, t, isEn } from '../../i18n';
import { EmptyMascot } from './Mascot';

export const NOTIF_ICONS: Record<string, string> = {
  quiz_published: '📝', quiz_pending: '🕓', quiz_approved: '✅', quiz_rejected: '❌',
  retake_granted: '🔁', award: '🏆', announcement: '📣', quiz_reminder: '⏰',
};

export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('الآن');
  if (m < 60) return isEn() ? `${m} min ago` : `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return isEn() ? `${h} h ago` : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 7) return isEn() ? `${d} d ago` : `منذ ${d} يوم`;
  return new Date(iso).toLocaleDateString(isEn() ? 'en-GB' : 'ar-EG-u-ca-gregory-nu-latn');
}

export const AnnouncementModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser, classes, sendAnnouncement } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const myClassIds = currentUser?.assigned_class_ids || [];
  const options = isAdmin || myClassIds.length === 0 ? classes : classes.filter((c) => myClassIds.includes(c.id));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'students' | 'staff' | 'everyone' | 'classes'>(isAdmin ? 'students' : 'classes');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setError('');
    if (!title.trim()) return setError(t('اكتب عنوان الإعلان'));
    if (!body.trim()) return setError(t('اكتب نص الإعلان'));
    if (mode === 'classes' && picked.length === 0) return setError(t('اختر صفاً واحداً على الأقل من القائمة'));
    const finalTitle = title.trim();
    const audience: NotifAudience =
      mode === 'students' ? { all: true, roles: ['student'] }
      : mode === 'staff' ? { all: true, roles: ['teacher', 'supervisor'] }
      : mode === 'everyone' ? { all: true, include_sender: true }
      : { class_ids: picked };
    setBusy(true);
    const res = await sendAnnouncement({ title: finalTitle, body: body.trim(), audience });
    setBusy(false);
    if (res.ok) onClose();
  };

  // نافذة على مستوى الصفحة: داخل الشريط العلوي كان جزؤها العلوي (خانة العنوان) يُقص
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose} dir={uiDir()}>
      <div role="dialog" aria-label={t('إعلان جديد')} onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4 my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2"><Megaphone className="w-5 h-5 text-indigo-600" />{' '}{t('إعلان جديد')}</h3>
          <button onClick={onClose} aria-label={t('إغلاق')} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label htmlFor="ann-title" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('العنوان')}</label>
          <input id="ann-title" aria-label={t('عنوان الإعلان')} value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }} maxLength={80} placeholder={t('مثال: إجازة يوم الخميس')}
            className="w-full h-11 px-3 text-base font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:font-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor="ann-body" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('نص الإعلان')}</label>
          <textarea id="ann-body" aria-label={t('نص الإعلان')} value={body} onChange={(e) => { setBody(e.target.value); setError(''); }} rows={4} placeholder={t('نص الإعلان...')}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('المستلمون')}</label>
          <select aria-label={t('المستلمون')} value={mode} onChange={(e) => setMode(e.target.value as any)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold">
            {isAdmin && <option value="students">{t('كل الطلاب')}</option>}
            {isAdmin && <option value="staff">{t('المعلمون والمشرفون')}</option>}
            {isAdmin && <option value="everyone">{t('كل المستخدمين (وأنا معهم)')}</option>}
            <option value="classes">{t('صفوف محددة')}</option>
          </select>
        </div>
        {mode === 'classes' && (
          <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto p-1.5 border rounded-xl border-slate-200 dark:border-slate-700">
            {options.map((c) => (
              <label key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className="text-slate-800 dark:text-slate-200">{c.name}</span>
                <input type="checkbox" checked={picked.includes(c.id)} className="accent-indigo-600"
                  onChange={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />
              </label>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">{t('إلغاء')}</button>
          <button onClick={send} disabled={busy} className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-60">{t('إرسال الإعلان')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** نص الإشعار مرتباً: «العنوان: القيمة» في صفوف بدلاً من سطر واحد طويل */
export const NotifBody: React.FC<{ body: string; compact?: boolean }> = ({ body, compact }) => {
  const lines = notifLines(body);
  if (!lines.length) return null;
  const shown = compact ? lines.slice(0, 3) : lines;
  return (
    <dl className="mt-1 space-y-0.5 text-[11px] leading-relaxed">
      {shown.map((l, i) =>
        l.label ? (
          <div key={i} className="flex gap-1.5">
            <dt className="shrink-0 font-bold text-slate-500 dark:text-slate-400">{l.label}:</dt>
            <dd className="text-slate-700 dark:text-slate-200 min-w-0">{l.value}</dd>
          </div>
        ) : (
          <dd key={i} className="text-slate-700 dark:text-slate-200 whitespace-pre-line">{l.value}</dd>
        )
      )}
      {compact && lines.length > shown.length && <dd className="text-slate-400">…</dd>}
    </dl>
  );
};

/** تنفيذ إجراء الإشعار: فتح الاختبار / النتيجة / صفحة الاعتماد... */
export function useOpenNotification() {
  const { currentUser, quizzes, submissions, markNotificationsRead, setCurrentView, setActiveQuizId, setActiveSubmissionId, showToast } = useApp();
  const actionFor = (n: AppNotification) => (currentUser ? notifAction(n, currentUser, quizzes, submissions) : null);
  const open = (n: AppNotification & { read?: boolean }, fallbackView = 'notifications') => {
    if (!n.read) void markNotificationsRead([n.id]);
    const a = actionFor(n);
    if (!a) return setCurrentView(fallbackView);
    if (a.notice) showToast(a.notice, 'info');
    setActiveQuizId(a.quizId ?? null);
    setActiveSubmissionId(a.submissionId ?? null);
    setCurrentView(a.view);
  };
  return { actionFor, open };
}

export const NotificationBell: React.FC = () => {
  const { currentUser, notifications, unreadCount, markNotificationsRead, setCurrentView, deleteMyNotifications } = useApp();
  const [open, setOpen] = useState(false);
  const [composer, setComposer] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canAnnounce = hasPerm(currentUser, 'can_send_announcements');
  const { open: openNotification } = useOpenNotification();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (!currentUser) return null;

  const go = (n: (typeof notifications)[number]) => {
    openNotification(n);
    setOpen(false);
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={t('الإشعارات')}
          title={t('الإشعارات')}
          className="relative p-2 text-slate-500 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span data-testid="notif-badge" className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div role="dialog" aria-label={t('قائمة الإشعارات')} className="absolute end-0 mt-2 w-80 max-w-[85vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 text-start">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-black text-slate-900 dark:text-white">{t('الإشعارات')}{' '}{unreadCount > 0 && <span className="text-rose-600">({t('{n} جديد', { n: unreadCount })})</span>}</p>
              {unreadCount > 0 && (
                <button onClick={() => markNotificationsRead('all')} className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{t('تحديد الكل كمقروء')}</button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.length === 0 ? (
                <EmptyMascot text={t('لا توجد إشعارات حالياً')} compact />
              ) : (
                notifications.slice(0, 40).map((n) => (
                  <div key={n.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => void deleteMyNotifications([n.id])}
                    aria-label={t('حذف الإشعار')}
                    title={t('حذف الإشعار')}
                    className="absolute end-2 bottom-2 p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 z-10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => go(n)} data-unread={!n.read}
                    className={`w-full text-start px-4 py-3 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${n.read ? '' : 'bg-indigo-50/60 dark:bg-indigo-950/30'}`}>
                    <span className="text-lg shrink-0">{NOTIF_ICONS[n.type] || '🔔'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.title}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                      </span>
                      <NotifBody body={n.body} compact />
                      <span className="block text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <button onClick={() => { setCurrentView('notifications'); setOpen(false); }}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700">
                {t('عرض كل الإشعارات')}
              </button>
              {canAnnounce && (
                <button onClick={() => { setComposer(true); setOpen(false); }} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Megaphone className="w-4 h-4" />{' '}{t('إعلان جديد')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {composer && <AnnouncementModal onClose={() => setComposer(false)} />}
    </>
  );
};
