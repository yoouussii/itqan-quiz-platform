// قراءة شيتات «سجلات المتابعة الصفية» و«تتبع مستويات الطلاب» من شبكة القيم (كما في Google Sheets / Excel).
// الشكل يختلف بين المواد والمعلمين، فالقراءة مرنة: نبحث عن صف «اسم الطالب» وصف الدرجات العظمى.

export type Cell = string | number | boolean | null;
export type Grid = Cell[][];

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const toNum = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = norm(v).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  if (s === 'صفر') return 0;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
};

// ---------------------------------------------------------------------
// سجل المتابعة الصفية: صف «اسم الطالب»، صفوف عناوين، صف الدرجات العظمى، ثم الطلاب
// ---------------------------------------------------------------------
export interface FollowColumn { col: number; label: string; max: number | null; total: boolean }
export interface FollowStudent { name: string; values: Array<number | null>; total: number | null }
export interface FollowSheet { title: string; columns: FollowColumn[]; students: FollowStudent[]; filled: number; cells: number }

export function parseFollowup(grid: Grid): FollowSheet | null {
  let h = -1, nameCol = -1;
  for (let r = 0; r < Math.min(grid.length, 40) && h < 0; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) if (norm(row[c]) === 'اسم الطالب') { h = r; nameCol = c; break; }
  }
  if (h < 0) return null;
  // صف الدرجات العظمى: أول صف بعد العناوين بلا اسم وفيه رقمان على الأقل
  let maxRow = -1;
  for (let r = h + 1; r < Math.min(grid.length, h + 15); r++) {
    const row = grid[r] || [];
    const nums = row.filter((v, c) => c !== nameCol && toNum(v) !== null).length;
    if (!norm(row[nameCol]) && nums >= 2) { maxRow = r; }
    if (maxRow >= 0 && norm((grid[r + 1] || [])[nameCol])) break;
  }
  if (maxRow < 0) return null;
  const title = norm((grid[h] || []).find((v, c) => c !== nameCol && norm(v)) ?? '');
  const width = Math.max(...grid.slice(h, maxRow + 1).map((r) => (r || []).length));
  const columns: FollowColumn[] = [];
  for (let c = 0; c < width; c++) {
    if (c === nameCol) continue;
    const heads: string[] = [];
    for (let r = h + 1; r < maxRow; r++) { const v = norm((grid[r] || [])[c]); if (v && toNum(v) === null) heads.push(v); }
    const total = heads.some((x) => x.includes('المجموع'));
    const max = toNum((grid[maxRow] || [])[c]);
    if (max === null && !total) continue;
    columns.push({ col: c, label: heads[heads.length - 1] || heads[0] || `عمود ${c + 1}`, max, total });
  }
  const students: FollowStudent[] = [];
  let empties = 0;
  for (let r = maxRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const name = norm(row[nameCol]);
    if (!name) { if (++empties >= 3) break; continue; }
    empties = 0;
    if (toNum(name) !== null) continue;
    const vals = columns.filter((k) => !k.total).map((k) => toNum(row[k.col]));
    const tcol = columns.find((k) => k.total);
    students.push({ name, values: vals, total: tcol ? toNum(row[tcol.col]) : vals.reduce<number>((a, b) => a + (b || 0), 0) });
  }
  const gradeCols = columns.filter((k) => !k.total).length;
  const filled = students.reduce((a, s) => a + s.values.filter((v) => v !== null).length, 0);
  return { title, columns, students, filled, cells: students.length * gradeCols };
}

// ---------------------------------------------------------------------
// تتبع المستويات: صف المواد، صف «اسم الطالب | 1 2 3 4 | مستوى التقدم | متوسط»، ثم الطلاب
// ---------------------------------------------------------------------
export interface LevelSubject { name: string; cols: number[] }
export interface LevelStudent { name: string; scores: Array<Array<number | null>> }
export interface LevelSheet { subjects: LevelSubject[]; students: LevelStudent[]; max: number }

export function parseLevels(grid: Grid): LevelSheet | null {
  let h = -1, nameCol = -1;
  for (let r = 0; r < Math.min(grid.length, 10) && h < 0; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) if (norm(row[c]) === 'اسم الطالب') { h = r; nameCol = c; break; }
  }
  if (h < 0) return null;
  const head = grid[h] || [];
  const subjRow = grid[h - 1] || [];
  const subjects: LevelSubject[] = [];
  for (let c = 0; c < head.length; c++) {
    if (norm(head[c]) !== '1') continue;
    const cols = [c];
    for (let k = 2; k <= 6 && norm(head[c + k - 1]) === String(k); k++) cols.push(c + k - 1);
    if (cols.length < 2) continue;
    let name = '';
    for (let x = c; x >= 0 && !name; x--) name = norm(subjRow[x]);
    if (!name && c === nameCol + 1) name = norm(subjRow[nameCol]);
    subjects.push({ name: name || `مادة ${subjects.length + 1}`, cols });
  }
  if (!subjects.length) return null;
  const students: LevelStudent[] = [];
  let max = 20, empties = 0;
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const name = norm(row[nameCol]);
    if (!name) { if (++empties >= 3) break; continue; }
    empties = 0;
    const scores = subjects.map((s) => s.cols.map((c) => toNum(row[c])));
    scores.flat().forEach((v) => { if (v !== null && v > max) max = Math.ceil(v / 10) * 10; });
    students.push({ name, scores });
  }
  return { subjects, students, max };
}

/** متوسط القيم غير الفارغة */
export const meanOf = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
/** آخر قياس غير فارغ */
export const lastOf = (xs: Array<number | null>) => { for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null) return xs[i]; return null; };

/** اسم الصف من اسم الشيت: «2ع» ← الثاني عام، «1-2م» ← أول متوسط/2 ... (للعرض فقط) */
export function classLabel(sheet: string): string {
  const s = sheet.trim();
  const ORD = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
  let m = s.match(/^(\d)\s*([عت])$/);
  if (m) return `${ORD[+m[1]] || m[1]} ${m[2] === 'ع' ? 'عام' : 'تحفيظ'}`;
  m = s.match(/^(\d)-(\d)\s*م$/);
  if (m) return `${ORD[+m[1]] || m[1]} متوسط / ${m[2]}`;
  m = s.match(/^(\d)-(\d)$/);
  if (m) return `${ORD[+m[1]] || m[1]} ثانوي / ${m[2]}`;
  return s;
}

// ---------------------------------------------------------------------
// المادة والصف من اسم الورقة (أدق من عنوان السجل، فالقالب يُنسخ أحياناً دون تعديل عنوانه)
// ---------------------------------------------------------------------
const SUBJECTS: Array<[RegExp, string]> = [
  [/رياضيات|math/i, 'الرياضيات'],
  [/علوم|scien/i, 'العلوم'],
  [/english|الإنجليزية|الانجليزية|انجليزي/i, 'اللغة الإنجليزية'],
  [/لغتي|العربية|عربي/, 'اللغة العربية'],
  [/قرآن|قرأن|قران/, 'القرآن الكريم'],
  [/إسلامي|اسلامي|توحيد|فقه|حديث/, 'الدراسات الإسلامية'],
  [/اجتماعي/, 'الدراسات الاجتماعية'],
  [/حياتية|فنية|بدنية|أسرية|اسرية|المهارات/, 'المهارات الحياتية والفنية والبدنية'],
  [/رقمية|حاسب|تقنية/, 'المهارات الرقمية'],
];
const ORD_WORDS: Array<[RegExp, number]> = [[/أول|اول/, 1], [/ثاني/, 2], [/ثالث/, 3], [/رابع/, 4], [/خامس/, 5], [/سادس/, 6]];
const ORD = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export interface RecordMeta { subject: string; grade: number | null; track: string; classKey: string; classLabel: string }

/** المادة والصف (رقم الصف + عام/تحفيظ) لسجل متابعة، من اسم الورقة ثم العنوان */
export function recordMeta(sheet: string, title = ''): RecordMeta {
  const s = toLatin(sheet.replace(/[ً-ْ]/g, '')), ti = toLatin(title);
  const subject = (SUBJECTS.find(([re]) => re.test(s)) || SUBJECTS.find(([re]) => re.test(ti)))?.[1]
    || (title.split('(')[0].trim() || sheet.trim());
  const fromTitle = ti.match(/الصف\s+(\S+)\s*-\s*(عام|تحفيظ)/);
  let grade: number | null = null, track = '';
  const dm = s.match(/(\d)/);
  if (dm) grade = +dm[1];
  else { const w = ORD_WORDS.find(([re]) => re.test(s)); if (w) grade = w[1]; }
  if (/تحفيظ/.test(s)) track = 'تحفيظ';
  else if (/عام/.test(s)) track = 'عام';
  else if (/مشترك/.test(s)) track = 'مشترك';
  else if (/\d\s*ِ?B\b|\bB\s*\d|\d\s*B$/i.test(s)) track = 'تحفيظ';
  else if (/\d\s*ِ?A\b|\bA\s*\d|\d\s*A$/i.test(s)) track = 'عام';
  if (fromTitle) {
    if (grade === null) { const w = ORD_WORDS.find(([re]) => re.test(fromTitle[1])); if (w) grade = w[1]; }
    if (!track) track = fromTitle[2];
  }
  if (grade !== null && (grade < 1 || grade > 6)) grade = null;
  const classKey = grade ? `${grade}|${track}` : '';
  return { subject, grade, track, classKey, classLabel: grade ? `${ORD[grade]}${track ? ` ${track}` : ''}` : '' };
}

/** شبكة القيم من ورقة Excel (للرفع اليدوي) — نقص الصفوف الفارغة في النهاية */
export function trimGrid(grid: Grid, maxRows = 300, maxCols = 60): Grid {
  let last = grid.length - 1;
  while (last >= 0 && !(grid[last] || []).some((v) => norm(v))) last--;
  return grid.slice(0, Math.min(last + 1, maxRows)).map((row) => {
    const r = (row || []).slice(0, maxCols).map((v) => (typeof v === 'number' || typeof v === 'boolean' ? v : norm(v) || null));
    let e = r.length - 1;
    while (e >= 0 && (r[e] === null || r[e] === '')) e--;
    return r.slice(0, e + 1);
  });
}

/** كود Google Apps Script المركزي: يقرأ ملفات مجلدات Drive ويرسل ما تغيّر كل 10 دقائق */
export function recordsAppsScript(url: string, anonKey: string, token: string, folders: Array<{ id: string; kind: 'followup' | 'levels' }>): string {
  return `// ===== ربط سجلات المتابعة وتتبع المستويات بمنصة إتقان =====
// 1) افتح script.google.com بحساب المدرسة ← مشروع جديد، احذف أي كود والصق هذا الكود واحفظ.
// 2) اختر الدالة setup من الأعلى واضغط «تشغيل» مرة واحدة، ووافق على الأذونات.
// بعدها يقرأ المجلدات كل 10 دقائق ويرسل الملفات التي تغيّرت فقط، مع اسم آخر من عدّل ووقته.
var ITQAN_URL = ${JSON.stringify(url.replace(/\/$/, '') + '/rest/v1/rpc/')};
var ITQAN_KEY = ${JSON.stringify(anonKey)};
var ITQAN_TOKEN = ${JSON.stringify(token)};
var FOLDERS = ${JSON.stringify(folders)};

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(10).create();
  PropertiesService.getScriptProperties().deleteAllProperties();
  syncAll();
}

function call(fn, body) {
  var res = UrlFetchApp.fetch(ITQAN_URL + fn, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: ITQAN_KEY, Authorization: 'Bearer ' + ITQAN_KEY }, payload: JSON.stringify(body)
  });
  if (res.getResponseCode() >= 300) throw new Error('إتقان: ' + res.getContentText());
}

// آخر من عدّل الملف ووقته (من Drive)
function lastEdit(id) {
  try {
    var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=modifiedTime,lastModifyingUser(displayName,emailAddress)&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    var j = JSON.parse(r.getContentText());
    var u = j.lastModifyingUser || {};
    return { at: j.modifiedTime, by: u.displayName || u.emailAddress || '' };
  } catch (e) { return { at: null, by: '' }; }
}

function trim(g) {
  var last = g.length - 1;
  while (last >= 0 && !g[last].some(function (v) { return String(v).trim() !== ''; })) last--;
  return g.slice(0, Math.min(last + 1, 300)).map(function (row) {
    var r = row.slice(0, 60).map(function (v) { return v instanceof Date ? v.toISOString().slice(0, 10) : (v === '' ? null : v); });
    var e = r.length - 1; while (e >= 0 && r[e] === null) e--; return r.slice(0, e + 1);
  });
}

var XLSX_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

// كل ملفات Google Sheets و Excel في المجلد وما بداخله
function collect(folder, path, out) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next(), t = f.getMimeType();
    if (t === MimeType.GOOGLE_SHEETS || XLSX_TYPES.indexOf(t) >= 0) out.push({ file: f, path: path, excel: t !== MimeType.GOOGLE_SHEETS });
  }
  var subs = folder.getFolders();
  while (subs.hasNext()) { var d = subs.next(); collect(d, path ? path + ' / ' + d.getName() : d.getName(), out); }
}

function drive(method, path, body) {
  var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/' + path, { method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: body ? JSON.stringify(body) : undefined });
  if (r.getResponseCode() >= 300) throw new Error('Drive: ' + r.getContentText());
  return r.getContentText() ? JSON.parse(r.getContentText()) : {};
}

function readSheets(id) {
  return SpreadsheetApp.openById(id).getSheets().map(function (sh) {
    var n = Math.min(sh.getLastRow(), 300), m = Math.min(sh.getLastColumn(), 60);
    return { sheet: sh.getName().trim(), grid: n && m ? trim(sh.getRange(1, 1, n, m).getValues()) : [] };
  }).filter(function (s) { return s.grid.length >= 2; });
}

// ملف Excel: نسخة مؤقتة محوّلة إلى Google Sheets تُقرأ ثم تُحذف (الملف الأصلي لا يتغير)
function readExcel(id) {
  var tmp = drive('post', 'files/' + id + '/copy?supportsAllDrives=true&fields=id', { name: 'itqan-tmp', mimeType: MimeType.GOOGLE_SHEETS });
  try { return readSheets(tmp.id); } finally { try { drive('delete', 'files/' + tmp.id + '?supportsAllDrives=true'); } catch (e) { DriveApp.getFileById(tmp.id).setTrashed(true); } }
}

function syncAll() {
  var props = PropertiesService.getScriptProperties(), started = Date.now();
  FOLDERS.forEach(function (fo) {
    var list = [];
    collect(DriveApp.getFolderById(fo.id), '', list);
    var keys = list.map(function (it) { return it.file.getId(); });
    list.forEach(function (it) {
      if (Date.now() - started > 4.5 * 60 * 1000) return; // حد وقت التشغيل: الباقي في المرة القادمة
      var id = it.file.getId();
      var stamp = String(it.file.getLastUpdated().getTime());
      if (props.getProperty(id) === stamp) return; // لم يتغير
      try {
        var info = lastEdit(id), sheets = it.excel ? readExcel(id) : readSheets(id);
        call('itqan_records_import', { p_token: ITQAN_TOKEN, p_payload: { kind: fo.kind, file_key: id, file_name: it.file.getName().replace(/\\.xlsx?$/i, ''), folder_path: it.path,
          last_edit_by: info.by, last_edit_at: info.at || it.file.getLastUpdated().toISOString(), full: true, sheets: sheets } });
        props.setProperty(id, stamp);
      } catch (e) { console.error(it.file.getName() + ': ' + e); }
    });
    if (keys.length) call('itqan_records_prune', { p_kind: fo.kind, p_keys: keys, p_token: ITQAN_TOKEN });
  });
}
`;
}
