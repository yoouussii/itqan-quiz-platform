import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, X, FileDown, Trash2, CheckCircle2, Save, ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import { ClassVisit, VisitItem, ackVisit, addVisit, deleteVisit, fetchVisitConfig, fetchVisits, saveVisitConfig, visitTotals } from '../../services/visitsSurveysService';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t, dateLocale } from '../../i18n';
import type { User } from '../../types';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const tone = (p: number) => (p >= 85 ? 'ok' : p >= 70 ? 'info' : p >= 55 ? 'warn' : 'bad') as 'ok' | 'info' | 'warn' | 'bad';
const rating = (p: number) => (p >= 90 ? 'ممتاز' : p >= 80 ? 'جيد جداً' : p >= 65 ? 'جيد' : p >= 50 ? 'مقبول' : 'يحتاج إلى تحسين');
const today = () => new Date().toISOString().slice(0, 10);

/** الزيارات الصفية: المشرف/المدير يقيّم حصص المعلمين، والمعلم يطّلع على زياراته */
export const VisitsPage: React.FC = () => {
  const { currentUser, users, classes, subjects, showToast } = useApp();
  const me = currentUser!;
  const canVisit = hasPerm(me, 'can_class_visits');
  const isAdmin = me.role === 'admin';
  const [tab, setTab] = useState<'list' | 'items'>('list');
  const [visits, setVisits] = useState<ClassVisit[] | null>(null);
  const [items, setItems] = useState<VisitItem[]>([]);
  const [teacherFilter, setTeacherFilter] = useState('');
  const [open, setOpen] = useState<ClassVisit | null>(null);
  const [form, setForm] = useState(false);

  const load = () => { void fetchVisits().then((r) => setVisits(r.rows)); void fetchVisitConfig().then(setItems); };
  useEffect(load, []);

  const teachers = useMemo(() => (users as User[]).filter((u) => u.role === 'teacher').sort((a, b) => a.name.localeCompare(b.name, 'ar')), [users]);
  const nameOf = (id: string | null) => (users as User[]).find((u) => u.id === id)?.name || '—';
  const classOf = (id: string | null) => classes.find((c) => c.id === id)?.name || '';
  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id)?.name || '';

  const list = (visits || []).filter((v) => (canVisit || isAdmin ? !teacherFilter || v.teacher_id === teacherFilter : v.teacher_id === me.id));
  const byTeacher = useMemo(() => {
    const m = new Map<string, ClassVisit[]>();
    (visits || []).forEach((v) => m.set(v.teacher_id, [...(m.get(v.teacher_id) || []), v]));
    return [...m.entries()].map(([id, vs]) => ({ id, n: vs.length, avg: vs.reduce((a, v) => a + visitTotals(v).pct, 0) / vs.length, last: vs[0].day, pending: vs.filter((v) => !v.teacher_ack_at).length }))
      .sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), 'ar'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, users]);

  const exportVisitPdf = async (v: ClassVisit) => {
    const tt = visitTotals(v);
    const body = `<table class="pdf-table" style="margin-bottom:14px"><tbody>
        <tr><th>${esc(t('المعلم'))}</th><td>${esc(nameOf(v.teacher_id))}</td><th>${esc(t('التاريخ'))}</th><td>${esc(fmtDay(v.day))}</td></tr>
        <tr><th>${esc(t('الفصل'))}</th><td>${esc(classOf(v.class_id))}</td><th>${esc(t('المادة'))}</th><td>${esc(subjectOf(v.subject_id))}</td></tr>
        <tr><th>${esc(t('عنوان الدرس'))}</th><td colspan="3">${esc(v.lesson)}</td></tr></tbody></table>
      <table class="pdf-table"><thead><tr><th>#</th><th>${esc(t('بند التقييم'))}</th><th>${esc(t('الدرجة'))}</th></tr></thead><tbody>${
        v.items.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.title)}</td><td>${esc(i.score ?? 0)} / ${esc(i.max)}</td></tr>`).join('')}
        <tr><th colspan="2">${esc(t('المجموع'))}</th><th>${tt.score} / ${tt.max} (${tt.pct}% · ${esc(t(rating(tt.pct)))})</th></tr></tbody></table>
      <h3 style="margin:16px 0 6px">${esc(t('نقاط القوة'))}</h3><p style="white-space:pre-wrap">${esc(v.strengths || '—')}</p>
      <h3 style="margin:16px 0 6px">${esc(t('التوصيات'))}</h3><p style="white-space:pre-wrap">${esc(v.recommendations || '—')}</p>
      ${v.teacher_note ? `<h3 style="margin:16px 0 6px">${esc(t('ملاحظة المعلم'))}</h3><p style="white-space:pre-wrap">${esc(v.teacher_note)}</p>` : ''}
      <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><span>${esc(t('الزائر'))}: ${esc(v.visitor_name)}</span><span>${esc(t('المعلم'))}: ${esc(nameOf(v.teacher_id))} ${v.teacher_ack_at ? `(${esc(t('اطّلع'))})` : '....................'}</span><span>${esc(t('مدير المدرسة'))}: ....................</span></div>`;
    await exportElementToPdf({ bodyHtml: body, orientation: 'portrait', title: t('نموذج زيارة صفية'), subtitle: nameOf(v.teacher_id) });
  };

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><Eye className="w-7 h-7 text-indigo-600" />{t('الزيارات الصفية')}</span>}
        subtitle={canVisit ? t('تقييم حصص المعلمين ببنود واضحة، مع نقاط القوة والتوصيات، ويطّلع المعلم على زيارته') : t('زياراتك الصفية: التقييم والتوصيات')}
        actions={canVisit ? <Button icon={Plus} onClick={() => setForm(true)}>{t('زيارة جديدة')}</Button> : undefined} />

      {isAdmin && (
        <div className="flex gap-2">
          {([['list', 'الزيارات'], ['items', 'بنود التقييم']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 px-4 rounded-xl text-sm font-bold ${tab === k ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>{t(l)}</button>
          ))}
        </div>
      )}

      {tab === 'items' && isAdmin ? <ItemsEditor items={items} onSaved={setItems} /> : (
        <>
          {(canVisit || isAdmin) && byTeacher.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2 font-bold text-slate-900 dark:text-white">{t('ملخص المعلمين')}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="text-start px-5 py-2 font-semibold">{t('المعلم')}</th><th className="text-start py-2 font-semibold">{t('الزيارات')}</th>
                    <th className="text-start py-2 font-semibold">{t('متوسط التقييم')}</th><th className="text-start py-2 font-semibold">{t('آخر زيارة')}</th><th className="text-start py-2 font-semibold">{t('بانتظار الاطلاع')}</th>
                  </tr></thead>
                  <tbody>{byTeacher.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => setTeacherFilter(r.id)}>
                      <td className="px-5 py-2 font-semibold text-slate-900 dark:text-white">{nameOf(r.id)}</td>
                      <td className="py-2 tabular-nums">{r.n}</td>
                      <td className="py-2"><Chip tone={tone(r.avg)}>{Math.round(r.avg)}% · {t(rating(r.avg))}</Chip></td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">{fmtDay(r.last)}</td>
                      <td className="py-2 tabular-nums">{r.pending || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-2">
              <span className="font-bold text-slate-900 dark:text-white me-auto">{canVisit || isAdmin ? t('سجل الزيارات') : t('زياراتي')}</span>
              {(canVisit || isAdmin) && (
                <select aria-label={t('المعلم')} value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                  <option value="">{t('كل المعلمين')}</option>
                  {teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
            </div>
            {visits === null ? <p className="p-8 text-center text-slate-500">{t('جارٍ التحميل…')}</p> : list.length === 0 ? (
              <p className="p-10 text-center text-slate-500">{t('لا توجد زيارات مسجلة')}</p>
            ) : list.map((v) => {
              const tt = visitTotals(v);
              return (
                <button key={v.id} type="button" onClick={() => setOpen(v)} className="w-full flex flex-wrap items-center gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold text-slate-900 dark:text-white">{canVisit || isAdmin ? nameOf(v.teacher_id) : v.lesson || subjectOf(v.subject_id)}</div>
                    <div className="text-xs text-slate-500">{[fmtDay(v.day), classOf(v.class_id), subjectOf(v.subject_id), v.lesson, t('الزائر: {n}', { n: v.visitor_name })].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Chip tone={tone(tt.pct)}>{tt.pct}% · {t(rating(tt.pct))}</Chip>
                  {v.teacher_ack_at ? <span className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{t('اطّلع')}</span> : <span className="text-xs font-semibold text-amber-600">{t('بانتظار الاطلاع')}</span>}
                </button>
              );
            })}
          </Card>
        </>
      )}

      {form && <VisitForm items={items} teachers={teachers.filter((u) => u.id !== me.id)} onClose={() => setForm(false)} onSaved={(v) => { setVisits((p) => [v, ...(p || [])]); setForm(false); showToast(t('حُفظت الزيارة وأُشعر المعلم'), 'success'); }} />}
      {open && (
        <VisitDetail v={open} teacherName={nameOf(open.teacher_id)} className={classOf(open.class_id)} subjectName={subjectOf(open.subject_id)}
          canDelete={isAdmin || open.visitor_id === me.id} isTeacher={open.teacher_id === me.id}
          onClose={() => setOpen(null)} onPdf={() => void exportVisitPdf(open)}
          onDeleted={() => { setVisits((p) => (p || []).filter((x) => x.id !== open.id)); setOpen(null); }}
          onAck={(note) => { const at = new Date().toISOString(); setVisits((p) => (p || []).map((x) => (x.id === open.id ? { ...x, teacher_ack_at: at, teacher_note: note } : x))); setOpen({ ...open, teacher_ack_at: at, teacher_note: note }); }} />
      )}
    </div>
  );
};

const VisitForm: React.FC<{ items: VisitItem[]; teachers: User[]; onClose: () => void; onSaved: (v: ClassVisit) => void }> = ({ items, teachers, onClose, onSaved }) => {
  const { currentUser, classes, subjects, showToast } = useApp();
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [day, setDay] = useState(today());
  const [lesson, setLesson] = useState('');
  const [scores, setScores] = useState<Record<number, number>>({});
  const [strengths, setStrengths] = useState('');
  const [recs, setRecs] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const tch = teachers.find((u) => u.id === teacherId);
    if (tch?.assigned_subject_ids?.[0]) setSubjectId(tch.assigned_subject_ids[0]);
  }, [teacherId, teachers]);
  const filled = items.every((_, i) => scores[i] != null);
  const tt = visitTotals({ items: items.map((it, i) => ({ ...it, score: scores[i] })) });
  const save = async () => {
    if (!teacherId) return showToast(t('اختر المعلم'), 'error');
    if (!filled) return showToast(t('قيّم جميع البنود'), 'error');
    setBusy(true);
    const v = await addVisit({
      teacher_id: teacherId, visitor_id: currentUser!.id, visitor_name: currentUser!.name, day, class_id: classId || null, subject_id: subjectId || null,
      lesson: lesson.trim(), items: items.map((it, i) => ({ ...it, score: scores[i] })), strengths: strengths.trim(), recommendations: recs.trim(),
    });
    setBusy(false);
    if (!v) return showToast(t('تعذر الحفظ'), 'error');
    onSaved(v);
  };
  const inp = 'h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-full';
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('زيارة جديدة')} onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white flex-1">{t('زيارة جديدة')}</h2>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('المعلم')}
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inp}><option value="">{t('اختر المعلم')}</option>{teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('التاريخ')}
              <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} className={inp} />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('الفصل')}
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inp}><option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('المادة')}
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inp}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block sm:col-span-2">{t('عنوان الدرس')}
              <input value={lesson} onChange={(e) => setLesson(e.target.value)} maxLength={150} className={inp} />
            </label>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((it, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="flex-1 min-w-[180px] text-sm text-slate-800 dark:text-slate-100">{i + 1}. {it.title}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={it.title}>
                  {Array.from({ length: it.max }, (_, k) => k + 1).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={scores[i] === n} onClick={() => setScores({ ...scores, [i]: n })}
                      className={`w-8 h-8 rounded-lg text-sm font-bold tabular-nums ${scores[i] === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50'}`}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('نقاط القوة')}
            <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={3} className={`${inp} h-auto py-2`} />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300 space-y-1 block">{t('التوصيات')}
            <textarea value={recs} onChange={(e) => setRecs(e.target.value)} rows={3} className={`${inp} h-auto py-2`} />
          </label>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-300">{t('المجموع')}: <b className="tabular-nums">{tt.score} / {tt.max}</b> {filled && <Chip tone={tone(tt.pct)}>{tt.pct}% · {t(rating(tt.pct))}</Chip>}</span>
          <Button className="ms-auto" icon={Save} disabled={busy} onClick={() => void save()}>{busy ? t('جارٍ الحفظ…') : t('حفظ الزيارة')}</Button>
        </div>
      </div>
    </div>
  );
};

const VisitDetail: React.FC<{ v: ClassVisit; teacherName: string; className: string; subjectName: string; canDelete: boolean; isTeacher: boolean; onClose: () => void; onPdf: () => void; onDeleted: () => void; onAck: (note: string) => void }> = ({ v, teacherName, className, subjectName, canDelete, isTeacher, onClose, onPdf, onDeleted, onAck }) => {
  const { showToast } = useApp();
  const [note, setNote] = useState('');
  const tt = visitTotals(v);
  const del = async () => {
    if (!window.confirm(t('حذف هذه الزيارة؟'))) return;
    if (await deleteVisit(v.id)) onDeleted(); else showToast(t('تعذر الحذف'), 'error');
  };
  const ack = async () => { if (await ackVisit(v.id, note.trim())) { onAck(note.trim()); showToast(t('تم تأكيد الاطلاع'), 'success'); } else showToast(t('تعذر الحفظ'), 'error'); };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('تفاصيل الزيارة')} onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">{teacherName}</h2>
            <p className="text-sm text-slate-500">{[fmtDay(v.day), className, subjectName, v.lesson].filter(Boolean).join(' · ')}</p>
          </div>
          <Button size="sm" variant="secondary" icon={FileDown} onClick={onPdf}>{t('PDF')}</Button>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{tt.pct}%</span>
            <Chip tone={tone(tt.pct)}>{t(rating(tt.pct))}</Chip>
            <span className="text-sm text-slate-500 ms-auto">{tt.score} / {tt.max} · {t('الزائر: {n}', { n: v.visitor_name })}</span>
          </div>
          <ul className="space-y-2">
            {v.items.map((i, k) => {
              const p = i.max ? ((i.score || 0) / i.max) * 100 : 0;
              return (
                <li key={k} className="text-sm">
                  <div className="flex justify-between gap-2"><span className="text-slate-700 dark:text-slate-200">{i.title}</span><b className="tabular-nums">{i.score ?? 0}/{i.max}</b></div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 80 ? '#10b981' : p >= 60 ? '#f59e0b' : '#ef4444' }} /></div>
                </li>
              );
            })}
          </ul>
          <div><h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('نقاط القوة')}</h3><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{v.strengths || '—'}</p></div>
          <div><h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('التوصيات')}</h3><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{v.recommendations || '—'}</p></div>
          {v.teacher_ack_at ? (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-900 dark:text-emerald-200">
              <b className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{t('اطّلع المعلم في {d}', { d: new Date(v.teacher_ack_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' }) })}</b>
              {v.teacher_note && <p className="mt-1 whitespace-pre-wrap">{v.teacher_note}</p>}
            </div>
          ) : isTeacher ? (
            <div className="space-y-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder={t('ملاحظتك على الزيارة (اختياري)')} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              <Button icon={CheckCircle2} onClick={() => void ack()}>{t('اطّلعت على الزيارة')}</Button>
            </div>
          ) : <p className="text-sm text-amber-600 font-semibold">{t('بانتظار اطلاع المعلم')}</p>}
        </div>
        {canDelete && <div className="p-4 border-t border-slate-100 dark:border-slate-800"><Button variant="ghost" icon={Trash2} className="!text-rose-600" onClick={() => void del()}>{t('حذف الزيارة')}</Button></div>}
      </div>
    </div>
  );
};

const ItemsEditor: React.FC<{ items: VisitItem[]; onSaved: (i: VisitItem[]) => void }> = ({ items, onSaved }) => {
  const { showToast } = useApp();
  const [text, setText] = useState(() => items.map((i) => i.title).join('\n'));
  const [max, setMax] = useState(() => items[0]?.max || 5);
  useEffect(() => { setText(items.map((i) => i.title).join('\n')); setMax(items[0]?.max || 5); }, [items]);
  const save = async () => {
    const list = text.split('\n').map((s) => s.trim()).filter(Boolean).map((title) => ({ title, max }));
    if (!list.length) return showToast(t('أضف بنداً واحداً على الأقل'), 'error');
    if (await saveVisitConfig(list)) { onSaved(list); showToast(t('تم الحفظ'), 'success'); } else showToast(t('تعذر الحفظ'), 'error');
  };
  return (
    <Card className="p-5 space-y-3 max-w-2xl">
      <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><ListChecks className="w-5 h-5 text-indigo-600" />{t('بنود التقييم')}</h2>
      <p className="text-sm text-slate-500">{t('سطر لكل بند. التعديل يسري على الزيارات الجديدة فقط.')}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm leading-7" />
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">{t('الدرجة العظمى لكل بند')}
        <select value={max} onChange={(e) => setMax(Number(e.target.value))} className="h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">{[3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </label>
      <Button icon={Save} onClick={() => void save()}>{t('حفظ البنود')}</Button>
    </Card>
  );
};
