import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotebookPen, X, Paperclip, FileText, Image as ImageIcon, Link2, PlayCircle, Trash2, Send, ChevronLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Chip, Tone } from './ui';
import {
  ACCEPT, Homework, HwFile, HwState, HwSubmission, maxFileMb, deleteFile, fetchFiles, fetchHomework, fetchSubmissions,
  fmtSize, hwState, openFile, safeUrl, saveSubmission, uploadFile, youtubeEmbed,
} from '../../services/homeworkService';
import { pathFor } from '../../utils/router';
import { uiDir, t, dateLocale } from '../../i18n';
import type { User } from '../../types';

export const STATE_UI: Record<HwState, { tone: Tone; label: () => string }> = {
  pending: { tone: 'warn', label: () => t('مطلوب') },
  overdue: { tone: 'bad', label: () => t('فات موعده') },
  submitted: { tone: 'info', label: () => t('تم التسليم') },
  late: { tone: 'info', label: () => t('سُلّم متأخراً') },
  graded: { tone: 'ok', label: () => t('مُصحّح') },
  info: { tone: 'muted', label: () => t('للاطلاع') },
};

export const StateChip: React.FC<{ state: HwState; staff?: boolean }> = ({ state, staff }) =>
  staff && state === 'pending' ? <Chip tone="muted">{t('لم يسلّم')}</Chip>
    : staff && state === 'overdue' ? <Chip tone="bad">{t('لم يسلّم')}</Chip>
    : <Chip tone={STATE_UI[state].tone}>{STATE_UI[state].label()}</Chip>;

export const dueText = (iso: string | null) => {
  if (!iso) return t('بلا موعد');
  const d = new Date(iso);
  return t('التسليم {d}', { d: d.toLocaleString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) });
};

const fileIcon = (f: HwFile) => (f.mime.startsWith('image/') ? ImageIcon : FileText);

/** قائمة الملفات: فتح، وحذف اختياري */
export const FileChips: React.FC<{ files: HwFile[]; onDelete?: (f: HwFile) => void }> = ({ files, onDelete }) => {
  const { showToast } = useApp();
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => {
        const Icon = fileIcon(f);
        return (
          <li key={f.id} className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 max-w-full">
            <button type="button" onClick={() => void openFile(f).then((ok) => !ok && showToast(t('تعذر فتح الملف'), 'error'))}
              className="h-9 ps-3 pe-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0">
              <Icon className="w-4 h-4 text-indigo-600 shrink-0" /><span className="truncate max-w-[14rem]">{f.name}</span>
              <span className="text-xs text-slate-500 font-normal tabular-nums" dir="ltr">{fmtSize(f.size)}</span>
            </button>
            {onDelete && (
              <button type="button" aria-label={t('حذف {name}', { name: f.name })} onClick={() => onDelete(f)} className="w-8 h-9 inline-flex items-center justify-center text-slate-400 hover:text-rose-600">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/** الروابط: فيديو يوتيوب يُعرض داخل الصفحة عند الضغط، والباقي يفتح في تبويب جديد */
export const LinksBlock: React.FC<{ links: Homework['links'] }> = ({ links }) => {
  const [playing, setPlaying] = useState<string | null>(null);
  const list = links.map((l) => ({ ...l, url: safeUrl(l.url) })).filter((l) => l.url) as { title: string; url: string }[];
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {list.map((l) => {
          const yt = youtubeEmbed(l.url);
          return (
            <li key={l.url}>
              {yt ? (
                <button type="button" onClick={() => setPlaying(playing === yt ? null : yt)} className="h-9 px-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm font-semibold inline-flex items-center gap-2">
                  <PlayCircle className="w-4 h-4" />{l.title || t('مقطع فيديو')}
                </button>
              ) : (
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 text-sm font-semibold inline-flex items-center gap-2">
                  <Link2 className="w-4 h-4" />{l.title || new URL(l.url).hostname}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {playing && (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
          <iframe src={playing} title={t('مقطع فيديو')} className="w-full h-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      )}
    </div>
  );
};

/** اختيار ملفات ورفعها (مع رسائل الحجم والعدد) */
export const FilePicker: React.FC<{ onPick: (files: File[]) => void; busy?: boolean; label?: string }> = ({ onPick, busy, label }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) onPick(f); }} />
      <Button variant="secondary" size="sm" icon={Paperclip} disabled={busy} onClick={() => ref.current?.click()}>{busy ? t('جارٍ الرفع…') : label || t('إرفاق ملفات')}</Button>
    </>
  );
};

export const uploadErrorText = (e: string, name: string) =>
  e === 'too_big' ? t('«{name}» أكبر من {n} ميجابايت. للفيديو استخدم رابط يوتيوب أو درايف.', { name, n: maxFileMb() })
    : e === 'too_many' ? t('وصلت للحد الأقصى لعدد الملفات') : t('تعذر رفع «{name}»', { name });

/** تفاصيل الواجب للطالب (مع التسليم) أو لولي الأمر (عرض فقط) */
export const HomeworkDetailModal: React.FC<{
  hw: Homework; student: User; sub: HwSubmission | null; canSubmit: boolean;
  onClose: () => void; onSaved?: (s: HwSubmission) => void;
}> = ({ hw, student, sub, canSubmit, onClose, onSaved }) => {
  const { subjects, showToast } = useApp();
  const [hwFiles, setHwFiles] = useState<HwFile[]>([]);
  const [subFiles, setSubFiles] = useState<HwFile[]>([]);
  const [cur, setCur] = useState<HwSubmission | null>(sub);
  const [answer, setAnswer] = useState(sub?.answer || '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    void fetchFiles({ homeworkIds: [hw.id] }).then(setHwFiles);
    if (sub) void fetchFiles({ submissionIds: [sub.id] }).then(setSubFiles);
  }, [hw.id, sub]);
  const state = hwState(hw, cur);
  const editable = canSubmit && hw.allow_submission && cur?.score == null;
  const subject = subjects.find((s) => s.id === hw.subject_id)?.name;

  // التسليم يُنشأ أولاً (ولو بلا نص) ثم تُرفق الملفات به
  const ensureSub = async (): Promise<HwSubmission | null> => {
    if (cur) return cur;
    const r = await saveSubmission(hw.id, student.id, answer.trim());
    if (r.row) { setCur(r.row); onSaved?.(r.row); }
    return r.row;
  };
  const submit = async () => {
    if (!answer.trim() && !subFiles.length) return showToast(t('اكتب إجابتك أو أرفق ملفاً'), 'error');
    setBusy(true);
    const r = cur ? await saveSubmission(hw.id, student.id, answer.trim(), cur.id) : await saveSubmission(hw.id, student.id, answer.trim());
    setBusy(false);
    if (!r.row) return showToast(t('تعذر التسليم'), 'error');
    setCur(r.row); onSaved?.(r.row);
    showToast(cur ? t('تم تحديث تسليمك') : t('تم تسليم الواجب'), 'success');
  };
  const pick = async (files: File[]) => {
    setUploading(true);
    const s = await ensureSub();
    if (!s) { setUploading(false); return showToast(t('تعذر التسليم'), 'error'); }
    for (const f of files) {
      const r = await uploadFile({ submission_id: s.id }, f, student.id);
      if (r.row) setSubFiles((x) => [...x, r.row!]);
      else { showToast(uploadErrorText(r.error!, f.name), 'error'); if (r.error === 'too_many') break; }
    }
    setUploading(false);
  };
  const remove = async (f: HwFile) => { if (await deleteFile(f.id)) setSubFiles((x) => x.filter((y) => y.id !== f.id)); };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={hw.title} onClick={onClose}>
      <div className="w-full sm:max-w-2xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()} data-testid="homework-detail">
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <NotebookPen className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">{hw.title}</h2>
            <p className="text-sm text-slate-500">{[subject, hw.teacher_name, dueText(hw.due_at)].filter(Boolean).join(' · ')}</p>
          </div>
          <StateChip state={state} />
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {hw.body && <p className="text-[15px] leading-7 text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{hw.body}</p>}
          <LinksBlock links={hw.links} />
          {hwFiles.length > 0 && <div><h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">{t('المرفقات')}</h3><FileChips files={hwFiles} /></div>}

          {cur?.score != null && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4">
              <div className="font-bold text-emerald-900 dark:text-emerald-200">{t('الدرجة')}: <span className="tabular-nums" dir="ltr">{cur.score}{hw.max_score ? ` / ${hw.max_score}` : ''}</span></div>
              {cur.feedback && <p className="text-sm text-emerald-900 dark:text-emerald-200 mt-1 whitespace-pre-wrap">{cur.feedback}</p>}
            </div>
          )}

          {hw.allow_submission && (canSubmit || cur) && (
            <section className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{canSubmit ? t('إجابتي') : t('تسليم {name}', { name: student.name.split(' ')[0] })}</h3>
              {editable ? (
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} maxLength={10000} placeholder={t('اكتب إجابتك هنا، أو أرفق صورة الحل أو ملفاً')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[15px]" />
              ) : cur?.answer ? <p className="text-[15px] whitespace-pre-wrap text-slate-800 dark:text-slate-100 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">{cur.answer}</p> : null}
              <FileChips files={subFiles} onDelete={editable ? (f) => void remove(f) : undefined} />
              {cur && <p className="text-xs text-slate-500">{t('سُلّم {d}', { d: new Date(cur.submitted_at).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}</p>}
              {!cur && !canSubmit && <p className="text-sm text-slate-500">{t('لم يُسلَّم بعد')}</p>}
            </section>
          )}
        </div>
        {editable && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <FilePicker onPick={(f) => void pick(f)} busy={uploading} />
            <span className="text-xs text-slate-500">{t('PDF أو صور، حتى {n} ميجابايت للملف', { n: maxFileMb() })}</span>
            <Button className="ms-auto" icon={Send} disabled={busy || uploading} onClick={() => void submit()}>{busy ? t('جارٍ الحفظ…') : cur ? t('تحديث التسليم') : t('تسليم')}</Button>
          </div>
        )}
      </div>
    </div>
  );
};

/** واجبات طالب وتسليماته (للطالب نفسه أو لولي الأمر) */
export function useStudentHomework(student: User | null | undefined) {
  const [rows, setRows] = useState<Homework[]>([]);
  const [subs, setSubs] = useState<Record<string, HwSubmission>>({});
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!student?.class_id) { setRows([]); setLoaded(true); return; }
    const r = await fetchHomework([student.class_id]);
    const s = await fetchSubmissions(r.rows.map((h) => h.id), [student.id]);
    setRows(r.rows); setSubs(Object.fromEntries(s.map((x) => [x.homework_id, x]))); setLoaded(true);
  }, [student?.id, student?.class_id]);
  useEffect(() => { void load(); }, [load]);
  const setSub = (s: HwSubmission) => setSubs((x) => ({ ...x, [s.homework_id]: s }));
  return { rows, subs, loaded, reload: load, setSub };
}

/** بطاقة مختصرة: الواجبات الحالية (لوحة الطالب وولي الأمر) */
export const HomeworkCard: React.FC<{ student: User; canSubmit?: boolean; className?: string }> = ({ student, canSubmit = false, className = '' }) => {
  const { setCurrentView } = useApp();
  const { rows, subs, setSub } = useStudentHomework(student);
  const [open, setOpen] = useState<Homework | null>(null);
  const now = Date.now();
  // المطلوب أولاً ثم آخر أسبوعين
  const list = useMemo(() => rows
    .filter((h) => { const st = hwState(h, subs[h.id], now); return st === 'pending' || st === 'overdue' || now - new Date(h.created_at).getTime() < 14 * 864e5; })
    .sort((a, b) => { const p = (h: Homework) => (['pending', 'overdue'].includes(hwState(h, subs[h.id], now)) ? 0 : 1); return p(a) - p(b) || b.created_at.localeCompare(a.created_at); })
    .slice(0, 5), [rows, subs, now]);
  if (!list.length) return null;
  const pending = rows.filter((h) => hwState(h, subs[h.id], now) === 'pending').length;
  return (
    <section className={`rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 ${className}`} data-testid="homework-card">
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <NotebookPen className="w-5 h-5 text-indigo-600" />
        <h2 className="font-cairo font-extrabold text-slate-900 dark:text-white">{t('الواجبات')}</h2>
        {pending > 0 && <Chip tone="warn">{t('{n} مطلوب', { n: pending })}</Chip>}
        {canSubmit && (
          <a href={pathFor({ view: 'homework' })} onClick={(e) => { e.preventDefault(); setCurrentView('homework'); }} className="ms-auto text-sm font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1">
            {t('الكل')}<ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          </a>
        )}
      </div>
      <ul>
        {list.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => setOpen(h)} className="w-full flex items-center gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] text-slate-900 dark:text-white truncate">{h.title}</div>
                <div className="text-[13px] text-slate-500 truncate">{dueText(h.due_at)}</div>
              </div>
              <StateChip state={hwState(h, subs[h.id], now)} />
            </button>
          </li>
        ))}
      </ul>
      {open && <HomeworkDetailModal hw={open} student={student} sub={subs[open.id] || null} canSubmit={canSubmit} onClose={() => setOpen(null)} onSaved={setSub} />}
    </section>
  );
};
