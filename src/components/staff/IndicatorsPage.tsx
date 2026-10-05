import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, TrendingUp, TrendingDown, Minus, ArrowUpDown, FileSpreadsheet, FileDown, ChevronLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../services/supabase';
import { safe } from '../../services/remote';
import { PageHeader, Card } from '../common/ui';
import { EmptyMascot, PageLoader } from '../common/Mascot';
import { KpiDetailModal } from '../common/KpiDetailModal';
import type { KpiSection } from '../../utils/kpiSections';
import { ExportSection, exportSectionsPdf, exportSectionsXlsx } from '../../utils/tableExport';
import { t, uiDir, dateLocale } from '../../i18n';

type Gran = 'day' | 'week' | 'month';
type Range = 'year' | 'month' | '30' | '7' | 'custom';
interface Point { key: string; absent: number; late: number; submissions: number; quiz_avg: number | null; violations: number; positives: number; hw_rate: number | null }
interface ClassRow { id: string; name: string; branch_id: string | null; students: number; absent: number; late: number; quiz_avg: number | null; submissions: number; violations: number; positives: number; hw_rate: number | null }
interface Data {
  from: string; to: string; gran: Gran; school_start: string; students: number; series: Point[];
  totals: Omit<Point, 'key'>; classes: ClassRow[];
  branches: Array<{ id: string; name: string; students: number; absent: number; quiz_avg: number | null; violations: number }>;
}
interface StudentRow { id: string; name: string; class_id: string | null; class_name: string | null; absent: number; late: number; quizzes: number; quiz_avg: number | null; violations: number; positives: number; hw_due: number; hw_done: number }

const sel = 'h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtD = (s: string, o: Intl.DateTimeFormatOptions) => new Date(`${s}T12:00:00`).toLocaleDateString(dateLocale(), o);
const per = (n: number, d: number, k = 1) => (d > 0 ? Math.round((n / d) * k * 10) / 10 : 0);

type MetricKey = 'quiz_avg' | 'absent_pp' | 'viol_p100' | 'hw_rate';
/** أيام الدراسة (الأحد–الخميس) بين تاريخين شاملين */
const schoolDays = (a: string, b: string) => { let n = 0; const d = new Date(`${a}T12:00:00`), e = new Date(`${b}T12:00:00`); while (d <= e) { if (d.getDay() < 5) n++; d.setDate(d.getDate() + 1); } return n; };
const addDays = (s: string, k: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + k); return iso(d); };
const METRICS: Array<{ k: MetricKey; label: string; unit: string; good: 'up' | 'down'; color: string }> = [
  { k: 'quiz_avg', label: 'معدل نتائج الاختبارات', unit: '%', good: 'up', color: 'rgb(var(--brand-600))' },
  { k: 'absent_pp', label: 'نسبة الغياب', unit: '%', good: 'down', color: '#e5484d' },
  { k: 'viol_p100', label: 'مخالفات لكل 100 طالب', unit: '', good: 'down', color: '#d97706' },
  { k: 'hw_rate', label: 'نسبة تسليم الواجبات', unit: '%', good: 'up', color: '#0d9488' },
];

/** لوحة مؤشرات المدرسة: من بداية الدراسة، باليوم/الأسبوع/الشهر، وكل رقم يفتح تفاصيله (058) */
export const IndicatorsPage: React.FC = () => {
  const { branches } = useApp();
  const [range, setRange] = useState<Range>('year');
  const [gran, setGran] = useState<Gran>('week');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: iso(new Date()) });
  const [branch, setBranch] = useState('');
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [modal, setModal] = useState<{ title: string; subtitle?: string; sections: KpiSection[] } | null>(null);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'name', dir: 1 });

  const window_ = useMemo(() => {
    const today = new Date();
    if (range === 'custom') return { from: custom.from || null, to: custom.to || null };
    if (range === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: null };
    if (range === '30' || range === '7') { const d = new Date(); d.setDate(d.getDate() - Number(range) + 1); return { from: iso(d), to: null }; }
    return { from: null, to: null }; // من بداية الدراسة
  }, [range, custom]);

  useEffect(() => {
    setData(undefined); setStudents(null);
    const args = { p_from: window_.from, p_to: window_.to, p_branch: branch || null };
    void safe<Data>(() => supabase.rpc('itqan_indicators', { ...args, p_gran: gran }) as any).then((r) => setData(r.ok ? r.data : null));
    void safe<StudentRow[]>(() => supabase.rpc('itqan_indicator_students', args) as any).then((r) => setStudents(r.ok ? r.data || [] : []));
  }, [window_, gran, branch]);

  const label = (k: string) => (gran === 'month' ? fmtD(k, { month: 'short', year: '2-digit' }) : gran === 'week' ? fmtD(k, { day: 'numeric', month: 'short' }) : fmtD(k, { weekday: 'short', day: 'numeric' }));
  // نسبة الغياب = أيام الغياب ÷ (الطلاب × أيام الدراسة في الفترة)؛ العرض اليومي بلا الجمعة والسبت
  const absRate = (absent: number, from: string, to: string) => { const sd = schoolDays(from, to); return data && data.students && sd ? Math.round((absent / (data.students * sd)) * 1000) / 10 : null; };
  const series = useMemo(() => {
    const raw = data?.series || [];
    return raw.map((p, i) => {
      const end = i < raw.length - 1 ? addDays(raw[i + 1].key, -1) : data!.to;
      const start = p.key < data!.from ? data!.from : p.key;
      return { key: p.key, label: label(p.key), quiz_avg: p.quiz_avg, absent_pp: absRate(p.absent, start, end), viol_p100: per(p.violations, data!.students, 100), hw_rate: p.hw_rate, raw: p, weekend: gran === 'day' && new Date(`${p.key}T12:00:00`).getDay() >= 5 };
    }).filter((p) => !p.weekend);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const classes = useMemo(() => {
    const sd = data ? schoolDays(data.from, data.to) : 0;
    const rows = (data?.classes || []).map((c) => ({ ...c, absent_pp: c.students && sd ? Math.round((c.absent / (c.students * sd)) * 1000) / 10 : 0, viol_p100: per(c.violations, c.students, 100) }));
    return rows.sort((a: any, b: any) => {
      const x = a[sort.k], y = b[sort.k];
      if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
      return typeof x === 'string' ? x.localeCompare(y, 'ar') * sort.dir : (x - y) * sort.dir;
    });
  }, [data, sort]);

  if (data === null) return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6" dir={uiDir()}>
      <PageHeader title={t('مؤشرات المدرسة')} />
      <Card className="mt-5"><EmptyMascot text={t('شغّل التحديث 058_indicators_detail.sql من Supabase Migrate لتفعيل اللوحة، أو ليس لديك صلاحية.')} /></Card>
    </div>
  );

  const periodText = data ? t('من {a} إلى {b}', { a: fmtD(data.from, { day: 'numeric', month: 'long' }), b: fmtD(data.to, { day: 'numeric', month: 'long', year: 'numeric' }) }) : '';
  const granWord = gran === 'day' ? t('اليوم السابق') : gran === 'week' ? t('الأسبوع السابق') : t('الشهر السابق');

  // ---------- جداول التفاصيل (وتُستخدم في التصدير) ----------
  const stuHeaders = [t('الطالب'), t('الفصل'), t('غياب'), t('تأخر'), t('اختبارات'), t('معدل الاختبارات'), t('مخالفات'), t('سلوك إيجابي'), t('واجبات مسلّمة')];
  const stuRow = (s: StudentRow) => [s.name, s.class_name || '—', s.absent, s.late, s.quizzes, s.quiz_avg === null ? '—' : `${s.quiz_avg}%`, s.violations, s.positives, s.hw_due ? `${s.hw_done}/${s.hw_due}` : '—'];
  const hwPct = (s: StudentRow) => (s.hw_due ? Math.round((s.hw_done / s.hw_due) * 100) : null);
  const studentSections = (k: MetricKey, list: StudentRow[]): KpiSection[] => {
    if (k === 'absent_pp') {
      const l = list.filter((s) => s.absent + s.late > 0).sort((a, b) => b.absent - a.absent || b.late - a.late);
      return [{ title: t('الطلاب حسب الغياب'), headers: stuHeaders, rows: l.map(stuRow), emptyText: t('لا غياب ولا تأخر في هذه الفترة') }];
    }
    if (k === 'viol_p100') {
      const l = list.filter((s) => s.violations + s.positives > 0).sort((a, b) => b.violations - a.violations);
      return [{ title: t('الطلاب حسب المخالفات'), headers: stuHeaders, rows: l.map(stuRow), emptyText: t('لا ملاحظات سلوكية في هذه الفترة') }];
    }
    if (k === 'hw_rate') {
      const l = list.filter((s) => s.hw_due > 0).sort((a, b) => (hwPct(a) ?? 0) - (hwPct(b) ?? 0));
      return [{ title: t('الطلاب حسب تسليم الواجبات (الأقل أولاً)'), headers: stuHeaders, rows: l.map(stuRow), emptyText: t('لا واجبات مطلوبة في هذه الفترة') }];
    }
    const done = list.filter((s) => s.quiz_avg !== null).sort((a, b) => (a.quiz_avg ?? 0) - (b.quiz_avg ?? 0));
    const none = list.filter((s) => s.quiz_avg === null);
    return [
      { title: t('الطلاب حسب معدل الاختبارات (الأقل أولاً)'), headers: stuHeaders, rows: done.map(stuRow), emptyText: t('لا اختبارات في هذه الفترة') },
      { title: t('لم يؤدوا أي اختبار في الفترة'), headers: [t('الطالب'), t('الفصل')], rows: none.map((s) => [s.name, s.class_name || '—']) },
    ];
  };
  const openMetric = (m: typeof METRICS[number]) => {
    if (!students) return;
    const trend: KpiSection = { title: t('حسب الفترة'), headers: [t('الفترة'), t(m.label)], rows: series.map((p) => [p.label, (p as any)[m.k] === null ? '—' : `${(p as any)[m.k]}${m.unit}`]) };
    setModal({ title: t(m.label), subtitle: periodText, sections: [...studentSections(m.k, students), trend] });
  };
  const openClass = (c: ClassRow) => {
    const list = (students || []).filter((s) => s.class_id === c.id).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    setModal({ title: c.name, subtitle: `${periodText} · ${t('{n} طالب', { n: c.students })}`, sections: [{ title: t('طلاب الفصل'), headers: stuHeaders, rows: list.map(stuRow) }] });
  };
  const openPoint = (p: (typeof series)[number]) => {
    const r = p.raw;
    setModal({ title: p.label, subtitle: periodText, sections: [{ title: t('أرقام الفترة'), headers: [t('المؤشر'), t('القيمة')], rows: [
      [t('أيام غياب'), r.absent], [t('حالات تأخر'), r.late], [t('تسليمات الاختبارات'), r.submissions], [t('معدل الاختبارات'), r.quiz_avg === null ? '—' : `${r.quiz_avg}%`],
      [t('مخالفات'), r.violations], [t('سلوك إيجابي'), r.positives], [t('تسليم الواجبات'), r.hw_rate === null ? '—' : `${r.hw_rate}%`]] }] });
  };

  const allSections = (): ExportSection[] => [
    { title: t('المؤشرات حسب الفترة'), headers: [t('الفترة'), ...METRICS.map((m) => t(m.label)), t('تسليمات الاختبارات'), t('أيام غياب'), t('حالات تأخر'), t('مخالفات'), t('سلوك إيجابي')],
      rows: series.map((p) => [p.label, p.quiz_avg ?? '—', p.absent_pp, p.viol_p100, p.hw_rate ?? '—', p.raw.submissions, p.raw.absent, p.raw.late, p.raw.violations, p.raw.positives]) },
    { title: t('مقارنة الفصول'), headers: [t('الفصل'), t('الطلاب'), t('معدل الاختبارات'), t('نسبة الغياب'), t('مخالفات/100'), t('تسليم الواجبات'), t('تسليمات الاختبارات')],
      rows: classes.map((c) => [c.name, c.students, c.quiz_avg ?? '—', c.absent_pp, c.viol_p100, c.hw_rate ?? '—', c.submissions]) },
    ...(data && data.branches.length > 1 ? [{ title: t('مقارنة الفروع'), headers: [t('الفرع'), t('الطلاب'), t('معدل الاختبارات'), t('أيام غياب'), t('مخالفات/100')],
      rows: data.branches.map((b) => [b.name, b.students, b.quiz_avg ?? '—', b.absent, per(b.violations, b.students, 100)]) }] : []),
    { title: t('الطلاب'), headers: stuHeaders, rows: (students || []).map(stuRow) },
  ];

  const cur = series[series.length - 1], prev = series[series.length - 2];
  const totals = data ? { quiz_avg: data.totals.quiz_avg, absent_pp: absRate(data.totals.absent, data.from, data.to), viol_p100: per(data.totals.violations, data.students, 100), hw_rate: data.totals.hw_rate } : null;
  const range_ = (k: MetricKey) => {
    const vals = classes.map((c: any) => c[k]).filter((v: any) => v !== null && v !== undefined) as number[];
    return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  };
  const heat = (k: MetricKey, v: number | null) => {
    const r = range_(k); const m = METRICS.find((x) => x.k === k)!;
    if (v === null || !r || r.max === r.min) return '';
    const bad = m.good === 'up' ? (r.max - v) / (r.max - r.min) : (v - r.min) / (r.max - r.min);
    return bad > 0.75 ? 'bg-rose-100 dark:bg-rose-950/50' : bad > 0.5 ? 'bg-amber-50 dark:bg-amber-950/30' : '';
  };
  const th = (k: string, lbl: string) => (
    <th className="px-3 py-2.5 text-start font-semibold whitespace-nowrap">
      <button type="button" onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : 1 })} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white" aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        {lbl}<ArrowUpDown className="w-3 h-3 opacity-50" />
      </button>
    </th>
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()} data-testid="indicators">
      <PageHeader title={<span className="inline-flex items-center gap-2"><Gauge className="w-7 h-7 text-indigo-600" />{t('مؤشرات المدرسة')}</span>}
        subtitle={t('من بداية الدراسة: الغياب والدرجات والسلوك والواجبات، ومقارنة الفصول والفروع. اضغط أي رقم لتفاصيله.')}
        actions={data ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => void exportSectionsXlsx(t('مؤشرات المدرسة'), allSections())} className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"><FileSpreadsheet className="w-4 h-4 text-emerald-600" />Excel</button>
            <button type="button" onClick={() => void exportSectionsPdf(t('مؤشرات المدرسة'), periodText, allSections().slice(0, -1))} className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"><FileDown className="w-4 h-4 text-rose-600" />PDF</button>
          </div>
        ) : undefined} />

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <select value={range} onChange={(e) => setRange(e.target.value as Range)} className={sel} aria-label={t('الفترة')}>
          <option value="year">{t('من بداية الدراسة')}</option><option value="month">{t('هذا الشهر')}</option>
          <option value="30">{t('آخر 30 يوماً')}</option><option value="7">{t('آخر 7 أيام')}</option><option value="custom">{t('فترة مخصصة')}</option>
        </select>
        {range === 'custom' && (<>
          <input type="date" value={custom.from} min={data?.school_start} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={sel} aria-label={t('من')} />
          <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={sel} aria-label={t('إلى')} />
        </>)}
        <div role="radiogroup" aria-label={t('التجميع')} className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          {(['day', 'week', 'month'] as Gran[]).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={gran === g} onClick={() => setGran(g)}
              className={`h-8 px-3 rounded-lg text-sm font-bold ${gran === g ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
              {g === 'day' ? t('يومي') : g === 'week' ? t('أسبوعي') : t('شهري')}
            </button>
          ))}
        </div>
        {branches.length > 1 && (
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={sel} aria-label={t('الفرع')}>
            <option value="">{t('كل الفروع')}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {data && <span className="text-xs text-slate-500 ms-auto">{periodText} · {t('{n} طالب', { n: data.students })}</span>}
      </Card>

      {data === undefined ? <PageLoader view="indicators" /> : (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {METRICS.map((m) => {
            const v = totals?.[m.k] ?? null;
            const a = cur?.[m.k] ?? null, b = prev?.[m.k] ?? null;
            const d = a !== null && b !== null ? Math.round((Number(a) - Number(b)) * 10) / 10 : null;
            const better = d === null || d === 0 ? null : (d > 0) === (m.good === 'up');
            const Icon = d === null || d === 0 ? Minus : d > 0 ? TrendingUp : TrendingDown;
            return (
              <button key={m.k} type="button" onClick={() => openMetric(m)} disabled={!students} data-testid={`kpi-${m.k}`}
                className="text-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition group">
                <div className="text-xs text-slate-500 flex items-center gap-1">{t(m.label)}<ChevronLeft className="w-3.5 h-3.5 ms-auto opacity-0 group-hover:opacity-100 rtl:rotate-0 ltr:rotate-180" /></div>
                <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1"><bdi dir="ltr">{v === null ? '—' : `${v}${m.unit}`}</bdi></div>
                <div className={`text-xs mt-1 inline-flex items-center gap-1 ${better === null ? 'text-slate-500' : better ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {d === null ? t('لا مقارنة') : t('{d} آخر فترة عن {p}', { d: `${d > 0 ? '+' : ''}${d}${m.unit}`, p: granWord })}
                  {better !== null && <span className="sr-only">{better ? t('تحسّن') : t('تراجع')}</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {METRICS.map((m) => (
            <Card key={m.k} className="p-4">
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">{t(m.label)}</h2>
                <span className="text-[11px] text-slate-500">{t('اضغط نقطة لتفاصيلها')}</span>
              </div>
              <div className="h-44" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    onClick={(e: any) => { const p = e?.activePayload?.[0]?.payload; if (p) openPoint(p); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} reversed={uiDir() === 'rtl'} minTickGap={16} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} orientation={uiDir() === 'rtl' ? 'right' : 'left'} domain={m.unit === '%' && m.k !== 'absent_pp' ? [0, 100] : [0, 'auto']} allowDecimals />
                    <Tooltip formatter={(v: any) => [v === null || v === undefined ? '—' : `${v}${m.unit}`, t(m.label)]} labelFormatter={(l: any) => l} contentStyle={{ borderRadius: 12, fontSize: 12 }} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
                    <Line type="monotone" dataKey={m.k} stroke={m.color} strokeWidth={2} dot={series.length <= 40 ? { r: 3.5, strokeWidth: 2, fill: '#fff' } : false} activeDot={{ r: 6, cursor: 'pointer' }} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="p-4 pb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('مقارنة الفصول')}</h2>
            <span className="text-xs text-slate-500">{t('خلال الفترة. الخلايا المظللة: الأضعف بين الفصول. اضغط فصلاً لعرض طلابه.')}</span>
          </div>
          {!classes.length ? <EmptyMascot text={t('لا توجد فصول بطلاب في هذا النطاق')} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs">
                  <tr>{th('name', t('الفصل'))}{th('students', t('الطلاب'))}{th('quiz_avg', t('معدل الاختبارات'))}{th('absent_pp', t('نسبة الغياب'))}{th('viol_p100', t('مخالفات/100'))}{th('hw_rate', t('تسليم الواجبات'))}{th('submissions', t('تسليمات الاختبارات'))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {classes.map((c) => (
                    <tr key={c.id} onClick={() => openClass(c)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" data-testid="ind-class-row">
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{c.name}{c.branch_id && branches.length > 1 ? <span className="text-xs font-normal text-slate-500"> · {branches.find((b) => b.id === c.branch_id)?.name}</span> : null}</td>
                      <td className="px-3 py-2 tabular-nums">{c.students}</td>
                      <td className={`px-3 py-2 tabular-nums ${heat('quiz_avg', c.quiz_avg)}`}>{c.quiz_avg === null ? '—' : `${c.quiz_avg}%`}</td>
                      <td className={`px-3 py-2 tabular-nums ${heat('absent_pp', c.absent_pp)}`}>{c.absent_pp}%</td>
                      <td className={`px-3 py-2 tabular-nums ${heat('viol_p100', c.viol_p100)}`}>{c.viol_p100}</td>
                      <td className={`px-3 py-2 tabular-nums ${heat('hw_rate', c.hw_rate)}`}>{c.hw_rate === null ? '—' : `${c.hw_rate}%`}</td>
                      <td className="px-3 py-2 tabular-nums">{c.submissions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {data.branches.length > 1 && (
          <Card className="p-4 space-y-2">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('مقارنة الفروع')}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.branches.map((b) => (
                <button key={b.id} type="button" onClick={() => setBranch(b.id)} className="text-start rounded-xl border border-slate-200 dark:border-slate-700 p-3 hover:border-indigo-300">
                  <div className="font-bold text-slate-900 dark:text-white">{b.name} <span className="text-xs font-normal text-slate-500">· {t('{n} طالب', { n: b.students })}</span></div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-[11px] text-slate-500">{t('معدل الاختبارات')}</dt><dd className="font-extrabold tabular-nums">{b.quiz_avg === null ? '—' : `${b.quiz_avg}%`}</dd></div>
                    <div><dt className="text-[11px] text-slate-500">{t('نسبة الغياب')}</dt><dd className="font-extrabold tabular-nums">{b.students && data ? `${Math.round((b.absent / (b.students * Math.max(1, schoolDays(data.from, data.to)))) * 1000) / 10}%` : '—'}</dd></div>
                    <div><dt className="text-[11px] text-slate-500">{t('مخالفات/100')}</dt><dd className="font-extrabold tabular-nums">{per(b.violations, b.students, 100)}</dd></div>
                  </dl>
                </button>
              ))}
            </div>
          </Card>
        )}
      </>)}
      {modal && <KpiDetailModal title={modal.title} subtitle={modal.subtitle} sections={modal.sections} onClose={() => setModal(null)} />}
    </div>
  );
};
