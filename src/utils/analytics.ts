/**
 * حسابات لوحة التحليلات: الفلاتر، المقارنة بالفترة السابقة، خريطة الشعب × المواد،
 * تطور الدرجات أسبوعياً، والطلاب الذين يحتاجون تدخلاً.
 * كلها من البيانات المحمّلة أصلاً (لا طلبات إضافية للخادم).
 */
import type { QuizWithDetails, SubmissionWithDetails, User } from '../types';
import { parseWindowEnd } from './quizWindow';

export type Period = 'week' | 'month' | 'term' | 'year' | 'all';
export const PERIOD_DAYS: Record<Period, number | null> = { week: 7, month: 30, term: 90, year: 365, all: null };

export interface AnalyticsFilters {
  period: Period;
  subjectId: string;
  classId: string;
  teacherId: string;
  branchId: string;
}
export const emptyFilters = (): AnalyticsFilters => ({ period: 'term', subjectId: '', classId: '', teacherId: '', branchId: '' });

const DAY = 86_400_000;
const time = (iso?: string) => (iso ? new Date(iso).getTime() || 0 : 0);
const pctOf = (s: SubmissionWithDetails) => Number(s.percentage) || 0;
const avgOf = (list: number[]) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0);

export interface Scope {
  quizzes: QuizWithDetails[];
  submissions: SubmissionWithDetails[];
  users: User[];
}

/** الفلاتر عدا الفترة (المادة، الشعبة، المعلم، الفرع) */
export function matchesDims(s: SubmissionWithDetails, f: AnalyticsFilters, scope: Scope): boolean {
  if (s.quiz?.is_deleted || s.status === 'in_progress') return false;
  const quiz = s.quiz || scope.quizzes.find((q) => q.id === s.quiz_id);
  if (f.subjectId && quiz?.subject_id !== f.subjectId) return false;
  if (f.teacherId && quiz?.teacher_id !== f.teacherId) return false;
  const student = s.student || scope.users.find((u) => u.id === s.student_id);
  if (f.classId && (s.student_class?.id || student?.class_id) !== f.classId) return false;
  if (f.branchId && student?.branch_id !== f.branchId) return false;
  return true;
}

/** تسليمات الفترة الحالية والسابقة (بنفس الطول) */
export function splitByPeriod(subs: SubmissionWithDetails[], period: Period, now = Date.now()) {
  const days = PERIOD_DAYS[period];
  if (!days) return { current: subs, previous: null as SubmissionWithDetails[] | null };
  const start = now - days * DAY;
  const prevStart = start - days * DAY;
  return {
    current: subs.filter((s) => time(s.completed_at) >= start),
    previous: subs.filter((s) => time(s.completed_at) >= prevStart && time(s.completed_at) < start),
  };
}

export interface Summary { count: number; avg: number; passRate: number; students: number }
export function summarize(subs: SubmissionWithDetails[]): Summary {
  const passed = subs.filter((s) => pctOf(s) >= (s.quiz?.pass_percentage || 50)).length;
  return {
    count: subs.length,
    avg: avgOf(subs.map(pctOf)),
    passRate: subs.length ? Math.round((passed / subs.length) * 100) : 0,
    students: new Set(subs.map((s) => s.student_id)).size,
  };
}

/** خريطة الشعب × المواد: متوسط كل خلية وعدد تسليماتها */
export function heatmap(subs: SubmissionWithDetails[], scope: Scope) {
  const cells = new Map<string, number[]>();
  const rows = new Set<string>();
  const cols = new Set<string>();
  for (const s of subs) {
    const cls = s.student_class?.id || scope.users.find((u) => u.id === s.student_id)?.class_id || '';
    const subj = s.quiz?.subject_id || scope.quizzes.find((q) => q.id === s.quiz_id)?.subject_id || '';
    if (!cls || !subj) continue;
    rows.add(cls);
    cols.add(subj);
    const k = `${cls}|${subj}`;
    cells.set(k, [...(cells.get(k) || []), pctOf(s)]);
  }
  const cell = (cls: string, subj: string) => {
    const v = cells.get(`${cls}|${subj}`);
    return v ? { avg: avgOf(v), n: v.length } : null;
  };
  return { rows: Array.from(rows), cols: Array.from(cols), cell };
}

/** متوسط كل أسبوع (للكل، ولكل مادة) */
export function weeklyTrend(subs: SubmissionWithDetails[], scope: Scope, subjectIds: string[], now = Date.now()) {
  if (!subs.length) return [];
  const first = Math.min(...subs.map((s) => time(s.completed_at)).filter(Boolean));
  const weeks = Math.min(26, Math.max(1, Math.ceil((now - first) / (7 * DAY))));
  const out: Array<Record<string, number | string | null>> = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = now - w * 7 * DAY;
    const start = end - 7 * DAY;
    const inWeek = subs.filter((s) => time(s.completed_at) > start && time(s.completed_at) <= end);
    const row: Record<string, number | string | null> = { week: new Date(end).toISOString().slice(0, 10), all: inWeek.length ? avgOf(inWeek.map(pctOf)) : null, n: inWeek.length };
    for (const id of subjectIds) {
      const v = inWeek.filter((s) => (s.quiz?.subject_id || scope.quizzes.find((q) => q.id === s.quiz_id)?.subject_id) === id).map(pctOf);
      row[id] = v.length ? avgOf(v) : null;
    }
    out.push(row);
  }
  return out;
}

export type RiskReason =
  | { kind: 'low_avg'; value: number }
  | { kind: 'failed_last_two' }
  | { kind: 'declining'; value: number }
  | { kind: 'missed'; value: number };

export interface AtRisk { student: User; reasons: RiskReason[]; lastAvg: number }

/**
 * طلاب يحتاجون تدخلاً (من كل تسليماتهم ضمن الفلاتر، لا الفترة فقط):
 * متوسط آخر 3 اختبارات أقل من 50%، أو رسوب في آخر اختبارين، أو تراجع 15 نقطة فأكثر
 * عن الثلاثة التي قبلها، أو فاته اختباران فأكثر انتهى وقتهما دون تسليم.
 */
export function atRiskStudents(
  subs: SubmissionWithDetails[],
  students: User[],
  quizzesFor: (studentId: string) => QuizWithDetails[],
  now = Date.now()
): AtRisk[] {
  const out: AtRisk[] = [];
  for (const st of students) {
    const mine = subs.filter((s) => s.student_id === st.id).sort((a, b) => time(b.completed_at) - time(a.completed_at));
    const reasons: RiskReason[] = [];
    const last3 = mine.slice(0, 3).map(pctOf);
    const prev3 = mine.slice(3, 6).map(pctOf);
    if (last3.length >= 2 && avgOf(last3) < 50) reasons.push({ kind: 'low_avg', value: avgOf(last3) });
    if (mine.length >= 2 && mine.slice(0, 2).every((s) => pctOf(s) < (s.quiz?.pass_percentage || 50))) reasons.push({ kind: 'failed_last_two' });
    if (last3.length === 3 && prev3.length >= 2 && avgOf(prev3) - avgOf(last3) >= 15) reasons.push({ kind: 'declining', value: avgOf(prev3) - avgOf(last3) });
    const done = new Set(mine.map((s) => s.quiz_id));
    const missed = quizzesFor(st.id).filter((q) => {
      if (q.is_deleted || q.status !== 'published' || done.has(q.id)) return false;
      const end = parseWindowEnd(q.end_date);
      return !!end && end.getTime() < now;
    }).length;
    if (missed >= 2) reasons.push({ kind: 'missed', value: missed });
    if (reasons.length) out.push({ student: st, reasons, lastAvg: avgOf(last3) });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length || a.lastAvg - b.lastAvg);
}

/**
 * تحليل سؤال: الصعوبة (نسبة من أجاب صحيحاً) ومعامل التمييز
 * (نسبة الصواب في أعلى 27% من الطلاب ناقص أدناهم 27%)، وتوزيع الاختيارات.
 */
export function itemAnalysis(questionId: string, subs: SubmissionWithDetails[], optionCount: number) {
  const answered = subs
    .map((s) => ({ total: pctOf(s), a: (s.answers_json || []).find((x) => x.question_id === questionId) }))
    .filter((x) => x.a);
  const n = answered.length;
  const correct = answered.filter((x) => x.a!.is_correct).length;
  const sorted = [...answered].sort((a, b) => b.total - a.total);
  const g = Math.max(1, Math.round(n * 0.27));
  const rate = (list: typeof answered) => (list.length ? list.filter((x) => x.a!.is_correct).length / list.length : 0);
  const discrimination = n >= 5 ? Math.round((rate(sorted.slice(0, g)) - rate(sorted.slice(-g))) * 100) / 100 : null;
  const choices = Array.from({ length: optionCount }, (_, i) => answered.filter((x) => x.a!.selected_option === i).length);
  const blank = answered.filter((x) => x.a!.selected_option == null).length;
  return { n, difficulty: n ? Math.round((correct / n) * 100) : 0, discrimination, choices, blank };
}
