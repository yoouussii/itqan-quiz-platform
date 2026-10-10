import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Search, X, FileDown, Trash2, Users, Award, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, Button, Chip, ListSkeleton } from '../common/ui';
import { MoznVisit, deleteMoznVisit, fetchMoznVisits, importMoznVisits } from '../../services/visitsSurveysService';
import { parseMoznFiles } from '../../utils/moznVisits';
import { normalizeArabic } from '../../utils/arabicSearch';
import { exportElementToPdf } from '../../utils/exportPdf';
import { hasPerm } from '../../utils/permissions';
import { uiDir, t, dateLocale } from '../../i18n';
import type { User } from '../../types';
import { EmptyMascot, MascotHere } from '../common/Mascot';

const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDay = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
// درجة تقييم الزيارة: المجموع من 100 إن كان فعلياً (> 0)؛ الزيارات غير المقيَّمة بلا درجة
const scoreOf = (v: MoznVisit): number | null => (v.total_score != null && v.total_score > 0 ? v.total_score : null);
const tone = (p: number | null) => (p == null ? 'muted' : p >= 90 ? 'ok' : p >= 80 ? 'info' : p >= 70 ? 'warn' : 'bad') as 'ok' | 'info' | 'warn' | 'bad' | 'muted';

/** زيارات منصة مزن: تقييم زيارات صفية للمعلمين، تُستورَد بملف JSON، وتُربط بمعلمي المنصة بالاسم */
export const MoznVisitsTab: React.FC = () => {
  const { currentUser, users, showToast } = useApp();
  const canManage = currentUser?.role === 'admin';
  const canImport = canManage || hasPerm(currentUser, 'can_class_visits');
  const [rows, setRows] = useState<MoznVisit[] | null>(null);
  const [q, setQ] = useState('');
  const [teacher, setTeacher] = useState('');
  const [type, setType] = useState('');
  const [visitor, setVisitor] = useState('');
  const [school, setSchool] = useState('');
  const [open, setOpen] = useState<MoznVisit | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => void fetchMoznVisits().then((r) => setRows(r.rows));
  useEffect(load, []);

  // ربط اسم معلم مزن بمعلمي المنصة (بالاسم المجرّد)
  const teacherByName = useMemo(() => {
    const m = new Map<string, User>();
    (users as User[]).filter((u) => u.role === 'teacher').forEach((u) => m.set(normalizeArabic(u.name), u));
    return m;
  }, [users]);
  const linked = (name: string) => teacherByName.get(normalizeArabic(name));

  const teachers = useMemo(() => [...new Set((rows || []).map((r) => r.teacher_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const types = useMemo(() => [...new Set((rows || []).map((r) => r.type_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const visitors = useMemo(() => [...new Set((rows || []).map((r) => r.visitor_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const schools = useMemo(() => [...new Set((rows || []).map((r) => r.school_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const list = (rows || []).filter((r) =>
    (!teacher || r.teacher_name === teacher) && (!type || r.type_name === type)
    && (!visitor || r.visitor_name === visitor) && (!school || r.school_name === school)
    && (!q.trim() || normalizeArabic(r.teacher_name).includes(normalizeArabic(q)) || normalizeArabic(r.course_name).includes(normalizeArabic(q)) || normalizeArabic(r.title).includes(normalizeArabic(q))));

  const scored = list.map(scoreOf).filter((x): x is number => x != null);
  const avg = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null;
  const teacherCount = new Set(list.map((r) => r.teacher_name).filter(Boolean)).size;
  const matched = new Set(list.map((r) => r.teacher_name).filter((n) => linked(n))).size;
  const low = list.filter((r) => { const sc = scoreOf(r); return sc != null && sc < 70; }).length;

  const doImport = async (files: File[]) => {
    setBusy(true);
    try {
      const texts = await Promise.all(files.map((f) => f.text()));
      const { rows: parsed, errors } = parseMoznFiles(texts);
      if (!parsed.length) { showToast(errors[0] || t('لم يُعثر على زيارات في الملفات'), 'error'); return; }
      const r = await importMoznVisits(parsed);
      if (!r.ok) { showToast(r.error ? t('تعذر الحفظ: {e}', { e: r.error }) : t('تعذر الحفظ — تأكد من تشغيل التحديث 067'), 'error'); return; }
      showToast(t('استُوردت {n} زيارة من مزن', { n: r.rows }) + (errors.length ? ` · ${errors.join(' · ')}` : ''), 'success');
      load();
    } catch (e: any) { showToast(e?.message || t('تعذر قراءة الملفات'), 'error'); }
    finally { setBusy(false); }
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const head = [t('التاريخ'), t('المعلم'), t('على المنصة؟'), t('الزائر'), t('نوع الزيارة'), t('المادة'), t('الصف'), t('الفصل'), t('عنوان الدرس'), t('الدرجة'), t('الأثر'), t('المجموع'), t('التقدير'), t('الملاحظات'), t('التوصيات')];
    const body = list.map((r) => [r.visit_date, r.teacher_name, linked(r.teacher_name) ? t('نعم') : t('لا'), r.visitor_name, r.type_name, r.course_name, r.grade_name, r.section_name, r.title, r.mark ?? '', r.effect ?? '', r.total_score ?? '', r.grade_label, r.notes, r.recommendations]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]); (ws as any)['!views'] = [{ RTL: true }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t('زيارات مزن').slice(0, 31));
    XLSX.writeFile(wb, `mozn-visits-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const exportPdf = async () => {
    const body = `<table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('التاريخ'))}</th><th>${esc(t('المعلم'))}</th><th>${esc(t('نوع الزيارة'))}</th><th>${esc(t('المادة'))}</th><th>${esc(t('الدرجة'))}</th><th>${esc(t('الأثر'))}</th><th>${esc(t('المجموع'))}</th><th>${esc(t('التقدير'))}</th></tr></thead><tbody>${
      list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(fmtDay(r.visit_date))}</td><td>${esc(r.teacher_name)}</td><td>${esc(r.type_name)}</td><td>${esc(r.course_name)}</td><td>${esc(r.mark ?? '')}</td><td>${esc(r.effect ?? '')}</td><td>${esc(r.total_score ?? '')}</td><td>${esc(r.grade_label)}</td></tr>`).join('')}</tbody></table>`;
    await exportElementToPdf({ bodyHtml: body, orientation: 'landscape', title: t('زيارات مزن'), subtitle: [school, visitor, teacher, type].filter(Boolean).join(' · ') });
  };

  if (rows === null) return <ListSkeleton />;
  if (rows.length === 0) return (
    <Card className="p-8 text-center space-y-3">
      <MascotHere className="mx-auto mb-1" />
      <p className="font-bold text-slate-800 dark:text-slate-100">{t('زيارات منصة مزن')}</p>
      <p className="text-sm text-slate-500 max-w-xl mx-auto">{t('استورِد زيارات المعلمين من مزن: من صفحة الزيارات في مزن احفظ رد GetVisits (وتفاصيل الزيارات إن أردت الطلاب والبنود) كملفات JSON، ثم ارفعها هنا. لا يُخزَّن أي توكن. المكرر يُحدَّث.')}</p>
      {canImport && <><input ref={fileRef} type="file" accept=".json,application/json" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) void doImport(fs); }} />
        <Button icon={Upload} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? t('جارٍ الاستيراد…') : t('استيراد ملفات مزن')}</Button></>}
    </Card>
  );

  return (
    <div className="space-y-5" dir={uiDir()} data-testid="mozn-visits">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالمعلم أو المادة أو الدرس')} className={`${inp} w-full ps-9`} />
        </div>
        {schools.length > 1 && <select value={school} onChange={(e) => setSchool(e.target.value)} className={inp} aria-label={t('المدرسة')}><option value="">{t('كل المدارس')}</option>{schools.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
        {visitors.length > 1 && <select value={visitor} onChange={(e) => setVisitor(e.target.value)} className={inp} aria-label={t('الزائر')}><option value="">{t('كل الزائرين')}</option>{visitors.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
        {teachers.length > 1 && <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inp} aria-label={t('المعلم')}><option value="">{t('كل المعلمين')}</option>{teachers.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
        {types.length > 1 && <select value={type} onChange={(e) => setType(e.target.value)} className={inp} aria-label={t('نوع الزيارة')}><option value="">{t('كل الأنواع')}</option>{types.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
        {(q || teacher || type || visitor || school) && <Button size="sm" variant="ghost" icon={X} onClick={() => { setQ(''); setTeacher(''); setType(''); setVisitor(''); setSchool(''); }}>{t('مسح')}</Button>}
        <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportExcel()}>{t('Excel')}</Button>
        <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportPdf()}>{t('PDF')}</Button>
        {canImport && <><input ref={fileRef} type="file" accept=".json,application/json" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) void doImport(fs); }} />
          <Button size="sm" icon={Upload} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? t('جارٍ الاستيراد…') : t('استيراد من مزن')}</Button></>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([[Users, t('زيارات'), list.length, ''], [Award, t('متوسط الدرجة'), avg ?? '—', scored.length ? t('{n} زيارة مقيّمة', { n: scored.length }) : ''],
          [CheckCircle2, t('معلمون مُقيَّمون'), teacherCount, t('{n} مرتبطون بالمنصة', { n: matched })], [AlertTriangle, t('درجات دون 70'), low, '']] as const).map(([Icon, l, v, sub]) => (
          <Card key={l} className="p-4"><div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Icon className="w-4 h-4" />{l}</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">{v}</div>{sub && <div className="text-[11px] text-slate-500">{sub}</div>}</Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        {list.length === 0 ? <EmptyMascot text={t('لا توجد زيارات مطابقة')} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60">
                <tr>{[t('التاريخ'), t('المعلم'), t('نوع الزيارة'), t('المادة والصف'), t('الدرجة'), t('الأثر'), t('المجموع'), t('التقدير')].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {list.map((r) => { const u = linked(r.teacher_name); const sc = scoreOf(r); return (
                  <tr key={r.id} onClick={() => setOpen(r)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" data-testid="mozn-row">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{fmtDay(r.visit_date)}</td>
                    <td className="px-3 py-2"><div className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">{r.teacher_name || '—'}{u && <Link2 className="w-3.5 h-3.5 text-emerald-600" aria-label={t('مرتبط بمعلم على المنصة')} />}</div>{r.visitor_name && <div className="text-[11px] text-slate-500">{t('الزائر: {n}', { n: r.visitor_name })}</div>}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.type_name || '—'}</td>
                    <td className="px-3 py-2">{[r.course_name, [r.grade_name, r.section_name].filter(Boolean).join(' / ')].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.mark ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.effect ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums font-bold">{r.total_score ?? '—'}</td>
                    <td className="px-3 py-2">{sc != null || r.grade_label ? <Chip tone={tone(sc)}>{r.grade_label || sc}</Chip> : '—'}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <MoznDrawer v={open} linked={linked(open.teacher_name)} canDelete={canManage} onClose={() => setOpen(null)}
        onDeleted={() => { setRows((p) => (p || []).filter((x) => x.id !== open.id)); setOpen(null); }} />}
    </div>
  );
};

const MoznDrawer: React.FC<{ v: MoznVisit; linked?: User; canDelete: boolean; onClose: () => void; onDeleted: () => void }> = ({ v, linked, canDelete, onClose, onDeleted }) => {
  const { showToast } = useApp();
  const detail = (v.detail || {}) as { students?: Array<{ name: string; mark: number | null; markFrom100: number | null; notes: string }>; items?: Array<{ name: string; value: number | null; note: string }>; scale?: { nameAr: string; min: number | null; max: number | null } | null };
  const students = detail.students || [], items = (detail.items || []).filter((i) => i.name || i.value != null);
  const del = async () => { if (window.confirm(t('حذف هذه الزيارة من المنصة؟')) && (await deleteMoznVisit(v.id))) { onDeleted(); showToast(t('حُذفت الزيارة'), 'success'); } };
  const info: Array<[string, React.ReactNode]> = [
    [t('المعلم'), v.teacher_name], [t('الزائر'), v.visitor_name], [t('المدرسة'), v.school_name],
    [t('المادة'), v.course_name], [t('الصف'), [v.grade_name, v.section_name].filter(Boolean).join(' / ')], [t('الحصة'), v.period],
    [t('عنوان الدرس'), v.title], [t('نوع الزيارة'), v.type_name], [t('عدد الطلاب'), v.students_count],
  ];
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" role="dialog" aria-modal="true" aria-label={v.teacher_name} onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white inline-flex items-center gap-2">{v.teacher_name || t('زيارة')}{linked && <Chip tone="ok"><Link2 className="w-3 h-3" />{t('على المنصة')}</Chip>}</h2>
            <p className="text-sm text-slate-500">{[fmtDay(v.visit_date), v.course_name, v.type_name].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[[t('الدرجة'), v.mark], [t('الأثر'), v.effect], [t('المجموع'), v.total_score]].map(([l, x]) => (
              <div key={String(l)} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{x ?? '—'}</div></div>
            ))}
          </div>
          {v.grade_label && <div><Chip tone={tone(scoreOf(v))}>{v.grade_label}</Chip></div>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{info.filter(([, x]) => x).map(([k, x]) => <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-800 dark:text-slate-100">{x}</dd></React.Fragment>)}</dl>
          {v.notes && <div><h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('الملاحظات')}</h3><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{v.notes}</p></div>}
          {v.recommendations && <div><h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('التوصيات')}</h3><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{v.recommendations}</p></div>}
          {items.length > 0 && (
            <div><h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('بنود الملاحظة')}{detail.scale?.nameAr ? ` · ${detail.scale.nameAr}` : ''}</h3>
              <ul className="space-y-1.5">{items.map((it, i) => <li key={i} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 dark:border-slate-800 pb-1.5"><span className="text-slate-700 dark:text-slate-200">{it.name || `#${i + 1}`}</span><b className="tabular-nums">{it.value ?? '—'}</b></li>)}</ul>
            </div>
          )}
          {students.length > 0 && (
            <div><h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('طلاب الفصل ودرجاتهم ({n})', { n: students.length })}</h3>
              <ul className="space-y-1">{students.map((st, i) => <li key={i} className="flex items-center justify-between gap-2 text-sm"><span className="truncate text-slate-700 dark:text-slate-200">{st.name}</span><b className="tabular-nums">{st.markFrom100 ?? st.mark ?? '—'}</b></li>)}</ul>
            </div>
          )}
        </div>
        {canDelete && <div className="p-4 border-t border-slate-100 dark:border-slate-800"><Button variant="ghost" icon={Trash2} className="!text-rose-600" onClick={() => void del()}>{t('حذف الزيارة')}</Button></div>}
      </div>
    </div>
  );
};
