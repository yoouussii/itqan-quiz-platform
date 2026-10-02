import { exportElementToPdf } from './exportPdf';
import { BADGES, levelFor, StudentAward } from './points';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface StudentReportInput {
  name: string;
  nationalId?: string;
  className?: string;
  results: Array<{ quiz: string; subject: string; score: string; pct: number; date: string }>;
  points: number;
  badgeKeys: string[];
  awards: StudentAward[];
}

/** كشف درجات الطالب (PDF عبر نافذة الطباعة) */
export async function exportStudentReport(i: StudentReportInput): Promise<void> {
  const avg = i.results.length ? Math.round(i.results.reduce((a, r) => a + r.pct, 0) / i.results.length) : 0;
  const best = i.results.length ? Math.max(...i.results.map((r) => r.pct)) : 0;
  const lvl = levelFor(i.points);
  const box = (label: string, value: string) =>
    `<div style="flex:1;min-width:120px;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px"><div style="font-size:11px;opacity:.7">${esc(label)}</div><div style="font-size:20px;font-weight:900;margin-top:2px">${esc(value)}</div></div>`;

  const badges = BADGES.filter((b) => i.badgeKeys.includes(b.key))
    .map((b) => `<span style="display:inline-block;margin:2px 4px;padding:3px 10px;border-radius:999px;border:1px solid #cbd5e1;font-size:12px">${b.emoji} ${esc(b.name)}</span>`)
    .join('') || '<span style="font-size:12px;opacity:.7">لا توجد أوسمة بعد</span>';
  const awards = i.awards.length
    ? `<ul style="margin:6px 0 0;padding-right:18px;font-size:12px">${i.awards.map((a) => `<li>${esc(a.title)}${a.note ? ` — ${esc(a.note)}` : ''}</li>`).join('')}</ul>`
    : '<span style="font-size:12px;opacity:.7">لا توجد جوائز بعد</span>';
  const rows = i.results
    .map((r, n) => `<tr><td>${n + 1}</td><td>${esc(r.quiz)}</td><td>${esc(r.subject)}</td><td>${esc(r.score)}</td><td>${esc(Math.round(r.pct))}%</td><td>${esc(r.date)}</td></tr>`)
    .join('');

  const bodyHtml = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${box('الطالب', i.name)}${box('الصف', i.className || '—')}${box('رقم الهوية', i.nationalId || '—')}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${box('اختبارات مؤداة', String(i.results.length))}${box('المعدل العام', `${avg}%`)}${box('أعلى نسبة', `${best}%`)}${box('النقاط', `${i.points} • ${lvl.level.name}`)}
    </div>
    <h2 style="font-size:14px;font-weight:800;margin:8px 0">النتائج التفصيلية</h2>
    <table class="pdf-table"><thead><tr><th>#</th><th>الاختبار</th><th>المادة</th><th>الدرجة</th><th>النسبة</th><th>التاريخ</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">لا توجد نتائج بعد</td></tr>'}</tbody></table>
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">الأوسمة</h2><div>${badges}</div>
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">الجوائز</h2><div>${awards}</div>`;

  await exportElementToPdf({ bodyHtml, title: `كشف درجات: ${i.name}`, subtitle: i.className || undefined });
}
