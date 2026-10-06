/**
 * طباعة الاختبار ورقياً: ورقة أسئلة بهوية المدرسة (مع خانات الاسم والصف والدرجة)،
 * ونموذج إجابة للمعلم (الإجابات الصحيحة مظللة وجدول مختصر للتصحيح السريع).
 */
import type { Question, Quiz } from '../types';
import { sanitizeHtml, looksLikeHtml } from '../components/common/RichText';
import { loadMedia } from './quizMedia';
import { printHtmlDocument, getPrintBrand } from './exportPdf';
import { certBrand } from './certificate';
import { optionLetters, isEn, t } from '../i18n';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rich = (s?: string) => (s ? (looksLikeHtml(s) ? sanitizeHtml(s) : esc(s).replace(/\n/g, '<br>')) : '');
const marksLabel = (m: number) => (isEn() ? `${m} ${m === 1 ? 'mark' : 'marks'}` : m === 1 ? 'درجة' : m === 2 ? 'درجتان' : m <= 10 ? `${m} درجات` : `${m} درجة`);

interface Opts { answerKey: boolean }

function optionsHtml(options: string[] = [], correct: number | undefined, key: boolean) {
  const L = optionLetters();
  const cols = options.every((o) => (o || '').replace(/<[^>]*>/g, '').length <= 28) ? 'cols-2' : '';
  return `<ol class="opts ${cols}">${options.map((o, i) => `<li class="${key && i === correct ? 'ok' : ''}"><span class="l">${esc(L[i] || i + 1)}</span><span>${rich(o)}</span></li>`).join('')}</ol>`;
}

function lines(n: number) {
  return `<div class="lines">${Array.from({ length: n }, () => '<i></i>').join('')}</div>`;
}

function answerArea(q: { type?: string; options?: string[]; correct_option_index?: number; correctAnswer?: string; blankAnswer?: string; explanation?: string; marks: number; pairs?: Array<{ left: string; right: string }>;
  correct_indexes?: number[]; accepted_answers?: string[]; correct_number?: number | null; tolerance?: number | null; items?: Array<{ id: string; text: string }> }, key: boolean) {
  const type = q.type || 'mcq';
  const L = optionLetters();
  if (type === 'multi_select') {
    const keys = q.correct_indexes || [];
    return `<p class="hint">${esc(t('اختر كل الإجابات الصحيحة'))}</p><ol class="opts">${(q.options || []).map((o, i) => `<li class="${key && keys.includes(i) ? 'ok' : ''}"><span class="l">☐ ${esc(L[i] || i + 1)}</span><span>${rich(o)}</span></li>`).join('')}</ol>`;
  }
  if (type === 'fill_blank' && q.accepted_answers) return key ? `<p class="model">${esc(t('الإجابة:'))} ${esc(q.accepted_answers.filter(Boolean).join(' / '))}</p>` : lines(1);
  if (type === 'numeric') return key ? `<p class="model">${esc(t('الإجابة:'))} ${esc(String(q.correct_number ?? ''))}${q.tolerance ? ` (± ${esc(String(q.tolerance))})` : ''}</p>` : lines(1);
  if (type === 'ordering') {
    const items = q.items || [];
    const shown = key ? items : [...items].sort((a, b) => a.text.localeCompare(b.text, 'ar'));
    return `<p class="hint">${esc(t('رتّب العناصر بكتابة رقم الترتيب في القوس'))}</p><ol class="opts">${shown.map((it) => `<li><span class="l">${key ? esc(String(items.indexOf(it) + 1)) : '(&nbsp;&nbsp;&nbsp;)'}</span><span>${esc(it.text)}</span></li>`).join('')}</ol>`;
  }
  if ((type === 'mcq' || type === 'true_false') && (q.options || []).length) return optionsHtml(q.options, q.correct_option_index, key);
  if (type === 'true_false') return `<div class="tf"><span>( &nbsp; ) ${esc(t('صح'))}</span><span>( &nbsp; ) ${esc(t('خطأ'))}</span></div>`;
  if (type === 'fill_blank') return key ? `<p class="model">${esc(t('الإجابة:'))} ${rich(q.blankAnswer || q.correctAnswer || '')}</p>` : lines(1);
  if (type === 'matching') {
    const pairs = q.pairs || [];
    const right = key ? pairs.map((p) => p.right) : [...pairs.map((p) => p.right)].sort();
    return `<table class="match"><tbody>${pairs.map((p, i) => `<tr><td>${i + 1}. ${rich(p.left)}</td><td class="blank">${key ? esc(String(i + 1)) : '(&nbsp;&nbsp;&nbsp;)'}</td><td>${rich(right[i])}</td></tr>`).join('')}</tbody></table>`;
  }
  if (type === 'essay') {
    if (key) return `<p class="model">${esc(t('الإجابة النموذجية:'))} ${rich(q.correctAnswer || q.explanation || '—')}</p>`;
    return lines(Math.min(12, Math.max(3, Math.round(Number(q.marks) || 2) + 2)));
  }
  return '';
}

/** حرف الإجابة الصحيحة لجدول التصحيح السريع */
const keyCell = (q: Question) => {
  if ((q.options || []).length && q.correct_option_index !== undefined && q.correct_option_index >= 0) return optionLetters()[q.correct_option_index] || '';
  if (q.type === 'essay') return t('مقالي');
  if (q.type === 'multi_select') return (q.correct_indexes || []).map((i) => optionLetters()[i] || i + 1).join('، ');
  if (q.type === 'numeric') return String(q.correct_number ?? '—');
  if (q.type === 'fill_blank') return (q.accepted_answers?.[0] || q.blankAnswer || q.correctAnswer || '').replace(/<[^>]*>/g, '').slice(0, 20);
  if (q.type === 'ordering' || q.type === 'matching') return t('انظر السؤال');
  return '—';
};

export function buildQuizPaper(quiz: Quiz & { subject?: { name: string } }, questions: Question[], { answerKey }: Opts): string {
  const b = certBrand();
  const pb = getPrintBrand();
  const school = b.schoolName || pb.name || '';
  const logo = b.schoolLogo || pb.logo || '';
  const total = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
  let n = 0;
  const body = questions.map((q) => {
    if (q.type === 'passage') {
      const subs = (q.sub_questions || []).map((sq) => {
        n++;
        return `<div class="q sub"><div class="qh"><b class="n">${n}</b><div class="qt">${rich(sq.question_text)}</div><span class="m">(${esc(marksLabel(Number(sq.marks) || 0))})</span></div>${answerArea(sq, answerKey)}</div>`;
      }).join('');
      return `<section class="passage"><div class="ptext">${rich(q.question_text)}</div>${subs}</section>`;
    }
    n++;
    return `<div class="q"><div class="qh"><b class="n">${n}</b><div class="qt">${rich(q.question_text)}</div><span class="m">(${esc(marksLabel(Number(q.marks) || 0))})</span></div>${answerArea(q, answerKey)}</div>`;
  }).join('');

  let k = 0;
  const flat = questions.flatMap((q) => (q.type === 'passage' ? (q.sub_questions || []) as unknown as Question[] : [q]));
  const keyTable = answerKey
    ? `<table class="keytbl"><tbody><tr>${flat.map(() => `<th>${++k}</th>`).join('')}</tr><tr>${flat.map((q) => `<td>${esc(keyCell(q))}</td>`).join('')}</tr></tbody></table>`
    : '';

  const dir = isEn() ? 'ltr' : 'rtl';
  return `<!doctype html><html lang="${isEn() ? 'en' : 'ar'}" dir="${dir}"><head><meta charset="utf-8"><base href="${window.location.origin}/">
<title>${esc(answerKey ? `${t('نموذج الإجابة')} - ${quiz.title}` : quiz.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: A4 portrait; margin: 12mm 13mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif; color: #111827; font-size: 13.5px; line-height: 1.7; }
header { display: grid; grid-template-columns: 30mm 1fr 30mm; align-items: center; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 3mm; }
header img { max-height: 22mm; max-width: 30mm; object-fit: contain; }
.q-img { display: block; max-width: 100%; max-height: 70mm; margin: 2mm 0; object-fit: contain; }
header .c { text-align: center; }
header .school { font-family: 'Cairo', sans-serif; font-weight: 800; font-size: 15px; }
header h1 { font-family: 'Cairo', sans-serif; margin: 1mm 0 0; font-size: 19px; }
header .meta { font-size: 12px; color: #374151; }
.badge { display: inline-block; margin-top: 1mm; padding: .5mm 3mm; border: 1.5px solid #b91c1c; color: #b91c1c; border-radius: 999px; font-weight: 800; font-size: 12px; }
.student { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 4mm; margin: 4mm 0 3mm; font-size: 13px; }
.student div { border-bottom: 1px dotted #6b7280; padding-bottom: 1mm; }
.inst { font-size: 12px; color: #374151; margin: 0 0 3mm; }
.q { break-inside: avoid; margin: 0 0 4mm; }
.qh { display: flex; gap: 2.5mm; align-items: flex-start; }
.n { flex: none; min-width: 7mm; height: 7mm; border-radius: 50%; border: 1.5px solid #111827; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
.qt { flex: 1; font-weight: 600; }
.qt p { margin: 0; }
.m { flex: none; font-size: 11.5px; color: #4b5563; white-space: nowrap; }
.opts { list-style: none; margin: 1.5mm 0 0; padding-inline-start: 9.5mm; display: grid; gap: 1mm 6mm; }
.opts.cols-2 { grid-template-columns: 1fr 1fr; }
.opts li { display: flex; gap: 2mm; align-items: baseline; }
.opts .l { flex: none; width: 5.5mm; height: 5.5mm; border: 1px solid #6b7280; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
.opts li.ok { font-weight: 800; }
.opts li.ok .l { background: #111827; color: #fff; border-color: #111827; }
.opts p, .model p { display: inline; margin: 0; }
.tf { display: flex; gap: 12mm; padding-inline-start: 9.5mm; margin-top: 1mm; }
.lines { padding-inline-start: 9.5mm; margin-top: 1mm; }
.lines i { display: block; height: 7.5mm; border-bottom: 1px solid #9ca3af; }
.model { margin: 1.5mm 0 0; padding: 2mm 3mm; margin-inline-start: 9.5mm; background: #f3f4f6; border-radius: 2mm; }
.match { margin: 1.5mm 0 0; margin-inline-start: 9.5mm; border-collapse: collapse; }
.match td { padding: 1mm 3mm; }
.match .blank { text-align: center; }
.passage { border: 1px solid #d1d5db; border-radius: 3mm; padding: 3mm; margin: 0 0 4mm; }
.ptext { background: #f9fafb; padding: 2.5mm 3mm; border-radius: 2mm; margin-bottom: 3mm; }
.keytbl { border-collapse: collapse; margin: 3mm 0 4mm; width: 100%; table-layout: fixed; font-size: 12px; }
.keytbl th, .keytbl td { border: 1px solid #9ca3af; text-align: center; padding: 1mm; }
.keytbl th { background: #f3f4f6; }
footer { margin-top: 6mm; text-align: center; font-size: 12px; color: #4b5563; }
</style></head><body>
<header>
  <div>${logo ? `<img src="${esc(logo)}" alt="">` : ''}</div>
  <div class="c">
    ${school ? `<div class="school">${esc(school)}</div>` : ''}
    <h1>${esc(quiz.title)}</h1>
    <div class="meta">${esc([quiz.subject?.name, `${t('الزمن')}: ${quiz.duration_minutes} ${t('دقيقة')}`, `${t('الدرجة الكلية')}: ${total}`].filter(Boolean).join(' • '))}</div>
    ${answerKey ? `<span class="badge">${esc(t('نموذج الإجابة — للمعلم'))}</span>` : ''}
  </div>
  <div>${b.companyLogo ? `<img src="${esc(b.companyLogo)}" alt="">` : ''}</div>
</header>
${answerKey ? keyTable : `<div class="student"><div>${esc(t('اسم الطالب'))}:</div><div>${esc(t('الصف'))}:</div><div>${esc(t('الدرجة'))}: &nbsp; / ${total}</div></div>
<p class="inst">${esc(t('أجب عن جميع الأسئلة. في أسئلة الاختيار ظلّل دائرة الإجابة الصحيحة.'))}</p>`}
${body}
<footer>${esc(answerKey ? t('انتهى نموذج الإجابة') : t('انتهت الأسئلة — مع تمنياتنا لك بالتوفيق'))}</footer>
</body></html>`;
}

export const printQuizPaper = async (quiz: Quiz & { subject?: { name: string } }, questions: Question[], answerKey: boolean) => {
  // صور الأسئلة المحفوظة في الخادم تُضمَّن قبل الطباعة
  const html = buildQuizPaper(quiz, questions, { answerKey });
  return printHtmlDocument(html.includes('data-media') ? await inlineMediaRefs(html) : html);
};

/** صور «data-media» (بعد التنقية) ← صور كاملة */
async function inlineMediaRefs(html: string): Promise<string> {
  const ids = Array.from(new Set(Array.from(html.matchAll(/data-media="(qm-[0-9a-f]{18})"/g)).map((m) => m[1])));
  const urls = await Promise.all(ids.map((id) => loadMedia(id)));
  let out = html;
  ids.forEach((id, i) => { if (urls[i]) out = out.split(`data-media="${id}"`).join(`src="${urls[i]}"`); });
  return out;
}
