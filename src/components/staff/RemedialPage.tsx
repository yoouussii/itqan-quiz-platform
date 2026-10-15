import React, { useEffect, useMemo, useState } from 'react';
import { LifeBuoy, X, FileDown, Trash2, CheckCircle2, Ban, Send, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip, ListSkeleton } from '../common/ui';
import { RemedialPlan, PlanStatus, currentMastery, deletePlan, deletePlans, setPlansStatus, fetchPlans, updatePlan } from '../../services/remedialService';
import { compareClasses } from '../../utils/classOrder';
import { exportElementToPdf } from '../../utils/exportPdf';
import { PlanProgress } from '../common/RemedialCard';
import { uiDir, t, dateLocale } from '../../i18n';
import type { User } from '../../types';
import { EmptyMascot } from '../common/Mascot';
import { useEnsureAnswers } from '../common/useEnsureAnswers';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (d?: string | null) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATUS: Record<PlanStatus, { l: string; tone: 'info' | 'ok' | 'muted' }> = { active: { l: 'جارية', tone: 'info' }, done: { l: 'تحقق الهدف', tone: 'ok' }, cancelled: { l: 'ملغاة', tone: 'muted' } };

/** الخطط العلاجية: متابعة خطط الطلاب في المهارات الضعيفة.
 *  تُعرض داخل «نواتج التعلم» (embedded) وتأخذ الخطط والتصفية بالمهارة من الصفحة الأم. */
export const RemedialPage: React.FC<{
  embedded?: boolean;
  plans?: RemedialPlan[] | null;
  setPlans?: React.Dispatch<React.SetStateAction<RemedialPlan[] | null>>;
  outcome?: string;
  setOutcome?: (o: string) => void;
}> = ({ embedded, plans: extPlans, setPlans: extSetPlans, outcome: extOutcome, setOutcome: extSetOutcome }) => {
  const { currentUser, users, classes, subjects, quizzes, submissions, showToast } = useApp();
  useEnsureAnswers('remedial');
  const me = currentUser!;
  const [ownPlans, setOwnPlans] = useState<RemedialPlan[] | null>(null);
  const plans = extSetPlans ? extPlans ?? null : ownPlans;
  const setPlans = extSetPlans || setOwnPlans;
  const [ownOutcome, setOwnOutcome] = useState('');
  const outcome = extSetOutcome ? extOutcome || '' : ownOutcome;
  const setOutcome = extSetOutcome || setOwnOutcome;
  const [status, setStatus] = useState<PlanStatus | ''>('active');
  const [mineOnly, setMineOnly] = useState(me.role === 'teacher');
  const [open, setOpen] = useState<RemedialPlan | null>(null);
  useEffect(() => { if (!extSetPlans) void fetchPlans().then((r) => setOwnPlans(r.rows)); }, [extSetPlans]);

  const userOf = (id: string) => (users as User[]).find((u) => u.id === id);
  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id)?.name || '';
  const classOf = (sid: string) => classes.find((c) => c.id === userOf(sid)?.class_id)?.name || '';
  const nowPct = useMemo(() => {
    const m = new Map<string, number | null>();
    (plans || []).forEach((p) => m.set(p.id, currentMastery(p, quizzes as any, submissions as any)));
    return m;
  }, [plans, quizzes, submissions]);

  const outcomes = useMemo(() => Array.from(new Set((plans || []).map((p) => p.outcome))).sort((a, b) => a.localeCompare(b, 'ar')), [plans]);
  // تصفية إضافية: المادة، الفصل، المعلم، اسم الطالب؛ وتجميع اختياري
  const [subj, setSubj] = useState('');
  const [cls, setCls] = useState('');
  const [teacher, setTeacher] = useState('');
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState<'' | 'subject' | 'class' | 'outcome' | 'teacher'>('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const clsIdOf = (sid: string) => userOf(sid)?.class_id || '';
  const usedSubjects = useMemo(() => subjects.filter((x) => (plans || []).some((p) => p.subject_id === x.id)), [plans, subjects]);
  const usedClasses = useMemo(() => classes.filter((c) => (plans || []).some((p) => clsIdOf(p.student_id) === c.id)).sort(compareClasses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, classes, users]);
  const teachers = useMemo(() => Array.from(new Map((plans || []).map((p) => [p.teacher_id, p.teacher_name] as const)).entries()), [plans]);
  const needle = q.trim();
  const list = (plans || []).filter((p) => (!status || p.status === status) && (!mineOnly || p.teacher_id === me.id) && (!outcome || p.outcome === outcome)
    && (!subj || p.subject_id === subj) && (!cls || clsIdOf(p.student_id) === cls) && (!teacher || p.teacher_id === teacher)
    && (!needle || (userOf(p.student_id)?.name || '').includes(needle)));
  const canEditPlan = (p: RemedialPlan) => me.role === 'admin' || p.teacher_id === me.id;
  const selectable = list.filter(canEditPlan);
  const selected = selectable.filter((p) => sel.has(p.id));
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const toggle = (ids: string[], on: boolean) => setSel((prev) => { const n = new Set(prev); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const groupKey = (p: RemedialPlan) => groupBy === 'subject' ? subjectOf(p.subject_id) || t('بدون مادة')
    : groupBy === 'class' ? classOf(p.student_id) || t('بدون فصل') : groupBy === 'outcome' ? p.outcome : groupBy === 'teacher' ? p.teacher_name : '';
  const groups = useMemo(() => {
    if (!groupBy) return [['', list]] as Array<[string, RemedialPlan[]]>;
    const m = new Map<string, RemedialPlan[]>();
    list.forEach((p) => { const k = groupKey(p); m.set(k, [...(m.get(k) || []), p]); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, groupBy]);
  const bulkDelete = async () => {
    if (!selected.length || !window.confirm(t('حذف {n} خطة نهائياً؟', { n: selected.length }))) return;
    setBusy(true);
    const done = new Set(await deletePlans(selected.map((p) => p.id)));
    setBusy(false);
    setPlans((ps) => (ps || []).filter((x) => !done.has(x.id)));
    setSel(new Set());
    showToast(done.size === selected.length ? t('تم حذف {n} خطة', { n: done.size }) : t('حُذفت {a} من {b} خطة', { a: done.size, b: selected.length }), done.size ? 'success' : 'error');
  };
  const bulkStatus = async (s: PlanStatus) => {
    if (!selected.length) return;
    setBusy(true);
    const rows = await setPlansStatus(selected.map((p) => p.id), s);
    setBusy(false);
    const byId = new Map(rows.map((r) => [r.id, r]));
    setPlans((ps) => (ps || []).map((x) => byId.get(x.id) || x));
    setSel(new Set());
    showToast(t('تم تحديث {n} خطة', { n: rows.length }), rows.length ? 'success' : 'error');
  };
  const selCls = 'h-9 max-w-[200px] px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
  const all = (plans || []).filter((p) => !outcome || p.outcome === outcome);
  const kpi = {
    active: all.filter((p) => p.status === 'active').length,
    done: all.filter((p) => p.status === 'done').length,
    reached: all.filter((p) => p.status === 'active' && (nowPct.get(p.id) ?? -1) >= p.target_pct).length,
    overdue: all.filter((p) => p.status === 'active' && p.due_date && p.due_date < new Date().toISOString().slice(0, 10)).length,
  };
  const replace = (p: RemedialPlan) => { setPlans((ps) => (ps || []).map((x) => (x.id === p.id ? p : x))); setOpen(p); };

  return (
    <div className={embedded ? 'space-y-5' : 'max-w-6xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5'} dir={uiDir()}>
      {!embedded && <PageHeader title={<span className="inline-flex items-center gap-2"><LifeBuoy className="w-7 h-7 text-indigo-600" />{t('الخطط العلاجية')}</span>}
        subtitle={t('خطط للطلاب الذين يحتاجون علاجاً في مهارة، مع متابعة تقدمهم تلقائياً من نتائج الاختبارات. تُفتح من صفحة «نواتج التعلم».')} />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([['خطط جارية', kpi.active], ['بلغوا الهدف (جارية)', kpi.reached], ['تجاوزت موعد المتابعة', kpi.overdue], ['خطط مكتملة', kpi.done]] as const).map(([l, v]) => (
          <Card key={l} className="p-4"><div className="text-xs font-semibold text-slate-500">{t(l)}</div><div className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{v}</div></Card>
        ))}
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-3">
          {([['active', 'جارية'], ['done', 'مكتملة'], ['cancelled', 'ملغاة'], ['', 'الكل']] as const).map(([k, l]) => (
            <button key={k || 'all'} type="button" onClick={() => setStatus(k)} className={`h-9 px-3 rounded-xl text-sm font-bold ${status === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{t(l)}</button>
          ))}
          {outcomes.length > 0 && (
            <select aria-label={t('ناتج التعلم')} value={outcome} onChange={(e) => setOutcome(e.target.value)} className="h-9 max-w-[260px] px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" data-testid="plan-outcome">
              <option value="">{t('كل نواتج التعلم')}</option>
              {outcomes.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {me.role !== 'parent' && <label className="ms-auto flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />{t('خططي فقط')}</label>}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3" data-testid="plan-filters">
          <label className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث باسم الطالب')} aria-label={t('بحث باسم الطالب')} className="h-9 w-44 ps-8 pe-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </label>
          {usedSubjects.length > 1 && (
            <select aria-label={t('المادة')} value={subj} onChange={(e) => setSubj(e.target.value)} className={selCls}>
              <option value="">{t('كل المواد')}</option>
              {usedSubjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          {usedClasses.length > 1 && (
            <select aria-label={t('الفصل')} value={cls} onChange={(e) => setCls(e.target.value)} className={selCls}>
              <option value="">{t('كل الفصول')}</option>
              {usedClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {!mineOnly && teachers.length > 1 && (
            <select aria-label={t('المعلم')} value={teacher} onChange={(e) => setTeacher(e.target.value)} className={selCls}>
              <option value="">{t('كل المعلمين')}</option>
              {teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <select aria-label={t('تجميع حسب')} value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className={selCls} data-testid="plan-group">
            <option value="">{t('بدون تجميع')}</option>
            <option value="subject">{t('تجميع حسب المادة')}</option>
            <option value="class">{t('تجميع حسب الفصل')}</option>
            <option value="outcome">{t('تجميع حسب المهارة')}</option>
            <option value="teacher">{t('تجميع حسب المعلم')}</option>
          </select>
        </div>
        {selectable.length > 0 && (
          <div className={`flex flex-wrap items-center gap-2 px-5 py-2 border-t border-slate-100 dark:border-slate-800 ${selected.length ? 'bg-indigo-50/70 dark:bg-indigo-950/40' : ''}`} data-testid="plan-bulk">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={allSelected} onChange={(e) => toggle(selectable.map((p) => p.id), e.target.checked)} className="w-4 h-4 accent-indigo-600" data-testid="plan-select-all" />
              {selected.length ? t('محدد {n} من {m}', { n: selected.length, m: selectable.length }) : t('تحديد الكل ({n})', { n: selectable.length })}
            </label>
            {selected.length > 0 && (
              <span className="ms-auto flex flex-wrap gap-2">
                {selected.some((p) => p.status === 'active') && <Button size="sm" variant="secondary" icon={CheckCircle2} disabled={busy} onClick={() => void bulkStatus('done')}>{t('إنهاء')}</Button>}
                {selected.some((p) => p.status === 'active') && <Button size="sm" variant="secondary" icon={Ban} disabled={busy} onClick={() => void bulkStatus('cancelled')}>{t('إلغاء')}</Button>}
                {selected.some((p) => p.status !== 'active') && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void bulkStatus('active')}>{t('إعادة فتح')}</Button>}
                <Button size="sm" variant="ghost" icon={Trash2} className="!text-rose-600" disabled={busy} onClick={() => void bulkDelete()} data-testid="plan-bulk-delete">{t('حذف ({n})', { n: selected.length })}</Button>
              </span>
            )}
          </div>
        )}
        {plans === null ? <ListSkeleton /> : list.length === 0 ? (
          <EmptyMascot text={t('لا توجد خطط. افتح خطة من صفحة «نواتج التعلم» للطلاب الذين يحتاجون علاجاً.')} />
        ) : groups.map(([g, rows]) => (
          <div key={g || 'all'}>
            {groupBy && (
              <div className="flex items-center gap-2 px-5 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-100">
                {rows.some(canEditPlan) && <input type="checkbox" aria-label={t('تحديد المجموعة {g}', { g })} className="w-4 h-4 accent-indigo-600"
                  checked={rows.filter(canEditPlan).every((p) => sel.has(p.id))} onChange={(e) => toggle(rows.filter(canEditPlan).map((p) => p.id), e.target.checked)} />}
                <span className="flex-1 truncate">{g}</span><span className="text-xs font-semibold text-slate-500">{rows.length}</span>
              </div>
            )}
            {rows.map((p) => {
          const now = nowPct.get(p.id) ?? null;
          return (
            <div key={p.id} className={`flex items-center border-t border-slate-100 dark:border-slate-800 ${sel.has(p.id) ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''}`}>
            {selectable.length > 0 && (
              <span className="ps-5 shrink-0 w-9">{canEditPlan(p) && <input type="checkbox" aria-label={t('تحديد')} checked={sel.has(p.id)} onChange={(e) => toggle([p.id], e.target.checked)} className="w-4 h-4 accent-indigo-600" />}</span>
            )}
            <button type="button" onClick={() => setOpen(p)} className="flex-1 min-w-0 grid sm:grid-cols-[1fr_220px_auto] items-center gap-3 px-5 py-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white truncate">{userOf(p.student_id)?.name || t('طالب')} <span className="text-xs font-normal text-slate-500">· {classOf(p.student_id)}</span></div>
                <div className="text-xs text-slate-500 truncate">{p.outcome} · {subjectOf(p.subject_id)} · {t('المتابعة {d}', { d: fmt(p.due_date) })}{p.teacher_id !== me.id ? ` · ${p.teacher_name}` : ''}</div>
              </div>
              <div className="space-y-1">
                <PlanProgress start={p.start_pct} now={now} target={p.target_pct} />
                <div className="text-[11px] text-slate-500 tabular-nums">{p.start_pct}% ← <b className="text-slate-800 dark:text-slate-100">{now == null ? '—' : `${now}%`}</b> · {t('الهدف {n}%', { n: p.target_pct })}</div>
              </div>
              <Chip tone={STATUS[p.status].tone}>{t(STATUS[p.status].l)}</Chip>
            </button>
            </div>
          );
        })}
          </div>
        ))}
      </Card>
      {open && <PlanDrawer plan={open} student={userOf(open.student_id)} className={classOf(open.student_id)} subjectName={subjectOf(open.subject_id)} now={nowPct.get(open.id) ?? null}
        onClose={() => setOpen(null)} onChange={replace} onDeleted={() => { setPlans((ps) => (ps || []).filter((x) => x.id !== open.id)); setOpen(null); }} />}
    </div>
  );
};

const PlanDrawer: React.FC<{ plan: RemedialPlan; student?: User; className: string; subjectName: string; now: number | null; onClose: () => void; onChange: (p: RemedialPlan) => void; onDeleted: () => void }> = ({ plan, student, className, subjectName, now, onClose, onChange, onDeleted }) => {
  const { currentUser, showToast } = useApp();
  const [note, setNote] = useState('');
  const canEdit = currentUser?.role === 'admin' || plan.teacher_id === currentUser?.id;
  const setStatus = async (s: PlanStatus) => {
    const r = await updatePlan(plan.id, { status: s, closed_at: s === 'active' ? null : new Date().toISOString() });
    if (r) onChange(r); else showToast(t('تعذر الحفظ'), 'error');
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const r = await updatePlan(plan.id, { notes: [...plan.notes, { at: new Date().toISOString(), by: currentUser!.name, note: note.trim().slice(0, 1000) }] });
    if (r) { onChange(r); setNote(''); } else showToast(t('تعذر الحفظ'), 'error');
  };
  const del = async () => { if (window.confirm(t('حذف هذه الخطة؟')) && (await deletePlan(plan.id))) onDeleted(); };
  const pdf = async () => {
    const body = `<table class="pdf-table" style="margin-bottom:14px"><tbody>
      <tr><th>${esc(t('الطالب'))}</th><td>${esc(student?.name)}</td><th>${esc(t('الفصل'))}</th><td>${esc(className)}</td></tr>
      <tr><th>${esc(t('المادة'))}</th><td>${esc(subjectName)}</td><th>${esc(t('المهارة'))}</th><td>${esc(plan.outcome)}</td></tr>
      <tr><th>${esc(t('نسبة الإتقان عند البداية'))}</th><td>${plan.start_pct}%</td><th>${esc(t('النسبة الحالية'))}</th><td>${now == null ? '—' : `${now}%`}</td></tr>
      <tr><th>${esc(t('الهدف'))}</th><td>${plan.target_pct}%</td><th>${esc(t('موعد المتابعة'))}</th><td>${esc(fmt(plan.due_date))}</td></tr></tbody></table>
      <h3 style="margin:12px 0 6px">${esc(t('الإجراءات العلاجية'))}</h3><p style="white-space:pre-wrap">${esc(plan.actions || '—')}</p>
      <h3 style="margin:16px 0 6px">${esc(t('سجل المتابعة'))}</h3>${plan.notes.length ? `<table class="pdf-table"><thead><tr><th>${esc(t('التاريخ'))}</th><th>${esc(t('الملاحظة'))}</th><th>${esc(t('بواسطة'))}</th></tr></thead><tbody>${plan.notes.map((n) => `<tr><td>${esc(fmt(n.at))}</td><td>${esc(n.note)}</td><td>${esc(n.by)}</td></tr>`).join('')}</tbody></table>` : '<p>—</p>'}
      <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><span>${esc(t('المعلم'))}: ${esc(plan.teacher_name)}</span><span>${esc(t('ولي الأمر'))}: ....................</span><span>${esc(t('الموجّه الطلابي'))}: ....................</span></div>`;
    await exportElementToPdf({ bodyHtml: body, orientation: 'portrait', title: t('خطة علاجية: {n}', { n: student?.name || '' }), subtitle: `${plan.outcome} · ${t(STATUS[plan.status].l)}` });
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('خطة علاجية')} onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1"><h2 className="font-bold text-lg text-slate-900 dark:text-white">{student?.name}</h2><p className="text-sm text-slate-500">{[className, subjectName, plan.outcome].filter(Boolean).join(' · ')}</p></div>
          <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void pdf()}>{t('PDF')}</Button>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-end gap-3"><span className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{now == null ? '—' : `${now}%`}</span><span className="text-sm text-slate-500 mb-1">{t('من {a}% عند البداية · الهدف {b}%', { a: plan.start_pct, b: plan.target_pct })}</span><Chip tone={STATUS[plan.status].tone}>{t(STATUS[plan.status].l)}</Chip></div>
            <PlanProgress start={plan.start_pct} now={now} target={plan.target_pct} />
            {plan.status === 'active' && now != null && now >= plan.target_pct && <p className="text-sm font-semibold text-emerald-700">{t('بلغ الطالب الهدف، يمكنك إنهاء الخطة.')}</p>}
          </div>
          <div><h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('الإجراءات العلاجية')}</h3><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{plan.actions || '—'}</p></div>
          <div className="text-sm text-slate-600 dark:text-slate-300">{t('فُتحت {a} بواسطة {b} · المتابعة {c}', { a: fmt(plan.created_at), b: plan.teacher_name, c: fmt(plan.due_date) })}</div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('سجل المتابعة')}</h3>
            {plan.notes.length === 0 ? <p className="text-sm text-slate-500">{t('لا توجد ملاحظات بعد')}</p> : (
              <ul className="space-y-2">{plan.notes.map((n, i) => <li key={i} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm"><div className="text-xs text-slate-500">{fmt(n.at)} · {n.by}</div><div className="text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{n.note}</div></li>)}</ul>
            )}
            {canEdit && plan.status === 'active' && (
              <div className="flex gap-2 mt-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addNote(); }} placeholder={t('ملاحظة متابعة (مثال: نفّذ التدريب الأول بنجاح)')} className="flex-1 h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                <Button size="sm" icon={Send} onClick={() => void addNote()}>{t('إضافة')}</Button>
              </div>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
            {plan.status === 'active' ? (<>
              <Button icon={CheckCircle2} onClick={() => void setStatus('done')}>{t('تحقق الهدف، إنهاء الخطة')}</Button>
              <Button variant="secondary" icon={Ban} onClick={() => void setStatus('cancelled')}>{t('إلغاء')}</Button>
            </>) : <Button variant="secondary" onClick={() => void setStatus('active')}>{t('إعادة فتح الخطة')}</Button>}
            <Button variant="ghost" icon={Trash2} className="ms-auto !text-rose-600" onClick={() => void del()}>{t('حذف')}</Button>
          </div>
        )}
      </div>
    </div>
  );
};
