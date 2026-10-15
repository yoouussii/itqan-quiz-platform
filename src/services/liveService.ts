import { supabase } from './supabase';
import { safe } from './remote';

/** الحصص المباشرة (083): Jitsi على خادم المدرسة، والدخول برمز يوقّعه الخادم */
export type LiveStatus = 'scheduled' | 'live' | 'ended' | 'cancelled' | 'missed';
/** موعد حصة ثابت من جدول المدرسة (يحدده المدير): بدايتها HH:MM ومدتها بالدقائق */
export interface LivePeriod { start: string; minutes: number }
export const periodEnd = (p: LivePeriod) => {
  const [h, m] = p.start.split(':').map(Number);
  const x = h * 60 + m + (Number(p.minutes) || 0);
  return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
export interface LiveSession {
  id: string; series_id: string | null; class_ids: string[]; subject_id: string | null;
  teacher_id: string; teacher_name: string; title: string; notes: string;
  starts_at: string; duration_min: number; period: number | null; status: LiveStatus;
  started_at: string | null; ended_at: string | null; chat_locked: boolean; can_manage: boolean;
  attended: { seconds: number; first_join: string } | null;
}
export interface LiveJoin {
  ok: boolean; error?: string; domain?: string; room?: string; jwt?: string | null;
  moderator?: boolean; name?: string; session?: LiveSession;
}
export interface LiveAttendee {
  user_id: string; name: string; class_id: string; first_join: string | null; last_seen: string | null; seconds: number; joins: number;
}
export interface LiveDraft {
  id?: string; title: string; notes: string; class_ids: string[]; subject_id: string | null;
  starts_at: string; duration_min: number; teacher_id?: string; period?: number | null;
}

const norm = (s: any): LiveSession => ({ ...s, class_ids: Array.isArray(s.class_ids) ? s.class_ids : [], duration_min: Number(s.duration_min) || 35 });

export async function listLive(from: Date, to: Date): Promise<{ ok: boolean; rows: LiveSession[]; error?: string }> {
  const r = await safe<any[]>(() => supabase.rpc('itqan_live_list', { p_from: from.toISOString(), p_to: to.toISOString() }) as any);
  return { ok: r.ok, rows: (r.data || []).map(norm), error: r.error };
}

export async function saveLive(d: LiveDraft, repeatUntil?: string | null, weekdays?: number[]) {
  return safe<any>(() => supabase.rpc('itqan_live_save', { p: d, p_repeat_until: repeatUntil || null, p_weekdays: weekdays?.length ? weekdays : null }) as any);
}

export async function deleteLive(ids: string[], seriesFrom = false) {
  return safe<number>(() => supabase.rpc('itqan_live_delete', { p_ids: ids, p_series_from: seriesFrom }) as any);
}

export async function setLive(id: string, patch: { status?: 'scheduled' | 'ended' | 'cancelled'; chat_locked?: boolean }) {
  const r = await safe<any>(() => supabase.rpc('itqan_live_set', { p_id: id, p_status: patch.status ?? null, p_chat_locked: patch.chat_locked ?? null }) as any);
  return { ok: r.ok, row: r.data ? norm(r.data) : null, error: r.error };
}

export async function joinLive(id: string): Promise<LiveJoin> {
  const r = await safe<LiveJoin>(() => supabase.rpc('itqan_live_join', { p_id: id }) as any);
  if (!r.ok || !r.data) return { ok: false, error: r.error || 'network' };
  return { ...r.data, session: r.data.session ? norm(r.data.session) : undefined };
}

export async function pingLive(id: string): Promise<{ ok: boolean; status?: LiveStatus; chat_locked?: boolean }> {
  const r = await safe<any>(() => supabase.rpc('itqan_live_ping', { p_id: id }) as any);
  return r.data || { ok: false };
}

export async function liveAttendance(id: string): Promise<LiveAttendee[] | null> {
  const r = await safe<LiveAttendee[]>(() => supabase.rpc('itqan_live_attendance', { p_id: id }) as any);
  return r.ok ? r.data || [] : null;
}

export async function liveConfigStatus(): Promise<{ configured: boolean; app_id?: string }> {
  const r = await safe<any>(() => supabase.rpc('itqan_live_config_status') as any);
  return r.data || { configured: false };
}

export async function setLiveConfig(appId: string, secret: string | null) {
  return safe<any>(() => supabase.rpc('itqan_live_config_set', { p_app_id: appId, p_secret: secret }) as any);
}

/** نافذة الحصة: من 10 دقائق قبلها حتى نهايتها */
export const liveEnd = (s: LiveSession) => new Date(new Date(s.starts_at).getTime() + s.duration_min * 60000);
export const isSoon = (s: LiveSession, now = Date.now()) => {
  const st = new Date(s.starts_at).getTime();
  return s.status === 'scheduled' && now >= st - 10 * 60000 && now <= liveEnd(s).getTime();
};

/** سرّ عشوائي قوي لرموز الدخول (يُنسخ مرة واحدة لخادم Jitsi) */
export const randomSecret = () => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

/** تحميل مكتبة Jitsi من خادم المدرسة مرة واحدة */
let apiLoad: Promise<any> | null = null;
let apiDomain = '';
export function loadJitsiApi(domain: string): Promise<any> {
  const w = window as any;
  if (w.JitsiMeetExternalAPI && apiDomain === domain) return Promise.resolve(w.JitsiMeetExternalAPI);
  if (apiLoad && apiDomain === domain) return apiLoad;
  apiDomain = domain;
  apiLoad = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://${domain}/external_api.js`;
    s.async = true;
    s.onload = () => (w.JitsiMeetExternalAPI ? resolve(w.JitsiMeetExternalAPI) : reject(new Error('no_api')));
    s.onerror = () => { apiLoad = null; reject(new Error('load_failed')); };
    document.head.appendChild(s);
  });
  return apiLoad;
}

/** دخول مباشر من بطاقة الرئيسية: تحفظ الحصة المطلوبة وتفتحها صفحة الحصص */
let pendingJoin: string | null = null;
export const setPendingJoin = (id: string | null) => { pendingJoin = id; };
export const takePendingJoin = () => { const v = pendingJoin; pendingJoin = null; return v; };
