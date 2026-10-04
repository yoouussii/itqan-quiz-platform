// قراءة «سجل الغياب والتأخر والاستئذان» (Google Sheets / Excel):
//  شيت لكل صف؛ صف عناوين فيه «الأسبوع (N)» وتحته أسماء الأيام (الأحد–الخميس)؛
//  لكل طالب ثلاثة صفوف (غياب / تأخر / استئذان) والخلية المعلَّمة TRUE.
// نفس المنطق مكتوب في كود Apps Script أدناه (لأن الشيت يرسل التحديثات بنفسه).

export type AttKind = 'absent' | 'late' | 'excused';
export interface SheetStudent { name: string; marks: Array<[number, number, AttKind]> }
export interface SheetPayload { sheets: Array<{ sheet: string; students: SheetStudent[] }> }

const DAYS: Record<string, number> = { 'الاحد': 0, 'الأحد': 0, 'الاثنين': 1, 'الإثنين': 1, 'الثلاثاء': 2, 'الاربعاء': 3, 'الأربعاء': 3, 'الخميس': 4 };
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const kindOf = (v: unknown): AttKind | null => {
  const s = norm(v);
  if (s.startsWith('غياب')) return 'absent';
  if (s.startsWith('تأخر') || s.startsWith('تاخر')) return 'late';
  if (s.startsWith('استئذان') || s.startsWith('إستئذان') || s.startsWith('استاذان')) return 'excused';
  return null;
};
const checked = (v: unknown) => v === true || v === 1 || /^(true|✓|✔|1|x)$/i.test(norm(v));

/** يحوّل شبكة خلايا شيت واحد إلى طلاب وعلاماتهم */
export function parseGrid(grid: unknown[][]): SheetStudent[] {
  // صف العناوين: فيه «نوع الحركة» أو خلايا «الأسبوع»
  const headIdx = grid.findIndex((row) => row.some((c) => norm(c).startsWith('الأسبوع') || norm(c).startsWith('الاسبوع')));
  if (headIdx < 0) return [];
  const head = grid[headIdx];
  const days = grid[headIdx + 1] || [];
  const nameCol = head.findIndex((c) => norm(c) === 'الاسم');
  const kindCol = head.findIndex((c) => norm(c).includes('نوع'));
  if (nameCol < 0 || kindCol < 0) return [];
  // كل عمود يوم ← (الأسبوع، اليوم)
  const cols: Array<{ col: number; week: number; dow: number }> = [];
  let week = 0;
  for (let c = 0; c < Math.max(head.length, days.length); c++) {
    const m = norm(head[c]).match(/(\d+)/);
    if ((norm(head[c]).startsWith('الأسبوع') || norm(head[c]).startsWith('الاسبوع')) && m) week = Number(m[1]);
    const dow = DAYS[norm(days[c])];
    if (week > 0 && dow !== undefined) cols.push({ col: c, week, dow });
  }
  const out: SheetStudent[] = [];
  let cur: SheetStudent | null = null;
  for (let r = headIdx + 2; r < grid.length; r++) {
    const row = grid[r] || [];
    const name = norm(row[nameCol]);
    if (name) {
      cur = { name, marks: [] };
      out.push(cur);
    }
    const kind = kindOf(row[kindCol]);
    if (!cur || !kind) continue;
    for (const { col, week: w, dow } of cols) if (checked(row[col])) cur.marks.push([w, dow, kind]);
  }
  return out;
}

/** يقرأ ملف Excel كاملاً (كل الشيتات التي على شكل السجل) */
export async function parseAttendanceWorkbook(file: File): Promise<SheetPayload> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheets: SheetPayload['sheets'] = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const students = parseGrid(grid);
    if (students.length) sheets.push({ sheet: name.trim(), students });
  }
  return { sheets };
}

/** كود Google Apps Script يُلصق في الشيت: يرسل السجل كاملاً للمنصة عند كل تعديل وكل 10 دقائق */
export function appsScriptCode(url: string, anonKey: string, token: string): string {
  return `// ===== ربط سجل الغياب بمنصة إتقان =====
// 1) من قائمة الشيت: الإضافات ← Apps Script، احذف أي كود والصق هذا الكود كاملاً واحفظ.
// 2) اختر الدالة setup من الأعلى واضغط «تشغيل» مرة واحدة، ووافق على الأذونات.
// بعدها أي علامة تضعها في الشيت تصل للمنصة خلال ثوانٍ (ومزامنة احتياطية كل 10 دقائق).
var ITQAN_URL = ${JSON.stringify(url.replace(/\/$/, '') + '/rest/v1/rpc/itqan_attendance_import')};
var ITQAN_KEY = ${JSON.stringify(anonKey)};
var ITQAN_TOKEN = ${JSON.stringify(token)};

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  var ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(10).create();
  syncAll();
}

function onSheetEdit(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { Utilities.sleep(1500); syncSheets([e.range.getSheet()]); } finally { lock.releaseLock(); }
}

function syncAll() { syncSheets(SpreadsheetApp.getActive().getSheets()); }

var DAYS = { 'الاحد': 0, 'الأحد': 0, 'الاثنين': 1, 'الإثنين': 1, 'الثلاثاء': 2, 'الاربعاء': 3, 'الأربعاء': 3, 'الخميس': 4 };
function n(v) { return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim(); }
function kindOf(v) {
  var s = n(v);
  if (s.indexOf('غياب') === 0) return 'absent';
  if (s.indexOf('تأخر') === 0 || s.indexOf('تاخر') === 0) return 'late';
  if (s.indexOf('استئذان') === 0 || s.indexOf('إستئذان') === 0) return 'excused';
  return null;
}
function isWeek(v) { var s = n(v); return s.indexOf('الأسبوع') === 0 || s.indexOf('الاسبوع') === 0; }

function parseGrid(g) {
  var h = -1;
  for (var r = 0; r < g.length && h < 0; r++) for (var c = 0; c < g[r].length; c++) if (isWeek(g[r][c])) { h = r; break; }
  if (h < 0 || !g[h + 1]) return [];
  var head = g[h], days = g[h + 1], nameCol = -1, kindCol = -1;
  for (var c2 = 0; c2 < head.length; c2++) { if (n(head[c2]) === 'الاسم') nameCol = c2; if (n(head[c2]).indexOf('نوع') >= 0) kindCol = c2; }
  if (nameCol < 0 || kindCol < 0) return [];
  var cols = [], week = 0;
  for (var c3 = 0; c3 < head.length; c3++) {
    var m = n(head[c3]).match(/(\\d+)/);
    if (isWeek(head[c3]) && m) week = Number(m[1]);
    var d = DAYS[n(days[c3])];
    if (week > 0 && d !== undefined) cols.push([c3, week, d]);
  }
  var out = [], cur = null;
  for (var r2 = h + 2; r2 < g.length; r2++) {
    var row = g[r2], name = n(row[nameCol]);
    if (name) { cur = { name: name, marks: [] }; out.push(cur); }
    var k = kindOf(row[kindCol]);
    if (!cur || !k) continue;
    for (var i = 0; i < cols.length; i++) if (row[cols[i][0]] === true) cur.marks.push([cols[i][1], cols[i][2], k]);
  }
  return out;
}

function syncSheets(list) {
  var sheets = [];
  list.forEach(function (sh) {
    var students = parseGrid(sh.getDataRange().getValues());
    if (students.length) sheets.push({ sheet: sh.getName().trim(), students: students });
  });
  if (!sheets.length) return;
  var res = UrlFetchApp.fetch(ITQAN_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: ITQAN_KEY, Authorization: 'Bearer ' + ITQAN_KEY },
    payload: JSON.stringify({ p_payload: { sheets: sheets }, p_token: ITQAN_TOKEN })
  });
  if (res.getResponseCode() >= 300) throw new Error('إتقان: ' + res.getContentText());
}
`;
}
