import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Plus, Trash2, FileSpreadsheet, FileDown, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button } from '../common/ui';
import { StorageService } from '../../services/storage';
import { GbColumn, GbMark, addColumn, deleteColumn, fetchColumns, fetchMarks, fetchWeights, saveMark, saveWeight, updateColumn } from '../../services/gradebookService';
import { GbCell, bestAttempt, computeRow, gradeLabel } from '../../utils/gradebook';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t, dateLocale } from '../../i18n';
import type { QuizWithDetails, SubmissionWithDetails, User } from '../../types';
import { EmptyMascot, MascotHere } from '../common/Mascot';

const LS = 'itqan_gradebook_v1';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n: number) => String(Math.round(n * 100) / 100);
const pctColor = (p: number) => (p >= 90 ? '#059669' : p >= 65 ? '#0f766e' : p >= 50 ? '#b45309' : '#e11d48');

interface Col { key: string; kind: 'quiz' | 'manual'; title: string; sub: string; max: number; weight: number; editable: boolean; quiz?: QuizWithDetails; column?: GbColumn }

/** كشف الدرجات: درجات اختبارات المنصة + أعمدة يدوية لكل فصل ومادة، بأوزان، والمعدل والتقدير */
export const GradebookPage: React.FC = () => {
  const { currentUser, users, classes, subjects, quizzes, submissions, showToast } = useApp();
  const me = currentUser!;
  const isAdmin = me.role === 'admin';
  const prefs = readPrefs();

  // المعلم: إسناداته فقط (من أحدث بيانات حسابه)، بلا رجوع لكل الفصول/المواد. المدير والمشرف: الكل
  const fresh = useMemo(() => (users as User[]).find((u) => u.id === me.id) || me, [users, me]);
  const isTeacher = me.role === 'teacher';
  const mySubjects = useMemo(() => {
    if (!isTeacher) return subjects;
    const ids = fresh.assigned_subject_ids?.length ? fresh.assigned_subject_ids : fresh.specialty_id ? [fresh.specialty_id] : [];
    return subjects.filter((s) => ids.includes(s.id));
  }, [isTeacher, fresh, subjects]);
  const myClasses = useMemo(() => {
    const ids = new Set([...(fresh.assigned_class_ids || []), ...(fresh.class_id ? [fresh.class_id] : [])]);
    const list = isTeacher ? classes.filter((c) => ids.has(c.id)) : classes;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [isTeacher, fresh, classes]);
  const noAssignment = isTeacher && (!myClasses.length || !mySubjects.length);

  const [classId, setClassId] = useState<string>(() => prefs.classId || '');
  const [subjectId, setSubjectId] = useState<string>(() => prefs.subjectId || '');
  const [outOf, setOutOf] = useState<number>(() => Number(prefs.outOf) || 100);
  const [missingZero, setMissingZero] = useState<boolean>(() => !!prefs.missingZero);
  useEffect(() => { if (!myClasses.some((c) => c.id === classId)) setClassId(myClasses[0]?.id || ''); }, [myClasses, classId]);
  useEffect(() => { if (!mySubjects.some((s) => s.id === subjectId)) setSubjectId(mySubjects[0]?.id || ''); }, [mySubjects, subjectId]);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ classId, subjectId, outOf, missingZero })); } catch { /* */ } }, [classId, subjectId, outOf, missingZero]);

  const students = useMemo(() => (users as User[]).filter((u) => u.role === 'student' && u.class_id === classId).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [users, classId]);
  const studentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  // اختبارات المادة الموجّهة لهذا الفصل (أو لطلاب منه)، أو التي أدّاها طلابه
  const classQuizzes = useMemo(() => {
    const subs = submissions as SubmissionWithDetails[];
    return (quizzes as QuizWithDetails[]).filter((q) => {
      if (q.is_deleted || q.subject_id !== subjectId || !(q.status === 'published' || q.status === 'archived')) return false;
      const asg = q.assignments?.length ? q.assignments : StorageService.getAssignmentsByQuizId(q.id);
      const targeted = asg.some((a) => a.target_type === 'all' || (a.target_type === 'class' && a.target_id === classId)
        || (a.target_type === 'specific_students' && (a.target_id || '').split(',').some((id) => studentIds.has(id.trim()))));
      return targeted || subs.some((s) => s.quiz_id === q.id && studentIds.has(s.student_id));
    }).sort((a, b) => new Date(a.start_date || a.created_at).getTime() - new Date(b.start_date || b.created_at).getTime());
  }, [quizzes, submissions, subjectId, classId, studentIds]);

  const [weights, setWeights] = useState<Record<string, number>>({});
  const [cols, setCols] = useState<GbColumn[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<null | { title: string; max: string; weight: string }>(null);

  useEffect(() => {
    if (!classId || !subjectId) return;
    let live = true; setLoading(true);
    void (async () => {
      const [w, c] = await Promise.all([fetchWeights(classQuizzes.map((q) => q.id)), fetchColumns(classId, subjectId)]);
      const m = await fetchMarks(c.map((x) => x.id));
      if (!live) return;
      setWeights(w); setCols(c); setMarks(Object.fromEntries(m.map((x: GbMark) => [`${x.column_id}|${x.student_id}`, x.score]))); setDrafts({}); setLoading(false);
    })();
    return () => { live = false; };
  }, [classId, subjectId, classQuizzes]);

  const best = useMemo(() => {
    const m = new Map<string, SubmissionWithDetails[]>();
    (submissions as SubmissionWithDetails[]).forEach((s) => { if (studentIds.has(s.student_id)) { const k = `${s.quiz_id}|${s.student_id}`; m.set(k, [...(m.get(k) || []), s]); } });
    const out = new Map<string, SubmissionWithDetails>();
    m.forEach((l, k) => { const b = bestAttempt(l); if (b) out.set(k, b); });
    return out;
  }, [submissions, studentIds]);

  const columns: Col[] = useMemo(() => [
    ...classQuizzes.map((q) => ({
      key: `q:${q.id}`, kind: 'quiz' as const, title: q.title, quiz: q,
      sub: q.start_date ? new Date(q.start_date).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) : t('اختبار'),
      max: Number(q.total_marks) || 0, weight: weights[q.id] ?? 1, editable: isAdmin || q.teacher_id === me.id || q.created_by === me.id,
    })),
    ...cols.map((c) => ({ key: `m:${c.id}`, kind: 'manual' as const, title: c.title, sub: t('يدوي'), max: c.max_score, weight: c.weight, editable: isAdmin || c.created_by === me.id, column: c })),
  ], [classQuizzes, cols, weights, isAdmin, me.id]);

  const cell = (col: Col, sid: string): GbCell => {
    if (col.kind === 'quiz') {
      const s = best.get(`${col.quiz!.id}|${sid}`);
      return s ? { score: Number(s.score), max: Number(s.total_possible_score) || col.max } : undefined;
    }
    const v = marks[`${col.column!.id}|${sid}`];
    return v === undefined ? undefined : { score: v, max: col.max };
  };
  const rowOf = (sid: string) => computeRow(columns.map((c) => ({ key: c.key, weight: c.weight, max: c.max })), (k) => cell(columns.find((c) => c.key === k)!, sid), outOf, missingZero);

  const setWeight = async (col: Col, raw: string) => {
    const w = Math.max(0, Math.min(100, Number(raw)));
    if (!Number.isFinite(w) || w === col.weight) return;
    if (col.kind === 'quiz') {
      setWeights((p) => ({ ...p, [col.quiz!.id]: w }));
      if (!(await saveWeight(col.quiz!.id, w, me.id))) showToast(t('تعذر الحفظ'), 'error');
    } else {
      setCols((p) => p.map((c) => (c.id === col.column!.id ? { ...c, weight: w } : c)));
      if (!(await updateColumn(col.column!.id, { weight: w }))) showToast(t('تعذر الحفظ'), 'error');
    }
  };

  const commitMark = async (col: Col, sid: string) => {
    const k = `${col.column!.id}|${sid}`;
    const raw = drafts[k];
    if (raw === undefined) return;
    const v = raw.trim() === '' ? null : Number(raw);
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > col.max)) {
      showToast(t('الدرجة بين 0 و{m}', { m: num(col.max) }), 'error');
      return;
    }
    const prev = marks[k];
    setMarks((p) => { const n = { ...p }; if (v === null) delete n[k]; else n[k] = v; return n; });
    setDrafts((p) => { const n = { ...p }; delete n[k]; return n; });
    if (!(await saveMark(col.column!.id, sid, v, me.id))) {
      showToast(t('تعذر الحفظ'), 'error');
      setMarks((p) => { const n = { ...p }; if (prev === undefined) delete n[k]; else n[k] = prev; return n; });
    }
  };

  const submitColumn = async () => {
    if (!adding) return;
    const title = adding.title.trim(); const max = Number(adding.max); const weight = Number(adding.weight);
    if (!title || !(max > 0) || !(weight >= 0)) return showToast(t('أكمل اسم العمود والدرجة العظمى'), 'error');
    const c = await addColumn({ class_id: classId, subject_id: subjectId, title, max_score: max, weight, created_by: me.id });
    if (!c) return showToast(t('تعذر الحفظ'), 'error');
    setCols((p) => [...p, c]); setAdding(null);
  };
  const removeColumn = async (col: Col) => {
    if (!window.confirm(t('حذف العمود «{t}» ودرجاته؟', { t: col.title }))) return;
    if (await deleteColumn(col.column!.id)) setCols((p) => p.filter((c) => c.id !== col.column!.id));
    else showToast(t('تعذر الحذف'), 'error');
  };

  const className = classes.find((c) => c.id === classId)?.name || '';
  const subjectName = subjects.find((s) => s.id === subjectId)?.name || '';
  const rows = students.map((s) => ({ s, r: rowOf(s.id) }));
  const colAvg = (col: Col) => {
    const v = students.map((s) => cell(col, s.id)).filter(Boolean) as { score: number; max: number }[];
    return v.length ? (v.reduce((a, x) => a + x.score / (x.max || 1), 0) / v.length) * 100 : null;
  };
  const classAvg = (() => { const v = rows.map((x) => x.r.pct).filter((p): p is number => p != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })();

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const head = ['#', t('الطالب'), ...columns.map((c) => `${c.title} (${num(c.max)}) ×${num(c.weight)}`), t('المعدل %'), t('الدرجة من {n}', { n: outOf }), t('التقدير')];
    const body = rows.map(({ s, r }, i) => [i + 1, s.name, ...columns.map((c) => { const v = cell(c, s.id); return v ? Math.round(v.score * 100) / 100 : ''; }), r.pct ?? '', r.final ?? '', t(gradeLabel(r.pct))]);
    const ws = XLSX.utils.aoa_to_sheet([[`${t('كشف الدرجات')}: ${className} — ${subjectName}`], [], head, ...body]);
    ws['!cols'] = [{ wch: 4 }, { wch: 32 }, ...columns.map(() => ({ wch: 14 })), { wch: 10 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t('كشف الدرجات').slice(0, 31));
    XLSX.writeFile(wb, `gradebook-${className}-${subjectName}.xlsx`.replace(/[\\/:*?"<>|\s]+/g, '-'));
  };
  const exportPdf = async () => {
    const body = `<table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('الطالب'))}</th>${columns.map((c) => `<th>${esc(c.title)}<br><small>${esc(num(c.max))} · ×${esc(num(c.weight))}</small></th>`).join('')}<th>${esc(t('المعدل %'))}</th><th>${esc(t('الدرجة من {n}', { n: outOf }))}</th><th>${esc(t('التقدير'))}</th></tr></thead><tbody>${
      rows.map(({ s, r }, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td>${columns.map((c) => { const v = cell(c, s.id); return `<td>${v ? esc(num(v.score)) : '—'}</td>`; }).join('')}<td>${r.pct ?? '—'}</td><td><b>${r.final ?? '—'}</b></td><td>${esc(t(gradeLabel(r.pct)))}</td></tr>`).join('')}</tbody></table>
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px"><span>${esc(t('معلم المادة'))}: ....................</span><span>${esc(t('مدير المدرسة'))}: ....................</span></div>`;
    await exportElementToPdf({ bodyHtml: body, orientation: columns.length > 6 ? 'landscape' : 'portrait', title: t('كشف الدرجات: {c} — {s}', { c: className, s: subjectName }), subtitle: missingZero ? t('غير المؤدّى يُحتسب صفراً') : t('غير المؤدّى لا يُحتسب في المعدل') });
  };

  const sel = 'h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
  const small = 'h-8 w-14 px-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-center tabular-nums';

  return (
    <div className="max-w-[1500px] mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><BookOpenCheck className="w-7 h-7 text-indigo-600" />{t('كشف الدرجات')}</span>}
        subtitle={t('درجات اختبارات المنصة مع أعمدة يدوية (مشاركة، واجبات، مهام أدائية…)، بأوزان تحددها، والمعدل والتقدير لكل طالب')} />

      {noAssignment ? (
        <Card className="p-10 text-center space-y-2" data-testid="gradebook-no-assignment">
          <MascotHere className="mx-auto mb-1" />
          <p className="font-bold text-slate-900 dark:text-white">{t('لا توجد فصول أو مواد مسندة إليك بعد')}</p>
          <p className="text-sm text-slate-500">{t('يظهر كشف الدرجات لفصولك وموادك المسندة فقط. تواصل مع إدارة المدرسة لإسنادها إلى حسابك.')}</p>
        </Card>
      ) : (<>
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الفصل')}
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${sel} min-w-[160px]`}>{myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('المادة')}
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={`${sel} min-w-[160px]`}>{mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الدرجة النهائية من')}
          <input type="number" min={1} max={1000} value={outOf} onChange={(e) => setOutOf(Math.max(1, Number(e.target.value) || 100))} className={`${sel} w-24`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 h-10">
          <input type="checkbox" checked={missingZero} onChange={(e) => setMissingZero(e.target.checked)} />{t('غير المؤدّى يُحتسب صفراً')}
        </label>
        <div className="ms-auto flex flex-wrap gap-2">
          {(isAdmin || me.role === 'teacher') && <Button variant="secondary" icon={Plus} onClick={() => setAdding({ title: '', max: '10', weight: '1' })} disabled={!classId || !subjectId}>{t('عمود يدوي')}</Button>}
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => void exportExcel()} disabled={!students.length}>{t('Excel')}</Button>
          <Button icon={FileDown} onClick={() => void exportPdf()} disabled={!students.length}>{t('كشف PDF')}</Button>
        </div>
        {adding && (
          <div className="w-full flex flex-wrap items-end gap-2 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 p-3" data-testid="add-column">
            <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1 flex-1 min-w-[180px]">{t('اسم العمود')}
              <input autoFocus value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder={t('مثال: المشاركة، الواجبات، المهام الأدائية')} className={sel} maxLength={80} />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الدرجة العظمى')}
              <input type="number" min={1} value={adding.max} onChange={(e) => setAdding({ ...adding, max: e.target.value })} className={`${sel} w-24`} />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الوزن')}
              <input type="number" min={0} value={adding.weight} onChange={(e) => setAdding({ ...adding, weight: e.target.value })} className={`${sel} w-20`} />
            </label>
            <Button onClick={() => void submitColumn()}>{t('إضافة')}</Button>
            <button type="button" aria-label={t('إلغاء')} onClick={() => setAdding(null)} className="w-10 h-10 rounded-xl hover:bg-white/70 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        {!students.length ? <EmptyMascot text={t('لا يوجد طلاب في هذا الفصل')} /> : (
          <div className="overflow-x-auto" data-testid="gradebook-table">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 align-bottom">
                  <th className="sticky start-0 z-10 bg-slate-50 dark:bg-slate-800 text-start px-4 py-3 font-semibold min-w-[220px]">{t('الطالب')}</th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-semibold text-center min-w-[96px] border-s border-slate-200/70 dark:border-slate-700">
                      <div className="flex items-start justify-center gap-1">
                        <span className="line-clamp-2 text-slate-800 dark:text-slate-100" title={c.title}>{c.title}</span>
                        {c.kind === 'manual' && c.editable && <button type="button" aria-label={t('حذف العمود')} onClick={() => void removeColumn(c)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                      <div className={`text-[11px] font-normal ${c.kind === 'manual' ? 'text-violet-600' : 'text-slate-500'}`}>{c.sub} · {t('من {m}', { m: num(c.max) })}</div>
                      <label className="mt-1 inline-flex items-center gap-1 text-[11px] font-normal text-slate-500">{t('الوزن')}
                        {c.editable
                          ? <input key={`${c.key}-${c.weight}`} type="number" min={0} max={100} step="0.5" defaultValue={c.weight} aria-label={t('وزن {t}', { t: c.title })} onBlur={(e) => void setWeight(c, e.target.value)} className={small} />
                          : <b className="tabular-nums">{num(c.weight)}</b>}
                      </label>
                    </th>
                  ))}
                  <th className="px-3 py-3 font-semibold text-center border-s border-slate-200 dark:border-slate-700">{t('المعدل %')}</th>
                  <th className="px-3 py-3 font-semibold text-center">{t('من {n}', { n: outOf })}</th>
                  <th className="px-3 py-3 font-semibold text-center">{t('التقدير')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, r }) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="sticky start-0 bg-white dark:bg-slate-900 px-4 py-2 font-semibold text-slate-900 dark:text-white">{s.name}</td>
                    {columns.map((c) => {
                      const v = cell(c, s.id);
                      if (c.kind === 'manual' && c.editable) {
                        const k = `${c.column!.id}|${s.id}`;
                        return (
                          <td key={c.key} className="px-2 py-1.5 text-center border-s border-slate-100 dark:border-slate-800">
                            <input inputMode="decimal" aria-label={t('{t}: {s}', { t: c.title, s: s.name })} value={drafts[k] ?? (v ? num(v.score) : '')}
                              onChange={(e) => setDrafts((p) => ({ ...p, [k]: e.target.value }))} onBlur={() => void commitMark(c, s.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="h-8 w-16 px-1 rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20 text-center tabular-nums" />
                          </td>
                        );
                      }
                      const p = v ? (v.score / (v.max || 1)) * 100 : null;
                      return (
                        <td key={c.key} className="px-2 py-2 text-center tabular-nums border-s border-slate-100 dark:border-slate-800">
                          {v ? <span style={{ color: pctColor(p!) }} className="font-semibold" title={`${Math.round(p!)}%`}>{num(v.score)}<span className="text-slate-400 font-normal">/{num(v.max)}</span></span> : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center tabular-nums font-bold border-s border-slate-200 dark:border-slate-700" style={{ color: r.pct != null ? pctColor(r.pct) : undefined }}>{r.pct ?? '—'}</td>
                    <td className="px-3 py-2 text-center tabular-nums font-extrabold text-slate-900 dark:text-white">{r.final ?? '—'}</td>
                    <td className="px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{t(gradeLabel(r.pct))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                  <td className="sticky start-0 bg-slate-50 dark:bg-slate-800 px-4 py-2 font-semibold">{t('متوسط الفصل')}</td>
                  {columns.map((c) => { const a = colAvg(c); return <td key={c.key} className="px-2 py-2 text-center tabular-nums text-xs border-s border-slate-100 dark:border-slate-800">{a == null ? '—' : `${Math.round(a)}%`}</td>; })}
                  <td className="px-3 py-2 text-center tabular-nums font-bold border-s border-slate-200 dark:border-slate-700">{classAvg == null ? '—' : `${Math.round(classAvg * 10) / 10}`}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {loading && <p className="px-4 py-2 text-xs text-slate-500">{t('جارٍ التحميل…')}</p>}
      </Card>
      <p className="text-xs text-slate-500">{t('المعدل = مجموع (وزن العمود × نسبة الطالب فيه) ÷ مجموع الأوزان. عند إعادة الاختبار تُحتسب أفضل محاولة. الوزن 0 يستبعد العمود.')}</p>
      </>)}
    </div>
  );
};
