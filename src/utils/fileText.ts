/**
 * استخراج النص من ملفات الأسئلة في المتصفح (لا يُرفع الملف لأي خادم).
 * المكتبات تُحمَّل فقط عند الاستخدام حتى لا تثقل الموقع.
 */
import { wordHtmlToText } from './questionImport';
import { cleanArabicText, joinPdfRow, PdfItem } from './arabicText';

const ARABIC = /[؀-ۿ]/;

export async function extractFileText(file: File): Promise<string> {
  return cleanArabicText(await rawFileText(file));
}

async function rawFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      // التسطير يدل غالباً على الإجابة الصحيحة مثل الخط العريض
      { styleMap: ['u => u'] }
    );
    return wordHtmlToText(value);
  }
  if (name.endsWith('.pdf')) return pdfText(file);
  if (name.endsWith('.txt')) return file.text();
  if (name.endsWith('.doc')) throw new Error('doc');
  throw new Error('type');
}

async function pdfText(file: File): Promise<string> {
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
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // تجميع القطع النصية في أسطر حسب الموضع الرأسي، ثم ترتيبها أفقياً (من اليمين للعربية)
    const rows: { y: number; items: PdfItem[] }[] = [];
    for (const it of content.items as Array<{ str: string; transform: number[]; width: number; height?: number }>) {
      if (!it.str) continue;
      const y = it.transform[5];
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const item: PdfItem = { x: it.transform[4], w: it.width || 0, s: it.str, size };
      // الحركات قد تُرسم أعلى السطر قليلاً: تسامح نسبي مع حجم الخط
      const row = rows.find((r) => Math.abs(r.y - y) < Math.max(3, size * 0.45));
      if (row) row.items.push(item);
      else rows.push({ y, items: [item] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      const rtl = r.items.some((i) => ARABIC.test(i.s.normalize('NFKC')));
      let line = joinPdfRow(r.items, rtl);
      line = line.normalize('NFKC');
      // في السطر العربي تُخزَّن الأقواس معكوسة الشكل: «أ)» تصل «أ(»
      if (rtl) line = line.replace(/[()[\]]/g, (c) => ({ '(': ')', ')': '(', '[': ']', ']': '[' })[c] as string);
      out.push(line.replace(/\s+/g, ' ').trim());
    }
  }
  return out.join('\n');
}
