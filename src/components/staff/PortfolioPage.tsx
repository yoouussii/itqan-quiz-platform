import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, FileDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button } from '../common/ui';
import { supabase } from '../../services/supabase';
import { safe } from '../../services/remote';
import { visitTotals, ClassVisit } from '../../services/visitsSurveysService';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t, dateLocale } from '../../i18n';
import type { QuizWithDetails, SubmissionWithDetails, User } from '../../types';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** بداية العام الدراسي: 1 أغسطس */
const yearStart = () => { const n = new Date(); return iso(new Date(n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1, 7, 1)); };
const fmt = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (n: number | null) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`);

interface Extra { certs: number | null; bank: number | null; bankShared: number | null; visits: ClassVisit[]; plans: number | null; plansDone: number | null; columns: number | null; positives: number | null }

/** ملف إنجاز المعلم: ملخص عمله على المنصة خلال فترة، جاهز للطباعة (PDF) */
export const PortfolioPage: React.FC = () => {
  const { currentUser, users, quizzes, submissions, subjects, classes } = useApp();
  const me = currentUser!;
  const teachers = useMemo(() => (users as User[]).filter((u) => u.role === 'teacher').sort((a, b) => a.name.localeCompare(b.name, 'ar')), [users]);
  const [tid, setTid] = useState(me.role === 'teacher' ? me.id : '');
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(iso(new Date()));
  const [extra, setExtra] = useState<Extra | null>(null);
  useEffect(() => { if (!tid && teachers[0]) setTid(teachers[0].id); }, [tid, teachers]);
  const teacher = (users as User[]).find((u) => u.id === tid);
  const inRange = (d?: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;

  // الإحصاءات من الخادم (عدّ فقط، دون تحميل البيانات)
  useEffect(() => {
    if (!tid) return;
    let live = true; setExtra(null);
    const end = `${to}T23:59:59`;
    const cnt = async (table: string, f: (q: any) => any) => {
      const r = await safe<any>(async () => { const x = await f(supabase.from(table).select('*', { count: 'exact', head: true })); return { data: x.count ?? null, error: x.error }; });
      return r.ok ? (r.data as number | null) : null;
    };
    void (async () => {
      const [certs, bank, bankShared, plans, plansDone, columns, positives, visitsR] = await Promise.all([
        cnt('certificates', (q) => q.eq('created_by', tid).gte('created_at', from).lte('created_at', end)),
        cnt('question_bank', (q) => q.eq('created_by', tid)),
        cnt('question_bank', (q) => q.eq('created_by', tid).eq('shared', true)),
        cnt('remedial_plans', (q) => q.eq('teacher_id', tid).gte('created_at', from).lte('created_at', end)),
        cnt('remedial_plans', (q) => q.eq('teacher_id', tid).eq('status', 'done').gte('created_at', from).lte('created_at', end)),
        cnt('gradebook_columns', (q) => q.eq('created_by', tid).gte('created_at', from).lte('created_at', end)),
        cnt('behavior_records', (q) => q.eq('created_by', tid).eq('kind', 'positive').gte('day', from).lte('day', to)),
        safe<ClassVisit[]>(() => supabase.from('class_visits').select('*').eq('teacher_id', tid).gte('day', from).lte('day', to).order('day') as any),
      ]);
      if (live) setExtra({ certs, bank, bankShared, plans, plansDone, columns, positives, visits: visitsR.data || [] });
    })();
    return () => { live = false; };
  }, [tid, from, to]);

  const data = useMemo(() => {
    const qs = (quizzes as QuizWithDetails[]).filter((q) => !q.is_deleted && (q.teacher_id === tid || q.created_by === tid) && inRange(q.created_at));
    const ids = new Set(qs.map((q) => q.id));
    const subs = (submissions as SubmissionWithDetails[]).filter((s) => ids.has(s.quiz_id) && s.status !== 'in_progress').sort((a, b) => a.completed_at.localeCompare(b.completed_at));
    const passOf = (s: SubmissionWithDetails) => Number(s.percentage) >= (Number(qs.find((q) => q.id === s.quiz_id)?.pass_percentage) || 50);
    const half = Math.floor(subs.length / 2);
    const bySubject = new Map<string, number>();
    qs.forEach((q) => bySubject.set(q.subject_id, (bySubject.get(q.subject_id) || 0) + 1));
    return {
      quizzes: qs.length, published: qs.filter((q) => q.status === 'published' || q.status === 'archived').length,
      questions: qs.reduce((a, q) => a + (q.questions?.length || 0), 0),
      subs: subs.length, students: new Set(subs.map((s) => s.student_id)).size,
      avg: avg(subs.map((s) => Number(s.percentage))), pass: subs.length ? (subs.filter(passOf).length / subs.length) * 100 : null,
      first: avg(subs.slice(0, half).map((s) => Number(s.percentage))), second: avg(subs.slice(half).map((s) => Number(s.percentage))),
      bySubject: [...bySubject.entries()].map(([id, n]) => ({ name: subjects.find((s) => s.id === id)?.name || '—', n })),
      list: qs.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((q) => {
        const qsubs = subs.filter((s) => s.quiz_id === q.id);
        return { title: q.title, date: q.start_date || q.created_at, n: qsubs.length, avg: avg(qsubs.map((s) => Number(s.percentage))) };
      }),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizzes, submissions, tid, from, to, subjects]);

  const visitAvg = extra ? avg(extra.visits.map((v) => visitTotals(v).pct)) : null;
  const improvement = data.first != null && data.second != null && data.subs >= 4 ? data.second - data.first : null;
  const teacherSubjects = (teacher?.assigned_subject_ids || []).map((id) => subjects.find((s) => s.id === id)?.name).filter(Boolean).join('، ');
  const teacherClasses = (teacher?.assigned_class_ids || []).map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join('، ');
  const n = (v: number | null | undefined) => (v == null ? '—' : String(v));

  const tiles: [string, string][] = [
    ['اختبارات أنشأها', String(data.quizzes)], ['أسئلة في اختباراته', String(data.questions)], ['مشاركات الطلاب', String(data.subs)], ['طلاب شاركوا', String(data.students)],
    ['متوسط نتائج الطلاب', r1(data.avg)], ['نسبة النجاح', r1(data.pass)], ['أسئلة في بنك الأسئلة', n(extra?.bank)], ['مشتركة مع الزملاء', n(extra?.bankShared)],
    ['شهادات منحها', n(extra?.certs)], ['خطط علاجية', extra?.plans == null ? '—' : `${extra.plans} (${t('{n} مكتملة', { n: extra.plansDone ?? 0 })})`], ['زيارات صفية', extra ? `${extra.visits.length}${visitAvg != null ? ` · ${Math.round(visitAvg)}%` : ''}` : '—'], ['سلوك إيجابي سجّله', n(extra?.positives)],
  ];

  const exportPdf = async () => {
    if (!teacher) return;
    const tileHtml = `<table class="pdf-table" style="margin-bottom:14px"><tbody>${Array.from({ length: Math.ceil(tiles.length / 3) }, (_, r) => `<tr>${tiles.slice(r * 3, r * 3 + 3).map(([l, v]) => `<td style="width:33%"><div style="font-size:11px;color:#64748b">${esc(t(l))}</div><div style="font-size:18px;font-weight:800">${esc(v)}</div></td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const body = `<table class="pdf-table" style="margin-bottom:14px"><tbody>
        <tr><th>${esc(t('المعلم'))}</th><td>${esc(teacher.name)}</td><th>${esc(t('المسمى'))}</th><td>${esc(teacher.job_title || t('معلم'))}</td></tr>
        <tr><th>${esc(t('المواد'))}</th><td>${esc(teacherSubjects || '—')}</td><th>${esc(t('الفصول'))}</th><td>${esc(teacherClasses || '—')}</td></tr>
        <tr><th>${esc(t('الفترة'))}</th><td colspan="3">${esc(fmt(from))} — ${esc(fmt(to))}</td></tr></tbody></table>
      <h3 style="margin:8px 0 6px">${esc(t('ملخص الإنجاز'))}</h3>${tileHtml}
      ${improvement != null ? `<p style="margin:0 0 12px">${esc(t('تطور متوسط نتائج الطلاب بين النصف الأول والثاني من الفترة: {a} ← {b} ({d})', { a: r1(data.first), b: r1(data.second), d: `${improvement >= 0 ? '+' : ''}${Math.round(improvement * 10) / 10}%` }))}</p>` : ''}
      <h3 style="margin:12px 0 6px">${esc(t('الاختبارات'))}</h3>${data.list.length ? `<table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('الاختبار'))}</th><th>${esc(t('التاريخ'))}</th><th>${esc(t('المشاركات'))}</th><th>${esc(t('المتوسط'))}</th></tr></thead><tbody>${data.list.map((q, i) => `<tr><td>${i + 1}</td><td>${esc(q.title)}</td><td>${esc(fmt(q.date))}</td><td>${q.n}</td><td>${esc(r1(q.avg))}</td></tr>`).join('')}</tbody></table>` : '<p>—</p>'}
      ${extra?.visits.length ? `<h3 style="margin:16px 0 6px">${esc(t('الزيارات الصفية'))}</h3><table class="pdf-table"><thead><tr><th>${esc(t('التاريخ'))}</th><th>${esc(t('الدرس'))}</th><th>${esc(t('الزائر'))}</th><th>${esc(t('التقييم'))}</th></tr></thead><tbody>${extra.visits.map((v) => `<tr><td>${esc(fmt(v.day))}</td><td>${esc(v.lesson || '—')}</td><td>${esc(v.visitor_name)}</td><td>${visitTotals(v).pct}%</td></tr>`).join('')}</tbody></table>` : ''}
      <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><span>${esc(t('المعلم'))}: ....................</span><span>${esc(t('مدير المدرسة'))}: ....................</span></div>`;
    await exportElementToPdf({ bodyHtml: body, orientation: 'portrait', title: t('ملف إنجاز المعلم: {n}', { n: teacher.name }), subtitle: `${fmt(from)} — ${fmt(to)}` });
  };

  const inp = 'h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
  return (
    <div className="max-w-6xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><FolderOpen className="w-7 h-7 text-indigo-600" />{me.role === 'teacher' ? t('ملف إنجازي') : t('ملفات إنجاز المعلمين')}</span>}
        subtitle={t('ملخص عمل المعلم على المنصة خلال فترة: الاختبارات ونتائج الطلاب وبنك الأسئلة والشهادات والخطط العلاجية والزيارات الصفية، جاهز للطباعة')}
        actions={<Button icon={FileDown} onClick={() => void exportPdf()} disabled={!teacher}>{t('تنزيل ملف الإنجاز PDF')}</Button>} />
      <Card className="p-4 flex flex-wrap items-end gap-3">
        {me.role !== 'teacher' && (
          <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('المعلم')}
            <select value={tid} onChange={(e) => setTid(e.target.value)} className={`${inp} min-w-[220px]`}>{teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </label>
        )}
        <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('من')}<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inp} /></label>
        <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('إلى')}<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inp} /></label>
        {teacher && <p className="text-sm text-slate-500 ms-auto">{[teacherSubjects, teacherClasses].filter(Boolean).join(' · ')}</p>}
      </Card>
      {!teacher ? <Card className="p-10 text-center text-slate-500">{t('لا يوجد معلمون')}</Card> : (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="portfolio-tiles">
          {tiles.map(([l, v]) => <Card key={l} className="p-4"><div className="text-xs font-semibold text-slate-500">{t(l)}</div><div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-0.5">{v}</div></Card>)}
        </div>
        {improvement != null && (
          <Card className={`p-4 text-sm ${improvement >= 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'}`}>
            {t('تطور متوسط نتائج الطلاب بين النصف الأول والثاني من الفترة: {a} ← {b} ({d})', { a: r1(data.first), b: r1(data.second), d: `${improvement >= 0 ? '+' : ''}${Math.round(improvement * 10) / 10}%` })}
          </Card>
        )}
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <Card className="p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-2 font-bold text-slate-900 dark:text-white">{t('الاختبارات')} <span className="text-sm font-normal text-slate-500">({data.bySubject.map((s) => `${s.name}: ${s.n}`).join('، ') || '—'})</span></div>
            {data.list.length === 0 ? <p className="p-6 text-center text-slate-500 text-sm">{t('لا توجد اختبارات في هذه الفترة')}</p> : (
              <ul>{data.list.map((q, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2 border-t border-slate-100 dark:border-slate-800 text-sm">
                  <span className="flex-1 truncate text-slate-800 dark:text-slate-100">{q.title}</span>
                  <span className="text-xs text-slate-500">{fmt(q.date)}</span>
                  <span className="w-16 text-end tabular-nums text-slate-600 dark:text-slate-300">{t('{n} مشاركة', { n: q.n })}</span>
                  <b className="w-14 text-end tabular-nums">{r1(q.avg)}</b>
                </li>
              ))}</ul>
            )}
          </Card>
          <Card className="p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-2 font-bold text-slate-900 dark:text-white">{t('الزيارات الصفية')}</div>
            {!extra ? <p className="p-6 text-center text-slate-500 text-sm">{t('جارٍ التحميل…')}</p> : extra.visits.length === 0 ? <p className="p-6 text-center text-slate-500 text-sm">{t('لا توجد زيارات في هذه الفترة')}</p> : (
              <ul>{extra.visits.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-2 border-t border-slate-100 dark:border-slate-800 text-sm">
                  <span className="flex-1 truncate text-slate-800 dark:text-slate-100">{v.lesson || '—'}</span>
                  <span className="text-xs text-slate-500">{fmt(v.day)} · {v.visitor_name}</span>
                  <b className="w-12 text-end tabular-nums">{visitTotals(v).pct}%</b>
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      </>)}
    </div>
  );
};
