import React, { useMemo, useState } from 'react';
import { Bell, CheckCheck, ArrowLeft, Trash2, ShieldAlert, UserX } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NOTIF_ICONS, NotifBody, timeAgo, useOpenNotification } from './NotificationBell';
import { describeAudience, isStudentAudience } from './notificationActions';
import { uiDir, t } from '../../i18n';
import { DevicePushCard } from './DevicePushCard';
import { EmptyMascot } from './Mascot';

const btnGhost = 'px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800';
const btnDanger =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50';

/** إدارة كل إشعارات النظام (المدير): حذف نهائي، حذف جماعي، مسح إشعارات مستخدم */
const AdminNotifications: React.FC = () => {
  const { allNotifications, classes, users, deleteNotificationsForAll, clearUserNotifications } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(
    () => [...allNotifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [allNotifications]
  );
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    setPicked([]);
  };
  const removeIds = (ids: string[], label: string) => {
    if (!ids.length) return;
    if (!window.confirm(`حذف ${ids.length} ${label} نهائياً من عند الجميع؟ لا يمكن التراجع.`)) return;
    void run(() => deleteNotificationsForAll(ids));
  };
  const studentIds = sorted.filter((n) => isStudentAudience(n.audience || {})).map((n) => n.id);
  const oldIds = sorted.filter((n) => Date.now() - new Date(n.created_at).getTime() > 30 * 864e5).map((n) => n.id);
  const allPicked = picked.length > 0 && picked.length === sorted.length;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <p className="text-xs font-black text-slate-900 dark:text-white">{t('إجراءات سريعة')}</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !studentIds.length} onClick={() => removeIds(studentIds, t('إشعاراً موجهاً للطلاب'))} className={btnDanger}>
            <Trash2 className="w-3.5 h-3.5" />{' '}{t('حذف كل إشعارات الطلاب (')}{studentIds.length})
          </button>
          <button disabled={busy || !oldIds.length} onClick={() => removeIds(oldIds, t('إشعاراً أقدم من 30 يوماً'))} className={btnDanger}>
            <Trash2 className="w-3.5 h-3.5" />{' '}{t('حذف الأقدم من 30 يوماً (')}{oldIds.length})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <UserX className="w-4 h-4 text-slate-400" />
          <select aria-label={t('اختر مستخدماً')} value={userId} onChange={(e) => setUserId(e.target.value)}
            className="flex-1 min-w-[180px] px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
            <option value="">{t('— مسح كل إشعارات مستخدم معيّن —')}</option>
            {users.filter((u) => u.role !== 'admin').map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.national_id})</option>
            ))}
          </select>
          <button disabled={busy || !userId} className={btnDanger}
            onClick={() => {
              const u = users.find((x) => x.id === userId);
              if (u && window.confirm(`مسح كل الإشعارات من عند ${u.name}؟ (لا تُحذف عند غيره)`)) void run(() => clearUserNotifications(userId));
            }}>
            {t('مسح إشعاراته')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" className="accent-indigo-600" checked={allPicked}
            onChange={() => setPicked(allPicked ? [] : sorted.map((n) => n.id))} />
          {t('تحديد الكل (')}{sorted.length})
        </label>
        <button disabled={busy || !picked.length} onClick={() => removeIds(picked, t('إشعاراً محدداً'))} className={btnDanger}>
          <Trash2 className="w-3.5 h-3.5" />{' '}{t('حذف المحدد نهائياً (')}{picked.length})
        </button>
      </div>

      {sorted.length === 0 ? (
        <EmptyMascot text={t('لا توجد إشعارات في النظام')} />
      ) : (
        <ul className="space-y-2">
          {sorted.map((n) => (
            <li key={n.id} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-3">
              <input type="checkbox" aria-label={t('تحديد {title}', { title: n.title })} className="accent-indigo-600 mt-1"
                checked={picked.includes(n.id)}
                onChange={() => setPicked(picked.includes(n.id) ? picked.filter((x) => x !== n.id) : [...picked, n.id])} />
              <span className="text-lg shrink-0">{NOTIF_ICONS[n.type] || '🔔'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 dark:text-white">{n.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('إلى:')}{' '}{describeAudience(n.audience || {}, classes, users)} • {timeAgo(n.created_at)}
                  {n.created_by_name ? ` • من: ${n.created_by_name}` : ''}
                </p>
              </div>
              <button disabled={busy} onClick={() => removeIds([n.id], t('إشعار'))} aria-label={t('حذف نهائي')} title={t('حذف نهائي من الجميع')}
                className="self-start p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** صفحة كل الإشعارات: النص كاملاً ومرتباً، مع زر للإجراء (بدء الاختبار، عرض النتيجة...) وحذف */
export const NotificationsPage: React.FC = () => {
  const { currentUser, notifications, unreadCount, markNotificationsRead, deleteMyNotifications, deleteNotificationsForAll } = useApp();
  const { actionFor, open } = useOpenNotification();
  const [filter, setFilter] = useState<'all' | 'unread' | 'manage'>('all');
  const isAdmin = currentUser?.role === 'admin';
  const list = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6" dir={uiDir()}>
      <DevicePushCard />
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-indigo-600" />{' '}{t('الإشعارات')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {unreadCount > 0 ? t('{n} إشعار غير مقروء', { n: unreadCount }) : t('لا توجد إشعارات جديدة')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
            {(['all', 'unread', ...(isAdmin ? ['manage'] : [])] as Array<'all' | 'unread' | 'manage'>).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg inline-flex items-center gap-1 ${filter === f ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>
                {f === 'manage' && <ShieldAlert className="w-3.5 h-3.5" />}
                {f === 'all' ? t('الكل') : f === 'unread' ? t('غير المقروءة') : t('إدارة إشعارات النظام')}
              </button>
            ))}
          </div>
          {filter !== 'manage' && unreadCount > 0 && (
            <button onClick={() => markNotificationsRead('all')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950">
              <CheckCheck className="w-4 h-4" />{' '}{t('تحديد الكل كمقروء')}
            </button>
          )}
          {filter !== 'manage' && notifications.length > 0 && (
            <button onClick={() => window.confirm(t('حذف كل إشعاراتك؟ (تُحذف من عندك فقط)')) && void deleteMyNotifications('all')}
              className={btnDanger}>
              <Trash2 className="w-3.5 h-3.5" />{' '}{t('حذف الكل')}
            </button>
          )}
        </div>
      </div>

      {filter === 'manage' && isAdmin ? (
        <AdminNotifications />
      ) : list.length === 0 ? (
        <EmptyMascot text={t('لا توجد إشعارات')} />
      ) : (
        <ul className="space-y-3">
          {list.map((n) => {
            const action = actionFor(n);
            const mine = !isAdmin && n.created_by === currentUser?.id;
            return (
              <li key={n.id}
                className={`p-4 rounded-2xl border flex gap-3 ${
                  n.read
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    : 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900'
                }`}>
                <span className="text-2xl shrink-0">{NOTIF_ICONS[n.type] || '🔔'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-black text-slate-900 dark:text-white">{n.title}</p>
                    {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                  </div>
                  <NotifBody body={n.body} />
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                    <span className="text-[11px] text-slate-400">
                      {timeAgo(n.created_at)}{n.created_by_name ? ` • ${t('من: {name}', { name: n.created_by_name })}` : ''}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {!n.read && (
                        <button onClick={() => markNotificationsRead([n.id])} className={btnGhost}>{t('تحديد كمقروء')}</button>
                      )}
                      <button onClick={() => void deleteMyNotifications([n.id])} className={btnGhost} aria-label={t('حذف الإشعار')}>
                        <Trash2 className="w-3.5 h-3.5 inline -mt-0.5" />{' '}{t('حذف')}
                      </button>
                      {mine && (
                        <button onClick={() => window.confirm(t('حذف هذا الإشعار من عند كل من أُرسل إليهم؟')) && void deleteNotificationsForAll([n.id])}
                          className={btnDanger}>
                          {t('حذف من الجميع')}
                        </button>
                      )}
                      {action && (
                        <button onClick={() => open(n, 'notifications')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                          {action.label} <ArrowLeft className="w-3.5 h-3.5 dir-icon" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
