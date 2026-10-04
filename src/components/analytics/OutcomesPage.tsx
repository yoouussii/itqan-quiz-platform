import React, { useMemo, useState } from 'react';
import { Target, ChevronDown, Download, Sparkles, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Chip, StatTile, Button } from '../common/ui';
import { uiDir, t } from '../../i18n';
import { computeOutcomes, pct, masteryLevel, MASTERY_LABEL, OutcomeStat } from '../../utils/outcomes';
import { syncBank, loadBankCache, pickRandom } from '../../services/bankService';
import { BANK_TO_EDITOR_KEY } from '../teacher/QuestionBank';
import type { QuizWithDetails, SubmissionWithDetails } from '../../types';

const BAR: Record<'ok' | 'warn' | 'bad', string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' };
const selectCls = 'h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white';

const Bar: React.FC<{ value: number }> = ({ value }) => (
  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
    <div className={`h-2 rounded-full ${BAR[masteryLevel(value)]}`} style={{ width: `${Math.max(2, value)}%` }} />
  </div>
);

/** مهارات طالب واحد (لصفحة نتائج الطالب ولوحة ولي الأمر) */
export const SkillsCard: React.FC<{ studentId: string; quizzes: QuizWithDetails[]; submissions: SubmissionWithDetails[]; title?: string }> = ({ studentId, quizzes, submissions, title }) => {
  const { subjects } = useApp();
  const { stats } = useMemo(() => computeOutcomes(quizzes, submissions, { studentId }), [quizzes, submissions, studentId]);
  if (!stats.length) return null;
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || '';
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-bold text-slate-900 dark:text-white inline-flex items-center gap-2"><Target className="w-5 h-5 text-indigo-600" />{title || t('مستواي في المهارات')}</h2>
      <ul className="space-y-2.5">
        {stats.map((s) => {
          const p = pct(s);
          const lvl = masteryLevel(p);
          return (
            <li key={`${s.subject_id}:${s.outcome}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-800 dark:text-slate-100 min-w-0 truncate">{s.outcome} <span className="text-xs font-normal text-slate-500">{subjectName(s.subject_id)}</span></span>
                <span className="shrink-0 inline-flex items-center gap-2"><Chip tone={lvl}>{t(MASTERY_LABEL[lvl])}</Chip><span className="font-bold tabular-nums">{p}%</span></span>
              </div>
              <Bar value={p} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

/** صفحة تحليل نواتج التعلم للطاقم */
export const OutcomesPage: React.FC = () => {
  const { currentUser, quizzes, submissions, subjects, classes, users, setCurrentView, setEditingQuizId, showToast } = useApp();
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [quizId, setQuizId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const canCreate = currentUser?.role === 'admin' || currentUser?.role === 'teacher';

  const classOf = (sid: string) => users.find((u) => u.id === sid)?.class_id || undefined;
  const { stats, untagged, tagged } = useMemo(
    () => computeOutcomes(quizzes, submissions, { subjectId: subjectId || undefined, classId: classId || undefined, quizId: quizId || undefined, classOf }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quizzes, submissions, subjectId, classId, quizId, users]
  );
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || t('بدون مادة');
  const className = (id: string) => classes.find((c) => c.id === id)?.name || id;
  const userName = (id: string) => users.find((u) => u.id === id)?.name || t('طالب');
  const quizList = quizzes.filter((q) => !q.is_deleted && (!subjectId || q.subject_id === subjectId));

  const totalAwarded = stats.reduce((s, x) => s + x.awarded, 0);
  const totalPossible = stats.reduce((s, x) => s + x.possible, 0);
  const avg = totalPossible ? Math.round((totalAwarded / totalPossible) * 100) : 0;
  const weak = stats.filter((s) => masteryLevel(pct(s)) === 'bad').length;
  const taggedPct = tagged + untagged ? Math.round((tagged / (tagged + untagged)) * 100) : 0;

  const remedial = async (s: OutcomeStat) => {
    const r = await syncBank();
    const pool = loadBankCache().filter((b) => b.outcome === s.outcome && (!b.subject_id || b.subject_id === s.subject_id));
    if (!r.ok || !pool.length) return showToast(t('لا توجد أسئلة في بنك الأسئلة لهذه المهارة. احفظ أسئلة بهذا الناتج في البنك أولاً.'), 'info');
    try {
      sessionStorage.setItem(BANK_TO_EDITOR_KEY, JSON.stringify({ ids: pickRandom(pool, 10).map((b) => b.id), subject_id: s.subject_id }));
    } catch { /* ignore */ }
    setEditingQuizId(null);
    setCurrentView('create_quiz');
  };

  const exportCsv = () => {
    const rows = [[t('ناتج التعلم'), t('المادة'), t('نسبة الإتقان'), t('المستوى'), t('عدد الإجابات'), t('عدد الطلاب'), t('طلاب يحتاجون علاجاً')]];
    for (const s of stats) {
      const needs = Array.from(s.students.entries()).filter(([, m]) => pct(m) < 50).map(([id]) => userName(id));
      rows.push([s.outcome, subjectName(s.subject_id), `${pct(s)}%`, t(MASTERY_LABEL[masteryLevel(pct(s))]), String(s.answers), String(s.students.size), needs.join('، ')]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
    a.download = `${t('نواتج_التعلم')}.csv`;
    a.click();
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader
        title={<span className="inline-flex items-center gap-2"><Target className="w-7 h-7 text-indigo-600" />{t('نواتج التعلم')}</span>}
        subtitle={t('مستوى إتقان الطلاب لكل مهارة، من الأسئلة الموسومة بها في الاختبارات')}
        actions={stats.length ? <Button variant="secondary" icon={Download} onClick={exportCsv}>{t('تصدير CSV')}</Button> : undefined}
      />

      <div className="flex flex-wrap gap-2">
        <select aria-label={t('المادة')} value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setQuizId(''); }} className={selectCls}>
          <option value="">{t('كل المواد')}</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label={t('الفصل')} value={classId} onChange={(e) => setClassId(e.target.value)} className={selectCls}>
          <option value="">{t('كل الفصول')}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label={t('الاختبار')} value={quizId} onChange={(e) => setQuizId(e.target.value)} className={`${selectCls} max-w-[260px]`}>
          <option value="">{t('كل الاختبارات')}</option>
          {quizList.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={t('المهارات المقيسة')} value={stats.length} />
        <StatTile label={t('متوسط الإتقان')} value={`${avg}%`} />
        <StatTile label={t('مهارات تحتاج علاجاً')} value={weak} hint={t('إتقان أقل من 50%')} />
        <StatTile label={t('أسئلة موسومة بمهارة')} value={`${taggedPct}%`} hint={t('{a} من {m} سؤال', { a: tagged, m: tagged + untagged })} />
      </div>

      {untagged > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-3 inline-flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          {t('{n} سؤال بلا ناتج تعلم. أضفه من خانة «ناتج التعلم / المهارة» في محرر الاختبار، أو من تصنيف الأسئلة في بنك الأسئلة، ليظهر هنا.', { n: untagged })}
        </p>
      )}

      {stats.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Target className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-bold text-slate-800 dark:text-slate-100">{t('لا توجد بيانات مهارات بعد')}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{t('اكتب ناتج التعلم لكل سؤال في محرر الاختبار. بعد أن يسلّم الطلاب يظهر هنا مستوى إتقان كل مهارة، ومن يحتاج علاجاً.')}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {stats.map((s) => {
            const key = `${s.subject_id}:${s.outcome}`;
            const p = pct(s);
            const lvl = masteryLevel(p);
            const isOpen = open === key;
            const needs = Array.from(s.students.entries()).map(([id, m]) => ({ id, p: pct(m) })).filter((x) => x.p < 50).sort((a, b) => a.p - b.p);
            const byClass = Array.from(s.classes.entries()).map(([id, m]) => ({ id, p: pct(m) })).sort((a, b) => a.p - b.p);
            return (
              <li key={key}>
                <Card className="overflow-hidden">
                  <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="w-full text-start p-4 space-y-2 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-bold text-slate-900 dark:text-white">{s.outcome}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 ms-2">{subjectName(s.subject_id)} · {t('{n} سؤال', { n: s.questionIds.size })} · {t('{n} طالب', { n: s.students.size })}</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        {needs.length > 0 && <Chip tone="bad"><AlertTriangle className="w-3 h-3" />{t('{n} يحتاجون علاجاً', { n: needs.length })}</Chip>}
                        <Chip tone={lvl}>{t(MASTERY_LABEL[lvl])}</Chip>
                        <span className="font-extrabold text-lg tabular-nums w-14 text-end">{p}%</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </div>
                    <Bar value={p} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 grid md:grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                      <div className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{t('حسب الفصل')}</h3>
                        {byClass.length === 0 && <p className="text-xs text-slate-500">—</p>}
                        {byClass.map((c) => (
                          <div key={c.id} className="space-y-1">
                            <div className="flex justify-between text-xs"><span className="text-slate-700 dark:text-slate-300">{className(c.id)}</span><span className="font-bold tabular-nums">{c.p}%</span></div>
                            <Bar value={c.p} />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{t('طلاب يحتاجون علاجاً (أقل من 50%)')}</h3>
                        {needs.length === 0 ? (
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">{t('لا أحد، كل الطلاب فوق 50% في هذه المهارة.')}</p>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {needs.map((n) => <li key={n.id}><Chip tone="bad">{userName(n.id)} · {n.p}%</Chip></li>)}
                          </ul>
                        )}
                        {canCreate && (
                          <Button size="sm" variant="secondary" icon={Sparkles} className="mt-2" onClick={() => void remedial(s)}>{t('اختبار علاجي من بنك الأسئلة')}</Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
