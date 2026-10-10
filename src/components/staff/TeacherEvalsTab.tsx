import React, { useMemo, useState } from 'react';
import { Search, X, FileDown, Users, Award, AlertTriangle, BadgeCheck, RefreshCcw, GraduationCap } from 'lucide-react';
import { Card, Button, Chip } from '../common/ui';
import { Freshness } from './ClassRecordsDashboard';
import type { RecordSheet } from '../../services/classRecordsService';
import { TeacherEval, parseTeachers } from '../../utils/classRecords';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t } from '../../i18n';
import { MascotHere } from '../common/Mascot';

type Row = TeacherEval & { file: string };
const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bare = (s?: string) => (s || '').replace(/\s+/g, ' ').trim().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const num = (s?: string) => { const n = Number(String(s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))); return s && Number.isFinite(n) ? n : null; };
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// تصنيف الأداء الوظيفي بالترتيب ولون كل مستوى
const PERF: Array<{ k: string; tone: 'ok' | 'info' | 'warn' | 'bad' | 'muted'; color: string }> = [
  { k: 'ممتاز', tone: 'ok', color: '#059669' },
  { k: 'جيد جدا', tone: 'info', color: '#4f46e5' },
  { k: 'جيد', tone: 'warn', color: '#d97706' },
  { k: 'مرضي', tone: 'bad', color: '#e11d48' },
  { k: 'غير مرضي', tone: 'bad', color: '#9f1239' },
];
const perfOf = (s?: string) => PERF.find((p) => bare(p.k) === bare(s)) || null;
const perfFromScore = (n: number | null) => (n === null ? null : n >= 90 ? PERF[0] : n >= 80 ? PERF[1] : n >= 70 ? PERF[2] : n >= 60 ? PERF[3] : PERF[4]);
/** يحتاج متابعة: درجته أقل من 80 أو تصنيفه «جيد» فأقل */
const needsFollow = (r: Row) => { const p = perfOf(r.perfClass) || perfFromScore(r.score); return !!p && PERF.indexOf(p) >= 2; };
const noRenew = (r: Row) => !!r.renew && bare(r.renew).includes('لا');

/** قائمة توزيع أفقية: عدد ونسبة لكل قيمة، قابلة للضغط للتصفية */
const Dist: React.FC<{ title: string; items: Array<{ k: string; n: number; color?: string; sub?: string }>; total: number; active?: string; onPick?: (k: string) => void }> = ({ title, items, total, active, onPick }) => (
  <Card className="p-4">
    <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-2">{title}</h3>
    {items.length === 0 ? <p className="text-xs text-slate-400">—</p> : (
      <ul className="space-y-1.5">
        {items.map((it) => {
          const p = total ? Math.round((it.n / total) * 100) : 0;
          return (
            <li key={it.k}>
              <button type="button" onClick={() => onPick?.(it.k)} disabled={!onPick} aria-pressed={active === it.k}
                className={`w-full text-start rounded-lg px-1.5 py-1 ${onPick ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60' : ''} ${active === it.k ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''}`}>
                <span className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">{it.k}{it.sub && <span className="text-xs text-slate-400"> · {it.sub}</span>}</span>
                  <b className="tabular-nums text-slate-900 dark:text-white">{it.n}</b><span className="text-xs text-slate-500 w-9 text-end tabular-nums">{p}%</span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, p)}%`, background: it.color || '#6366f1' }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);

// ألوان الرسوم: درجات (لون واحد متدرّج)، والتغير بين الفصلين (أزرق صعود / أحمر هبوط مع سهم ونص)
const C = { bar: 'var(--te-bar, #2a78d6)', up: 'var(--te-up, #2a78d6)', down: 'var(--te-down, #e34948)' };
const binsOf = (rows: Row[]) => {
  const sc = rows.map((r) => r.score).filter((x): x is number => x !== null);
  if (!sc.length) return [];
  const lo = Math.max(0, Math.floor(Math.min(...sc) / 5) * 5), hi = Math.min(100, Math.floor(Math.max(...sc) / 5) * 5);
  const out: Array<{ from: number; to: number; rows: Row[] }> = [];
  for (let b = lo; b <= hi; b += 5) out.push({ from: b, to: b === 100 ? 100 : b + 4, rows: rows.filter((r) => r.score !== null && r.score >= b && r.score < b + 5 + (b === 100 ? 1 : 0)) });
  return out;
};

/** توزيع الدرجات: عمود لكل 5 درجات، مع تلميح عند المرور وضغطة تعرض المعلمين */
const ScoreHistogram: React.FC<{ rows: Row[]; onPick?: (title: string, rows: Row[]) => void; height?: number }> = ({ rows, onPick, height = 150 }) => {
  const bins = binsOf(rows);
  const [hov, setHov] = useState<number | null>(null);
  const max = Math.max(1, ...bins.map((b) => b.rows.length));
  const mean = avg(rows.map((r) => r.score).filter((x): x is number => x !== null));
  if (!bins.length) return <p className="text-xs text-slate-400">—</p>;
  return (
    <div dir="ltr">
      <div className="relative flex items-end gap-[2px]" style={{ height }} role="img" aria-label={t('توزيع الدرجات')}>
        {[0.5, 1].map((f) => <span key={f} className="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800" style={{ bottom: `${f * 100}%` }} aria-hidden="true" />)}
        {bins.map((b, i) => (
          <button key={b.from} type="button" onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(i)} onBlur={() => setHov(null)}
            onClick={() => b.rows.length && onPick?.(t('الدرجات {a}–{b}', { a: b.from, b: b.to }), b.rows)}
            className="relative flex-1 h-full flex items-end justify-center group" aria-label={t('{a}–{b}: {n} معلم', { a: b.from, b: b.to, n: b.rows.length })}>
            <span className="w-full max-w-[44px] rounded-t-[4px] transition-opacity" style={{ height: `${(b.rows.length / max) * 100}%`, minHeight: b.rows.length ? 3 : 0, background: C.bar, opacity: hov === null || hov === i ? 1 : 0.45 }} />
            {b.rows.length > 0 && <span className="absolute text-[11px] font-bold text-slate-700 dark:text-slate-200 tabular-nums" style={{ bottom: `calc(${(b.rows.length / max) * 100}% + 2px)` }}>{b.rows.length}</span>}
            {hov === i && (
              <span className="absolute z-10 bottom-full mb-6 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none" dir={uiDir()}>
                <b className="tabular-nums">{b.from}–{b.to}</b> · {t('{n} معلم', { n: b.rows.length })}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">{bins.map((b) => <span key={b.from} className="flex-1 text-center text-[10px] text-slate-500 tabular-nums">{b.from}</span>)}</div>
      {mean !== null && <p className="text-[11px] text-slate-500 mt-1 text-center" dir={uiDir()}>{t('المتوسط {n}', { n: mean })}</p>}
    </div>
  );
};

/** التغير من ف1 إلى ف2 لكل معلم: يمين (أزرق ↑) تحسّن، يسار (أحمر ↓) تراجع */
const DeltaChart: React.FC<{ rows: Row[]; onOpen: (r: Row) => void; maxRows?: number }> = ({ rows, onOpen, maxRows = 14 }) => {
  const d = rows.map((r) => ({ r, a: num(r.s1), b: num(r.s2) })).filter((x) => x.a !== null && x.b !== null).map((x) => ({ ...x, v: Math.round((x.b! - x.a!) * 10) / 10 })).sort((x, y) => y.v - x.v);
  if (!d.length) return <p className="text-xs text-slate-400">{t('لا توجد درجات للفصلين معاً بعد')}</p>;
  const m = Math.max(1, ...d.map((x) => Math.abs(x.v)));
  const up = d.filter((x) => x.v > 0).length, down = d.filter((x) => x.v < 0).length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: C.up }} />{t('تحسّن: {n}', { n: up })}</span>
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: C.down }} />{t('تراجع: {n}', { n: down })}</span>
        <span>{t('ثبات: {n}', { n: d.length - up - down })}</span>
      </div>
      <ul className="space-y-1 overflow-y-auto pe-1" style={{ maxHeight: `${maxRows * 1.9}rem` }}>
        {d.map(({ r, a, b, v }) => (
          <li key={`${r.file}|${r.row}`}>
            <button type="button" onClick={() => onOpen(r)} className="w-full grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-2 text-sm rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/60" title={`${a} ← ${b}`}>
              <span className="truncate text-start text-slate-700 dark:text-slate-200">{r.name}</span>
              <span className="relative h-3" dir="ltr" aria-hidden="true">
                <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-slate-600" />
                {v !== 0 && <span className="absolute inset-y-0 rounded-[3px]" style={v > 0 ? { left: '50%', width: `${(v / m) * 50}%`, background: C.up } : { right: '50%', width: `${(-v / m) * 50}%`, background: C.down }} />}
              </span>
              <span className={`text-xs font-bold tabular-nums text-end ${v > 0 ? 'text-blue-700 dark:text-blue-300' : v < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}`} dir="ltr">{v > 0 ? `↑ +${v}` : v < 0 ? `↓ ${v}` : '='}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** ترتيب المعلمين بالدرجة مع خط المتوسط */
const ScoreRank: React.FC<{ rows: Row[]; onOpen: (r: Row) => void }> = ({ rows, onOpen }) => {
  const list = rows.filter((r) => r.score !== null).sort((a, b) => b.score! - a.score!);
  const mean = avg(list.map((r) => r.score!));
  const lo = Math.max(0, Math.floor((Math.min(...list.map((r) => r.score!), 100) - 5) / 10) * 10);
  const pos = (v: number) => `${((v - lo) / (100 - lo)) * 100}%`;
  return (
    <ul className="space-y-1">
      {list.map((r, i) => {
        const p = perfOf(r.perfClass) || perfFromScore(r.score);
        return (
          <li key={`${r.file}|${r.row}`}>
            <button type="button" onClick={() => onOpen(r)} className="w-full grid grid-cols-[1.5rem_minmax(0,10rem)_1fr_2.5rem] items-center gap-2 text-sm rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <span className="text-[11px] text-slate-400 tabular-nums">{i + 1}</span>
              <span className="truncate text-start text-slate-800 dark:text-slate-100">{r.name}</span>
              <span className="relative h-3 rounded-full bg-slate-100 dark:bg-slate-800" dir="ltr" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pos(r.score!), background: p?.color || C.bar }} />
                {mean !== null && <span className="absolute -inset-y-1 w-0.5 bg-slate-900 dark:bg-white" style={{ left: pos(mean) }} />}
              </span>
              <b className="tabular-nums text-end">{r.score}</b>
            </button>
          </li>
        );
      })}
      {mean !== null && <li className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5"><span className="w-0.5 h-3 bg-slate-900 dark:bg-white inline-block" />{t('الخط: المتوسط {n}', { n: mean })} · {t('الألوان حسب تصنيف الأداء')}</li>}
    </ul>
  );
};

/** نافذة تفاصيل مؤشر: رسم + قائمة المعلمين (كل معلم يفتح تفاصيله) */
const KpiModal: React.FC<{ title: string; sub?: string; chart?: React.ReactNode; rows: Row[]; note?: (r: Row) => React.ReactNode; onOpen: (r: Row) => void; onFilter?: () => void; onClose: () => void }> = ({ title, sub, chart, rows, note, onOpen, onFilter, onClose }) => (
  <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="w-full sm:max-w-3xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()} data-testid="te-kpi-modal">
      <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex-1 min-w-0"><h2 className="font-bold text-lg text-slate-900 dark:text-white">{title}</h2>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>
        {onFilter && <Button size="sm" variant="secondary" onClick={() => { onFilter(); onClose(); }}>{t('تصفية الجدول بها')}</Button>}
        <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {chart}
        {(rows.length > 0 || !chart) && <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-2">{t('المعلمون ({n})', { n: rows.length })}</h3>
          {rows.length === 0 ? <p className="text-sm text-slate-500">—</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              {[...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((r) => {
                const p = perfOf(r.perfClass) || perfFromScore(r.score);
                return (
                  <li key={`${r.file}|${r.row}`}>
                    <button type="button" onClick={() => onOpen(r)} className="w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-slate-900 dark:text-white truncate">{r.name}</span>
                        <span className="block text-xs text-slate-500 truncate">{note ? note(r) : [r.subject, r.stage].filter(Boolean).join(' · ')}</span>
                      </span>
                      {p && <Chip tone={p.tone}>{r.perfClass || p.k}</Chip>}
                      <b className="tabular-nums w-10 text-end">{r.score ?? '—'}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>}
      </div>
    </div>
  </div>
);

/** تقييم المعلمين (من ملف Drive أو Excel): مؤشرات، وتوزيعات، وجدول المعلمين وتفاصيل كل معلم */
export const TeacherEvalsTab: React.FC<{ rows: RecordSheet[]; onEmpty?: () => void }> = ({ rows, onEmpty }) => {
  const all = useMemo<Row[]>(() => rows.flatMap((r) => (parseTeachers(r.grid)?.rows || []).map((x) => ({ ...x, file: r.file_name }))), [rows]);
  const latest = useMemo(() => rows.reduce<RecordSheet | null>((m, r) => (!m || (r.last_edit_at || '') > (m.last_edit_at || '') ? r : m), null), [rows]);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Row | null>(null);
  const [detail, setDetail] = useState<{ title: string; sub?: string; chart?: React.ReactNode; rows: Row[]; note?: (r: Row) => React.ReactNode; filter?: () => void } | null>(null);
  const setFilter = (k: string, v: string) => setF((p) => ({ ...p, [k]: p[k] === v ? '' : v }));
  const opts = (k: keyof TeacherEval) => [...new Set(all.map((r) => String(r[k] ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const list = all.filter((r) =>
    (!q.trim() || bare(r.name).includes(bare(q)) || bare(r.subject).includes(bare(q)))
    && (!f.complex || r.complex === f.complex) && (!f.dept || r.dept === f.dept) && (!f.subject || r.subject === f.subject) && (!f.stage || r.stage === f.stage)
    && (!f.perf || (perfOf(r.perfClass)?.k || r.perfClass || '—') === f.perf) && (!f.comp || (r.compClass || '—') === f.comp)
    && (!f.qual || r.qual === f.qual) && (!f.license || r.license === f.license) && (!f.renew || (r.renew || '—') === f.renew)
    && (!f.follow || needsFollow(r)));

  if (!all.length) return (
    <Card className="p-10 text-center text-slate-500 space-y-3"><MascotHere className="mx-auto mb-1" />
      <p>{t('لم يصل ملف تقييم المعلمين بعد. اربط مجلده في Drive أو ارفع ملف Excel من «الربط والاستيراد» (النوع: تقييم المعلمين).')}</p>
      {onEmpty && <Button size="sm" variant="secondary" onClick={onEmpty}>{t('الربط والاستيراد')}</Button>}
    </Card>
  );

  const scores = list.map((r) => r.score).filter((x): x is number => x !== null);
  const count = (key: (r: Row) => string | undefined, order?: string[]) => {
    const m = new Map<string, number>();
    list.forEach((r) => { const k = key(r) || '—'; m.set(k, (m.get(k) || 0) + 1); });
    const out = [...m.entries()].map(([k, n]) => ({ k, n }));
    return order ? out.sort((a, b) => (order.indexOf(a.k) + 1 || 99) - (order.indexOf(b.k) + 1 || 99)) : out.sort((a, b) => b.n - a.n);
  };
  const perfDist = count((r) => perfOf(r.perfClass)?.k || r.perfClass, PERF.map((p) => p.k)).map((x) => ({ ...x, color: perfOf(x.k)?.color || '#94a3b8' }));
  const expBucket = (r: Row) => { const n = (num(r.expIn) || 0) + (num(r.expOut) || 0); return !r.expIn && !r.expOut ? undefined : n < 3 ? t('أقل من 3 سنوات') : n < 10 ? t('3–9 سنوات') : n < 20 ? t('10–19 سنة') : t('20 سنة فأكثر'); };
  const loadBucket = (r: Row) => { const n = num(r.load); return n === null ? undefined : n < 18 ? t('أقل من 18') : n <= 22 ? '18–22' : n <= 24 ? '23–24' : t('25 فأكثر'); };
  // متوسط الدرجة لكل مادة
  const bySubject = [...new Map(list.map((r) => [r.subject || '—', 0])).keys()].map((k) => {
    const s = list.filter((r) => (r.subject || '—') === k).map((r) => r.score).filter((x): x is number => x !== null);
    return { k, n: list.filter((r) => (r.subject || '—') === k).length, a: avg(s) };
  }).sort((a, b) => (b.a ?? 0) - (a.a ?? 0));
  const hi = list.filter((r) => { const p = perfOf(r.perfClass) || perfFromScore(r.score); return p && PERF.indexOf(p) <= 1; }).length;
  const licensed = list.filter((r) => r.license && !bare(r.license).includes('لا يوجد')).length;
  const isHi = (r: Row) => { const pp = perfOf(r.perfClass) || perfFromScore(r.score); return !!pp && PERF.indexOf(pp) <= 1; };
  const hasLicense = (r: Row) => !!r.license && !bare(r.license).includes('لا يوجد');
  const licenseDist = count((r) => r.license, ['خبير', 'متقدم', 'ممارس', 'لا يوجد']);
  // كل بطاقة تفتح تفاصيلها: رسم + قائمة المعلمين
  const KPI: Array<[React.ElementType, string, React.ReactNode, string, () => void]> = [
    [Users, t('المعلمون'), list.length, all.length !== list.length ? t('من {n}', { n: all.length }) : '',
      () => setDetail({ title: t('المعلمون'), sub: t('توزيع الدرجات النهائية، اضغط على عمود لعرض معلميه'), rows: list, chart: <Card className="p-4"><ScoreHistogram rows={list} height={170} onPick={(title, rs) => setDetail({ title, rows: rs })} /></Card> })],
    [Award, t('متوسط المعدل النهائي'), avg(scores) ?? '—', scores.length ? t('أعلى {a} · أدنى {b}', { a: Math.max(...scores), b: Math.min(...scores) }) : '',
      () => setDetail({ title: t('ترتيب المعلمين بالمعدل النهائي'), sub: t('المتوسط {n}', { n: avg(scores) ?? '—' }), rows: [], chart: <Card className="p-4"><ScoreRank rows={list} onOpen={setOpen} /></Card> })],
    [BadgeCheck, t('ممتاز وجيد جداً'), `${list.length ? Math.round((hi / list.length) * 100) : 0}%`, t('{n} معلم', { n: hi }),
      () => setDetail({ title: t('ممتاز وجيد جداً'), sub: t('{a} من {b} معلم', { a: hi, b: list.length }), rows: list.filter(isHi), chart: <Dist title={t('تصنيف الأداء الوظيفي')} items={perfDist} total={list.length} />, note: (r) => [r.subject, r.compClass].filter(Boolean).join(' · ') })],
    [AlertTriangle, t('يحتاجون متابعة'), list.filter(needsFollow).length, t('تصنيف «جيد» فأقل'),
      () => setDetail({ title: t('يحتاجون متابعة'), sub: t('تصنيف «جيد» فأقل، مع جوانب التحسين لكل معلم'), rows: list.filter(needsFollow), note: (r) => r.needs || r.subject, filter: () => setF((p) => ({ ...p, follow: '1' })) })],
    [GraduationCap, t('لديهم رخصة مهنية'), `${list.length ? Math.round((licensed / list.length) * 100) : 0}%`, t('{n} معلم', { n: licensed }),
      () => setDetail({ title: t('بلا رخصة مهنية'), sub: t('{n} لديهم رخصة', { n: licensed }), rows: list.filter((r) => !hasLicense(r)), chart: <Dist title={t('الرخصة المهنية')} items={licenseDist} total={list.length} />, note: (r) => [r.subject, r.license].filter(Boolean).join(' · ') })],
    [RefreshCcw, t('لا يجدد'), list.filter(noRenew).length, list.some((r) => r.renew) ? '' : t('لم يُحدَّد بعد'),
      () => setDetail({ title: t('لا يجدد'), rows: list.filter(noRenew), note: (r) => [r.subject, r.perfClass].filter(Boolean).join(' · ') })],
  ];

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const head = [t('المعلم'), t('المجمع'), t('القسم'), t('المادة'), t('المرحلة'), t('النصاب'), t('المؤهل'), t('الرخصة المهنية'), t('الخبرة'), t('ف1'), t('ف2'), t('المعدل النهائي'), t('تصنيف الأداء'), t('الكفاءة والفاعلية'), t('نقاط القوة'), t('جوانب التحسين'), t('الإجراءات'), t('يجدد / لا يجدد')];
    const body = list.map((r) => [r.name, r.complex, r.dept, r.subject, [r.stage, r.stage2 && !bare(r.stage2).includes('لا يوجد') ? r.stage2 : ''].filter(Boolean).join(' + '), num(r.load) ?? r.load, r.qual, r.license, (num(r.expIn) || 0) + (num(r.expOut) || 0) || '', num(r.s1) ?? r.s1, num(r.s2) ?? r.s2, r.score ?? '', r.perfClass, r.compClass, r.strengths, r.needs, r.actions, r.renew].map((v) => v ?? ''));
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    (ws as any)['!views'] = [{ RTL: true }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t('تقييم المعلمين').slice(0, 31));
    XLSX.writeFile(wb, `teacher-evaluations-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const exportPdf = async () => {
    const box = (l: string, v: React.ReactNode) => `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px"><div style="font-size:11px;color:#64748b">${esc(l)}</div><div style="font-size:20px;font-weight:800">${esc(v)}</div></div>`;
    const body = `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px">${KPI.map(([, l, v]) => box(l, v)).join('')}</div>
      <table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('المعلم'))}</th><th>${esc(t('المادة'))}</th><th>${esc(t('المرحلة'))}</th><th>${esc(t('النصاب'))}</th><th>${esc(t('ف1'))}</th><th>${esc(t('ف2'))}</th><th>${esc(t('المعدل النهائي'))}</th><th>${esc(t('تصنيف الأداء'))}</th><th>${esc(t('الكفاءة والفاعلية'))}</th></tr></thead><tbody>${
      list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.subject)}</td><td>${esc(r.stage)}</td><td>${esc(r.load)}</td><td>${esc(r.s1)}</td><td>${esc(r.s2)}</td><td><b>${esc(r.score ?? '')}</b></td><td>${esc(r.perfClass)}</td><td>${esc(r.compClass)}</td></tr>`).join('')}</tbody></table>`;
    await exportElementToPdf({ bodyHtml: body, orientation: 'landscape', title: t('تقييم المعلمين'), subtitle: [f.complex, f.subject, f.stage].filter(Boolean).join(' · ') });
  };

  const sel = (k: string, label: string, values: string[]) => values.length > 1 && (
    <select value={f[k] || ''} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} className={inp} aria-label={label}>
      <option value="">{label}</option>{values.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
  const anyFilter = q || Object.values(f).some(Boolean);

  return (
    <div className="space-y-5" dir={uiDir()} data-testid="teacher-evals">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث باسم المعلم أو المادة')} className={`${inp} w-full ps-9`} />
        </div>
        {sel('complex', t('كل المجمعات'), opts('complex'))}
        {sel('dept', t('كل الأقسام'), opts('dept'))}
        {sel('subject', t('كل المواد'), opts('subject'))}
        {sel('stage', t('كل المراحل'), opts('stage'))}
        {anyFilter && <Button size="sm" variant="ghost" icon={X} onClick={() => { setQ(''); setF({}); }}>{t('مسح التصفية')}</Button>}
        <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportExcel()}>{t('Excel')}</Button>
        <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportPdf()}>{t('PDF')}</Button>
      </div>
      {latest && <p className="text-xs text-slate-500 flex items-center gap-2 -mt-2">{t('آخر تعديل:')} <b>{latest.last_edit_by || '—'}</b><Freshness at={latest.last_edit_at} /></p>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {KPI.map(([Icon, l, v, sub, act]) => (
          <button key={l} type="button" onClick={act} data-testid="te-kpi"
            className="text-start rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-indigo-300 hover:shadow-sm transition">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Icon className="w-4 h-4" />{l}</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">{v}</div>
            <div className="text-[11px] text-slate-500 flex justify-between gap-1"><span>{sub}</span><span className="text-indigo-600 dark:text-indigo-400 font-semibold">{t('التفاصيل')}</span></div>
          </button>
        ))}
      </div>
      {f.follow && <div className="-mt-2"><Chip tone="warn">{t('يحتاجون متابعة')}<button type="button" aria-label={t('إلغاء')} onClick={() => setFilter('follow', '1')}><X className="w-3 h-3" /></button></Chip></div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">{t('توزيع الدرجات النهائية')}</h3>
          <ScoreHistogram rows={list} onPick={(title, rs) => setDetail({ title, rows: rs })} />
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">{t('التغير من ف1 إلى ف2')}</h3>
          <DeltaChart rows={list} onOpen={setOpen} maxRows={8} />
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Dist title={t('تصنيف الأداء الوظيفي')} items={perfDist} total={list.length} active={f.perf} onPick={(k) => setFilter('perf', k)} />
        <Dist title={t('الكفاءة والفاعلية')} items={count((r) => r.compClass, ['كفاءة وفاعلية', 'كفاءة', 'فاعلية'])} total={list.length} active={f.comp} onPick={(k) => setFilter('comp', k)} />
        <Card className="p-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-2">{t('متوسط الدرجة حسب المادة')}</h3>
          <ul className="space-y-1.5 max-h-72 overflow-y-auto pe-1">
            {bySubject.map((s) => (
              <li key={s.k}>
                <button type="button" onClick={() => setFilter('subject', s.k)} className={`w-full text-start rounded-lg px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${f.subject === s.k ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''}`}>
                  <span className="flex items-center gap-2 text-sm"><span className="flex-1 truncate text-slate-700 dark:text-slate-200">{s.k} <span className="text-xs text-slate-400">· {t('{n} معلم', { n: s.n })}</span></span><b className="tabular-nums">{s.a ?? '—'}</b></span>
                  <span className="mt-1 block h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${s.a ?? 0}%`, background: perfFromScore(s.a)?.color || '#94a3b8' }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Dist title={t('المرحلة الأساسية')} items={count((r) => r.stage, ['رياض الأطفال', 'الابتدائية', 'المتوسطة', 'الثانوية'])} total={list.length} active={f.stage} onPick={(k) => setFilter('stage', k)} />
        <Dist title={t('المؤهل')} items={count((r) => r.qual, ['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم'])} total={list.length} active={f.qual} onPick={(k) => setFilter('qual', k)} />
        <Dist title={t('الرخصة المهنية')} items={count((r) => r.license, ['خبير', 'متقدم', 'ممارس', 'لا يوجد'])} total={list.length} active={f.license} onPick={(k) => setFilter('license', k)} />
        <Dist title={t('سنوات الخبرة')} items={count(expBucket, [t('أقل من 3 سنوات'), t('3–9 سنوات'), t('10–19 سنة'), t('20 سنة فأكثر')])} total={list.length} />
        <Dist title={t('النصاب (عدد الحصص)')} items={count(loadBucket, [t('أقل من 18'), '18–22', '23–24', t('25 فأكثر')])} total={list.length} />
        <Dist title={t('يجدد / لا يجدد')} items={count((r) => r.renew)} total={list.length} active={f.renew} onPick={(k) => setFilter('renew', k)} />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 pt-4 pb-2 font-bold text-slate-900 dark:text-white">{t('المعلمون ({n})', { n: list.length })}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60">
              <tr>{[t('المعلم'), t('المادة'), t('المرحلة'), t('النصاب'), t('ف1'), t('ف2'), t('المعدل النهائي'), t('تصنيف الأداء'), t('الكفاءة والفاعلية'), t('يجدد')].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {[...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((r) => {
                const p = perfOf(r.perfClass) || perfFromScore(r.score);
                return (
                  <tr key={`${r.file}|${r.row}`} onClick={() => setOpen(r)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" data-testid="teacher-eval-row">
                    <td className="px-3 py-2"><div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>{r.complex && <div className="text-[11px] text-slate-500">{[r.complex, r.dept].filter(Boolean).join(' · ')}</div>}</td>
                    <td className="px-3 py-2">{r.subject || '—'}</td>
                    <td className="px-3 py-2">{r.stage || '—'}{r.stage2 && !bare(r.stage2).includes('لا يوجد') && <div className="text-[11px] text-slate-500">+ {r.stage2}</div>}</td>
                    <td className="px-3 py-2 tabular-nums">{r.load || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.s1 || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.s2 || '—'}</td>
                    <td className="px-3 py-2 tabular-nums font-extrabold text-slate-900 dark:text-white">{r.score ?? '—'}</td>
                    <td className="px-3 py-2">{p ? <Chip tone={p.tone}>{r.perfClass || p.k}</Chip> : '—'}</td>
                    <td className="px-3 py-2">{r.compClass || '—'}</td>
                    <td className="px-3 py-2">{r.renew ? <Chip tone={noRenew(r) ? 'bad' : 'ok'}>{r.renew}</Chip> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && <KpiModal title={detail.title} sub={detail.sub} chart={detail.chart} rows={detail.rows} note={detail.note} onFilter={detail.filter} onOpen={(r) => setOpen(r)} onClose={() => setDetail(null)} />}
      {open && <TeacherDrawer r={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

const TeacherDrawer: React.FC<{ r: Row; onClose: () => void }> = ({ r, onClose }) => {
  const p = perfOf(r.perfClass) || perfFromScore(r.score);
  const exp = (num(r.expIn) || 0) + (num(r.expOut) || 0);
  const info: Array<[string, React.ReactNode]> = [
    [t('المجمع'), r.complex], [t('القسم'), r.dept], [t('المادة'), r.subject],
    [t('المرحلة الأساسية'), [r.stage, r.periods && t('{n} حصة', { n: r.periods })].filter(Boolean).join(' · ')],
    [t('مرحلة الإكمال'), r.stage2 && !bare(r.stage2).includes('لا يوجد') ? [r.stage2, r.periods2 && t('{n} حصة', { n: r.periods2 })].filter(Boolean).join(' · ') : ''],
    [t('مجموع النصاب'), r.load], [t('المؤهل'), r.qual], [t('الرخصة المهنية'), r.license],
    [t('سنوات الخبرة'), exp ? t('{a} في الشركة · {b} خارجها', { a: r.expIn || 0, b: r.expOut || 0 }) : ''],
    [t('تاريخ المباشرة'), r.start], [t('حالة المعلم'), r.status], [t('الجنسية'), r.nationality], [t('نوع التعاقد'), r.contract], [t('العمر'), r.age],
    [t('رقم الهوية'), r.nid], [t('رقم الجوال'), r.phone],
  ];
  const block = (title: string, text?: string) => text ? <div><h3 className="font-semibold text-slate-900 dark:text-white mb-1">{title}</h3><ul className="text-sm text-slate-700 dark:text-slate-300 list-disc ps-5 space-y-0.5">{text.split(/[،,\n]+/).map((s) => s.trim()).filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null;
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" role="dialog" aria-modal="true" aria-label={r.name} onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0"><h2 className="font-bold text-lg text-slate-900 dark:text-white">{r.name}</h2><p className="text-sm text-slate-500">{[r.subject, r.stage, r.file].filter(Boolean).join(' · ')}</p></div>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[[t('ف1'), r.s1, r.c1], [t('ف2'), r.s2, r.c2], [t('المعدل النهائي'), r.score, r.perfClass]].map(([l, v, c]) => (
              <div key={String(l)} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{v ?? '—'}</div>
                {c && <div className="text-[11px] text-slate-500">{c}</div>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">{p && <Chip tone={p.tone}>{r.perfClass || p.k}</Chip>}{r.compClass && <Chip tone="info">{r.compClass}</Chip>}{r.renew && <Chip tone={noRenew(r) ? 'bad' : 'ok'}>{r.renew}</Chip>}</div>
          {block(t('نقاط القوة'), r.strengths)}
          {block(t('الجوانب التي تحتاج إلى تحسين'), r.needs)}
          {block(t('الإجراءات المتخذة للمعالجة والتحسين'), r.actions)}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {info.filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-800 dark:text-slate-100" dir={k === t('رقم الجوال') || k === t('رقم الهوية') ? 'ltr' : undefined} style={{ textAlign: 'start' }}>{v}</dd></React.Fragment>)}
          </dl>
        </div>
      </div>
    </div>
  );
};
