import { supabase } from './supabase';
import { safe } from './remote';

export interface RolloverOptions {
  label: string;
  /** من فصل ← إلى فصل ('' = تخرّج بلا فصل). الفصول غير المذكورة تبقى كما هي */
  map: Record<string, string>;
  archive_quizzes: boolean;
  clear_attendance: boolean;
  clear_behavior: boolean;
}
export interface RolloverSummary {
  moved: number; graduated: number; archived_quizzes: number; attendance_deleted: number; behavior_deleted: number;
}
export interface YearHistoryRow { label: string; done_at: string; done_by_name: string; summary: RolloverSummary }
export interface DbUsage { db_bytes: number; tables: { name: string; schema: string; bytes: number; rows: number }[] }

/** حد قاعدة البيانات في الخطة المجانية لـ Supabase */
export const FREE_DB_LIMIT = 500 * 1024 * 1024;

export async function runRollover(p: RolloverOptions) {
  const r = await safe<RolloverSummary>(() => supabase.rpc('itqan_year_rollover', { p }) as any);
  return { ok: r.ok, data: r.data, error: r.error };
}

export async function fetchYearHistory(): Promise<YearHistoryRow[]> {
  const r = await safe<YearHistoryRow[]>(() => supabase.rpc('itqan_year_history') as any);
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

export async function fetchDbUsage(): Promise<DbUsage | null> {
  const r = await safe<DbUsage>(() => supabase.rpc('itqan_db_usage') as any);
  return r.ok && r.data ? r.data : null;
}

// ---------------------------------------------------------------------
// النسخة الاحتياطية
// ---------------------------------------------------------------------
export const BACKUP_TABLES: { table: string; label: string }[] = [
  { table: 'users', label: 'المستخدمون' },
  { table: 'classes', label: 'الفصول' },
  { table: 'subjects', label: 'المواد' },
  { table: 'branches', label: 'الفروع' },
  { table: 'quizzes', label: 'الاختبارات' },
  { table: 'submissions', label: 'المشاركات' },
  { table: 'question_bank', label: 'بنك الأسئلة' },
  { table: 'attendance_records', label: 'الحضور' },
  { table: 'attendance_roster', label: 'سجل الحضور فقط' },
  { table: 'behavior_records', label: 'السلوك' },
  { table: 'gradebook_columns', label: 'أعمدة كشف الدرجات' },
  { table: 'gradebook_marks', label: 'درجات الكشف' },
  { table: 'gradebook_weights', label: 'أوزان الاختبارات' },
  { table: 'homework', label: 'الواجبات' },
  { table: 'homework_submissions', label: 'تسليمات الواجبات' },
  { table: 'academic_support', label: 'الدعم الأكاديمي' },
  { table: 'academic_support_progress', label: 'قياسات الدعم الأكاديمي' },
  { table: 'attendance_notes', label: 'ملاحظات الحضور' },
  { table: 'class_record_sheets', label: 'سجلات المتابعة' },
  { table: 'class_record_changes', label: 'تعديلات سجلات المتابعة' },
  { table: 'class_visits', label: 'الزيارات الصفية' },
  { table: 'surveys', label: 'الاستبيانات' },
  { table: 'survey_responses', label: 'إجابات الاستبيانات' },
  { table: 'certificates', label: 'الشهادات' },
  { table: 'student_awards', label: 'الجوائز' },
  { table: 'notifications', label: 'الإشعارات' },
  { table: 'banners', label: 'البانرات' },
  { table: 'app_settings', label: 'الإعدادات' },
  { table: 'activity_log', label: 'سجل النشاط' },
];

async function fetchAll(table: string): Promise<{ ok: boolean; rows: any[] }> {
  const rows: any[] = [];
  for (let page = 0; page < 200; page++) {
    const r = await safe<any[]>(() => supabase.from(table).select('*').range(page * 1000, page * 1000 + 999) as any);
    if (!r.ok || !Array.isArray(r.data)) return { ok: page > 0, rows };
    rows.push(...r.data);
    if (r.data.length < 1000) break;
  }
  return { ok: true, rows };
}

export interface BackupData { version: 1; exported_at: string; tables: Record<string, any[]>; failed: string[] }

export async function collectBackup(onProgress?: (label: string, i: number, n: number) => void): Promise<BackupData> {
  const out: BackupData = { version: 1, exported_at: new Date().toISOString(), tables: {}, failed: [] };
  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const { table, label } = BACKUP_TABLES[i];
    onProgress?.(label, i, BACKUP_TABLES.length);
    const r = await fetchAll(table);
    if (!r.ok) { out.failed.push(table); continue; }
    // كلمات المرور لا تُخزَّن في users (مشفرة في جدول منفصل)، ونحذف الحقل احتياطاً
    out.tables[table] = table === 'users' ? r.rows.map(({ password: _p, ...u }) => u) : r.rows;
  }
  return out;
}

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

const stamp = () => new Date().toISOString().slice(0, 10);

export function downloadBackupJson(b: BackupData) {
  download(new Blob([JSON.stringify(b)], { type: 'application/json' }), `itqan-backup-${stamp()}.json`);
}

/** Excel للقراءة: ورقة لكل جدول، والحقول المركبة نصاً (حد الخلية في Excel 32767 حرفاً) */
export async function downloadBackupExcel(b: BackupData) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const { table, label } of BACKUP_TABLES) {
    const rows = b.tables[table];
    if (!rows) continue;
    const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => {
      const s = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      return [k, typeof s === 'string' && s.length > 32000 ? `${s.slice(0, 32000)}…` : s];
    })));
    const ws = flat.length ? XLSX.utils.json_to_sheet(flat) : XLSX.utils.aoa_to_sheet([['—']]);
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `itqan-backup-${stamp()}.xlsx`);
}

export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
