import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Upload, Link2, Copy, KeyRound, Search, Bell, Trash2, Plus, X, RefreshCw, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import { shortName } from '../../utils/names';
import { AttKind, parseAttendanceWorkbook, appsScriptCode, SheetPayload } from '../../utils/attendanceSheet';
import {
  AttConfig, AttRecord, ImportResult, RosterStudent, ROSTER_SHEET, rosterClassId, rosterClassName, fetchRoster, addAttendance, deleteAttendance, fetchAttendance, fetchAttendanceConfig,
  importAttendance, isoDay, linkAttendanceName, newAttendanceToken, saveAttendanceConfig, schoolDaysBetween,
} from '../../services/attendanceService';
import { supabaseUrl, supabaseAnonKey } from '../../services/supabase';
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
/** طلاب المنصة + طلاب «سجل فقط» (بلا حسابات) في شكل واحد، وفصولهم */
function usePeople(roster: RosterStudent[]) {
  const { users, classes } = useApp();
  return useMemo(() => {
    const platform = (users as User[]).filter((u) => u.role === 'student');
    const extra = roster.map((r) => ({ id: r.id, name: r.name, role: 'student', class_id: rosterClassId(r.sheet) } as unknown as User));
    const sheets = Array.from(new Set(roster.map((r) => r.sheet))).sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
    const allClasses: Klass[] = [...classes.map((c) => ({ id: c.id, name: c.name })), ...sheets.map((sh) => ({ id: rosterClassId(sh), name: t(rosterClassName(sh)) }))];
    return { people: [...platform, ...extra], allClasses, rosterIds: new Set(roster.map((r) => r.id)) };
  }, [users, classes, roster]);
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

/** الحضور والغياب: لوحة وتحليلات، سجل الطلاب، والربط مع سجل الغياب (Google Sheets / Excel) */
export const AttendancePage: React.FC = () => {
  const { currentUser, showToast, sendAttendanceNotice } = useApp();
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const loadRoster = useCallback(() => { void fetchRoster().then(setRoster); }, []);
  useEffect(() => { loadRoster(); }, [loadRoster]);
  const { people, allClasses: classes, rosterIds } = usePeople(roster);
  const canManage = hasPerm(currentUser, 'can_manage_attendance');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [cfg, setCfg] = useState<AttConfig | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const today = isoDay(new Date());
  const [customFrom, setCustomFrom] = useState(isoDay(new Date(Date.now() - 30 * 864e5)));
  const [customTo, setCustomTo] = useState(today);
  const [classId, setClassId] = useState('');
  const [records, setRecords] = useState<AttRecord[] | null>(null);
  const [q, setQ] = useState('');
  const [openStudent, setOpenStudent] = useState<User | null>(null);

  const loadCfg = useCallback(() => { void fetchAttendanceConfig().then(setCfg); }, []);
  useEffect(() => { loadCfg(); }, [loadCfg]);

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
    const blob = new Blob(['﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `attendance-${range.from}-${range.to}.csv`; a.click();
  };

  const Kpi: React.FC<{ label: string; value: React.ReactNode; hint?: string; color?: string }> = ({ label, value, hint, color }) => (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}{label}</div>
      <div className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</div>}
    </Card>
  );

  const chartTip = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, direction: uiDir() as any } };
  const loading = records === null;

  const Dashboard = (
    <div className="space-y-5">
      {!cfg?.start_date && (
        <Card className="p-4 flex items-center gap-3 border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-200 flex-1">{t('لم يُربط سجل الغياب بعد. حدد تاريخ بداية الفصل وارفع الملف أو اربط Google Sheets من تبويب «الربط والاستيراد».')}</p>
          {canManage && <Button size="sm" onClick={() => setTab('sync')}>{t('الربط والاستيراد')}</Button>}
        </Card>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label={t('نسبة الحضور')} value={loading ? '…' : <span dir="ltr">{Math.round(stats.rate * 1000) / 10}%</span>} hint={t('{n} يوم دراسي', { n: stats.days })} />
        <Kpi label={t('أيام الغياب')} value={stats.count.absent} color={KINDS[0].color} />
        <Kpi label={t('مرات التأخر')} value={stats.count.late} color={KINDS[1].color} />
        <Kpi label={t('الاستئذان')} value={stats.count.excused} color={KINDS[2].color} />
        <Kpi label={t('تجاوزوا حد الغياب')} value={stats.flagged.length} hint={t('{n} أيام غياب فأكثر', { n: stats.threshold })} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('الحضور يوماً بيوم')}</h2>
            <div className="flex gap-3 text-xs text-slate-600 dark:text-slate-300">{KINDS.map((k) => <span key={k.k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: k.color }} />{t(k.label)}</span>)}</div>
          </div>
          {stats.series.length ? (
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTip} formatter={(v: any, n: any) => [v, t(KIND_LABEL[n as AttKind] || n)]} />
                  {KINDS.map((k, i) => <Bar key={k.k} dataKey={k.k} stackId="a" fill={k.color} radius={i === 2 ? [4, 4, 0, 0] : 0} />)}
                </BarChart>
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

      {stats.weekSeries.length > 0 && (
        <Card className="p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3">{t('حسب أسابيع السجل')}</h2>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.weekSeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip {...chartTip} formatter={(v: any, n: any) => [v, t(KIND_LABEL[n as AttKind] || n)]} />
                {KINDS.map((k, i) => <Bar key={k.k} dataKey={k.k} stackId="w" fill={k.color} radius={i === 2 ? [4, 4, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('الأكثر غياباً')}</h2>
            {stats.flagged.some((x) => !rosterIds.has(x.id)) && <Button size="sm" variant="secondary" icon={Bell} onClick={() => void notifyFlagged(stats.flagged.map((x) => x.id))}>{t('إشعار المتجاوزين وأولياء أمورهم')}</Button>}
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
        actions={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => { reload(); loadCfg(); loadRoster(); }}>{t('تحديث')}</Button>} />

      <div className="flex flex-wrap items-center gap-2">
        {([['dashboard', 'اللوحة'], ['students', 'سجل الطلاب'], ['week', 'عرض الأسبوع'], ...(canManage ? [['sync', 'الربط والاستيراد']] : [])] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 px-4 rounded-xl text-sm font-bold ${tab === k ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>{t(l)}</button>
        ))}
        {(tab === 'dashboard' || tab === 'students') && (
          <div className="flex flex-wrap items-center gap-2 ms-auto">
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
      {openStudent && <StudentDrawer student={openStudent} className={classMap.get(openStudent.class_id || '') || ''} canManage={canManage} noAccount={rosterIds.has(openStudent.id)} onClose={() => setOpenStudent(null)} onChanged={reload} />}
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
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={student.name}>
      <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{student.name}</h2>
            <p className="text-sm text-slate-500">{className}{noAccount ? ` · ${t('بدون حساب على المنصة')}` : ''}</p>
          </div>
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
  const [mapping, setMapping] = useState<Record<string, string>>(cfg?.sheet_classes || {});
  const [parsed, setParsed] = useState<SheetPayload | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (cfg) { setStart(cfg.start_date || ''); setWeeks(cfg.weeks); setThreshold(cfg.threshold); setMapping(cfg.sheet_classes || {}); } }, [cfg]);
  const students = useMemo(() => (users as User[]).filter((u) => u.role === 'student').sort((a, b) => a.name.localeCompare(b.name, 'ar')), [users]);
  const sheetNames = Array.from(new Set([...(parsed?.sheets.map((s) => s.sheet) || []), ...Object.keys(mapping)]));

  const save = async (extra?: Partial<AttConfig>) => {
    if (start && new Date(`${start}T12:00:00`).getDay() !== 0 && !window.confirm(t('تاريخ بداية الفصل ليس يوم أحد. الأسبوع الأول في السجل يبدأ يوم الأحد، متابعة؟'))) return false;
    const r = await saveAttendanceConfig({ start_date: start || null, weeks, threshold, sheet_classes: mapping, ...extra });
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
              <p className="text-xs text-slate-500">{t('اربط كل شيت بفصله في المنصة (اختياري، يساعد عند تشابه الأسماء):')}</p>
              {sheetNames.map((sh) => (
                <div key={sh} className="flex items-center gap-2">
                  <span className="w-28 text-sm font-semibold truncate">{sh}</span>
                  <select value={mapping[sh] || ''} onChange={(e) => setMapping((m) => ({ ...m, [sh]: e.target.value }))} className="flex-1 h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    <option value="">{t('طلاب المنصة (كل المدرسة)')}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{t('طلاب المنصة: {c}', { c: c.name })}</option>)}
                    <option value={ROSTER_SHEET}>{t('سجل فقط (طلاب بدون حسابات)')}</option>
                  </select>
                </div>
              ))}
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
        </Card>
        <Card className="p-5 space-y-2">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('سجل المزامنة')}</h2>
          {!cfg?.log.length ? <p className="text-sm text-slate-500">{t('لا توجد مزامنات بعد')}</p> : cfg.log.map((l, i) => (
            <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <Chip tone={l.source === 'sheet_sync' ? 'info' : 'muted'}>{l.source === 'sheet_sync' ? t('من الشيت') : t('رفع ملف')}</Chip>
              <span className="flex-1 text-slate-700 dark:text-slate-200">{t('{n} طالب · {m} حركة', { n: l.summary.matched, m: l.summary.marks })}{l.summary.unmatched ? ` · ${t('{n} غير مطابق', { n: l.summary.unmatched })}` : ''}</span>
              <span className="text-xs text-slate-500">{fmtAt(l.at)}</span>
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
