import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, X, Trash2, BarChart3, FileSpreadsheet, Star, Lock, Unlock, Save, MessageSquareText, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import {
  Survey, SurveyQuestion, SurveyQType, SurveyResponse, deleteSurvey, fetchMySurveys, fetchResponses, fetchSurveyCounts, fetchSurveys,
  saveSurvey, summarize,
} from '../../services/visitsSurveysService';
import { uiDir, t, dateLocale } from '../../i18n';
import { SurveyAnswerModal } from '../common/SurveyPrompt';

const ROLE_LABEL: Record<string, string> = { parent: 'أولياء الأمور', student: 'الطلاب', teacher: 'المعلمون', supervisor: 'المشرفون' };
const QTYPE_LABEL: Record<SurveyQType, string> = { rating: 'تقييم من 1 إلى 5', choice: 'اختيار من متعدد', text: 'إجابة نصية' };
const qid = () => `q${Math.random().toString(36).slice(2, 8)}`;
const fmt = (d: string) => new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

/** الاستبيانات: الإنشاء والنتائج لمن لديه الصلاحية، والإجابة للفئات المستهدفة */
export const SurveysPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const me = currentUser!;
  const canManage = hasPerm(me, 'can_manage_surveys');
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [mine, setMine] = useState<Survey[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Survey | 'new' | null>(null);
  const [results, setResults] = useState<Survey | null>(null);
  const [answering, setAnswering] = useState<Survey | null>(null);

  const load = () => {
    void fetchMySurveys().then(setMine);
    if (canManage) { void fetchSurveys().then(setSurveys); void fetchSurveyCounts().then(setCounts); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [canManage]);

  const toggleOpen = async (s: Survey) => {
    const r = await saveSurvey({ id: s.id, title: s.title, is_open: !s.is_open });
    if (!r) return showToast(t('تعذر الحفظ'), 'error');
    setSurveys((p) => (p || []).map((x) => (x.id === s.id ? r : x)));
    showToast(r.is_open ? t('نُشر الاستبيان وأُشعرت الفئة المستهدفة') : t('أُغلق الاستبيان'), 'success');
    void fetchMySurveys().then(setMine);
  };
  const remove = async (s: Survey) => {
    if (!window.confirm(t('حذف الاستبيان «{t}» وكل إجاباته؟', { t: s.title }))) return;
    if (await deleteSurvey(s.id)) setSurveys((p) => (p || []).filter((x) => x.id !== s.id)); else showToast(t('تعذر الحذف'), 'error');
  };
  const pending = mine.filter((s) => !s.answered);

  return (
    <div className="max-w-6xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={<span className="inline-flex items-center gap-2"><ClipboardList className="w-7 h-7 text-indigo-600" />{t('الاستبيانات')}</span>}
        subtitle={canManage ? t('استبيانات لأولياء الأمور والطلاب والمعلمين، بنتائج ورسوم فورية') : t('شاركنا رأيك')}
        actions={canManage ? <Button icon={Plus} onClick={() => setEditing('new')}>{t('استبيان جديد')}</Button> : undefined} />

      {(pending.length > 0 || !canManage) && (
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">{t('بانتظار إجابتك')}</h2>
          {pending.length === 0 ? <p className="text-sm text-slate-500">{t('لا توجد استبيانات جديدة الآن. شكراً لمشاركتك!')}</p> : pending.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
              <div className="flex-1 min-w-[200px]"><div className="font-semibold text-slate-900 dark:text-white">{s.title}</div>{s.description && <div className="text-sm text-slate-600 dark:text-slate-300">{s.description}</div>}</div>
              <Button onClick={() => setAnswering(s)}>{t('أجب الآن')}</Button>
            </div>
          ))}
        </Card>
      )}

      {canManage && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 pt-4 pb-2 font-bold text-slate-900 dark:text-white">{t('كل الاستبيانات')}</div>
          {surveys === null ? <p className="p-8 text-center text-slate-500">{t('جارٍ التحميل…')}</p> : surveys.length === 0 ? (
            <p className="p-10 text-center text-slate-500">{t('لا توجد استبيانات بعد. أنشئ أول استبيان.')}</p>
          ) : surveys.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex-1 min-w-[220px]">
                <div className="font-semibold text-slate-900 dark:text-white">{s.title}</div>
                <div className="text-xs text-slate-500">{[s.roles.map((r) => t(ROLE_LABEL[r] || r)).join('، '), t('{n} سؤال', { n: s.questions.length }), s.anonymous ? t('مجهول الهوية') : t('بالأسماء'), fmt(s.created_at)].join(' · ')}</div>
              </div>
              <Chip tone={s.is_open ? 'ok' : 'muted'}>{s.is_open ? t('مفتوح') : t('مغلق')}</Chip>
              <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{t('{n} إجابة', { n: counts[s.id] || 0 })}</span>
              <Button size="sm" variant="secondary" icon={BarChart3} onClick={() => setResults(s)}>{t('النتائج')}</Button>
              <Button size="sm" variant={s.is_open ? 'secondary' : 'primary'} icon={s.is_open ? Lock : Unlock} onClick={() => void toggleOpen(s)}>{s.is_open ? t('إغلاق') : t('نشر')}</Button>
              <button type="button" aria-label={t('تعديل')} onClick={() => setEditing(s)} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"><Pencil className="w-4 h-4" /></button>
              <button type="button" aria-label={t('حذف')} onClick={() => void remove(s)} className="w-9 h-9 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </Card>
      )}

      {editing && <SurveyEditor survey={editing === 'new' ? null : editing} locked={editing !== 'new' && (counts[editing.id] || 0) > 0}
        onClose={() => setEditing(null)} onSaved={(s) => { setSurveys((p) => { const l = p || []; return l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [s, ...l]; }); setEditing(null); }} />}
      {results && <SurveyResults survey={results} onClose={() => setResults(null)} />}
      {answering && <SurveyAnswerModal survey={answering} onClose={() => setAnswering(null)} onDone={() => { setMine((p) => p.map((x) => (x.id === answering.id ? { ...x, answered: true } : x))); setAnswering(null); setCounts((c) => ({ ...c, [answering.id]: (c[answering.id] || 0) + 1 })); }} />}
    </div>
  );
};

const SurveyEditor: React.FC<{ survey: Survey | null; locked: boolean; onClose: () => void; onSaved: (s: Survey) => void }> = ({ survey, locked, onClose, onSaved }) => {
  const { currentUser, showToast } = useApp();
  const [title, setTitle] = useState(survey?.title || '');
  const [description, setDescription] = useState(survey?.description || '');
  const [roles, setRoles] = useState<string[]>(survey?.roles || ['parent']);
  const [anonymous, setAnonymous] = useState(survey?.anonymous ?? true);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(survey?.questions || [
    { id: qid(), type: 'rating', text: 'ما مدى رضاك عن مستوى التعليم في المدرسة؟', required: true },
    { id: qid(), type: 'rating', text: 'ما مدى رضاك عن التواصل بين المدرسة والأسرة؟', required: true },
    { id: qid(), type: 'text', text: 'اقتراحاتك لتطوير المدرسة', required: false },
  ]);
  const [busy, setBusy] = useState(false);
  const upd = (i: number, p: Partial<SurveyQuestion>) => setQuestions((q) => q.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = async () => {
    const qs = questions.map((q) => ({ ...q, text: q.text.trim(), options: q.type === 'choice' ? (q.options || []).map((o) => o.trim()).filter(Boolean) : undefined })).filter((q) => q.text);
    if (!title.trim()) return showToast(t('اكتب عنوان الاستبيان'), 'error');
    if (!roles.length) return showToast(t('اختر فئة مستهدفة واحدة على الأقل'), 'error');
    if (!qs.length) return showToast(t('أضف سؤالاً واحداً على الأقل'), 'error');
    if (qs.some((q) => q.type === 'choice' && (q.options || []).length < 2)) return showToast(t('سؤال الاختيار يحتاج خيارين على الأقل'), 'error');
    setBusy(true);
    const s = await saveSurvey({
      ...(survey ? { id: survey.id } : { created_by: currentUser!.id, created_by_name: currentUser!.name, is_open: false }),
      title: title.trim(), description: description.trim(), roles, anonymous, ...(locked ? {} : { questions: qs }),
    });
    setBusy(false);
    if (!s) return showToast(t('تعذر الحفظ'), 'error');
    showToast(survey ? t('تم الحفظ') : t('حُفظ الاستبيان. اضغط «نشر» ليصل للفئة المستهدفة.'), 'success');
    onSaved(s);
  };
  const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-full';
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('استبيان جديد')} onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white flex-1">{survey ? t('تعديل الاستبيان') : t('استبيان جديد')}</h2>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <label className="block text-sm text-slate-600 dark:text-slate-300 space-y-1">{t('عنوان الاستبيان')}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={inp} placeholder={t('مثال: استبيان رضا أولياء الأمور — الفصل الأول')} /></label>
          <label className="block text-sm text-slate-600 dark:text-slate-300 space-y-1">{t('وصف قصير (اختياري)')}<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inp} h-auto py-2`} /></label>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-slate-600 dark:text-slate-300">{t('الفئة المستهدفة')}:</span>
            {Object.keys(ROLE_LABEL).map((r) => (
              <label key={r} className={`h-9 px-3 rounded-xl border text-sm inline-flex items-center gap-2 cursor-pointer ${roles.includes(r) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700'}`}>
                <input type="checkbox" className="sr-only" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />{t(ROLE_LABEL[r])}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />{t('مجهول الهوية (لا تظهر أسماء المجيبين)')}</label>
          {locked && <p className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3">{t('وصلت إجابات لهذا الاستبيان، لذا لا يمكن تعديل الأسئلة (يمكن تعديل العنوان والوصف والفئة).')}</p>}
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-bold text-slate-500 w-6">{i + 1}.</span>
                  <input value={q.text} disabled={locked} onChange={(e) => upd(i, { text: e.target.value })} placeholder={t('نص السؤال')} aria-label={t('نص السؤال {n}', { n: i + 1 })} className={inp} />
                  {!locked && <button type="button" aria-label={t('حذف السؤال')} onClick={() => setQuestions(questions.filter((_, k) => k !== i))} className="w-9 h-9 shrink-0 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <div className="flex flex-wrap gap-2 items-center ps-8">
                  <select value={q.type} disabled={locked} onChange={(e) => upd(i, { type: e.target.value as SurveyQType, options: e.target.value === 'choice' ? (q.options?.length ? q.options : ['', '']) : undefined })} className="h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    {(Object.keys(QTYPE_LABEL) as SurveyQType[]).map((k) => <option key={k} value={k}>{t(QTYPE_LABEL[k])}</option>)}
                  </select>
                  <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1"><input type="checkbox" disabled={locked} checked={q.required !== false} onChange={(e) => upd(i, { required: e.target.checked })} />{t('إجباري')}</label>
                </div>
                {q.type === 'choice' && (
                  <div className="ps-8 space-y-1.5">
                    {(q.options || []).map((o, k) => (
                      <div key={k} className="flex gap-2">
                        <input value={o} disabled={locked} onChange={(e) => upd(i, { options: (q.options || []).map((x, j) => (j === k ? e.target.value : x)) })} placeholder={t('الخيار {n}', { n: k + 1 })} className={`${inp} h-9`} />
                        {!locked && (q.options || []).length > 2 && <button type="button" aria-label={t('حذف الخيار')} onClick={() => upd(i, { options: (q.options || []).filter((_, j) => j !== k) })} className="text-slate-400 hover:text-rose-600"><X className="w-4 h-4" /></button>}
                      </div>
                    ))}
                    {!locked && <button type="button" onClick={() => upd(i, { options: [...(q.options || []), ''] })} className="text-sm font-semibold text-indigo-600">+ {t('خيار')}</button>}
                  </div>
                )}
              </div>
            ))}
            {!locked && <Button variant="secondary" icon={Plus} onClick={() => setQuestions([...questions, { id: qid(), type: 'rating', text: '', required: true }])}>{t('سؤال')}</Button>}
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end"><Button icon={Save} disabled={busy} onClick={() => void save()}>{busy ? t('جارٍ الحفظ…') : t('حفظ')}</Button></div>
      </div>
    </div>
  );
};

const SurveyResults: React.FC<{ survey: Survey; onClose: () => void }> = ({ survey, onClose }) => {
  const [rs, setRs] = useState<SurveyResponse[] | null>(null);
  useEffect(() => { void fetchResponses(survey.id).then(setRs); }, [survey.id]);
  const sums = useMemo(() => (rs ? survey.questions.map((q) => ({ q, s: summarize(q, rs) })) : []), [rs, survey]);
  const exportExcel = async () => {
    if (!rs) return;
    const XLSX = await import('xlsx');
    const head = [...(survey.anonymous ? [] : [t('الاسم')]), t('التاريخ'), ...survey.questions.map((q) => q.text)];
    const body = rs.map((r) => [...(survey.anonymous ? [] : [r.user_name]), new Date(r.created_at).toLocaleString(dateLocale()), ...survey.questions.map((q) => r.answers?.[q.id] ?? '')]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t('الإجابات').slice(0, 31));
    XLSX.writeFile(wb, `survey-${survey.title}.xlsx`.replace(/[\\/:*?"<>|\s]+/g, '-'));
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('نتائج الاستبيان')} onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()} data-testid="survey-results">
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1"><h2 className="font-bold text-lg text-slate-900 dark:text-white">{survey.title}</h2><p className="text-sm text-slate-500">{t('{n} إجابة', { n: rs?.length ?? 0 })}</p></div>
          <Button size="sm" variant="secondary" icon={FileSpreadsheet} disabled={!rs?.length} onClick={() => void exportExcel()}>{t('Excel')}</Button>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {rs === null ? <p className="text-center text-slate-500">{t('جارٍ التحميل…')}</p> : rs.length === 0 ? <p className="text-center text-slate-500 py-10">{t('لا توجد إجابات بعد')}</p> : sums.map(({ q, s }, i) => (
            <div key={q.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="font-semibold text-slate-900 dark:text-white mb-2">{i + 1}. {q.text} <span className="text-xs font-normal text-slate-500">({t('{n} إجابة', { n: s.n })})</span></div>
              {s.kind === 'rating' && (
                <div className="flex flex-wrap items-center gap-5">
                  <div className="text-center"><div className="text-3xl font-extrabold text-amber-500 tabular-nums">{s.avg}</div><div className="text-xs text-slate-500">{t('من 5')}</div></div>
                  <div className="flex-1 min-w-[220px] space-y-1">
                    {[5, 4, 3, 2, 1].map((k) => { const c = s.dist[k - 1]; const p = s.n ? (c / s.n) * 100 : 0; return (
                      <div key={k} className="flex items-center gap-2 text-xs"><span className="w-8 tabular-nums inline-flex items-center gap-0.5">{k}<Star className="w-3 h-3 text-amber-400" fill="currentColor" /></span>
                        <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${p}%` }} /></div><span className="w-20 whitespace-nowrap text-end tabular-nums text-slate-600 dark:text-slate-300">{c} · {Math.round(p)}%</span></div>
                    ); })}
                  </div>
                </div>
              )}
              {s.kind === 'choice' && (
                <div className="space-y-1.5">{s.counts.map(({ o, c }) => { const p = s.n ? (c / s.n) * 100 : 0; return (
                  <div key={o} className="text-sm"><div className="flex justify-between"><span className="text-slate-700 dark:text-slate-200">{o}</span><span className="tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">{c} · {Math.round(p)}%</span></div>
                    <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-0.5"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${p}%` }} /></div></div>
                ); })}</div>
              )}
              {s.kind === 'text' && (
                <ul className="space-y-1.5 max-h-72 overflow-y-auto">{s.texts.map((x, k) => <li key={k} className="text-sm text-slate-700 dark:text-slate-300 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 flex gap-2"><MessageSquareText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />{x}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
