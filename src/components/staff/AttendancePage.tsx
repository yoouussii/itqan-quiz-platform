import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Upload, Link2, Copy, KeyRound, Search, Bell, Trash2, Plus, X, RefreshCw, Download, AlertTriangle, CheckCircle2, FileDown, MessageCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, ReferenceLine } from 'recharts';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import { shortName } from '../../utils/names';
import { AttKind, parseAttendanceWorkbook, appsScriptCode, SheetPayload } from '../../utils/attendanceSheet';
import {
  AttConfig, AttRecord, ImportResult, RosterStudent, ROSTER_SHEET, attendanceDigestTick, rosterClassId, rosterClassName, fetchRoster, addAttendance, deleteAttendance, fetchAttendance, fetchAttendanceConfig,
  importAttendance, isoDay, linkAttendanceName, unmatchedAction, clearSyncLog, newAttendanceToken, saveAttendanceConfig, schoolDaysBetween,
} from '../../services/attendanceService';
import { supabaseUrl, supabaseAnonKey } from '../../services/supabase';
import { exportElementToPdf, getPrintBrand } from '../../utils/exportPdf';
import { WhatsAppSender } from '../common/WhatsAppSender';
import { guardianPhone } from '../../utils/whatsapp';
import { uiDir, t, isEn, dateLocale } from '../../i18n';
import type { User } from '../../types';

const KINDS: Array<{ k: AttKind; label: string; color: string; tone: 'bad' | 'warn' | 'info' }> = [
  { k: 'absent', label: 'غياب', color: '#e5484d', tone: 'bad' },
  { k: 'late', label: 'تأخر', color: '#f59e0b', tone: 'warn' },
  { k: 'excused', label: 'استئذان', color: '#2a78d6', tone: 'info' },
];
const KIND_LABEL: Record<AttKind, string> = { absent: 'غياب', late: 'تأخر', excused: 'استئذان' };
type Period = 'week' | 'month' | 'semester' | 'custom';
type Tab = 'dashboard' | 'students' | 'week' | 'sync';
const ERR: Record<string, string> = {
  no_start_date: 'حدد تاريخ بداية الفصل أولاً من تبويب «الربط والاستيراد»',
  forbidden: 'لا تملك صلاحية إدارة الحضور',
  bad_payload: 'لم يُعثر على سجل غياب بالشكل المتوقع في الملف',
};
type Klass = { id: string; name: string };
type Detail = AttKind | 'flagged' | 'rate';
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;
const rateTone = (r: number) => (r >= 0.95 ? 'ok' : r >= 0.9 ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad';
const escH = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pdfBox = (label: string, value: string, color?: string) =>
  `<div style="flex:1;min-width:110px;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px"><div style="font-size:11px;opacity:.7">${color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:9px;background:${color};margin-inline-end:4px"></span>` : ''}${escH(label)}</div><div style="font-size:20px;font-weight:900;margin-top:2px">${escH(value)}</div></div>`;

function downloadCsv(name: string, rows: string[][]) {
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
/** طلاب المنصة + طلاب «سجل فقط» (بلا حسابات) في شكل واحد، وفصولهم */
function usePeople(roster: RosterStudent[], labels: Record<string, string> = {}) {
  const { users, classes } = useApp();
  return useMemo(() => {
    const platform = (users as User[]).filter((u) => u.role === 'student');
    const extra = roster.map((r) => ({ id: r.id, name: r.name, role: 'student', class_id: rosterClassId(r.sheet) } as unknown as User));
    const sheets = Array.from(new Set(roster.map((r) => r.sheet))).sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
    const allClasses: Klass[] = [...classes.map((c) => ({ id: c.id, name: c.name })), ...sheets.map((sh) => ({ id: rosterClassId(sh), name: labels[sh]?.trim() || t(rosterClassName(sh)) }))];
    return { people: [...platform, ...extra], allClasses, rosterIds: new Set(roster.map((r) => r.id)) };
  }, [users, classes, roster, labels]);
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

/** الحضور والغياب: لوحة وتحليلات، سجل الطلاب، والربط مع سجل الغياب (Google Sheets / Excel) */
export const AttendancePage: React.FC = () => {
  const { currentUser, showToast, sendAttendanceNotice, users } = useApp();
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const loadRoster = useCallback(() => { void fetchRoster().then(setRoster); }, []);
  useEffect(() => { loadRoster(); }, [loadRoster]);
  const canManage = hasPerm(currentUser, 'can_manage_attendance');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [cfg, setCfg] = useState<AttConfig | null>(null);
  const { people, allClasses: classes, rosterIds } = usePeople(roster, cfg?.sheet_labels);
  const [period, setPeriod] = useState<Period>('semester');
  const today = isoDay(new Date());
  const [customFrom, setCustomFrom] = useState(isoDay(new Date(Date.now() - 30 * 864e5)));
  const [customTo, setCustomTo] = useState(today);
  const [classId, setClassId] = useState('');
  const [records, setRecords] = useState<AttRecord[] | null>(null);
  const [q, setQ] = useState('');
  const [openStudent, setOpenStudent] = useState<User | null>(null);

  const loadCfg = useCallback(() => { void fetchAttendanceConfig().then(setCfg); }, []);
  useEffect(() => { loadCfg(); void attendanceDigestTick(); }, [loadCfg]);

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return { from: isoDay(d), to: today }; }
    if (period === 'month') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    if (period === 'semester') {
      const from = cfg?.start_date || isoDay(new Date(now.getTime() - 120 * 864e5));
      const end = cfg?.start_date ? isoDay(new Date(new Date(`${cfg.start_date}T12:00:00`).getTime() + (cfg.weeks * 7 - 1) * 864e5)) : today;
      return { from, to: end < today ? end : today };
    }
    return { from: customFrom, to: customTo };
  }, [period, customFrom, customTo, cfg, today]);

  const reload = useCallback(() => { setRecords(null); void fetchAttendance(range.from, range.to).then((r) => setRecords(r || [])); }, [range]);
  useEffect(() => { reload(); }, [reload]);

  const students = useMemo(() => people.filter((u) => !classId || u.class_id === classId), [people, classId]);
  const studentMap = useMemo(() => new Map(people.map((u) => [u.id, u])), [people]);
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const recs = useMemo(() => {
    const ids = new Set(students.map((s) => s.id));
    return (records || []).filter((r) => ids.has(r.student_id));
  }, [records, students]);

  // ---------- التحليلات ----------
  const stats = useMemo(() => {
    const from = cfg?.start_date && range.from < cfg.start_date ? cfg.start_date : range.from;
    const days = Math.max(1, schoolDaysBetween(from, range.to));
    const count = { absent: 0, late: 0, excused: 0 } as Record<AttKind, number>;
    const per = new Map<string, Record<AttKind, number>>();
    const byDay = new Map<string, Record<AttKind, number>>();
    const byDow = [0, 1, 2, 3, 4].map(() => ({ absent: 0, late: 0, excused: 0 } as Record<AttKind, number>));
    recs.forEach((r) => {
      count[r.kind]++;
      const p = per.get(r.student_id) || { absent: 0, late: 0, excused: 0 }; p[r.kind]++; per.set(r.student_id, p);
      const d = byDay.get(r.day) || { absent: 0, late: 0, excused: 0 }; d[r.kind]++; byDay.set(r.day, d);
      const dow = new Date(`${r.day}T12:00:00`).getDay(); if (dow <= 4) byDow[dow][r.kind]++;
    });
    const rate = students.length ? Math.max(0, 1 - count.absent / (students.length * days)) : 1;
    const series = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, label: fmtDay(day), ...v }));
    const threshold = cfg?.threshold || 3;
    const top = Array.from(per.entries()).map(([id, v]) => ({ id, ...v, total: v.absent + v.late + v.excused }))
      .sort((a, b) => b.absent - a.absent || b.total - a.total);
    const flagged = top.filter((x) => x.absent >= threshold);
    const byClass = classes.map((c) => {
      const ids = students.filter((s) => s.class_id === c.id).map((s) => s.id);
      if (!ids.length) return null;
      const set = new Set(ids);
      const k = { absent: 0, late: 0, excused: 0 } as Record<AttKind, number>;
      recs.forEach((r) => { if (set.has(r.student_id)) k[r.kind]++; });
      return { id: c.id, name: c.name, students: ids.length, ...k, rate: Math.max(0, 1 - k.absent / (ids.length * days)) };
    }).filter(Boolean) as Array<{ id: string; name: string; students: number; absent: number; late: number; excused: number; rate: number }>;
    // حسب أسابيع السجل (الأسبوع ١ يبدأ من تاريخ بداية الفصل)
    const byWeek = new Map<number, Record<AttKind, number>>();
    if (cfg?.start_date) {
      const st = new Date(`${cfg.start_date}T12:00:00`).getTime();
      recs.forEach((r) => {
        const w = Math.floor((new Date(`${r.day}T12:00:00`).getTime() - st) / (7 * 864e5)) + 1;
        if (w < 1) return;
        const v = byWeek.get(w) || { absent: 0, late: 0, excused: 0 }; v[r.kind]++; byWeek.set(w, v);
      });
    }
    const weekSeries = Array.from(byWeek.entries()).sort(([a], [b]) => a - b).map(([w, v]) => ({ label: t('الأسبوع {n}', { n: w }), ...v }));
    const dowNames = [0, 1, 2, 3, 4].map((i) => new Date(2026, 0, 4 + i).toLocaleDateString(dateLocale(), { weekday: 'long' }));
    return { days, count, rate, per, series, weekSeries, top, flagged, byClass: byClass.sort((a, b) => a.rate - b.rate), byDow: byDow.map((v, i) => ({ label: dowNames[i], ...v })), threshold };
  }, [recs, students, classes, cfg, range]);

  // ---------- اتجاه الحضور: يومي / أسبوعي / شهري (أيام الدراسة بلا حركات تظهر صفراً) ----------
  const [gran, setGran] = useState<'day' | 'week' | 'month'>('day');
  const [hidden, setHidden] = useState<AttKind[]>([]);
  const trend = useMemo(() => {
    const from = cfg?.start_date && range.from < cfg.start_date ? cfg.start_date : range.from;
    const st = cfg?.start_date ? new Date(`${cfg.start_date}T12:00:00`).getTime() : 0;
    const keyOf = (day: string) => {
      const d = new Date(`${day}T12:00:00`);
      if (gran === 'day') return { key: day, label: fmtDay(day), full: d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }) };
      if (gran === 'month') { const k = day.slice(0, 7); const l = d.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' }); return { key: k, label: l, full: l }; }
      if (st) { const w = Math.floor((d.getTime() - st) / (7 * 864e5)) + 1; const l = t('الأسبوع {n}', { n: w }); return { key: String(1000 + w), label: l, full: l }; }
      const sun = new Date(d); sun.setDate(d.getDate() - d.getDay()); const l = t('أسبوع {d}', { d: sun.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) });
      return { key: isoDay(sun), label: l, full: l };
    };
    type B = { key: string; label: string; full: string; absent: number; late: number; excused: number; schoolDays: number; total: number; rate: number };
    const map = new Map<string, B>();
    const end = new Date(`${range.to}T12:00:00`);
    for (const d = new Date(`${from}T12:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() > 4) continue;
      const k = keyOf(isoDay(d));
      const b = map.get(k.key) || { ...k, absent: 0, late: 0, excused: 0, schoolDays: 0, total: 0, rate: 1 };
      b.schoolDays++; map.set(k.key, b);
    }
    recs.forEach((r) => { const b = map.get(keyOf(r.day).key); if (b) b[r.kind]++; });
    const out = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    out.forEach((b) => {
      b.total = b.absent + b.late + b.excused;
      b.rate = students.length ? Math.max(0, 1 - b.absent / (students.length * b.schoolDays)) : 1;
    });
    const peak = out.reduce<B | null>((m, b) => (!m || b.absent > m.absent ? b : m), null);
    const avg = out.length ? out.reduce((a, b) => a + b.absent, 0) / out.length : 0;
    return { series: out.map((b) => ({ ...b, ratePct: Math.round(b.rate * 1000) / 10 })), peak: peak && peak.absent > 0 ? peak : null, avg };
  }, [recs, students, cfg, range, gran]);

  const notifyFlagged = async (all: string[]) => {
    // طلاب «سجل فقط» بلا حسابات ولا أولياء أمور على المنصة
    const ids = all.filter((id) => !rosterIds.has(id));
    if (!ids.length) return;
    if (!window.confirm(t('إرسال إشعار للطلاب ({n}) وأولياء أمورهم بشأن الغياب؟', { n: ids.length }))) return;
    const ok = await sendAttendanceNotice(ids, 'تنبيه بشأن الغياب', `تجاوز عدد أيام الغياب ${stats.threshold} أيام خلال الفترة. نأمل الحرص على الانتظام في الحضور.`, true);
    showToast(ok ? t('أُرسل الإشعار') : t('تعذر الإرسال'), ok ? 'success' : 'error');
  };

  const exportCsv = () => {
    const rows = [['الطالب', 'الفصل', 'غياب', 'تأخر', 'استئذان', 'عدد أيام الغياب والتأخر والاستئذان', 'نسبة الحضور']];
    students.forEach((s) => { const p = stats.per.get(s.id); const a = p?.absent || 0; rows.push([s.name, classMap.get(s.class_id || '') || '', String(a), String(p?.late || 0), String(p?.excused || 0), String(a + (p?.late || 0) + (p?.excused || 0)), `${Math.round(Math.max(0, 1 - a / stats.days) * 1000) / 10}%`]); });
    downloadCsv(`attendance-${range.from}-${range.to}.csv`, rows);
  };

  const loading = records === null;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [wa, setWa] = useState<{ day: string; kind: AttKind } | null>(null);
  const Kpi: React.FC<{ label: string; value: React.ReactNode; hint?: string; color?: string; open: Detail }> = ({ label, value, hint, color, open }) => (
    <button type="button" onClick={() => setDetail(open)} disabled={loading}
      className="group text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}{label}</div>
      <div className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">{value}</div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
        <span data-pdf-hide className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 opacity-70 group-hover:opacity-100">{t('التفاصيل')}</span>
      </div>
    </button>
  );

  // آخر مزامنة من الشيت (أو آخر رفع ملف إن لم تكن هناك مزامنة)
  const lastSync = cfg?.log.find((l) => l.source === 'sheet_sync') || cfg?.log[0] || null;
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
    const days = Math.round((new Date(isoDay(new Date())).getTime() - new Date(isoDay(d)).getTime()) / 864e5);
    if (days === 0) return t('اليوم {t}', { t: time });
    if (days === 1) return t('أمس {t}', { t: time });
    return `${d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })} ${time}`;
  };
  const chartTip = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, direction: uiDir() as any } };

  // تقرير حضور الفصل (أو كل الفصول) للطباعة: ملخص + جدول الطلاب بمعادلات الشيت
  const exportClassPdf = async () => {
    const list = [...students].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const rows = list.map((s, i) => {
      const p = stats.per.get(s.id) || { absent: 0, late: 0, excused: 0 };
      const r = Math.max(0, 1 - p.absent / stats.days);
      const flag = p.absent >= stats.threshold ? ' style="background:#fff1f2"' : '';
      return `<tr${flag}><td>${i + 1}</td><td>${escH(s.name)}</td><td>${escH(classMap.get(s.class_id || '') || '')}</td><td>${p.absent}</td><td>${p.late}</td><td>${p.excused}</td><td><b>${p.absent + p.late + p.excused}</b></td><td dir="ltr">${pct(r)}</td></tr>`;
    }).join('');
    const bodyHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        ${pdfBox(t('الطلاب'), String(list.length))}${pdfBox(t('نسبة الحضور'), pct(stats.rate))}${pdfBox(t('أيام الغياب'), String(stats.count.absent), KINDS[0].color)}${pdfBox(t('مرات التأخر'), String(stats.count.late), KINDS[1].color)}${pdfBox(t('الاستئذان'), String(stats.count.excused), KINDS[2].color)}${pdfBox(t('تجاوزوا حد الغياب'), String(stats.flagged.filter((x) => list.some((s) => s.id === x.id)).length))}
      </div>
      <table class="pdf-table"><thead><tr><th>#</th><th>${escH(t('الطالب'))}</th><th>${escH(t('الفصل'))}</th><th>${escH(t('غياب'))}</th><th>${escH(t('تأخر'))}</th><th>${escH(t('استئذان'))}</th><th>${escH(t('المجموع'))}</th><th>${escH(t('نسبة الحضور'))}</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="font-size:11px;opacity:.7;margin-top:8px">${escH(t('نسبة الحضور = 1 − (أيام الغياب ÷ أيام الدراسة {n})', { n: stats.days }))} · ${escH(t('المظلل: تجاوز حد الغياب ({n} أيام)', { n: stats.threshold }))}</p>
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px"><span>${escH(t('وكيل شؤون الطلاب'))}: ....................</span><span>${escH(t('مدير المدرسة'))}: ....................</span></div>`;
    try {
      await exportElementToPdf({ bodyHtml, orientation: 'portrait', title: t('تقرير حضور: {c}', { c: classId ? classMap.get(classId) || '' : t('كل الفصول') }), subtitle: `${range.from} → ${range.to}` });
    } catch (e: any) { showToast(e?.message || t('تعذر تصدير PDF'), 'error'); }
  };

  // تصدير اللوحة PDF: الرسوم كما تظهر + جدول الطلاب بمعادلات الشيت
  const dashRef = useRef<HTMLDivElement>(null);
  const exportDashPdf = async () => {
    if (!dashRef.current) return;
    const periodName = { week: 'هذا الأسبوع', month: 'هذا الشهر', semester: 'الفصل الدراسي', custom: 'فترة مخصصة' }[period];
    const rows = [...students]
      .map((s) => { const p = stats.per.get(s.id) || { absent: 0, late: 0, excused: 0 }; return { s, p, total: p.absent + p.late + p.excused }; })
      .sort((a, b) => b.p.absent - a.p.absent || b.total - a.total || a.s.name.localeCompare(b.s.name, 'ar'))
      .map(({ s, p, total }, i) => [i + 1, s.name, classMap.get(s.class_id || '') || '', p.absent, p.late, p.excused, total, pct(Math.max(0, 1 - p.absent / stats.days))]);
    try {
      await exportElementToPdf({
        element: dashRef.current,
        title: t('تقرير الحضور والغياب'),
        subtitle: [t(periodName), `${range.from} → ${range.to}`, classId ? classMap.get(classId) || '' : t('كل الفصول'),
          t('نسبة الحضور {r}', { r: pct(stats.rate) }), t('{n} يوم دراسي', { n: stats.days })].filter(Boolean).join(' • '),
        table: { headers: ['#', t('الطالب'), t('الفصل'), t('غياب'), t('تأخر'), t('استئذان'), t('المجموع'), t('نسبة الحضور')], rows },
        tableTitle: t('سجل الطلاب'),
      });
    } catch (e: any) {
      showToast(e?.message || t('تعذر تصدير PDF'), 'error');
    }
  };

  const Dashboard = (
    <div className="space-y-5" ref={dashRef}>
      {!cfg?.start_date && (
        <Card className="p-4 flex items-center gap-3 border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-200 flex-1">{t('لم يُربط سجل الغياب بعد. حدد تاريخ بداية الفصل وارفع الملف أو اربط Google Sheets من تبويب «الربط والاستيراد».')}</p>
          {canManage && <Button size="sm" onClick={() => setTab('sync')}>{t('الربط والاستيراد')}</Button>}
        </Card>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label={t('نسبة الحضور')} value={loading ? '…' : <span dir="ltr">{Math.round(stats.rate * 1000) / 10}%</span>} hint={t('{n} يوم دراسي', { n: stats.days })} open="rate" />
        <Kpi label={t('أيام الغياب')} value={stats.count.absent} color={KINDS[0].color} open="absent" />
        <Kpi label={t('مرات التأخر')} value={stats.count.late} color={KINDS[1].color} open="late" />
        <Kpi label={t('الاستئذان')} value={stats.count.excused} color={KINDS[2].color} open="excused" />
        <Kpi label={t('تجاوزوا حد الغياب')} value={stats.flagged.length} hint={t('{n} أيام غياب فأكثر', { n: stats.threshold })} open="flagged" />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-bold text-slate-900 dark:text-white me-auto">{t('اتجاه الغياب والتأخر والاستئذان')}</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('إظهار وإخفاء')}>
            {KINDS.map((k) => {
              const off = hidden.includes(k.k);
              return (
                <button key={k.k} type="button" aria-pressed={!off} onClick={() => setHidden((h) => (off ? h.filter((x) => x !== k.k) : [...h, k.k]))}
                  className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-bold transition ${off ? 'border-slate-200 dark:border-slate-700 text-slate-400 line-through' : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'}`}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: off ? '#cbd5e1' : k.color }} />{t(k.label)}
                </button>
              );
            })}
          </div>
          <div data-pdf-hide className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {([['day', 'يومي'], ['week', 'أسبوعي'], ['month', 'شهري']] as const).map(([g, l]) => (
              <button key={g} type="button" onClick={() => setGran(g)} className={`h-8 px-3 rounded-lg text-sm font-bold ${gran === g ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t(l)}</button>
            ))}
          </div>
        </div>
        {trend.series.length && stats.count.absent + stats.count.late + stats.count.excused > 0 ? (
          <>
            <div className="h-80" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.series} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barCategoryGap={gran === 'day' ? '18%' : '30%'}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  {trend.avg > 0 && !hidden.includes('absent') && <ReferenceLine y={trend.avg} stroke="#e5484d" strokeDasharray="4 4" strokeOpacity={0.6} />}
                  <Tooltip cursor={{ fill: 'rgba(99,102,241,0.08)' }} content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const b = payload[0].payload;
                    return (
                      <div dir={uiDir()} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2 text-sm min-w-[11rem]">
                        <div className="font-bold text-slate-900 dark:text-white mb-1">{b.full}</div>
                        {KINDS.map((k) => <div key={k.k} className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-2 h-2 rounded-sm" style={{ background: k.color }} />{t(k.label)}</span><b className="tabular-nums">{b[k.k]}</b></div>)}
                        <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300"><span>{t('نسبة الحضور')}</span><b dir="ltr" className="tabular-nums">{b.ratePct}%</b></div>
                        {gran !== 'day' && <div className="text-xs text-slate-500 mt-0.5">{t('{n} يوم دراسي', { n: b.schoolDays })}</div>}
                      </div>
                    );
                  }} />
                  {KINDS.filter((k) => !hidden.includes(k.k)).map((k, i, arr) => <Bar key={k.k} dataKey={k.k} stackId="a" fill={k.color} radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={56} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-slate-600 dark:text-slate-300">
              {trend.peak && <span>{t('أعلى غياب: {d} ({n})', { d: trend.peak.full, n: trend.peak.absent })}</span>}
              <span>{t(gran === 'day' ? 'متوسط الغياب اليومي: {n}' : gran === 'week' ? 'متوسط الغياب الأسبوعي: {n}' : 'متوسط الغياب الشهري: {n}', { n: Math.round(trend.avg * 10) / 10 })}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-rose-400" />{t('خط المتوسط')}</span>
            </div>
          </>
        ) : <p className="text-sm text-slate-500 py-16 text-center">{loading ? t('جارٍ التحميل…') : t('لا توجد سجلات في هذه الفترة')}</p>}
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-bold text-slate-900 dark:text-white mb-1">{t('نسبة الحضور عبر الوقت')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('الخط المتقطع: هدف 95%')}</p>
          {trend.series.length ? (
            <div className="h-60" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.series} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <defs><linearGradient id="attRate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis tick={{ fontSize: 11 }} domain={[(min: number) => Math.max(0, Math.floor(Math.min(min, 90) / 5) * 5), 100]} unit="%" />
                  <ReferenceLine y={95} stroke="#64748b" strokeDasharray="4 4" />
                  <Tooltip {...chartTip} labelFormatter={(_: any, p: any) => p?.[0]?.payload?.full || ''} formatter={(v: any) => [`${v}%`, t('نسبة الحضور')]} />
                  <Area type="monotone" dataKey="ratePct" stroke="#10b981" strokeWidth={2} fill="url(#attRate)" dot={gran !== 'day' ? { r: 3 } : false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-slate-500 py-16 text-center">{loading ? t('جارٍ التحميل…') : t('لا توجد سجلات في هذه الفترة')}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3">{t('حسب أيام الأسبوع')}</h2>
          <div className="space-y-3">
            {stats.byDow.map((d) => {
              const max = Math.max(1, ...stats.byDow.map((x) => x.absent + x.late + x.excused));
              const total = d.absent + d.late + d.excused;
              return (
                <div key={d.label}>
                  <div className="flex justify-between text-sm mb-1"><span className="font-semibold text-slate-700 dark:text-slate-200">{d.label}</span><span className="tabular-nums text-slate-500">{total}</span></div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
                    {KINDS.map((k) => <span key={k.k} style={{ width: `${(d[k.k] / max) * 100}%`, background: k.color }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {stats.byClass.length > 1 && (
        <Card className="p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-1">{t('مقارنة الفصول')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('متوسط الحركات لكل طالب، ليكون العدد عادلاً بين الفصول الكبيرة والصغيرة')}</p>
          <div dir="ltr" style={{ height: 40 + stats.byClass.length * 38 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={[...stats.byClass].sort((a, b) => (b.absent + b.late + b.excused) / b.students - (a.absent + a.late + a.excused) / a.students).map((c) => ({ ...c, a: +(c.absent / c.students).toFixed(2), l: +(c.late / c.students).toFixed(2), e: +(c.excused / c.students).toFixed(2) }))} margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'rgba(99,102,241,0.08)' }} content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const c = payload[0].payload;
                  return (
                    <div dir={uiDir()} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2 text-sm min-w-[12rem]">
                      <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                      <div className="text-xs text-slate-500 mb-1">{t('{n} طالب', { n: c.students })}</div>
                      {KINDS.map((k) => <div key={k.k} className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-2 h-2 rounded-sm" style={{ background: k.color }} />{t(k.label)}</span><b className="tabular-nums">{c[k.k]}</b></div>)}
                      <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-slate-100 dark:border-slate-800"><span>{t('نسبة الحضور')}</span><b dir="ltr">{pct(c.rate)}</b></div>
                    </div>
                  );
                }} />
                {([['a', 0], ['l', 1], ['e', 2]] as const).filter(([, i]) => !hidden.includes(KINDS[i].k)).map(([key, i], j, arr) => <Bar key={key} dataKey={key} stackId="c" fill={KINDS[i].color} radius={j === arr.length - 1 ? [0, 4, 4, 0] : 0} maxBarSize={22} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('الأكثر غياباً')}</h2>
             {stats.flagged.some((x) => !rosterIds.has(x.id)) && <Button data-pdf-hide size="sm" variant="secondary" icon={Bell} onClick={() => void notifyFlagged(stats.flagged.map((x) => x.id))}>{t('إشعار المتجاوزين وأولياء أمورهم')}</Button>}
          </div>
          {stats.top.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-500">{t('لا توجد سجلات في هذه الفترة')}</p> : stats.top.slice(0, 10).map((x) => {
            const s = studentMap.get(x.id);
            return (
              <button key={x.id} type="button" onClick={() => s && setOpenStudent(s)} className="w-full flex items-center gap-3 px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate text-slate-900 dark:text-white">{s ? shortName(s.name) : x.id}</div>
                  <div className="text-xs text-slate-500">{classMap.get(s?.class_id || '') || ''}</div>
                </div>
                {x.absent >= stats.threshold && <Chip tone="bad"><AlertTriangle className="w-3 h-3" />{t('تجاوز الحد')}</Chip>}
                {KINDS.map((k) => <span key={k.k} className="w-12 text-center text-sm tabular-nums font-semibold" style={{ color: k.color }} title={t(k.label)}>{x[k.k]}</span>)}
              </button>
            );
          })}
        </Card>
        <Card className="overflow-hidden">
          <h2 className="font-bold text-slate-900 dark:text-white px-5 pt-4 pb-2">{t('حسب الفصول')}</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs border-b border-slate-100 dark:border-slate-800">
              <th className="text-start px-5 py-2">{t('الفصل')}</th><th>{t('الطلاب')}</th>{KINDS.map((k) => <th key={k.k}>{t(k.label)}</th>)}<th className="px-5">{t('الحضور')}</th>
            </tr></thead>
            <tbody>
              {stats.byClass.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="px-5 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{c.name}</td>
                  <td className="text-center tabular-nums">{c.students}</td>
                  {KINDS.map((k) => <td key={k.k} className="text-center tabular-nums">{c[k.k]}</td>)}
                  <td className="px-5 text-center"><Chip tone={c.rate >= 0.95 ? 'ok' : c.rate >= 0.9 ? 'warn' : 'bad'}><span dir="ltr">{Math.round(c.rate * 1000) / 10}%</span></Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );

  const [sortBy, setSortBy] = useState<'name' | 'absent' | 'total'>('absent');
  const filteredStudents = students
    .filter((s) => !q.trim() || s.name.includes(q.trim()) || (s.national_id || '').includes(q.trim()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'ar');
      const pa = stats.per.get(a.id); const pb = stats.per.get(b.id);
      const v = (p?: Record<AttKind, number>) => (sortBy === 'absent' ? (p?.absent || 0) : (p ? p.absent + p.late + p.excused : 0));
      return v(pb) - v(pa) || a.name.localeCompare(b.name, 'ar');
    });
  const Students = (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالاسم أو رقم الهوية')} className="w-full h-10 ps-9 pe-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
        </div>
        <select aria-label={t('الترتيب')} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
          <option value="absent">{t('الأكثر غياباً')}</option><option value="total">{t('الأكثر في المجموع')}</option><option value="name">{t('أبجدياً')}</option>
        </select>
        <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv}>{t('تصدير Excel')}</Button>
        <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportClassPdf()}>{t('تقرير PDF')}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-slate-500 text-xs border-b border-slate-100 dark:border-slate-800">
            <th className="text-start px-5 py-2.5">{t('الطالب')}</th><th className="text-start">{t('الفصل')}</th>{KINDS.map((k) => <th key={k.k}>{t(k.label)}</th>)}<th title={t('عدد أيام الغياب والتأخر والاستئذان')}>{t('المجموع')}</th><th>{t('نسبة الحضور')}</th><th />
          </tr></thead>
          <tbody>
            {filteredStudents.slice(0, 400).map((s) => {
              const p = stats.per.get(s.id);
              return (
                <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => setOpenStudent(s)}>
                  <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{s.name}</td>
                  <td className="text-slate-600 dark:text-slate-300">{classMap.get(s.class_id || '') || '—'}</td>
                  {KINDS.map((k) => <td key={k.k} className="text-center tabular-nums font-semibold" style={{ color: p?.[k.k] ? k.color : undefined }}>{p?.[k.k] || 0}</td>)}
                  <td className="text-center tabular-nums font-bold text-slate-800 dark:text-slate-100">{(p?.absent || 0) + (p?.late || 0) + (p?.excused || 0)}</td>
                  <td className="text-center">{(() => { const r = Math.max(0, 1 - (p?.absent || 0) / stats.days); return <Chip tone={r >= 0.95 ? 'ok' : r >= 0.9 ? 'warn' : 'bad'}><span dir="ltr">{Math.round(r * 1000) / 10}%</span></Chip>; })()}</td>
                  <td className="px-4 text-end"><span className="text-xs font-semibold text-indigo-600">{t('السجل')}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><CalendarCheck className="w-7 h-7 text-indigo-600" />{t('الحضور والغياب')}</span>}
        subtitle={t('الغياب والتأخر والاستئذان من سجل المدرسة، مع تحليلات لكل فصل وطالب')}
        actions={<div className="flex flex-wrap items-center gap-2.5">
          {lastSync && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5" title={t('يتحدث مع كل مزامنة من الشيت أو رفع ملف')}>
              <span className={`w-2 h-2 rounded-full ${Date.now() - new Date(lastSync.at).getTime() < 864e5 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {t(lastSync.source === 'sheet_sync' ? 'آخر تحديث من الشيت: {d}' : 'آخر رفع ملف: {d}', { d: fmtWhen(lastSync.at) })}
            </span>
          )}
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => { reload(); loadCfg(); loadRoster(); }}>{t('تحديث')}</Button>
        </div>} />

      <div className="flex flex-wrap items-center gap-2">
        {([['dashboard', 'اللوحة'], ['students', 'سجل الطلاب'], ['week', 'عرض الأسبوع'], ...(canManage ? [['sync', 'الربط والاستيراد']] : [])] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 px-4 rounded-xl text-sm font-bold ${tab === k ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>{t(l)}</button>
        ))}
        {(tab === 'dashboard' || tab === 'students') && (
          <div className="flex flex-wrap items-center gap-2 ms-auto">
            {tab === 'dashboard' && <Button size="sm" variant="secondary" icon={MessageCircle} onClick={() => setWa({ day: today, kind: 'absent' })}>{t('واتساب لأولياء الأمور')}</Button>}
            {tab === 'dashboard' && <Button size="sm" variant="secondary" icon={FileDown} disabled={loading} onClick={() => void exportDashPdf()}>{t('تصدير PDF')}</Button>}
            <select aria-label={t('الفترة')} value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="week">{t('هذا الأسبوع')}</option><option value="month">{t('هذا الشهر')}</option><option value="semester">{t('الفصل الدراسي')}</option><option value="custom">{t('فترة مخصصة')}</option>
            </select>
            {period === 'custom' && <>
              <input type="date" aria-label={t('من')} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              <input type="date" aria-label={t('إلى')} value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
            </>}
            <select aria-label={t('الفصل')} value={classId} onChange={(e) => setClassId(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">{t('كل الفصول')}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {tab === 'dashboard' && Dashboard}
      {tab === 'students' && Students}
      {tab === 'week' && <WeekGrid cfg={cfg} people={people} classes={classes} classId={classId} setClassId={setClassId} onOpen={setOpenStudent} />}
      {tab === 'sync' && canManage && <SyncPanel cfg={cfg} onChanged={() => { loadCfg(); loadRoster(); reload(); }} />}
      {wa && (() => {
        const dayRecs = (records || []).filter((r) => r.day === wa.day && r.kind === wa.kind && (!classId || studentMap.get(r.student_id)?.class_id === classId));
        const ids = Array.from(new Set(dayRecs.map((r) => r.student_id)));
        const recipients = ids.map((id) => { const s = studentMap.get(id); return { id, name: s?.name || id, phone: rosterIds.has(id) || !s ? '' : guardianPhone(s, users as User[]), note: classMap.get(s?.class_id || '') || '' }; })
          .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        const word = { absent: 'غياب', late: 'تأخر', excused: 'استئذان' }[wa.kind];
        const tpl = `السلام عليكم ورحمة الله
ولي أمر الطالب/ة {الطالب}
نفيدكم بتسجيل ${word} ابنكم/ابنتكم يوم {التاريخ}.
نأمل الحرص على الانتظام، وللاستفسار التواصل مع إدارة المدرسة.
{المدرسة}`;
        return (
          <WhatsAppSender title={t('رسائل واتساب لأولياء الأمور')} recipients={recipients} template={tpl} placeholders={['الطالب', 'التاريخ', 'المدرسة']}
            vars={{ 'التاريخ': new Date(`${wa.day}T12:00:00`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }), 'المدرسة': getPrintBrand().name || '' }}
            onClose={() => setWa(null)}
            extra={<div className="flex flex-wrap gap-2 pb-2">
              <input type="date" aria-label={t('التاريخ')} value={wa.day} max={today} onChange={(e) => setWa({ ...wa, day: e.target.value })} className="h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              <select aria-label={t('النوع')} value={wa.kind} onChange={(e) => setWa({ ...wa, kind: e.target.value as AttKind })} className="h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                {KINDS.map((k) => <option key={k.k} value={k.k}>{t(k.label)}</option>)}
              </select>
              <span className="self-center text-sm text-slate-500">{t('{n} طالب', { n: recipients.length })}</span>
            </div>} />
        );
      })()}
      {detail && (
        <KpiDetails kind={detail} recs={recs} students={students} per={stats.per} byClass={stats.byClass} days={stats.days} threshold={stats.threshold}
          studentMap={studentMap} classMap={classMap} rosterIds={rosterIds} range={range}
          onOpenStudent={(u) => setOpenStudent(u)} onNotify={(ids) => void notifyFlagged(ids)} onClose={() => setDetail(null)} />
      )}
      {openStudent && <StudentDrawer student={openStudent} className={classMap.get(openStudent.class_id || '') || ''} canManage={canManage} noAccount={rosterIds.has(openStudent.id)} onClose={() => setOpenStudent(null)} onChanged={reload} />}
    </div>
  );
};

// ---------------------------------------------------------------------
// تفاصيل بطاقات اللوحة: من غاب/تأخر/استأذن ومتى، المتجاوزون، ونسب الحضور
// ---------------------------------------------------------------------
const DETAIL_TITLE: Record<Detail, string> = { absent: 'أيام الغياب', late: 'مرات التأخر', excused: 'الاستئذان', flagged: 'تجاوزوا حد الغياب', rate: 'نسبة الحضور' };
const KpiDetails: React.FC<{
  kind: Detail; recs: AttRecord[]; students: User[]; per: Map<string, Record<AttKind, number>>;
  byClass: Array<{ id: string; name: string; students: number; absent: number; late: number; excused: number; rate: number }>;
  days: number; threshold: number; studentMap: Map<string, User>; classMap: Map<string, string>; rosterIds: Set<string>;
  range: { from: string; to: string }; onOpenStudent: (u: User) => void; onNotify: (ids: string[]) => void; onClose: () => void;
}> = ({ kind, recs, students, per, byClass, days, threshold, studentMap, classMap, rosterIds, range, onOpenStudent, onNotify, onClose }) => {
  const [view, setView] = useState<'students' | 'all'>('students');
  const [q, setQ] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const isKind = kind === 'absent' || kind === 'late' || kind === 'excused';
  const color = isKind ? KINDS.find((k) => k.k === kind)!.color : undefined;
  const cls = (id: string) => classMap.get(studentMap.get(id)?.class_id || '') || '';
  const nm = (id: string) => studentMap.get(id)?.name || id;
  const match = (id: string) => !q.trim() || nm(id).includes(q.trim()) || cls(id).includes(q.trim());
  const zero = { absent: 0, late: 0, excused: 0 } as Record<AttKind, number>;
  const rate = (id: string) => Math.max(0, 1 - (per.get(id)?.absent || 0) / days);

  // حسب الطالب لنوع الحركة، مع أيامها
  const kindRecs = isKind ? recs.filter((r) => r.kind === kind).sort((a, b) => b.day.localeCompare(a.day)) : [];
  const byStudent = useMemo(() => {
    const m = new Map<string, string[]>();
    kindRecs.forEach((r) => m.set(r.student_id, [...(m.get(r.student_id) || []), r.day]));
    return Array.from(m.entries()).map(([id, ds]) => ({ id, days: ds })).sort((a, b) => b.days.length - a.days.length || nm(a.id).localeCompare(nm(b.id), 'ar'));
  }, [kindRecs]); // eslint-disable-line react-hooks/exhaustive-deps
  const flagged = students.filter((s) => (per.get(s.id)?.absent || 0) >= threshold).sort((a, b) => (per.get(b.id)?.absent || 0) - (per.get(a.id)?.absent || 0));
  const lowest = students.filter((s) => (per.get(s.id)?.absent || 0) > 0).sort((a, b) => rate(a.id) - rate(b.id)).slice(0, 30);

  const exportRows = (): string[][] => {
    if (isKind && view === 'all') return [['التاريخ', 'الطالب', 'الفصل', 'المصدر', 'ملاحظة'], ...kindRecs.map((r) => [r.day, nm(r.student_id), cls(r.student_id), r.source === 'sheet' ? 'سجل الغياب' : 'المنصة', r.note])];
    if (isKind) return [['الطالب', 'الفصل', 'العدد', 'الأيام'], ...byStudent.map((x) => [nm(x.id), cls(x.id), String(x.days.length), x.days.join(' ')])];
    if (kind === 'flagged') return [['الطالب', 'الفصل', 'غياب', 'تأخر', 'استئذان', 'نسبة الحضور'], ...flagged.map((s) => { const p = per.get(s.id) || zero; return [s.name, cls(s.id), String(p.absent), String(p.late), String(p.excused), pct(rate(s.id))]; })];
    return [['الفصل', 'الطلاب', 'غياب', 'نسبة الحضور'], ...byClass.map((c) => [c.name, String(c.students), String(c.absent), pct(c.rate)])];
  };

  const Row: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
    const u = studentMap.get(id);
    return (
      <button type="button" onClick={() => u && onOpenStudent(u)} className="w-full flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate text-slate-900 dark:text-white">{nm(id)}</div>
          <div className="text-xs text-slate-500 truncate">{cls(id)}{rosterIds.has(id) ? ` · ${t('بدون حساب على المنصة')}` : ''}</div>
        </div>
        {children}
      </button>
    );
  };
  const empty = <p className="p-8 text-center text-sm text-slate-500">{t('لا توجد سجلات في هذه الفترة')}</p>;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={t(DETAIL_TITLE[kind])}>
      <div className="w-full sm:max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white inline-flex items-center gap-2">{color && <span className="w-3 h-3 rounded-full" style={{ background: color }} />}{t(DETAIL_TITLE[kind])}</h2>
            <p className="text-sm text-slate-500" dir="ltr" style={{ textAlign: 'end' }}>{range.from} → {range.to}</p>
          </div>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv(`attendance-${kind}-${range.from}-${range.to}.csv`, exportRows())}>{t('تصدير Excel')}</Button>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        {kind !== 'rate' && <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          {isKind && (
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {([['students', 'حسب الطالب'], ['all', 'كل الحركات']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setView(k)} className={`h-8 px-3 rounded-lg text-sm font-bold ${view === k ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t(l)}</button>
              ))}
            </div>
          )}
          {(
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="w-4 h-4 absolute top-2.5 start-3 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالاسم أو الفصل')} className="w-full h-9 ps-9 pe-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
            </div>
          )}
          {kind === 'flagged' && flagged.some((s) => !rosterIds.has(s.id)) && (
            <Button size="sm" variant="secondary" icon={Bell} onClick={() => onNotify(flagged.map((s) => s.id))}>{t('إشعار المتجاوزين وأولياء أمورهم')}</Button>
          )}
        </div>}
        <div className="flex-1 overflow-y-auto">
          {isKind && view === 'students' && (byStudent.filter((x) => match(x.id)).length === 0 ? empty : byStudent.filter((x) => match(x.id)).map((x) => (
            <Row key={x.id} id={x.id}>
              <div className="hidden sm:flex flex-wrap justify-end gap-1 max-w-[16rem]">
                {x.days.slice(0, 4).map((d) => <span key={d} className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{fmtDay(d)}</span>)}
                {x.days.length > 4 && <span className="text-[11px] text-slate-500">+{x.days.length - 4}</span>}
              </div>
              <span className="w-10 text-center text-lg font-extrabold tabular-nums" style={{ color }}>{x.days.length}</span>
            </Row>
          )))}
          {isKind && view === 'all' && (kindRecs.filter((r) => match(r.student_id)).length === 0 ? empty : kindRecs.filter((r) => match(r.student_id)).map((r) => (
            <Row key={r.id} id={r.student_id}>
              <div className="text-end">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmtDay(r.day)}</div>
                <div className="text-xs text-slate-500">{r.source === 'sheet' ? t('من سجل الغياب') : t('سُجّل من المنصة')}{r.note ? ` · ${r.note}` : ''}</div>
              </div>
            </Row>
          )))}
          {kind === 'flagged' && (flagged.filter((s) => match(s.id)).length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{t('لا يوجد طلاب تجاوزوا الحد في هذه الفترة')}</p> : flagged.filter((s) => match(s.id)).map((s) => {
            const p = per.get(s.id) || zero;
            return (
              <Row key={s.id} id={s.id}>
                {KINDS.map((k) => <span key={k.k} className="w-10 text-center text-sm tabular-nums font-semibold" style={{ color: k.color }} title={t(k.label)}>{p[k.k]}</span>)}
                <Chip tone={rateTone(rate(s.id))}><span dir="ltr">{pct(rate(s.id))}</span></Chip>
              </Row>
            );
          }))}
          {kind === 'rate' && (
            <>
              <h3 className="px-5 pt-4 pb-2 text-sm font-bold text-slate-700 dark:text-slate-200">{t('حسب الفصول')}</h3>
              {byClass.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] truncate text-slate-900 dark:text-white">{c.name}</div>
                    <div className="h-1.5 mt-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: pct(c.rate) }} /></div>
                  </div>
                  <span className="text-xs text-slate-500 text-end whitespace-nowrap">{t('{n} طالب', { n: c.students })} · {t('غياب {n}', { n: c.absent })}</span>
                  <Chip tone={rateTone(c.rate)}><span dir="ltr">{pct(c.rate)}</span></Chip>
                </div>
              ))}
              <h3 className="px-5 pt-5 pb-2 text-sm font-bold text-slate-700 dark:text-slate-200">{t('الأقل حضوراً')}</h3>
              {lowest.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-500">{t('لا يوجد غياب مسجل في هذه الفترة')}</p> : lowest.map((s) => (
                <Row key={s.id} id={s.id}>
                  <span className="text-xs text-slate-500">{t('غياب {n}', { n: per.get(s.id)?.absent || 0 })}</span>
                  <Chip tone={rateTone(rate(s.id))}><span dir="ltr">{pct(rate(s.id))}</span></Chip>
                </Row>
              ))}
              <p className="px-5 py-3 text-xs text-slate-500">{t('نسبة الحضور = 1 − (أيام الغياب ÷ أيام الدراسة {n})', { n: days })}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// سجل طالب: كل حركاته في الفصل، مع التسجيل اليدوي والحذف
// ---------------------------------------------------------------------
const StudentDrawer: React.FC<{ student: User; className: string; canManage: boolean; noAccount?: boolean; onClose: () => void; onChanged: () => void }> = ({ student, className, canManage, noAccount, onClose, onChanged }) => {
  const { currentUser, showToast, sendAttendanceNotice } = useApp();
  const [list, setList] = useState<AttRecord[] | null>(null);
  const [day, setDay] = useState(isoDay(new Date()));
  const [kind, setKind] = useState<AttKind>('absent');
  const [note, setNote] = useState('');
  const load = useCallback(() => { void fetchAttendance('2000-01-01', '2100-01-01', [student.id]).then((r) => setList(r || [])); }, [student.id]);
  useEffect(() => { load(); }, [load]);
  const counts = { absent: 0, late: 0, excused: 0 } as Record<AttKind, number>;
  (list || []).forEach((r) => counts[r.kind]++);
  const add = async () => {
    const r = await addAttendance({ student_id: student.id, day, kind, note: note.trim(), created_by: currentUser?.id || '' });
    if (!r.ok) return showToast(r.error?.includes('duplicate') ? t('هذه الحركة مسجلة مسبقاً لهذا اليوم') : t('تعذر الحفظ'), 'error');
    setNote(''); load(); onChanged();
  };
  const del = async (id: number) => { if (!window.confirm(t('حذف هذه الحركة؟'))) return; await deleteAttendance(id); load(); onChanged(); };
  const printReport = async () => {
    const rows = (list || []).map((r, i) => `<tr><td>${i + 1}</td><td>${escH(fmtDay(r.day))}</td><td>${escH(t(KIND_LABEL[r.kind]))}</td><td>${escH(r.source === 'sheet' ? t('من سجل الغياب') : t('سُجّل من المنصة'))}</td><td>${escH(r.note)}</td></tr>`).join('');
    const bodyHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${pdfBox(t('الطالب'), student.name)}${pdfBox(t('الفصل'), className || '—')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${KINDS.map((k) => pdfBox(t(k.label), String(counts[k.k]), k.color)).join('')}${pdfBox(t('المجموع'), String(counts.absent + counts.late + counts.excused))}</div>
      <table class="pdf-table"><thead><tr><th>#</th><th>${escH(t('التاريخ'))}</th><th>${escH(t('النوع'))}</th><th>${escH(t('المصدر'))}</th><th>${escH(t('ملاحظة'))}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">${escH(t('لا توجد حركات مسجلة'))}</td></tr>`}</tbody></table>
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px"><span>${escH(t('وكيل شؤون الطلاب'))}: ....................</span><span>${escH(t('توقيع ولي الأمر'))}: ....................</span></div>`;
    try { await exportElementToPdf({ bodyHtml, orientation: 'portrait', title: t('سجل حضور: {name}', { name: student.name }), subtitle: className }); }
    catch (e: any) { showToast(e?.message || t('تعذر تصدير PDF'), 'error'); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={student.name}>
      <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{student.name}</h2>
            <p className="text-sm text-slate-500">{className}{noAccount ? ` · ${t('بدون حساب على المنصة')}` : ''}</p>
          </div>
          <Button size="sm" variant="secondary" icon={FileDown} disabled={list === null} onClick={() => void printReport()}>{t('تقرير PDF')}</Button>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 p-5">
          {KINDS.map((k) => (
            <div key={k.k} className="rounded-xl p-3 text-center" style={{ background: `${k.color}14` }}>
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: k.color }}>{counts[k.k]}</div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t(k.label)}</div>
            </div>
          ))}
        </div>
        {canManage && (
          <div className="px-5 pb-4 space-y-2">
            <div className="flex gap-2">
              <input type="date" aria-label={t('التاريخ')} value={day} onChange={(e) => setDay(e.target.value)} className="flex-1 h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              <select aria-label={t('النوع')} value={kind} onChange={(e) => setKind(e.target.value as AttKind)} className="h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                {KINDS.map((k) => <option key={k.k} value={k.k}>{t(k.label)}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('ملاحظة (اختياري)')} className="flex-1 h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              <Button size="sm" icon={Plus} onClick={() => void add()}>{t('تسجيل')}</Button>
            </div>
            {!noAccount && <Button size="sm" variant="secondary" icon={Bell} className="w-full" onClick={async () => {
              const ok = await sendAttendanceNotice([student.id], 'متابعة الحضور', `سجل الحضور: غياب ${counts.absent}، تأخر ${counts.late}، استئذان ${counts.excused}. نأمل الحرص على الانتظام.`, true);
              showToast(ok ? t('أُرسل الإشعار') : t('تعذر الإرسال'), ok ? 'success' : 'error');
            }}>{t('إشعار الطالب وولي الأمر')}</Button>}
          </div>
        )}
        <div className="flex-1 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
          {list === null ? <p className="p-5 text-sm text-slate-500">{t('جارٍ التحميل…')}</p> : list.length === 0 ? <p className="p-5 text-sm text-slate-500">{t('لا توجد حركات مسجلة')}</p> : list.map((r) => {
            const k = KINDS.find((x) => x.k === r.kind)!;
            return (
              <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: k.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{t(k.label)} · {fmtDay(r.day)}</div>
                  <div className="text-xs text-slate-500">{r.source === 'sheet' ? t('من سجل الغياب') : t('سُجّل من المنصة')}{r.note ? ` · ${r.note}` : ''}</div>
                </div>
                {canManage && r.source === 'manual' && <button type="button" onClick={() => void del(r.id)} aria-label={t('حذف')} className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// الربط والاستيراد: تاريخ بداية الفصل، رفع ملف Excel، ربط Google Sheets، والأسماء غير المطابقة
// ---------------------------------------------------------------------
const SyncPanel: React.FC<{ cfg: AttConfig | null; onChanged: () => void }> = ({ cfg, onChanged }) => {
  const { users, classes, showToast } = useApp();
  const [start, setStart] = useState(cfg?.start_date || '');
  const [weeks, setWeeks] = useState(cfg?.weeks || 18);
  const [threshold, setThreshold] = useState(cfg?.threshold || 3);
  const [autoNotify, setAutoNotify] = useState(cfg?.auto_notify ?? true);
  const [weeklyDigest, setWeeklyDigest] = useState(cfg?.weekly_digest ?? true);
  const [mapping, setMapping] = useState<Record<string, string>>(cfg?.sheet_classes || {});
  const [labels, setLabels] = useState<Record<string, string>>(cfg?.sheet_labels || {});
  const [parsed, setParsed] = useState<SheetPayload | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (cfg) { setStart(cfg.start_date || ''); setWeeks(cfg.weeks); setThreshold(cfg.threshold); setAutoNotify(cfg.auto_notify ?? true); setWeeklyDigest(cfg.weekly_digest ?? true); setMapping(cfg.sheet_classes || {}); setLabels(cfg.sheet_labels || {}); } }, [cfg]);
  const students = useMemo(() => (users as User[]).filter((u) => u.role === 'student').sort((a, b) => a.name.localeCompare(b.name, 'ar')), [users]);
  // أسماء الشيتات: من الملف المرفوع، أو الإعداد المحفوظ، أو آخر مزامنة (أسماء لم تُطابق)
  const sheetNames = Array.from(new Set([...(parsed?.sheets.map((s) => s.sheet) || []), ...Object.keys(mapping), ...(cfg?.unmatched.map((u) => u.sheet) || []), ...Object.keys(cfg?.sheets || {})]))
    .sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));

  const save = async (extra?: Partial<AttConfig>) => {
    if (start && new Date(`${start}T12:00:00`).getDay() !== 0 && !window.confirm(t('تاريخ بداية الفصل ليس يوم أحد. الأسبوع الأول في السجل يبدأ يوم الأحد، متابعة؟'))) return false;
    const r = await saveAttendanceConfig({ start_date: start || null, weeks, threshold, sheet_classes: mapping, sheet_labels: labels, auto_notify: autoNotify, weekly_digest: weeklyDigest, ...extra });
    showToast(r.ok ? t('حُفظ الإعداد') : t(ERR[r.error || ''] || 'تعذر الحفظ'), r.ok ? 'success' : 'error');
    if (r.ok) onChanged();
    return r.ok;
  };

  const pickFile = async (file?: File) => {
    if (!file) return;
    setResult(null);
    try {
      const p = await parseAttendanceWorkbook(file);
      if (!p.sheets.length) return showToast(t(ERR.bad_payload), 'error');
      setParsed(p);
    } catch { showToast(t('تعذرت قراءة الملف'), 'error'); }
  };

  const runImport = async () => {
    if (!parsed) return;
    if (!start) return showToast(t(ERR.no_start_date), 'error');
    setBusy(true);
    if (!(await save())) { setBusy(false); return; }
    const r = await importAttendance(parsed);
    setBusy(false);
    if (r.error) return showToast(t(ERR[r.error] || 'تعذر الاستيراد'), 'error');
    setResult(r.result!); onChanged();
  };

  const genToken = async () => {
    if (cfg?.has_token && !window.confirm(t('إنشاء رمز جديد يوقف الرمز القديم، وستحتاج لصق الكود من جديد في الشيت. متابعة؟'))) return;
    const r = await newAttendanceToken();
    if (r.token) { setToken(r.token); onChanged(); } else showToast(t(ERR[r.error || ''] || 'تعذر إنشاء الرمز'), 'error');
  };
  const code = token ? appsScriptCode(supabaseUrl, supabaseAnonKey, token) : '';
  const fmtAt = (s: string) => new Date(s).toLocaleString(isEn() ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <div className="space-y-5">
        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('١) إعداد الفصل الدراسي')}</h2>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{t('تاريخ أول يوم (الأحد) في «الأسبوع (1)» من السجل')}
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{t('عدد الأسابيع')}
              <input type="number" min={1} max={30} value={weeks} onChange={(e) => setWeeks(Number(e.target.value) || 18)} className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{t('حد التنبيه (أيام غياب)')}
              <input type="number" min={1} max={60} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 3)} className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" />
            </label>
          </div>
          <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="checkbox" checked={autoNotify} onChange={(e) => setAutoNotify(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
              <span><b>{t('تنبيه تلقائي لولي الأمر')}</b><br /><span className="text-xs text-slate-500">{t('عند بلوغ غياب الطالب {n} أيام (ثم {m}، …) يصل إشعار للطالب وولي أمره تلقائياً.', { n: threshold, m: threshold * 2 })}</span></span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="checkbox" checked={weeklyDigest} onChange={(e) => setWeeklyDigest(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
              <span><b>{t('ملخص أسبوعي للإدارة')}</b><br /><span className="text-xs text-slate-500">{t('بعد نهاية كل أسبوع دراسي يصل للمدير وأصحاب صلاحية الحضور إشعار بنسبة الحضور والغياب والمتجاوزين.')}</span></span>
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('المنصة تحوّل «الأسبوع ٣، الثلاثاء» في السجل إلى تاريخه الفعلي بناءً على هذا التاريخ.')}</p>
          <Button onClick={() => void save()}>{t('حفظ الإعداد')}</Button>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('٢) رفع ملف السجل (Excel)')}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('من Google Sheets: ملف ← تنزيل ← Microsoft Excel، ثم ارفعه هنا. تُقرأ كل الشيتات (شيت لكل صف دراسي) وتُطابق الأسماء مع طلاب المنصة.')}</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>{t('اختيار ملف')}</Button>
          {parsed && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('وُجد {s} شيت فيها {n} طالب و{m} علامة', { s: parsed.sheets.length, n: parsed.sheets.reduce((a, x) => a + x.students.length, 0), m: parsed.sheets.reduce((a, x) => a + x.students.reduce((b, y) => b + y.marks.length, 0), 0) })}</p>
              <p className="text-xs text-slate-500">{t('حدد نوع طلاب كل شيت من بطاقة «الشيتات ونوع طلابها» قبل الاستيراد.')}</p>
              <Button onClick={() => void runImport()} disabled={busy} icon={Upload}>{busy ? t('جارٍ الاستيراد…') : t('استيراد إلى المنصة')}</Button>
            </div>
          )}
          {result && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-900 dark:text-emerald-200 space-y-1" role="status">
              <div className="font-bold inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{t('تم الاستيراد')}</div>
              <div>{t('طوبق {n} طالب، وسُجّلت {m} حركة', { n: result.matched, m: result.marks })}</div>
              {!!result.roster && <div>{t('منهم {n} طالب في «سجل فقط» بدون حسابات', { n: result.roster })}</div>}
              {result.unmatched.length > 0 && <div className="text-amber-800 dark:text-amber-300">{t('{n} اسم لم يُطابق، اربطها من القائمة المجاورة', { n: result.unmatched.length })}</div>}
            </div>
          )}
        </Card>

        {sheetNames.length > 0 && (
          <Card className="p-5 space-y-3">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('الشيتات ونوع طلابها')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('لكل شيت في سجل الغياب: هل طلابه لهم حسابات على المنصة؟ مثلاً صفوف نافس (الثالث والسادس) لهم حسابات، وباقي صفوف الابتدائي بدون حسابات وتُسجَّل في الحضور فقط.')}</p>
            {sheetNames.map((sh) => {
              const roster = mapping[sh] === ROSTER_SHEET;
              const info = cfg?.sheets?.[sh];
              const seg = (on: boolean) => `h-9 px-3 rounded-lg text-sm font-bold transition ${on ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'}`;
              return (
                <div key={sh} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <div className="flex-1 min-w-[7rem]">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate" title={sh}>{sh}</div>
                    {info && <div className="text-xs text-slate-500">{t('{n} طالب', { n: info.students })}{!roster && info.unmatched > 0 ? ` · ${t('{n} لم يُطابق', { n: info.unmatched })}` : ''}</div>}
                  </div>
                  <div role="radiogroup" aria-label={sh} className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                    <button type="button" role="radio" aria-checked={!roster} className={seg(!roster)} onClick={() => setMapping((m) => ({ ...m, [sh]: roster ? '' : (m[sh] || '') }))}>{t('طلابه لهم حسابات')}</button>
                    <button type="button" role="radio" aria-checked={roster} className={seg(roster)} onClick={() => setMapping((m) => ({ ...m, [sh]: ROSTER_SHEET }))}>{t('بدون حسابات (حضور فقط)')}</button>
                  </div>
                  {roster && (
                    <label className="w-full flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span className="shrink-0">{t('اسم الفصل')}</span>
                      <input value={labels[sh] || ''} onChange={(e) => setLabels((l) => ({ ...l, [sh]: e.target.value }))} placeholder={t(rosterClassName(sh))} maxLength={60}
                        className="flex-1 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-normal" />
                    </label>
                  )}
                </div>
              );
            })}
            <Button onClick={() => void save()}>{t('حفظ')}</Button>
          </Card>
        )}

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('٣) الربط الحي مع Google Sheets')}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('بعد الربط، أي علامة ✓ تضعها في الشيت تظهر في المنصة خلال ثوانٍ.')}</p>
          <ol className="text-sm text-slate-700 dark:text-slate-200 list-decimal ps-5 space-y-1">
            <li>{t('اضغط «إنشاء رمز الربط» وانسخ الكود الذي يظهر')}</li>
            <li>{t('في الشيت: الإضافات ← Apps Script، احذف الموجود والصق الكود واحفظ')}</li>
            <li>{t('اختر الدالة setup واضغط «تشغيل» مرة واحدة ووافق على الأذونات')}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={KeyRound} onClick={() => void genToken()}>{cfg?.has_token ? t('إنشاء رمز جديد') : t('إنشاء رمز الربط')}</Button>
            {cfg?.has_token && !token && <Chip tone="ok"><Link2 className="w-3.5 h-3.5" />{t('مربوط')}</Chip>}
          </div>
          {code && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('انسخ الكود الآن، فالرمز لا يظهر مرة أخرى.')}</p>
              <textarea readOnly value={code} dir="ltr" rows={8} className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono" onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard.writeText(code); showToast(t('نُسخ الكود'), 'success'); }}>{t('نسخ الكود')}</Button>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('أسماء لم تُطابق')}</h2>
          {!cfg?.unmatched.length ? <p className="text-sm text-slate-500">{t('كل الأسماء مطابقة لطلاب المنصة')}</p> : (
            <>
              <p className="text-xs text-slate-500">{t('اختر الطالب المقصود مرة واحدة، وتتذكره المنصة في كل مزامنة.')}</p>
              {cfg.unmatched.map((u) => <UnmatchedRow key={u.sheet + u.name} u={u} students={students} classes={classes} onDone={onChanged} />)}
            </>
          )}
          {!!cfg?.ignored?.length && (
            <details className="pt-1">
              <summary className="text-xs font-semibold text-slate-500 cursor-pointer">{t('أسماء متجاهَلة ({n})', { n: cfg.ignored.length })}</summary>
              <div className="mt-2 space-y-1">
                {cfg.ignored.map((n) => (
                  <div key={n} className="flex items-center justify-between gap-2 text-sm py-1">
                    <span className="text-slate-700 dark:text-slate-200">{n}</span>
                    <button type="button" className="text-xs font-bold text-indigo-600 hover:underline" onClick={async () => { const r = await unmatchedAction('', n, 'unignore'); if (r.ok) { showToast(t('أُلغي التجاهل، يظهر الاسم مع المزامنة القادمة'), 'success'); onChanged(); } }}>{t('إلغاء التجاهل')}</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>
        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('سجل المزامنة')}</h2>
            {!!cfg?.log.length && <button type="button" className="text-xs font-bold text-rose-600 hover:underline" onClick={async () => { if (!window.confirm(t('مسح سجل المزامنة كله؟ (لا يحذف أي حركات حضور)'))) return; const r = await clearSyncLog(); if (r.ok) onChanged(); }}>{t('مسح السجل')}</button>}
          </div>
          {!cfg?.log.length ? <p className="text-sm text-slate-500">{t('لا توجد مزامنات بعد')}</p> : cfg.log.map((l, i) => (
            <div key={l.id ?? i} className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <Chip tone={l.source === 'sheet_sync' ? 'info' : 'muted'}>{l.source === 'sheet_sync' ? t('من الشيت') : t('رفع ملف')}</Chip>
              <span className="flex-1 text-slate-700 dark:text-slate-200">{t('{n} طالب · {m} حركة', { n: l.summary.matched, m: l.summary.marks })}{l.summary.unmatched ? ` · ${t('{n} غير مطابق', { n: l.summary.unmatched })}` : ''}</span>
              <span className="text-xs text-slate-500">{fmtAt(l.at)}</span>
              {l.id != null && <button type="button" aria-label={t('حذف')} title={t('حذف')} onClick={async () => { const r = await clearSyncLog(l.id); if (r.ok) onChanged(); }} className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"><X className="w-4 h-4" /></button>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

const UnmatchedRow: React.FC<{ u: { sheet: string; name: string; count: number }; students: User[]; classes: Array<{ id: string; name: string }>; onDone: () => void }> = ({ u, students, classes, onDone }) => {
  const { showToast } = useApp();
  const [sel, setSel] = useState('');
  const first = u.name.split(/\s+/)[0];
  const options = useMemo(() => {
    const near = students.filter((s) => s.name.includes(first));
    return [...near, ...students.filter((s) => !near.includes(s))];
  }, [students, first]);
  const cls = new Map(classes.map((c) => [c.id, c.name]));
  const act = async (a: 'ignore' | 'roster') => {
    if (a === 'ignore' && !window.confirm(t('تجاهل «{n}»؟ لن يظهر هنا ولن تُسجَّل حركاته في المزامنات القادمة (يمكن إلغاء التجاهل لاحقاً).', { n: u.name }))) return;
    const r = await unmatchedAction(u.sheet, u.name, a);
    if (!r.ok) return showToast(t('تعذر الحفظ'), 'error');
    showToast(a === 'roster' ? t('سُجّل بدون حساب وسُجّلت {n} حركة', { n: r.applied }) : t('تم التجاهل'), 'success');
    onDone();
  };
  const link = async () => {
    if (!sel) return;
    const r = await linkAttendanceName(u.sheet, u.name, sel);
    if (r.ok) { showToast(t('رُبط الاسم وسُجّلت {n} حركة', { n: r.applied }), 'success'); onDone(); } else showToast(t('تعذر الربط'), 'error');
  };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm text-slate-900 dark:text-white">{u.name}</span>
        <span className="text-xs text-slate-500">{u.sheet} · {t('{n} حركة', { n: u.count })}</span>
      </div>
      <div className="flex gap-2">
        <select aria-label={t('الطالب في المنصة')} value={sel} onChange={(e) => setSel(e.target.value)} className="flex-1 h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
          <option value="">{t('اختر الطالب في المنصة')}</option>
          {options.map((s) => <option key={s.id} value={s.id}>{s.name}{cls.get(s.class_id || '') ? ` — ${cls.get(s.class_id || '')}` : ''}</option>)}
        </select>
        <Button size="sm" icon={Link2} disabled={!sel} onClick={() => void link()}>{t('ربط')}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void act('roster')} className="h-8 px-3 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">{t('تسجيل بدون حساب')}</button>
        <button type="button" onClick={() => void act('ignore')} className="h-8 px-3 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />{t('تجاهل')}</button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// عرض الأسبوع: نفس شكل سجل الغياب (الطلاب × الأحد–الخميس) لأسبوع واحد
// ---------------------------------------------------------------------
const WeekGrid: React.FC<{ cfg: AttConfig | null; people: User[]; classes: Klass[]; classId: string; setClassId: (v: string) => void; onOpen: (u: User) => void }> = ({ cfg, people, classes, classId, setClassId, onOpen }) => {
  const start = cfg?.start_date ? new Date(`${cfg.start_date}T12:00:00`) : null;
  const currentWeek = start ? Math.min(cfg!.weeks, Math.max(1, Math.floor((Date.now() - start.getTime()) / (7 * 864e5)) + 1)) : 1;
  const [week, setWeek] = useState(currentWeek);
  useEffect(() => { setWeek(currentWeek); }, [currentWeek]);
  const sunday = useMemo(() => {
    if (start) { const d = new Date(start); d.setDate(d.getDate() + (week - 1) * 7); return d; }
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d;
  }, [start?.getTime(), week]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = [0, 1, 2, 3, 4].map((i) => { const d = new Date(sunday); d.setDate(d.getDate() + i); return isoDay(d); });
  const [recs, setRecs] = useState<AttRecord[] | null>(null);
  useEffect(() => { setRecs(null); void fetchAttendance(days[0], days[4]).then((r) => setRecs(r || [])); }, [days[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const cid = classId || classes[0]?.id || '';
  const list = people.filter((u) => u.class_id === cid).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const cell = new Map<string, AttKind[]>();
  (recs || []).forEach((r) => { const k = `${r.student_id}|${r.day}`; cell.set(k, [...(cell.get(k) || []), r.kind]); });
  const totals = (id: string) => days.reduce((a, d) => a + (cell.get(`${id}|${d}`)?.length || 0), 0);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100 dark:border-slate-800">
        <select aria-label={t('الفصل')} value={cid} onChange={(e) => setClassId(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {start && (
          <select aria-label={t('الأسبوع')} value={week} onChange={(e) => setWeek(Number(e.target.value))} className="h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
            {Array.from({ length: cfg!.weeks }, (_, i) => <option key={i + 1} value={i + 1}>{t('الأسبوع {n}', { n: i + 1 })}</option>)}
          </select>
        )}
        <div className="flex gap-3 text-xs text-slate-600 dark:text-slate-300 ms-auto">{KINDS.map((k) => <span key={k.k} className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded-md text-white text-[11px] font-bold flex items-center justify-center" style={{ background: k.color }}>{t(k.label)[0]}</span>{t(k.label)}</span>)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-slate-500 text-xs border-b border-slate-100 dark:border-slate-800">
            <th className="text-start px-4 py-2.5 w-10">#</th><th className="text-start">{t('الاسم')}</th>
            {days.map((d) => <th key={d} className="px-2 py-2.5 text-center">{new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'long' })}<div className="font-normal text-[11px]">{new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'numeric' })}</div></th>)}
            <th className="px-3 text-center">{t('المجموع')}</th>
          </tr></thead>
          <tbody>
            {list.map((s, i) => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => onOpen(s)}>
                <td className="px-4 py-2 text-slate-500 tabular-nums">{i + 1}</td>
                <td className="font-semibold text-slate-900 dark:text-white">{s.name}</td>
                {days.map((d) => (
                  <td key={d} className="text-center">
                    <span className="inline-flex gap-1">{(cell.get(`${s.id}|${d}`) || []).map((k) => { const kk = KINDS.find((x) => x.k === k)!; return <span key={k} title={t(kk.label)} className="w-6 h-6 rounded-md text-white text-xs font-bold inline-flex items-center justify-center" style={{ background: kk.color }}>{t(kk.label)[0]}</span>; })}</span>
                  </td>
                ))}
                <td className="text-center tabular-nums font-bold">{totals(s.id) || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recs === null && <p className="p-5 text-sm text-slate-500">{t('جارٍ التحميل…')}</p>}
        {!list.length && <p className="p-5 text-sm text-slate-500">{t('لا يوجد طلاب في هذا الفصل')}</p>}
      </div>
    </Card>
  );
};
