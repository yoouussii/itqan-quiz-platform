/**
 * استخراج النص والصور من ملفات الأسئلة في المتصفح (لا يُرفع الملف لأي خادم).
 * المكتبات تُحمَّل فقط عند الاستخدام حتى لا تثقل الموقع.
 * - الصور تُمثَّل في النص بعلامة «[[IMG:n]]» في موضعها، فيلحقها المحلل بسؤالها.
 */
import { wordHtmlToText } from './questionImport';
import { cleanArabicText, joinPdfRow, PdfItem } from './arabicText';
import { compressImage } from './quizMedia';

const ARABIC = /[؀-ۿ]/;

export interface FileContent { text: string; images: string[] }

export async function extractFileText(file: File): Promise<string> {
  return (await extractFileContent(file)).text;
}

export async function extractFileContent(file: File): Promise<FileContent> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return wordContent(file);
  if (name.endsWith('.pdf')) return pdfContent(file);
  if (name.endsWith('.txt')) return { text: cleanArabicText(await file.text()), images: [] };
  if (name.endsWith('.doc')) throw new Error('doc');
  throw new Error('type');
}

async function wordContent(file: File): Promise<FileContent> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    // التسطير يدل غالباً على الإجابة الصحيحة مثل الخط العريض
    { styleMap: ['u => u'] }
  );
  const raw: string[] = [];
  const text = wordHtmlToText(value, raw);
  // ضغط الصور؛ ما لا يفهمه المتصفح (مثل EMF/WMF) يُستبعد
  const images = await Promise.all(raw.map((src) => compressImage(src)));
  return { text: cleanArabicText(dropMissing(text, images)), images: images.map((x) => x || '') };
}

/** علامات الصور التي تعذّر تحويلها تُحذف من النص */
const dropMissing = (text: string, images: (string | null)[]) => text.replace(/\[\[IMG:(\d+)\]\]/g, (m, n) => (images[Number(n)] ? m : ' '));

type Box = { x1: number; y1: number; x2: number; y2: number };
const area = (b: Box) => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
const near = (a: Box, b: Box, pad: number) => a.x1 - pad <= b.x2 && b.x1 - pad <= a.x2 && a.y1 - pad <= b.y2 && b.y1 - pad <= a.y2;
const union = (a: Box, b: Box): Box => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) });
const mul = (m: number[], t: number[]) => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3], m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];
const apply = (m: number[], x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const boxOf = (pts: number[][]): Box => ({ x1: Math.min(...pts.map((p) => p[0])), y1: Math.min(...pts.map((p) => p[1])), x2: Math.max(...pts.map((p) => p[0])), y2: Math.max(...pts.map((p) => p[1])) });

/**
 * مواضع الصور والرسوم في صفحة PDF (بإحداثيات الصفحة):
 * - الصور المضمّنة كما هي.
 * - الرسوم المتجهة (أشكال هندسية، رسوم بيانية): مسارات فيها منحنيات أو خطوط مائلة، مع ما حولها من خطوط مستقيمة.
 *   خطوط الجداول والإطارات (أفقية/رأسية فقط) لا تُعد رسوماً.
 */
async function pageFigures(page: any, pdfjs: any, pageBox: Box): Promise<Box[]> {
  const OPS = pdfjs.OPS;
  const list = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const images: Box[] = [];
  const drawn: Box[] = [];
  const straight: Box[] = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      images.push(boxOf([apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]));
    } else if (fn === OPS.constructPath) {
      const [ops, coords] = args as [number[], number[]];
      let j = 0, cx = 0, cy = 0, figure = false;
      const pts: number[][] = [];
      for (const op of ops) {
        if (op === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(j, j + 4); j += 4;
          pts.push(apply(ctm, x, y), apply(ctm, x + w, y + h));
        } else if (op === OPS.moveTo || op === OPS.lineTo) {
          const x = coords[j++], y = coords[j++];
          // خط مائل = رسم (الجداول أفقية ورأسية فقط)
          if (op === OPS.lineTo && Math.abs(x - cx) > 0.5 && Math.abs(y - cy) > 0.5) figure = true;
          cx = x; cy = y; pts.push(apply(ctm, x, y));
        } else if (op === OPS.curveTo) {
          figure = true; pts.push(apply(ctm, coords[j], coords[j + 1]), apply(ctm, coords[j + 4], coords[j + 5])); cx = coords[j + 4]; cy = coords[j + 5]; j += 6;
        } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
          figure = true; pts.push(apply(ctm, coords[j], coords[j + 1]), apply(ctm, coords[j + 2], coords[j + 3])); cx = coords[j + 2]; cy = coords[j + 3]; j += 4;
        }
      }
      if (pts.length) (figure ? drawn : straight).push(boxOf(pts));
    }
  }
  const pageArea = area(pageBox);
  // تجميع الرسوم المتقاربة في شكل واحد، مع الخطوط المستقيمة الواقعة داخله (محاور، أضلاع)
  const groups: Box[] = [];
  for (const b of drawn) {
    let g = b;
    for (let k = groups.length - 1; k >= 0; k--) if (near(groups[k], g, 14)) { g = union(groups[k], g); groups.splice(k, 1); }
    groups.push(g);
  }
  const figures = groups.map((g) => {
    let out = g;
    for (const s of straight) if (near(g, s, 24) && area(s) < area(g) * 3 + 2000) out = union(out, s);
    return out;
  });
  return [...images, ...figures]
    .filter((b) => b.x2 - b.x1 >= 20 && b.y2 - b.y1 >= 20 && area(b) < pageArea * 0.8)
    .reduce<Box[]>((acc, b) => {
      const k = acc.findIndex((a) => near(a, b, 4));
      if (k >= 0) acc[k] = union(acc[k], b); else acc.push(b);
      return acc;
    }, []);
}

async function pdfContent(file: File): Promise<FileContent> {
  // pdf.js يحتاج Promise.withResolvers (غير موجودة في المتصفحات الأقدم)
  const P = Promise as unknown as { withResolvers?: unknown };
  if (!P.withResolvers) {
    P.withResolvers = function withResolvers<T>() {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  const images: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const [vx1, vy1, vx2, vy2] = page.view as number[];
    let figures: Box[] = [];
    try { figures = await pageFigures(page, pdfjs, { x1: vx1, y1: vy1, x2: vx2, y2: vy2 }); } catch { figures = []; }

    // تجميع القطع النصية في أسطر حسب الموضع الرأسي، ثم ترتيبها أفقياً (من اليمين للعربية)
    const rows: { y: number; items: PdfItem[]; img?: number }[] = [];
    const textItems = (content.items as Array<{ str: string; transform: number[]; width: number; height?: number }>).filter((it) => it.str);
    // الإطارات الكبيرة حول الأسئلة ليست رسوماً: الشكل الذي يحوي أسطراً كثيرة يُستبعد
    figures = figures.filter((f) => textItems.filter((it) => it.transform[5] > f.y1 && it.transform[5] < f.y2 && it.transform[4] >= f.x1 - 2 && it.transform[4] <= f.x2 + 2 && ARABIC.test(it.str)).length <= 6);
    const inFigure = (x: number, y: number) => figures.some((f) => x >= f.x1 - 2 && x <= f.x2 + 2 && y >= f.y1 - 2 && y <= f.y2 + 2);
    for (const it of textItems) {
      const y = it.transform[5];
      // كتابة داخل الرسم (أسماء الرؤوس والمحاور) تبقى جزءاً من الصورة
      if (inFigure(it.transform[4], y)) continue;
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const item: PdfItem = { x: it.transform[4], w: it.width || 0, s: it.str, size };
      // الحركات قد تُرسم أعلى السطر قليلاً: تسامح نسبي مع حجم الخط
      const row = rows.find((r) => r.img === undefined && Math.abs(r.y - y) < Math.max(3, size * 0.45));
      if (row) row.items.push(item);
      else rows.push({ y, items: [item] });
    }

    // قص الصور والرسوم من نسخة مرسومة للصفحة
    if (figures.length) {
      try {
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        for (const f of figures) {
          const pad = 4;
          const [ax, ay, bx, by] = viewport.convertToViewportRectangle([f.x1 - pad, f.y1 - pad, f.x2 + pad, f.y2 + pad]);
          const x = Math.max(0, Math.floor(Math.min(ax, bx))), y = Math.max(0, Math.floor(Math.min(ay, by)));
          const w = Math.min(canvas.width - x, Math.ceil(Math.abs(bx - ax))), h = Math.min(canvas.height - y, Math.ceil(Math.abs(by - ay)));
          if (w < 16 || h < 16) continue;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
          const url = await compressImage(c.toDataURL('image/png'));
          if (!url) continue;
          images.push(url);
          rows.push({ y: f.y2, items: [], img: images.length - 1 });
        }
      } catch { /* الصفحة بلا صور إن تعذّر الرسم */ }
    }

    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      if (r.img !== undefined) { out.push(`[[IMG:${r.img}]]`); continue; }
      const rtl = r.items.some((i) => ARABIC.test(i.s.normalize('NFKC')));
      let line = joinPdfRow(r.items, rtl);
      line = line.normalize('NFKC');
      // في السطر العربي تُخزَّن الأقواس معكوسة الشكل: «أ)» تصل «أ(»
      if (rtl) line = line.replace(/[()[\]]/g, (c) => ({ '(': ')', ')': '(', '[': ']', ']': '[' })[c] as string);
      out.push(line.replace(/\s+/g, ' ').trim());
    }
  }
  return { text: cleanArabicText(out.join('\n')), images };
}
