import { exportElementToPdf } from './exportPdf';
import { BADGES, levelFor, StudentAward } from './points';
import { computeOutcomes, pct as masteryPct, masteryLevel, MASTERY_LABEL } from './outcomes';
import type { QuizWithDetails, SubmissionWithDetails } from '../types';
import { t } from '../i18n';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface StudentReportInput {
  name: string;
  nationalId?: string;
  className?: string;
  results: Array<{ quiz: string; subject: string; score: string; pct: number; date: string }>;
  points: number;
  badgeKeys: string[];
  awards: StudentAward[];
  /** متوسط كل مادة */
  subjects?: Array<{ name: string; avg: number; count: number }>;
  /** مستوى المهارات (نواتج التعلم) */
  skills?: Array<{ outcome: string; subject: string; pct: number }>;
}

/** متوسطات المواد ومستوى المهارات لطالب واحد (يضاف إلى الكشف) */
export function reportExtras(
  studentId: string,
  quizzes: QuizWithDetails[],
  submissions: SubmissionWithDetails[],
  subjectName: (id: string) => string
): Pick<StudentReportInput, 'subjects' | 'skills'> {
  const mine = submissions.filter((s) => s.student_id === studentId && !s.quiz?.is_deleted);
  const bySubject = new Map<string, number[]>();
  for (const s of mine) {
    const sid = s.quiz?.subject_id || quizzes.find((q) => q.id === s.quiz_id)?.subject_id || '';
    bySubject.set(sid, [...(bySubject.get(sid) || []), Number(s.percentage) || 0]);
  }
  const subjects = Array.from(bySubject.entries())
    .map(([id, list]) => ({ name: subjectName(id) || '—', avg: Math.round(list.reduce((a, b) => a + b, 0) / list.length), count: list.length }))
    .sort((a, b) => b.avg - a.avg);
  const skills = computeOutcomes(quizzes, mine, { studentId }).stats.map((s) => ({ outcome: s.outcome, subject: subjectName(s.subject_id), pct: masteryPct(s) }));
  return { subjects, skills };
}

const BAR = { ok: '#10b981', warn: '#f59e0b', bad: '#f43f5e' } as const;

/** كشف درجات الطالب (PDF عبر نافذة الطباعة) */
export async function exportStudentReport(i: StudentReportInput): Promise<void> {
  const avg = i.results.length ? Math.round(i.results.reduce((a, r) => a + r.pct, 0) / i.results.length) : 0;
  const best = i.results.length ? Math.max(...i.results.map((r) => r.pct)) : 0;
  const lvl = levelFor(i.points);
  const box = (label: string, value: string) =>
    `<div style="flex:1;min-width:120px;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px"><div style="font-size:11px;opacity:.7">${esc(label)}</div><div style="font-size:20px;font-weight:900;margin-top:2px">${esc(value)}</div></div>`;
  const bar = (label: string, sub: string, p: number, note: string) => {
    const color = BAR[masteryLevel(p)];
    return `<div style="margin:6px 0;break-inside:avoid"><div style="display:flex;justify-content:space-between;font-size:12px"><span><b>${esc(label)}</b> <span style="opacity:.65">${esc(sub)}</span></span><span><b>${p}%</b> <span style="opacity:.7">${esc(note)}</span></span></div>
      <div style="height:7px;border-radius:9px;background:#e2e8f0;margin-top:3px"><div style="height:7px;border-radius:9px;width:${Math.max(2, p)}%;background:${color}"></div></div></div>`;
  };

  const badges = BADGES.filter((b) => i.badgeKeys.includes(b.key))
    .map((b) => `<span style="display:inline-block;margin:2px 4px;padding:3px 10px;border-radius:999px;border:1px solid #cbd5e1;font-size:12px">${b.emoji} ${esc(t(b.name))}</span>`)
    .join('') || `<span style="font-size:12px;opacity:.7">${esc(t('لا توجد أوسمة بعد'))}</span>`;
  const awards = i.awards.length
    ? `<ul style="margin:6px 0 0;padding-inline-start:18px;font-size:12px">${i.awards.map((a) => `<li>${esc(a.title)}${a.note ? ` — ${esc(a.note)}` : ''}</li>`).join('')}</ul>`
    : `<span style="font-size:12px;opacity:.7">${esc(t('لا توجد جوائز بعد'))}</span>`;
  const rows = i.results
    .map((r, n) => `<tr><td>${n + 1}</td><td>${esc(r.quiz)}</td><td>${esc(r.subject)}</td><td dir="ltr">${esc(r.score)}</td><td>${esc(Math.round(r.pct))}%</td><td>${esc(r.date)}</td></tr>`)
    .join('');
  const subjects = i.subjects?.length
    ? `<h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">${esc(t('المعدل حسب المادة'))}</h2>${i.subjects.map((s) => bar(s.name, '', s.avg, t('{n} اختبار', { n: s.count }))).join('')}`
    : '';
  const skills = i.skills?.length
    ? `<h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">${esc(t('مستوى المهارات (نواتج التعلم)'))}</h2>${i.skills.map((s) => bar(s.outcome, s.subject, s.pct, t(MASTERY_LABEL[masteryLevel(s.pct)]))).join('')}`
    : '';

  const bodyHtml = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${box(t('الطالب'), i.name)}${box(t('الصف'), i.className || '—')}${box(t('رقم الهوية'), i.nationalId || '—')}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${box(t('اختبارات مؤداة'), String(i.results.length))}${box(t('المعدل العام'), `${avg}%`)}${box(t('أعلى نسبة'), `${best}%`)}${box(t('النقاط'), `${i.points} • ${t(lvl.level.name)}`)}
    </div>
    ${subjects}${skills}
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 8px">${esc(t('النتائج التفصيلية'))}</h2>
    <table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('الاختبار'))}</th><th>${esc(t('المادة'))}</th><th>${esc(t('الدرجة'))}</th><th>${esc(t('النسبة'))}</th><th>${esc(t('التاريخ'))}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">${esc(t('لا توجد نتائج بعد'))}</td></tr>`}</tbody></table>
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">${esc(t('الأوسمة'))}</h2><div>${badges}</div>
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">${esc(t('الجوائز'))}</h2><div>${awards}</div>`;

  await exportElementToPdf({ bodyHtml, title: t('كشف درجات: {name}', { name: i.name }), subtitle: i.className || undefined, orientation: 'portrait' });
}
