import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NotebookPen, Plus, X, Trash2, Pencil, Link2, Save, HardDrive, ArrowRight, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { FileChips, FilePicker, LinksBlock, StateChip, dueText, uploadErrorText } from '../common/Homework';
import {
  Homework, HwFile, HwLink, HwStorage, HwSubmission, createHomework, deleteFile, deleteHomework, fetchFiles, fetchHomework,
  fetchHomeworkStorage, fetchSubmissions, fmtSize, maxFileMb, gradeSubmission, hwState, purgeHomework, safeUrl, updateHomework, uploadFile,
} from '../../services/homeworkService';
import { FREE_DB_LIMIT } from '../../services/schoolYearService';
import { uiDir, t, dateLocale } from '../../i18n';
import type { User } from '../../types';

const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
const pad = (n: number) => String(n).padStart(2, '0');
/** قيمة datetime-local بالتوقيت المحلي */
const toLocalInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tomorrowAt = (h: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return toLocalInput(d.toISOString()); };

/** الواجبات للطاقم: المعلم لفصوله وموادّه المسندة، والمدير والمشرف للكل */
export const HomeworkPage: React.FC = () => {
  const { currentUser, users, classes, subjects } = useApp();
  const me = currentUser!;
  const isAdmin = me.role === 'admin';
  const isTeacher = me.role === 'teacher';
  const canPublish = isAdmin || isTeacher;
  const fresh = useMemo(() => (users as User[]).find((u) => u.id === me.id) || me, [users, me]);
  const mySubjects = useMemo(() => {
    if (!isTeacher) return subjects;
    const ids = fresh.assigned_subject_ids?.length ? fresh.assigned_subject_ids : fresh.specialty_id ? [fresh.specialty_id] : [];
    return subjects.filter((s) => ids.includes(s.id));
  }, [isTeacher, fresh, subjects]);
  const myClasses = useMemo(() => {
    const ids = new Set([...(fresh.assigned_class_ids || []), ...(fresh.class_id ? [fresh.class_id] : [])]);
    return [...(isTeacher ? classes.filter((c) => ids.has(c.id)) : classes)].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [isTeacher, fresh, classes]);
  const noAssignment = isTeacher && (!myClasses.length || !mySubjects.length);

  const [classFilter, setClassFilter] = useState('');
  const [rows, setRows] = useState<Homework[]>([]);
  const [subs, setSubs] = useState<HwSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Homework | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchHomework(isTeacher ? myClasses.map((c) => c.id) : undefined);
    // المعلم: واجباته فقط (قد يشاركه معلم آخر الفصل)
    const list = isTeacher ? r.rows.filter((h) => h.teacher_id === me.id) : r.rows;
    setRows(list);
    setSubs(await fetchSubmissions(list.map((h) => h.id)));
    setLoading(false);
  }, [isTeacher, myClasses, me.id]);
  useEffect(() => { void load(); }, [load]);

  const studentsOf = useCallback((classId: string) => (users as User[]).filter((u) => u.role === 'student' && u.class_id === classId).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [users]);
  const shown = rows.filter((h) => !classFilter || h.class_id === classFilter);
  const open = rows.find((h) => h.id === openId) || null;

  if (open) return <HomeworkSubmissions hw={open} students={studentsOf(open.class_id)} subs={subs.filter((s) => s.homework_id === open.id)}
    onBack={() => setOpenId(null)} onDeleted={() => { setOpenId(null); void load(); }} onEdit={() => setEditing(open)} canEdit={isAdmin || open.teacher_id === me.id}
    onGraded={(s) => setSubs((x) => x.map((y) => (y.id === s.id ? s : y)))}
    editor={editing && editing !== 'new' ? <HomeworkEditor hw={editing} classes={myClasses} subjects={mySubjects} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /> : null} />;

  return (
    <div className="space-y-5">
      <PageHeader title={t('الواجبات')} subtitle={isTeacher ? t('واجبات فصولك المسندة: انشر، وتابع التسليم، وصحّح') : t('كل واجبات المدرسة وتسليمات الطلاب')} />
      {noAssignment && <Card className="p-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900">{t('لا توجد فصول أو مواد مسندة لك بعد. اطلب من مدير النظام إسنادها من صفحة المستخدمين.')}</Card>}
      {isAdmin && <StorageCard onPurged={() => void load()} />}

      {/* شريط الأدوات بجانب العنوان (لا في طرف الشاشة) */}
      {((canPublish && !noAssignment) || myClasses.length > 1) && (
        <div className="flex flex-wrap items-center gap-3">
          {canPublish && !noAssignment && <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>{t('واجب جديد')}</Button>}
          {myClasses.length > 1 && (
            <label className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">{t('الفصل')}
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={inp}>
                <option value="">{t('كل الفصول')}</option>
                {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {loading ? null : !shown.length ? (
        <Card className="p-10 text-center text-slate-500 space-y-3">
          <NotebookPen className="w-10 h-10 mx-auto text-slate-300" />
          <p>{t('لا توجد واجبات بعد')}</p>
          {canPublish && !noAssignment && <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing('new')}>{t('انشر أول واجب')}</Button>}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((h) => {
            const total = studentsOf(h.class_id).length;
            const hs = subs.filter((s) => s.homework_id === h.id);
            const graded = hs.filter((s) => s.score != null).length;
            const overdue = h.due_at && Date.now() > new Date(h.due_at).getTime();
            return (
              <button key={h.id} type="button" onClick={() => setOpenId(h.id)} data-testid="hw-staff-item"
                className="text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{[classes.find((c) => c.id === h.class_id)?.name, subjects.find((s) => s.id === h.subject_id)?.name].filter(Boolean).join(' · ')}</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">{h.title}</div>
                <div className={`text-[13px] mt-1 ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>{dueText(h.due_at)}{!isTeacher && h.teacher_name ? ` · ${h.teacher_name}` : ''}</div>
                {h.allow_submission ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${total ? (hs.length / total) * 100 : 0}%` }} /></div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 flex gap-3"><span>{t('سلّم {a} من {b}', { a: hs.length, b: total })}</span><span>{t('صُحّح {n}', { n: graded })}</span></div>
                  </div>
                ) : <div className="mt-3"><Chip>{t('للاطلاع (بلا تسليم)')}</Chip></div>}
              </button>
            );
          })}
        </div>
      )}
      {editing && <HomeworkEditor hw={editing === 'new' ? null : editing} classes={myClasses} subjects={mySubjects} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
};

/** إنشاء واجب (لفصل أو أكثر) أو تعديله */
const HomeworkEditor: React.FC<{ hw: Homework | null; classes: { id: string; name: string }[]; subjects: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }> = ({ hw, classes, subjects, onClose, onSaved }) => {
  const { currentUser, showToast } = useApp();
  const [classIds, setClassIds] = useState<Set<string>>(() => new Set(hw ? [hw.class_id] : classes.length === 1 ? [classes[0].id] : []));
  const [subjectId, setSubjectId] = useState(hw?.subject_id || subjects[0]?.id || '');
  const [title, setTitle] = useState(hw?.title || '');
  const [body, setBody] = useState(hw?.body || '');
  const [due, setDue] = useState(hw ? toLocalInput(hw.due_at) : tomorrowAt(20));
  const [links, setLinks] = useState<HwLink[]>(hw?.links || []);
  const [allow, setAllow] = useState(hw ? hw.allow_submission : true);
  const [maxScore, setMaxScore] = useState(hw?.max_score != null ? String(hw.max_score) : '10');
  const [files, setFiles] = useState<HwFile[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (hw) void fetchFiles({ homeworkIds: [hw.id] }).then(setFiles); }, [hw]);

  const toggle = (id: string) => { const n = new Set(classIds); if (n.has(id)) n.delete(id); else n.add(id); setClassIds(n); };
  const save = async () => {
    if (!title.trim()) return showToast(t('اكتب عنوان الواجب'), 'error');
    if (!hw && !classIds.size) return showToast(t('اختر فصلاً واحداً على الأقل'), 'error');
    const cleanLinks = links.map((l) => ({ title: l.title.trim(), url: safeUrl(l.url) || '' })).filter((l) => l.url);
    if (links.some((l) => l.url.trim() && !safeUrl(l.url))) return showToast(t('أحد الروابط غير صحيح (يجب أن يبدأ بـ https://)'), 'error');
    const base = { title: title.trim(), body: body.trim(), links: cleanLinks, due_at: due ? new Date(due).toISOString() : null, allow_submission: allow, max_score: allow && Number(maxScore) > 0 ? Number(maxScore) : null };
    setBusy(true);
    const targets: string[] = [];
    if (hw) {
      const r = await updateHomework(hw.id, base);
      if (!r) { setBusy(false); return showToast(t('تعذر الحفظ'), 'error'); }
      targets.push(hw.id);
    } else {
      for (const cid of classIds) {
        const r = await createHomework({ ...base, class_id: cid, subject_id: subjectId || null, teacher_id: currentUser!.id, teacher_name: currentUser!.name });
        if (r.row) targets.push(r.row.id);
      }
      if (!targets.length) { setBusy(false); return showToast(t('تعذر النشر. تأكد أن الفصل والمادة ضمن إسنادك.'), 'error'); }
    }
    for (const id of targets) for (const f of pending) {
      const r = await uploadFile({ homework_id: id }, f, currentUser!.id);
      if (r.error) showToast(uploadErrorText(r.error, f.name), 'error');
    }
    setBusy(false);
    showToast(hw ? t('تم حفظ الواجب') : t('نُشر الواجب لـ {n} فصل وأُشعر الطلاب وأولياء الأمور', { n: targets.length }), 'success');
    onSaved();
  };
  const removeExisting = async (f: HwFile) => { if (await deleteFile(f.id)) setFiles((x) => x.filter((y) => y.id !== f.id)); };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={hw ? t('تعديل الواجب') : t('واجب جديد')} onClick={onClose}>
      <div className="w-full sm:max-w-2xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <NotebookPen className="w-6 h-6 text-indigo-600" />
          <h2 className="flex-1 font-bold text-lg text-slate-900 dark:text-white">{hw ? t('تعديل الواجب') : t('واجب جديد')}</h2>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!hw && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('الفصول')}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((c) => (
                    <label key={c.id} className={`h-9 px-3 rounded-xl border text-sm inline-flex items-center gap-2 cursor-pointer ${classIds.has(c.id) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-300 dark:border-slate-700'}`}>
                      <input type="checkbox" checked={classIds.has(c.id)} onChange={() => toggle(c.id)} />{c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1 w-fit">{t('المادة')}
                <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inp}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
            </>
          )}
          <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('العنوان')}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('مثال: حل تمارين صفحة 45')} className={inp} />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('التعليمات')}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={5000} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </label>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('موعد التسليم')}
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inp} />
            </label>
            <label className="h-10 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />{t('التسليم عبر المنصة')}
            </label>
            {allow && (
              <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الدرجة من')}
                <input type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} className={`${inp} w-24`} />
              </label>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('روابط (فيديو يوتيوب، درايف، مواقع)')}</legend>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input value={l.title} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder={t('الوصف')} className={`${inp} w-36`} />
                <input value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" dir="ltr" className={`${inp} flex-1 min-w-0`} />
                <button type="button" aria-label={t('حذف الرابط')} onClick={() => setLinks(links.filter((_, j) => j !== i))} className="w-10 h-10 rounded-xl text-slate-400 hover:text-rose-600 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" icon={Link2} onClick={() => setLinks([...links, { title: '', url: '' }])}>{t('إضافة رابط')}</Button>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('المرفقات')}</legend>
            <FileChips files={files} onDelete={(f) => void removeExisting(f)} />
            {pending.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {pending.map((f, i) => (
                  <li key={i} className="h-9 ps-3 pe-1 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 text-sm inline-flex items-center gap-2">
                    <span className="truncate max-w-[12rem]">{f.name}</span><span className="text-xs text-slate-500" dir="ltr">{fmtSize(f.size)}</span>
                    <button type="button" aria-label={t('إزالة')} onClick={() => setPending(pending.filter((_, j) => j !== i))} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <FilePicker onPick={(f) => setPending([...pending, ...f])} label={t('إضافة ملفات')} />
              <span className="text-xs text-slate-500">{t('PDF أو صور أو Word، حتى {n} ميجابايت للملف. للفيديو أضف رابطاً.', { n: maxFileMb() })}</span>
            </div>
          </fieldset>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          {!hw && <span className="text-sm text-slate-500">{t('يصل إشعار للطلاب وأولياء أمورهم')}</span>}
          <Button className="ms-auto" icon={Save} disabled={busy} onClick={() => void save()}>{busy ? t('جارٍ الحفظ…') : hw ? t('حفظ') : t('نشر الواجب')}</Button>
        </div>
      </div>
    </div>
  );
};

/** تسليمات واجب: حالة كل طالب، وإجابته وملفاته، والتصحيح */
const HomeworkSubmissions: React.FC<{
  hw: Homework; students: User[]; subs: HwSubmission[]; canEdit: boolean; editor: React.ReactNode;
  onBack: () => void; onDeleted: () => void; onEdit: () => void; onGraded: (s: HwSubmission) => void;
}> = ({ hw, students, subs, canEdit, editor, onBack, onDeleted, onEdit, onGraded }) => {
  const { classes, subjects, showToast } = useApp();
  const [hwFiles, setHwFiles] = useState<HwFile[]>([]);
  const [subFiles, setSubFiles] = useState<HwFile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const [filter, setFilter] = useState<'all' | 'todo' | 'missing'>('all');
  useEffect(() => { void fetchFiles({ homeworkIds: [hw.id] }).then(setHwFiles); }, [hw.id]);
  const subIds = subs.map((s) => s.id).join(',');
  useEffect(() => { if (subIds) void fetchFiles({ submissionIds: subIds.split(',') }).then(setSubFiles); }, [subIds]);
  const byStudent = Object.fromEntries(subs.map((s) => [s.student_id, s]));
  const list = students.filter((st) => filter === 'all' || (filter === 'missing' ? !byStudent[st.id] : byStudent[st.id] && byStudent[st.id].score == null));

  const draftOf = (s: HwSubmission) => drafts[s.id] || { score: s.score != null ? String(s.score) : '', feedback: s.feedback || '' };
  const save = async (s: HwSubmission) => {
    const d = draftOf(s);
    const score = d.score.trim() === '' ? null : Number(d.score);
    if (score != null && (Number.isNaN(score) || score < 0 || (hw.max_score != null && score > hw.max_score))) return showToast(t('الدرجة بين 0 و{n}', { n: hw.max_score ?? '∞' }), 'error');
    const r = await gradeSubmission(s.id, score, d.feedback.trim());
    if (!r) return showToast(t('تعذر الحفظ'), 'error');
    onGraded(r); setDrafts((x) => { const n = { ...x }; delete n[s.id]; return n; });
    showToast(t('تم حفظ التصحيح'), 'success');
  };
  const remove = async () => {
    if (!window.confirm(t('حذف الواجب «{title}» وكل تسليماته؟', { title: hw.title }))) return;
    if (await deleteHomework(hw.id)) { showToast(t('تم حذف الواجب'), 'success'); onDeleted(); }
    else showToast(t('تعذر الحذف'), 'error');
  };

  return (
    <div className="space-y-5" data-testid="hw-submissions">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1"><ArrowRight className="w-4 h-4 ltr:rotate-180" />{t('كل الواجبات')}</button>
      <PageHeader eyebrow={[classes.find((c) => c.id === hw.class_id)?.name, subjects.find((s) => s.id === hw.subject_id)?.name, dueText(hw.due_at)].filter(Boolean).join(' · ')} title={hw.title}
        actions={canEdit ? <><Button variant="secondary" icon={Pencil} onClick={onEdit}>{t('تعديل')}</Button><Button variant="secondary" icon={Trash2} onClick={() => void remove()} className="!text-rose-600">{t('حذف')}</Button></> : undefined} />
      {(hw.body || hw.links.length > 0 || hwFiles.length > 0) && (
        <Card className="p-5 space-y-3">
          {hw.body && <p className="text-[15px] leading-7 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{hw.body}</p>}
          <LinksBlock links={hw.links} />
          <FileChips files={hwFiles} />
        </Card>
      )}
      {hw.allow_submission && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100 dark:border-slate-800">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900 dark:text-white">{t('التسليمات')}</h2>
            <span className="text-sm text-slate-500">{t('سلّم {a} من {b}', { a: subs.length, b: students.length })}</span>
            <div className="ms-auto flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70">
              {([['all', t('الكل')], ['todo', t('بانتظار التصحيح')], ['missing', t('لم يسلّم')]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} className={`h-8 px-3 rounded-lg text-xs font-semibold ${filter === id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((st) => {
              const s = byStudent[st.id];
              const d = s ? draftOf(s) : null;
              const files = s ? subFiles.filter((f) => f.submission_id === s.id) : [];
              return (
                <li key={st.id} className="p-4 space-y-2" data-testid="hw-sub-row">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-slate-900 dark:text-white">{st.name}</b>
                    <StateChip state={hwState(hw, s)} staff />
                    {s && <span className="text-xs text-slate-500">{new Date(s.submitted_at).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
                  </div>
                  {s?.answer && <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-200 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">{s.answer}</p>}
                  <FileChips files={files} />
                  {s && d && canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1.5">{t('الدرجة')}
                        <input type="number" min={0} max={hw.max_score ?? undefined} step="0.5" value={d.score} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, score: e.target.value } })} className={`${inp} w-20`} />
                        {hw.max_score != null && <span className="tabular-nums">/ {hw.max_score}</span>}
                      </label>
                      <input value={d.feedback} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, feedback: e.target.value } })} placeholder={t('ملاحظة للطالب (اختياري)')} className={`${inp} flex-1 min-w-[12rem]`} />
                      <Button size="sm" icon={Save} disabled={!drafts[s.id]} onClick={() => void save(s)}>{t('حفظ')}</Button>
                    </div>
                  )}
                </li>
              );
            })}
            {!list.length && <li className="p-6 text-center text-sm text-slate-500">{t('لا يوجد طلاب في هذا التصنيف')}</li>}
          </ul>
        </Card>
      )}
      {editor}
    </div>
  );
};

/** مساحة المرفقات وتنظيف الواجبات القديمة (للمدير) */
const StorageCard: React.FC<{ onPurged: () => void }> = ({ onPurged }) => {
  const { showToast } = useApp();
  const [st, setSt] = useState<HwStorage | null>(null);
  const [before, setBefore] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const load = () => void fetchHomeworkStorage().then(setSt);
  useEffect(load, []);
  if (!st || (!st.homework && st.mode !== 'drive')) return null;
  const purge = async () => {
    if (!window.confirm(t('حذف كل الواجبات المنشورة قبل {d} بتسليماتها ومرفقاتها نهائياً؟', { d: before }))) return;
    const r = await purgeHomework(before);
    if (!r.ok) return showToast(t('تعذر التنظيف'), 'error');
    showToast(t('حُذف {n} واجب', { n: r.n }), 'success'); load(); onPurged();
  };
  return (
    <Card className="p-4 flex flex-wrap items-center gap-3 text-sm">
      <HardDrive className="w-5 h-5 text-indigo-600" />
      <span className="text-slate-700 dark:text-slate-200">
        {t('مرفقات الواجبات: {n} ملف · {s} ({p}% من مساحة الخطة المجانية)', { n: st.files, s: fmtSize(st.bytes), p: Math.round((st.bytes / FREE_DB_LIMIT) * 1000) / 10 })}
        {st.mode === 'drive' && <span className="block text-xs text-emerald-700 dark:text-emerald-400">{t('الملفات الجديدة تُحفظ في Google Drive: {n} ملف · {s}', { n: st.drive_files || 0, s: fmtSize(st.drive_bytes || 0) })}</span>}
        {st.mode === 'drive' && st.drive_error && <span className="block text-xs text-rose-700 dark:text-rose-400" role="alert">{t('تعذر الرفع إلى Google Drive مؤخراً، فحُفظت الملفات في قاعدة البيانات مؤقتاً. أعد تشغيل «Setup Drive storage» (قد يكون الإذن انتهى).')}</span>}
      </span>
      <span className="ms-auto flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">{t('حذف الواجبات قبل')}<input type="date" value={before} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBefore(e.target.value)} className={inp} /></label>
        <Button size="sm" variant="secondary" icon={Trash2} onClick={() => void purge()}>{t('تنظيف')}</Button>
      </span>
    </Card>
  );
};
