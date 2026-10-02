/**
 * الإشعارات: صف واحد لكل إشعار مع وصف الجمهور المستهدف (كل / صفوف / طلاب / مستخدمون)،
 * وحالة "مقروء" لكل مستخدم في جدول منفصل. كل جهاز يحدد ما يخصه من الإشعارات.
 */
import { supabase } from './supabase';
import { safe, readJson, writeJson, newId } from './remote';

export type NotifType =
  | 'quiz_published' | 'quiz_pending' | 'quiz_approved' | 'quiz_rejected'
  | 'retake_granted' | 'award' | 'announcement';

export interface NotifAudience {
  all?: boolean;
  roles?: string[];
  class_ids?: string[];
  student_ids?: string[];
  user_ids?: string[];
}

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  audience: NotifAudience;
  ref_type?: string | null;
  ref_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

const NKEY = 'itqan_notifs_v1';
const PKEY = 'itqan_notif_pending_v1';
const rkey = (uid: string) => `itqan_notif_reads_v1_${uid}`;
const hkey = (uid: string) => `itqan_notif_hidden_v1_${uid}`;

export const loadNotifCache = (): AppNotification[] => readJson<AppNotification[]>(NKEY, []);
export const loadReads = (uid: string): Set<string> => new Set<string>(readJson<string[]>(rkey(uid), []));
/** الإشعارات التي حذفها المستخدم من عنده */
export const loadHidden = (uid: string): Set<string> => new Set<string>(readJson<string[]>(hkey(uid), []));

type Viewer = { id: string; role: string; class_id?: string | null; assigned_class_ids?: string[] };

export function isForUser(n: AppNotification, u: Viewer): boolean {
  if (n.created_by && n.created_by === u.id) return false; // لا نُشعر صاحب الإجراء نفسه
  const a = n.audience || {};
  if (a.user_ids?.includes(u.id)) return true;
  if (a.student_ids?.includes(u.id) && u.role === 'student') return true;
  const myClasses = [u.class_id, ...(u.assigned_class_ids || [])].filter(Boolean) as string[];
  if (a.class_ids?.length && u.role === 'student' && myClasses.some((c) => a.class_ids!.includes(c))) return true;
  if (a.all) return !a.roles || a.roles.length === 0 || a.roles.includes(u.role);
  if (a.roles?.length && !a.class_ids?.length && !a.student_ids?.length) return a.roles.includes(u.role);
  return false;
}

export function makeNotification(
  p: Pick<AppNotification, 'type' | 'title' | 'body' | 'audience'> & Partial<AppNotification>
): AppNotification {
  return { ref_type: null, ref_id: null, created_by: null, created_by_name: null, id: newId('ntf'), created_at: new Date().toISOString(), ...p };
}

export async function pushNotification(n: AppNotification): Promise<{ ok: boolean; error?: string }> {
  const cache = loadNotifCache();
  if (!cache.some((x) => x.id === n.id)) writeJson(NKEY, [n, ...cache].slice(0, 400));
  const res = await safe(() => supabase.from('notifications').insert(n) as any);
  if (!res.ok) writeJson(PKEY, [...readJson<AppNotification[]>(PKEY, []), n]);
  return { ok: res.ok, error: res.error };
}

/** جلب الإشعارات (آخر 45 يوماً). تُرجع true إذا تغيّر شيء */
export async function pullNotifications(): Promise<boolean> {
  const stillPending: AppNotification[] = [];
  for (const n of readJson<AppNotification[]>(PKEY, [])) {
    const r = await safe(() => supabase.from('notifications').upsert(n, { onConflict: 'id' }) as any);
    if (!r.ok) stillPending.push(n);
  }
  writeJson(PKEY, stillPending);

  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const res = await safe<AppNotification[]>(
    () => supabase.from('notifications').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(300) as any
  );
  if (!res.ok || !Array.isArray(res.data)) return false;

  const remoteIds = new Set(res.data.map((r) => r.id));
  const pendIds = new Set(stillPending.map((p) => p.id));
  const keepLocal = loadNotifCache().filter((n) => pendIds.has(n.id) && !remoteIds.has(n.id));
  const merged = [...res.data, ...keepLocal]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 400);
  const changed = JSON.stringify(merged.map((m) => m.id)) !== JSON.stringify(loadNotifCache().map((m) => m.id));
  writeJson(NKEY, merged);
  return changed;
}

export async function pullReads(uid: string): Promise<boolean> {
  const res = await safe<Array<{ notification_id: string; deleted_at?: string | null }>>(
    () => supabase.from('notification_reads').select('*').eq('user_id', uid).limit(2000) as any
  );
  if (!res.ok || !Array.isArray(res.data)) return false;
  const local = loadReads(uid);
  const hidden = loadHidden(uid);
  const before = local.size + hidden.size;
  res.data.forEach((r) => {
    local.add(r.notification_id);
    if (r.deleted_at) hidden.add(r.notification_id);
  });
  writeJson(rkey(uid), Array.from(local));
  writeJson(hkey(uid), Array.from(hidden));
  return local.size + hidden.size !== before;
}

/** حالة «مقروء + محذوف» لمستخدم (نفسه، أو أي مستخدم للمدير). بدون عمود deleted_at (قبل 005) تُحفظ «مقروء» فقط */
async function upsertDeleted(uid: string, ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const rows = ids.map((id) => ({ user_id: uid, notification_id: id, read_at: now, deleted_at: now }));
  let res = await safe(() => supabase.from('notification_reads').upsert(rows, { onConflict: 'user_id,notification_id' }) as any);
  if (!res.ok && /deleted_at/.test(res.error || '')) {
    res = await safe(() =>
      supabase.from('notification_reads').upsert(rows.map(({ deleted_at: _d, ...r }) => r), { onConflict: 'user_id,notification_id' }) as any
    );
    return { ok: false, error: 'حُذفت من هذا الجهاز فقط (شغّل تحديث قاعدة البيانات 005)' };
  }
  return { ok: res.ok, error: res.error };
}

/** حذف إشعارات من عند المستخدم نفسه (لا تُحذف عند غيره) */
export async function hideNotifications(uid: string, ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!ids.length) return { ok: true };
  const hidden = loadHidden(uid);
  ids.forEach((i) => hidden.add(i));
  writeJson(hkey(uid), Array.from(hidden));
  return upsertDeleted(uid, ids);
}

/** المدير: مسح إشعارات مستخدم معيّن من عنده */
export const hideNotificationsForUser = (uid: string, ids: string[]): Promise<{ ok: boolean; error?: string }> =>
  ids.length ? upsertDeleted(uid, ids) : Promise.resolve({ ok: true });

/** حذف نهائي من الجميع (المدير، أو مُرسل الإشعار) */
export async function deleteNotificationsEverywhere(ids: string[]): Promise<{ ok: boolean; error?: string; deleted: number }> {
  if (!ids.length) return { ok: true, deleted: 0 };
  let deleted = 0;
  let error: string | undefined;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await safe<any[]>(() => supabase.from('notifications').delete().in('id', chunk).select('id') as any);
    if (!res.ok) error = res.error;
    else deleted += (res.data || []).length;
  }
  if (deleted || !error) {
    const gone = new Set(ids);
    writeJson(NKEY, loadNotifCache().filter((n) => !gone.has(n.id)));
    writeJson(PKEY, readJson<AppNotification[]>(PKEY, []).filter((n) => !gone.has(n.id)));
  }
  return { ok: !error, error, deleted };
}

export async function markRead(uid: string, ids: string[]): Promise<void> {
  const local = loadReads(uid);
  ids.forEach((i) => local.add(i));
  writeJson(rkey(uid), Array.from(local));
  const rows = ids.map((id) => ({ user_id: uid, notification_id: id, read_at: new Date().toISOString() }));
  if (rows.length) await safe(() => supabase.from('notification_reads').upsert(rows, { onConflict: 'user_id,notification_id' }) as any);
}
