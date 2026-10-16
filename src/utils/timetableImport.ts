// قراءة جدول الحصص الأونلاين من ملف Excel الخاص بالمدرسة (089):
//  - الشكل الأساسي: ورقة فيها أعمدة «الفصل، اليوم، الحصة الأولى… الحصة السادسة»،
//    وكل خانة «المادة⏎المعلم» (مثل ورقة «جدول الفصول»). رموز الفصول (ع1، ت1…) تُشرح من ورقة
//    الإعدادات إن وُجدت (رمز الفصل، الصف، القسم).
//  - شكل بديل: ورقة لكل يوم، وصف «المادة / المعلم» لكل فصل (مثل أوراق التقرير اليومي).

export interface TtCell { code: string; dow: number; period: number; subject: string; teacher: string }
export interface TtClass { code: string; label: string; grade: string; section: string }
export interface TtParsed { cells: TtCell[]; classes: TtClass[]; periods: number }

const DAYS: Record<string, number> = { 'الاحد': 0, 'الأحد': 0, 'الاثنين': 1, 'الإثنين': 1, 'الثلاثاء': 2, 'الاربعاء': 3, 'الأربعاء': 3, 'الخميس': 4, 'السبت': 6, 'الجمعة': 5 };
const s = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const lines = (v: unknown) => String(v ?? '').split(/\r?\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** توحيد الكتابة العربية للمطابقة (الهمزات، التاء المربوطة، الألف المقصورة، التشكيل) */
export const normAr = (v: unknown) => s(v)
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[–—\-_()[\]،,.]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** «المادة⏎المعلم»، أو سطر واحد فيه اسم معلم معروف */
function splitCell(v: unknown, knownTeachers: string[]): { subject: string; teacher: string } | null {
  const ls = lines(v);
  if (!ls.length) return null;
  if (ls.length >= 2) return { subject: ls[0], teacher: ls.slice(1).join(' ') };
  const one = ls[0];
  const n1 = normAr(one);
  const tch = [...knownTeachers].sort((a, b) => b.length - a.length).find((tn) => n1.includes(normAr(tn)));
  if (!tch) return { subject: one, teacher: '' };
  const rest = n1.replace(normAr(tch), ' ').replace(/\s+/g, ' ').trim();
  // «نور بيان» ← «نور البيان» … نُبقي النص كما هو بعد حذف اسم المعلم
  return { subject: rest || one, teacher: tch };
}

type Grid = unknown[][];

function parseClassSheet(g: Grid): Array<{ code: string; dow: number; cells: unknown[] }> | null {
  const h = g.findIndex((r) => r.some((c) => s(c) === 'الفصل') && r.some((c) => s(c) === 'اليوم'));
  if (h < 0) return null;
  const head = g[h].map(s);
  const ci = head.indexOf('الفصل'); const di = head.indexOf('اليوم');
  const pcols = head.map((c, i) => (c.startsWith('الحصة') ? i : -1)).filter((i) => i >= 0);
  if (!pcols.length) return null;
  const out: Array<{ code: string; dow: number; cells: unknown[] }> = [];
  for (let r = h + 1; r < g.length; r++) {
    const row = g[r] || [];
    const code = s(row[ci]); const dow = DAYS[s(row[di])];
    if (!code || dow === undefined) continue;
    out.push({ code, dow, cells: pcols.map((c) => row[c]) });
  }
  return out.length ? out : null;
}

function parseDaySheet(name: string, g: Grid): Array<{ code: string; dow: number; cells: unknown[] }> {
  const dow = DAYS[s(name)];
  if (dow === undefined) return [];
  const out: Array<{ code: string; dow: number; cells: unknown[] }> = [];
  for (const row of g) {
    const i = (row || []).findIndex((c) => s(c) === 'المادة / المعلم');
    if (i < 1) continue;
    const code = [s(row[0]), i >= 2 ? s(row[1]) : ''].filter(Boolean).join(' – ');
    if (!code) continue;
    const cells: unknown[] = [];
    for (let c = i + 1; c < row.length; c++) { if (s(row[c]) === '—' || typeof row[c] === 'number') break; cells.push(row[c]); }
    out.push({ code, dow, cells });
  }
  return out;
}

function parseSettings(g: Grid): TtClass[] {
  const h = g.findIndex((r) => r.some((c) => s(c) === 'رمز الفصل'));
  if (h < 0) return [];
  const head = g[h].map(s);
  const ci = head.indexOf('رمز الفصل'); const gi = head.indexOf('الصف'); const si = head.indexOf('القسم');
  const li = head.findIndex((c) => c.includes('اسم الفصل'));
  const out: TtClass[] = [];
  for (let r = h + 1; r < g.length; r++) {
    const row = g[r] || [];
    const code = s(row[ci]);
    if (!code || code.length > 12) { if (out.length) break; continue; }
    const grade = gi >= 0 ? s(row[gi]) : ''; const section = si >= 0 ? s(row[si]) : '';
    out.push({ code, grade, section, label: (li >= 0 && s(row[li])) || [grade, section].filter(Boolean).join(' – ') || code });
  }
  return out;
}

/** يقرأ شبكات الأوراق (اسم الورقة ← الخلايا) ويعيد الجدول */
export function parseTimetableGrids(sheets: Array<{ name: string; grid: Grid }>): TtParsed {
  let rows: Array<{ code: string; dow: number; cells: unknown[] }> = [];
  for (const sh of sheets) { const r = parseClassSheet(sh.grid); if (r) { rows = r; break; } }
  if (!rows.length) for (const sh of sheets) rows.push(...parseDaySheet(sh.name, sh.grid));
  let classes: TtClass[] = [];
  for (const sh of sheets) { const c = parseSettings(sh.grid); if (c.length) { classes = c; break; } }

  // أسماء المعلمين من الخانات ذات السطرين (لفصل الخانات ذات السطر الواحد)
  const known = new Set<string>();
  rows.forEach((r) => r.cells.forEach((c) => { const ls = lines(c); if (ls.length >= 2) known.add(ls.slice(1).join(' ')); }));
  const cells: TtCell[] = [];
  let periods = 0;
  for (const r of rows) {
    r.cells.forEach((c, i) => {
      const p = splitCell(c, [...known]);
      if (!p || !p.subject) return;
      periods = Math.max(periods, i + 1);
      cells.push({ code: r.code, dow: r.dow, period: i + 1, subject: p.subject, teacher: p.teacher });
    });
  }
  const codes = [...new Set(rows.map((r) => r.code))];
  const byCode = new Map(classes.map((c) => [c.code, c]));
  const allClasses = codes.map((code) => byCode.get(code) || { code, label: code, grade: code, section: '' });
  return { cells, classes: allClasses, periods };
}

export async function parseTimetableWorkbook(file: File): Promise<TtParsed> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return parseTimetableGrids(wb.SheetNames.map((name) => ({
    name, grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }),
  })));
}

// ---------------------------------------------------------------------
// مطابقة الأسماء مع بيانات المنصة
// ---------------------------------------------------------------------
const ORD = ['الاول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
const gradeOf = (v: string) => {
  const n = normAr(v);
  // الأطول أولاً حتى لا يطابق «الثاني» داخل «الثاني عشر»
  return [...ORD].sort((a, b) => b.length - a.length).find((o) => n.includes(o)) || '';
};
const SECTIONS = ['تحفيظ', 'عام', 'دولي', 'بنات', 'بنين'];
const sectionOf = (v: string) => SECTIONS.find((x) => normAr(v).includes(x)) || '';

const stageOf = (v: string) => { const n = normAr(v); return n.includes('متوسط') ? 'm' : n.includes('ثانو') ? 's' : n.includes('ابتدا') ? 'p' : ''; };

/** فصل المنصة المطابق: نفس الصف (الأول…السادس) والمرحلة ونفس القسم (عام/تحفيظ) */
export function matchClass(c: TtClass, classes: Array<{ id: string; name: string }>): string {
  const g = gradeOf(c.grade || c.label); const sec = sectionOf(`${c.section} ${c.label}`);
  if (!g) {
    const exact = classes.filter((x) => normAr(x.name) === normAr(c.label));
    return exact.length === 1 ? exact[0].id : '';
  }
  // المرحلة: إن لم تُذكر فالمقصود الابتدائي (أو فصل بلا مرحلة)، لا «الأول المتوسط»
  const st = stageOf(`${c.grade} ${c.label}`);
  let list = classes.filter((x) => gradeOf(x.name) === g && (st ? stageOf(x.name) === st : ['', 'p'].includes(stageOf(x.name))));
  if (sec) {
    const withSec = list.filter((x) => sectionOf(x.name) === sec);
    // القسم «عام» قد لا يُكتب في اسم الفصل: فصل الصف الذي ليس له قسم آخر
    list = withSec.length ? withSec : sec === 'عام' ? list.filter((x) => !sectionOf(x.name)) : [];
  }
  return list.length === 1 ? list[0].id : '';
}

const toks = (v: string) => normAr(v).replace(/\bابو\s+/g, 'ابو').replace(/\bعبد\s+/g, 'عبد').split(' ').filter((x) => x.length > 1);

/** المعلم المطابق: كل كلمات الاسم في الجدول موجودة في اسمه على المنصة */
export function matchTeacher(name: string, teachers: Array<{ id: string; name: string }>): string {
  const want = toks(name);
  if (!want.length) return '';
  const hits = teachers.filter((u) => { const have = new Set(toks(u.name)); return want.every((w) => have.has(w)); });
  if (hits.length === 1) return hits[0].id;
  // الاسم الأول والأخير فقط
  if (want.length >= 2) {
    const h2 = teachers.filter((u) => { const ht = toks(u.name); return ht[0] === want[0] && ht[ht.length - 1] === want[want.length - 1]; });
    if (h2.length === 1) return h2[0].id;
  }
  return '';
}

const SUBJECT_ALIASES: Record<string, string[]> = {
  'لغتي': ['لغتي', 'اللغه العربيه', 'لغه عربيه', 'عربي'],
  'اسلاميات': ['الدراسات الاسلاميه', 'دراسات اسلاميه', 'اسلاميه', 'التربيه الاسلاميه'],
  'english': ['اللغه الانجليزيه', 'انجليزي', 'لغه انجليزيه', 'english'],
  'رياضيات': ['الرياضيات', 'رياضيات', 'math'],
  'math': ['math', 'رياضيات انجليزي', 'الرياضيات'],
  'علوم': ['العلوم', 'علوم', 'science'],
  'حاسب': ['المهارات الرقميه', 'الحاسب', 'حاسب الي', 'تقنيه رقميه'],
  'اجتماعيات': ['الدراسات الاجتماعيه', 'اجتماعيات', 'دراسات اجتماعيه'],
  'فنيه': ['التربيه الفنيه', 'فنيه', 'التربيه الفنيه'],
  'مهارات حياتيه': ['المهارات الحياتيه', 'المهارات الحياتيه والاسريه', 'مهارات حياتيه'],
  'نور البيان': ['نور البيان', 'القران الكريم', 'قران'],
  'قواعد البيان': ['قواعد البيان', 'القران الكريم', 'قران'],
  'تجويد': ['التجويد', 'القران الكريم', 'قران'],
};

/** المادة المطابقة: نفس الاسم، ثم الأسماء البديلة الشائعة، ثم الاحتواء */
export function matchSubject(name: string, subjects: Array<{ id: string; name: string }>): string {
  const n = normAr(name);
  const exact = subjects.filter((x) => normAr(x.name) === n);
  if (exact.length === 1) return exact[0].id;
  for (const alias of SUBJECT_ALIASES[n] || []) {
    const hit = subjects.filter((x) => normAr(x.name) === alias);
    if (hit.length === 1) return hit[0].id;
  }
  const part = subjects.filter((x) => { const m = normAr(x.name); return m.length > 2 && (m.includes(n) || n.includes(m)); });
  return part.length === 1 ? part[0].id : '';
}
