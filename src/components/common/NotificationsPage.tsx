import React, { useState } from 'react';
import { Bell, CheckCheck, ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NOTIF_ICONS, NotifBody, timeAgo, useOpenNotification } from './NotificationBell';

/** صفحة كل الإشعارات: النص كاملاً ومرتباً، مع زر للإجراء (بدء الاختبار، عرض النتيجة...) */
export const NotificationsPage: React.FC = () => {
  const { notifications, unreadCount, markNotificationsRead } = useApp();
  const { actionFor, open } = useOpenNotification();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const list = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-indigo-600" /> الإشعارات
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : 'لا توجد إشعارات جديدة'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
            {(['all', 'unread'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg ${filter === f ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>
                {f === 'all' ? 'الكل' : 'غير المقروءة'}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button onClick={() => markNotificationsRead('all')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950">
              <CheckCheck className="w-4 h-4" /> تحديد الكل كمقروء
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-16">لا توجد إشعارات</p>
      ) : (
        <ul className="space-y-3">
          {list.map((n) => {
            const action = actionFor(n);
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
                      {timeAgo(n.created_at)}{n.created_by_name ? ` • من: ${n.created_by_name}` : ''}
                    </span>
                    <div className="flex gap-2">
                      {!n.read && (
                        <button onClick={() => markNotificationsRead([n.id])}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                          تحديد كمقروء
                        </button>
                      )}
                      {action && (
                        <button onClick={() => open(n, 'notifications')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                          {action.label} <ArrowLeft className="w-3.5 h-3.5" />
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
