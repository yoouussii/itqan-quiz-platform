import { exportElementToPdf } from './exportPdf';
import { BADGES, levelFor, StudentAward } from './points';
import { computeOutcomes, pct as masteryPct, masteryLevel, MASTERY_LABEL } from './outcomes';
import type { QuizWithDetails, SubmissionWithDetails } from '../types';
import { t, dateLocale } from '../i18n';
import { fetchAttendance, fetchAttendanceConfig, schoolDaysBetween, isoDay } from '../services/attendanceService';
import { fetchBehavior, fetchBehaviorConfig, conductScore } from '../services/behaviorService';

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
  /** لإضافة ملخص الحضور والغياب إلى الكشف */
  studentId?: string;
}

/** متوسطات المواد ومستوى المهارات لطالب واحد (يضاف إلى الكشف) */
export function reportExtras(
  studentId: string,
  quizzes: QuizWithDetails[],
  submissions: SubmissionWithDetails[],
  subjectName: (id: string) => string
): Pick<StudentReportInput, 'subjects' | 'skills' | 'studentId'> {
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
  return { subjects, skills, studentId };
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
  // نقاط تحدي اليوم ليست جوائز من المعلم فلا تُسرد هنا
  const staffAwards = i.awards.filter((a) => a.source !== 'daily_challenge');
  const awards = staffAwards.length
    ? `<ul style="margin:6px 0 0;padding-inline-start:18px;font-size:12px">${staffAwards.map((a) => `<li>${esc(a.title)}${a.note ? ` — ${esc(a.note)}` : ''}</li>`).join('')}</ul>`
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

  // ملخص الحضور (إن وُجد سجل للطالب ويملك المستخدم رؤيته)
  let attendance = '';
  if (i.studentId) {
    try {
      const [recs, cfg] = await Promise.all([fetchAttendance('2000-01-01', '2100-01-01', [i.studentId]), fetchAttendanceConfig()]);
      if (recs && (recs.length || cfg?.start_date)) {
        const c = { absent: 0, late: 0, excused: 0 } as Record<string, number>;
        recs.forEach((r) => { c[r.kind]++; });
        let rateBox = '';
        if (cfg?.start_date) {
          const end = isoDay(new Date(new Date(`${cfg.start_date}T12:00:00`).getTime() + (cfg.weeks * 7 - 1) * 864e5));
          const today = isoDay(new Date());
          const days = Math.max(1, schoolDaysBetween(cfg.start_date, end < today ? end : today));
          rateBox = box(t('نسبة الحضور'), `${Math.round(Math.max(0, 1 - c.absent / days) * 1000) / 10}%`);
        }
        const last = recs.slice(0, 8).map((r) => `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;border-radius:999px;border:1px solid #cbd5e1;font-size:11px">${esc(t(r.kind === 'absent' ? 'غياب' : r.kind === 'late' ? 'تأخر' : 'استئذان'))} · ${esc(new Date(`${r.day}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' }))}</span>`).join('');
        attendance = `<h2 style="font-size:14px;font-weight:800;margin:14px 0 6px">${esc(t('الحضور والغياب'))}</h2>
          <div style="display:flex;gap:10px;flex-wrap:wrap">${box(t('غياب'), String(c.absent))}${box(t('تأخر'), String(c.late))}${box(t('استئذان'), String(c.excused))}${rateBox}</div>
          ${last ? `<div style="margin-top:6px">${last}</div>` : ''}`;
      }
    } catch { /* الكشف يُطبع بدون الحضور */ }
  }
  // السلوك والمواظبة
  let conduct = '';
  if (i.studentId) {
    try {
      const [cfg, beh, att] = await Promise.all([fetchBehaviorConfig(), fetchBehavior([i.studentId]), fetchAttendance('2000-01-01', '2100-01-01', [i.studentId])]);
      if (cfg.catalog && Object.keys(cfg.catalog).length) {
        const sc = conductScore(beh, att || [], cfg);
        const n = (x: number) => String(Math.round(x * 100) / 100);
        conduct = `<h2 style="font-size:14px;font-weight:800;margin:14px 0 6px">${esc(t('السلوك والمواظبة'))}</h2>
          <div style="display:flex;gap:10px;flex-wrap:wrap">${box(t('درجة السلوك'), `${n(sc.behavior)} / ${n(cfg.behavior_max)}`)}${box(t('درجة المواظبة'), `${n(sc.attendance)} / ${n(cfg.attendance_max)}`)}${box(t('المخالفات'), String(sc.violations))}${box(t('السلوك الإيجابي'), String(sc.positives))}</div>`;
      }
    } catch { /* بدون السلوك */ }
  }

  const bodyHtml = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${box(t('الطالب'), i.name)}${box(t('الصف'), i.className || '—')}${box(t('رقم الهوية'), i.nationalId || '—')}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${box(t('اختبارات مؤداة'), String(i.results.length))}${box(t('المعدل العام'), `${avg}%`)}${box(t('أعلى نسبة'), `${best}%`)}${box(t('النقاط'), `${i.points} • ${t(lvl.level.name)}`)}
    </div>
    ${subjects}${skills}${attendance}${conduct}
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 8px">${esc(t('النتائج التفصيلية'))}</h2>
    <table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('الاختبار'))}</th><th>${esc(t('المادة'))}</th><th>${esc(t('الدرجة'))}</th><th>${esc(t('النسبة'))}</th><th>${esc(t('التاريخ'))}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">${esc(t('لا توجد نتائج بعد'))}</td></tr>`}</tbody></table>
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">${esc(t('الأوسمة'))}</h2><div>${badges}</div>
    <h2 style="font-size:14px;font-weight:800;margin:14px 0 4px">${esc(t('الجوائز'))}</h2><div>${awards}</div>`;

  await exportElementToPdf({ bodyHtml, title: t('كشف درجات: {name}', { name: i.name }), subtitle: i.className || undefined, orientation: 'portrait' });
}
