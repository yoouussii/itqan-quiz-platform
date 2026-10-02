/**
 * نظام النقاط والأوسمة (محسوب من النتائج، لا يُخزَّن).
 * لكل اختبار تُحتسب أفضل محاولة فقط (حتى لا تُكرَّر المحاولات لجمع النقاط):
 *   إكمال الاختبار +10 | مكافأة الدرجة +1 لكل 10% | تميّز (90%+) +10 | درجة كاملة +15 | سلسلة نجاح +5
 */
import { Submission, Quiz } from '../types';

export const POINTS_RULES = [
  { label: 'إكمال اختبار', value: '+10' },
  { label: 'مكافأة الدرجة', value: '+1 لكل 10%' },
  { label: 'تميّز (90% فأكثر)', value: '+10' },
  { label: 'درجة كاملة (100%)', value: '+15' },
  { label: 'سلسلة نجاح (اختباران ناجحان متتاليان)', value: '+5' },
];

export interface PointsItem {
  quizId: string; title: string; subjectId: string; pct: number; passed: boolean; completed_at: string; points: number;
  parts: { base: number; score: number; excellence: number; perfect: number; streak: number };
}
export interface LevelDef { key: string; name: string; emoji: string; min: number }
export const LEVELS: LevelDef[] = [
  { key: 'explorer', name: 'مستكشف', emoji: '🌱', min: 0 },
  { key: 'advanced', name: 'متقدم', emoji: '🚀', min: 100 },
  { key: 'distinguished', name: 'متميز', emoji: '⭐', min: 250 },
  { key: 'expert', name: 'خبير', emoji: '🏅', min: 500 },
  { key: 'legend', name: 'أسطورة', emoji: '👑', min: 1000 },
];

export interface PointsSummary {
  total: number; items: PointsItem[]; count: number; avgPct: number; bestPct: number; perfectCount: number; maxStreak: number;
  level: LevelDef; next: LevelDef | null; progress: number; toNext: number;
  subjectStats: Array<{ subjectId: string; avg: number; count: number }>; improved: boolean;
}

export function computePoints(subs: Submission[], quizzes: Quiz[]): PointsSummary {
  const quizMap = new Map(quizzes.map((q) => [q.id, q]));
  const best = new Map<string, Submission>();
  subs.forEach((s) => {
    const q = quizMap.get(s.quiz_id);
    if (!q || q.is_deleted) return;
    const cur = best.get(s.quiz_id);
    if (!cur || (Number(s.percentage) || 0) > (Number(cur.percentage) || 0)) best.set(s.quiz_id, s);
  });
  const ordered = Array.from(best.values()).sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());

  let run = 0, maxStreak = 0, prevPassed = false;
  const items: PointsItem[] = ordered.map((s) => {
    const q = quizMap.get(s.quiz_id)!;
    const pct = Math.max(0, Math.min(100, Number(s.percentage) || 0));
    const passed = pct >= (q.pass_percentage || 50);
    run = passed ? run + 1 : 0;
    maxStreak = Math.max(maxStreak, run);
    const parts = { base: 10, score: Math.floor(pct / 10), excellence: pct >= 90 ? 10 : 0, perfect: pct >= 100 ? 15 : 0, streak: passed && prevPassed ? 5 : 0 };
    prevPassed = passed;
    return { quizId: q.id, title: q.title, subjectId: q.subject_id, pct, passed, completed_at: s.completed_at, parts, points: parts.base + parts.score + parts.excellence + parts.perfect + parts.streak };
  });

  const total = items.reduce((a, i) => a + i.points, 0);
  const count = items.length;
  const avgPct = count ? Math.round(items.reduce((a, i) => a + i.pct, 0) / count) : 0;
  const bestPct = count ? Math.max(...items.map((i) => i.pct)) : 0;
  const perfectCount = items.filter((i) => i.pct >= 100).length;

  let level = LEVELS[0];
  LEVELS.forEach((l) => { if (total >= l.min) level = l; });
  const idx = LEVELS.findIndex((l) => l.key === level.key);
  const next = LEVELS[idx + 1] || null;
  const progress = next ? Math.round(((total - level.min) / (next.min - level.min)) * 100) : 100;

  const bySubject = new Map<string, number[]>();
  items.forEach((i) => bySubject.set(i.subjectId, [...(bySubject.get(i.subjectId) || []), i.pct]));
  const subjectStats = Array.from(bySubject.entries()).map(([subjectId, arr]) => ({ subjectId, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), count: arr.length }));

  let improved = false;
  if (items.length >= 3) {
    const prev = items.slice(0, -1);
    const prevAvg = prev.reduce((a, i) => a + i.pct, 0) / prev.length;
    improved = items[items.length - 1].pct >= prevAvg + 10;
  }
  return { total, items, count, avgPct, bestPct, perfectCount, maxStreak, level, next, progress, toNext: next ? next.min - total : 0, subjectStats, improved };
}

export interface BadgeDef { key: string; title: string; emoji: string; hint: string; test: (s: PointsSummary) => boolean }
export const BADGES: BadgeDef[] = [
  { key: 'first', title: 'البداية', emoji: '🎯', hint: 'أكمل أول اختبار', test: (s) => s.count >= 1 },
  { key: 'five', title: 'المثابر', emoji: '📚', hint: 'أكمل 5 اختبارات', test: (s) => s.count >= 5 },
  { key: 'ten', title: 'المواظب', emoji: '🔥', hint: 'أكمل 10 اختبارات', test: (s) => s.count >= 10 },
  { key: 'star', title: 'المتفوق', emoji: '🌟', hint: 'حقق 90% أو أكثر في اختبار', test: (s) => s.bestPct >= 90 },
  { key: 'perfect', title: 'الدرجة الكاملة', emoji: '💯', hint: 'حقق 100% في اختبار', test: (s) => s.perfectCount >= 1 },
  { key: 'streak', title: 'الثبات', emoji: '🔗', hint: 'انجح في 3 اختبارات متتالية', test: (s) => s.maxStreak >= 3 },
  { key: 'subject', title: 'نجم المادة', emoji: '🥇', hint: 'متوسط 85% فأكثر في مادة (3 اختبارات على الأقل)', test: (s) => s.subjectStats.some((x) => x.count >= 3 && x.avg >= 85) },
  { key: 'improver', title: 'المتحسّن', emoji: '📈', hint: 'نتيجتك الأخيرة أعلى من متوسطك السابق بـ 10% على الأقل', test: (s) => s.improved },
];
export const computeBadges = (s: PointsSummary) => BADGES.map((b) => ({ ...b, earned: b.test(s) }));
