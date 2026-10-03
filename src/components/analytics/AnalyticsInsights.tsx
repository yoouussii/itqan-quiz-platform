import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowUp, ArrowDown, Minus, Filter, AlertTriangle, Bell, Users as UsersIcon, Sparkles, FileText, Table2, LineChart as LineIcon, RotateCcw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { Card, Button } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import { exportStudentReport, reportExtras } from '../../utils/studentReport';
import { computePointEvents, earnedBadges, totalPoints } from '../../utils/points';
import { formatFullArabicDate } from '../../utils/dateUtils';
import {
  AnalyticsFilters, Period, emptyFilters, matchesDims, splitByPeriod, summarize, heatmap, weeklyTrend, atRiskStudents, RiskReason, Scope,
} from '../../utils/analytics';
import { t, isEn, dateLocale } from '../../i18n';
import type { User } from '../../types';

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

export const AnalyticsInsights: React.FC = () => {
  const { currentUser, submissions, quizzes, users, subjects, classes, branches, theme, awards, sendAnnouncement, setCurrentView } = useApp();
  const dark = theme === 'dark';
  const [f, setF] = useState<AnalyticsFilters>(emptyFilters);
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

  // ---- خريطة الشعب × المواد ----
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

  // ---- الطلاب الذين يحتاجون تدخلاً (من كل تسليماتهم ضمن الفلاتر) ----
  const risks = useMemo(
    () => atRiskStudents(dimSubs, scopeStudents, (id) => {
      const list = StorageService.getQuizzesForStudent(id);
      return list.filter((q) => (!f.subjectId || q.subject_id === f.subjectId) && (!f.teacherId || q.teacher_id === f.teacherId) && (staff?.quizzes || []).some((x) => x.id === q.id));
    }),
    [dimSubs, scopeStudents, f.subjectId, f.teacherId, staff]
  );
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
      <Card className="p-3 flex flex-wrap items-center gap-2" role="group" aria-label={t('فلاتر التحليلات')}>
        <Filter className="w-4 h-4 text-slate-500" aria-hidden />
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
        <select aria-label={t('الشعبة')} className={selectCls} value={f.classId} onChange={(e) => set({ classId: e.target.value })}>
          <option value="">{t('كل الشعب')}</option>
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
        {filtered && (
          <button type="button" onClick={() => setF(emptyFilters())} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
            <RotateCcw className="w-3.5 h-3.5" />{t('إعادة ضبط')}
          </button>
        )}
      </Card>

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
        {/* خريطة الشعب × المواد */}
        <Card className="p-5 space-y-3" data-testid="heatmap">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('خريطة الأداء: الشعب × المواد')}</h3>
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
                <thead><tr className="text-slate-500 dark:text-slate-400"><th className="py-1.5 px-2 text-start">{t('الشعبة')}</th><th className="py-1.5 px-2 text-start">{t('المادة')}</th><th className="py-1.5 px-2 text-start">{t('المتوسط')}</th><th className="py-1.5 px-2 text-start">{t('التسليمات')}</th></tr></thead>
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
    </section>
  );
};
