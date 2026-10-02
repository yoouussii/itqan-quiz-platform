/**
 * نظام النقاط والأوسمة (نقاطي).
 * - تُحسب النقاط من أفضل نتيجة لكل اختبار (فلا تُكسب بتكرار المحاولات) + نقاط الجوائز اليدوية.
 * - لا حاجة لتخزين النقاط: تُحسب دائماً من النتائج المحفوظة.
 */
export interface StudentAward {
  id: string;
  student_id: string;
  student_name?: string | null;
  class_name?: string | null;
  title: string;
  note?: string | null;
  points: number;
  awarded_by?: string | null;
  awarded_by_name?: string | null;
  created_at: string;
}

export interface PointEvent {
  id: string;
  date: string;
  label: string;
  points: number;
  kind: 'quiz' | 'award';
}

type SubLike = { id: string; quiz_id: string; student_id: string; percentage: number; completed_at: string };
type QuizLike = { id: string; title: string; pass_percentage?: number };

export function bestPerQuiz<T extends SubLike>(subs: T[]): T[] {
  const best = new Map<string, T>();
  subs.forEach((s) => {
    const cur = best.get(s.quiz_id);
    if (!cur || Number(s.percentage) > Number(cur.percentage)) best.set(s.quiz_id, s);
  });
  return Array.from(best.values());
}

export function pointsForResult(pct: number, passMark: number) {
  const base = 10; // إكمال الاختبار
  const score = Math.round(pct / 5); // حتى 20 نقطة حسب الدرجة
  const pass = pct >= passMark ? 5 : 0; // النجاح
  const perfect = pct >= 100 ? 15 : 0; // العلامة الكاملة
  return { total: base + score + pass + perfect, base, score, pass, perfect };
}

export function computePointEvents(subs: SubLike[], quizzes: QuizLike[], awards: StudentAward[]): PointEvent[] {
  const qmap = new Map(quizzes.map((q) => [q.id, q]));
  const events: PointEvent[] = [];
  bestPerQuiz(subs.filter((s) => qmap.has(s.quiz_id))).forEach((s) => {
    const q = qmap.get(s.quiz_id)!;
    const pct = Number(s.percentage) || 0;
    events.push({
      id: `sub-${s.id}`,
      date: s.completed_at,
      label: `اختبار: ${q.title} (${Math.round(pct)}%)`,
      points: pointsForResult(pct, q.pass_percentage || 50).total,
      kind: 'quiz',
    });
  });
  awards.forEach((a) =>
    events.push({ id: `aw-${a.id}`, date: a.created_at, label: `جائزة: ${a.title}`, points: Number(a.points) || 0, kind: 'award' })
  );
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export const totalPoints = (events: PointEvent[]) => events.reduce((a, e) => a + e.points, 0);

export type Period = 'week' | 'month' | 'all';
export function inPeriod(dateIso: string, period: Period): boolean {
  if (period === 'all') return true;
  const days = period === 'week' ? 7 : 30;
  return new Date(dateIso).getTime() >= Date.now() - days * 864e5;
}

export const LEVELS = [
  { name: 'مبتدئ', min: 0, emoji: '🌱' },
  { name: 'نشيط', min: 100, emoji: '⚡' },
  { name: 'متميز', min: 250, emoji: '🌟' },
  { name: 'خبير', min: 500, emoji: '🏅' },
  { name: 'أسطورة', min: 1000, emoji: '👑' },
];

export function levelFor(points: number) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (points >= l.min) idx = i;
  });
  const level = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const progress = next ? Math.min(100, Math.round(((points - level.min) / (next.min - level.min)) * 100)) : 100;
  return { level, next, progress, toNext: next ? next.min - points : 0 };
}

export interface BadgeDef { key: string; name: string; emoji: string; desc: string }
export const BADGES: BadgeDef[] = [
  { key: 'first_step', name: 'أول خطوة', emoji: '🥉', desc: 'أكمل أول اختبار' },
  { key: 'persistent', name: 'المثابر', emoji: '🔥', desc: 'أكمل 5 اختبارات' },
  { key: 'consistent', name: 'الثابت', emoji: '✅', desc: 'نتيجته 60% فأكثر في 3 اختبارات أو أكثر دون أي تعثّر' },
  { key: 'champion', name: 'المتفوق', emoji: '🏆', desc: 'متوسطه 90% فأكثر في 3 اختبارات أو أكثر' },
  { key: 'perfect', name: 'العلامة الكاملة', emoji: '⭐', desc: 'حقق 100% في أحد الاختبارات' },
  { key: 'improver', name: 'المتطور', emoji: '📈', desc: 'تحسّنت نتيجته 20 نقطة أو أكثر بين أول اختبار وآخر اختبار' },
];

export function earnedBadges(subs: SubLike[], quizzes: QuizLike[]): string[] {
  const ids = new Set(quizzes.map((q) => q.id));
  const valid = bestPerQuiz(subs.filter((s) => ids.has(s.quiz_id)));
  const n = valid.length;
  if (!n) return [];
  const pcts = valid.map((s) => Number(s.percentage) || 0);
  const avg = pcts.reduce((a, b) => a + b, 0) / n;
  const chrono = [...valid]
    .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
    .map((s) => Number(s.percentage) || 0);
  const out: string[] = ['first_step'];
  if (n >= 5) out.push('persistent');
  if (n >= 3 && pcts.every((p) => p >= 60)) out.push('consistent');
  if (n >= 3 && avg >= 90) out.push('champion');
  if (pcts.some((p) => p >= 100)) out.push('perfect');
  if (n >= 3 && chrono[chrono.length - 1] - chrono[0] >= 20) out.push('improver');
  return out;
}
