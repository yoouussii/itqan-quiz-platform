import { supabase } from './supabase';
import { safe } from './remote';

/** بيانات رئيسية الطالب من الخادم (021) */
export interface StudentHomeData {
  settings: { challenge: boolean; streak: boolean; leaderboard: boolean; challenge_count: number };
  today: string;
  challenge: { enabled: boolean; count: number; done: boolean; correct: number; total: number; points: number; solved_by_classmates: number };
  streak: { current: number; longest: number; week: Array<{ day: string; active: boolean }> };
  leaderboard: Array<{ rank: number; name: string; points: number; me: boolean }>;
  my_rank: number | null;
  my_week_points: number;
}

export interface ChallengeQuestion {
  id: string;
  type: 'mcq' | 'true_false';
  question_text: string;
  options: string[];
  subject_name?: string | null;
  subject_color?: string | null;
}

export interface ChallengeResult {
  correct: number;
  total: number;
  points: number;
  results: Array<{ id: string; answer: string | null; correct: boolean; correct_option_index: number; explanation: string }>;
}

const errText = (e?: string) => {
  if (!e) return '';
  if (/already_done/.test(e)) return 'already_done';
  if (/no_questions/.test(e)) return 'no_questions';
  if (/challenge_disabled/.test(e)) return 'challenge_disabled';
  return e;
};

export async function fetchStudentHome(): Promise<StudentHomeData | null> {
  const r = await safe<StudentHomeData>(() => supabase.rpc('itqan_student_home') as any);
  return r.ok && r.data && typeof r.data === 'object' ? r.data : null;
}

export async function startChallenge(): Promise<{ questions?: ChallengeQuestion[]; seconds?: number; error?: string }> {
  const r = await safe<{ questions: ChallengeQuestion[]; seconds: number }>(() => supabase.rpc('itqan_daily_challenge') as any);
  if (!r.ok || !r.data) return { error: errText(r.error) || 'failed' };
  return { questions: r.data.questions || [], seconds: r.data.seconds };
}

export async function submitChallenge(answers: Array<number | null>): Promise<{ result?: ChallengeResult; error?: string }> {
  const r = await safe<ChallengeResult>(() => supabase.rpc('itqan_submit_daily_challenge', { p_answers: answers }) as any);
  if (!r.ok || !r.data) return { error: errText(r.error) || 'failed' };
  return { result: r.data };
}
