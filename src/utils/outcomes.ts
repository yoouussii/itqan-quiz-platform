/**
 * تحليل نواتج التعلم: نسبة إتقان كل مهارة = الدرجات المحققة ÷ الدرجات الممكنة
 * في كل الأسئلة الموسومة بها، من تسليمات الطلاب.
 * - أسئلة القطعة الفرعية ترث ناتج تعلم القطعة.
 * - الأسئلة المقالية التي لم تُصحَّح بعد لا تُحسب (حتى لا تظهر المهارة ضعيفة ظلماً).
 * - الاختبارات المحذوفة لا تُحسب.
 */
import type { Question, QuizWithDetails, SubmissionWithDetails } from '../types';

export interface StudentMastery {
  awarded: number;
  possible: number;
}

export interface OutcomeStat {
  outcome: string;
  subject_id: string;
  awarded: number;
  possible: number;
  /** عدد إجابات الطلاب المحسوبة */
  answers: number;
  /** معرّفات الأسئلة (للعرض) */
  questionIds: Set<string>;
  students: Map<string, StudentMastery>;
  /** حسب الشعبة: معرّف الشعبة ← الدرجات */
  classes: Map<string, StudentMastery>;
}

export const pct = (m: StudentMastery) => (m.possible > 0 ? Math.round((m.awarded / m.possible) * 100) : 0);

/** مستوى الإتقان: متقن ≥ 80، متوسط ≥ 50، يحتاج علاجاً أقل من ذلك */
export const masteryLevel = (p: number): 'ok' | 'warn' | 'bad' => (p >= 80 ? 'ok' : p >= 50 ? 'warn' : 'bad');
export const MASTERY_LABEL = { ok: 'متقن', warn: 'متوسط', bad: 'يحتاج علاجاً' } as const;

const add = (m: Map<string, StudentMastery>, k: string, awarded: number, possible: number) => {
  const cur = m.get(k) || { awarded: 0, possible: 0 };
  cur.awarded += awarded;
  cur.possible += possible;
  m.set(k, cur);
};

export function computeOutcomes(
  quizzes: QuizWithDetails[],
  submissions: SubmissionWithDetails[],
  opts: { subjectId?: string; classId?: string; quizId?: string; studentId?: string; classOf?: (studentId: string) => string | undefined } = {}
): { stats: OutcomeStat[]; untagged: number; tagged: number } {
  const byId = new Map(quizzes.filter((q) => !q.is_deleted).map((q) => [q.id, q]));
  const stats = new Map<string, OutcomeStat>();
  const seenUntagged = new Set<string>();
  const seenTagged = new Set<string>();

  for (const quiz of byId.values()) {
    if (opts.subjectId && quiz.subject_id !== opts.subjectId) continue;
    if (opts.quizId && quiz.id !== opts.quizId) continue;
    for (const q of quiz.questions || []) (q.outcome?.trim() ? seenTagged : seenUntagged).add(`${quiz.id}:${q.id}`);
  }

  for (const sub of submissions) {
    const quiz = byId.get(sub.quiz_id);
    if (!quiz || sub.status === 'in_progress') continue;
    if (opts.subjectId && quiz.subject_id !== opts.subjectId) continue;
    if (opts.quizId && quiz.id !== opts.quizId) continue;
    if (opts.studentId && sub.student_id !== opts.studentId) continue;
    const cls = sub.student_class?.id || opts.classOf?.(sub.student_id) || '';
    if (opts.classId && cls !== opts.classId) continue;
    const qmap = new Map<string, Question>((quiz.questions || []).map((q) => [q.id, q]));

    for (const ans of sub.answers_json || []) {
      const q = qmap.get(ans.question_id);
      const outcome = q?.outcome?.trim();
      if (!q || !outcome) continue;
      const key = `${quiz.subject_id}::${outcome}`;
      let st = stats.get(key);
      if (!st) {
        st = { outcome, subject_id: quiz.subject_id, awarded: 0, possible: 0, answers: 0, questionIds: new Set(), students: new Map(), classes: new Map() };
        stats.set(key, st);
      }
      // أجزاء الإجابة: السؤال نفسه، أو أسئلة القطعة الفرعية
      const parts: Array<{ marks: number; awarded: number; essay: boolean; graded: boolean }> =
        q.type === 'passage'
          ? (q.sub_questions || []).map((sq) => {
              const sa = ans.sub_answers?.find((x) => x.sub_question_id === sq.id);
              return { marks: Number(sq.marks) || 0, awarded: Number(sa?.marks_awarded) || 0, essay: sq.type === 'essay', graded: !!sa?.graded };
            })
          : [{ marks: Number(q.marks) || 0, awarded: Number(ans.marks_awarded) || 0, essay: q.type === 'essay', graded: !!ans.graded }];
      let a = 0;
      let p = 0;
      for (const part of parts) {
        if (part.essay && !part.graded) continue;
        a += Math.min(part.awarded, part.marks);
        p += part.marks;
      }
      if (p <= 0) continue;
      st.awarded += a;
      st.possible += p;
      st.answers += 1;
      st.questionIds.add(`${quiz.id}:${q.id}`);
      add(st.students, sub.student_id, a, p);
      if (cls) add(st.classes, cls, a, p);
    }
  }

  return {
    stats: Array.from(stats.values()).sort((x, y) => pct(x) - pct(y)),
    untagged: seenUntagged.size,
    tagged: seenTagged.size,
  };
}
