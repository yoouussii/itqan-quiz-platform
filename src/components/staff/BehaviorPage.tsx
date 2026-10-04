import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Search, Plus, X, Trash2, FileDown, Download, ThumbsUp, AlertTriangle, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import {
  BehaviorConfig, BehaviorRecord, BehaviorKind, DEFAULT_BEHAVIOR_CONFIG, DEGREE_LABEL,
  addBehavior, conductScore, deleteBehavior, fetchBehavior, fetchBehaviorConfig, saveBehaviorConfig,
} from '../../services/behaviorService';
import { AttRecord, fetchAttendance, fetchAttendanceConfig, fetchRoster, isoDay, rosterClassId, rosterClassName, RosterStudent } from '../../services/attendanceService';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t, dateLocale } from '../../i18n';
import type { User } from '../../types';

type Tab = 'students' | 'log' | 'settings';
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tone = (v: number, max: number) => (v >= max * 0.95 ? 'ok' : v >= max * 0.8 ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad';
const num = (n: number) => String(Math.round(n * 100) / 100);
const DEG_COLOR: Record<number, string> = { 1: '#f59e0b', 2: '#f97316', 3: '#ef4444', 4: '#dc2626', 5: '#991b1b' };

/** السلوك والمواظبة: درجات الطلاب، تسجيل المخالفات والسلوك الإيجابي، والسجل والإعداد */
export const BehaviorPage: React.FC = () => {
  const { currentUser, users, classes } = useApp();
  const canRecord = hasPerm(currentUser, 'can_record_behavior');
  const isAdmin = currentUser?.role === 'admin';
  const [tab, setTab] = useState<Tab>('students');
  const [cfg, setCfg] = useState<BehaviorConfig>(DEFAULT_BEHAVIOR_CONFIG);
  const [recs, setRecs] = useState<BehaviorRecord[] | null>(null);
  const [att, setAtt] = useState<AttRecord[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<User | null>(null);

  const load = useCallback(() => {
    void fetchBehaviorConfig().then(setCfg);
    void fetchBehavior().then(setRecs);
    void fetchRoster().then(setRoster);
    void fetchAttendanceConfig().then((c) => fetchAttendance(c?.start_date || '2000-01-01', isoDay(new Date()))).then((r) => setAtt(r || []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const people = useMemo(() => {
    const platform = (users as User[]).filter((u) => u.role === 'student');
    const extra = roster.map((r) => ({ id: r.id, name: r.name, role: 'student', class_id: rosterClassId(r.sheet) } as unknown as User));
    return [...platform, ...extra];
  }, [users, roster]);
  const allClasses = useMemo(() => {
    const sheets = Array.from(new Set(roster.map((r) => r.sheet)));
    return [...classes.map((c) => ({ id: c.id, name: c.name })), ...sheets.map((s) => ({ id: rosterClassId(s), name: t(rosterClassName(s)) }))];
  }, [classes, roster]);
  const classMap = useMemo(() => new Map(allClasses.map((c) => [c.id, c.name])), [allClasses]);
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const byStudent = useMemo(() => {
    const b = new Map<string, BehaviorRecord[]>(); (recs || []).forEach((r) => b.set(r.student_id, [...(b.get(r.student_id) || []), r]));
    const a = new Map<string, AttRecord[]>(); att.forEach((r) => a.set(r.student_id, [...(a.get(r.student_id) || []), r]));
    return { b, a };
  }, [recs, att]);
  const score = (id: string) => conductScore(byStudent.b.get(id) || [], byStudent.a.get(id) || [], cfg);

  const rows = useMemo(() => people
    .filter((s) => (!classId || s.class_id === classId) && (!q.trim() || s.name.includes(q.trim())))
    .map((s) => ({ s, sc: score(s.id) }))
    .sort((x, y) => (x.sc.behavior + x.sc.attendance) - (y.sc.behavior + y.sc.attendance) || x.s.name.localeCompare(y.s.name, 'ar')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [people, classId, q, byStudent, cfg]);

  const exportCsv = () => {
    const lines = [['الطالب', 'الفصل', 'المخالفات', 'السلوك الإيجابي', 'درجة السلوك', 'الغياب', 'التأخر', 'درجة المواظبة'], ...rows.map(({ s, sc }) => [s.name, classMap.get(s.class_id || '') || '', String(sc.violations), String(sc.positives), num(sc.behavior), String(sc.absent), String(sc.late), num(sc.attendance)])];
    const blob = new Blob(['﻿' + lines.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'behavior.csv'; a.click();
  };
  const exportPdf = async () => {
    const body = `<table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('الطالب'))}</th><th>${esc(t('الفصل'))}</th><th>${esc(t('المخالفات'))}</th><th>${esc(t('السلوك الإيجابي'))}</th><th>${esc(t('درجة السلوك'))}</th><th>${esc(t('الغياب'))}</th><th>${esc(t('التأخر'))}</th><th>${esc(t('درجة المواظبة'))}</th></tr></thead><tbody>${
      rows.map(({ s, sc }, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(classMap.get(s.class_id || '') || '')}</td><td>${sc.violations}</td><td>${sc.positives}</td><td><b>${num(sc.behavior)}</b> / ${num(cfg.behavior_max)}</td><td>${sc.absent}</td><td>${sc.late}</td><td><b>${num(sc.attendance)}</b> / ${num(cfg.attendance_max)}</td></tr>`).join('')}</tbody></table>
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px"><span>${esc(t('وكيل شؤون الطلاب'))}: ....................</span><span>${esc(t('مدير المدرسة'))}: ....................</span></div>`;
    await exportElementToPdf({ bodyHtml: body, orientation: 'portrait', title: t('كشف السلوك والمواظبة: {c}', { c: classId ? classMap.get(classId) || '' : t('كل الفصول') }) });
  };

  const totals = useMemo(() => {
    const r = recs || [];
    const deg = [1, 2, 3, 4, 5].map((d) => r.filter((x) => x.kind === 'violation' && x.degree === d).length);
    return { viol: r.filter((x) => x.kind === 'violation').length, pos: r.filter((x) => x.kind === 'positive').length, students: new Set(r.filter((x) => x.kind === 'violation').map((x) => x.student_id)).size, deg };
  }, [recs]);

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-indigo-600" />{t('السلوك والمواظبة')}</span>}
        subtitle={t('درجة السلوك من المخالفات والسلوك الإيجابي، ودرجة المواظبة من سجل الحضور')} />
      <div className="flex flex-wrap items-center gap-2">
        {([['students', 'الطلاب'], ['log', 'السجل'], ...(isAdmin ? [['settings', 'الإعدادات']] : [])] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 px-4 rounded-xl text-sm font-bold ${tab === k ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>{t(l)}</button>
        ))}
        {tab !== 'settings' && (
          <select aria-label={t('الفصل')} value={classId} onChange={(e) => setClassId(e.target.value)} className="ms-auto h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
            <option value="">{t('كل الفصول')}</option>
            {allClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {tab === 'students' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[[t('المخالفات المسجلة'), totals.viol, '#ef4444'], [t('السلوك الإيجابي'), totals.pos, '#10b981'], [t('طلاب عليهم مخالفات'), totals.students, '#f59e0b'], [t('مخالفات الدرجة الرابعة فأعلى'), totals.deg[3] + totals.deg[4], '#991b1b']].map(([l, v, c]) => (
              <Card key={String(l)} className="p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><span className="w-2.5 h-2.5 rounded-full" style={{ background: String(c) }} />{l}</div>
                <div className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">{recs === null ? '…' : v}</div>
              </Card>
            ))}
          </div>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="relative flex-1 min-w-[14rem]">
                <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالاسم')} className="w-full h-10 ps-9 pe-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv}>{t('تصدير Excel')}</Button>
              <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportPdf()}>{t('كشف PDF')}</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="text-slate-500 text-xs border-b border-slate-100 dark:border-slate-800">
                  <th className="text-start px-5 py-2.5">{t('الطالب')}</th><th className="text-start">{t('الفصل')}</th><th>{t('المخالفات')}</th><th>{t('الإيجابي')}</th><th>{t('السلوك')}</th><th>{t('الغياب / التأخر')}</th><th>{t('المواظبة')}</th><th />
                </tr></thead>
                <tbody>
                  {rows.slice(0, 500).map(({ s, sc }) => (
                    <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => setOpen(s)}>
                      <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{s.name}</td>
                      <td className="text-slate-600 dark:text-slate-300">{classMap.get(s.class_id || '') || '—'}</td>
                      <td className="text-center tabular-nums font-semibold" style={{ color: sc.violations ? '#ef4444' : undefined }}>{sc.violations}</td>
                      <td className="text-center tabular-nums font-semibold" style={{ color: sc.positives ? '#10b981' : undefined }}>{sc.positives}</td>
                      <td className="text-center"><Chip tone={tone(sc.behavior, cfg.behavior_max)}><span dir="ltr">{num(sc.behavior)}</span></Chip></td>
                      <td className="text-center tabular-nums text-slate-600 dark:text-slate-300">{sc.absent} / {sc.late}</td>
                      <td className="text-center"><Chip tone={tone(sc.attendance, cfg.attendance_max)}><span dir="ltr">{num(sc.attendance)}</span></Chip></td>
                      <td className="px-4 text-end"><span className="text-xs font-semibold text-indigo-600">{canRecord ? t('تسجيل') : t('السجل')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-slate-500">{t('السلوك من {b}: يُحسم بدرجة المخالفة ويُعوَّض بالسلوك الإيجابي. المواظبة من {a}: تُحسم {x} عن كل يوم غياب و{y} عن كل تأخر.', { b: num(cfg.behavior_max), a: num(cfg.attendance_max), x: num(cfg.absence_points), y: num(cfg.late_points) })}</p>
          </Card>
        </>
      )}

      {tab === 'log' && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-2 p-4 border-b border-slate-100 dark:border-slate-800">
            {[1, 2, 3, 4, 5].map((d) => <span key={d} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 border border-slate-200 dark:border-slate-700"><span className="w-2 h-2 rounded-full" style={{ background: DEG_COLOR[d] }} />{t(DEGREE_LABEL[d])}: {totals.deg[d - 1]}</span>)}
          </div>
          {(recs || []).filter((r) => !classId || nameOf.get(r.student_id)?.class_id === classId).slice(0, 300).map((r) => {
            const s = nameOf.get(r.student_id);
            return (
              <button key={r.id} type="button" onClick={() => s && setOpen(s)} className="w-full flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.kind === 'positive' ? '#10b981' : DEG_COLOR[r.degree || 1] }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate text-slate-900 dark:text-white">{s?.name || r.student_id} <span className="text-slate-500 font-normal">· {classMap.get(s?.class_id || '') || ''}</span></div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 truncate">{r.kind === 'positive' ? t('سلوك إيجابي') : t(DEGREE_LABEL[r.degree || 1])} · {r.title}{r.note ? ` · ${r.note}` : ''}</div>
                </div>
                <div className="text-end shrink-0">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{fmtDay(r.day)}</div>
                  <div className="text-[11px] text-slate-500">{r.created_by_name}</div>
                </div>
              </button>
            );
          })}
          {recs !== null && recs.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{t('لا توجد ملاحظات سلوكية مسجلة')}</p>}
        </Card>
      )}

      {tab === 'settings' && isAdmin && <SettingsPanel cfg={cfg} onSaved={load} />}
      {open && <StudentConduct student={open} className={classMap.get(open.class_id || '') || ''} cfg={cfg} recs={byStudent.b.get(open.id) || []} att={byStudent.a.get(open.id) || []} canRecord={canRecord} noAccount={open.id.startsWith('R-')} onClose={() => setOpen(null)} onChanged={() => void fetchBehavior().then(setRecs)} />}
    </div>
  );
};

// ---------------------------------------------------------------------
// سجل طالب: الدرجتان، التسجيل، والحذف، وتقرير PDF
// ---------------------------------------------------------------------
const StudentConduct: React.FC<{ student: User; className: string; cfg: BehaviorConfig; recs: BehaviorRecord[]; att: AttRecord[]; canRecord: boolean; noAccount: boolean; onClose: () => void; onChanged: () => void }> = ({ student, className, cfg, recs, att, canRecord, noAccount, onClose, onChanged }) => {
  const { currentUser, showToast } = useApp();
  const [kind, setKind] = useState<BehaviorKind>('violation');
  const [degree, setDegree] = useState(1);
  const [title, setTitle] = useState('');
  const [custom, setCustom] = useState('');
  const [day, setDay] = useState(isoDay(new Date()));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const sc = conductScore(recs, att, cfg);
  const options = (kind === 'positive' ? cfg.catalog.positive : cfg.catalog[String(degree)]) || [];
  const pts = kind === 'positive' ? cfg.positive_points : Number(cfg.degree_points[String(degree)] ?? 0);

  const save = async () => {
    const tt = (title === '__custom' ? custom : title).trim();
    if (!tt) return showToast(t('اختر المخالفة أو السلوك أو اكتبه'), 'error');
    setBusy(true);
    const r = await addBehavior({ student_id: student.id, day, kind, degree: kind === 'violation' ? degree : null, title: tt, points: pts, note: note.trim(), created_by: currentUser?.id || null, created_by_name: currentUser?.name || '' });
    setBusy(false);
    if (!r.ok) return showToast(t('تعذر الحفظ'), 'error');
    showToast(kind === 'violation' && cfg.notify_parent && !noAccount ? t('سُجّلت وأُشعر ولي الأمر') : t('تم التسجيل'), 'success');
    setTitle(''); setCustom(''); setNote(''); onChanged();
  };
  const del = async (id: number) => {
    if (!window.confirm(t('حذف هذه الملاحظة؟'))) return;
    const r = await deleteBehavior(id);
    if (!r.ok) showToast(t('لا يمكنك حذف ملاحظة سجّلها غيرك'), 'error'); else onChanged();
  };
  const printReport = async () => {
    const rows = recs.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(fmtDay(r.day))}</td><td>${esc(r.kind === 'positive' ? t('سلوك إيجابي') : t(DEGREE_LABEL[r.degree || 1]))}</td><td>${esc(r.title)}</td><td>${r.kind === 'positive' ? '+' : '−'}${num(r.points)}</td><td>${esc(r.note)}</td><td>${esc(r.created_by_name)}</td></tr>`).join('');
    const box = (l: string, v: string) => `<div style="flex:1;min-width:110px;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px"><div style="font-size:11px;opacity:.7">${esc(l)}</div><div style="font-size:20px;font-weight:900;margin-top:2px">${esc(v)}</div></div>`;
    const bodyHtml = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${box(t('الطالب'), student.name)}${box(t('الفصل'), className || '—')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${box(t('درجة السلوك'), `${num(sc.behavior)} / ${num(cfg.behavior_max)}`)}${box(t('درجة المواظبة'), `${num(sc.attendance)} / ${num(cfg.attendance_max)}`)}${box(t('المخالفات'), String(sc.violations))}${box(t('السلوك الإيجابي'), String(sc.positives))}${box(t('الغياب / التأخر'), `${sc.absent} / ${sc.late}`)}</div>
      <table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('التاريخ'))}</th><th>${esc(t('النوع'))}</th><th>${esc(t('الملاحظة'))}</th><th>${esc(t('الدرجة'))}</th><th>${esc(t('ملاحظة'))}</th><th>${esc(t('سجّلها'))}</th></tr></thead><tbody>${rows || `<tr><td colspan="7">${esc(t('لا توجد ملاحظات سلوكية مسجلة'))}</td></tr>`}</tbody></table>
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px"><span>${esc(t('وكيل شؤون الطلاب'))}: ....................</span><span>${esc(t('توقيع ولي الأمر'))}: ....................</span></div>`;
    await exportElementToPdf({ bodyHtml, orientation: 'portrait', title: t('السلوك والمواظبة: {name}', { name: student.name }), subtitle: className });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={student.name}>
      <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{student.name}</h2>
            <p className="text-sm text-slate-500">{className}{noAccount ? ` · ${t('بدون حساب على المنصة')}` : ''}</p>
          </div>
          <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void printReport()}>{t('تقرير PDF')}</Button>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 p-5">
          {[[t('درجة السلوك'), sc.behavior, cfg.behavior_max, t('حسم {d} · تعويض {c}', { d: num(sc.deducted), c: num(sc.compensated) })], [t('درجة المواظبة'), sc.attendance, cfg.attendance_max, t('غياب {a} · تأخر {l}', { a: sc.absent, l: sc.late })]].map(([l, v, m, h]) => (
            <div key={String(l)} className="rounded-xl p-3 bg-slate-50 dark:bg-slate-800/60">
              <div className="text-xs font-semibold text-slate-500">{l}</div>
              <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white"><span dir="ltr">{num(Number(v))}<span className="text-sm text-slate-400"> / {num(Number(m))}</span></span></div>
              <div className="text-[11px] text-slate-500">{h}</div>
            </div>
          ))}
        </div>
        {canRecord && (
          <div className="px-5 pb-4 space-y-2 border-b border-slate-100 dark:border-slate-800">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-full">
              {([['violation', 'مخالفة', AlertTriangle], ['positive', 'سلوك إيجابي', ThumbsUp]] as const).map(([k, l, I]) => (
                <button key={k} type="button" onClick={() => { setKind(k); setTitle(''); }} className={`flex-1 h-9 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 ${kind === k ? (k === 'violation' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white') : 'text-slate-600 dark:text-slate-300'}`}><I className="w-4 h-4" />{t(l)}</button>
              ))}
            </div>
            {kind === 'violation' && (
              <select aria-label={t('درجة المخالفة')} value={degree} onChange={(e) => { setDegree(Number(e.target.value)); setTitle(''); }} className="w-full h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{t(DEGREE_LABEL[d])} — {t('حسم {n}', { n: num(Number(cfg.degree_points[String(d)] ?? 0)) })}</option>)}
              </select>
            )}
            <select aria-label={t('الملاحظة')} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">{kind === 'violation' ? t('اختر المخالفة') : t('اختر السلوك')}</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
              <option value="__custom">{t('أخرى (اكتبها)')}</option>
            </select>
            {title === '__custom' && <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={140} placeholder={t('اكتب المخالفة أو السلوك')} className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />}
            <div className="flex gap-2">
              <input type="date" aria-label={t('التاريخ')} value={day} max={isoDay(new Date())} onChange={(e) => setDay(e.target.value)} className="h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t('ملاحظة (اختياري)')} className="flex-1 h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
            </div>
            <Button className="w-full" icon={Plus} disabled={busy} onClick={() => void save()}>{kind === 'violation' ? t('تسجيل المخالفة (حسم {n})', { n: num(pts) }) : t('تسجيل السلوك (تعويض {n})', { n: num(pts) })}</Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {recs.length === 0 ? <p className="p-5 text-sm text-slate-500">{t('لا توجد ملاحظات سلوكية مسجلة')}</p> : recs.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.kind === 'positive' ? '#10b981' : DEG_COLOR[r.degree || 1] }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{r.title}</div>
                <div className="text-xs text-slate-500">{r.kind === 'positive' ? t('سلوك إيجابي') : t(DEGREE_LABEL[r.degree || 1])} · {fmtDay(r.day)} · {r.kind === 'positive' ? '+' : '−'}{num(r.points)}{r.note ? ` · ${r.note}` : ''} · {r.created_by_name}</div>
              </div>
              {(currentUser?.role === 'admin' || r.created_by === currentUser?.id) && <button type="button" onClick={() => void del(r.id)} aria-label={t('حذف')} className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// الإعداد: الدرجات والحسم والقائمة المقترحة (للمدير)
// ---------------------------------------------------------------------
const SettingsPanel: React.FC<{ cfg: BehaviorConfig; onSaved: () => void }> = ({ cfg, onSaved }) => {
  const { showToast } = useApp();
  const [v, setV] = useState(cfg);
  const [lists, setLists] = useState<Record<string, string>>({});
  useEffect(() => { setV(cfg); setLists(Object.fromEntries(['1', '2', '3', '4', '5', 'positive'].map((k) => [k, (cfg.catalog[k] || []).join('\n')]))); }, [cfg]);
  const n = (k: keyof BehaviorConfig) => (
    <input type="number" min={0} step={0.25} value={Number(v[k])} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" />
  );
  const save = async () => {
    const catalog = Object.fromEntries(Object.entries(lists).map(([k, s]) => [k, s.split('\n').map((x) => x.trim()).filter(Boolean)]));
    const r = await saveBehaviorConfig({ ...v, catalog });
    showToast(r.ok ? t('حُفظ الإعداد') : t('تعذر الحفظ'), r.ok ? 'success' : 'error');
    if (r.ok) onSaved();
  };
  const L = 'block text-sm font-semibold text-slate-700 dark:text-slate-200';
  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-slate-900 dark:text-white">{t('الدرجات والحسم')}</h2>
        <p className="text-xs text-slate-500">{t('القيم الافتراضية مأخوذة من قواعد السلوك والمواظبة، ويمكن تعديلها حسب لائحة المدرسة.')}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={L}>{t('درجة السلوك العظمى')}{n('behavior_max')}</label>
          <label className={L}>{t('درجة المواظبة العظمى')}{n('attendance_max')}</label>
          <label className={L}>{t('حسم يوم الغياب')}{n('absence_points')}</label>
          <label className={L}>{t('حسم التأخر الواحد')}{n('late_points')}</label>
          <label className={L}>{t('تعويض السلوك الإيجابي')}{n('positive_points')}</label>
        </div>
        <div>
          <div className={L}>{t('حسم كل درجة مخالفة')}</div>
          <div className="grid grid-cols-5 gap-2 mt-1">
            {[1, 2, 3, 4, 5].map((d) => (
              <label key={d} className="text-xs text-slate-500 text-center">{t(DEGREE_LABEL[d])}
                <input type="number" min={0} step={0.5} value={Number(v.degree_points[String(d)] ?? 0)} onChange={(e) => setV({ ...v, degree_points: { ...v.degree_points, [String(d)]: Number(e.target.value) } })} className="mt-1 w-full h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-sm" />
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={v.notify_parent} onChange={(e) => setV({ ...v, notify_parent: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
          {t('إشعار الطالب وولي أمره تلقائياً عند تسجيل مخالفة')}
        </label>
        <Button icon={Save} onClick={() => void save()}>{t('حفظ الإعداد')}</Button>
      </Card>
      <Card className="p-5 space-y-3">
        <h2 className="font-bold text-slate-900 dark:text-white">{t('القائمة المقترحة')}</h2>
        <p className="text-xs text-slate-500">{t('سطر لكل مخالفة أو سلوك؛ تظهر للمعلم عند التسجيل، ويمكنه كتابة غيرها.')}</p>
        {['1', '2', '3', '4', '5', 'positive'].map((k) => (
          <label key={k} className={L}>{k === 'positive' ? t('السلوك الإيجابي') : t(DEGREE_LABEL[Number(k)])}
            <textarea rows={3} value={lists[k] || ''} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm leading-relaxed font-normal" />
          </label>
        ))}
        <Button icon={Save} onClick={() => void save()}>{t('حفظ')}</Button>
      </Card>
    </div>
  );
};
