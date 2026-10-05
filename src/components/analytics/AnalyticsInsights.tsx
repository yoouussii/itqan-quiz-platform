import { FilterBar, useRememberedState } from '../common/FilterBar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportElementToPdf } from '../../utils/exportPdf';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowUp, ArrowDown, Minus, AlertTriangle, Bell, Users as UsersIcon, Sparkles, FileText, Table2, LineChart as LineIcon, Download, EyeOff, Building2, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { Card, Button } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import { exportStudentReport, reportExtras } from '../../utils/studentReport';
import { computePointEvents, earnedBadges, totalPoints } from '../../utils/points';
import { formatFullArabicDate } from '../../utils/dateUtils';
import {
  AnalyticsFilters, Period, PERIOD_DAYS, emptyFilters, matchesDims, splitByPeriod, summarize, heatmap, weeklyTrend, atRiskStudents, RiskReason, Scope,
} from '../../utils/analytics';
import { t, isEn, dateLocale } from '../../i18n';
import type { User, SubmissionWithDetails } from '../../types';

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'week', label: 'أسبوع' },
  { id: 'month', label: 'شهر' },
  { id: 'term', label: 'فصل (90 يوماً)' },
  { id: 'year', label: 'سنة' },
  { id: 'all', label: 'الكل' },
];

// ألوان السلاسل بترتيب ثابت حسب ترتيب المادة (لا حسب ترتيبها في الرسم)
const SERIES = { light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'], dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'] };

/** تدرّج متباعد: أحمر (ضعيف) ← رمادي عند 50% ← أزرق (قوي) */
function divergingColor(v: number, dark: boolean) {
  const low = dark ? [230, 103, 103] : [227, 73, 72];
  const mid = dark ? [56, 56, 53] : [240, 239, 236];
  const high = dark ? [57, 135, 229] : [42, 120, 214];
  const k = Math.max(-1, Math.min(1, (v - 50) / 50));
  const to = k < 0 ? low : high;
  const a = Math.abs(k);
  const c = mid.map((m, i) => Math.round(m + (to[i] - m) * a));
  return { bg: `rgb(${c.join(',')})`, fg: a > 0.55 ? '#ffffff' : dark ? '#e2e8f0' : '#1e293b' };
}

const selectCls = 'p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** سهم المقارنة بالفترة السابقة: سهم + إشارة + نص (لا يعتمد على اللون وحده) */
const Delta: React.FC<{ now: number; prev: number | null; unit?: string }> = ({ now, prev, unit = '' }) => {
  if (prev === null) return <span className="text-[11px] text-slate-400">{t('لا توجد فترة سابقة للمقارنة')}</span>;
  const d = Math.round(now - prev);
  const Icon = d > 0 ? ArrowUp : d < 0 ? ArrowDown : Minus;
  const cls = d > 0 ? 'text-emerald-700 dark:text-emerald-400' : d < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${cls}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {d > 0 ? '+' : ''}{d}{unit} <span className="font-normal text-slate-500 dark:text-slate-400">{t('عن الفترة السابقة')}</span>
    </span>
  );
};

const REASON_TEXT = (r: RiskReason) => {
  switch (r.kind) {
    case 'low_avg': return t('متوسط آخر اختباراته {v}%', { v: r.value });
    case 'failed_last_two': return t('رسب في آخر اختبارين');
    case 'declining': return t('تراجع {v} نقطة عن مستواه السابق', { v: r.value });
    case 'missed': return t('فاته {v} اختبارات دون تسليم', { v: r.value });
  }
};

/** onDrill: التسليمات المطابقة للفلاتر (لجدول النتائج أسفل اللوحة)، أو null بالفلاتر الافتراضية */
export const AnalyticsInsights: React.FC<{ onDrill?: (subs: SubmissionWithDetails[] | null) => void }> = ({ onDrill }) => {
  const exportRef = useRef<HTMLDivElement>(null);
  const { currentUser, submissions, quizzes, users, subjects, classes, branches, theme, awards, sendAnnouncement, setCurrentView, showToast } = useApp();
  const dark = theme === 'dark';
  const [f, setF] = useRememberedState<AnalyticsFilters>('analytics', emptyFilters());
  const [heatAsTable, setHeatAsTable] = useState(false);
  const [trendAsTable, setTrendAsTable] = useState(false);
  const [riskLimit, setRiskLimit] = useState(8);
  const set = (patch: Partial<AnalyticsFilters>) => setF((x) => ({ ...x, ...patch }));

  const staff = useMemo(
    () => (currentUser ? StorageService.getStaffData(currentUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, quizzes, submissions, users]
  );
  const scope: Scope = { quizzes: quizzes || [], submissions: submissions || [], users: users || [] };
  const isAdmin = currentUser?.role === 'admin';
  const showTeacher = currentUser?.role !== 'teacher' && (staff?.teachers.length || 0) > 1;
  const showBranch = isAdmin && branches.length > 1;

  const dimSubs = useMemo(() => (submissions || []).filter((s) => matchesDims(s, f, scope)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submissions, f.subjectId, f.classId, f.teacherId, f.branchId, quizzes, users]);
  const { current, previous } = useMemo(() => splitByPeriod(dimSubs, f.period), [dimSubs, f.period]);
  const now = summarize(current);
  const prev = previous ? summarize(previous) : null;

  const scopeStudents = useMemo(
    () => (staff?.students || []).filter((st) => (!f.classId || st.class_id === f.classId) && (!f.branchId || st.branch_id === f.branchId)),
    [staff, f.classId, f.branchId]
  );
  const participation = (s: { students: number }) => (scopeStudents.length ? Math.round((s.students / scopeStudents.length) * 100) : 0);

  const subjectName = (id: string) => t(subjects.find((s) => s.id === id)?.name || 'بدون مادة');
  const className = (id: string) => classes.find((c) => c.id === id)?.name || '—';
  const subjectIndex = (id: string) => Math.max(0, subjects.findIndex((s) => s.id === id));
  const seriesColor = (id: string) => (dark ? SERIES.dark : SERIES.light)[subjectIndex(id) % 8];

  // ---- خريطة الفصول × المواد ----
  const heat = useMemo(() => heatmap(current, scope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, quizzes, users]);
  const heatRows = [...heat.rows].sort((a, b) => className(a).localeCompare(className(b), 'ar'));
  const heatCols = [...heat.cols].sort((a, b) => subjectIndex(a) - subjectIndex(b));

  // ---- تطور الدرجات: الكل + أكثر 3 مواد تسليماً ----
  const topSubjects = useMemo(() => {
    const count = new Map<string, number>();
    current.forEach((s) => { const id = s.quiz?.subject_id; if (id) count.set(id, (count.get(id) || 0) + 1); });
    return f.subjectId ? [] : Array.from(count.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id).sort((a, b) => subjectIndex(a) - subjectIndex(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, f.subjectId, subjects]);
  const trend = useMemo(() => weeklyTrend(current, scope, topSubjects),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, topSubjects, quizzes]);
  const weekLabel = (iso: string) => new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

  // اختبارات كل طالب (المسندة إليه ضمن النطاق والفلاتر): للمشاركة والاختبارات الفائتة
  const quizzesOf = useMemo(() => {
    const scopeIds = new Set((staff?.quizzes || []).map((x) => x.id));
    const m = new Map<string, ReturnType<typeof StorageService.getQuizzesForStudent>>();
    scopeStudents.forEach((st) => m.set(st.id, StorageService.getQuizzesForStudent(st.id)
      .filter((q) => scopeIds.has(q.id) && (!f.subjectId || q.subject_id === f.subjectId) && (!f.teacherId || q.teacher_id === f.teacherId))));
    return m;
  }, [scopeStudents, staff, f.subjectId, f.teacherId]);

  // ---- الطلاب الذين يحتاجون تدخلاً (من كل تسليماتهم ضمن الفلاتر) ----
  const risks = useMemo(
    () => atRiskStudents(dimSubs, scopeStudents, (id) => quizzesOf.get(id) || []),
    [dimSubs, scopeStudents, quizzesOf]
  );

  // ---- المشاركة لكل اختبار: من سلّم من الطلاب المسند إليهم (الاختبارات التي بدأت في الفترة) ----
  const participationRows = useMemo(() => {
    const assigned = new Map<string, number>();
    quizzesOf.forEach((list) => list.forEach((q) => assigned.set(q.id, (assigned.get(q.id) || 0) + 1)));
    const days = PERIOD_DAYS[f.period];
    const since = days ? Date.now() - days * 86_400_000 : 0;
    return Array.from(assigned.entries()).map(([id, n]) => {
      const q = (quizzes || []).find((x) => x.id === id);
      const start = new Date(q?.start_date || q?.created_at || 0).getTime();
      const done = new Set(dimSubs.filter((s) => s.quiz_id === id).map((s) => s.student_id)).size;
      return { id, title: q?.title || '—', assigned: n, done: Math.min(done, n), pct: n ? Math.round((Math.min(done, n) / n) * 100) : 0, start };
    }).filter((r) => r.start >= since).sort((a, b) => a.pct - b.pct || b.assigned - a.assigned);
  }, [quizzesOf, dimSubs, quizzes, f.period]);

  // ---- ملخص النزاهة: خروج الطلاب من صفحة الاختبار أثناء الحل ----
  const integrity = useMemo(() => {
    const logged = current.filter((s) => s.integrity);
    const flagged = logged.filter((s) => (s.integrity?.leaves || 0) + (s.integrity?.fullscreen_exits || 0) > 0);
    const byStudent = new Map<string, number>();
    flagged.forEach((s) => byStudent.set(s.student_id, (byStudent.get(s.student_id) || 0) + (s.integrity?.leaves || 0) + (s.integrity?.fullscreen_exits || 0)));
    const top = Array.from(byStudent.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => ({ name: (users || []).find((u) => u.id === id)?.name || t('طالب'), n }));
    return { logged: logged.length, flagged: flagged.length, severe: flagged.filter((s) => (s.integrity?.leaves || 0) >= 3 || (s.integrity?.fullscreen_exits || 0) >= 3).length, top };
  }, [current, users]);

  // ---- مقارنة الفروع (الشركة أو المجمع التعليمي) ----
  const branchRows = useMemo(() => {
    if (!hasPerm(currentUser, 'can_view_branch_comparison') || branches.length < 2) return [];
    const stBranch = new Map((users || []).filter((u) => u.role === 'student').map((u) => [u.id, u.branch_id || '']));
    // المقارنة تتجاهل فلتر الفرع نفسه (حتى تبقى كل الفروع ظاهرة بعد الضغط على أحدها)
    const noBranch = { ...f, branchId: '' };
    const base = splitByPeriod((submissions || []).filter((s) => matchesDims(s, noBranch, scope)), f.period).current;
    return branches.map((b) => {
      const subs = base.filter((s) => stBranch.get(s.student_id) === b.id);
      const sum = summarize(subs);
      const studentsN = (staff?.students || []).filter((st) => st.branch_id === b.id && (!f.classId || st.class_id === f.classId)).length;
      const atRisk = f.branchId && f.branchId !== b.id ? null : risks.filter((r) => r.student.branch_id === b.id).length;
      return { id: b.id, name: b.name, ...sum, studentsN, participation: studentsN ? Math.round((sum.students / studentsN) * 100) : 0, atRisk };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, branches, users, submissions, f, staff, risks]);
  const canInsights = hasPerm(currentUser, 'can_view_insights');
  const canExport = hasPerm(currentUser, 'can_export_reports');
  const canNotify = hasPerm(currentUser, 'can_send_announcements');
  const parentsOf = (st: User) => (users || []).filter((u) => u.role === 'parent' && (u.child_ids || []).includes(st.id)).map((u) => u.id);

  const remind = async (st: User, toParents: boolean) => {
    const ids = toParents ? parentsOf(st) : [];
    if (toParents && !ids.length) return;
    await sendAnnouncement(toParents
      ? { title: `متابعة مستوى ${st.name}`, body: `نود إطلاعكم على أن ${st.name} يحتاج إلى متابعة في الاختبارات الأخيرة. نرجو التواصل مع المدرسة والاطلاع على نتائجه من المنصة.`, audience: { user_ids: ids } }
      : { title: 'تذكير بالمتابعة', body: `عزيزي ${st.name}، لاحظنا أنك تحتاج إلى مراجعة دروسك الأخيرة. راجع نتائجك وحاول في الاختبارات القادمة، ونحن معك.`, audience: { student_ids: [st.id] } });
  };
  const report = async (st: User) => {
    const subs = (submissions || []).filter((x) => x.student_id === st.id);
    const mine = (awards || []).filter((a) => a.student_id === st.id);
    await exportStudentReport({
      name: st.name,
      nationalId: st.national_id,
      className: className(st.class_id || ''),
      results: subs.map((x) => ({ quiz: x.quiz?.title || '—', subject: x.subject?.name || '—', score: `${x.score}/${x.total_possible_score}`, pct: Number(x.percentage) || 0, date: formatFullArabicDate(x.completed_at) })),
      points: totalPoints(computePointEvents(subs, quizzes || [], mine)),
      badgeKeys: earnedBadges(subs, quizzes || []),
      ...reportExtras(st.id, quizzes || [], submissions || [], (id) => subjects.find((s) => s.id === id)?.name || ''),
      awards: mine,
    });
  };

  const filtered = f.subjectId || f.classId || f.teacherId || f.branchId || f.period !== 'term';
  // التفاصيل: جدول النتائج أسفل اللوحة يعرض التسليمات المطابقة للفلاتر
  useEffect(() => { onDrill?.(filtered ? current : null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filtered, current]);

  const exportPdf = async () => {
    if (!exportRef.current) return;
    const parts = [t((PERIODS.find((p) => p.id === f.period) || PERIODS[2]).label), f.subjectId && subjectName(f.subjectId), f.classId && className(f.classId),
      f.teacherId && (staff?.teachers || []).find((u) => u.id === f.teacherId)?.name, f.branchId && branches.find((b) => b.id === f.branchId)?.name].filter(Boolean);
    try {
      await exportElementToPdf({ element: exportRef.current, title: t('لوحة التحليلات'), subtitle: parts.join(' • '), orientation: 'portrait' });
    } catch (e: any) { showToast(e?.message || t('تعذر تصدير PDF'), 'error'); }
  };
  const subjectOptions = subjects.filter((s) => (staff?.quizzes || []).some((q) => q.subject_id === s.id));
  const classOptions = classes.filter((c) => (staff?.students || []).some((st) => st.class_id === c.id));

  const tiles = [
    { label: 'عدد التسليمات', value: String(now.count), delta: <Delta now={now.count} prev={prev?.count ?? null} /> },
    { label: 'متوسط النتائج', value: `${now.avg}%`, delta: <Delta now={now.avg} prev={prev && prev.count ? prev.avg : null} unit="%" /> },
    { label: 'نسبة النجاح', value: `${now.passRate}%`, delta: <Delta now={now.passRate} prev={prev && prev.count ? prev.passRate : null} unit="%" /> },
    { label: 'نسبة المشاركة', value: `${participation(now)}%`, delta: <Delta now={participation(now)} prev={prev ? participation(prev) : null} unit="%" />, hint: t('{a} من {b} طالب سلّموا خلال الفترة', { a: now.students, b: scopeStudents.length }) },
  ];

  return (
    <section className="space-y-5" data-testid="analytics-insights">
      {/* الفلاتر في صف واحد فوق كل الرسوم */}
      <FilterBar label={t('فلاتر التحليلات')} active={[f.period !== 'term', !!f.subjectId, !!f.classId, !!f.teacherId, !!f.branchId].filter(Boolean).length} onReset={() => setF(emptyFilters())} summary={[t((PERIODS.find((p) => p.id === f.period) || PERIODS[2]).label), f.subjectId && subjectName(f.subjectId), f.classId && className(f.classId)].filter(Boolean) as string[]}
        actions={canExport ? (
          <button type="button" onClick={() => void exportPdf()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('تصدير اللوحة PDF')}</span><span className="sm:hidden">PDF</span>
          </button>
        ) : undefined}>
<div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5" role="radiogroup" aria-label={t('الفترة')}>
          {PERIODS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={f.period === p.id} onClick={() => set({ period: p.id })}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition ${f.period === p.id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}>
              {t(p.label)}
            </button>
          ))}
        </div>
        <select aria-label={t('المادة')} className={selectCls} value={f.subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
          <option value="">{t('كل المواد')}</option>
          {subjectOptions.map((s) => <option key={s.id} value={s.id}>{t(s.name)}</option>)}
        </select>
        <select aria-label={t('الفصل')} className={selectCls} value={f.classId} onChange={(e) => set({ classId: e.target.value })}>
          <option value="">{t('كل الفصول')}</option>
          {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {showTeacher && (
          <select aria-label={t('المعلم')} className={selectCls} value={f.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
            <option value="">{t('كل المعلمين')}</option>
            {staff!.teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        {showBranch && (
          <select aria-label={t('الفرع')} className={selectCls} value={f.branchId} onChange={(e) => set({ branchId: e.target.value })}>
            <option value="">{t('كل الفروع')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>
      {filtered && onDrill && <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-3">{t('جدول النتائج في آخر الصفحة يعرض {n} تسليماً مطابقاً للفلاتر.', { n: current.length })}</p>}

      <div ref={exportRef} className="space-y-5">

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((x) => (
          <Card key={x.label} className="p-4 space-y-1">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{t(x.label)}</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{x.value}</div>
            {x.delta}
            {x.hint && <div className="text-[11px] text-slate-500 dark:text-slate-400">{x.hint}</div>}
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* خريطة الفصول × المواد */}
        <Card className="p-5 space-y-3" data-testid="heatmap">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('خريطة الأداء: الفصول × المواد')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('متوسط النتائج في كل خلية. اضغط خلية لتصفية الصفحة عليها.')}</p>
            </div>
            <button type="button" onClick={() => setHeatAsTable((v) => !v)} className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600">
              <Table2 className="w-3.5 h-3.5" />{heatAsTable ? t('عرض الخريطة') : t('عرض كجدول')}
            </button>
          </div>
          {!heatRows.length ? (
            <p className="text-xs text-slate-400 py-6 text-center">{t('لا توجد تسليمات في هذه الفترة.')}</p>
          ) : heatAsTable ? (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs text-start">
                <thead><tr className="text-slate-500 dark:text-slate-400"><th className="py-1.5 px-2 text-start">{t('الفصل')}</th><th className="py-1.5 px-2 text-start">{t('المادة')}</th><th className="py-1.5 px-2 text-start">{t('المتوسط')}</th><th className="py-1.5 px-2 text-start">{t('التسليمات')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {heatRows.flatMap((r) => heatCols.map((c) => ({ r, c, v: heat.cell(r, c) })).filter((x) => x.v).map((x) => (
                    <tr key={`${x.r}|${x.c}`}><td className="py-1.5 px-2">{className(x.r)}</td><td className="py-1.5 px-2">{subjectName(x.c)}</td><td className="py-1.5 px-2 font-bold">{x.v!.avg}%</td><td className="py-1.5 px-2">{x.v!.n}</td></tr>
                  )))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
                  <thead>
                    <tr>
                      <th />
                      {heatCols.map((c) => <th key={c} scope="col" className="px-1 pb-1 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{subjectName(c)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heatRows.map((r) => (
                      <tr key={r}>
                        <th scope="row" className="pe-2 text-start font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{className(r)}</th>
                        {heatCols.map((c) => {
                          const v = heat.cell(r, c);
                          if (!v) return <td key={c} className="w-16 h-10 rounded-md bg-slate-50 dark:bg-slate-800/40 text-center text-slate-300 dark:text-slate-600" title={t('لا توجد بيانات')}>—</td>;
                          const col = divergingColor(v.avg, dark);
                          return (
                            <td key={c} className="p-0">
                              <button type="button" onClick={() => set({ classId: r, subjectId: c })}
                                title={`${className(r)} • ${subjectName(c)}: ${v.avg}% (${t('{n} تسليم', { n: v.n })})`}
                                className="w-16 h-10 rounded-md font-black hover:ring-2 hover:ring-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                style={{ background: col.bg, color: col.fg }}>
                                {v.avg}%
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400" aria-hidden>
                <span>0%</span>
                <span className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(to ${isEn() ? 'right' : 'left'}, ${divergingColor(0, dark).bg}, ${divergingColor(50, dark).bg}, ${divergingColor(100, dark).bg})` }} />
                <span>100%</span>
              </div>
            </>
          )}
        </Card>

        {/* تطور الدرجات أسبوعياً */}
        <Card className="p-5 space-y-3" data-testid="trend-chart">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('تطور متوسط النتائج أسبوعياً')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{f.subjectId ? subjectName(f.subjectId) : t('المتوسط العام وأكثر المواد اختباراً')}</p>
            </div>
            <button type="button" onClick={() => setTrendAsTable((v) => !v)} className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600">
              {trendAsTable ? <LineIcon className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}{trendAsTable ? t('عرض الرسم') : t('عرض كجدول')}
            </button>
          </div>
          {trend.filter((r) => r.n).length < 1 ? (
            <p className="text-xs text-slate-400 py-6 text-center">{t('لا توجد تسليمات في هذه الفترة.')}</p>
          ) : trendAsTable ? (
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 dark:text-slate-400"><th className="py-1.5 px-2 text-start">{t('الأسبوع المنتهي في')}</th><th className="py-1.5 px-2 text-start">{t('الكل')}</th>{topSubjects.map((id) => <th key={id} className="py-1.5 px-2 text-start">{subjectName(id)}</th>)}<th className="py-1.5 px-2 text-start">{t('التسليمات')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {trend.filter((r) => r.n).map((r) => (
                    <tr key={String(r.week)}><td className="py-1.5 px-2">{weekLabel(String(r.week))}</td><td className="py-1.5 px-2 font-bold">{r.all}%</td>{topSubjects.map((id) => <td key={id} className="py-1.5 px-2">{r[id] == null ? '—' : `${r[id]}%`}</td>)}<td className="py-1.5 px-2">{r.n}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={dark ? '#1e293b' : '#f1f5f9'} vertical={false} />
                  <XAxis dataKey="week" tickFormatter={(v) => weekLabel(String(v))} reversed={!isEn()} tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} axisLine={{ stroke: dark ? '#334155' : '#cbd5e1' }} tickLine={false} minTickGap={16} padding={{ left: 14, right: 14 }} />
                  <YAxis domain={[0, 100]} orientation={isEn() ? 'left' : 'right'} tickFormatter={(v) => `${v}%`} tick={{ fill: dark ? '#94a3b8' : '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    labelFormatter={(v) => t('الأسبوع المنتهي في {d}', { d: weekLabel(String(v)) })}
                    formatter={(v: any, name: any) => [v == null ? '—' : `${v}%`, name]}
                    contentStyle={{ background: dark ? '#0f172a' : '#fff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, borderRadius: 12, fontSize: 12, direction: isEn() ? 'ltr' : 'rtl', color: dark ? '#e2e8f0' : '#1e293b' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, direction: isEn() ? 'ltr' : 'rtl' }} />
                  <Line type="monotone" dataKey="all" name={t('المتوسط العام')} stroke={dark ? '#e2e8f0' : '#334155'} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                  {topSubjects.map((id) => (
                    <Line key={id} type="monotone" dataKey={id} name={subjectName(id)} stroke={seriesColor(id)} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* المشاركة لكل اختبار */}
        <Card className="p-5 space-y-3" data-testid="participation">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white inline-flex items-center gap-2"><UserCheck className="w-4 h-4 text-indigo-600" aria-hidden />{t('المشاركة في الاختبارات')}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('من سلّم من الطلاب المسند إليهم كل اختبار (الأقل مشاركة أولاً).')}</p>
          </div>
          {!participationRows.length ? <p className="text-xs text-slate-400 py-4 text-center">{t('لا توجد اختبارات في هذه الفترة.')}</p> : (
            <ul className="space-y-2.5">
              {participationRows.slice(0, 8).map((r) => (
                <li key={r.id} className="text-xs">
                  <div className="flex justify-between gap-2 mb-1"><span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{r.title}</span><span className="shrink-0 text-slate-600 dark:text-slate-300"><b>{r.pct}%</b> ({r.done}/{r.assigned})</span></div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: dark ? '#3987e5' : '#2a78d6' }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ملخص النزاهة */}
        {canInsights && (
          <Card className="p-5 space-y-3" data-testid="integrity-summary">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white inline-flex items-center gap-2"><EyeOff className="w-4 h-4 text-amber-600" aria-hidden />{t('ملخص النزاهة')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('خروج الطلاب من صفحة الاختبار أثناء الحل (للتسليمات المسجّل فيها ذلك).')}</p>
            </div>
            {!integrity.logged ? <p className="text-xs text-slate-400 py-4 text-center">{t('لا توجد بيانات نزاهة في هذه الفترة.')}</p> : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[[t('تسليمات مسجّلة'), integrity.logged], [t('فيها خروج'), integrity.flagged], [t('خروج متكرر (3+)'), integrity.severe]].map(([l, v]) => (
                    <div key={String(l)} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2"><div className="text-lg font-black text-slate-900 dark:text-white">{v}</div><div className="text-[11px] text-slate-500 dark:text-slate-400">{l}</div></div>
                  ))}
                </div>
                {integrity.top.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">{t('الأكثر خروجاً')}</p>
                    <ul className="text-xs divide-y divide-slate-100 dark:divide-slate-800">
                      {integrity.top.map((x) => <li key={x.name} className="flex justify-between py-1.5"><span className="text-slate-800 dark:text-slate-100">{x.name}</span><span className="font-bold text-amber-800 dark:text-amber-300">{t('{n} مرة', { n: x.n })}</span></li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>
        )}
      </div>

      {/* مقارنة الفروع */}
      {branchRows.length > 0 && (
        <Card className="p-5 space-y-3" data-testid="branch-comparison">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white inline-flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-600" aria-hidden />{t('مقارنة الفروع')}</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                {['الفرع', 'الطلاب', 'التسليمات', 'المتوسط', 'نسبة النجاح', 'المشاركة', 'يحتاجون تدخلاً'].map((h) => <th key={h} className="py-2 px-3 text-start">{t(h)}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-100">
                {branchRows.map((b) => (
                  <tr key={b.id} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${f.branchId === b.id ? "bg-indigo-50/70 dark:bg-indigo-950/40" : ""}`} aria-selected={f.branchId === b.id} onClick={() => set({ branchId: f.branchId === b.id ? "" : b.id })} title={t('اضغط لتصفية الصفحة على هذا الفرع')}>
                    <td className="py-2 px-3 font-bold">{b.name}</td><td className="py-2 px-3">{b.studentsN}</td><td className="py-2 px-3">{b.count}</td>
                    <td className="py-2 px-3"><span className="inline-flex items-center gap-2"><span className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden inline-block"><span className="block h-full" style={{ width: `${b.avg}%`, background: dark ? '#3987e5' : '#2a78d6' }} /></span><b>{b.avg}%</b></span></td>
                    <td className="py-2 px-3">{b.passRate}%</td><td className="py-2 px-3">{b.participation}%</td><td className="py-2 px-3">{b.atRisk ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* طلاب يحتاجون تدخلاً */}
      <Card className="p-5 space-y-3" data-testid="at-risk">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden />{t('طلاب يحتاجون تدخلاً ({n})', { n: risks.length })}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('متوسط آخر اختبارات أقل من 50%، أو رسوب في آخر اختبارين، أو تراجع واضح، أو اختبارات فائتة.')}</p>
          </div>
          <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => setCurrentView('outcomes')}>{t('اختبار علاجي حسب المهارات')}</Button>
        </div>
        {!risks.length ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">{t('لا يوجد طلاب يحتاجون تدخلاً حسب الفلاتر الحالية.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {risks.slice(0, riskLimit).map((r) => {
              const hasParents = parentsOf(r.student).length > 0;
              return (
                <li key={r.student.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[14rem]">
                    <div className="font-bold text-sm text-slate-900 dark:text-white">{r.student.name} <span className="text-[11px] font-normal text-slate-500">• {className(r.student.class_id || '')}</span></div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {r.reasons.map((x) => (
                        <span key={x.kind} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                          <AlertTriangle className="w-3 h-3" aria-hidden />{REASON_TEXT(x)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {canNotify && <Button size="sm" variant="secondary" icon={Bell} onClick={() => void remind(r.student, false)}>{t('تذكير الطالب')}</Button>}
                    {canNotify && hasParents && <Button size="sm" variant="secondary" icon={UsersIcon} onClick={() => void remind(r.student, true)}>{t('إشعار ولي الأمر')}</Button>}
                    <Button size="sm" variant="secondary" icon={FileText} onClick={() => void report(r.student)}>{t('تقرير')}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {risks.length > riskLimit && (
          <button type="button" onClick={() => setRiskLimit((n) => n + 20)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{t('عرض المزيد ({n})', { n: risks.length - riskLimit })}</button>
        )}
      </Card>
      </div>
    </section>
  );
};
