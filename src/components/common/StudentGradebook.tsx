import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { GbColumn, fetchClassColumns, fetchMarks, fetchWeights } from '../../services/gradebookService';
import { GbCell, bestAttempt, computeRow, gradeLabel } from '../../utils/gradebook';
import { t } from '../../i18n';
import type { SubmissionWithDetails, User } from '../../types';

const num = (n: number) => String(Math.round(n * 100) / 100);
const pctColor = (p: number) => (p >= 90 ? '#059669' : p >= 65 ? '#0f766e' : p >= 50 ? '#b45309' : '#e11d48');

interface Item { key: string; title: string; weight: number; max: number; cell: GbCell; manual: boolean }

/** كشف درجات الطالب لكل مادة (لولي الأمر): اختبارات المنصة + الأعمدة اليدوية، بنفس أوزان المعلم */
export const StudentGradebook: React.FC<{ student: User; className?: string }> = ({ student, className = '' }) => {
  const { submissions, subjects } = useApp();
  const [cols, setCols] = useState<GbColumn[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);

  const quizzes = useMemo(() => StorageService.getQuizzesForStudent(student.id), [student.id]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const c = student.class_id ? await fetchClassColumns(student.class_id) : [];
      const [m, w] = await Promise.all([fetchMarks(c.map((x) => x.id)), fetchWeights(quizzes.map((q) => q.id))]);
      if (!live) return;
      setCols(c); setWeights(w);
      setMarks(Object.fromEntries(m.filter((x) => x.student_id === student.id).map((x) => [x.column_id, x.score])));
    })();
    return () => { live = false; };
  }, [student.id, student.class_id, quizzes]);

  const bySubject = useMemo(() => {
    const mine = (submissions as SubmissionWithDetails[]).filter((s) => s.student_id === student.id);
    const m = new Map<string, Item[]>();
    const push = (sid: string, it: Item) => m.set(sid, [...(m.get(sid) || []), it]);
    quizzes.forEach((q) => {
      const b = bestAttempt(mine.filter((s) => s.quiz_id === q.id));
      push(q.subject_id, { key: `q:${q.id}`, title: q.title, weight: weights[q.id] ?? 1, max: Number(q.total_marks) || 0, manual: false,
        cell: b ? { score: Number(b.score), max: Number(b.total_possible_score) || Number(q.total_marks) || 0 } : undefined });
    });
    cols.forEach((c) => push(c.subject_id, { key: `m:${c.id}`, title: c.title, weight: c.weight, max: c.max_score, manual: true,
      cell: marks[c.id] === undefined ? undefined : { score: marks[c.id], max: c.max_score } }));
    return [...m.entries()].map(([sid, items]) => {
      const r = computeRow(items.map((i) => ({ key: i.key, weight: i.weight, max: i.max })), (k) => items.find((i) => i.key === k)!.cell, 100, false);
      return { sid, name: subjects.find((s) => s.id === sid)?.name || t('مادة'), items, r };
    }).filter((x) => x.r.counted > 0).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [quizzes, cols, marks, weights, submissions, subjects, student.id]);

  if (!bySubject.length) return null;
  const overall = bySubject.reduce((a, x) => a + (x.r.pct || 0), 0) / bySubject.length;

  return (
    <section className={`rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 ${className}`} aria-labelledby={`gb-${student.id}`} data-testid="student-gradebook">
      <div className="flex items-center gap-2 mb-3">
        <h2 id={`gb-${student.id}`} className="font-cairo font-extrabold text-slate-900 dark:text-white flex items-center gap-2 flex-1"><BookOpenCheck className="w-5 h-5 text-indigo-600" />{t('كشف الدرجات')}</h2>
        <span className="text-sm text-slate-500">{t('المعدل العام')} <b className="tabular-nums" style={{ color: pctColor(overall) }}>{num(overall)}%</b> · {t(gradeLabel(overall))}</span>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {bySubject.map((x) => (
          <li key={x.sid}>
            <button type="button" aria-expanded={open === x.sid} onClick={() => setOpen(open === x.sid ? null : x.sid)} className="w-full flex items-center gap-3 py-2.5 text-start">
              <span className="flex-1 font-semibold text-slate-900 dark:text-white">{x.name}</span>
              <span className="w-28 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden hidden sm:block"><span className="block h-full rounded-full" style={{ width: `${x.r.pct}%`, background: pctColor(x.r.pct!) }} /></span>
              <span className="w-14 text-end tabular-nums font-bold" style={{ color: pctColor(x.r.pct!) }}>{num(x.r.pct!)}%</span>
              <span className="w-20 text-end text-xs font-semibold text-slate-600 dark:text-slate-300">{t(gradeLabel(x.r.pct))}</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition ${open === x.sid ? 'rotate-180' : ''}`} />
            </button>
            {open === x.sid && (
              <ul className="pb-3 ps-2 space-y-1">
                {x.items.filter((i) => i.weight > 0).map((i) => (
                  <li key={i.key} className="flex items-center gap-2 text-sm">
                    <span className={`w-1.5 h-1.5 rounded-full ${i.manual ? 'bg-violet-500' : 'bg-indigo-500'}`} />
                    <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">{i.title}{i.manual && <span className="text-xs text-violet-600"> · {t('تقييم المعلم')}</span>}</span>
                    <span className="tabular-nums text-slate-800 dark:text-slate-100" dir="ltr">{i.cell ? `${num(i.cell.score)}/${num(i.cell.max)}` : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 mt-2">{t('المعدل محسوب بأوزان المعلم، وتُحتسب أفضل محاولة في كل اختبار، وغير المؤدّى لا يدخل في المعدل.')}</p>
    </section>
  );
};
