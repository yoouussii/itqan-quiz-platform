import React, { useMemo, useRef, useState } from 'react';
import { Trophy, Award, FileText, Download, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { Avatar } from '../common/Avatar';
import { hasPerm } from '../../utils/permissions';
import {
  BADGES, Period, computePointEvents, earnedBadges, inPeriod, levelFor, totalPoints,
} from '../../utils/points';
import { exportElementToPdf } from '../../utils/exportPdf';
import { exportStudentReport } from '../../utils/studentReport';
import { formatFullArabicDate } from '../../utils/dateUtils';
import { User } from '../../types';

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'week', label: 'آخر 7 أيام' },
  { id: 'month', label: 'آخر 30 يوماً' },
  { id: 'all', label: 'كل الوقت' },
];
const PRESET_TITLES = ['طالب الأسبوع', 'طالب الشهر', 'المتفوق', 'الأكثر تطوراً', 'الأكثر التزاماً', 'المشاركة المميزة'];
const MEDALS = ['🥇', '🥈', '🥉'];

const AwardModal: React.FC<{ student: User; onClose: () => void }> = ({ student, onClose }) => {
  const { giveAward } = useApp();
  const [title, setTitle] = useState(PRESET_TITLES[0]);
  const [points, setPoints] = useState(20);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return alert('اكتب عنوان الجائزة');
    setBusy(true);
    const res = await giveAward({ student, title: title.trim(), note: note.trim(), points: Math.max(0, Math.min(500, Number(points) || 0)) });
    setBusy(false);
    if (res.ok) onClose();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div role="dialog" aria-label="منح جائزة" onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-black text-base text-slate-900 dark:text-white">🏆 منح جائزة: {student.name}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">عنوان الجائزة</label>
          <input aria-label="عنوان الجائزة" list="award-titles" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
          <datalist id="award-titles">{PRESET_TITLES.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نقاط إضافية (0 – 500)</label>
          <input aria-label="نقاط الجائزة" type="number" min={0} max={500} value={points} onChange={(e) => setPoints(Number(e.target.value))}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ملاحظة (اختياري)</label>
          <textarea aria-label="ملاحظة الجائزة" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">إلغاء</button>
          <button onClick={save} disabled={busy} className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md disabled:opacity-60">منح الجائزة</button>
        </div>
      </div>
    </div>
  );
};

export const Leaderboard: React.FC = () => {
  const { currentUser, quizzes, submissions, users, classes, subjects, awards } = useApp();
  const [period, setPeriod] = useState<Period>('month');
  const [classId, setClassId] = useState('all');
  const [q, setQ] = useState('');
  const [awardFor, setAwardFor] = useState<User | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const canAward = hasPerm(currentUser, 'can_award_badges');
  const canExport = hasPerm(currentUser, 'can_export_reports');

  const staff = useMemo(
    () => (currentUser ? StorageService.getStaffData(currentUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, quizzes, submissions, users]
  );

  const rows = useMemo(() => {
    if (!staff) return [];
    return staff.students
      .filter((s) => classId === 'all' || (s.class_id || s.assigned_class_ids?.[0]) === classId)
      .filter((s) => !q.trim() || s.name.includes(q.trim()) || s.national_id.includes(q.trim()))
      .map((s) => {
        const subs = staff.submissions.filter((x) => x.student_id === s.id);
        const ev = computePointEvents(subs, staff.quizzes, awards.filter((a) => a.student_id === s.id));
        const evP = ev.filter((e) => inPeriod(e.date, period));
        const quizEv = evP.filter((e) => e.kind === 'quiz');
        const subsP = subs.filter((x) => inPeriod(x.completed_at, period));
        return {
          s,
          pts: totalPoints(evP),
          quizzes: quizEv.length,
          avg: subsP.length ? Math.round(subsP.reduce((a, x) => a + (Number(x.percentage) || 0), 0) / subsP.length) : null,
          badges: earnedBadges(subs, staff.quizzes).length,
          allTime: totalPoints(ev),
        };
      })
      .sort((a, b) => b.pts - a.pts || (b.avg ?? -1) - (a.avg ?? -1));
  }, [staff, awards, period, classId, q]);

  if (!currentUser || !staff) return null;
  const classOpts = classes.filter((c) => staff.students.some((s) => (s.class_id || s.assigned_class_ids?.[0]) === c.id));
  const clsName = (s: User) => classes.find((c) => c.id === (s.class_id || s.assigned_class_ids?.[0]))?.name || 'بدون صف';
  const periodLabel = PERIODS.find((p) => p.id === period)?.label || '';

  const report = async (s: User) => {
    const subs = staff.submissions.filter((x) => x.student_id === s.id);
    await exportStudentReport({
      name: s.name, nationalId: s.national_id, className: clsName(s),
      results: subs.map((x) => {
        const quiz = staff.quizzes.find((z) => z.id === x.quiz_id);
        return { quiz: quiz?.title || '—', subject: subjects.find((j) => j.id === quiz?.subject_id)?.name || '—', score: `${x.score}/${x.total_possible_score}`, pct: Number(x.percentage) || 0, date: formatFullArabicDate(x.completed_at) };
      }),
      points: totalPoints(computePointEvents(subs, staff.quizzes, awards.filter((a) => a.student_id === s.id))),
      badgeKeys: earnedBadges(subs, staff.quizzes),
      awards: awards.filter((a) => a.student_id === s.id),
    });
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo flex items-center gap-2"><Trophy className="w-6 h-6 text-amber-500" /> لوحة المتصدرين</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">ترتيب الطلاب حسب نقاط الفترة المختارة (من أفضل نتيجة لكل اختبار + نقاط الجوائز).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="الفترة" value={period} onChange={(e) => setPeriod(e.target.value as Period)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select aria-label="الصف" value={classId} onChange={(e) => setClassId(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100 max-w-[14rem]">
            <option value="all">كل الصفوف</option>
            {classOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input aria-label="بحث" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم..."
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
          {canExport && (
            <button onClick={() => tableRef.current && exportElementToPdf({ element: tableRef.current, title: 'لوحة المتصدرين', subtitle: periodLabel })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200">
              <Download className="w-4 h-4 text-rose-600" /> تصدير PDF
            </button>
          )}
        </div>
      </div>

      <div ref={tableRef} className="space-y-6">
        {rows.slice(0, 3).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {rows.slice(0, 3).map((r, i) => (
              <div key={r.s.id} className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900 rounded-3xl border border-amber-200 dark:border-amber-900 p-5 text-center">
                <div className="text-3xl">{MEDALS[i]}</div>
                <div className="flex justify-center my-2"><Avatar name={r.s.name} role="student" userId={r.s.id} size="lg" /></div>
                <p className="font-black text-slate-900 dark:text-white text-sm">{r.s.name}</p>
                <p className="text-[11px] text-slate-500">{clsName(r.s)}</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{r.pts} <span className="text-xs font-bold">نقطة</span></p>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-3 px-3">#</th><th className="py-3 px-3">الطالب</th><th className="py-3 px-3">الصف</th>
                <th className="py-3 px-3">نقاط الفترة</th><th className="py-3 px-3">اختبارات</th><th className="py-3 px-3">المتوسط</th>
                <th className="py-3 px-3">المستوى</th><th className="py-3 px-3">أوسمة</th>
                <th className="py-3 px-3 text-center" data-pdf-hide>إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 && (<tr><td colSpan={9} className="py-10 text-center text-slate-400">لا توجد بيانات ضمن هذه الفلاتر</td></tr>)}
              {rows.map((r, i) => (
                <tr key={r.s.id} data-student={r.s.id}>
                  <td className="py-2.5 px-3 font-bold text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-3">
                    <span className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><Avatar name={r.s.name} role="student" userId={r.s.id} size="xs" />{r.s.name}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{clsName(r.s)}</td>
                  <td className="py-2.5 px-3 font-black text-amber-600">{r.pts}</td>
                  <td className="py-2.5 px-3">{r.quizzes}</td>
                  <td className="py-2.5 px-3">{r.avg === null ? '—' : `${r.avg}%`}</td>
                  <td className="py-2.5 px-3">{levelFor(r.allTime).level.emoji} {levelFor(r.allTime).level.name}</td>
                  <td className="py-2.5 px-3">{r.badges}/{BADGES.length}</td>
                  <td className="py-2.5 px-3 text-center" data-pdf-hide>
                    <div className="flex items-center justify-center gap-1.5">
                      {canAward && (
                        <button onClick={() => setAwardFor(r.s)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100">
                          <Award className="w-3.5 h-3.5" /> منح جائزة
                        </button>
                      )}
                      {canExport && (
                        <button onClick={() => report(r.s)} title="كشف درجات الطالب PDF" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200">
                          <FileText className="w-3.5 h-3.5" /> كشف
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {awardFor && <AwardModal student={awardFor} onClose={() => setAwardFor(null)} />}
    </div>
  );
};
