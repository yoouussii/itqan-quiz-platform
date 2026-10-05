import { supabase } from './supabase';
import { safe } from './remote';
import type { Grid } from '../utils/classRecords';

export type RecordKind = 'followup' | 'levels';
export interface RecordSheet {
  id: number; kind: RecordKind; file_key: string; file_name: string; folder_path: string; sheet_name: string;
  grid: Grid; last_edit_by: string; last_edit_at: string | null; source: 'drive' | 'upload'; synced_at: string;
}
export interface RecordsConfig {
  has_token: boolean; folders: Array<{ id: string; kind: RecordKind; url?: string }>; last_sync: string | null;
  log: Array<{ at: string; kind: RecordKind; file: string; sheets: number; source: 'drive' | 'upload' }>;
}

export async function fetchRecordSheets(): Promise<{ ok: boolean; rows: RecordSheet[] }> {
  const rows: RecordSheet[] = [];
  for (let page = 0; page < 20; page++) {
    const r = await safe<RecordSheet[]>(() => supabase.from('class_record_sheets').select('*').order('file_name').order('sheet_name').range(page * 200, page * 200 + 199) as any);
    if (!r.ok || !Array.isArray(r.data)) return { ok: page > 0, rows };
    rows.push(...r.data);
    if (r.data.length < 200) break;
  }
  return { ok: true, rows };
}

export interface RecordChange {
  id: number; kind: RecordKind; file_key: string; file_name: string; sheet_name: string; edited_by: string; edited_at: string;
  cells_changed: number; cells_filled: number; cells_cleared: number; initial: boolean;
}

/** أحداث التعديل (الأحدث أولاً) خلال آخر days يوماً؛ قائمة فارغة إن لم يُشغَّل 044 بعد */
export async function fetchRecordChanges(days = 400): Promise<RecordChange[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows: RecordChange[] = [];
  for (let page = 0; page < 10; page++) {
    const r = await safe<RecordChange[]>(() => supabase.from('class_record_changes').select('id,kind,file_key,file_name,sheet_name,edited_by,edited_at,cells_changed,cells_filled,cells_cleared,initial')
      .gte('edited_at', since).order('edited_at', { ascending: false }).order('id', { ascending: false }).range(page * 1000, page * 1000 + 999) as any);
    if (!r.ok || !Array.isArray(r.data)) break;
    rows.push(...r.data);
    if (r.data.length < 1000) break;
  }
  return rows;
}

export async function fetchRecordsConfig(): Promise<RecordsConfig | null> {
  const r = await safe<RecordsConfig>(() => supabase.rpc('itqan_records_config') as any);
  return r.ok && r.data ? r.data : null;
}

export async function setupRecords(folders: RecordsConfig['folders'], newToken: boolean) {
  const r = await safe<string | null>(() => supabase.rpc('itqan_records_setup', { p_folders: folders, p_new_token: newToken }) as any);
  return { ok: r.ok, token: r.data || null, error: r.error };
}

export async function importRecordFile(p: { kind: RecordKind; file_name: string; last_edit_by?: string; last_edit_at?: string; sheets: Array<{ sheet: string; grid: Grid }> }) {
  const r = await safe<{ sheets: number }>(() => supabase.rpc('itqan_records_import', { p_payload: { ...p, file_key: `upload:${p.file_name}`, full: true } }) as any);
  return { ok: r.ok, sheets: r.data?.sheets || 0, error: r.error };
}

export async function deleteRecordFile(kind: RecordKind, fileKey: string) {
  const r = await safe<any[]>(() => supabase.from('class_record_sheets').delete().eq('kind', kind).eq('file_key', fileKey).select('id') as any);
  return r.ok;
}

/** معرّف مجلد Drive من رابطه (أو المعرّف نفسه) */
export function folderIdFrom(v: string): string | null {
  const s = v.trim();
  const m = s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}
