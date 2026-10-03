/**
 * بنك الأسئلة (للطاقم فقط). يُجلب عند فتح البنك وليس مع التحديث التلقائي،
 * وبنفس طريقة البانرات: قائمة خفيفة (المعرّف ووقت التعديل) ثم الأسئلة التي تغيّرت فقط.
 */
import { supabase } from './supabase';
import { safe, readJson, writeJson, newId } from './remote';
import type { QuestionItem } from '../components/teacher/QuizEditor';
import { stripHtml } from '../components/common/RichText';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface BankItem {
  id: string;
  subject_id: string | null;
  unit: string;
  difficulty: Difficulty;
  outcome: string;
  type: string;
  marks: number;
  question: QuestionItem;
  search_text: string;
  shared: boolean;
  created_by: string;
  used_count: number;
  created_at: string;
  updated_at: string;
}

export const DIFFICULTIES: Record<Difficulty, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };

const KEY = 'itqan_question_bank_v1';
let memory: BankItem[] | null = null;
export const loadBankCache = (): BankItem[] => {
  // يُحذف المفتاح عند تسجيل الخروج (clearCachedDataForLogout)، فلا نعتمد على النسخة في الذاكرة بعدها
  let present = true;
  try { present = localStorage.getItem(KEY) !== null; } catch { /* ignore */ }
  if (!present) memory = null;
  return memory ?? readJson<BankItem[]>(KEY, []);
};
const saveCache = (list: BankItem[]) => {
  memory = list;
  writeJson(KEY, list);
};

/** نسخة نظيفة من السؤال للحفظ (بدون معرّفات العرض) */
export function cleanQuestion(q: QuestionItem): QuestionItem {
  const { uid: _u, id: _i, ...rest } = q;
  return {
    ...rest,
    options: [...(q.options || [])],
    sub_questions: q.sub_questions?.map((sq) => ({ ...sq, options: [...(sq.options || [])] })),
  } as QuestionItem;
}

const textOf = (q: QuestionItem) =>
  [q.question_text, ...(q.options || []), ...(q.sub_questions || []).flatMap((s) => [s.question_text, ...(s.options || [])])]
    .map((x) => stripHtml(x || ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);

export const questionMarks = (q: QuestionItem) =>
  q.type === 'passage' ? (q.sub_questions || []).reduce((s, x) => s + (Number(x.marks) || 0), 0) : Number(q.marks) || 0;

export function newBankItem(q: QuestionItem, meta: { subject_id: string | null; unit?: string; difficulty?: Difficulty; shared?: boolean; created_by: string }): BankItem {
  const now = new Date().toISOString();
  const question = cleanQuestion(q);
  return {
    id: newId('qb'),
    subject_id: meta.subject_id,
    unit: (meta.unit || '').trim(),
    difficulty: meta.difficulty || 'medium',
    outcome: '',
    type: question.type,
    marks: questionMarks(question),
    question,
    search_text: textOf(question),
    shared: meta.shared ?? true,
    created_by: meta.created_by,
    used_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/** نفس السؤال موجود في البنك؟ (لتجنّب التكرار عند الحفظ مرة ثانية) */
export const sameQuestion = (a: QuestionItem, b: QuestionItem) => textOf(a) === textOf(b) && a.type === b.type;

/** مزامنة البنك مع الخادم: { ok: false } إذا لم يُشغَّل 015 بعد */
export async function syncBank(): Promise<{ ok: boolean; error?: string }> {
  const list = await safe<Array<{ id: string; updated_at: string }>>(() => supabase.from('question_bank').select('id,updated_at') as any);
  if (!list.ok || !Array.isArray(list.data)) return { ok: false, error: list.error };
  const cache = loadBankCache();
  const remoteIds = new Set(list.data.map((r) => r.id));
  const stale = list.data.filter((r) => {
    const c = cache.find((x) => x.id === r.id);
    return !c || new Date(c.updated_at).getTime() < new Date(r.updated_at).getTime();
  });
  let next = cache.filter((c) => remoteIds.has(c.id));
  for (let i = 0; i < stale.length; i += 200) {
    const ids = stale.slice(i, i + 200).map((s) => s.id);
    const full = await safe<BankItem[]>(() => supabase.from('question_bank').select('*').in('id', ids) as any);
    if (!full.ok || !Array.isArray(full.data)) return { ok: false, error: full.error };
    const map = new Map(next.map((b) => [b.id, b]));
    full.data.forEach((b) => map.set(b.id, { ...b, marks: Number(b.marks) || 0 }));
    next = Array.from(map.values());
  }
  saveCache(next);
  return { ok: true };
}

export async function saveBankItems(items: BankItem[]): Promise<{ ok: boolean; error?: string }> {
  if (!items.length) return { ok: true };
  const rows = items.map((b) => ({ ...b, updated_at: new Date().toISOString() }));
  const res = await safe(() => supabase.from('question_bank').upsert(rows, { onConflict: 'id' }) as any);
  if (res.ok) {
    const ids = new Set(rows.map((r) => r.id));
    saveCache([...loadBankCache().filter((x) => !ids.has(x.id)), ...rows]);
  }
  return { ok: res.ok, error: res.error };
}

export async function deleteBankItems(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const res = await safe(() => supabase.from('question_bank').delete().in('id', ids) as any);
  if (res.ok) saveCache(loadBankCache().filter((x) => !ids.includes(x.id)));
  return { ok: res.ok, error: res.error };
}

/** زيادة عدّاد استخدام الأسئلة المضافة لاختبار (لا يوقف شيئاً إن فشل) */
export function markBankUsed(ids: string[]) {
  if (!ids.length) return;
  void safe(() => supabase.rpc('itqan_bank_used', { p_ids: ids }) as any);
  saveCache(loadBankCache().map((b) => (ids.includes(b.id) ? { ...b, used_count: b.used_count + 1 } : b)));
}

/** نسخة جديدة من سؤال البنك لإضافتها لاختبار (معرّفات جديدة) */
export function toQuizQuestion(b: BankItem): QuestionItem {
  const q = cleanQuestion(b.question);
  const rnd = () => Math.random().toString(36).slice(2, 7);
  return {
    ...q,
    uid: `u-${Date.now().toString(36)}-${rnd()}`,
    explanation: q.explanation || '',
    sub_questions: q.sub_questions?.map((sq) => ({ ...sq, id: `sub_${Date.now()}_${rnd()}` })),
  };
}

/** اختيار عشوائي من قائمة (لـ«سحب عشوائي») */
export function pickRandom<T>(list: T[], n: number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, n));
}
