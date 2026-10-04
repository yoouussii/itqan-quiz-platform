import React, { useState } from 'react';
import { X, LifeBuoy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from './ui';
import { SUGGESTED_ACTIONS, createPlans } from '../../services/remedialService';
import { uiDir, t } from '../../i18n';

const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** فتح خطة علاجية لطالب أو أكثر في مهارة */
export const RemedialPlanModal: React.FC<{
  outcome: string; subjectId: string | null; subjectName: string;
  students: { id: string; name: string; p: number }[];
  onClose: () => void; onCreated?: (n: number) => void;
}> = ({ outcome, subjectId, subjectName, students, onClose, onCreated }) => {
  const { currentUser, showToast } = useApp();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [target, setTarget] = useState(80);
  const [due, setDue] = useState(plusDays(14));
  const [actions, setActions] = useState<Set<string>>(() => new Set(SUGGESTED_ACTIONS.slice(0, 2)));
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); setter(n); };
  const save = async () => {
    const list = students.filter((s) => picked.has(s.id));
    if (!list.length) return showToast(t('اختر طالباً واحداً على الأقل'), 'error');
    const text = [...SUGGESTED_ACTIONS.filter((a) => actions.has(a)), ...extra.split('\n').map((x) => x.trim()).filter(Boolean)].map((a) => `• ${a}`).join('\n');
    setBusy(true);
    const r = await createPlans(list.map((s) => ({
      student_id: s.id, subject_id: subjectId, outcome, teacher_id: currentUser!.id, teacher_name: currentUser!.name,
      start_pct: Math.max(0, Math.min(100, Math.round(s.p))), target_pct: target, actions: text, due_date: due || null,
    })));
    setBusy(false);
    if (!r.ok) return showToast(t('تعذر الحفظ'), 'error');
    showToast(t('فُتحت {n} خطة علاجية وأُشعر أولياء الأمور', { n: r.rows.length }), 'success');
    onCreated?.(r.rows.length);
    onClose();
  };
  const inp = 'h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('خطة علاجية')} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <LifeBuoy className="w-6 h-6 text-indigo-600 shrink-0" />
          <div className="flex-1"><h2 className="font-bold text-lg text-slate-900 dark:text-white">{t('خطة علاجية')}</h2><p className="text-sm text-slate-500">{outcome} · {subjectName}</p></div>
          <button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('الطلاب')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {students.map((s) => (
                <label key={s.id} className={`h-9 px-3 rounded-xl border text-sm inline-flex items-center gap-2 cursor-pointer ${picked.has(s.id) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-300 dark:border-slate-700'}`}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(picked, s.id, setPicked)} />{s.name} <span className="text-xs text-rose-600 tabular-nums">{Math.round(s.p)}%</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الهدف (نسبة الإتقان)')}
              <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className={inp}>{[60, 70, 80, 90].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('موعد المتابعة')}
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inp} />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('الإجراءات العلاجية')}</legend>
            <div className="space-y-1.5">
              {SUGGESTED_ACTIONS.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={actions.has(a)} onChange={() => toggle(actions, a, setActions)} />{t(a)}
                </label>
              ))}
            </div>
            <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} placeholder={t('إجراءات أخرى (سطر لكل إجراء)')} className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </fieldset>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <span className="text-sm text-slate-500">{t('يصل إشعار للطالب وولي أمره')}</span>
          <Button className="ms-auto" icon={LifeBuoy} disabled={busy} onClick={() => void save()}>{busy ? t('جارٍ الحفظ…') : t('فتح الخطة ({n})', { n: picked.size })}</Button>
        </div>
      </div>
    </div>
  );
};
