import React, { useEffect, useRef, useState } from 'react';
import { Bell, Megaphone, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { hasPerm } from '../../utils/permissions';
import { NotifAudience } from '../../services/notificationService';

const ICONS: Record<string, string> = {
  quiz_published: '📝', quiz_pending: '🕓', quiz_approved: '✅', quiz_rejected: '❌',
  retake_granted: '🔁', award: '🏆', announcement: '📣',
};

export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 7) return `منذ ${d} يوم`;
  return new Date(iso).toLocaleDateString('ar-EG-u-ca-gregory-nu-latn');
}

const AnnouncementModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser, classes, sendAnnouncement } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const myClassIds = currentUser?.assigned_class_ids || [];
  const options = isAdmin || myClassIds.length === 0 ? classes : classes.filter((c) => myClassIds.includes(c.id));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'students' | 'staff' | 'everyone' | 'classes'>(isAdmin ? 'students' : 'classes');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) return alert('اكتب عنوان الإعلان ونصه');
    if (mode === 'classes' && picked.length === 0) return alert('اختر صفاً واحداً على الأقل');
    const audience: NotifAudience =
      mode === 'students' ? { all: true, roles: ['student'] }
      : mode === 'staff' ? { all: true, roles: ['teacher', 'supervisor'] }
      : mode === 'everyone' ? { all: true }
      : { class_ids: picked };
    setBusy(true);
    const res = await sendAnnouncement({ title: title.trim(), body: body.trim(), audience });
    setBusy(false);
    if (res.ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div role="dialog" aria-label="إعلان جديد" onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2"><Megaphone className="w-5 h-5 text-indigo-600" /> إعلان جديد</h3>
          <button onClick={onClose} aria-label="إغلاق" className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <input aria-label="عنوان الإعلان" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الإعلان"
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        <textarea aria-label="نص الإعلان" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="نص الإعلان..."
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">المستلمون</label>
          <select aria-label="المستلمون" value={mode} onChange={(e) => setMode(e.target.value as any)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold">
            {isAdmin && <option value="students">كل الطلاب</option>}
            {isAdmin && <option value="staff">المعلمون والمشرفون</option>}
            {isAdmin && <option value="everyone">كل المستخدمين</option>}
            <option value="classes">صفوف محددة</option>
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
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">إلغاء</button>
          <button onClick={send} disabled={busy} className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-60">إرسال الإعلان</button>
        </div>
      </div>
    </div>
  );
};

export const NotificationBell: React.FC = () => {
  const { currentUser, notifications, unreadCount, markNotificationsRead, setCurrentView } = useApp();
  const [open, setOpen] = useState(false);
  const [composer, setComposer] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canAnnounce = hasPerm(currentUser, 'can_send_announcements');

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (!currentUser) return null;

  const go = (n: (typeof notifications)[number]) => {
    if (!n.read) markNotificationsRead([n.id]);
    if (n.type === 'quiz_pending') setCurrentView('approvals');
    else if (n.type === 'award') setCurrentView(currentUser.role === 'student' ? 'my_points' : 'dashboard');
    else if (n.type === 'quiz_published' || n.type === 'retake_granted') setCurrentView('dashboard');
    setOpen(false);
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="الإشعارات"
          title="الإشعارات"
          className="relative p-2 text-slate-500 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span data-testid="notif-badge" className="absolute -top-0.5 -left-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div role="dialog" aria-label="قائمة الإشعارات" className="absolute left-0 mt-2 w-80 max-w-[85vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 text-right">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-black text-slate-900 dark:text-white">الإشعارات {unreadCount > 0 && <span className="text-rose-600">({unreadCount} جديد)</span>}</p>
              {unreadCount > 0 && (
                <button onClick={() => markNotificationsRead('all')} className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">تحديد الكل كمقروء</button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">لا توجد إشعارات حالياً</p>
              ) : (
                notifications.slice(0, 40).map((n) => (
                  <button key={n.id} onClick={() => go(n)} data-unread={!n.read}
                    className={`w-full text-right px-4 py-3 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${n.read ? '' : 'bg-indigo-50/60 dark:bg-indigo-950/30'}`}>
                    <span className="text-lg shrink-0">{ICONS[n.type] || '🔔'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.title}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                      </span>
                      <span className="block text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{n.body}</span>
                      <span className="block text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
            {canAnnounce && (
              <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => { setComposer(true); setOpen(false); }} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Megaphone className="w-4 h-4" /> إعلان جديد
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {composer && <AnnouncementModal onClose={() => setComposer(false)} />}
    </>
  );
};
