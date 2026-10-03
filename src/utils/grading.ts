import { Question, Submission } from '../types';
import { StorageService } from '../services/storage';

/** فتح جدول النتائج على فلتر معيّن (مثل «يحتاج تصحيح») عند الانتقال من الرئيسية */
export const SUBMISSIONS_FILTER_KEY = 'itqan_submissions_filter';

const hasText = (v?: string) => !!v && v.replace(/<[^>]*>/g, '').trim().length > 0;

/** عدد الإجابات المقالية في التسليم التي كتب فيها الطالب ولم يصححها المعلم بعد */
export const ungradedEssayCount = (sub: Submission, questions?: Question[]): number => {
  const qs = questions || StorageService.getQuestionsByQuizId(sub.quiz_id);
  let n = 0;
  for (const q of qs) {
    const a = (sub.answers_json || []).find((x) => x.question_id === q.id);
    if (!a) continue;
    if (q.type === 'essay' && hasText(a.text_answer) && !a.graded) n++;
    for (const sq of q.sub_questions || []) {
      if (sq.type !== 'essay') continue;
      const sa = (a.sub_answers || []).find((x) => x.sub_question_id === sq.id);
      if (sa && hasText(sa.text_answer) && !sa.graded) n++;
    }
  }
  return n;
};

/** إجمالي المقالات غير المصححة في مجموعة تسليمات، وعدد الاختبارات التي تخصها */
export const ungradedSummary = (subs: Submission[]): { essays: number; quizzes: number; submissionIds: Set<string> } => {
  const cache = new Map<string, Question[]>();
  const ids = new Set<string>();
  const quizIds = new Set<string>();
  let essays = 0;
  for (const s of subs) {
    if (!cache.has(s.quiz_id)) cache.set(s.quiz_id, StorageService.getQuestionsByQuizId(s.quiz_id));
    const n = ungradedEssayCount(s, cache.get(s.quiz_id));
    if (n > 0) {
      essays += n;
      ids.add(s.id);
      quizIds.add(s.quiz_id);
    }
  }
  return { essays, quizzes: quizIds.size, submissionIds: ids };
};

/** إجابة مقالية واحدة تحتاج (أو احتاجت) تصحيحاً: صفحة «التصحيح» تعرضها واحدة واحدة */
export interface EssayItem {
  key: string;
  submission: Submission;
  question: Question;
  /** للأسئلة الفرعية داخل القطعة */
  subQuestionId: string | null;
  prompt: string;
  modelAnswer: string;
  text: string;
  graded: boolean;
  awarded: number;
  max: number;
  /** ترتيب السؤال في الاختبار (للعرض) */
  order: number;
}

export const essayItems = (subs: Submission[]): EssayItem[] => {
  const cache = new Map<string, Question[]>();
  const out: EssayItem[] = [];
  for (const s of subs) {
    if (!cache.has(s.quiz_id)) cache.set(s.quiz_id, StorageService.getQuestionsByQuizId(s.quiz_id));
    (cache.get(s.quiz_id) || []).forEach((q, i) => {
      const a = (s.answers_json || []).find((x) => x.question_id === q.id);
      if (!a) return;
      if (q.type === 'essay' && hasText(a.text_answer)) {
        out.push({ key: `${s.id}|${q.id}`, submission: s, question: q, subQuestionId: null, prompt: q.question_text, modelAnswer: q.correctAnswer || q.explanation || '',
          text: a.text_answer || '', graded: !!a.graded, awarded: Number(a.marks_awarded) || 0, max: Number(q.marks) || 0, order: i + 1 });
      }
      (q.sub_questions || []).forEach((sq) => {
        if (sq.type !== 'essay') return;
        const sa = (a.sub_answers || []).find((x) => x.sub_question_id === sq.id);
        if (!sa || !hasText(sa.text_answer)) return;
        out.push({ key: `${s.id}|${q.id}|${sq.id}`, submission: s, question: q, subQuestionId: sq.id, prompt: sq.question_text, modelAnswer: sq.correctAnswer || sq.explanation || '',
          text: sa.text_answer || '', graded: !!sa.graded, awarded: Number(sa.marks_awarded) || 0, max: Number(sq.marks) || 0, order: i + 1 });
      });
    });
  }
  return out;
};
