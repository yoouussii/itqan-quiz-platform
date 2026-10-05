import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartHandshake, Plus, X, Trash2, FileDown, FileSpreadsheet, Save, Search, Target, Users, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { ChartLegend, Change, DumbbellChart, EntryLine, ProgressLine, fmtDate } from '../common/AcademicSupport';
import { schoolStart, weekLabel } from '../../utils/schoolWeek';
import {
  AcsProgress, AcsRating, AcsRecord, AcsStatus, RATINGS, addProgress, addSupport, deleteProgress, deleteSupport, fetchProgress, fetchSupport, gain, reached, updateSupport,
} from '../../services/academicSupportService';
import { hasPerm } from '../../utils/permissions';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t } from '../../i18n';
import type { User } from '../../types';

const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
const escH = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pdfBox = (label: string, value: string) =>
  `<div style="flex:1;min-width:110px;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px"><div style="font-size:11px;opacity:.7">${escH(label)}</div><div style="font-size:20px;font-weight:900;margin-top:2px">${escH(value)}</div></div>`;
const today = () => new Date().toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const STATUS: Record<AcsStatus, { label: string; tone: 'info' | 'ok' | 'muted' }> = {
  active: { label: 'في البرنامج', tone: 'info' }, done: { label: 'أنهى البرنامج', tone: 'ok' }, stopped: { label: 'متوقف', tone: 'muted' },
};

/** الدعم الأكاديمي: معلم الدعم يضيف طلابه ويقيس تقدمهم؛ لوحة مؤشرات ورسم وتقرير مفصّل */
export const AcademicSupportPage: React.FC = () => {
  const { currentUser, users, classes, subjects, showToast } = useApp();
  const me = currentUser!;
  const canAdd = hasPerm(me, 'can_academic_support');
  const seeAll = me.role === 'admin' || me.role === 'supervisor';
  const [rows, setRows] = useState<AcsRecord[]>([]);
  const [prog, setProg] = useState<AcsProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AcsStatus | 'all'>('active');
  const [teacher, setTeacher] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchSupport();
    setRows(r.rows); setProg(await fetchProgress(r.rows.map((x) => x.id))); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const userMap = useMemo(() => new Map((users as User[]).map((u) => [u.id, u])), [users]);
  const nameOf = (id: string) => userMap.get(id)?.name || id;
  const classOf = (id: string) => classes.find((c) => c.id === userMap.get(id)?.class_id)?.name || '';
  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id)?.name || '';
  const teachers = useMemo(() => [...new Map(rows.map((r) => [r.teacher_id, r.teacher_name])).entries()], [rows]);
  const shown = rows.filter((r) => (status === 'all' || r.status === status) && (!teacher || r.teacher_id === teacher)
    && (!q.trim() || nameOf(r.student_id).includes(q.trim())));
  const lastAt = (id: string) => { const p = prog.filter((x) => x.support_id === id && x.level != null); return p.length ? p[p.length - 1].at : null; };

  const kpi = {
    n: shown.length,
    start: avg(shown.map((r) => r.start_level)),
    now: avg(shown.map((r) => r.current_level)),
    gain: avg(shown.map(gain)),
    reached: shown.filter(reached).length,
  };
  const open = rows.find((r) => r.id === openId) || null;

  const exportReport = async () => {
    const trs = shown.map((r, i) => `<tr><td>${i + 1}</td><td>${escH(nameOf(r.student_id))}</td><td>${escH(classOf(r.student_id))}</td><td>${escH(subjectOf(r.subject_id))}</td><td>${escH(r.teacher_name)}</td><td>${r.start_level}%</td><td>${r.current_level}%</td><td dir="ltr">${gain(r) > 0 ? '+' : ''}${gain(r)}</td><td>${r.target_level}%</td><td>${escH(lastAt(r.id) ? fmtDate(lastAt(r.id)!) : '—')}</td><td>${escH(t(STATUS[r.status].label))}</td></tr>`).join('');
    const bodyHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${pdfBox(t('عدد الطلاب'), String(kpi.n))}${pdfBox(t('متوسط الاستلام'), `${kpi.start}%`)}${pdfBox(t('متوسط الآن'), `${kpi.now}%`)}${pdfBox(t('متوسط التحسن'), `${kpi.gain > 0 ? '+' : ''}${kpi.gain}`)}${pdfBox(t('بلغوا الهدف'), String(kpi.reached))}</div>
      <table class="pdf-table"><thead><tr><th>#</th><th>${escH(t('الطالب'))}</th><th>${escH(t('الفصل'))}</th><th>${escH(t('المادة'))}</th><th>${escH(t('المعلم'))}</th><th>${escH(t('عند الاستلام'))}</th><th>${escH(t('الآن'))}</th><th>${escH(t('التغير'))}</th><th>${escH(t('الهدف'))}</th><th>${escH(t('آخر قياس'))}</th><th>${escH(t('الحالة'))}</th></tr></thead>
      <tbody>${trs || `<tr><td colspan="11">—</td></tr>`}</tbody></table>`;
    try { await exportElementToPdf({ bodyHtml, orientation: 'landscape', title: t('تقرير الدعم الأكاديمي'), subtitle: new Date().toLocaleDateString() }); }
    catch (e: any) { showToast(e?.message || t('تعذر تصدير PDF'), 'error'); }
  };

  // Excel: ورقة ملخص لكل طالب + ورقة سجل المتابعة (القياسات والملاحظات بأسبوعها ويومها)
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const start = await schoolStart();
    const rl = (r: AcsRating | null) => (r ? t(RATINGS.find((x) => x.k === r)!.label) : '');
    const summary = shown.map((r) => ({
      [t('الطالب')]: nameOf(r.student_id), [t('الفصل')]: classOf(r.student_id), [t('المادة')]: subjectOf(r.subject_id) || t('عام'), [t('المعلم')]: r.teacher_name,
      [t('تاريخ الاستلام')]: r.started_at, [t('عند الاستلام')]: r.start_level, [t('الآن')]: r.current_level, [t('التغير')]: gain(r), [t('الهدف')]: r.target_level,
      [t('بلغ الهدف')]: reached(r) ? '✓' : '', [t('آخر قياس')]: lastAt(r.id) || '', [t('الحالة')]: t(STATUS[r.status].label), [t('خطة الدعم')]: r.plan,
    }));
    const ids = new Set(shown.map((r) => r.id));
    const entries = prog.filter((p) => ids.has(p.support_id)).sort((a, b) => a.at.localeCompare(b.at)).map((p) => {
      const r = rows.find((x) => x.id === p.support_id)!;
      return { [t('الطالب')]: nameOf(r.student_id), [t('التاريخ')]: weekLabel(p.at, start), [t('المستوى')]: p.level ?? '', [t('التقييم')]: rl(p.rating), [t('ملاحظة')]: p.note };
    });
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(summary.length ? summary : [{ '—': '' }]);
    const ws2 = XLSX.utils.json_to_sheet(entries.length ? entries : [{ '—': '' }]);
    ws1['!views'] = ws2['!views'] = [{ RTL: true }] as any;
    XLSX.utils.book_append_sheet(wb, ws1, t('الملخص').slice(0, 31));
    XLSX.utils.book_append_sheet(wb, ws2, t('سجل المتابعة').slice(0, 31));
    XLSX.writeFile(wb, `academic-support-${today()}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('الدعم الأكاديمي')} subtitle={seeAll ? t('كل طلاب برنامج الدعم: مستوى الاستلام، والتقدم، وبلوغ الهدف') : t('طلابك في برنامج الدعم: سجّل مستواهم وتابع تقدمهم')} />
      <div className="flex flex-wrap items-center gap-2.5">
        {canAdd && <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>{t('إضافة طلاب')}</Button>}
        <Button size="sm" variant="secondary" icon={FileDown} disabled={!shown.length} onClick={() => void exportReport()}>{t('تقرير PDF')}</Button>
        <Button size="sm" variant="secondary" icon={FileSpreadsheet} disabled={!shown.length} onClick={() => void exportExcel()}>{t('Excel')}</Button>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inp} aria-label={t('الحالة')}>
          <option value="active">{t('في البرنامج')}</option><option value="done">{t('أنهى البرنامج')}</option><option value="stopped">{t('متوقف')}</option><option value="all">{t('الكل')}</option>
        </select>
        {seeAll && teachers.length > 1 && (
          <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inp} aria-label={t('المعلم')}>
            <option value="">{t('كل المعلمين')}</option>{teachers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        )}
        <label className="relative"><Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث باسم الطالب')} className={`${inp} ps-9 w-48`} /></label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="acs-kpis">
        {[
          { icon: Users, label: t('عدد الطلاب'), value: String(kpi.n) },
          { icon: Target, label: t('متوسط الاستلام'), value: `${kpi.start}%`, dot: 'var(--acs-start)' },
          { icon: TrendingUp, label: t('متوسط الآن'), value: `${kpi.now}%`, dot: 'var(--acs-now)' },
          { icon: TrendingUp, label: t('متوسط التحسن'), value: <Change v={kpi.gain} className="text-2xl" /> },
          { icon: CheckCircle2, label: t('بلغوا الهدف'), value: `${kpi.reached} / ${kpi.n}` },
        ].map((k, i) => (
          <Card key={i} className="p-4">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">{k.dot ? <span className="w-2 h-2 rounded-full" style={{ background: k.dot }} /> : <k.icon className="w-3.5 h-3.5" />}{k.label}</div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">{k.value}</div>
          </Card>
        ))}
      </div>

      {loading ? null : !shown.length ? (
        <Card className="p-10 text-center text-slate-500 space-y-3">
          <HeartHandshake className="w-10 h-10 mx-auto text-slate-300" />
          <p>{rows.length ? t('لا يوجد طلاب بهذا التصنيف') : t('لا يوجد طلاب في برنامج الدعم بعد')}</p>
          {canAdd && !rows.length && <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding(true)}>{t('إضافة أول طالب')}</Button>}
        </Card>
      ) : (
        <>
          <Card className="p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3"><h2 className="font-bold text-slate-900 dark:text-white">{t('مستوى كل طالب: عند الاستلام والآن')}</h2><span className="ms-auto"><ChartLegend /></span></div>
            <DumbbellChart rows={shown.slice(0, 40).map((r) => ({ id: r.id, name: nameOf(r.student_id), start: r.start_level, now: r.current_level, target: r.target_level }))} onPick={setOpenId} />
            {shown.length > 40 && <p className="text-xs text-slate-500">{t('يظهر أول 40 طالباً في الرسم؛ الكل في الجدول أدناه')}</p>}
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-xs">
                <tr>{[t('الطالب'), t('الفصل'), t('المادة'), ...(seeAll ? [t('المعلم')] : []), t('عند الاستلام'), t('الآن'), t('التغير'), t('الهدف'), t('آخر قياس'), t('الحالة')].map((h) => <th key={h} className="px-3 py-2.5 text-start font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" data-testid="acs-table-row">
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{nameOf(r.student_id)}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{classOf(r.student_id)}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{subjectOf(r.subject_id) || '—'}</td>
                    {seeAll && <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.teacher_name}</td>}
                    <td className="px-3 py-2.5 tabular-nums">{r.start_level}%</td>
                    <td className="px-3 py-2.5 tabular-nums font-bold">{r.current_level}%</td>
                    <td className="px-3 py-2.5"><Change v={gain(r)} /></td>
                    <td className="px-3 py-2.5 tabular-nums">{r.target_level}%{reached(r) && <CheckCircle2 className="inline w-4 h-4 ms-1 text-emerald-600" aria-label={t('بلغ الهدف')} />}</td>
                    <td className="px-3 py-2.5 text-slate-500">{lastAt(r.id) ? fmtDate(lastAt(r.id)!) : '—'}</td>
                    <td className="px-3 py-2.5"><Chip tone={STATUS[r.status].tone}>{t(STATUS[r.status].label)}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {adding && <AddStudentsModal existing={new Set(rows.filter((r) => r.status === 'active').map((r) => r.student_id))} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}
      {open && <SupportDrawer rec={open} points={prog.filter((p) => p.support_id === open.id)} studentName={nameOf(open.student_id)} className={classOf(open.student_id)} subjectName={subjectOf(open.subject_id)}
        canEdit={me.role === 'admin' || open.teacher_id === me.id} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </div>
  );
};

/** إضافة طلاب للبرنامج: اختيار الفصل والطلاب، ومستوى الاستلام لكل طالب */
const AddStudentsModal: React.FC<{ existing: Set<string>; onClose: () => void; onSaved: () => void }> = ({ existing, onClose, onSaved }) => {
  const { currentUser, users, classes, subjects, showToast } = useApp();
  const [classId, setClassId] = useState('');
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [subjectId, setSubjectId] = useState('');
  const [target, setTarget] = useState(80);
  const [plan, setPlan] = useState('');
  const [startedAt, setStartedAt] = useState(today());
  const [busy, setBusy] = useState(false);
  const students = (users as User[]).filter((u) => u.role === 'student' && (!classId || u.class_id === classId)).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const toggle = (id: string) => setPicked((p) => { const n = { ...p }; if (id in n) delete n[id]; else n[id] = 50; return n; });
  const save = async () => {
    const ids = Object.keys(picked);
    if (!ids.length) return showToast(t('اختر طالباً واحداً على الأقل'), 'error');
    setBusy(true);
    const r = await addSupport(ids.map((id) => ({ student_id: id, teacher_id: currentUser!.id, teacher_name: currentUser!.name, subject_id: subjectId || null, start_level: Math.max(0, Math.min(100, Math.round(picked[id]))), target_level: target, plan: plan.trim(), started_at: startedAt || today() })));
    setBusy(false);
    if (!r.ok) return showToast(t('تعذر الحفظ'), 'error');
    showToast(t('أُضيف {n} طالب للبرنامج وأُشعر أولياء الأمور', { n: r.rows.length }), 'success');
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={t('إضافة طلاب للدعم الأكاديمي')} onClick={onClose}>
      <div className="w-full sm:max-w-2xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <HeartHandshake className="w-6 h-6 text-indigo-600" />
          <h2 className="flex-1 font-bold text-lg text-slate-900 dark:text-white">{t('إضافة طلاب للدعم الأكاديمي')}</h2>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الفصل')}
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inp}><option value="">{t('كل الفصول')}</option>{[...classes].sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('المادة')}
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inp}><option value="">{t('عام')}</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الهدف')}
              <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className={inp}>{[60, 70, 75, 80, 85, 90].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('تاريخ الاستلام')}
              <input type="date" value={startedAt} max={today()} onChange={(e) => setStartedAt(e.target.value)} className={inp} />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('الطلاب ومستوى كل منهم عند الاستلام')}</legend>
            <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              {students.map((s) => {
                const on = s.id in picked, dup = existing.has(s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                    <label className="flex-1 flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{s.name}</span>
                      {dup && <Chip tone="info">{t('في البرنامج')}</Chip>}
                    </label>
                    {on && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">{t('المستوى')}
                        <input type="number" min={0} max={100} value={picked[s.id]} onChange={(e) => setPicked({ ...picked, [s.id]: Number(e.target.value) })} className={`${inp} w-20 h-9`} aria-label={t('مستوى {name} عند الاستلام', { name: s.name })} />%
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('خطة الدعم (اختياري)')}
            <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} maxLength={3000} placeholder={t('مثال: حصتان أسبوعياً، تدريبات على الكسور، متابعة منزلية')} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </label>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <span className="text-sm text-slate-500">{t('يصل إشعار للطالب وولي أمره')}</span>
          <Button className="ms-auto" icon={Save} disabled={busy} onClick={() => void save()}>{busy ? t('جارٍ الحفظ…') : t('إضافة ({n})', { n: Object.keys(picked).length })}</Button>
        </div>
      </div>
    </div>
  );
};

/** سجل طالب في البرنامج: الرسم، القياسات، تسجيل قياس، الهدف والخطة والحالة، وتقرير PDF */
const SupportDrawer: React.FC<{ rec: AcsRecord; points: AcsProgress[]; studentName: string; className: string; subjectName: string; canEdit: boolean; onClose: () => void; onChanged: () => void }> = ({ rec, points, studentName, className, subjectName, canEdit, onClose, onChanged }) => {
  const { currentUser, showToast } = useApp();
  const [mode, setMode] = useState<'note' | 'measure'>('note');
  const [rating, setRating] = useState<AcsRating | null>(null);
  const [start, setStart] = useState<string | null>(null);
  useEffect(() => { void schoolStart().then(setStart); }, []);
  const [level, setLevel] = useState(rec.current_level);
  const [at, setAt] = useState(today());
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState(rec.plan);
  const [target, setTarget] = useState(rec.target_level);
  const add = async () => {
    if (mode === 'note' && !note.trim() && !rating) return showToast(t('اكتب الملاحظة أو اختر تقييماً'), 'error');
    const r = await addProgress({ support_id: rec.id, level: mode === 'measure' ? Math.max(0, Math.min(100, Math.round(level))) : null, rating, at, note: note.trim(), created_by: currentUser!.id });
    if (!r) return showToast(t('تعذر الحفظ'), 'error');
    setNote(''); setRating(null); showToast(mode === 'measure' ? t('سُجّل القياس وأُشعر ولي الأمر') : t('سُجّلت الملاحظة وأُشعر ولي الأمر'), 'success'); onChanged();
  };
  const saveMeta = async (patch: Partial<Pick<AcsRecord, 'plan' | 'target_level' | 'status'>>) => {
    if (!(await updateSupport(rec.id, patch))) return showToast(t('تعذر الحفظ'), 'error');
    showToast(t('تم الحفظ'), 'success'); onChanged();
  };
  const remove = async () => {
    if (!window.confirm(t('حذف {name} من برنامج الدعم بكل قياساته؟', { name: studentName }))) return;
    if (await deleteSupport(rec.id)) { onClose(); onChanged(); }
  };
  const printOne = async () => {
    const rl = (r: AcsRating | null) => (r ? t(RATINGS.find((x) => x.k === r)!.label) : '');
    const trs = [{ at: rec.started_at, level: rec.start_level as number | null, rating: null as AcsRating | null, note: t('عند الاستلام') }, ...points].map((p, i) => `<tr><td>${i + 1}</td><td>${escH(weekLabel(p.at, start))}</td><td>${p.level != null ? `${p.level}%` : '—'}</td><td>${escH(rl(p.rating))}</td><td>${escH(p.note)}</td></tr>`).join('');
    const bodyHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${pdfBox(t('الطالب'), studentName)}${pdfBox(t('الفصل'), className || '—')}${pdfBox(t('المادة'), subjectName || t('عام'))}${pdfBox(t('المعلم'), rec.teacher_name)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${pdfBox(t('عند الاستلام'), `${rec.start_level}%`)}${pdfBox(t('الآن'), `${rec.current_level}%`)}${pdfBox(t('التغير'), `${gain(rec) > 0 ? '+' : ''}${gain(rec)}`)}${pdfBox(t('الهدف'), `${rec.target_level}%`)}</div>
      ${rec.plan ? `<p style="white-space:pre-wrap;margin-bottom:12px"><b>${escH(t('خطة الدعم'))}:</b> ${escH(rec.plan)}</p>` : ''}
      <table class="pdf-table"><thead><tr><th>#</th><th>${escH(t('التاريخ'))}</th><th>${escH(t('المستوى'))}</th><th>${escH(t('التقييم'))}</th><th>${escH(t('ملاحظة'))}</th></tr></thead><tbody>${trs}</tbody></table>
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px"><span>${escH(t('معلم الدعم'))}: ....................</span><span>${escH(t('توقيع ولي الأمر'))}: ....................</span></div>`;
    try { await exportElementToPdf({ bodyHtml, orientation: 'portrait', title: t('تقرير الدعم الأكاديمي: {name}', { name: studentName }), subtitle: className }); }
    catch (e: any) { showToast(e?.message || t('تعذر تصدير PDF'), 'error'); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={studentName}>
      <div className="w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()} data-testid="acs-drawer">
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{studentName}</h2>
            <p className="text-sm text-slate-500">{[className, subjectName, rec.teacher_name, t('منذ {d}', { d: fmtDate(rec.started_at) })].filter(Boolean).join(' · ')}</p>
          </div>
          <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void printOne()}>{t('تقرير PDF')}</Button>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[[t('عند الاستلام'), `${rec.start_level}%`, 'var(--acs-start)'], [t('الآن'), `${rec.current_level}%`, 'var(--acs-now)'], [t('التغير'), <Change key="c" v={gain(rec)} />, ''], [t('الهدف'), `${rec.target_level}%`, '']].map(([l, v, c], i) => (
              <div key={i} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                <div className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">{v}</div>
                <div className="text-[11px] text-slate-500 flex items-center justify-center gap-1">{c ? <span className="w-2 h-2 rounded-full" style={{ background: c as string }} /> : null}{l}</div>
              </div>
            ))}
          </div>
          <ProgressLine rec={rec} points={points} />
          {canEdit && rec.status === 'active' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3" data-testid="acs-entry-form">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70" role="tablist">
                  {([['note', t('ملاحظة / تقييم')], ['measure', t('قياس المستوى')]] as const).map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`h-8 px-3 rounded-lg text-xs font-semibold ${mode === k ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{l}</button>
                  ))}
                </div>
                <input type="date" value={at} max={today()} onChange={(e) => setAt(e.target.value)} className={`${inp} h-9`} aria-label={t('التاريخ')} />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300" data-testid="acs-week-label">{weekLabel(at, start)}</span>
              </div>
              {mode === 'measure' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="range" min={0} max={100} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="flex-1 min-w-[10rem] accent-indigo-600" aria-label={t('المستوى')} />
                  <input type="number" min={0} max={100} value={level} onChange={(e) => setLevel(Number(e.target.value))} className={`${inp} w-20`} aria-label={t('المستوى')} />%
                </div>
              )}
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('التقييم')}>
                {RATINGS.map((r) => (
                  <button key={r.k} type="button" role="radio" aria-checked={rating === r.k} onClick={() => setRating(rating === r.k ? null : r.k)}
                    className={`h-8 px-3 rounded-full border text-xs font-semibold ${rating === r.k ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{t(r.label)}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder={mode === 'note' ? t('مثال: حل تمارين الكسور بشكل صحيح، يحتاج تدريباً على القسمة') : t('ملاحظة تظهر لولي الأمر (اختياري)')} className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                <Button size="sm" icon={Plus} className="self-end" onClick={() => void add()}>{t('تسجيل')}</Button>
              </div>
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">{t('سجل المتابعة')}</h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...points].reverse().map((p) => (
                <EntryLine key={p.id} p={p} start={start} action={canEdit ? <button type="button" aria-label={t('حذف')} onClick={() => void deleteProgress(p.id).then(onChanged)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4" /></button> : undefined} />
              ))}
              <li className="flex items-center gap-3 py-2"><b className="w-14 tabular-nums" style={{ color: 'var(--acs-start)' }}>{rec.start_level}%</b><div className="text-xs text-slate-500">{weekLabel(rec.started_at, start)} · {t('عند الاستلام')}</div></li>
            </ul>
          </div>
          {canEdit && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <label className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">{t('الهدف')}
                <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className={inp}>{[60, 70, 75, 80, 85, 90, 95, 100].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
              </label>
              <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} maxLength={3000} placeholder={t('خطة الدعم')} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={Save} disabled={plan === rec.plan && target === rec.target_level} onClick={() => void saveMeta({ plan: plan.trim(), target_level: target })}>{t('حفظ')}</Button>
                {rec.status === 'active'
                  ? <><Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => void saveMeta({ status: 'done' })}>{t('أنهى البرنامج')}</Button><Button size="sm" variant="ghost" onClick={() => void saveMeta({ status: 'stopped' })}>{t('إيقاف')}</Button></>
                  : <Button size="sm" variant="secondary" onClick={() => void saveMeta({ status: 'active' })}>{t('إعادة للبرنامج')}</Button>}
                <Button size="sm" variant="ghost" icon={Trash2} className="ms-auto !text-rose-600" onClick={() => void remove()}>{t('حذف')}</Button>
              </div>
            </div>
          )}
          {!canEdit && rec.plan && <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-200"><b>{t('خطة الدعم')}:</b> {rec.plan}</p>}
        </div>
      </div>
    </div>
  );
};
