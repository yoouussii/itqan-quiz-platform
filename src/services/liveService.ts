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
  /** اجتماع خارجي (Zoom/Teams/Meet) بدل Jitsi؛ الرابط يظهر لمدير الحصة فقط (085) */
  external?: boolean; external_url?: string | null;
  /** مزوّد الحصة (086): خادم المدرسة، أو Zoom داخل المنصة، أو رابط خارجي */
  provider?: 'jitsi' | 'zoom' | 'external'; zoom_meeting?: string | null; zoom_passcode?: string | null;
  /** اعتماد المعلم لحضور الحصة (090) */
  att_submitted_at?: string | null;
  attended: { seconds: number; first_join: string } | null;
}
export interface LiveJoin {
  ok: boolean; error?: string; domain?: string; room?: string; jwt?: string | null;
  moderator?: boolean; name?: string; session?: LiveSession; external_url?: string;
  zoom?: { meetingNumber: string; password: string; userName: string; signature: string };
}
export interface LiveAttendee {
  user_id: string; name: string; class_id: string; first_join: string | null; last_seen: string | null; seconds: number; joins: number;
  /** بعد انتهاء الحصة (088) */
  status?: 'present' | 'late' | 'absent' | 'excused' | null;
  /** تعديل المعلم (090) */
  override?: 'present' | 'late' | 'absent' | 'excused' | null;
}
export interface LiveDraft {
  id?: string; title: string; notes: string; class_ids: string[]; subject_id: string | null;
  starts_at: string; duration_min: number; teacher_id?: string; period?: number | null; external_url?: string | null;
  zoom_meeting?: string | null; zoom_passcode?: string | null;
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

export async function setLive(id: string, patch: { status?: 'scheduled' | 'ended' | 'cancelled'; chat_locked?: boolean; title?: string }) {
  const args: Record<string, unknown> = { p_id: id, p_status: patch.status ?? null, p_chat_locked: patch.chat_locked ?? null };
  if (patch.title) args.p_title = patch.title; // 085
  const r = await safe<any>(() => supabase.rpc('itqan_live_set', args) as any);
  return { ok: r.ok, row: r.data ? norm(r.data) : null, error: r.error };
}

export async function joinLive(id: string): Promise<LiveJoin> {
  const r = await safe<LiveJoin>(() => supabase.rpc('itqan_live_join', { p_id: id }) as any);
  if (!r.ok || !r.data) return { ok: false, error: r.error || 'network' };
  return { ...r.data, session: r.data.session ? norm(r.data.session) : undefined };
}

export async function pingLive(id: string): Promise<{ ok: boolean; status?: LiveStatus; chat_locked?: boolean; title?: string }> {
  const r = await safe<any>(() => supabase.rpc('itqan_live_ping', { p_id: id }) as any);
  return r.data || { ok: false };
}

export async function liveAttendance(id: string): Promise<LiveAttendee[] | null> {
  const r = await safe<LiveAttendee[]>(() => supabase.rpc('itqan_live_attendance', { p_id: id }) as any);
  return r.ok ? r.data || [] : null;
}

/** المعلم يعدّل حالات الحضور ويعتمدها (090) */
export async function setLiveAttendance(id: string, marks: Record<string, string | null>, submit: boolean) {
  return safe<{ ok: boolean; changed: number; submitted_at: string | null }>(() => supabase.rpc('itqan_live_attendance_set', { p_id: id, p_marks: marks, p_submit: submit }) as any);
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

/** رابط الحصة داخل المنصة (يفتح صفحة الحصص ويدخل الحصة بعد تسجيل الدخول) */
export const liveLink = (id: string) => `${window.location.origin}/live?s=${encodeURIComponent(id)}`;
export async function copyLiveLink(id: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(liveLink(id)); return true; } catch { window.prompt('', liveLink(id)); return false; }
}
/** دعوة Zoom للحصة (للمعلم): رابط الاجتماع ورمز المرور، لمشاركتها مع من يدخل من تطبيق Zoom */
export async function copyZoomInvite(s: LiveSession): Promise<boolean> {
  if (!s.zoom_meeting) return false;
  const text = [s.title, `https://zoom.us/j/${s.zoom_meeting}`, `Meeting ID: ${s.zoom_meeting.replace(/(\d{3})(\d{3,4})(\d+)/, '$1 $2 $3')}`,
    s.zoom_passcode ? `Passcode: ${s.zoom_passcode}` : ''].filter(Boolean).join('\n');
  try { await navigator.clipboard.writeText(text); return true; } catch { window.prompt('', text); return false; }
}

/** فتح اجتماع خارجي: نافذة جديدة، وإن منعها المتصفح فالصفحة نفسها */
export function openExternal(url: string, tab?: Window | null) {
  // تاب مفتوح مسبقاً لحظة الضغط (المتصفح يمنع فتحه بعد انتظار الخادم) فتبقى المنصة مفتوحة.
  // ملاحظة: window.open مع 'noopener' يعيد null دائماً، فكان يُحوّل الصفحة نفسها إلى Zoom.
  const w = tab && !tab.closed ? tab : window.open(url, '_blank');
  if (!w) { window.location.href = url; return; }
  try { w.opener = null; } catch { /* ignore */ }
  if (w === tab) w.location.href = url;
}
/** نوع الاجتماع الخارجي من الرابط (للعرض) */
export const externalKind = (url?: string | null) =>
  !url ? '' : /zoom\./i.test(url) ? 'Zoom' : /teams\.(microsoft|live)\./i.test(url) ? 'Teams' : /meet\.google\./i.test(url) ? 'Google Meet' : '';

/** مفاتيح تطبيق Zoom Meeting SDK للمعلم الحالي (086): السرّ لا يُعاد أبداً */
export async function zoomKeysStatus(): Promise<{ configured: boolean; client_id?: string | null; meeting?: string | null; passcode?: string | null }> {
  const r = await safe<any>(() => supabase.rpc('itqan_zoom_keys_status') as any);
  return r.data || { configured: false };
}
export async function setZoomKeys(clientId: string, secret: string | null) {
  return safe<any>(() => supabase.rpc('itqan_zoom_keys_set', { p_client_id: clientId, p_secret: secret }) as any);
}
/** اجتماع المعلم الثابت في Zoom (089): يُستخدم في كل حصصه من الجدول */
export async function setZoomMeeting(meeting: string, passcode: string) {
  return safe<any>(() => supabase.rpc('itqan_zoom_meeting_set', { p_meeting: meeting, p_passcode: passcode }) as any);
}

/** جدول الحصص الأونلاين (089) */
export interface TimetableRow { class_id: string; dow: number; period: number; teacher_id: string | null; subject_id: string | null; title: string }
export async function getTimetable(): Promise<TimetableRow[]> {
  const r = await safe<TimetableRow[]>(() => supabase.rpc('itqan_live_timetable_get') as any);
  return r.data || [];
}
export async function applyTimetable(rows: TimetableRow[], periods: LivePeriod[], from: string, to: string, replace: boolean) {
  return safe<{ ok: boolean; created: number; deleted: number; skipped: number }>(() => supabase.rpc('itqan_live_timetable_apply', {
    p_rows: rows, p_periods: periods, p_from: from, p_to: to, p_replace: replace,
  }) as any);
}

/** رقم الاجتماع من رابط دعوة Zoom أو من الرقم نفسه (بمسافات أو شرطات) */
export function parseZoomMeeting(v: string): string {
  const m = v.match(/\/j\/(\d{9,12})/) || v.match(/\/wc\/(\d{9,12})/);
  if (m) return m[1];
  const d = v.replace(/[^0-9]/g, '');
  return d.length >= 9 && d.length <= 12 ? d : '';
}
