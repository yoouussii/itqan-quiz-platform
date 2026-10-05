import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Target, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../services/supabase';
import { safe } from '../../services/remote';
import { bestPerQuiz, computePointEvents } from '../../utils/points';
import { Card } from './ui';
import { Mascot } from './Mascot';
import { t, dateLocale } from '../../i18n';

export type GoalKind = 'subject_avg' | 'points' | 'quizzes';
export interface StudentGoal { id: string; student_id: string; kind: GoalKind; subject_id: string | null; target: number; deadline: string | null; note: string; achieved_at: string | null; created_at: string }

const inp = 'h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white min-w-0';
const fmt = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

/** تقدّم الهدف منذ إنشائه: معدل أفضل النتائج في المادة، أو النقاط، أو عدد الاختبارات المكتملة */
export function goalProgress(g: StudentGoal, subs: any[], quizzes: any[], awards: any[]): { value: number | null; pct: number } {
  const since = new Date(g.created_at).getTime();
  const mine = subs.filter((s) => s.student_id === g.student_id && new Date(s.completed_at).getTime() >= since);
  let value: number | null = 0;
  if (g.kind === 'subject_avg') {
    const qs = new Set(quizzes.filter((q) => q.subject_id === g.subject_id && !q.is_deleted).map((q) => q.id));
    const best = bestPerQuiz(mine.filter((s) => qs.has(s.quiz_id)));
    value = best.length ? Math.round(best.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / best.length) : null;
  } else if (g.kind === 'points') {
    const myAwards = awards.filter((a) => a.student_id === g.student_id && new Date(a.created_at).getTime() >= since);
    value = computePointEvents(mine, quizzes, myAwards).reduce((a, e) => a + e.points, 0);
  } else {
    value = bestPerQuiz(mine.filter((s) => quizzes.some((q) => q.id === s.quiz_id))).length;
  }
  return { value, pct: value === null ? 0 : Math.min(100, Math.round((value / g.target) * 100)) };
}

/** «أهدافي»: يضعها الطالب ويتابع تقدّمه؛ ولي الأمر يراها دون تعديل (056) */
export const GoalsCard: React.FC<{ studentId: string; editable?: boolean }> = ({ studentId, editable }) => {
  const { submissions, quizzes, awards, subjects, showToast } = useApp();
  const [goals, setGoals] = useState<StudentGoal[] | null>(null);
  const [server, setServer] = useState<Record<string, number | null> | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ kind: GoalKind; subject_id: string; target: string; deadline: string; note: string }>({ kind: 'subject_avg', subject_id: '', target: '90', deadline: '', note: '' });
  const load = useCallback(async () => {
    const r = await safe<StudentGoal[]>(() => supabase.from('student_goals').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(30) as any);
    setGoals(r.ok ? r.data || [] : null);
    // التقدم من الخادم (رقم واحد للطالب وولي الأمر)؛ وإلا يُحسب محلياً
    const p = await safe<Array<{ id: string; value: number | null }>>(() => supabase.rpc('itqan_goal_progress', { p_student: studentId }) as any);
    setServer(p.ok && Array.isArray(p.data) ? Object.fromEntries(p.data.map((x) => [x.id, x.value === null ? null : Number(x.value)])) : null);
  }, [studentId]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => (goals || []).map((g) => {
    if (server && g.id in server) { const value = server[g.id]; return { g, value, pct: value === null ? 0 : Math.min(100, Math.round((value / g.target) * 100)) }; }
    return { g, ...goalProgress(g, submissions || [], quizzes || [], awards || []) };
  }), [goals, server, submissions, quizzes, awards]);

  // بلوغ هدف لأول مرة: يُسجَّل ويحتفل «إتقان الصغير»
  useEffect(() => {
    if (!editable) return;
    const hit = rows.find((r) => !r.g.achieved_at && r.value !== null && r.value >= r.g.target);
    if (!hit) return;
    void safe(() => supabase.from('student_goals').update({ achieved_at: new Date().toISOString() }).eq('id', hit.g.id) as any).then((x) => {
      if (x.ok) { showToast(t('🎯 مبروك! حققت هدفك: {g}', { g: label(hit.g) }), 'success'); void load(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, editable]);

  if (goals === null) return null; // قبل تشغيل 056
  const active = rows.filter((r) => !r.g.achieved_at);
  const done = rows.filter((r) => r.g.achieved_at);
  if (!editable && !rows.length) return null;

  function label(g: StudentGoal) {
    const subj = subjects.find((s) => s.id === g.subject_id)?.name || t('مادة');
    return g.kind === 'subject_avg' ? t('معدل {p}% في {s}', { p: g.target, s: subj }) : g.kind === 'points' ? t('جمع {n} نقطة', { n: g.target }) : t('إكمال {n} اختبار', { n: g.target });
  }
  const save = async () => {
    const target = Number(form.target);
    if (form.kind === 'subject_avg' && !form.subject_id) return showToast(t('اختر المادة'), 'error');
    if (!(target > 0) || (form.kind === 'subject_avg' && target > 100)) return showToast(t('اكتب هدفاً صحيحاً'), 'error');
    const r = await safe(() => supabase.from('student_goals').insert({ student_id: studentId, kind: form.kind, subject_id: form.kind === 'subject_avg' ? form.subject_id : null, target, deadline: form.deadline || null, note: form.note.trim() }).select('id') as any);
    if (!r.ok) return showToast(/row-level|policy/i.test(r.error || '') ? t('لديك 6 أهداف قائمة؛ أنهِ بعضها أو احذفه أولاً') : t('تعذر الحفظ'), 'error');
    setAdding(false); setForm({ ...form, note: '' }); void load();
  };
  const remove = async (id: string) => {
    if (!window.confirm(t('حذف هذا الهدف؟'))) return;
    await safe(() => supabase.from('student_goals').delete().eq('id', id) as any); void load();
  };

  return (
    <Card className="p-4 sm:p-5 space-y-3" data-testid="goals">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-rose-500" />
        <h2 className="font-bold text-slate-900 dark:text-white flex-1">{editable ? t('أهدافي') : t('أهدافه الشخصية')}</h2>
        {editable && !adding && <button type="button" onClick={() => setAdding(true)} className="h-8 px-3 rounded-lg text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('هدف جديد')}</button>}
      </div>
      {adding && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as GoalKind, target: e.target.value === 'subject_avg' ? '90' : e.target.value === 'points' ? '200' : '5' })} className={inp} aria-label={t('نوع الهدف')}>
              <option value="subject_avg">{t('معدل في مادة')}</option><option value="points">{t('جمع نقاط')}</option><option value="quizzes">{t('إكمال اختبارات')}</option>
            </select>
            {form.kind === 'subject_avg'
              ? <select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} className={inp} aria-label={t('المادة')}><option value="">{t('اختر المادة')}</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              : <span />}
            <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{form.kind === 'subject_avg' ? t('المعدل المطلوب (%)') : form.kind === 'points' ? t('عدد النقاط') : t('عدد الاختبارات')}
              <input type="number" min={1} max={form.kind === 'subject_avg' ? 100 : 100000} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className={inp} /></label>
            <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('قبل تاريخ (اختياري)')}
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inp} /></label>
          </div>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} placeholder={t('لماذا هذا الهدف؟ (اختياري)')} className={`${inp} w-full`} aria-label={t('ملاحظة')} />
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">{t('حفظ الهدف')}</button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 px-3 rounded-xl text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"><X className="w-4 h-4" />{t('إلغاء')}</button>
          </div>
        </div>
      )}
      {!rows.length && !adding && (
        <div className="flex items-center gap-3 text-sm text-slate-500"><Mascot size={44} prop="trophy" className="itq-idle shrink-0" />{t('ضع هدفاً تسعى له، مثل «معدل 90% في الرياضيات»، وتابع تقدمك هنا.')}</div>
      )}
      <ul className="space-y-3">
        {active.map(({ g, value, pct }) => {
          const late = g.deadline && g.deadline < new Date().toISOString().slice(0, 10);
          return (
            <li key={g.id} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold text-slate-900 dark:text-white flex-1 min-w-0 truncate">{label(g)}</span>
                <span className="text-xs tabular-nums text-slate-500">{value === null ? t('لا نتائج بعد') : g.kind === 'subject_avg' ? `${value}%` : `${value} / ${g.target}`}</span>
                {editable && <button type="button" onClick={() => void remove(g.id)} aria-label={t('حذف')} className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label(g)}>
                <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[11px] text-slate-500">{[g.note, g.deadline ? (late ? t('انتهى الموعد {d}', { d: fmt(g.deadline) }) : t('قبل {d}', { d: fmt(g.deadline) })) : '', t('منذ {d}', { d: fmt(g.created_at) })].filter(Boolean).join(' · ')}</div>
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">{t('أهداف تحققت 🎉')}</p>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">{done.slice(0, 5).map(({ g }) => <li key={g.id}>✅ {label(g)} · {fmt(g.achieved_at!)}</li>)}</ul>
        </div>
      )}
    </Card>
  );
};
