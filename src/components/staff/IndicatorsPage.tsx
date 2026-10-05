import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, TrendingUp, TrendingDown, Minus, ArrowUpDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../services/supabase';
import { safe } from '../../services/remote';
import { PageHeader, Card } from '../common/ui';
import { EmptyMascot, PageLoader } from '../common/Mascot';
import { t, uiDir, dateLocale } from '../../i18n';

interface Month { month: string; absent: number; late: number; submissions: number; quiz_avg: number | null; violations: number; positives: number; hw_rate: number | null }
interface ClassRow { id: string; name: string; branch_id: string | null; students: number; absent: number; late: number; quiz_avg: number | null; submissions: number; violations: number; positives: number; hw_rate: number | null }
interface Data { from: string; to: string; months_count: number; students: number; months: Month[]; classes: ClassRow[]; branches: Array<{ id: string; name: string; students: number; absent: number; quiz_avg: number | null; violations: number }> }

const sel = 'h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(dateLocale(), { month: 'short' });
const per = (n: number, d: number, k = 1) => (d > 0 ? Math.round((n / d) * k * 10) / 10 : 0);

type MetricKey = 'absent_pp' | 'quiz_avg' | 'viol_p100' | 'hw_rate';
/** good = الاتجاه الأفضل (لتلوين التغير) */
const METRICS: Array<{ k: MetricKey; label: string; unit: string; good: 'up' | 'down'; color: string }> = [
  { k: 'quiz_avg', label: 'معدل نتائج الاختبارات', unit: '%', good: 'up', color: 'rgb(var(--brand-600))' },
  { k: 'absent_pp', label: 'أيام الغياب لكل طالب', unit: '', good: 'down', color: '#e5484d' },
  { k: 'viol_p100', label: 'مخالفات لكل 100 طالب', unit: '', good: 'down', color: '#d97706' },
  { k: 'hw_rate', label: 'نسبة تسليم الواجبات', unit: '%', good: 'up', color: '#0d9488' },
];

/** لوحة مؤشرات المدرسة: اتجاه الغياب والدرجات والسلوك والواجبات شهراً بشهر، ومقارنة الفصول والفروع (057) */
export const IndicatorsPage: React.FC = () => {
  const { branches } = useApp();
  const [months, setMonths] = useState(6);
  const [branch, setBranch] = useState('');
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [sort, setSort] = useState<{ k: keyof ClassRow | 'absent_pp' | 'viol_p100'; dir: 1 | -1 }>({ k: 'quiz_avg', dir: 1 });
  useEffect(() => {
    setData(undefined);
    void safe<Data>(() => supabase.rpc('itqan_school_indicators', { p_months: months, p_branch: branch || null }) as any).then((r) => setData(r.ok ? r.data : null));
  }, [months, branch]);

  const series = useMemo(() => (data?.months || []).map((m) => ({
    label: monthLabel(m.month), month: m.month,
    quiz_avg: m.quiz_avg, absent_pp: per(m.absent, data!.students), viol_p100: per(m.violations, data!.students, 100), hw_rate: m.hw_rate,
  })), [data]);

  const classes = useMemo(() => {
    const rows = (data?.classes || []).map((c) => ({ ...c, absent_pp: per(c.absent, c.students), viol_p100: per(c.violations, c.students, 100) }));
    return rows.sort((a: any, b: any) => {
      const x = a[sort.k], y = b[sort.k];
      if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
      return typeof x === 'string' ? x.localeCompare(y, 'ar') * sort.dir : (x - y) * sort.dir;
    });
  }, [data, sort]);

  if (data === null) return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6" dir={uiDir()}>
      <PageHeader title={t('مؤشرات المدرسة')} />
      <Card className="mt-5"><EmptyMascot text={t('شغّل التحديث 057_school_indicators.sql من Supabase Migrate لتفعيل اللوحة، أو ليس لديك صلاحية.')} /></Card>
    </div>
  );

  // الشهر الحالي مقابل السابق
  const cur = series[series.length - 1], prev = series[series.length - 2];
  const range = (k: MetricKey) => {
    const vals = classes.map((c: any) => c[k]).filter((v: any) => v !== null && v !== undefined) as number[];
    return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  };
  /** تظليل الخلية: الأسوأ أغمق (لا يعتمد على اللون وحده: القيمة مكتوبة) */
  const heat = (k: MetricKey, v: number | null) => {
    const r = range(k); const m = METRICS.find((x) => x.k === k)!;
    if (v === null || !r || r.max === r.min) return '';
    const bad = m.good === 'up' ? (r.max - v) / (r.max - r.min) : (v - r.min) / (r.max - r.min);
    return bad > 0.75 ? 'bg-rose-100 dark:bg-rose-950/50' : bad > 0.5 ? 'bg-amber-50 dark:bg-amber-950/30' : '';
  };
  const th = (k: any, label: string) => (
    <th className="px-3 py-2.5 text-start font-semibold whitespace-nowrap">
      <button type="button" onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : 1 })} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white" aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        {label}<ArrowUpDown className="w-3 h-3 opacity-50" />
      </button>
    </th>
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()} data-testid="indicators">
      <PageHeader title={<span className="inline-flex items-center gap-2"><Gauge className="w-7 h-7 text-indigo-600" />{t('مؤشرات المدرسة')}</span>}
        subtitle={t('اتجاه الغياب والدرجات والسلوك والواجبات شهراً بشهر، ومقارنة الفصول والفروع')} />
      <div className="flex flex-wrap gap-2">
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={sel} aria-label={t('الفترة')}>
          {[3, 6, 12].map((n) => <option key={n} value={n}>{t('آخر {n} أشهر', { n })}</option>)}
        </select>
        {branches.length > 1 && (
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={sel} aria-label={t('الفرع')}>
            <option value="">{t('كل الفروع')}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {data && <span className="self-center text-xs text-slate-500">{t('{n} طالب', { n: data.students })}</span>}
      </div>

      {data === undefined ? <PageLoader view="indicators" /> : (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {METRICS.map((m) => {
            const v = cur?.[m.k] ?? null, p = prev?.[m.k] ?? null;
            const d = v !== null && p !== null ? Math.round((Number(v) - Number(p)) * 10) / 10 : null;
            const better = d === null || d === 0 ? null : (d > 0) === (m.good === 'up');
            const Icon = d === null || d === 0 ? Minus : d > 0 ? TrendingUp : TrendingDown;
            return (
              <Card key={m.k} className="p-4">
                <div className="text-xs text-slate-500">{t(m.label)}</div>
                <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1"><bdi dir="ltr">{v === null ? '—' : `${v}${m.unit}`}</bdi></div>
                <div className={`text-xs mt-1 inline-flex items-center gap-1 ${better === null ? 'text-slate-500' : better ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {d === null ? t('لا مقارنة') : t('{d} عن الشهر السابق', { d: `${d > 0 ? '+' : ''}${d}${m.unit}` })}
                  {better !== null && <span className="sr-only">{better ? t('تحسّن') : t('تراجع')}</span>}
                </div>
              </Card>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-500 -mt-2">{t('الشهر الحالي لم يكتمل بعد، فقارن أرقامه بالشهر السابق بحذر.')}</p>
        <div className="grid md:grid-cols-2 gap-4">
          {METRICS.map((m) => (
            <Card key={m.k} className="p-4">
              <h2 className="font-bold text-sm text-slate-900 dark:text-white mb-2">{t(m.label)}</h2>
              <div className="h-44" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} reversed={uiDir() === 'rtl'} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} orientation={uiDir() === 'rtl' ? 'right' : 'left'} domain={m.unit === '%' ? [0, 100] : [0, 'auto']} />
                    <Tooltip formatter={(v: any) => [v === null ? '—' : `${v}${m.unit}`, t(m.label)]} labelFormatter={(l: any) => l} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey={m.k} stroke={m.color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="p-4 pb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('مقارنة الفصول')}</h2>
            <span className="text-xs text-slate-500">{t('خلال الفترة كاملة. الخلايا المظللة: الأضعف بين الفصول.')}</span>
          </div>
          {!classes.length ? <EmptyMascot text={t('لا توجد فصول بطلاب في هذا النطاق')} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs">
                  <tr>{th('name', t('الفصل'))}{th('students', t('الطلاب'))}{th('quiz_avg', t('معدل الاختبارات'))}{th('absent_pp', t('غياب/طالب'))}{th('viol_p100', t('مخالفات/100'))}{th('hw_rate', t('تسليم الواجبات'))}{th('submissions', t('تسليمات الاختبارات'))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {classes.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{c.name}{c.branch_id && branches.length > 1 ? <span className="text-xs font-normal text-slate-500"> · {branches.find((b) => b.id === c.branch_id)?.name}</span> : null}</td>
                      <td className="px-3 py-2 tabular-nums">{c.students}</td>
                      <td className={`px-3 py-2 tabular-nums ${heat('quiz_avg', c.quiz_avg)}`}>{c.quiz_avg === null ? '—' : `${c.quiz_avg}%`}</td>
                      <td className={`px-3 py-2 tabular-nums ${heat('absent_pp', c.absent_pp)}`}>{c.absent_pp}</td>
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
                <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="font-bold text-slate-900 dark:text-white">{b.name} <span className="text-xs font-normal text-slate-500">· {t('{n} طالب', { n: b.students })}</span></div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-[11px] text-slate-500">{t('معدل الاختبارات')}</dt><dd className="font-extrabold tabular-nums">{b.quiz_avg === null ? '—' : `${b.quiz_avg}%`}</dd></div>
                    <div><dt className="text-[11px] text-slate-500">{t('غياب/طالب')}</dt><dd className="font-extrabold tabular-nums">{per(b.absent, b.students)}</dd></div>
                    <div><dt className="text-[11px] text-slate-500">{t('مخالفات/100')}</dt><dd className="font-extrabold tabular-nums">{per(b.violations, b.students, 100)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </Card>
        )}
      </>)}
    </div>
  );
};
