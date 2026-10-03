/**
 * تصدير جزء من الصفحة (الرسوم البيانية) إلى PDF مطابق لما يظهر على الشاشة.
 * الطريقة: نسخ العنصر كما هو (بنفس التنسيق) داخل إطار مخفي ثم فتح نافذة الطباعة
 * ليختار المستخدم "حفظ بصيغة PDF". هذه الطريقة تحافظ على الخط العربي والرسوم كما هي
 * بدون مكتبات خارجية.
 */
import { t, uiDir, getLang, dateLocale } from '../i18n';

/** هوية المدرسة في رأس الملفات المطبوعة (تُضبط من الإعدادات عند تحميلها) */
export interface PrintBrand { name: string; logo: string; color: string }
let brand: PrintBrand = { name: '', logo: '', color: '#4f46e5' };
export const setPrintBrand = (b: Partial<PrintBrand>) => { brand = { ...brand, ...b }; };
export const getPrintBrand = () => brand;

export interface PdfTableData {
  headers: string[];
  rows: Array<Array<string | number>>;
}

export interface PdfExportOptions {
  element?: HTMLElement;
  /** بديل عن element: محتوى HTML جاهز (يجب تهريب النصوص الديناميكية فيه) */
  bodyHtml?: string;
  title: string;
  subtitle?: string;
  table?: PdfTableData;
  tableTitle?: string;
  /** اتجاه الصفحة: أفقي للرسوم والجداول العريضة، عمودي للتقارير (الافتراضي أفقي) */
  orientation?: 'portrait' | 'landscape';
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildPdfHtml(opts: PdfExportOptions): string {
  // الطباعة دائماً بخلفية بيضاء (ورق وحبر) حتى لو كان الموقع في الوضع الليلي
  const isDark = false;
  const bg = isDark ? '#0b0f19' : '#ffffff';
  const fg = isDark ? '#e2e8f0' : '#0f172a';
  const border = isDark ? '#334155' : '#cbd5e1';
  const th = isDark ? '#1e293b' : '#f1f5f9';

  const headTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n');

  let bodyContent = opts.bodyHtml || '';
  if (!bodyContent && opts.element) {
    const clone = opts.element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-pdf-hide]').forEach((n) => n.remove());
    // إلغاء حدود الارتفاع والتمرير (النوافذ المنبثقة) حتى يُطبع المحتوى كاملاً
    [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))].forEach((el) => {
      el.classList.remove('overflow-y-auto', 'overflow-auto', 'max-h-[90vh]', 'sticky', 'fixed');
    });
    bodyContent = clone.outerHTML;
  }

  const table = opts.table
    ? `<div style="margin-top:20px">
         ${opts.tableTitle ? `<h2 style="font-size:14px;font-weight:800;margin:0 0 8px">${esc(opts.tableTitle)}</h2>` : ''}
         <table class="pdf-table"><thead><tr>${opts.table.headers
           .map((h) => `<th>${esc(h)}</th>`)
           .join('')}</tr></thead><tbody>${opts.table.rows
           .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
           .join('')}</tbody></table></div>`
    : '';

  const dir = uiDir();
  const start = dir === 'rtl' ? 'right' : 'left';
  const logo = brand.logo ? `<img src="${esc(brand.logo)}" alt="" style="height:40px;max-width:120px;object-fit:contain">` : '';
  return `<!doctype html><html lang="${getLang()}" dir="${dir}" class="${isDark ? 'dark' : ''}"><head><meta charset="utf-8">
<base href="${window.location.origin}/"><title>${esc(opts.title)}</title>${headTags}
<style>
  @page { size: A4 ${opts.orientation || 'landscape'}; margin: 10mm; }
  html, body { background: ${bg} !important; color: ${fg}; margin: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pdf-wrap { padding: 12px 16px; }
  .pdf-head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid ${brand.color}; padding-bottom:8px; margin-bottom:16px; }
  .pdf-head h1 { font-size:20px; font-weight:900; margin:0; }
  .pdf-head p { font-size:11px; margin:4px 0 0; opacity:.75; }
  .pdf-block { break-inside: avoid; }
  svg { max-width: 100%; height: auto; }
  .pdf-table { width:100%; border-collapse:collapse; font-size:11px; }
  .pdf-table th, .pdf-table td { border:1px solid ${border}; padding:6px 8px; text-align:${start}; color:${fg}; }
  .pdf-table th { background:${th}; }
  .pdf-table tr { break-inside: avoid; }
</style></head>
<body class="font-cairo"><div class="pdf-wrap">
  <div class="pdf-head"><div style="display:flex;align-items:center;gap:12px">${logo}<div><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<p>${esc(opts.subtitle)}</p>` : ''}</div></div>
  <div style="font-size:11px;opacity:.75;text-align:end">${esc(brand.name || t('منصة إتقان التعليمية'))}<br>${esc(new Date().toLocaleDateString(dateLocale()))}</div></div>
  <div class="pdf-block">${bodyContent}</div>
  ${table}
</div></body></html>`;
}

export async function exportElementToPdf(opts: PdfExportOptions): Promise<void> {
  const html = buildPdfHtml(opts);

  // حدث اختياري يسمح بالاختبار الآلي ومراجعة المحتوى قبل الطباعة
  window.dispatchEvent(new CustomEvent('itqan:pdf-prepared', { detail: { html } }));

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:-10000px;bottom:0;width:1123px;height:794px;border:0;pointer-events:none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error(t('تعذر تجهيز ملف PDF'));
  }
  doc.open();
  doc.write(html);
  doc.close();

  const started = Date.now();
  while (doc.readyState !== 'complete' && Date.now() - started < 4000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    await Promise.race([(doc as any).fonts?.ready, new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 300));

  win.focus();
  win.print();
  setTimeout(() => iframe.remove(), 60_000);
}
