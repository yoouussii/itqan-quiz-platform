import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CalendarDays, CheckCircle2, Clock, FileDown, Users, X } from 'lucide-react';
import { Card, Button, Chip } from '../common/ui';
import type { RecordChange, RecordSheet } from '../../services/classRecordsService';
import { FollowSheet, RecordMeta, ToolMode, applyDue, parseFollowup, recordMeta, toolKey, toolStats } from '../../utils/classRecords';
import { t, dateLocale, isEn } from '../../i18n';
import { EmptyMascot } from '../common/Mascot';
import { KpiDetailModal } from '../common/KpiDetailModal';
import type { KpiSection } from '../../utils/kpiSections';

// ---------------------------------------------------------------------
// أدوات مشتركة: التاريخ باليوم، ومدة منذ التعديل، وحداثة السجل
// ---------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtDay = (iso: string | Date) => new Date(iso).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
export const fmtFull = (iso: string | null) => (iso ? `${fmtDay(iso)} · ${fmtTime(iso)}` : '—');
const weekdayName = (d: Date, long = true) => d.toLocaleDateString(dateLocale(), { weekday: long ? 'long' : 'short' });

/** عدد الأيام (التقويمية) منذ التاريخ */
export const daysSince = (iso: string) => {
  const a = new Date(iso), b = new Date();
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 864e5);
};
export const sinceText = (iso: string) => {
  const d = daysSince(iso);
  if (isEn()) return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  return d <= 0 ? 'اليوم' : d === 1 ? 'أمس' : d === 2 ? 'منذ يومين' : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يوماً`;
};

/** حداثة آخر تعديل: ≤ 3 أيام جيد، ≤ 10 تنبيه، أقدم متأخر — مع أيقونة ونص (لا لون فقط) */
export const Freshness: React.FC<{ at: string | null }> = ({ at }) => {
  if (!at) return <Chip tone="muted">—</Chip>;
  const d = daysSince(at);
  const tone = d <= 3 ? 'ok' : d <= 10 ? 'warn' : 'bad';
  const Icon = d <= 3 ? CheckCircle2 : d <= 10 ? Clock : AlertTriangle;
  return <Chip tone={tone}><Icon className="w-3.5 h-3.5" />{sinceText(at)}</Chip>;
};

// ---------------------------------------------------------------------
// السجلات بعد التحليل: مادة وصف كل ورقة ونسبة الرصد
// ---------------------------------------------------------------------
export interface RecItem { r: RecordSheet; p: FollowSheet; meta: RecordMeta; done: number }
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export interface ToolInfo { key: string; records: number; filledPct: number; mode: 'auto' | ToolMode; due: boolean }

/** تحليل السجلات مع استبعاد أدوات التقويم التي لم يحن وقتها من نسبة الرصد.
 *  تلقائياً: الأداة الفارغة في كل سجلات المدرسة = لم يحن وقتها؛ ويمكن تثبيت أي أداة من الإعداد. */
export function buildItems(rows: RecordSheet[], overrides: Record<string, ToolMode> = {}): { items: RecItem[]; tools: ToolInfo[] } {
  const raw: Array<{ r: RecordSheet; p: FollowSheet }> = [];
  for (const r of rows) {
    if (r.kind !== 'followup') continue;
    const p = parseFollowup(r.grid);
    if (p && p.students.length) raw.push({ r, p });
  }
  const stats = toolStats(raw.map((x) => x.p));
  const tools: ToolInfo[] = [...stats.entries()].map(([key, g]) => {
    const mode = (overrides[key] ?? 'auto') as 'auto' | ToolMode;
    return { key, records: g.records, filledPct: pct(g.filled, g.cells), mode, due: mode === 'auto' ? g.filled > 0 : mode === 'due' };
  }).sort((a, b) => b.records - a.records || a.key.localeCompare(b.key, 'ar'));
  const due = new Map(tools.map((x) => [x.key, x.due]));
  const items = raw.map(({ r, p: p0 }) => {
    const p = applyDue(p0, (k) => due.get(k) ?? true);
    return { r, p, meta: recordMeta(r.sheet_name, p.title), done: pct(p.filled, p.cells) };
  });
  return { items, tools };
}

/** اسم قصير للسجل على سطرين: المادة ثم الفصل */
export const sheetShort = (sheet: string, m: RecordMeta) => {
  if (!m.classLabel) return sheet;
  const w = m.subject.split(/\s+/);
  const sub = ['اللغة', 'الدراسات'].includes(w[0]) && w[1] ? w[1] : w[0];
  return `${sub}\n${m.classLabel}`;
};
const ORDER = (m: RecordMeta) => (m.grade ?? 9) * 10 + (m.track === 'عام' ? 1 : m.track === 'تحفيظ' ? 2 : 3);
const cellsText = (c: RecordChange) => c.initial ? t('{n} خلية مرصودة', { n: c.cells_filled })
  : [c.cells_filled && t('رصد {n} جديدة', { n: c.cells_filled }), c.cells_changed && t('عدّل {n}', { n: c.cells_changed }), c.cells_cleared && t('مسح {n}', { n: c.cells_cleared })].filter(Boolean).join(' · ');

// ---------------------------------------------------------------------
// رسم أعمدة رأسية (سلسلة واحدة) بعرض الحاوية، مع تلميح وتحديد
// ---------------------------------------------------------------------
interface VBar { key: string; short: string; title: string; value: number; sub?: string }
const useWidth = (min = 280) => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(min, Math.round(el.clientWidth))));
    ro.observe(el); return () => ro.disconnect();
  }, [min]);
  return [ref, w] as const;
};
const topRounded = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

export const VBarChart: React.FC<{
  data: VBar[]; label: string; selected?: string; onSelect?: (k: string) => void; height?: number; allLabels?: boolean;
  /** نص القيمة في التلميح (الافتراضي: عدد التعديلات) */ fmt?: (v: number) => string;
  /** أعلى المحور ثابت (100 للنسب) */ fixedMax?: number;
  /** خط مرجعي متقطع (المتوسط) */ avg?: { value: number; label: string };
  /** اسم الفئة على سطرين (أول كلمتين) */ twoLine?: boolean;
  /** ترتيب الأعمدة من اليمين في الواجهة العربية (للفئات لا للزمن) */ rtl?: boolean;
}> = ({ data: raw, label, selected, onSelect, height = 190, allLabels, fmt, fixedMax, avg, twoLine, rtl }) => {
  const [ref, W] = useWidth();
  const [hi, setHi] = useState<number | null>(null);
  const data = rtl && !isEn() ? [...raw].reverse() : raw;
  const H = height, L = fixedMax === 100 ? 42 : 32, R = 8, T = 12, B = twoLine ? 38 : 26;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = fixedMax ? fixedMax / 4 : Math.max(1, Math.ceil(max / 4));
  const top = fixedMax || step * Math.ceil(max / step);
  const n = data.length, slot = (W - L - R) / Math.max(1, n), bw = Math.max(2, Math.min(36, slot - 2));
  const x = (i: number) => L + i * slot + (slot - bw) / 2;
  const y = (v: number) => T + (1 - Math.min(v, top) / top) * (H - T - B);
  const every = allLabels || twoLine ? 1 : Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - L - R) / 44))));
  const h = hi === null ? null : data[hi];
  const words = (s: string) => { const w = s.includes('\n') ? s.split('\n') : (() => { const a = s.split(/\s+/).filter(Boolean); return [a[0] || '', a.slice(1).join(' ')]; })(); return [w[0] || '', w[1] || ''].map((x) => (x.length > 11 ? `${x.slice(0, 10)}…` : x)); };
  return (
    <div className="relative" ref={ref} dir="ltr">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={label} onMouseLeave={() => setHi(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-slate-100 dark:stroke-slate-800" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{fixedMax === 100 ? `${v}%` : v}</text></g>
        ))}
        {data.map((d, i) => {
          const dim = selected && selected !== d.key;
          const [w1, w2] = twoLine ? words(d.short) : [d.short, ''];
          return (
            <g key={d.key} onMouseEnter={() => setHi(i)} onClick={() => onSelect?.(d.key)} className={onSelect ? 'cursor-pointer' : ''}>
              <rect x={L + i * slot} y={T} width={slot} height={H - T - B} fill="transparent" />
              {d.value > 0 && <path d={topRounded(x(i), y(d.value), bw, Math.max(1, y(0) - y(d.value)), 4)} className={selected === d.key ? 'fill-indigo-700 dark:fill-indigo-300' : dim ? 'fill-indigo-200 dark:fill-indigo-900' : hi === i ? 'fill-indigo-600 dark:fill-indigo-300' : 'fill-indigo-500 dark:fill-indigo-400'} />}
              {i % every === 0 && <text x={x(i) + bw / 2} y={H - (twoLine ? 22 : 8)} textAnchor="middle" className="fill-slate-500 text-[10px]">{w1}{w2 && <tspan x={x(i) + bw / 2} dy={12}>{w2}</tspan>}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="stroke-slate-300 dark:stroke-slate-700" />
        {avg && <line x1={L} x2={W - R} y1={y(avg.value)} y2={y(avg.value)} strokeDasharray="4 4" pointerEvents="none" className="stroke-slate-500 dark:stroke-slate-400" />}
      </svg>
      {avg && <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 mt-1" dir={isEn() ? 'ltr' : 'rtl'}><span className="w-5 border-t-2 border-dashed border-slate-500 dark:border-slate-400" />{avg.label} <b className="tabular-nums" dir="ltr">{Math.round(avg.value)}%</b></div>}
      {h && (
        <div className="absolute top-0 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs shadow-lg pointer-events-none whitespace-nowrap z-10" style={{ left: `${Math.min(70, Math.max(0, ((x(hi!) + bw / 2) / W) * 100 - 12))}%` }} dir={isEn() ? 'ltr' : 'rtl'}>
          <div className="font-bold">{h.title}</div>
          <div className="tabular-nums">{fmt ? fmt(h.value) : t('{n} تعديل', { n: h.value })}{h.sub ? ` · ${h.sub}` : ''}</div>
        </div>
      )}
    </div>
  );
};

/** أعمدة أفقية لنسبة الرصد (HTML) — صف لكل فئة، قابل للنقر للتصفية */
const HBarList: React.FC<{ rows: Array<{ key: string; label: string; sub: string; value: number }>; active?: string; onPick?: (k: string) => void; testid?: string }> = ({ rows, active, onPick, testid }) => (
  <ul className="space-y-1 max-h-[26rem] overflow-y-auto pe-1" data-testid={testid}>
    {rows.map((r) => (
      <li key={r.key}>
        <button type="button" onClick={() => onPick?.(r.key)} aria-pressed={active === r.key} className={`w-full text-start rounded-xl px-2.5 py-2 ${active === r.key ? 'bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-300 dark:ring-indigo-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.label}</span>
            <span className="text-[11px] text-slate-500 truncate">{r.sub}</span>
            <span className="ms-auto text-sm font-bold tabular-nums text-slate-900 dark:text-white">{r.value}%</span>
          </span>
          <span className="mt-1.5 block h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full bg-indigo-500 dark:bg-indigo-400" style={{ width: `${Math.max(1, r.value)}%` }} /></span>
        </button>
      </li>
    ))}
  </ul>
);

/** سجل التعديلات مجمّعاً باليوم (اليوم والتاريخ) */
export const ChangesTimeline: React.FC<{ changes: RecordChange[]; metaOf: (c: RecordChange) => RecordMeta; showFile?: boolean; limit?: number }> = ({ changes, metaOf, showFile = true, limit = 60 }) => {
  const [n, setN] = useState(limit);
  useEffect(() => setN(limit), [changes, limit]);
  const groups = useMemo(() => {
    const m = new Map<string, RecordChange[]>();
    changes.slice(0, n).forEach((c) => { const k = dayKey(c.edited_at); m.set(k, [...(m.get(k) || []), c]); });
    return [...m.entries()];
  }, [changes, n]);
  if (!changes.length) return <EmptyMascot text={t('لا توجد تعديلات في هذه الفترة.')} compact />;
  return (
    <div className="space-y-4" data-testid="cr-timeline">
      {groups.map(([k, list]) => (
        <section key={k}>
          <h3 className="sticky top-0 z-[1] bg-white/95 dark:bg-slate-900/95 py-1.5 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />{fmtDay(fromKey(k))}
            <span className="text-xs font-normal text-slate-500">· {sinceText(fromKey(k).toISOString())} · {t('{n} تعديل', { n: list.length })}</span>
          </h3>
          <ul className="border-s-2 border-slate-100 dark:border-slate-800 ms-2 ps-4 space-y-2 mt-1">
            {list.map((c) => {
              const m = metaOf(c);
              return (
                <li key={c.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs tabular-nums text-slate-500 w-16 shrink-0">{fmtTime(c.edited_at)}</span>
                    {showFile && <b className="text-slate-900 dark:text-white">{c.file_name}</b>}
                    <span className="text-slate-700 dark:text-slate-200">{c.sheet_name}</span>
                    {m.classLabel && <span className="text-xs text-slate-500">({m.subject} · {m.classLabel})</span>}
                    {c.initial && <Chip tone="muted">{t('أول مزامنة')}</Chip>}
                  </div>
                  <div className="text-xs text-slate-500 ms-[4.5rem]">{c.edited_by ? <>{t('بواسطة')} <b className="text-slate-700 dark:text-slate-300">{c.edited_by}</b> · </> : null}{cellsText(c)}</div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {changes.length > n && <div className="text-center"><Button size="sm" variant="secondary" onClick={() => setN(n + 100)}>{t('عرض المزيد ({n})', { n: changes.length - n })}</Button></div>}
    </div>
  );
};

/** أدوات التقويم: نسبة الرصد لكل أداة، وما لم يحن وقته (لا يُحسب على المعلم) مع إمكانية تثبيت الحالة */
const ToolList: React.FC<{ rows: Array<{ key: string; label: string; value: number; n: number; info?: ToolInfo }>; canManage: boolean; onSetMode: (key: string, mode: 'auto' | ToolMode) => void }> = ({ rows, canManage, onSetMode }) => (
  <ul className="space-y-1 max-h-[26rem] overflow-y-auto pe-1" data-testid="cr-by-tool">
    {rows.map((r) => {
      const due = r.info?.due ?? true;
      return (
        <li key={r.key} className="rounded-xl px-2.5 py-2">
          <span className="flex items-baseline gap-2">
            <span className={`text-sm font-semibold truncate ${due ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500'}`}>{r.label}</span>
            <span className="text-[11px] text-slate-500 truncate">{t('في {n} سجل', { n: r.n })}</span>
            <span className={`ms-auto text-sm font-bold tabular-nums ${due ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{r.value}%</span>
          </span>
          <span className="mt-1.5 block h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true"><span className={`block h-full rounded-full ${due ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-600'}`} style={{ width: `${Math.max(1, r.value)}%` }} /></span>
          <span className="mt-1 flex items-center gap-2">
            {!due && <Chip tone="muted"><Clock className="w-3.5 h-3.5" />{t('لم يحن وقتها · لا تُحسب')}</Chip>}
            {canManage && (
              <select value={r.info?.mode || 'auto'} onChange={(e) => onSetMode(r.key, e.target.value as 'auto' | ToolMode)} aria-label={t('حالة الأداة: {name}', { name: r.label })}
                className="ms-auto h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                <option value="auto">{t('تلقائي')}{r.info?.mode === 'auto' ? ` (${r.info.due ? t('مستحقة') : t('لم يحن وقتها')})` : ''}</option>
                <option value="due">{t('مستحقة الآن')}</option>
                <option value="not_due">{t('لم يحن وقتها')}</option>
              </select>
            )}
          </span>
        </li>
      );
    })}
  </ul>
);

const NoActivity: React.FC = () => (
  <div className="h-[190px] flex flex-col items-center justify-center text-center text-sm text-slate-500 gap-1">
    <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600" />
    <p>{t('لا تعديلات في هذه الفترة بعد.')}</p>
    <p className="text-xs">{t('كل تعديل يعمله المعلم في ملفه يظهر هنا بيومه وتاريخه.')}</p>
  </div>
);

// ---------------------------------------------------------------------
// لوحة المتابعة: مؤشرات + النشاط اليومي + حسب يوم الأسبوع + حسب المعلم/الفصل/المادة + التفاصيل + آخر التعديلات
// ---------------------------------------------------------------------
type Period = 7 | 14 | 30 | 90;
const selCls = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm max-w-[14rem]';

export const RecordsDashboard: React.FC<{ items: RecItem[]; tools: ToolInfo[]; changes: RecordChange[]; onOpenTeacher: (fileKey: string) => void; canManage: boolean; onSetTool: (key: string, mode: 'auto' | ToolMode) => void }> = ({ items, tools, changes, onOpenTeacher, canManage, onSetTool }) => {
  const [teacher, setTeacher] = useState('');
  const [cls, setCls] = useState('');
  const [subject, setSubject] = useState('');
  const [period, setPeriod] = useState<Period>(30);
  const [kpi, setKpi] = useState<number | null>(null);
  const [day, setDay] = useState('');
  const [sort, setSort] = useState<'stale' | 'low' | 'teacher' | 'class'>('stale');

  const teachers = useMemo(() => [...new Map(items.map((x) => [x.r.file_key, x.r.file_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar')), [items]);
  const classes = useMemo(() => [...new Map(items.filter((x) => x.meta.classKey).sort((a, b) => ORDER(a.meta) - ORDER(b.meta)).map((x) => [x.meta.classKey, x.meta.classLabel])).entries()], [items]);
  const subjects = useMemo(() => [...new Set(items.map((x) => x.meta.subject))].sort((a, b) => a.localeCompare(b, 'ar')), [items]);
  const metaMap = useMemo(() => new Map(items.map((x) => [`${x.r.file_key}|${x.r.sheet_name}`, x.meta])), [items]);
  const metaOf = (c: RecordChange) => metaMap.get(`${c.file_key}|${c.sheet_name}`) || recordMeta(c.sheet_name);

  const match = (fileKey: string, m: RecordMeta) => (!teacher || fileKey === teacher) && (!cls || m.classKey === cls) && (!subject || m.subject === subject);
  const scoped = items.filter((x) => match(x.r.file_key, x.meta));
  const since = Date.now() - period * 864e5;
  const scopedChanges = changes.filter((c) => c.kind === 'followup' && new Date(c.edited_at).getTime() >= since && match(c.file_key, metaOf(c)));
  const dayChanges = day ? scopedChanges.filter((c) => dayKey(c.edited_at) === day) : scopedChanges;

  // المؤشرات
  const filled = scoped.reduce((a, x) => a + x.p.filled, 0), cells = scoped.reduce((a, x) => a + x.p.cells, 0);
  const teacherLast = new Map<string, string>();
  scoped.forEach((x) => { const at = x.r.last_edit_at; if (at && (!teacherLast.get(x.r.file_key) || at > teacherLast.get(x.r.file_key)!)) teacherLast.set(x.r.file_key, at); });
  const tCount = new Set(scoped.map((x) => x.r.file_key)).size;
  const active = [...teacherLast.values()].filter((at) => daysSince(at) <= 7).length;
  const late = scoped.filter((x) => !x.r.last_edit_at || daysSince(x.r.last_edit_at) > 10).length;
  const cellsEdited = scopedChanges.reduce((a, c) => a + c.cells_changed + c.cells_filled + c.cells_cleared, 0);

  // النشاط اليومي
  const daily: VBar[] = useMemo(() => {
    const counts = new Map<string, { n: number; cells: number }>();
    scopedChanges.forEach((c) => { const k = dayKey(c.edited_at); const v = counts.get(k) || { n: 0, cells: 0 }; v.n++; v.cells += c.cells_changed + c.cells_filled + c.cells_cleared; counts.set(k, v); });
    const out: VBar[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const k = dayKey(d.toISOString()), v = counts.get(k);
      out.push({ key: k, short: `${d.getDate()}/${d.getMonth() + 1}`, title: fmtDay(d), value: v?.n || 0, sub: v ? t('{n} خلية', { n: v.cells }) : undefined });
    }
    return out;
  }, [scopedChanges, period]);

  // حسب يوم الأسبوع (الأحد أولاً)
  const weekly: VBar[] = useMemo(() => {
    const c = Array(7).fill(0);
    scopedChanges.forEach((x) => { c[new Date(x.edited_at).getDay()]++; });
    const base = new Date(2026, 0, 4); // أحد
    return c.map((v, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return { key: String(i), short: weekdayName(d, false), title: weekdayName(d), value: v }; });
  }, [scopedChanges]);

  // التجميع حسب فئة
  const groupBy = (keyOf: (x: RecItem) => string, labelOf: (x: RecItem) => string, order?: (x: RecItem) => number) => {
    const m = new Map<string, { label: string; filled: number; cells: number; n: number; teachers: Set<string>; ord: number }>();
    scoped.forEach((x) => {
      const k = keyOf(x); if (!k) return;
      const g = m.get(k) || { label: labelOf(x), filled: 0, cells: 0, n: 0, teachers: new Set<string>(), ord: order ? order(x) : 0 };
      g.filled += x.p.filled; g.cells += x.p.cells; g.n++; g.teachers.add(x.r.file_key); m.set(k, g);
    });
    return [...m.entries()].map(([key, g]) => ({ key, label: g.label, value: pct(g.filled, g.cells), n: g.n, teachers: g.teachers.size, ord: g.ord }));
  };
  const byTeacher = groupBy((x) => x.r.file_key, (x) => x.r.file_name).sort((a, b) => b.value - a.value)
    .map((g) => ({ ...g, sub: `${t('{n} سجل', { n: g.n })} · ${teacherLast.get(g.key) ? sinceText(teacherLast.get(g.key)!) : '—'}` }));
  const byClass = groupBy((x) => x.meta.classKey, (x) => x.meta.classLabel, (x) => ORDER(x.meta)).sort((a, b) => a.ord - b.ord)
    .map((g) => ({ ...g, sub: t('{n} سجل · {m} معلم', { n: g.n, m: g.teachers }) }));
  const bySubject = groupBy((x) => x.meta.subject, (x) => x.meta.subject).sort((a, b) => b.value - a.value)
    .map((g) => ({ ...g, sub: t('{n} سجل · {m} معلم', { n: g.n, m: g.teachers }) }));

  const detail = [...scoped].sort((a, b) => sort === 'low' ? a.done - b.done
    : sort === 'teacher' ? a.r.file_name.localeCompare(b.r.file_name, 'ar') || ORDER(a.meta) - ORDER(b.meta)
    : sort === 'class' ? ORDER(a.meta) - ORDER(b.meta) || a.meta.subject.localeCompare(b.meta.subject, 'ar')
    : (a.r.last_edit_at || '').localeCompare(b.r.last_edit_at || ''));

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const day3 = (iso: string | null) => iso ? [weekdayName(new Date(iso)), new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }), fmtTime(iso)] : ['', '', ''];
    const sum = [[t('المعلم'), t('المادة'), t('الفصل'), t('الورقة'), t('الطلاب'), t('اكتمال الرصد %'), t('آخر تعديل بواسطة'), t('اليوم'), t('التاريخ'), t('الوقت'), t('منذ (أيام)')],
      ...detail.map((x) => [x.r.file_name, x.meta.subject, x.meta.classLabel, x.r.sheet_name, x.p.students.length, x.done, x.r.last_edit_by, ...day3(x.r.last_edit_at), x.r.last_edit_at ? daysSince(x.r.last_edit_at) : ''])];
    const log = [[t('اليوم'), t('التاريخ'), t('الوقت'), t('المعلم'), t('الورقة'), t('المادة'), t('الفصل'), t('بواسطة'), t('رصد جديد'), t('خلايا معدّلة'), t('خلايا ممسوحة'), t('النوع')],
      ...dayChanges.map((c) => { const m = metaOf(c); return [...day3(c.edited_at), c.file_name, c.sheet_name, m.subject, m.classLabel, c.edited_by, c.cells_filled, c.cells_changed, c.cells_cleared, c.initial ? t('أول مزامنة') : t('تعديل')]; })];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(sum); ws1['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 10 }];
    const ws2 = XLSX.utils.aoa_to_sheet(log); ws2['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    ws1['!views'] = ws2['!views'] = [{ RTL: !isEn() }] as any;
    XLSX.utils.book_append_sheet(wb, ws1, t('السجلات').slice(0, 31));
    XLSX.utils.book_append_sheet(wb, ws2, t('سجل التعديلات').slice(0, 31));
    XLSX.writeFile(wb, `class-records-${dayKey(new Date().toISOString())}.xlsx`);
  };

  // رسم الرصد: لكل معلم، أو لكل سجل عند اختيار معلم
  const overall = pct(filled, cells);
  const teacherName = teachers.find(([k]) => k === teacher)?.[1] || '';
  const doneBars: VBar[] = teacher
    ? [...scoped].sort((a, b) => ORDER(a.meta) - ORDER(b.meta) || a.meta.subject.localeCompare(b.meta.subject, 'ar'))
      .map((x) => ({ key: String(x.r.id), short: sheetShort(x.r.sheet_name, x.meta), title: `${x.r.sheet_name} — ${x.meta.subject}${x.meta.classLabel ? ` · ${x.meta.classLabel}` : ''}`, value: x.done, sub: t('{n} طالب', { n: x.p.students.length }) }))
    : byTeacher.map((g) => ({ key: g.key, short: g.label, title: g.label, value: g.value, sub: g.sub }));

  // حالة السجلات (حداثة آخر تعديل) وتوزيع نسب الرصد
  const fresh = scoped.filter((x) => x.r.last_edit_at && daysSince(x.r.last_edit_at) <= 3).length;
  const mid = scoped.filter((x) => x.r.last_edit_at && daysSince(x.r.last_edit_at) > 3 && daysSince(x.r.last_edit_at) <= 10).length;
  const STATUS: Array<[string, number, React.ElementType, string, string]> = [
    [t('محدَّث (آخر 3 أيام)'), fresh, CheckCircle2, 'bg-emerald-500', 'text-emerald-700 dark:text-emerald-400'],
    [t('يحتاج متابعة (4–10 أيام)'), mid, Clock, 'bg-amber-500', 'text-amber-700 dark:text-amber-400'],
    [t('متأخر (أكثر من 10 أيام)'), late, AlertTriangle, 'bg-rose-500', 'text-rose-700 dark:text-rose-400'],
  ];
  const buckets: VBar[] = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 101]].map(([a, b]) => {
    const v = scoped.filter((x) => x.done >= a && x.done < b).length;
    const lab = `${a}–${Math.min(b, 100)}%`;
    return { key: lab, short: lab, title: t('سجلات رصدها {r}', { r: lab }), value: v };
  });

  // اكتمال الرصد حسب أداة التقويم (المشاركة، الواجبات، الاختبارات…) — ما لم يحن وقته يظهر منفصلاً
  const toolMode = new Map(tools.map((x) => [x.key, x]));
  const byTool = (() => {
    const m = new Map<string, { f: number; c: number; n: number }>();
    scoped.forEach((x) => x.p.columns.filter((c) => !c.total).forEach((c, i) => {
      const k = toolKey(c.label); if (!k) return;
      const g = m.get(k) || { f: 0, c: 0, n: 0 };
      x.p.students.forEach((st) => { g.c++; if (st.values[i] !== null && st.values[i] !== undefined) g.f++; });
      g.n++; m.set(k, g);
    }));
    return [...m.entries()].filter(([, g]) => g.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 16)
      .map(([k, g]) => ({ key: k, label: k, value: pct(g.f, g.c), n: g.n, info: toolMode.get(k) }))
      .sort((a, b) => Number(b.info?.due ?? true) - Number(a.info?.due ?? true) || b.value - a.value);
  })();

  const filtersOn = teacher || cls || subject || day;
  const when = (iso: string | null) => (iso ? `${weekdayName(new Date(iso), false)} ${new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} ${fmtTime(iso)}` : '—');
  const recHeaders = [t('المعلم'), t('المادة'), t('الفصل'), t('الورقة'), t('الطلاب'), t('اكتمال الرصد %'), t('آخر تعديل'), t('منذ (أيام)')];
  const recRow = (x: RecItem) => [x.r.file_name, x.meta.subject, x.meta.classLabel, x.r.sheet_name, x.p.students.length, x.done, when(x.r.last_edit_at), x.r.last_edit_at ? daysSince(x.r.last_edit_at) : '—'];
  const kpiSections = (i: number): KpiSection[] => {
    if (i === 0) return [{ title: t('السجلات حسب اكتمال الرصد (الأقل أولاً)'), headers: recHeaders, rows: [...scoped].sort((a, b) => a.done - b.done).map(recRow) }];
    if (i === 1) return [{ title: t('التعديلات'), headers: [t('الوقت'), t('المعلم'), t('الورقة'), t('المادة'), t('الفصل'), t('بواسطة'), t('رصد جديد'), t('خلايا معدّلة'), t('خلايا ممسوحة')],
      rows: [...scopedChanges].sort((a, b) => b.edited_at.localeCompare(a.edited_at)).map((c) => { const m = metaOf(c); return [when(c.edited_at), c.file_name, c.sheet_name, m.subject, m.classLabel, c.edited_by, c.cells_filled, c.cells_changed, c.cells_cleared]; }) }];
    if (i === 2) {
      const all = teachers.filter(([k]) => scoped.some((x) => x.r.file_key === k));
      const row = ([k, n]: [string, string]) => { const at = teacherLast.get(k) || null; const n7 = scopedChanges.filter((c) => c.file_key === k && daysSince(c.edited_at) <= 7).length; return [n, n7, when(at), at ? daysSince(at) : '—']; };
      const hdr = [t('المعلم'), t('تعديلات آخر 7 أيام'), t('آخر تعديل'), t('منذ (أيام)')];
      return [
        { title: t('عدّلوا خلال 7 أيام'), headers: hdr, rows: all.filter(([k]) => teacherLast.get(k) && daysSince(teacherLast.get(k)!) <= 7).map(row) },
        { title: t('لم يعدّلوا خلال 7 أيام'), headers: hdr, rows: all.filter(([k]) => !teacherLast.get(k) || daysSince(teacherLast.get(k)!) > 7).map(row) },
      ];
    }
    return [{ title: t('سجلات لم تُعدَّل منذ 10 أيام'), headers: recHeaders, rows: scoped.filter((x) => !x.r.last_edit_at || daysSince(x.r.last_edit_at) > 10).sort((a, b) => (a.r.last_edit_at || '').localeCompare(b.r.last_edit_at || '')).map(recRow) }];
  };
  const KPIS: Array<[React.ElementType, string, string, string]> = [
    [CheckCircle2, t('متوسط اكتمال الرصد'), `${pct(filled, cells)}%`, t('{n} سجل', { n: scoped.length })],
    [Activity, t('تعديلات آخر {n} يوم', { n: period }), String(scopedChanges.length), t('{n} خلية', { n: cellsEdited })],
    [Users, t('معلمون عدّلوا هذا الأسبوع'), t('{a} من {b}', { a: active, b: tCount }), t('آخر 7 أيام')],
    [AlertTriangle, t('سجلات لم تُعدَّل منذ 10 أيام'), String(late), t('من {n} سجل', { n: scoped.length })],
  ];
  return (
    <div className="space-y-5" data-testid="cr-dashboard">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className={selCls} aria-label={t('المعلم')}><option value="">{t('كل المعلمين')}</option>{teachers.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <select value={cls} onChange={(e) => setCls(e.target.value)} className={selCls} aria-label={t('الفصل')}><option value="">{t('كل الفصول')}</option>{classes.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className={selCls} aria-label={t('المادة')}><option value="">{t('كل المواد')}</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={period} onChange={(e) => { setPeriod(+e.target.value as Period); setDay(''); }} className={selCls} aria-label={t('الفترة')}>
          {([7, 14, 30, 90] as Period[]).map((p) => <option key={p} value={p}>{t('آخر {n} يوم', { n: p })}</option>)}
        </select>
        {filtersOn && <Button size="sm" variant="ghost" icon={X} onClick={() => { setTeacher(''); setCls(''); setSubject(''); setDay(''); }}>{t('مسح التصفية')}</Button>}
        <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportExcel()} className="ms-auto">{t('تصدير Excel')}</Button>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPIS.map(([Icon, l, v, sub], i) => (
          <button key={i} type="button" onClick={() => setKpi(i)} data-testid={`cr-kpi-${i}`}
            className="text-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition">
            <div className="text-xs text-slate-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{l}</div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">{v}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
          </button>
        ))}
        {kpi !== null && <KpiDetailModal title={KPIS[kpi][1]} subtitle={filtersOn ? t('حسب التصفية الحالية') : t('كل السجلات')} sections={kpiSections(kpi)} onClose={() => setKpi(null)} />}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="p-5 lg:col-span-2 space-y-2" data-testid="cr-done-chart">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-slate-900 dark:text-white me-auto">{teacher ? t('اكتمال الرصد في سجلات {name}', { name: teacherName }) : t('اكتمال الرصد لكل معلم')}</h2>
            <span className="text-xs text-slate-500">{teacher ? t('اضغط على سجل لفتح سجلات المعلم') : t('اضغط على معلم لعرض سجلاته')}</span>
          </div>
          <VBarChart data={doneBars} label={t('اكتمال الرصد لكل معلم')} fixedMax={100} twoLine rtl height={230}
            fmt={(v) => t('الرصد {n}%', { n: v })} avg={{ value: overall, label: t('المتوسط') }}
            onSelect={(k) => (teacher ? onOpenTeacher(teacher) : setTeacher(k))} />
        </Card>
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white mb-2">{t('حالة السجلات حسب آخر تعديل')}</h2>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5" aria-hidden="true">
              {STATUS.map(([l, v, , bar]) => v > 0 && <span key={l} className={`${bar} first:rounded-s-full last:rounded-e-full`} style={{ width: `${(v / Math.max(1, scoped.length)) * 100}%` }} />)}
            </div>
            <ul className="mt-2 space-y-1">
              {STATUS.map(([l, v, Icon, , txt]) => (
                <li key={l} className="flex items-center gap-2 text-sm"><Icon className={`w-4 h-4 ${txt}`} /><span className="text-slate-700 dark:text-slate-200">{l}</span><b className="ms-auto tabular-nums text-slate-900 dark:text-white">{v}</b><span className="text-xs text-slate-500 w-10 text-end tabular-nums">{pct(v, scoped.length)}%</span></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('توزيع نسب الرصد')}</h3>
            <VBarChart data={buckets} label={t('توزيع نسب الرصد')} allLabels height={140} fmt={(v) => t('{n} سجل', { n: v })} />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="p-5 lg:col-span-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-slate-900 dark:text-white me-auto">{t('النشاط اليومي: عدد التعديلات')}</h2>
            {day ? <Chip tone="info">{fmtDay(fromKey(day))}<button type="button" onClick={() => setDay('')} aria-label={t('إلغاء اختيار اليوم')}><X className="w-3.5 h-3.5" /></button></Chip>
              : <span className="text-xs text-slate-500">{t('اضغط على يوم لعرض تعديلاته')}</span>}
          </div>
          {scopedChanges.length ? <VBarChart data={daily} label={t('النشاط اليومي: عدد التعديلات')} selected={day || undefined} onSelect={(k) => setDay(day === k ? '' : k)} />
            : <NoActivity />}
        </Card>
        <Card className="p-5 space-y-2">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('التعديلات حسب يوم الأسبوع')}</h2>
          {scopedChanges.length ? <VBarChart data={weekly} label={t('التعديلات حسب يوم الأسبوع')} allLabels /> : <NoActivity />}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('اكتمال الرصد حسب المعلم')}</h2>
          <HBarList rows={byTeacher} active={teacher} onPick={(k) => setTeacher(teacher === k ? '' : k)} testid="cr-by-teacher" />
        </Card>
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('اكتمال الرصد حسب الفصل')}</h2>
          <HBarList rows={byClass} active={cls} onPick={(k) => setCls(cls === k ? '' : k)} testid="cr-by-class" />
        </Card>
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('اكتمال الرصد حسب المادة')}</h2>
          <HBarList rows={bySubject} active={subject} onPick={(k) => setSubject(subject === k ? '' : k)} />
        </Card>
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('اكتمال الرصد حسب أداة التقويم')}</h2>
          <ToolList rows={byTool} canManage={canManage} onSetMode={onSetTool} />
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white me-auto">{t('تفاصيل السجلات ({n})', { n: detail.length })}</h2>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selCls} aria-label={t('الترتيب')}>
              <option value="stale">{t('الأقدم تعديلاً أولاً')}</option><option value="low">{t('الأقل اكتمالاً أولاً')}</option><option value="teacher">{t('حسب المعلم')}</option><option value="class">{t('حسب الفصل')}</option>
            </select>
          </div>
          <div className="overflow-auto max-h-[34rem]">
            <table className="w-full text-sm min-w-[720px]" data-testid="cr-detail">
              <thead className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 sticky top-0">
                <tr><th className="px-3 py-2 text-start">{t('المعلم')}</th><th className="px-3 py-2 text-start">{t('المادة / الفصل')}</th><th className="px-3 py-2 text-center">{t('الطلاب')}</th><th className="px-3 py-2 text-start">{t('الرصد')}</th><th className="px-3 py-2 text-start">{t('آخر تعديل')}</th></tr>
              </thead>
              <tbody>
                {detail.map((x) => (
                  <tr key={x.r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => onOpenTeacher(x.r.file_key)}>
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{x.r.file_name}<div className="text-[11px] font-normal text-slate-500">{x.r.sheet_name}</div></td>
                    <td className="px-3 py-2">{x.meta.subject}<div className="text-[11px] text-slate-500">{x.meta.classLabel || '—'}</div></td>
                    <td className="px-3 py-2 text-center tabular-nums">{x.p.students.length}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2 min-w-[7rem]"><span className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><span className="block h-full rounded-full bg-indigo-500 dark:bg-indigo-400" style={{ width: `${Math.max(2, x.done)}%` }} /></span><b className="tabular-nums text-xs w-9 text-end">{x.done}%</b></div></td>
                    <td className="px-3 py-2"><div className="text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">{x.r.last_edit_at ? fmtFull(x.r.last_edit_at) : '—'}</div><div className="flex items-center gap-1.5 mt-0.5"><Freshness at={x.r.last_edit_at} />{x.r.last_edit_by && <span className="text-[11px] text-slate-500 truncate max-w-[10rem]">{x.r.last_edit_by}</span>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">{day ? t('تعديلات {d}', { d: fmtDay(fromKey(day)) }) : t('آخر التعديلات')}</h2>
          <div className="max-h-[36rem] overflow-y-auto pe-1"><ChangesTimeline changes={dayChanges} metaOf={metaOf} /></div>
        </Card>
      </div>
    </div>
  );
};
