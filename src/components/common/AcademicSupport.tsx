import React, { useEffect, useMemo, useState } from 'react';
import { HeartHandshake, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AcsProgress, AcsRecord, RATINGS, fetchProgress, fetchSupport, gain } from '../../services/academicSupportService';
import { schoolStart, weekLabel } from '../../utils/schoolWeek';
import { Chip } from './ui';
import { t, dateLocale } from '../../i18n';

/** لونا الرسم (تحقق الوضوح وعمى الألوان في index.css): عند الاستلام، والآن */
const C_START = 'var(--acs-start)';
const C_NOW = 'var(--acs-now)';
export const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

/** سهم التغير مع النص (لا يعتمد على اللون وحده) */
export const Change: React.FC<{ v: number; className?: string }> = ({ v, className = '' }) => {
  const Icon = v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus;
  const cls = v > 0 ? 'text-emerald-700 dark:text-emerald-400' : v < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500';
  return <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${cls} ${className}`}><Icon className="w-4 h-4" aria-hidden="true" /><span dir="ltr">{v > 0 ? `+${v}` : v}</span></span>;
};

export const ChartLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C_START }} />{t('عند الاستلام')}</span>
    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C_NOW }} />{t('الآن')}</span>
    <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-slate-500" />{t('الهدف')}</span>
  </div>
);

/**
 * رسم «قبل/بعد» لكل طالب: نقطة مستوى الاستلام ونقطة المستوى الآن على مقياس 0–100٪ مع علامة الهدف.
 * الشكل المناسب للمقارنة بين قيمتين لكل عنصر (dumbbell).
 */
export const DumbbellChart: React.FC<{ rows: Array<{ id: string; name: string; start: number; now: number; target: number }>; onPick?: (id: string) => void }> = ({ rows, onPick }) => {
  const [hover, setHover] = useState<string | null>(null);
  if (!rows.length) return null;
  return (
    <div className="space-y-1" role="img" aria-label={t('مستوى كل طالب عند الاستلام والآن')}>
      <div className="flex items-center gap-3 text-[11px] text-slate-500 tabular-nums">
        <span className="w-36 shrink-0" />
        <div className="relative flex-1 h-4">{[0, 25, 50, 75, 100].map((v) => <span key={v} className="absolute -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${v}%` }}>{v}%</span>)}</div>
        <span className="w-14 shrink-0" />
      </div>
      {rows.map((r) => {
        const lo = Math.min(r.start, r.now), hi = Math.max(r.start, r.now), d = r.now - r.start;
        return (
          <button key={r.id} type="button" onClick={() => onPick?.(r.id)} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.id)} onBlur={() => setHover(null)}
            className={`w-full flex items-center gap-3 py-1.5 rounded-lg text-start ${hover === r.id ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`} data-testid="acs-row">
            <span className="w-36 shrink-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.name}</span>
            <div className="relative flex-1 h-6">
              {/* شبكة خفيفة */}
              {[25, 50, 75].map((v) => <span key={v} className="absolute inset-y-0 w-px bg-slate-100 dark:bg-slate-800" style={{ insetInlineStart: `${v}%` }} />)}
              <span className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded bg-slate-300 dark:bg-slate-600" style={{ insetInlineStart: `${lo}%`, width: `${hi - lo}%` }} />
              <span className="absolute top-0.5 bottom-0.5 w-0.5 bg-slate-500" style={{ insetInlineStart: `${r.target}%` }} title={t('الهدف')} />
              <span className="absolute top-1/2 w-3 h-3 -mt-1.5 -ms-1.5 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ insetInlineStart: `${r.start}%`, background: C_START }} />
              <span className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ms-[7px] rounded-full ring-2 ring-white dark:ring-slate-900" style={{ insetInlineStart: `${r.now}%`, background: C_NOW }} />
              {hover === r.id && (
                <span className="absolute z-10 bottom-full mb-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs whitespace-nowrap shadow-lg" style={{ insetInlineStart: `${Math.min(hi, 70)}%` }}>
                  {t('عند الاستلام {a}% ← الآن {b}% · الهدف {c}%', { a: r.start, b: r.now, c: r.target })}
                </span>
              )}
            </div>
            <span className="w-14 shrink-0 text-end text-sm"><Change v={d} /></span>
          </button>
        );
      })}
    </div>
  );
};

/** تطور مستوى طالب عبر الزمن: خط القياسات من مستوى الاستلام، مع خط الهدف */
export const ProgressLine: React.FC<{ rec: AcsRecord; points: AcsProgress[]; height?: number }> = ({ rec, points, height = 180 }) => {
  const [hi, setHi] = useState<number | null>(null);
  // القياسات فقط (الملاحظات بلا مستوى لا تُرسم)
  const series = useMemo(() => [{ at: rec.started_at, level: rec.start_level, note: t('عند الاستلام') }, ...points.filter((p) => p.level != null).map((p) => ({ at: p.at, level: p.level as number, note: p.note }))]
    .sort((a, b) => a.at.localeCompare(b.at)), [rec, points]);
  const W = 560, H = height, L = 42, R = 12, T = 14, B = 26;
  const ts = series.map((p) => new Date(`${p.at}T12:00:00`).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts, t0 + 864e5);
  const x = (tm: number) => L + ((tm - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    ts.forEach((tm, i) => { if (Math.abs(x(tm) - px) < Math.abs(x(ts[best]) - px)) best = i; });
    setHi(best);
  };
  const h = hi != null ? series[hi] : null;
  return (
    <div className="relative max-w-2xl" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('تطور المستوى عبر القياسات')} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-slate-100 dark:stroke-slate-800" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{v}%</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(rec.target_level)} y2={y(rec.target_level)} className="stroke-slate-500" strokeDasharray="4 4" />
        <text x={W - R} y={y(rec.target_level) - 4} textAnchor="end" className="fill-slate-500 text-[10px]">{t('الهدف')} {rec.target_level}%</text>
        <path d={path} fill="none" stroke={C_NOW} strokeWidth={2} strokeLinejoin="round" />
        {series.map((p, i) => { const st = p.at === rec.started_at && p.level === rec.start_level && p.note === t('عند الاستلام'); return <circle key={i} cx={x(ts[i])} cy={y(p.level)} r={st ? 4.5 : 4} fill={st ? C_START : C_NOW} className="stroke-white dark:stroke-slate-900" strokeWidth={2} />; })}
        {hi != null && <line x1={x(ts[hi])} x2={x(ts[hi])} y1={T} y2={H - B} className="stroke-slate-400" strokeDasharray="2 3" />}
        <text x={L} y={H - 6} className="fill-slate-400 text-[10px]">{fmtDate(series[0].at)}</text>
        {series.length > 1 && <text x={W - R} y={H - 6} textAnchor="end" className="fill-slate-400 text-[10px]">{fmtDate(series[series.length - 1].at)}</text>}
      </svg>
      {h && (
        <div className="absolute top-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs shadow-lg pointer-events-none max-w-[14rem]" style={{ left: `${Math.min(70, (x(ts[hi!]) / W) * 100)}%` }} dir="rtl">
          <b className="tabular-nums">{h.level}%</b> · {fmtDate(h.at)}{h.note ? <div className="opacity-80 truncate">{h.note}</div> : null}
        </div>
      )}
    </div>
  );
};

/** شارة التقييم */
export const RatingChip: React.FC<{ r: AcsProgress['rating'] }> = ({ r }) => {
  const x = RATINGS.find((y) => y.k === r);
  return x ? <Chip tone={x.tone}>{t(x.label)}</Chip> : null;
};

/** سطر قياس أو ملاحظة: «الأسبوع 3 · الأحد 5 أكتوبر» + المستوى/التقييم + النص */
export const EntryLine: React.FC<{ p: AcsProgress; start: string | null; action?: React.ReactNode }> = ({ p, start, action }) => (
  <li className="flex items-start gap-3 py-2.5" data-testid="acs-entry">
    <div className="w-14 shrink-0 pt-0.5">{p.level != null ? <b className="tabular-nums text-slate-900 dark:text-white">{p.level}%</b> : <span className="text-xs text-slate-400">{t('ملاحظة')}</span>}</div>
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{weekLabel(p.at, start)}</span><RatingChip r={p.rating} /></div>
      {p.note && <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{p.note}</p>}
    </div>
    {action}
  </li>
);

/** بطاقة الدعم الأكاديمي (للطالب ولولي أمره): استلمه المعلم بمستوى كذا، ومستواه الآن كذا */
export const AcademicSupportCard: React.FC<{ studentId: string; className?: string }> = ({ studentId, className = '' }) => {
  const { subjects } = useApp();
  const [rows, setRows] = useState<AcsRecord[]>([]);
  const [prog, setProg] = useState<AcsProgress[]>([]);
  const [start, setStart] = useState<string | null>(null);
  useEffect(() => { void schoolStart().then(setStart); }, []);
  useEffect(() => {
    void fetchSupport([studentId]).then(async (r) => {
      const list = r.rows.filter((x) => x.status === 'active' || (x.closed_at && Date.now() - new Date(x.closed_at).getTime() < 60 * 864e5));
      setRows(list); setProg(await fetchProgress(list.map((x) => x.id)));
    });
  }, [studentId]);
  if (!rows.length) return null;
  return (
    <section className={`rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4 ${className}`} data-testid="acs-card">
      <h2 className="font-cairo font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><HeartHandshake className="w-5 h-5 text-indigo-600" />{t('الدعم الأكاديمي')}</h2>
      {rows.map((a) => {
        const all = prog.filter((p) => p.support_id === a.id);
        const pts = all.filter((p) => p.level != null);
        const recent = [...all].reverse().slice(0, 3);
        const subject = subjects.find((s) => s.id === a.subject_id)?.name;
        return (
          <div key={a.id} className="space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-7">
              {t('استلمه {teacher} بمستوى', { teacher: a.teacher_name || t('المعلم') })} <b className="tabular-nums" style={{ color: C_START }}>{a.start_level}%</b>
              {subject ? ` ${t('في {s}', { s: subject })}` : ''}، {t('ومستواه الآن')} <b className="tabular-nums" style={{ color: C_NOW }}>{a.current_level}%</b> <Change v={gain(a)} className="text-xs" />
            </p>
            <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
              <div className="absolute inset-y-0 rounded-full" style={{ insetInlineStart: 0, width: `${Math.max(2, a.current_level)}%`, background: C_NOW }} />
              <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-500" style={{ insetInlineStart: `${a.target_level}%` }} />
              <div className="absolute top-1/2 w-2.5 h-2.5 -mt-[5px] -ms-[5px] rounded-full ring-2 ring-white dark:ring-slate-900" style={{ insetInlineStart: `${a.start_level}%`, background: C_START }} />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>{t('الهدف {n}%', { n: a.target_level })}</span>
              <span>{a.status === 'done' ? t('أنهى البرنامج') : pts.length ? t('آخر قياس {d}', { d: fmtDate(pts[pts.length - 1].at) }) : t('منذ {d}', { d: fmtDate(a.started_at) })}</span>
            </div>
            {pts.length > 0 && <ProgressLine rec={a} points={pts} height={140} />}
            {recent.length > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 pt-2.5">{t('ملاحظات المعلم')}</h3>
                <ul className="divide-y divide-slate-200/70 dark:divide-slate-700">{recent.map((p) => <EntryLine key={p.id} p={p} start={start} />)}</ul>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};
