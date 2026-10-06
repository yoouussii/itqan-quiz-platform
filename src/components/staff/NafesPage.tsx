import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Target, Users, ClipboardList, Library, BarChart3, ListChecks, Plus, X, Trash2, Search, FileSpreadsheet, FileDown, TrendingUp, TrendingDown, Download, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, Button, Chip, PageHeader, StatTile } from '../common/ui';
import { HBarRank } from '../common/HBarRank';
import { StudentLink } from '../common/StudentProfile';
import { QuestionBankPage } from '../teacher/QuestionBank';
import { computeOutcomes, pct } from '../../utils/outcomes';
import { exportSectionsPdf, exportSectionsXlsx, ExportSection } from '../../utils/tableExport';
import { uiDir, t } from '../../i18n';
import {
  LEVELS, NAFES_GRADES, NAFES_SUBJECTS, NAFES_NEW_QUIZ_KEY, NafesGrade, NafesMeasure, NafesSkill, NafesStudent, NafesSubject,
  addMeasures, addNafesStudents, avg, deleteMeasure, deleteNafesStudent, deleteSkill, fetchNafes, gradeLabel, levelOf, saveSkill, subjectLabel, updateNafesStudent,
} from '../../services/nafesService';

type Tab = 'students' | 'tests' | 'bank' | 'reports' | 'skills';
const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white';
const today = () => new Date().toISOString().slice(0, 10);

/** الصف من اسم صف المدرسة («الثالث / أ» ← 3، «الثالث المتوسط» ← 9) */
const guessGrade = (name = ''): NafesGrade | null => (/سادس/.test(name) ? '6' : /ثالث/.test(name) ? (/متوسط/.test(name) ? '9' : '3') : null);

const LevelChip: React.FC<{ score: number | null | undefined }> = ({ score }) => {
  const l = levelOf(score);
  return l ? <Chip tone={l.tone}>{t(l.label)} · {Math.round(score as number)}%</Chip> : <Chip>{t('لم يُقس')}</Chip>;
};

/** توزيع المستويات: شريط مكدّس بألوان المستويات مع عدد كل مستوى */
const LevelBar: React.FC<{ scores: number[]; label: string }> = ({ scores, label }) => {
  const total = scores.length || 1;
  const counts = LEVELS.map((l) => scores.filter((s) => levelOf(s)?.k === l.k).length);
  return (
    <div className="space-y-1.5" aria-label={label}>
      <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 gap-0.5" dir="rtl">
        {LEVELS.map((l, i) => counts[i] ? <div key={l.k} title={`${t(l.label)}: ${counts[i]}`} style={{ width: `${(counts[i] / total) * 100}%`, background: l.color }} /> : null)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
        {LEVELS.map((l, i) => <span key={l.k} className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />{t(l.label)}: <b className="tabular-nums">{counts[i]}</b></span>)}
      </div>
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, footer, wide }) => createPortal(
  <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3" dir={uiDir()} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <Card className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[92vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="font-bold text-slate-900 dark:text-white flex-1">{title}</h3>
        <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-4 overflow-y-auto flex-1 space-y-3">{children}</div>
      {footer && <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">{footer}</div>}
    </Card>
  </div>,
  document.body
);

export const NafesPage: React.FC = () => {
  const { currentUser, users, classes, quizzes, submissions, showToast, setCurrentView, setEditingQuizId } = useApp();
  const [tab, setTab] = useState<Tab>('students');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [skills, setSkills] = useState<NafesSkill[]>([]);
  const [students, setStudents] = useState<NafesStudent[]>([]);
  const [measures, setMeasures] = useState<NafesMeasure[]>([]);
  const [subject, setSubject] = useState<NafesSubject>('math');
  const [grade, setGrade] = useState<NafesGrade | ''>('');
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [openStudent, setOpenStudent] = useState<NafesStudent | null>(null);
  const me = currentUser?.id || '';

  const reload = async () => {
    const r = await fetchNafes();
    setReady(r.ok); setSkills(r.skills); setStudents(r.students); setMeasures(r.measures); setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const latestOf = (sid: string, subj: NafesSubject) => {
    const list = measures.filter((m) => m.student_id === sid && m.subject === subj);
    return list.length ? list[list.length - 1] : null;
  };

  // طلاب القسم بعد التصفية
  const rows = useMemo(() => students
    .filter((s) => s.subject === subject && (!grade || s.grade === grade))
    .map((s) => {
      const u = userById.get(s.student_id);
      const last = latestOf(s.student_id, s.subject);
      const first = s.baseline ?? measures.find((m) => m.student_id === s.student_id && m.subject === s.subject)?.score ?? null;
      return { s, u, cls: u?.class_id ? classById.get(u.class_id) : undefined, last: last?.score ?? null, first, count: measures.filter((m) => m.student_id === s.student_id && m.subject === s.subject).length };
    })
    .filter((r) => r.u && (!classId || r.u.class_id === classId) && (!q.trim() || (r.u.name || '').includes(q.trim())))
    .sort((a, b) => (a.u!.name || '').localeCompare(b.u!.name || '', 'ar')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [students, measures, subject, grade, classId, q, userById, classById]);

  // الاختبارات التجريبية
  const mockQuizzes = useMemo(() => quizzes.filter((qz) => !qz.is_deleted && qz.nafes && qz.nafes.subject === subject && (!grade || qz.nafes.grade === grade)), [quizzes, subject, grade]);
  const subsOf = (quizId: string) => submissions.filter((s) => s.quiz_id === quizId && s.status !== 'in_progress');

  const newMock = () => {
    try { sessionStorage.setItem(NAFES_NEW_QUIZ_KEY, JSON.stringify({ subject, grade: grade || '6' })); } catch { /* ignore */ }
    setEditingQuizId(null);
    setCurrentView('create_quiz');
  };

  // نقل نتائج اختبار تجريبي إلى القياسات (الدرجة ودرجات المهارات) لطلاب نافس في المادة
  const importQuiz = async (quizId: string) => {
    const quiz = quizzes.find((x) => x.id === quizId);
    if (!quiz?.nafes) return;
    const inSubject = new Set(students.filter((s) => s.subject === quiz.nafes!.subject).map((s) => s.student_id));
    // آخر تسليم لكل طالب فقط
    const latest = new Map<string, typeof submissions[number]>();
    subsOf(quizId).filter((s) => inSubject.has(s.student_id)).forEach((s) => { const cur = latest.get(s.student_id); if (!cur || (s.completed_at || '') > (cur.completed_at || '')) latest.set(s.student_id, s); });
    const subs = Array.from(latest.values());
    if (!subs.length) return showToast(t('لا توجد تسليمات لطلاب نافس في هذا الاختبار'), 'info');
    const skillByName = new Map(skills.filter((k) => k.subject === quiz.nafes!.subject && k.grade === quiz.nafes!.grade).map((k) => [k.name.trim(), k.id]));
    const { stats } = computeOutcomes([quiz], subs);
    const title = quiz.title;
    const rowsToAdd = subs
      .filter((s) => !measures.some((m) => m.student_id === s.student_id && m.title === title))
      .map((s) => {
        const sk: Record<string, number> = {};
        stats.forEach((st) => { const id = skillByName.get(st.outcome.trim()); const m = st.students.get(s.student_id); if (id && m && m.possible > 0) sk[id] = pct(m); });
        return { student_id: s.student_id, subject: quiz.nafes!.subject, measured_on: (s.completed_at || today()).slice(0, 10), score: Math.round(Number(s.percentage) || 0), skills: sk, title, note: '', created_by: me };
      });
    if (!rowsToAdd.length) return showToast(t('نتائج هذا الاختبار منقولة من قبل'), 'info');
    const r = await addMeasures(rowsToAdd);
    showToast(r.ok ? t('نُقلت نتائج {n} طالب إلى القياسات', { n: r.rows.length }) : t('تعذر الحفظ: {error}', { error: r.error || '' }), r.ok ? 'success' : 'error');
    if (r.ok) void reload();
  };

  const tabs: Array<[Tab, React.ComponentType<{ className?: string }>, string]> = [
    ['students', Users, t('الطلاب ومستوياتهم')], ['tests', ClipboardList, t('الاختبارات التجريبية والقياسات')],
    ['bank', Library, t('بنك نافس')], ['reports', BarChart3, t('التقارير والمؤشرات')], ['skills', ListChecks, t('المهارات')],
  ];
  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800" role="radiogroup" aria-label={t('المادة')}>
        {NAFES_SUBJECTS.map((s) => (
          <button key={s.k} type="button" role="radio" aria-checked={subject === s.k} onClick={() => setSubject(s.k)}
            className={`h-9 px-3 rounded-lg text-sm font-bold ${subject === s.k ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{t(s.label)}</button>
        ))}
      </div>
      <select value={grade} onChange={(e) => setGrade(e.target.value as NafesGrade | '')} className={inp} aria-label={t('الصف')}>
        <option value="">{t('كل الصفوف')}</option>
        {NAFES_GRADES.map((g) => <option key={g.k} value={g.k}>{t(g.label)}</option>)}
      </select>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-5" dir={uiDir()} data-testid="nafes-page">
      <PageHeader
        title={<span className="inline-flex items-center gap-2"><Target className="w-7 h-7 text-emerald-600" />{t('نافس')}</span>}
        subtitle={t('متابعة طلاب الاختبارات الوطنية «نافس»: مستوياتهم، واختبارات تجريبية بالمهارات، وبنك أسئلة خاص، وتقارير.')}
      />
      {!ready && !loading && (
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-xl p-3">{t('قسم نافس يحتاج تحديث قاعدة البيانات 062 (من Actions ← Supabase migrate).')}</p>
      )}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" role="tablist">
        {tabs.map(([k, Icon, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`shrink-0 h-10 px-3.5 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 ${tab === k ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-300'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'students' && (
        <>
          <Card className="p-3 flex flex-wrap items-center gap-2">
            {filters}
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inp} aria-label={t('الفصل')}>
              <option value="">{t('كل الفصول')}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="relative flex-1 min-w-[10rem]">
              <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث باسم الطالب')} className={`${inp} w-full ps-9`} />
            </label>
            <Button icon={Plus} onClick={() => setAdding(true)}>{t('إضافة طلاب')}</Button>
          </Card>
          {rows.length === 0 ? (
            <Card className="p-10 text-center space-y-2">
              <p className="font-bold text-slate-800 dark:text-slate-100">{loading ? t('جارٍ التحميل...') : t('لا يوجد طلاب نافس في هذه المادة بعد')}</p>
              {!loading && <Button icon={Plus} onClick={() => setAdding(true)}>{t('إضافة طلاب')}</Button>}
            </Card>
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(({ s, u, cls, last, first, count }) => {
                const delta = last != null && first != null ? Math.round(last - first) : null;
                return (
                  <div key={s.id} className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="nafes-row">
                    <div className="flex-1 min-w-[12rem]">
                      <StudentLink id={u!.id} name={u!.name} className="font-bold" />
                      <div className="text-xs text-slate-500 dark:text-slate-400">{[cls?.name, t(gradeLabel(s.grade)), t('{n} قياسات', { n: count })].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500"><span>{t('البداية')}</span><LevelChip score={first} /></div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500"><span>{t('الحالي')}</span><LevelChip score={last} /></div>
                    {delta != null && <span className={`inline-flex items-center gap-1 text-xs font-bold ${delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{delta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}{delta > 0 ? '+' : ''}{delta}</span>}
                    <Chip>{t('الهدف')} {s.target}%</Chip>
                    <Button size="sm" variant="secondary" onClick={() => setOpenStudent(s)}>{t('القياسات')}</Button>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      {tab === 'tests' && (
        <>
          <Card className="p-3 flex flex-wrap items-center gap-2">
            {filters}
            <div className="ms-auto flex flex-wrap gap-2">
              <Button variant="secondary" icon={Pencil} onClick={() => setBulk(true)}>{t('إدخال قياس يدوي')}</Button>
              {currentUser?.role !== 'supervisor' && <Button icon={Plus} onClick={newMock}>{t('اختبار تجريبي جديد')}</Button>}
            </div>
          </Card>
          {mockQuizzes.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-600 dark:text-slate-300">{t('لا توجد اختبارات تجريبية لهذه المادة. أنشئ اختباراً وفعّل «اختبار تجريبي بنمط نافس».')}</Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {mockQuizzes.map((qz) => {
                const subs = subsOf(qz.id);
                const scores = subs.map((s) => Number(s.percentage) || 0);
                const moved = measures.filter((m) => m.title === qz.title).length;
                return (
                  <Card key={qz.id} className="p-4 space-y-3" data-testid="nafes-quiz">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{qz.title}</p>
                        <p className="text-xs text-slate-500">{t(subjectLabel(qz.nafes!.subject))} · {t(gradeLabel(qz.nafes!.grade))} · {t('{n} تسليم', { n: subs.length })}</p>
                      </div>
                      <Chip tone={avg(scores) == null ? 'muted' : (levelOf(avg(scores))!.tone)}>{t('المتوسط')} {avg(scores) ?? '—'}%</Chip>
                    </div>
                    {scores.length > 0 && <LevelBar scores={scores} label={t('توزيع المستويات')} />}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" icon={Download} disabled={!subs.length} onClick={() => void importQuiz(qz.id)}>{t('نقل النتائج إلى القياسات')}</Button>
                      {moved > 0 && <span className="text-xs text-emerald-700 dark:text-emerald-400">{t('نُقل {n}', { n: moved })}</span>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          <Card className="p-4 space-y-2">
            <p className="font-bold text-slate-900 dark:text-white">{t('آخر القياسات')}</p>
            {(() => {
              const list = measures.filter((m) => m.subject === subject).slice(-12).reverse();
              return list.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {list.map((m) => (
                    <li key={m.id} className="py-2 flex flex-wrap items-center gap-2">
                      <span className="flex-1 min-w-[10rem] font-semibold text-slate-800 dark:text-slate-100">{userById.get(m.student_id)?.name || '—'}</span>
                      <span className="text-xs text-slate-500">{m.title || t('قياس')} · {m.measured_on}</span>
                      <LevelChip score={m.score} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">{t('لا توجد قياسات بعد')}</p>;
            })()}
          </Card>
        </>
      )}

      {tab === 'bank' && <QuestionBankPage track="nafes" embedded />}

      {tab === 'reports' && <NafesReports subject={subject} grade={grade} filters={filters} students={students} measures={measures} skills={skills} />}

      {tab === 'skills' && <SkillsManager subject={subject} grade={grade} filters={filters} skills={skills} me={me} onChange={() => void reload()} />}

      {adding && <AddStudentsModal subject={subject} existing={students} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void reload(); }} />}
      {bulk && <BulkMeasureModal subject={subject} grade={grade} students={students} onClose={() => setBulk(false)} onDone={() => { setBulk(false); void reload(); }} />}
      {openStudent && <StudentMeasures st={openStudent} skills={skills} measures={measures.filter((m) => m.student_id === openStudent.student_id && m.subject === openStudent.subject)}
        onClose={() => setOpenStudent(null)} onChange={() => void reload()} />}
    </div>
  );
};

/** إضافة طلاب لقسم نافس من فصل */
const AddStudentsModal: React.FC<{ subject: NafesSubject; existing: NafesStudent[]; onClose: () => void; onDone: () => void }> = ({ subject: subj0, existing, onClose, onDone }) => {
  const { users, classes, currentUser, showToast } = useApp();
  const [subject, setSubject] = useState<NafesSubject>(subj0);
  const [classId, setClassId] = useState(classes[0]?.id || '');
  const cls = classes.find((c) => c.id === classId);
  const [grade, setGrade] = useState<NafesGrade>(guessGrade(cls?.name) || '6');
  useEffect(() => { const g = guessGrade(cls?.name); if (g) setGrade(g); }, [classId, cls?.name]);
  const taken = new Set(existing.filter((s) => s.subject === subject).map((s) => s.student_id));
  const list = users.filter((u) => u.role === 'student' && u.class_id === classId && !taken.has(u.id)).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked(list.map((u) => u.id)), [classId, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const [target, setTarget] = useState(85);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!picked.length) return showToast(t('اختر طالباً واحداً على الأقل'), 'info');
    setBusy(true);
    const r = await addNafesStudents(picked.map((id) => ({ student_id: id, subject, grade, baseline: null, target, teacher_id: currentUser?.id || null })));
    setBusy(false);
    if (!r.ok) return showToast(t('تعذر الحفظ: {error}', { error: r.error || '' }), 'error');
    showToast(t('أُضيف {n} طالب لقسم نافس', { n: r.rows.length || picked.length }), 'success');
    onDone();
  };
  return (
    <Modal title={t('إضافة طلاب لقسم نافس')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button><Button disabled={busy} onClick={() => void save()}>{t('إضافة {n} طالب', { n: picked.length })}</Button></>}>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('المادة')}
          <select value={subject} onChange={(e) => setSubject(e.target.value as NafesSubject)} className={`${inp} w-full`}>{NAFES_SUBJECTS.map((s) => <option key={s.k} value={s.k}>{t(s.label)}</option>)}</select></label>
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('الفصل')}
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inp} w-full`}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('صف نافس')}
          <select value={grade} onChange={(e) => setGrade(e.target.value as NafesGrade)} className={`${inp} w-full`}>{NAFES_GRADES.map((g) => <option key={g.k} value={g.k}>{t(g.label)}</option>)}</select></label>
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('الهدف (%)')}
          <input type="number" min={0} max={100} value={target} onChange={(e) => setTarget(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className={`${inp} w-full`} /></label>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-slate-700 dark:text-slate-300 flex-1">{t('{n} طالب في الفصل غير مضافين', { n: list.length })}</span>
        <button type="button" className="font-bold text-emerald-700" onClick={() => setPicked(picked.length === list.length ? [] : list.map((u) => u.id))}>{picked.length === list.length ? t('إلغاء تحديد الكل') : t('تحديد الكل')}</button>
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        {list.map((u) => (
          <li key={u.id}><label className="flex items-center gap-2 p-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={picked.includes(u.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, u.id] : picked.filter((x) => x !== u.id))} className="w-4 h-4 accent-emerald-600" />
            <span className="text-slate-800 dark:text-slate-100">{u.name}</span>
          </label></li>
        ))}
        {!list.length && <li className="p-3 text-sm text-slate-500">{t('كل طلاب هذا الفصل مضافون في هذه المادة')}</li>}
      </ul>
      <p className="text-[11px] text-slate-500">{t('أول قياس للطالب (يدوي أو من اختبار تجريبي) يُعتبر مستواه عند البداية، ويمكن تعديله من «القياسات».')}</p>
    </Modal>
  );
};

/** إدخال قياس لمجموعة طلاب دفعة واحدة */
const BulkMeasureModal: React.FC<{ subject: NafesSubject; grade: NafesGrade | ''; students: NafesStudent[]; onClose: () => void; onDone: () => void }> = ({ subject, grade, students, onClose, onDone }) => {
  const { users, currentUser, showToast } = useApp();
  const list = students.filter((s) => s.subject === subject && (!grade || s.grade === grade)).map((s) => ({ s, u: users.find((u) => u.id === s.student_id) })).filter((x) => x.u);
  const [title, setTitle] = useState(t('قياس'));
  const [date, setDate] = useState(today());
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const rows = list.filter(({ s }) => scores[s.student_id] !== undefined && scores[s.student_id] !== '').map(({ s }) => ({
      student_id: s.student_id, subject, measured_on: date, score: Math.max(0, Math.min(100, Number(scores[s.student_id]) || 0)), skills: {}, title: title.trim(), note: '', created_by: currentUser?.id || null,
    }));
    if (!rows.length) return showToast(t('اكتب درجة طالب واحد على الأقل'), 'info');
    setBusy(true);
    const r = await addMeasures(rows);
    setBusy(false);
    showToast(r.ok ? t('حُفظت {n} قياسات', { n: r.rows.length }) : t('تعذر الحفظ: {error}', { error: r.error || '' }), r.ok ? 'success' : 'error');
    if (r.ok) onDone();
  };
  return (
    <Modal wide title={t('إدخال قياس يدوي — {s}', { s: t(subjectLabel(subject)) })} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button><Button disabled={busy} onClick={() => void save()}>{t('حفظ')}</Button></>}>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('اسم القياس')}<input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inp} w-full`} /></label>
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('التاريخ')}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} w-full`} /></label>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        {list.map(({ s, u }) => (
          <li key={s.id} className="flex items-center gap-2 p-2">
            <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">{u!.name}</span>
            <LevelChip score={scores[s.student_id] ? Number(scores[s.student_id]) : null} />
            <input type="number" min={0} max={100} inputMode="numeric" placeholder="%" value={scores[s.student_id] ?? ''} onChange={(e) => setScores({ ...scores, [s.student_id]: e.target.value })} aria-label={t('درجة {name}', { name: u!.name })} className={`${inp} w-20 text-center`} />
          </li>
        ))}
        {!list.length && <li className="p-3 text-sm text-slate-500">{t('لا يوجد طلاب نافس في هذه المادة بعد')}</li>}
      </ul>
    </Modal>
  );
};

/** قياسات طالب: سجلها، وإضافة قياس بدرجات المهارات، وتعديل البداية والهدف */
const StudentMeasures: React.FC<{ st: NafesStudent; skills: NafesSkill[]; measures: NafesMeasure[]; onClose: () => void; onChange: () => void }> = ({ st, skills, measures, onClose, onChange }) => {
  const { users, currentUser, showToast } = useApp();
  const u = users.find((x) => x.id === st.student_id);
  const mySkills = skills.filter((k) => k.subject === st.subject && k.grade === st.grade);
  const [score, setScore] = useState('');
  const [sk, setSk] = useState<Record<string, string>>({});
  const [title, setTitle] = useState(t('قياس'));
  const [date, setDate] = useState(today());
  const [baseline, setBaseline] = useState(st.baseline == null ? '' : String(st.baseline));
  const [target, setTarget] = useState(String(st.target));
  const [note, setNote] = useState(st.note);
  // متوسط كل مهارة من كل القياسات
  const skillAvg = mySkills.map((k) => ({ k, v: avg(measures.map((m) => m.skills?.[k.id]).filter((x): x is number => typeof x === 'number')) }));
  const add = async () => {
    const skillsNum = Object.fromEntries(Object.entries(sk).filter(([, v]) => v !== '').map(([k, v]) => [k, Math.max(0, Math.min(100, Number(v) || 0))]));
    const vals = Object.values(skillsNum);
    const sc = score !== '' ? Number(score) : vals.length ? avg(vals as number[]) : null;
    if (sc == null) return showToast(t('اكتب الدرجة أو درجات المهارات'), 'info');
    const r = await addMeasures([{ student_id: st.student_id, subject: st.subject, measured_on: date, score: Math.max(0, Math.min(100, sc)), skills: skillsNum, title: title.trim(), note: '', created_by: currentUser?.id || null }]);
    if (!r.ok) return showToast(t('تعذر الحفظ: {error}', { error: r.error || '' }), 'error');
    setScore(''); setSk({}); onChange();
  };
  const saveInfo = async () => {
    const r = await updateNafesStudent(st.id, { baseline: baseline === '' ? null : Math.max(0, Math.min(100, Number(baseline) || 0)), target: Math.max(0, Math.min(100, Number(target) || 85)), note: note.trim() });
    showToast(r ? t('تم الحفظ') : t('تعذر الحفظ'), r ? 'success' : 'error');
    if (r) onChange();
  };
  const remove = async () => {
    if (!window.confirm(t('إزالة الطالب من قسم نافس في هذه المادة؟ تبقى قياساته محفوظة.'))) return;
    if (await deleteNafesStudent(st.id)) { onChange(); onClose(); }
  };
  return (
    <Modal wide title={`${u?.name || ''} — ${t(subjectLabel(st.subject))}`} onClose={onClose}>
      <div className="grid sm:grid-cols-4 gap-2">
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('مستوى البداية (%)')}<input type="number" min={0} max={100} value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder={t('من أول قياس')} className={`${inp} w-full`} /></label>
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('الهدف (%)')}<input type="number" min={0} max={100} value={target} onChange={(e) => setTarget(e.target.value)} className={`${inp} w-full`} /></label>
        <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">{t('ملاحظة')}<input value={note} onChange={(e) => setNote(e.target.value)} className={`${inp} w-full`} /></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void saveInfo()}>{t('حفظ البيانات')}</Button><Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove()}>{t('إزالة من نافس')}</Button></div>

      {skillAvg.some((x) => x.v != null) && (
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('مستواه في كل مهارة')}</p>
          <HBarRank items={skillAvg.filter((x) => x.v != null).map((x) => ({ key: x.k.id, label: x.k.name, sub: x.k.domain, value: x.v as number }))} label={t('المهارات')} />
        </div>
      )}

      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 p-3 space-y-2">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('قياس جديد')}</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('اسم القياس')} className={inp} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('التاريخ')} className={inp} />
          <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder={t('الدرجة الكلية %')} aria-label={t('الدرجة الكلية %')} className={inp} />
        </div>
        {mySkills.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-1.5">
            {mySkills.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="flex-1 min-w-0 truncate" title={k.name}>{k.name}</span>
                <input type="number" min={0} max={100} placeholder="%" value={sk[k.id] ?? ''} onChange={(e) => setSk({ ...sk, [k.id]: e.target.value })} className={`${inp} w-20 h-8 text-center`} />
              </label>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500">{t('درجات المهارات اختيارية؛ إن تُركت الدرجة الكلية فارغة تُحسب من متوسط المهارات.')}</p>
        <Button size="sm" icon={Plus} onClick={() => void add()}>{t('إضافة القياس')}</Button>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
        {[...measures].reverse().map((m) => (
          <li key={m.id} className="py-2 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[8rem] text-slate-800 dark:text-slate-100">{m.title || t('قياس')} <span className="text-xs text-slate-500">· {m.measured_on}</span></span>
            <LevelChip score={m.score} />
            <button type="button" aria-label={t('حذف')} onClick={async () => { if (window.confirm(t('حذف هذا القياس؟')) && await deleteMeasure(m.id)) onChange(); }} className="w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
        {!measures.length && <li className="py-2 text-slate-500">{t('لا توجد قياسات بعد')}</li>}
      </ul>
    </Modal>
  );
};

/** تقارير ومؤشرات نافس */
const NafesReports: React.FC<{ subject: NafesSubject; grade: NafesGrade | ''; filters: React.ReactNode; students: NafesStudent[]; measures: NafesMeasure[]; skills: NafesSkill[] }> = ({ subject, grade, filters, students, measures, skills }) => {
  const { users, classes, quizzes, submissions } = useApp();
  const list = students.filter((s) => s.subject === subject && (!grade || s.grade === grade));
  const byStudent = (sid: string) => measures.filter((m) => m.student_id === sid && m.subject === subject);
  const data = list.map((s) => {
    const ms = byStudent(s.student_id);
    const u = users.find((x) => x.id === s.student_id);
    return { s, u, first: s.baseline ?? ms[0]?.score ?? null, last: ms.length ? ms[ms.length - 1].score : null };
  }).filter((d) => d.u);
  const lastScores = data.map((d) => d.last).filter((x): x is number => x != null);
  const firstScores = data.map((d) => d.first).filter((x): x is number => x != null);
  const good = lastScores.filter((x) => x >= 70).length;
  const gains = data.filter((d) => d.first != null && d.last != null).map((d) => (d.last as number) - (d.first as number));
  const reached = data.filter((d) => d.last != null && d.last >= d.s.target).length;

  // المهارات: من القياسات (درجات المهارات) ومن الاختبارات التجريبية (نواتج التعلم)
  const mySkills = skills.filter((k) => k.subject === subject && (!grade || k.grade === grade));
  const ids = new Set(list.map((s) => s.student_id));
  const mocks = quizzes.filter((qz) => !qz.is_deleted && qz.nafes?.subject === subject && (!grade || qz.nafes.grade === grade));
  const { stats } = computeOutcomes(mocks, submissions.filter((s) => ids.has(s.student_id)));
  const skillRows = mySkills.map((k) => {
    const fromMeasures = measures.filter((m) => ids.has(m.student_id) && m.subject === subject).map((m) => m.skills?.[k.id]).filter((x): x is number => typeof x === 'number');
    const st = stats.find((x) => x.outcome.trim() === k.name.trim());
    const all = [...fromMeasures, ...(st && st.possible > 0 ? [pct(st)] : [])];
    return { k, v: avg(all) };
  }).filter((x) => x.v != null) as Array<{ k: NafesSkill; v: number }>;
  // الفصول
  const byClass = new Map<string, number[]>();
  data.forEach((d) => { if (d.last != null && d.u?.class_id) byClass.set(d.u.class_id, [...(byClass.get(d.u.class_id) || []), d.last]); });
  const classRows = Array.from(byClass.entries()).map(([id, xs]) => ({ key: id, label: classes.find((c) => c.id === id)?.name || id, sub: t('{n} طالب', { n: xs.length }), value: avg(xs) as number }));

  const sections = (): ExportSection[] => [
    { title: t('الطلاب'), headers: [t('الطالب'), t('الفصل'), t('الصف'), t('البداية'), t('مستوى البداية'), t('الحالي'), t('المستوى الحالي'), t('التغير'), t('الهدف')],
      rows: data.map((d) => [d.u!.name, classes.find((c) => c.id === d.u!.class_id)?.name || '', t(gradeLabel(d.s.grade)), d.first ?? '', d.first != null ? t(levelOf(d.first)!.label) : '', d.last ?? '', d.last != null ? t(levelOf(d.last)!.label) : '', d.first != null && d.last != null ? Math.round(d.last - d.first) : '', d.s.target]) },
    { title: t('توزيع المستويات'), headers: [t('المستوى'), t('البداية'), t('الحالي')], rows: LEVELS.map((l) => [t(l.label), firstScores.filter((x) => levelOf(x)?.k === l.k).length, lastScores.filter((x) => levelOf(x)?.k === l.k).length]) },
    { title: t('المهارات'), headers: [t('المجال'), t('المهارة'), t('نسبة الإتقان')], rows: [...skillRows].sort((a, b) => a.v - b.v).map((x) => [x.k.domain, x.k.name, `${x.v}%`]) },
    { title: t('الفصول'), headers: [t('الفصل'), t('عدد الطلاب'), t('المتوسط')], rows: classRows.map((c) => [c.label, byClass.get(c.key)?.length || 0, `${c.value}%`]) },
  ];
  const title = `${t('تقرير نافس')} — ${t(subjectLabel(subject))}${grade ? ` — ${t(gradeLabel(grade))}` : ''}`;

  return (
    <>
      <Card className="p-3 flex flex-wrap items-center gap-2">
        {filters}
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="secondary" icon={FileSpreadsheet} onClick={() => void exportSectionsXlsx(title, sections())}>{t('Excel')}</Button>
          <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportSectionsPdf(title, new Date().toLocaleDateString('ar-SA'), sections())}>{t('PDF')}</Button>
        </div>
      </Card>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={t('طلاب نافس')} value={data.length} hint={t('{n} لهم قياس', { n: lastScores.length })} />
        <StatTile label={t('متوسط آخر قياس')} value={avg(lastScores) != null ? `${avg(lastScores)}%` : '—'} progress={avg(lastScores) ?? 0} />
        <StatTile label={t('متقدم ومتمكن')} value={lastScores.length ? `${Math.round((good / lastScores.length) * 100)}%` : '—'} hint={t('{n} طالب', { n: good })} hintTone="ok" />
        <StatTile label={t('متوسط التحسن')} value={gains.length ? `${avg(gains)! > 0 ? '+' : ''}${avg(gains)}` : '—'} hint={t('بلغ الهدف: {n}', { n: reached })} hintTone={(avg(gains) ?? 0) >= 0 ? 'ok' : 'bad'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <Card className="p-4 space-y-3">
          <p className="font-bold text-slate-900 dark:text-white">{t('توزيع المستويات')}</p>
          <div className="space-y-1"><p className="text-xs text-slate-500">{t('عند البداية')}</p><LevelBar scores={firstScores} label={t('عند البداية')} /></div>
          <div className="space-y-1"><p className="text-xs text-slate-500">{t('الآن')}</p><LevelBar scores={lastScores} label={t('الآن')} /></div>
        </Card>
        <Card className="p-4 space-y-2">
          <p className="font-bold text-slate-900 dark:text-white">{t('المهارات من الأضعف للأقوى')}</p>
          {skillRows.length ? <HBarRank items={skillRows.map((x) => ({ key: x.k.id, label: x.k.name, sub: x.k.domain, value: x.v }))} label={t('المهارات')} sort={false} maxRows={10}
            avg={avg(skillRows.map((x) => x.v)) ?? undefined} /> : <p className="text-sm text-slate-500">{t('تظهر هنا بعد قياسات بدرجات المهارات أو اختبارات تجريبية أسئلتها موسومة بالمهارات.')}</p>}
        </Card>
      </div>
      {classRows.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="font-bold text-slate-900 dark:text-white">{t('مقارنة الفصول (متوسط آخر قياس)')}</p>
          <HBarRank items={classRows} label={t('الفصول')} avg={avg(lastScores) ?? undefined} />
        </Card>
      )}
    </>
  );
};

/** إدارة مهارات نافس */
const SkillsManager: React.FC<{ subject: NafesSubject; grade: NafesGrade | ''; filters: React.ReactNode; skills: NafesSkill[]; me: string; onChange: () => void }> = ({ subject, grade, filters, skills, me, onChange }) => {
  const { showToast } = useApp();
  const g: NafesGrade = grade || '6';
  const list = skills.filter((k) => k.subject === subject && k.grade === g);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    const r = await saveSkill({ subject, grade: g, domain, name, created_by: me });
    if (!r.ok) return showToast(t('تعذر الحفظ: {error}', { error: r.error || '' }), 'error');
    setName(''); onChange();
  };
  const domains = Array.from(new Set(list.map((k) => k.domain).filter(Boolean)));
  return (
    <>
      <Card className="p-3 flex flex-wrap items-center gap-2">{filters}<span className="text-xs text-slate-500">{t('المهارات لصف: {g}', { g: t(gradeLabel(g)) })}</span></Card>
      <Card className="p-4 space-y-3">
        <p className="text-xs text-slate-500">{t('في الاختبار التجريبي اختر لكل سؤال «ناتج التعلم» من هذه المهارات، فتُحلَّل النتائج بها تلقائياً.')}</p>
        <div className="flex flex-wrap gap-2">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} list="nafes-domains" placeholder={t('المجال')} className={`${inp} w-44`} />
          <datalist id="nafes-domains">{domains.map((d) => <option key={d} value={d} />)}</datalist>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('اسم المهارة')} className={`${inp} flex-1 min-w-[12rem]`} />
          <Button icon={Plus} onClick={() => void add()}>{t('إضافة')}</Button>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((k) => (
            <li key={k.id} className="py-2 flex items-center gap-2 text-sm">
              <Chip>{k.domain || '—'}</Chip>
              <span className="flex-1 text-slate-800 dark:text-slate-100">{k.name}</span>
              <button type="button" aria-label={t('حذف')} onClick={async () => { if (window.confirm(t('حذف هذه المهارة؟')) && await deleteSkill(k.id)) onChange(); }} className="w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
          {!list.length && <li className="py-2 text-sm text-slate-500">{t('لا توجد مهارات')}</li>}
        </ul>
      </Card>
    </>
  );
};
