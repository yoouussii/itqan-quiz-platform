import React, { useMemo, useState } from 'react';
import { CalendarRange, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Chip } from '../common/ui';
import { applyTimetable, LivePeriod, periodEnd, TimetableRow } from '../../services/liveService';
import { matchClass, matchSubject, matchTeacher, parseTimetableWorkbook, TtParsed } from '../../utils/timetableImport';
import { t, uiDir } from '../../i18n';
import type { User } from '../../types';

/**
 * استيراد جدول الحصص الأونلاين من ملف Excel (089): المدير يرفع جدول الفصول، ويراجع مطابقة
 * الفصول والمعلمين والمواد، فتُنشأ حصص كل معلم في مواعيد الحصص الثابتة للفترة المحددة.
 */
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MAP_KEY = 'itqan_timetable_map_v1';
type Maps = { classes: Record<string, string>; teachers: Record<string, string>; subjects: Record<string, string> };
const loadMaps = (): Maps => { try { return { classes: {}, teachers: {}, subjects: {}, ...JSON.parse(localStorage.getItem(MAP_KEY) || '{}') }; } catch { return { classes: {}, teachers: {}, subjects: {} }; } };

const TimetableImport: React.FC<{ periods: LivePeriod[]; onClose: () => void; onDone: (n: number) => void }> = ({ periods, onClose, onDone }) => {
  const { users, classes, subjects, showToast } = useApp() as any;
  const teachers = useMemo(() => (users as User[]).filter((u) => u.role === 'teacher' || u.role === 'admin' || u.role === 'supervisor')
    .sort((a, b) => a.name.localeCompare(b.name, 'ar')), [users]);
  const [parsed, setParsed] = useState<TtParsed | null>(null);
  const [maps, setMaps] = useState<Maps>({ classes: {}, teachers: {}, subjects: {} });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState('');
  const [from, setFrom] = useState(() => { const d = new Date(); return dayKey(d); });
  const [to, setTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 27); return dayKey(d); });
  const [replace, setReplace] = useState(true);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setBusy(true);
    try {
      const p = await parseTimetableWorkbook(f);
      if (!p.cells.length) { setErr(t('لم يُعثر على جدول في الملف. يلزم عمود «الفصل» و«اليوم» وأعمدة «الحصة الأولى…».')); setParsed(null); return; }
      const saved = loadMaps();
      const m: Maps = { classes: {}, teachers: {}, subjects: {} };
      p.classes.forEach((c) => { m.classes[c.code] = saved.classes[c.code] || matchClass(c, classes); });
      [...new Set(p.cells.map((c) => c.teacher).filter(Boolean))].forEach((n) => { m.teachers[n] = saved.teachers[n] || matchTeacher(n, teachers); });
      [...new Set(p.cells.map((c) => c.subject))].forEach((n) => { m.subjects[n] = saved.subjects[n] || matchSubject(n, subjects); });
      setMaps(m); setParsed(p); setView(p.classes[0]?.code || '');
    } catch {
      setErr(t('تعذّرت قراءة الملف. تأكد أنه ملف Excel.'));
    } finally { setBusy(false); }
  };

  const setMap = (kind: keyof Maps, key: string, val: string) => setMaps((m) => ({ ...m, [kind]: { ...m[kind], [key]: val } }));
  const missing = parsed ? {
    classes: parsed.classes.filter((c) => !maps.classes[c.code]).length,
    teachers: Object.keys(maps.teachers).filter((k) => !maps.teachers[k]).length,
  } : { classes: 0, teachers: 0 };
  const rows: TimetableRow[] = parsed ? parsed.cells
    .filter((c) => maps.classes[c.code])
    .map((c) => ({ class_id: maps.classes[c.code], dow: c.dow, period: c.period, teacher_id: maps.teachers[c.teacher] || null, subject_id: maps.subjects[c.subject] || null, title: c.subject })) : [];
  const usable = rows.filter((r) => r.teacher_id).length;
  const fewPeriods = !!parsed && parsed.periods > periods.length;

  const apply = async () => {
    if (!parsed || !usable) return;
    setBusy(true); setErr('');
    const r = await applyTimetable(rows, periods, from, to, replace);
    setBusy(false);
    if (!r.ok || !r.data) { setErr(String(r.error || '').includes('bad_range') ? t('الفترة غير صحيحة (الحد 200 يوم).') : t('تعذر الحفظ')); return; }
    try { localStorage.setItem(MAP_KEY, JSON.stringify(maps)); } catch { /* ignore */ }
    showToast(t('تم إنشاء {n} حصة من الجدول', { n: r.data.created }));
    onDone(r.data.created);
  };

  const nameOf = (list: any[], id: string) => list.find((x) => x.id === id)?.name || '';
  const sel = (kind: keyof Maps, key: string, list: Array<{ id: string; name: string }>, label: string) => (
    <div key={key} className={`flex items-center gap-2 py-1.5 ${!maps[kind][key] && kind !== 'subjects' ? 'text-amber-700 dark:text-amber-300' : ''}`}>
      <span className="flex-1 min-w-0 text-sm font-semibold truncate">{label}</span>
      <select value={maps[kind][key] || ''} onChange={(e) => setMap(kind, key, e.target.value)} className={`${inp} w-48 sm:w-60`} aria-label={label}>
        <option value="">{kind === 'subjects' ? t('بدون مادة') : t('— اختر —')}</option>
        {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </div>
  );
  const viewCells = parsed ? parsed.cells.filter((c) => c.code === view) : [];
  const days = parsed ? [...new Set(parsed.cells.map((c) => c.dow))].sort() : [];

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir={uiDir()} role="dialog" aria-modal="true" aria-label={t('استيراد جدول الحصص')}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 space-y-4" data-testid="tt-import">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('استيراد جدول الحصص')}</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center" aria-label={t('إغلاق')}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('ارفع ملف Excel فيه جدول الفصول (الفصل، اليوم، الحصة الأولى… وفي كل خانة المادة ثم اسم المعلم في سطر ثانٍ). تُنشأ حصص كل معلم تلقائياً في مواعيد الحصص الثابتة، والمعلم يكتب عنوان الدرس فقط.')}
        </p>
        <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-4 cursor-pointer hover:border-indigo-400">
          {busy && !parsed ? <Loader2 className="w-6 h-6 animate-spin text-indigo-600" /> : <FileSpreadsheet className="w-6 h-6 text-emerald-600" />}
          <span className="flex-1 text-sm font-bold text-slate-700 dark:text-slate-200">{parsed ? t('اختر ملفاً آخر') : t('اختر ملف الجدول (Excel)')}</span>
          <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="tt-file" />
        </label>
        {!periods.length && <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{t('اضبط مواعيد الحصص الثابتة أولاً من «إعدادات الخادم».')}</p>}

        {parsed && (
          <>
            <div className="flex flex-wrap gap-2">
              <Chip tone="info">{t('{n} فصل', { n: parsed.classes.length })}</Chip>
              <Chip tone="info">{t('{n} معلم', { n: Object.keys(maps.teachers).length })}</Chip>
              <Chip tone="info">{t('{n} حصة أسبوعياً', { n: parsed.cells.length })}</Chip>
              {(missing.classes > 0 || missing.teachers > 0) && <Chip tone="warn">{t('يلزم اختيار {n}', { n: missing.classes + missing.teachers })}</Chip>}
            </div>
            {fewPeriods && <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{t('في الجدول {a} حصص يومياً ومواعيد الحصص المضبوطة {b} فقط. أضف بقية المواعيد من «إعدادات الخادم».', { a: parsed.periods, b: periods.length })}</p>}

            <details open={missing.classes > 0} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
              <summary className="font-bold cursor-pointer">{t('الفصول')}</summary>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {parsed.classes.map((c) => sel('classes', c.code, classes, `${c.label}${c.label !== c.code ? ` (${c.code})` : ''}`))}
              </div>
            </details>
            <details open={missing.teachers > 0} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
              <summary className="font-bold cursor-pointer">{t('المعلمون')}</summary>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {Object.keys(maps.teachers).sort((a, b) => a.localeCompare(b, 'ar')).map((n) => sel('teachers', n, teachers, n))}
              </div>
            </details>
            <details className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
              <summary className="font-bold cursor-pointer">{t('المواد')}</summary>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {Object.keys(maps.subjects).sort((a, b) => a.localeCompare(b, 'ar')).map((n) => sel('subjects', n, subjects, n))}
              </div>
            </details>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-bold">{t('معاينة جدول فصل')}</span>
                <select value={view} onChange={(e) => setView(e.target.value)} className={`${inp} flex-1`} aria-label={t('معاينة جدول فصل')}>
                  {parsed.classes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60">
                      <th className="p-2 text-start">{t('اليوم')}</th>
                      {Array.from({ length: parsed.periods }, (_, i) => (
                        <th key={i} className="p-2 text-start font-semibold">
                          {t('الحصة {n}', { n: i + 1 })}
                          {periods[i] && <span className="block font-normal text-slate-500" dir="ltr">{periods[i].start}–{periodEnd(periods[i])}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-2 font-bold">{t(DAY_NAMES[d])}</td>
                        {Array.from({ length: parsed.periods }, (_, i) => {
                          const c = viewCells.find((x) => x.dow === d && x.period === i + 1);
                          const tid = c ? maps.teachers[c.teacher] : '';
                          return (
                            <td key={i} className="p-2 align-top">
                              {c && <>
                                <span className="block font-semibold text-slate-800 dark:text-slate-100">{c.subject}</span>
                                <span className={`block ${tid ? 'text-slate-500' : 'text-amber-700 dark:text-amber-300'}`}>{tid ? nameOf(teachers, tid) : c.teacher || '—'}</span>
                              </>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm font-bold">{t('من تاريخ')}</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} w-full`} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-bold">{t('حتى تاريخ')}</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inp} w-full`} />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-1" />
              <span>{t('استبدال حصص الجدول السابقة من هذا التاريخ (التي لم يحضرها أحد). الحصص التي أضافها المعلمون بأنفسهم لا تتأثر.')}</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('كل حصة تستخدم اجتماع Zoom الثابت لمعلمها (من «حسابي في Zoom»)، ومن لم يضفه بعد تُحدَّث حصصه تلقائياً عند إضافته. العنوان المبدئي اسم المادة، والمعلم يعدّله بعنوان الدرس.')}
            </p>
          </>
        )}

        {err && <p className="text-sm font-bold text-rose-600" role="alert">{err}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button>
          <Button icon={CalendarRange} onClick={() => void apply()} disabled={!parsed || !usable || busy || !periods.length || !from || !to} data-testid="tt-apply">
            {busy && parsed ? t('جارٍ الإنشاء…') : t('إنشاء الحصص ({n} أسبوعياً)', { n: usable })}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TimetableImport;
