/**
 * تصدير جداول (أقسام) إلى Excel أو PDF — يُستخدم في نوافذ التفاصيل والصفحات.
 * كل قسم: عنوان + أعمدة + صفوف.
 */
import { exportElementToPdf } from './exportPdf';
import { isEn } from '../i18n';

export interface ExportSection { title: string; headers: string[]; rows: Array<Array<string | number | null | undefined>> }

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'export';

export async function exportSectionsXlsx(title: string, sections: ExportSection[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  sections.forEach((s, i) => {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c)))]);
    ws['!cols'] = s.headers.map((h, j) => ({ wch: Math.min(40, Math.max(10, String(h).length + 2, ...s.rows.slice(0, 200).map((r) => String(r[j] ?? '').length + 2))) }));
    ws['!views'] = [{ RTL: !isEn() }] as any;
    let name = safeName(s.title).replace(/[[\]]/g, '').slice(0, 28) || `Sheet${i + 1}`;
    while (used.has(name)) name = `${name.slice(0, 26)}${i}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  XLSX.writeFile(wb, `${safeName(title)}.xlsx`);
}

export async function exportSectionsPdf(title: string, subtitle: string | undefined, sections: ExportSection[]) {
  const body = sections.map((s) => `
    <h2 style="font-size:14px;font-weight:800;margin:18px 0 8px">${esc(s.title)} <span style="font-weight:400;opacity:.6">(${s.rows.length})</span></h2>
    <table class="pdf-table" style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>${s.headers.map((h) => `<th style="border:1px solid #cbd5e1;background:#f1f5f9;padding:5px 6px;text-align:start">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${s.rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #cbd5e1;padding:4px 6px">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`).join('');
  await exportElementToPdf({ title, subtitle, bodyHtml: body, orientation: sections.some((s) => s.headers.length > 6) ? 'landscape' : 'portrait' });
}
