import { supabase } from './supabase';
import { safe } from './remote';
import type { AttKind, SheetPayload } from '../utils/attendanceSheet';

export interface AttRecord { id: number; student_id: string; day: string; kind: AttKind; source: 'sheet' | 'manual'; note: string; created_at: string }
export interface AttConfig {
  start_date: string | null;
  weeks: number;
  threshold: number;
  sheet_classes: Record<string, string>;
  /** أسماء فصول شيتات «سجل فقط» التي كتبها المسؤول (027) */
  sheet_labels?: Record<string, string>;
  /** آخر ما وصل من كل شيت (026) */
  sheets?: Record<string, { students: number; unmatched: number; at: string }>;
  has_token: boolean;
  ignored?: string[];
  log: Array<{ id?: number; at: string; source: 'upload' | 'sheet_sync'; by: string; summary: { sheets: number; matched: number; marks: number; unmatched: number } }>;
  unmatched: Array<{ sheet: string; name: string; count: number }>;
}
export interface ImportResult { sheets: number; matched: number; marks: number; roster?: number; unmatched: Array<{ sheet: string; name: string }> }
/** طالب في سجل الحضور فقط (بلا حساب على المنصة) */
export interface RosterStudent { id: string; sheet: string; name: string }
/** قيمة الشيت في sheet_classes عندما يكون «سجل فقط (بدون حسابات)» */
export const ROSTER_SHEET = '__roster__';
/** معرّف الفصل الافتراضي لطلاب شيت «سجل فقط» */
export const rosterClassId = (sheet: string) => `roster:${sheet}`;
const ORD = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
const WORDS: Record<string, number> = { 'اول': 1, 'ثاني': 2, 'ثالث': 3, 'رابع': 4, 'خامس': 5, 'سادس': 6, 'سابع': 7, 'ثامن': 8, 'تاسع': 9, 'عاشر': 10 };
/** اسم العرض لشيت «سجل فقط»: «1» أو «١» أو «اول» ← «الصف الأول» */
export function rosterClassName(sheet: string): string {
  const d = sheet.trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  const w = d.replace(/^(الصف\s*)?(ال)?/, '').replace(/[أإآ]/g, 'ا');
  const n = /^\d{1,2}$/.test(d) ? Number(d) : WORDS[w] || 0;
  return ORD[n] ? `الصف ${ORD[n]}` : sheet;
}

const errText = (e?: string) => {
  if (!e) return 'failed';
  for (const k of ['no_start_date', 'forbidden', 'invalid_token', 'bad_payload', 'not_student']) if (e.includes(k)) return k;
  return e;
};

/** سجلات الحضور في فترة (RLS يحدد ما يراه المستخدم) */
export async function fetchAttendance(from: string, to: string, studentIds?: string[]): Promise<AttRecord[] | null> {
  const all: AttRecord[] = [];
  for (let page = 0; page < 50; page++) {
    const r = await safe<AttRecord[]>(() => {
      let q: any = supabase.from('attendance_records').select('id,student_id,day,kind,source,note,created_at').gte('day', from).lte('day', to);
      if (studentIds?.length) q = q.in('student_id', studentIds);
      return q.order('day', { ascending: false }).range(page * 1000, page * 1000 + 999);
    });
    if (!r.ok || !Array.isArray(r.data)) return page ? all : null;
    all.push(...r.data);
    if (r.data.length < 1000) break;
  }
  return all;
}

/** طلاب سجل الحضور بلا حسابات */
export async function fetchRoster(): Promise<RosterStudent[]> {
  const r = await safe<RosterStudent[]>(() => supabase.from('attendance_roster').select('id,sheet,name').order('name').range(0, 4999) as any);
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

export async function fetchAttendanceConfig(): Promise<AttConfig | null> {
  const r = await safe<AttConfig>(() => supabase.rpc('itqan_attendance_config') as any);
  return r.ok && r.data ? r.data : null;
}

export async function saveAttendanceConfig(p: Partial<Pick<AttConfig, 'start_date' | 'weeks' | 'threshold' | 'sheet_classes' | 'sheet_labels'>>) {
  const r = await safe(() => supabase.rpc('itqan_attendance_config_save', { p }) as any);
  return { ok: r.ok, error: r.ok ? undefined : errText(r.error) };
}

export async function newAttendanceToken(): Promise<{ token?: string; error?: string }> {
  const r = await safe<string>(() => supabase.rpc('itqan_attendance_new_token') as any);
  return r.ok && r.data ? { token: r.data } : { error: errText(r.error) };
}

export async function importAttendance(payload: SheetPayload): Promise<{ result?: ImportResult; error?: string }> {
  const r = await safe<ImportResult>(() => supabase.rpc('itqan_attendance_import', { p_payload: payload }) as any);
  return r.ok && r.data ? { result: r.data } : { error: errText(r.error) };
}

/** تجاهل اسم / تسجيله بدون حساب / إلغاء التجاهل (028) */
export async function unmatchedAction(sheet: string, name: string, action: 'ignore' | 'roster' | 'unignore') {
  const r = await safe<number>(() => supabase.rpc('itqan_attendance_unmatched_action', { p_sheet: sheet, p_name: name, p_action: action }) as any);
  return { ok: r.ok, applied: r.data || 0, error: r.ok ? undefined : errText(r.error) };
}

/** حذف سطر من سجل المزامنة أو مسحه كله */
export async function clearSyncLog(id?: number) {
  const r = await safe(() => supabase.rpc('itqan_attendance_log_clear', { p_id: id ?? null }) as any);
  return { ok: r.ok };
}

export async function linkAttendanceName(sheet: string, name: string, studentId: string) {
  const r = await safe<number>(() => supabase.rpc('itqan_attendance_link', { p_sheet: sheet, p_name: name, p_student_id: studentId }) as any);
  return { ok: r.ok, applied: r.data || 0, error: r.ok ? undefined : errText(r.error) };
}

export async function addAttendance(rec: { student_id: string; day: string; kind: AttKind; note?: string; created_by: string }) {
  const r = await safe(() => supabase.from('attendance_records').insert({ ...rec, source: 'manual', note: rec.note || '' }) as any);
  return { ok: r.ok, error: r.error };
}

export async function deleteAttendance(id: number) {
  const r = await safe(() => supabase.from('attendance_records').delete().eq('id', id) as any);
  return { ok: r.ok, error: r.error };
}

/** أيام الدراسة (الأحد–الخميس) بين تاريخين شاملين */
export function schoolDaysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`); const b = new Date(`${to}T12:00:00`);
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (d.getDay() <= 4) n++;
  return n;
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
