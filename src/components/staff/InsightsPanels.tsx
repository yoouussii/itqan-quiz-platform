import React, { useState } from 'react';
import { Users, UserCog, ClipboardList, Award, Activity, AlertTriangle, Trophy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { KPICard } from '../common/KPICard';
import { KpiDetailModal } from '../common/KpiDetailModal';
import { Avatar } from '../common/Avatar';
import {
  KpiSection, studentsSection, quizzesSection, perQuizSection, perSubjectSection,
  activeStudentsSection, inactiveStudentsSection,
} from '../../utils/kpiSections';
import { Submission, User, QuizWithDetails } from '../../types';
import { t } from '../../i18n';

type ModalKind = 'students' | 'teachers' | 'quizzes' | 'avg' | 'participation' | 'risk' | null;
const avg = (n: number[]) => (n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : 0);

interface Props {
  /** full = 6 بطاقات (لوحة المشرف)، extra = بطاقتا المشاركة والمتابعة فقط (تُضاف للوحات تحتوي مؤشراتها الخاصة) */
  mode: 'full' | 'extra';
  students: User[];
  teachers: User[];
  quizzes: QuizWithDetails[];
  submissions: Submission[];
  showTeacherPerformance: boolean;
}

/** مؤشرات متقدمة مشتركة: مدير النظام (كل البيانات) والمشرف (نطاقه) وأي معلم يُمنح الصلاحية (نطاقه) */
export const InsightsPanels: React.FC<Props> = ({ mode, students, teachers, quizzes, submissions, showTeacherPerformance }) => {
  const { classes, subjects, users } = useApp();
  const [modal, setModal] = useState<ModalKind>(null);
  const subs = submissions;

  const passOf = (s: { quiz_id: string; percentage: number }) =>
    (Number(s.percentage) || 0) >= (quizzes.find((q) => q.id === s.quiz_id)?.pass_percentage || 50);
  const classOf = (s: User) => s.class_id || s.assigned_class_ids?.[0];

  const avgAll = avg(subs.map((s) => Number(s.percentage) || 0));
  const passRate = subs.length ? Math.round((subs.filter(passOf).length / subs.length) * 100) : 0;
  const participants = new Set(subs.map((s) => s.student_id));
  const participation = students.length ? Math.round((students.filter((s) => participants.has(s.id)).length / students.length) * 100) : 0;

  const studentAvg = (id: string) => {
    const mine = subs.filter((s) => s.student_id === id);
    return mine.length ? avg(mine.map((s) => Number(s.percentage) || 0)) : null;
  };
  const atRisk = students.filter((s) => {
    const a = studentAvg(s.id);
    return a === null || a < 50;
  });
  const topStudents = students
    .map((s) => ({ s, a: studentAvg(s.id) }))
    .filter((x) => x.a !== null)
    .sort((x, y) => (y.a as number) - (x.a as number))
    .slice(0, 5);

  const classRows = classes
    .filter((c) => students.some((s) => classOf(s) === c.id))
    .map((c) => {
      const cs = students.filter((s) => classOf(s) === c.id);
      const ids = new Set(cs.map((s) => s.id));
      const csubs = subs.filter((s) => ids.has(s.student_id));
      return {
        name: c.name,
        students: cs.length,
        part: cs.length ? Math.round((cs.filter((s) => csubs.some((x) => x.student_id === s.id)).length / cs.length) * 100) : 0,
        avg: csubs.length ? avg(csubs.map((s) => Number(s.percentage) || 0)) : null,
        pass: csubs.length ? Math.round((csubs.filter(passOf).length / csubs.length) * 100) : null,
      };
    });

  const teacherRows = teachers.map((t) => {
    const tq = quizzes.filter((q) => q.teacher_id === t.id);
    const ids = new Set(tq.map((q) => q.id));
    const ts = subs.filter((s) => ids.has(s.quiz_id));
    const last = ts.map((s) => new Date(s.completed_at).getTime()).sort((a, b) => b - a)[0];
    return {
      name: t.name,
      quizzes: tq.length,
      subs: ts.length,
      avg: ts.length ? avg(ts.map((s) => Number(s.percentage) || 0)) : null,
      pass: ts.length ? Math.round((ts.filter(passOf).length / ts.length) * 100) : null,
      last: last ? new Date(last).toLocaleDateString('ar-EG-u-ca-gregory-nu-latn') : '—',
    };
  });

  const content = (): { title: string; subtitle?: string; sections: KpiSection[] } | null => {
    switch (modal) {
      case 'students':
        return { title: t('الطلاب ضمن نطاقك'), sections: [studentsSection(t('قائمة الطلاب'), students, subs, classes)] };
      case 'teachers':
        return {
          title: t('المعلمون ضمن نطاقك'),
          sections: [{
            title: t('قائمة المعلمين'),
            headers: showTeacherPerformance ? [t('المعلم'), t('الاختبارات'), t('التسليمات'), t('المتوسط'), t('نسبة النجاح')] : [t('المعلم'), t('الاختبارات')],
            rows: teacherRows.map((r) => showTeacherPerformance
              ? [r.name, r.quizzes, r.subs, r.avg === null ? '—' : `${r.avg}%`, r.pass === null ? '—' : `${r.pass}%`]
              : [r.name, r.quizzes]),
            emptyText: t('لا يوجد معلمون ضمن نطاقك'),
          }],
        };
      case 'quizzes':
        return { title: t('الاختبارات ضمن نطاقك'), sections: [quizzesSection(t('قائمة الاختبارات'), quizzes, subs, subjects, users, classes)] };
      case 'avg':
        return {
          title: t('متوسط الأداء ونسبة النجاح'),
          subtitle: t('المتوسط {avg}% • نسبة النجاح {pass}%', { avg: avgAll, pass: passRate }),
          sections: [perQuizSection(t('حسب الاختبار'), quizzes, subs), perSubjectSection(t('حسب المادة'), quizzes, subs, subjects)],
        };
      case 'participation':
        return {
          title: t('مشاركة الطلاب'),
          subtitle: t('{p}% من الطلاب أدّوا اختباراً واحداً على الأقل', { p: participation }),
          sections: [
            inactiveStudentsSection(t('لم يؤدوا أي اختبار خلال آخر 7 أيام'), students, subs, classes),
            activeStudentsSection(t('نشطون خلال آخر 7 أيام'), students, subs, classes),
          ],
        };
      case 'risk':
        return {
          title: t('طلاب يحتاجون متابعة'),
          subtitle: t('متوسطهم أقل من 50% أو لم يؤدوا أي اختبار بعد'),
          sections: [{
            title: t('القائمة'),
            headers: [t('الطالب'), t('الصف'), t('المتوسط'), t('اختبارات مؤداة')],
            rows: atRisk.map((s) => {
              const a = studentAvg(s.id);
              return [s.name, classes.find((c) => c.id === classOf(s))?.name || t('بدون صف'), a === null ? t('لم يؤدِّ') : `${a}%`, subs.filter((x) => x.student_id === s.id).length];
            }),
            emptyText: t('لا يوجد طلاب بحاجة لمتابعة'),
          }],
        };
      default:
        return null;
    }
  };
  const mc = content();

  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${mode === 'full' ? 'lg:grid-cols-3' : ''} gap-4`}>
        {mode === 'full' && (
          <>
            <KPICard title={t('الطلاب ضمن نطاقك')} value={students.length} subtitle={t('اضغط لعرض القائمة')} icon={Users} colorScheme="indigo" onClick={() => setModal('students')} />
            <KPICard title={t('المعلمون ضمن نطاقك')} value={teachers.length} subtitle={t('المعلمون المرتبطون بنطاقك')} icon={UserCog} colorScheme="cyan" onClick={() => setModal('teachers')} />
            <KPICard title={t('الاختبارات ضمن نطاقك')} value={quizzes.length} subtitle={t('بمختلف المواد')} icon={ClipboardList} colorScheme="purple" onClick={() => setModal('quizzes')} />
            <KPICard
              title={t('متوسط الأداء')}
              value={`${avgAll}%`}
              subtitle={t('نسبة النجاح {pass}% • {n} تسليم', { pass: passRate, n: subs.length })}
              icon={Award}
              colorScheme="emerald"
              trend={{ value: t('{pass}% نجاح', { pass: passRate }), isPositive: avgAll >= 60 }}
              onClick={() => setModal('avg')}
            />
          </>
        )}
        <KPICard title={t('نسبة المشاركة')} value={`${participation}%`} subtitle={t('طلاب أدّوا اختباراً على الأقل')} icon={Activity} colorScheme="amber" onClick={() => setModal('participation')} />
        <KPICard title={t('يحتاجون متابعة')} value={atRisk.length} subtitle={t('متوسط أقل من 50% أو بلا محاولات')} icon={AlertTriangle} colorScheme="rose" onClick={() => setModal('risk')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">{t('أداء الصفوف')}</h2>
          {classRows.length === 0 ? (
            <p className="text-xs text-slate-400">{t('لا توجد بيانات صفوف')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 px-2">{t('الصف')}</th><th className="py-2 px-2">{t('الطلاب')}</th><th className="py-2 px-2">{t('المشاركة')}</th><th className="py-2 px-2">{t('المتوسط')}</th><th className="py-2 px-2">{t('النجاح')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {classRows.map((r) => (
                    <tr key={r.name}>
                      <td className="py-2 px-2 font-bold text-slate-900 dark:text-white">{r.name}</td>
                      <td className="py-2 px-2">{r.students}</td>
                      <td className="py-2 px-2">{r.part}%</td>
                      <td className="py-2 px-2">{r.avg === null ? '—' : `${r.avg}%`}</td>
                      <td className="py-2 px-2">{r.pass === null ? '—' : `${r.pass}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />{' '}{t('الأوائل')}
          </h2>
          {topStudents.length === 0 ? (
            <p className="text-xs text-slate-400">{t('لا توجد نتائج بعد')}</p>
          ) : (
            <ol className="space-y-2">
              {topStudents.map((x, i) => (
                <li key={x.s.id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <span className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                    <span className="w-5 text-slate-400">{i + 1}</span>
                    <Avatar name={x.s.name} role="student" userId={x.s.id} size="xs" />
                    {x.s.name}
                  </span>
                  <span className="font-black text-emerald-600">{x.a}%</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {showTeacherPerformance && (
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">{t('أداء المعلمين')}</h2>
          {teacherRows.length === 0 ? (
            <p className="text-xs text-slate-400">{t('لا يوجد معلمون ضمن نطاقك')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 px-2">{t('المعلم')}</th><th className="py-2 px-2">{t('اختباراته')}</th><th className="py-2 px-2">{t('التسليمات')}</th><th className="py-2 px-2">{t('المتوسط')}</th><th className="py-2 px-2">{t('النجاح')}</th><th className="py-2 px-2">{t('آخر نشاط')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {teacherRows.map((r) => (
                    <tr key={r.name}>
                      <td className="py-2 px-2 font-bold text-slate-900 dark:text-white">{r.name}</td>
                      <td className="py-2 px-2">{r.quizzes}</td>
                      <td className="py-2 px-2">{r.subs}</td>
                      <td className="py-2 px-2">{r.avg === null ? '—' : `${r.avg}%`}</td>
                      <td className="py-2 px-2">{r.pass === null ? '—' : `${r.pass}%`}</td>
                      <td className="py-2 px-2">{r.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mc && <KpiDetailModal title={mc.title} subtitle={mc.subtitle} sections={mc.sections} onClose={() => setModal(null)} />}
    </>
  );
};
