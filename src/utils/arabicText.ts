/**
 * تنظيف النص العربي المستخرج من الملفات (PDF ووورد ونص منسوخ).
 * المشكلات الشائعة: الحركات بأشكال العرض (ﹶ ﹸ ﹺ…) التي يحوّلها التوحيد إلى «مسافة + حركة»،
 * والحروف بأشكال العرض (ﻣ ﺎ)، والتطويل، ورموز الاتجاه الخفية، ومسافات قبل الحركات.
 */

const MARKS = 'ً-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ';
const MARK_RE = new RegExp(`[${MARKS}]`);
export const isMarkOnly = (s: string) => !!s && new RegExp(`^[${MARKS}ـ\\s]+$`).test(s) && MARK_RE.test(s);

// الحركات بأشكالها المعزولة/المتوسطة (FE70–FE7F) ← الحركة نفسها بلا مسافة
const ISOLATED_MARKS: Record<string, string> = {
  'ﹰ': 'ً', 'ﹱ': 'ً', 'ﹲ': 'ٌ', 'ﹴ': 'ٍ',
  'ﹶ': 'َ', 'ﹷ': 'َ', 'ﹸ': 'ُ', 'ﹹ': 'ُ',
  'ﹺ': 'ِ', 'ﹻ': 'ِ', 'ﹼ': 'ّ', 'ﹽ': 'ّ',
  'ﹾ': 'ْ', 'ﹿ': 'ْ',
  // الشدة مع حركة (أشكال FC5E–FC63 المعزولة)
  'ﱞ': 'ٌّ', 'ﱟ': 'ٍّ', 'ﱠ': 'َّ', 'ﱡ': 'ُّ', 'ﱢ': 'ِّ', 'ﱣ': 'ّٰ',
};

export function cleanArabicText(raw: string): string {
  let s = String(raw || '');
  s = s.replace(/[ﹰ-ﹿﱞ-ﱣ]/g, (c) => ISOLATED_MARKS[c] ?? c);
  s = s.normalize('NFKC');
  // بعض الخطوط تخزّن الحروف بأشكالها الفارسية: ی ← ي، ک ← ك، ھ/ہ/ە ← ه
  s = s.replace(/[یۍې]/g, 'ي').replace(/ک/g, 'ك').replace(/[ھہەۀ]/g, (c) => (c === 'ۀ' ? 'ة' : 'ه'));
  s = s
    .replace(/[​-‏‪-‮⁦-⁩﻿­]/g, '') // رموز اتجاه ومسافات خفية
    .replace(/ـ/g, '') // التطويل
    .replace(new RegExp(`[ \\t\\u00A0]+([${MARKS}])`, 'g'), '$1') // لا مسافة قبل الحركة
    .replace(new RegExp(`(^|[\\s(«"'])([${MARKS}]+)`, 'gm'), '$1') // حركة يتيمة في أول الكلمة
    .replace(/[ \t ]{2,}/g, ' ');
  return joinSpacedLetters(s);
}

const AR_LETTER = 'ء-يٱ-ۓ';
/**
 * ضمّ الحروف المتفرقة بمسافات داخل الكلمة («ا ل ف ق ر ة» ← «الفقرة»):
 * تُضم سلسلة من 3 حروف مفردة فأكثر، دون المساس بالكلمات العادية أو رموز الخيارات «أ)».
 */
export function joinSpacedLetters(s: string): string {
  const tok = `[${AR_LETTER}][${MARKS}]*`;
  const re = new RegExp(`(^|[\\s])((?:${tok} ){2,}${tok})(?=$|[\\s،؛؟.!:])`, 'gm');
  return s.replace(re, (_m, pre: string, run: string) => pre + run.replace(/ /g, ''));
}

export interface PdfItem { x: number; w: number; s: string; size?: number }

/**
 * تجميع قطع سطر واحد من PDF في نص: ترتيب من اليمين للعربية، وإلحاق الحركات المنفصلة
 * بحرفها حسب موضعها، ومسافة فقط عند فراغ ظاهر نسبةً لحجم الخط.
 */
export function joinPdfRow(items: PdfItem[], rtl: boolean): string {
  const size0 = items.find((i) => i.size)?.size || 10;
  const prep = items
    // رمز فارغ بعرض صفر فوق السطر: غالباً شدّة بلا ترميز في الخط
    .map((it) => ({ ...it, s: (/^\u0000+$/.test(it.s) && (it.w || 0) < 0.5 ? '\u0651' : it.s).replace(/\u0000/g, '').replace(/[\uFE70-\uFE7F\uFC5E-\uFC63]/g, (c) => ISOLATED_MARKS[c] ?? c) }))
    // مسافات وهمية بعرض صفر بين الحروف (بعض المولّدات تضعها) تُحذف، والمسافة الحقيقية لها عرض
    .filter((it) => it.s && !(/^\s+$/.test(it.s) && it.w < Math.max(0.5, (it.size || size0) * 0.3)));
  const bases = prep.filter((it) => !isMarkOnly(it.s));
  const marks = prep.filter((it) => isMarkOnly(it.s));
  bases.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
  // الحركة تُرسم عند نهاية حرفها (يساره في العربية): تُلحق بأقرب حرف بهذا المعيار
  const edge = (x: number, w: number) => (rtl ? x : x + w);
  const extra = new Map<number, Map<number, string>>();
  for (const m of marks) {
    const mx = m.x + (rtl ? 0 : m.w || 0);
    let best = -1, bestD = Infinity, bestAt = 0;
    bases.forEach((b, i) => {
      if (/^\s+$/.test(b.s)) return;
      const chars = Array.from(b.s);
      const letters = chars.map((c, k) => (MARK_RE.test(c) ? -1 : k)).filter((k) => k >= 0);
      const per = letters.length ? (b.w || 0) / letters.length : 0;
      letters.forEach((k, li) => {
        // حدود كل حرف داخل القطعة (من اليمين في العربية)
        const lx = rtl ? b.x + b.w - (li + 1) * per : b.x + li * per;
        const d = Math.abs(mx - edge(lx, per));
        if (d < bestD) { bestD = d; best = i; bestAt = k; }
      });
    });
    if (best < 0) continue;
    const mm = extra.get(best) || new Map<number, string>();
    mm.set(bestAt, (mm.get(bestAt) || '') + m.s.replace(/[\s\u0640]/g, ''));
    extra.set(best, mm);
  }
  let line = '';
  bases.forEach((it, k) => {
    let s = it.s;
    const mm = extra.get(k);
    if (mm) s = Array.from(s).map((c, i) => c + (mm.get(i) || '')).join('');
    const prev = bases[k - 1];
    if (prev && !/\s$/.test(line) && !/^\s/.test(s)) {
      const gap = rtl ? prev.x - (it.x + it.w) : it.x - (prev.x + prev.w);
      const size = it.size || prev.size || size0;
      if (gap > Math.max(1, size * 0.15)) line += ' ';
    }
    line += s;
  });
  return line;
}

/**
 * تقسيم قطع سطر PDF إلى خلايا حسب الفراغات الأفقية الكبيرة (أعمدة الجداول، سؤالان متجاوران،
 * خيارات بلا حروف في خلايا). الخلايا مرتبة من اليمين لليسار لأن الورقة عربية.
 */
export function splitPdfCells(items: PdfItem[], size: number): PdfItem[][] {
  const sorted = [...items].filter((i) => i.s.trim()).sort((a, b) => b.x + b.w - (a.x + a.w));
  if (sorted.length < 2) return [items];
  // فراغ أكبر بوضوح من المسافة بين الكلمات (خلايا الجداول لها هوامش)
  const gapMin = Math.max(7, size * 0.75);
  const cells: PdfItem[][] = [[sorted[0]]];
  let left = sorted[0].x;
  for (const it of sorted.slice(1)) {
    const right = it.x + it.w;
    if (left - right > gapMin) cells.push([it]);
    else cells[cells.length - 1].push(it);
    left = Math.min(left, it.x);
  }
  // إعادة القطع الفارغة (مسافات) إلى خليتها حسب الموضع
  if (cells.length === 1) return [items];
  const spaces = items.filter((i) => !i.s.trim());
  for (const sp of spaces) {
    const c = cells.find((cell) => cell.some((i) => sp.x >= i.x - 2 && sp.x <= i.x + i.w + 2));
    (c || cells[0]).push(sp);
  }
  return cells;
}
