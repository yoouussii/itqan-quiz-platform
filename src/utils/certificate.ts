/**
 * الشهادات: قوالب بهوية بصرية ثابتة (الشعاران، اسم المدرسة، القالب، اللونان) تُضبط مرة من صفحة الشهادات.
 * نفس المستند يُستخدم للمعاينة داخل الصفحة وللطباعة/الحفظ PDF، صفحة A4 أفقية لكل شهادة.
 * الشهادة المسجّلة (لها رقم ورمز تحقق) تحمل رمز QR يفتح صفحة التحقق العامة /verify/<الرمز>.
 */
import QRCode from 'qrcode';
import { printHtmlDocument } from './exportPdf';
import { loadSettings } from '../services/settingsService';
import { isEn, t } from '../i18n';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- الأنواع
export type CertKind = 'excellence' | 'pass' | 'appreciation' | 'award' | 'thanks' | 'participation' | 'custom';
export type CertGender = 'm' | 'f' | 'n';
export type CertTemplate = 'classic' | 'royal' | 'modern' | 'minimal';
/** qr: إظهار رمز التحقق على الشهادة المسجّلة (افتراضياً نعم) */
/** مكان الختم: بدل الزخرفة في الوسط، أو فوق أحد التوقيعين، أو في أحد الركنين السفليين */
export type StampPos = 'seal' | 'principal' | 'signer' | 'corner-start' | 'corner-end';
export interface CertStyle { template: CertTemplate; primary: string; accent: string; qr: boolean; stampPos: StampPos; /** مم */ stampSize: number; /** ارتفاع صورة التوقيع بالمم */ sigSize: number }

export interface CertificateInput {
  kind: CertKind;
  student: string;
  /** يحدد صيغة النص: الطالب / الطالبة / بدون لقب */
  gender?: CertGender;
  /** موضوع الإنجاز: اسم الاختبار أو المادة أو الجائزة (يُسبق تلقائياً بعبارة حسب النوع) */
  achievement: string;
  /** عنوان مخصص بدل العنوان الافتراضي للنوع */
  title?: string;
  detail?: string;
  score?: string;
  className?: string;
  date?: string;
  signer?: string;
  signerTitle?: string;
  schoolName?: string;
  /** للشهادات المسجّلة: الرقم التسلسلي ورمز التحقق (يظهر QR) */
  serial?: string;
  code?: string;
  style?: Partial<CertStyle>;
  /** تجاوز مؤقت للهوية (معاينة قبل الحفظ) */
  brand?: Partial<CertBrand>;
}

export const CERT_KINDS: Array<{ id: CertKind; label: string }> = [
  { id: 'excellence', label: 'شهادة تفوق' },
  { id: 'appreciation', label: 'شهادة تقدير' },
  { id: 'thanks', label: 'شهادة شكر وتقدير' },
  { id: 'pass', label: 'شهادة اجتياز' },
  { id: 'participation', label: 'شهادة مشاركة' },
  { id: 'custom', label: 'عنوان مخصص' },
];

export const CERT_TEMPLATES: Array<{ id: CertTemplate; label: string; hint: string }> = [
  { id: 'classic', label: 'كلاسيكي', hint: 'إطار مزدوج وزخارف أركان وخط نسخ' },
  { id: 'royal', label: 'ملكي', hint: 'إطار بزخرفة إسلامية وخط رقعة' },
  { id: 'modern', label: 'عصري', hint: 'موجات ملونة وخط كوفي حديث' },
  { id: 'minimal', label: 'بسيط', hint: 'خطوط رفيعة ومساحات هادئة' },
];

export const CERT_PALETTES: Array<{ id: string; label: string; primary: string; accent: string }> = [
  { id: 'teal-green', label: 'تركوازي وأخضر', primary: '#0f7f8f', accent: '#84ae40' },
  { id: 'blue-green', label: 'أزرق وأخضر', primary: '#2296b0', accent: '#84ae40' },
  { id: 'navy-gold', label: 'كحلي وذهبي', primary: '#1b2f55', accent: '#b8902f' },
  { id: 'maroon-gold', label: 'عنابي وذهبي', primary: '#7a1f3d', accent: '#b8902f' },
  { id: 'emerald-gold', label: 'زمردي وذهبي', primary: '#0b6b4f', accent: '#b8902f' },
  { id: 'purple-gold', label: 'بنفسجي وذهبي', primary: '#4b2e83', accent: '#c99a2e' },
  { id: 'charcoal-orange', label: 'فحمي وبرتقالي', primary: '#2f3640', accent: '#d9822b' },
];

export const DEFAULT_CERT_STYLE: CertStyle = { template: 'classic', primary: '#0f7f8f', accent: '#84ae40', qr: true, stampPos: 'seal', stampSize: 32, sigSize: 16 };
export const STAMP_POSITIONS: Array<{ id: StampPos; label: string }> = [
  { id: 'seal', label: 'وسط التذييل (بدل الختم الزخرفي)' },
  { id: 'principal', label: 'فوق توقيع المدير' },
  { id: 'signer', label: 'فوق توقيع المعلم' },
  { id: 'corner-start', label: 'الركن السفلي الأيمن' },
  { id: 'corner-end', label: 'الركن السفلي الأيسر' },
];
const clampN = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };

/** نوع الشهادة من نسبة الطالب ونسبة النجاح */
export const certKindFor = (pct: number, pass: number): CertKind | null => (pct >= 90 ? 'excellence' : pct >= pass ? 'pass' : null);

const HEX = /^#[0-9a-f]{6}$/i;
export function normalizeStyle(s?: Partial<CertStyle> | null): CertStyle {
  const base = { ...DEFAULT_CERT_STYLE, ...(loadSettings().cert_style || {}) };
  const v = { ...base, ...(s || {}) };
  return {
    template: (CERT_TEMPLATES.find((x) => x.id === v.template)?.id || 'classic') as CertTemplate,
    primary: HEX.test(v.primary) ? v.primary : DEFAULT_CERT_STYLE.primary,
    accent: HEX.test(v.accent) ? v.accent : DEFAULT_CERT_STYLE.accent,
    qr: v.qr !== false,
    stampPos: (STAMP_POSITIONS.find((x) => x.id === v.stampPos)?.id || 'seal') as StampPos,
    stampSize: clampN(v.stampSize, 18, 55, DEFAULT_CERT_STYLE.stampSize),
    sigSize: clampN(v.sigSize, 8, 26, DEFAULT_CERT_STYLE.sigSize),
  };
}

export interface CertBrand { companyLogo: string; schoolLogo: string; schoolName: string; principalName: string; principalTitle: string; principalSignature: string; stamp: string }

/** الهوية الثابتة من الإعدادات */
export function certBrand(): CertBrand {
  const s = loadSettings();
  return {
    companyLogo: s.cert_company_logo || '',
    schoolLogo: s.cert_school_logo || s.school_logo || '',
    schoolName: s.cert_school_name || s.school_name || '',
    principalName: s.cert_principal_name || '',
    principalTitle: s.cert_principal_title || '',
    principalSignature: s.cert_principal_signature || '',
    stamp: s.cert_stamp || '',
  };
}

// ---------------------------------------------------------------- النصوص
type Phr = { title: string; lead: string; prefix: Record<CertGender, string> };
const AR: Record<CertKind, Phr> = {
  excellence: { title: 'شهادة تفوق', lead: 'تتشرف إدارة المدرسة بمنح', prefix: { m: 'وذلك لتفوقه في', f: 'وذلك لتفوقها في', n: 'وذلك للتفوق في' } },
  pass: { title: 'شهادة اجتياز', lead: 'تشهد إدارة المدرسة بأن', prefix: { m: 'قد اجتاز بنجاح', f: 'قد اجتازت بنجاح', n: 'قد اجتاز بنجاح' } },
  appreciation: { title: 'شهادة تقدير', lead: 'تُمنح هذه الشهادة إلى', prefix: { m: 'تقديراً لجهوده المتميزة في', f: 'تقديراً لجهودها المتميزة في', n: 'تقديراً للجهود المتميزة في' } },
  award: { title: 'شهادة تقدير', lead: 'تُمنح هذه الشهادة إلى', prefix: { m: 'لحصوله على', f: 'لحصولها على', n: 'للحصول على' } },
  thanks: { title: 'شهادة شكر وتقدير', lead: 'تتقدم إدارة المدرسة بخالص الشكر والتقدير إلى', prefix: { m: 'وذلك لتميزه في', f: 'وذلك لتميزها في', n: 'وذلك للتميز في' } },
  participation: { title: 'شهادة مشاركة', lead: 'تشهد إدارة المدرسة بمشاركة', prefix: { m: 'في', f: 'في', n: 'في' } },
  custom: { title: 'شهادة', lead: 'تُمنح هذه الشهادة إلى', prefix: { m: '', f: '', n: '' } },
};
const EN: Record<CertKind, Phr> = {
  excellence: { title: 'Certificate of Excellence', lead: 'The school administration is proud to award', prefix: { m: 'for outstanding achievement in', f: 'for outstanding achievement in', n: 'for outstanding achievement in' } },
  pass: { title: 'Certificate of Completion', lead: 'This is to certify that', prefix: { m: 'has successfully passed', f: 'has successfully passed', n: 'has successfully passed' } },
  appreciation: { title: 'Certificate of Appreciation', lead: 'This certificate is presented to', prefix: { m: 'in appreciation of outstanding effort in', f: 'in appreciation of outstanding effort in', n: 'in appreciation of outstanding effort in' } },
  award: { title: 'Certificate of Appreciation', lead: 'This certificate is presented to', prefix: { m: 'for earning', f: 'for earning', n: 'for earning' } },
  thanks: { title: 'Certificate of Thanks', lead: 'The school administration extends its sincere thanks to', prefix: { m: 'for excellence in', f: 'for excellence in', n: 'for excellence in' } },
  participation: { title: 'Certificate of Participation', lead: 'This is to certify the participation of', prefix: { m: 'in', f: 'in', n: 'in' } },
  custom: { title: 'Certificate', lead: 'This certificate is presented to', prefix: { m: '', f: '', n: '' } },
};
const NOUN: Record<CertGender, string> = { m: 'الطالب', f: 'الطالبة', n: '' };
const WISH: Record<CertGender, string> = { m: 'متمنين له دوام التفوق والنجاح', f: 'متمنين لها دوام التفوق والنجاح', n: 'مع تمنياتنا بدوام التوفيق والنجاح' };

export const defaultCertTitle = (kind: CertKind) => (isEn() ? EN : AR)[kind].title;
export const certReasonPrefix = (kind: CertKind, g: CertGender = 'm') => (isEn() ? EN : AR)[kind].prefix[g];

function fmtDates(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const ok = !isNaN(d.getTime()) ? d : new Date();
  if (isEn()) return { greg: ok.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), hijri: '' };
  let hijri = '';
  try { hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(ok); } catch { /* ignore */ }
  return { greg: new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(ok) + ' م', hijri };
}

// ---------------------------------------------------------------- الزخارف
// علامات اقتباس مفردة: القيمة توضع داخل style="…"
const svgUrl = (svg: string) => `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;

/** نجمة ثمانية متكررة (شريط الإطار الملكي) */
const starPattern = (p: string, a: string) => svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" fill="${p}"/>` +
  `<g fill="none" stroke="${a}" stroke-width="1.6"><path d="M20 4l4.7 11.3L36 20l-11.3 4.7L20 36l-4.7-11.3L4 20l11.3-4.7z"/><rect x="11" y="11" width="18" height="18" transform="rotate(45 20 20)"/></g>` +
  `<circle cx="20" cy="20" r="2.4" fill="${a}"/><circle cx="0" cy="0" r="2" fill="${a}"/><circle cx="40" cy="0" r="2" fill="${a}"/><circle cx="0" cy="40" r="2" fill="${a}"/><circle cx="40" cy="40" r="2" fill="${a}"/></svg>`);

/** زخرفة ركن (الكلاسيكي) */
const cornerSvg = (p: string, a: string) =>
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke-linecap="round">` +
  `<path d="M6 94V30Q6 6 30 6h64" stroke="${p}" stroke-width="3"/>` +
  `<path d="M16 94V36Q16 16 36 16h58" stroke="${a}" stroke-width="1.5"/>` +
  `<path d="M26 60q0-34 34-34" stroke="${p}" stroke-width="1.5"/>` +
  `<path d="M30 30q10 2 12 12M30 30q2 10 12 12" stroke="${a}" stroke-width="1.5"/></g>` +
  `<rect x="24" y="24" width="12" height="12" transform="rotate(45 30 30)" fill="${a}"/><circle cx="30" cy="30" r="2.6" fill="#fff"/></svg>`;

/** ختم وردي الشكل */
function sealSvg(p: string, a: string, ribbon: boolean) {
  const n = 24, R = 46, r = 40;
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const ang = (Math.PI * i) / n - Math.PI / 2;
    const rad = i % 2 ? r : R;
    return `${(50 + rad * Math.cos(ang)).toFixed(2)},${(50 + rad * Math.sin(ang)).toFixed(2)}`;
  }).join(' ');
  const tails = ribbon ? `<path d="M34 80l-10 34 12-6 8 10 6-36z" fill="${p}"/><path d="M66 80l10 34-12-6-8 10-6-36z" fill="${p}"/>` : '';
  return `<svg viewBox="0 0 100 ${ribbon ? 122 : 100}" xmlns="http://www.w3.org/2000/svg">${tails}<polygon points="${pts}" fill="${a}"/>` +
    `<circle cx="50" cy="50" r="33" fill="${p}"/><circle cx="50" cy="50" r="28" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2.4"/>` +
    `<path d="M50 32l5.3 11 12 1.6-8.8 8.3 2.2 11.9L50 59l-10.7 5.8 2.2-11.9-8.8-8.3 12-1.6z" fill="#fff"/></svg>`;
}

/** موجات (العصري) */
const wavesSvg = (p: string, a: string, flip: boolean) =>
  `<svg viewBox="0 0 400 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"${flip ? ' style="transform:rotate(180deg)"' : ''}>` +
  `<path d="M0 0h400v40C300 30 260 120 170 130S40 110 0 210z" fill="${p}"/>` +
  `<path d="M0 0h400v18C310 10 250 90 160 100S30 90 0 170z" fill="${a}" opacity=".9"/>` +
  `<path d="M0 0h400v6C320 2 240 60 150 70S20 66 0 120z" fill="${p}" opacity=".55"/></svg>`;

// ---------------------------------------------------------------- الصفحة
async function qrFor(code: string, color: string): Promise<string> {
  try {
    return await QRCode.toDataURL(`${window.location.origin}/verify/${code}`, { errorCorrectionLevel: 'M', margin: 0, width: 220, color: { dark: color, light: '#ffffff' } });
  } catch {
    return '';
  }
}

const nameSize = (n: string) => (n.length <= 18 ? 44 : n.length <= 26 ? 38 : n.length <= 36 ? 31 : 26);

async function page(c: CertificateInput): Promise<string> {
  const st = normalizeStyle(c.style);
  const b = { ...certBrand(), ...(c.brand || {}) };
  const en = isEn();
  const ph = (en ? EN : AR)[c.kind] || AR.appreciation;
  const g: CertGender = c.gender || 'm';
  const noun = en ? '' : NOUN[g];
  const school = (c.schoolName ?? b.schoolName).trim();
  const prefix = ph.prefix[g];
  const reason = c.achievement?.trim() ? [prefix, c.achievement.trim()].filter(Boolean).join(' ') : '';
  const { greg, hijri } = fmtDates(c.date);
  const qr = c.code && st.qr ? await qrFor(c.code, st.primary) : '';
  type Sig = { name: string; title: string; img?: string; role: 'signer' | 'principal' };
  const sigs: Sig[] = [
    ...(c.signer ? [{ name: c.signer, title: c.signerTitle || (en ? 'Teacher' : 'المعلم'), role: 'signer' as const }] : []),
    { name: b.principalName, title: b.principalTitle || (en ? 'School Principal' : 'مدير المدرسة'), img: b.principalSignature, role: 'principal' },
  ];
  // الختم (صورة): مكانه حسب الإعداد؛ «فوق توقيع المعلم» بلا معلم يعود للوسط
  const pos: StampPos = st.stampPos === 'signer' && !c.signer ? 'seal' : st.stampPos;
  const stampImg = (cls: string) => (b.stamp ? `<img class="stamp ${cls}" src="${esc(b.stamp)}" alt="" style="width:${st.stampSize}mm">` : '');
  const sig = (s?: Sig) => (s
    ? `<div class="sig"><span class="sig-title">${esc(t(s.title))}</span><span class="sig-line"${s.img ? ` style="height:${Math.max(9, st.sigSize - 2)}mm"` : ''}>${s.img ? `<img class="sig-img" src="${esc(s.img)}" alt="" style="height:${st.sigSize}mm">` : ''}${pos === s.role ? stampImg('stamp-over') : ''}</span><b class="sig-name">${esc(s.name)}</b></div>`
    : '<div class="sig"></div>');
  const sealHtml = b.stamp && pos === 'seal' ? stampImg('stamp-seal') : sealSvg(st.primary, st.accent, st.template === 'royal');
  const cornerStamp = b.stamp && (pos === 'corner-start' || pos === 'corner-end') ? stampImg(`stamp-corner ${pos}`) : '';
  const deco =
    st.template === 'classic' ? ['tl', 'tr', 'bl', 'br'].map((k) => `<div class="corner ${k}">${cornerSvg(st.primary, st.accent)}</div>`).join('')
    : st.template === 'modern' ? `<div class="wave w1">${wavesSvg(st.primary, st.accent, false)}</div><div class="wave w2">${wavesSvg(st.primary, st.accent, true)}</div>`
    : '';
  // رمز التحقق: في خانة التوقيع الفارغة، أو سطر صغير تحت التوقيعين
  const verify = c.serial && st.qr
    ? `<div class="verify">${qr ? `<img src="${qr}" alt="">` : ''}<div><b dir="ltr">${esc(c.serial)}</b><span>${esc(en ? 'Scan to verify this certificate' : 'امسح الرمز للتحقق من صحة الشهادة')}</span><span dir="ltr" class="code">${esc(c.code || '')}</span></div></div>`
    : '';
  const logo = (src: string, cls: string) => (src ? `<img class="logo ${cls}" src="${esc(src)}" alt="">` : `<span class="logo ${cls}"></span>`);

  return `<section class="cert tpl-${st.template}" style="--p:${st.primary};--a:${st.accent};--pat:${starPattern(st.primary, st.accent)}">
  <div class="frame">${deco}
    <div class="inner">
      <header class="head">${logo(b.schoolLogo, 'l-school')}<div class="school">${esc(school)}</div>${logo(b.companyLogo, 'l-company')}</header>
      <h1 class="title">${esc(c.title?.trim() || ph.title)}</h1>
      <div class="ornament"><i></i><b></b><i></i></div>
      <p class="lead">${esc(ph.lead)}${noun ? ` ${esc(noun)}` : ''}</p>
      <p class="name" style="font-size:${nameSize(c.student)}px">${esc(c.student)}</p>
      ${c.className ? `<p class="cls">${esc(en ? `Class: ${c.className}` : `الصف: ${c.className}`)}</p>` : ''}
      ${reason ? `<p class="reason">${esc(reason)}</p>` : ''}
      ${c.score || c.detail ? `<p class="meta">${c.score ? `<span class="chip">${esc(en ? 'Score' : 'الدرجة')}: <b dir="ltr">${esc(c.score)}</b></span>` : ''}${c.detail ? `<span>${esc(c.detail)}</span>` : ''}</p>` : ''}
      <p class="wish">${esc(en ? 'With best wishes for continued success' : WISH[g])}</p>
      <p class="date">${esc(en ? 'Issued on' : 'حُررت في')} ${esc(greg)}${hijri ? ` <span class="sep">•</span> ${esc(hijri)}` : ''}</p>
      <footer class="foot">${sigs.length > 1 ? sig(sigs[0]) : verify || sig()}<div class="seal">${sealHtml}</div>${sig(sigs[sigs.length - 1])}</footer>
      ${sigs.length > 1 && verify ? `<div class="verify-row">${verify}</div>` : ''}
      ${cornerStamp}
    </div>
  </div>
</section>`;
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=Reem+Kufi:wght@500;700&family=Tajawal:wght@400;500;700;800&display=swap';

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #e5e7eb; }
@media print { html, body { background: #fff; } }
.cert { width: 297mm; height: 210mm; padding: 8mm; margin: 0 auto; background: #fff; position: relative; overflow: hidden; page-break-after: always; break-after: page; font-family: 'Cairo', sans-serif; color: #1f2937; }
.cert:last-child { page-break-after: auto; break-after: auto; }
@media screen { .cert + .cert { margin-top: 6mm; } }
.frame { position: relative; height: 100%; }
.inner { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 9mm 20mm 6mm; }
.head { width: 100%; display: grid; grid-template-columns: 1fr 2.2fr 1fr; align-items: center; gap: 6mm; }
.logo { height: 26mm; width: 100%; object-fit: contain; display: block; }
.school { font-weight: 800; font-size: 19px; color: var(--p); line-height: 1.5; }
.title { margin: 4mm 0 0; font-size: 50px; line-height: 1.25; color: var(--p); font-weight: 700; }
.ornament { display: flex; align-items: center; gap: 3mm; margin: 1.5mm 0 3mm; }
.ornament i { width: 26mm; height: 1.5px; background: var(--a); }
.ornament b { width: 3mm; height: 3mm; background: var(--a); transform: rotate(45deg); }
.lead { margin: 0; font-size: 18px; color: #4b5563; }
.name { margin: 2mm 0 1mm; font-weight: 800; color: #111827; line-height: 1.35; padding: 0 10mm 1.5mm; border-bottom: 2px solid color-mix(in srgb, var(--a) 60%, white); }
.cls { margin: 1mm 0 0; font-size: 15px; color: #6b7280; }
.reason { margin: 3mm 0 0; font-size: 21px; font-weight: 700; color: #1f2937; max-width: 210mm; line-height: 1.6; }
.meta { margin: 2mm 0 0; display: flex; gap: 4mm; align-items: center; justify-content: center; font-size: 15px; color: #4b5563; }
.chip { padding: 1mm 4mm; border-radius: 999px; background: color-mix(in srgb, var(--a) 16%, white); color: #1f2937; }
.chip b { color: var(--p); }
.wish { margin: 3mm 0 0; font-size: 15px; color: #6b7280; }
.date { margin: 1.5mm 0 0; font-size: 13px; color: #6b7280; }
.date .sep { color: var(--a); padding: 0 1.5mm; }
.foot { margin-top: auto; width: 100%; display: grid; grid-template-columns: 1fr 30mm 1fr; align-items: end; gap: 10mm; }
.sig { display: flex; flex-direction: column; align-items: center; gap: 1mm; min-height: 18mm; justify-content: flex-end; }
.sig-title { font-size: 13px; color: #6b7280; font-weight: 700; }
.sig-line { width: 55mm; border-bottom: 1px solid #9ca3af; height: 9mm; }
.sig-name { font-size: 14px; color: #1f2937; min-height: 5mm; }
.seal svg { width: 30mm; display: block; margin: 0 auto; }
/* التوقيع والختم صوراً: multiply يُخفي أي خلفية بيضاء متبقية */
.sig-line { position: relative; }
.sig-img { position: absolute; left: 50%; bottom: -1.5mm; transform: translateX(-50%); max-width: 60mm; object-fit: contain; mix-blend-mode: multiply; }
.stamp { display: block; object-fit: contain; mix-blend-mode: multiply; opacity: .92; }
.stamp-seal { margin: 0 auto; }
.stamp-over { position: absolute; left: 50%; bottom: -8mm; transform: translateX(-50%) rotate(-8deg); }
.stamp-corner { position: absolute; bottom: 4mm; transform: rotate(-8deg); z-index: 3; }
.stamp-corner.corner-start { right: 6mm; }
.stamp-corner.corner-end { left: 6mm; }
.verify { display: flex; align-items: center; justify-content: center; gap: 2.5mm; text-align: start; align-self: end; }
.verify-row { margin-top: 2mm; }
.verify-row .verify img { width: 13mm; height: 13mm; }
.verify img { width: 17mm; height: 17mm; }
.verify div { display: flex; flex-direction: column; font-size: 10px; color: #6b7280; line-height: 1.5; }
.verify b { font-size: 11px; color: #1f2937; letter-spacing: .5px; }
.verify .code { font-family: monospace; letter-spacing: 1px; }

/* كلاسيكي */
.tpl-classic { background: #fffdf8; }
.tpl-classic .frame { border: 2.5px solid var(--p); outline: 1px solid var(--a); outline-offset: -3.5mm; }
.tpl-classic .frame::after { content: ''; position: absolute; inset: 5.5mm; border: 1px solid color-mix(in srgb, var(--p) 35%, white); pointer-events: none; }
.tpl-classic .corner { position: absolute; width: 30mm; height: 30mm; z-index: 1; }
.tpl-classic .corner svg { width: 100%; height: 100%; display: block; }
.tpl-classic .tl { top: 2mm; left: 2mm; }
.tpl-classic .tr { top: 2mm; right: 2mm; transform: scaleX(-1); }
.tpl-classic .bl { bottom: 2mm; left: 2mm; transform: scaleY(-1); }
.tpl-classic .br { bottom: 2mm; right: 2mm; transform: scale(-1, -1); }
.tpl-classic .title, .tpl-classic .name { font-family: 'Amiri', serif; }
.tpl-classic .title { font-size: 58px; }
.tpl-classic .inner { background: radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--a) 7%, transparent), transparent 65%); }

/* ملكي */
.tpl-royal { padding: 9mm; background-color: var(--p); background-image: var(--pat); background-size: 12mm 12mm; }
.tpl-royal .frame { background: #fffcf3; box-shadow: 0 0 0 1.2mm var(--a); }
.tpl-royal .frame::before { content: ''; position: absolute; inset: 2.2mm; border: .6mm solid var(--a); pointer-events: none; }
.tpl-royal .frame::after { content: ''; position: absolute; inset: 3.6mm; border: .3mm solid var(--p); pointer-events: none; }
.tpl-royal .inner { padding: 8mm 22mm 5mm; }
.tpl-royal .title { font-family: 'Aref Ruqaa', serif; font-size: 62px; color: var(--p); margin-top: 2mm; }
.tpl-royal .name { font-family: 'Amiri', serif; color: var(--p); border-bottom-style: double; border-bottom-width: 4px; }
.tpl-royal .school { font-family: 'Amiri', serif; font-size: 21px; font-weight: 700; }
.tpl-royal .ornament i { background: linear-gradient(90deg, transparent, var(--a), transparent); width: 40mm; }
.tpl-royal .seal svg { width: 30mm; }

/* عصري */
.tpl-modern { padding: 0; }
.tpl-modern .wave { position: absolute; z-index: 1; }
.tpl-modern .wave svg { width: 100%; height: 100%; display: block; }
.tpl-modern .w1 { top: 0; left: 0; }
.tpl-modern .w2 { bottom: 0; right: 0; }
.tpl-modern .inner { padding: 7mm 30mm 8mm; }
.tpl-modern .title { margin-top: 1mm; }
.tpl-modern .head { width: auto; grid-template-columns: auto auto; grid-template-areas: 'ls lc' 'sn sn'; gap: 2mm 8mm; justify-content: center; }
.tpl-modern .l-school { grid-area: ls; }
.tpl-modern .l-company { grid-area: lc; }
.tpl-modern .school { grid-area: sn; }
.tpl-modern .logo { height: 19mm; width: 42mm; }
.tpl-modern .wave { width: 105mm; height: 62mm; }
.tpl-modern .title { font-family: 'Reem Kufi', sans-serif; font-size: 52px; letter-spacing: .5px; }
.tpl-modern .ornament i { width: 14mm; height: 3px; border-radius: 3px; }
.tpl-modern .ornament b { border-radius: 50%; transform: none; background: var(--p); }
.tpl-modern .name { font-family: 'Cairo', sans-serif; font-weight: 900; border: 0; padding-bottom: 0; color: var(--p); }
.tpl-modern .reason { font-weight: 800; }
.tpl-modern .foot { gap: 14mm; }

/* بسيط */
.tpl-minimal { padding: 12mm; }
.tpl-minimal .frame { border: 1px solid color-mix(in srgb, var(--p) 55%, white); }
.tpl-minimal .frame::before { content: ''; position: absolute; top: -1px; inset-inline-start: 18mm; width: 50mm; height: 3px; background: var(--a); }
.tpl-minimal .frame::after { content: ''; position: absolute; bottom: -1px; inset-inline-end: 18mm; width: 50mm; height: 3px; background: var(--p); }
.tpl-minimal .inner { padding: 8mm 18mm 5mm; font-family: 'Tajawal', 'Cairo', sans-serif; }
.tpl-minimal .logo { height: 21mm; }
.tpl-minimal .school { font-size: 16px; color: #374151; font-weight: 700; }
.tpl-minimal .title { font-family: 'Tajawal', sans-serif; font-weight: 800; font-size: 44px; color: #111827; }
.tpl-minimal .ornament i { display: none; }
.tpl-minimal .ornament b { width: 16mm; height: 3px; transform: none; background: var(--p); }
.tpl-minimal .name { font-family: 'Tajawal', sans-serif; border: 0; color: var(--p); }
.tpl-minimal .seal { opacity: .9; }
.tpl-minimal .seal svg { width: 24mm; }
`;

/** مستند HTML كامل (للمعاينة في iframe وللطباعة) */
export async function buildCertificatesDoc(list: CertificateInput[]): Promise<string> {
  const pages = await Promise.all(list.map(page));
  const dir = isEn() ? 'ltr' : 'rtl';
  return `<!doctype html><html lang="${isEn() ? 'en' : 'ar'}" dir="${dir}"><head><meta charset="utf-8"><base href="${window.location.origin}/">
<title>${esc(list.length === 1 ? `${defaultCertTitle(list[0].kind)} - ${list[0].student}` : defaultCertTitle(list[0]?.kind || 'appreciation'))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${FONTS}" rel="stylesheet">
<style>${CSS}</style></head><body>${pages.join('')}</body></html>`;
}

export async function exportCertificates(list: CertificateInput[]): Promise<void> {
  if (!list.length) return;
  await printHtmlDocument(await buildCertificatesDoc(list));
}
