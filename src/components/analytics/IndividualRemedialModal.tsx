import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { computeOutcomes, pct } from '../../utils/outcomes';
import { BankItem, loadBankCache, markBankUsed, syncBank, toQuizQuestion } from '../../services/bankService';
import { Button, Chip } from '../common/ui';
import { Mascot } from '../common/Mascot';
import type { QuizWithDetails, User } from '../../types';
import { t, uiDir } from '../../i18n';

const sel = 'h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';

interface Plan { studentId: string; name: string; weak: Array<{ outcome: string; p: number }>; items: BankItem[] }

/** يوزّع n سؤالاً على المهارات الضعيفة بالتناوب (الأضعف أولاً) */
function pickFor(weak: Array<{ outcome: string }>, pools: Map<string, BankItem[]>, n: number, seed: string): BankItem[] {
  const rnd = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };
  const lists = weak.map((w) => (pools.get(w.outcome) || []).slice().sort((a, b) => rnd(seed + a.id) - rnd(seed + b.id)));
  const out: BankItem[] = [];
  for (let round = 0; out.length < n && lists.some((l) => l.length > round); round++) {
    for (const l of lists) { if (out.length >= n) break; if (l[round]) out.push(l[round]); }
  }
  return out;
}

/** اختبار علاجي فردي: لكل طالب أسئلة من بنك الأسئلة في المهارات التي ضعف فيها في هذا الاختبار (055) */
export const IndividualRemedialModal: React.FC<{ quiz: QuizWithDetails; onClose: () => void }> = ({ quiz, onClose }) => {
  const { quizzes, submissions, users, createNewQuiz, currentUser, showToast, setCurrentView, setActiveQuizId } = useApp();
  const [bank, setBank] = useState<BankItem[] | null>(null);
  const [per, setPer] = useState(5);
  const [threshold, setThreshold] = useState(70);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void syncBank().then(() => setBank(loadBankCache())); }, []);

  const name = (id: string) => (users as User[]).find((u) => u.id === id)?.name || id;
  const { plans, noTags } = useMemo(() => {
    const { stats, tagged } = computeOutcomes(quizzes, submissions, { quizId: quiz.id });
    const pools = new Map<string, BankItem[]>();
    for (const b of bank || []) {
      if (!b.outcome || (b.subject_id && quiz.subject_id && b.subject_id !== quiz.subject_id)) continue;
      pools.set(b.outcome, [...(pools.get(b.outcome) || []), b]);
    }
    const byStudent = new Map<string, Array<{ outcome: string; p: number }>>();
    for (const s of stats) for (const [sid, m] of s.students) {
      const p = pct(m);
      if (m.possible > 0 && p < threshold) byStudent.set(sid, [...(byStudent.get(sid) || []), { outcome: s.outcome, p }]);
    }
    const plans: Plan[] = Array.from(byStudent.entries()).map(([sid, weak]) => {
      weak.sort((a, b) => a.p - b.p);
      return { studentId: sid, name: name(sid), weak, items: pickFor(weak, pools, per, sid) };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return { plans, noTags: tagged === 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizzes, submissions, quiz.id, bank, per, threshold, users]);

  const ready = plans.filter((p) => p.items.length > 0);
  const missing = plans.filter((p) => p.items.length === 0);

  const create = async () => {
    if (!ready.length) return;
    setBusy(true);
    const used = new Map<string, string>(); // معرّف البنك ← معرّف السؤال في الاختبار
    const questions: any[] = [];
    const rnd = () => Math.random().toString(36).slice(2, 8);
    for (const p of ready) for (const b of p.items) {
      if (used.has(b.id)) continue;
      const id = `rq-${Date.now().toString(36)}-${questions.length + 1}-${rnd()}`;
      used.set(b.id, id);
      const { uid: _uid, ...q } = toQuizQuestion(b) as any;
      questions.push({ ...q, id, marks: Number(q.marks) || 1 });
    }
    const student_questions = Object.fromEntries(ready.map((p) => [p.studentId, p.items.map((b) => used.get(b.id)!)]));
    const perMax = Math.max(...ready.map((p) => p.items.length));
    const end = new Date(Date.now() + days * 864e5);
    const r = await createNewQuiz({
      title: t('علاجي: {title}', { title: quiz.title }),
      description: t('اختبار علاجي فردي: لكل طالب أسئلة في المهارات التي يحتاج تقويتها.'),
      subject_id: quiz.subject_id, teacher_id: currentUser!.id,
      total_marks: Math.round(questions.reduce((a, q) => a + (Number(q.marks) || 0), 0) / Math.max(1, questions.length) * perMax),
      duration_minutes: Math.max(10, perMax * 3), pass_percentage: quiz.pass_percentage || 50,
      status: 'published', start_date: new Date().toISOString(), end_date: end.toISOString(), is_active: true,
      shuffle_questions: true, shuffle_options: true, require_fullscreen: false,
      questions_per_student: perMax, student_questions,
    }, questions, [{ target_type: 'specific_students', target_id: ready.map((p) => p.studentId).join(',') }]);
    setBusy(false);
    markBankUsed(Array.from(used.keys()));
    if (!r.synced) showToast(t('حُفظ على جهازك وسيُرسل للخادم تلقائياً'), 'info');
    onClose();
    setActiveQuizId(null); setCurrentView('dashboard');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={t('اختبار علاجي فردي')} onClick={onClose}>
      <div className="w-full sm:max-w-3xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()} data-testid="individual-remedial">
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <Sparkles className="w-6 h-6 text-indigo-600" />
          <div className="flex-1 min-w-0"><h2 className="font-bold text-lg text-slate-900 dark:text-white">{t('اختبار علاجي فردي')}</h2>
            <p className="text-xs text-slate-500">{t('لكل طالب أسئلة من بنك الأسئلة في المهارات التي ضعف فيها في «{title}»، ويُصحَّح على أسئلته فقط.', { title: quiz.title })}</p></div>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-300">
            <label className="flex flex-col gap-1">{t('أسئلة لكل طالب')}<select value={per} onChange={(e) => setPer(Number(e.target.value))} className={sel}>{[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="flex flex-col gap-1">{t('المهارة ضعيفة إذا قلّت عن')}<select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={sel}>{[50, 60, 70, 80, 90].map((n) => <option key={n} value={n}>{n}%</option>)}</select></label>
            <label className="flex flex-col gap-1">{t('متاح لمدة')}<select value={days} onChange={(e) => setDays(Number(e.target.value))} className={sel}>{[3, 7, 14].map((n) => <option key={n} value={n}>{t('{n} أيام', { n })}</option>)}</select></label>
          </div>
          {!bank ? <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            : noTags ? <p className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3">{t('أسئلة هذا الاختبار غير موسومة بنواتج التعلم، فلا يمكن معرفة مهارات كل طالب. أضف «ناتج التعلم» للأسئلة في المحرر.')}</p>
            : !plans.length ? <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 flex items-center gap-3"><Mascot size={40} prop="trophy" />{t('لا يوجد طالب دون {p}% في أي مهارة. ممتاز!', { p: threshold })}</div>
            : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                {plans.map((p) => (
                  <li key={p.studentId} className="px-3 py-2.5 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-slate-900 dark:text-white min-w-[9rem]">{p.name}</span>
                    <span className="flex-1 flex flex-wrap gap-1">{p.weak.slice(0, 4).map((w) => <Chip key={w.outcome} tone={w.p < 50 ? 'bad' : 'warn'}>{w.outcome} · <span dir="ltr">{w.p}%</span></Chip>)}{p.weak.length > 4 && <Chip>+{p.weak.length - 4}</Chip>}</span>
                    {p.items.length ? <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">{t('{n} سؤال', { n: p.items.length })}</span>
                      : <span className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{t('لا أسئلة في البنك لمهاراته')}</span>}
                  </li>
                ))}
              </ul>
            )}
          {missing.length > 0 && <p className="text-xs text-slate-500">{t('احفظ أسئلة موسومة بهذه المهارات في بنك الأسئلة ليشمل الاختبار {n} طالباً آخرين.', { n: missing.length })}</p>}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <span className="text-xs text-slate-500 flex-1">{ready.length ? t('سيُنشأ اختبار واحد لـ {n} طالب، ويصلهم إشعار.', { n: ready.length }) : ''}</span>
          <Button icon={Sparkles} disabled={!ready.length || busy} onClick={() => void create()}>{t('إنشاء الاختبار العلاجي')}</Button>
        </div>
      </div>
    </div>
  );
};
