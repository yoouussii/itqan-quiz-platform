/**
 * شهادات الطلاب (تفوق، اجتياز، تقدير) بهوية المدرسة: شعارها واسمها ولونها.
 * تُطبع من نافذة الطباعة ويحفظها المستخدم PDF، صفحة لكل شهادة.
 */
import { exportElementToPdf, getPrintBrand } from './exportPdf';
import { t, dateLocale } from '../i18n';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type CertKind = 'excellence' | 'pass' | 'award';

export interface CertificateInput {
  kind: CertKind;
  student: string;
  /** عنوان الإنجاز: اسم الاختبار أو اسم الجائزة */
  achievement: string;
  /** سطر إضافي: المادة والنسبة، أو ملاحظة الجائزة */
  detail?: string;
  date?: string;
  /** اسم المعلم أو مانح الجائزة */
  signer?: string;
}

const TITLE: Record<CertKind, string> = { excellence: 'شهادة تفوق', pass: 'شهادة اجتياز', award: 'شهادة تقدير' };

/** نوع الشهادة من نسبة الطالب ونسبة النجاح */
export const certKindFor = (pct: number, pass: number): CertKind | null => (pct >= 90 ? 'excellence' : pct >= pass ? 'pass' : null);

function page(c: CertificateInput): string {
  const { name, logo, color } = getPrintBrand();
  const lead = c.kind === 'award' ? t('تُمنح هذه الشهادة تقديراً لـ') : t('تشهد المدرسة بأن الطالب/ـة');
  const reason = c.kind === 'excellence' ? t('قد تفوّق في') : c.kind === 'pass' ? t('قد اجتاز بنجاح') : t('لحصوله على');
  const date = c.date ? new Date(c.date) : new Date();
  return `<section class="cert" style="--c:${color}">
    <div class="frame">
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="top">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div class="school">${esc(name || t('منصة إتقان التعليمية'))}</div></div>
      <h1>${esc(t(TITLE[c.kind]))}</h1>
      <p class="lead">${esc(lead)}</p>
      <p class="student">${esc(c.student)}</p>
      <p class="reason">${esc(reason)}</p>
      <p class="achievement">${esc(c.achievement)}</p>
      ${c.detail ? `<p class="detail">${esc(c.detail)}</p>` : ''}
      <p class="wish">${esc(t('مع تمنياتنا بدوام التميز والنجاح'))}</p>
      <div class="foot">
        <div><span>${esc(t('التاريخ'))}</span><b>${esc(date.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'long', day: 'numeric' }))}</b></div>
        <div class="seal">★</div>
        <div><span>${esc(c.signer ? t('المعلم') : t('إدارة المدرسة'))}</span><b>${esc(c.signer || '')}</b><i class="line"></i></div>
      </div>
    </div>
  </section>`;
}

export async function exportCertificates(list: CertificateInput[]): Promise<void> {
  if (!list.length) return;
  const css = `<style>
    @page { size: A4 landscape; margin: 0; }
    .pdf-head { display: none !important; }
    .pdf-wrap { padding: 0 !important; }
    .cert { width: 297mm; height: 210mm; box-sizing: border-box; padding: 10mm; page-break-after: always; break-after: page; font-family: 'Cairo', 'IBM Plex Sans Arabic', sans-serif; }
    .cert:last-child { page-break-after: auto; break-after: auto; }
    .frame { position: relative; height: 100%; box-sizing: border-box; border: 3px solid var(--c); outline: 1px solid var(--c); outline-offset: -10px; border-radius: 6px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 14mm 22mm;
      background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--c) 9%, white), white 60%); }
    .corner { position: absolute; width: 26mm; height: 26mm; border: 0 solid var(--c); }
    .tl { top: 6mm; left: 6mm; border-top-width: 6px; border-left-width: 6px; }
    .tr { top: 6mm; right: 6mm; border-top-width: 6px; border-right-width: 6px; }
    .bl { bottom: 6mm; left: 6mm; border-bottom-width: 6px; border-left-width: 6px; }
    .br { bottom: 6mm; right: 6mm; border-bottom-width: 6px; border-right-width: 6px; }
    .top { display: flex; align-items: center; gap: 12px; }
    .top img { height: 22mm; max-width: 50mm; object-fit: contain; }
    .school { font-size: 18px; font-weight: 800; color: #334155; }
    h1 { font-size: 46px; font-weight: 900; color: var(--c); margin: 6mm 0 3mm; letter-spacing: 1px; }
    .lead, .reason { font-size: 17px; color: #475569; margin: 1.5mm 0; }
    .student { font-size: 38px; font-weight: 900; color: #0f172a; margin: 2mm 0; padding: 0 12mm 2mm; border-bottom: 2px dashed color-mix(in srgb, var(--c) 45%, white); }
    .achievement { font-size: 24px; font-weight: 800; color: #0f172a; margin: 1mm 0; }
    .detail { font-size: 15px; color: #475569; margin: 1mm 0; }
    .wish { font-size: 14px; color: #64748b; margin-top: 5mm; }
    .foot { margin-top: auto; width: 100%; display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #334155; }
    .foot div { display: flex; flex-direction: column; gap: 2px; min-width: 55mm; }
    .foot span { color: #64748b; font-size: 12px; }
    .foot .line { display: block; border-bottom: 1px solid #94a3b8; margin-top: 8mm; }
    .seal { min-width: 0 !important; width: 24mm; height: 24mm; border-radius: 50%; background: var(--c); color: white; font-size: 30px; align-items: center; justify-content: center; box-shadow: 0 0 0 3px white, 0 0 0 5px var(--c); }
  </style>`;
  await exportElementToPdf({ bodyHtml: css + list.map(page).join(''), title: t(TITLE[list[0].kind]), orientation: 'landscape' });
}
