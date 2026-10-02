import React, { useMemo, useState } from 'react';
import {
  Users, UserCog, ClipboardList, Award, Activity, AlertTriangle, Trophy, ShieldAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { KPICard } from '../common/KPICard';
import { KpiDetailModal } from '../common/KpiDetailModal';
import { AnalyticsCharts } from '../analytics/AnalyticsCharts';
import { SubmissionsTable } from '../analytics/SubmissionsTable';
import { Avatar } from '../common/Avatar';
import {
  KpiSection, studentsSection, quizzesSection, perQuizSection, perSubjectSection,
  activeStudentsSection, inactiveStudentsSection, submissionsSection,
} from '../../utils/kpiSections';

type ModalKind = 'students' | 'teachers' | 'quizzes' | 'avg' | 'participation' | 'risk' | null;

const avg = (n: number[]) => (n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : 0);

export const SupervisorDashboard: React.FC = () => {
  const { currentUser, quizzes, submissions, users, classes, subjects, kpis, setCurrentView } = useApp();
  const [modal, setModal] = useState<ModalKind>(null);
  const perms = currentUser?.teacher_permissions || currentUser?.permissions || {};

  const data = useMemo(
    () => (currentUser ? StorageService.getSupervisorData(currentUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, quizzes, submissions, users]
  );
  if (!currentUser || !data) return null;

  const { scope, students, teachers } = data;
  const subs = submissions || [];
  const quizList = quizzes || [];

  const passOf = (s: { quiz_id: string; percentage: number }) =>
    (Number(s.percentage) || 0) >= (quizList.find((q) => q.id === s.quiz_id)?.pass_percentage || 50);

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

  // أداء الصفوف
  const classRows = classes
    .filter((c) => students.some((s) => (s.class_id || s.assigned_class_ids?.[0]) === c.id))
    .map((c) => {
      const cs = students.filter((s) => (s.class_id || s.assigned_class_ids?.[0]) === c.id);
      const ids = new Set(cs.map((s) => s.id));
      const csubs = subs.filter((s) => ids.has(s.student_id));
      const part = cs.length ? Math.round((cs.filter((s) => csubs.some((x) => x.student_id === s.id)).length / cs.length) * 100) : 0;
      return {
        name: c.name, students: cs.length, part, subs: csubs.length,
        avg: csubs.length ? avg(csubs.map((s) => Number(s.percentage) || 0)) : null,
        pass: csubs.length ? Math.round((csubs.filter(passOf).length / csubs.length) * 100) : null,
      };
    });

  // أداء المعلمين (يتطلب صلاحية)
  const canSeeTeachers = !!perms.can_view_teachers_performance;
  const teacherRows = teachers.map((t) => {
    const tq = quizList.filter((q) => q.teacher_id === t.id);
    const ids = new Set(tq.map((q) => q.id));
    const tsubs = subs.filter((s) => ids.has(s.quiz_id));
    const last = tsubs.map((s) => new Date(s.completed_at).getTime()).sort((a, b) => b - a)[0];
    return {
      name: t.name, quizzes: tq.length, subs: tsubs.length,
      avg: tsubs.length ? avg(tsubs.map((s) => Number(s.percentage) || 0)) : null,
      pass: tsubs.length ? Math.round((tsubs.filter(passOf).length / tsubs.length) * 100) : null,
      last: last ? new Date(last).toLocaleDateString('ar-EG-u-ca-gregory-nu-latn') : '—',
    };
  });

  const modalContent = (): { title: string; subtitle?: string; sections: KpiSection[] } | null => {
    switch (modal) {
      case 'students':
        return { title: 'الطلاب ضمن نطاقك', sections: [studentsSection('قائمة الطلاب', students, subs, classes)] };
      case 'teachers':
        return {
          title: 'المعلمون ضمن نطاقك',
          sections: [{
            title: 'قائمة المعلمين',
            headers: canSeeTeachers ? ['المعلم', 'الاختبارات', 'التسليمات', 'المتوسط', 'نسبة النجاح'] : ['المعلم', 'الاختبارات'],
            rows: teacherRows.map((r) => canSeeTeachers ? [r.name, r.quizzes, r.subs, r.avg === null ? '—' : `${r.avg}%`, r.pass === null ? '—' : `${r.pass}%`] : [r.name, r.quizzes]),
            emptyText: 'لا يوجد معلمون ضمن نطاقك',
          }],
        };
      case 'quizzes':
        return { title: 'الاختبارات ضمن نطاقك', sections: [quizzesSection('قائمة الاختبارات', quizList, subs, subjects, users, classes)] };
      case 'avg':
        return {
          title: 'متوسط الأداء ونسبة النجاح',
          subtitle: `المتوسط ${avgAll}% • نسبة النجاح ${passRate}%`,
          sections: [perQuizSection('حسب الاختبار', quizList, subs), perSubjectSection('حسب المادة', quizList, subs, subjects)],
        };
      case 'participation':
        return {
          title: 'مشاركة الطلاب',
          subtitle: `${participation}% من طلاب نطاقك أدّوا اختباراً واحداً على الأقل`,
          sections: [
            inactiveStudentsSection('لم يؤدوا أي اختبار خلال آخر 7 أيام', students, subs, classes),
            activeStudentsSection('نشطون خلال آخر 7 أيام', students, subs, classes),
          ],
        };
      case 'risk':
        return {
          title: 'طلاب يحتاجون متابعة',
          subtitle: 'متوسطهم أقل من 50% أو لم يؤدوا أي اختبار بعد',
          sections: [{
            title: 'القائمة',
            headers: ['الطالب', 'الصف', 'المتوسط', 'اختبارات مؤداة'],
            rows: atRisk.map((s) => {
              const a = studentAvg(s.id);
              return [s.name, classes.find((c) => c.id === (s.class_id || s.assigned_class_ids?.[0]))?.name || 'بدون صف', a === null ? 'لم يؤدِّ' : `${a}%`, subs.filter((x) => x.student_id === s.id).length];
            }),
            emptyText: 'لا يوجد طلاب بحاجة لمتابعة',
          }],
        };
      default:
        return null;
    }
  };
  const mc = modalContent();

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir="rtl">
      <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-cyan-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser.name} role="supervisor" userId={currentUser.id} size="xl" showBadge />
            <div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-bold text-sky-100">
                {currentUser.job_title?.trim() || 'لوحة المشرف'}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black font-cairo mt-1">مرحباً بك، {currentUser.name}</h1>
              <p className="text-xs text-sky-100 mt-1">
                {scope.all
                  ? 'نطاق الإشراف: كل الصفوف والمواد'
                  : `نطاق الإشراف: ${scope.classIds.length ? `${scope.classIds.length} صف` : 'كل الصفوف'} • ${scope.subjectIds.length ? `${scope.subjectIds.length} مادة` : 'كل المواد'}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView('analytics')}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20"
          >
            التحليلات التفصيلية
          </button>
        </div>
      </div>

      {scope.empty && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>لم تُسنَد لك صفوف أو مواد بعد، لذلك لا تظهر بيانات. اطلب من مدير النظام إسناد نطاق الإشراف لحسابك.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard title="الطلاب ضمن نطاقك" value={students.length} subtitle="اضغط لعرض القائمة" icon={Users} colorScheme="indigo" onClick={() => setModal('students')} />
        <KPICard title="المعلمون ضمن نطاقك" value={teachers.length} subtitle="المعلمون المرتبطون بنطاقك" icon={UserCog} colorScheme="cyan" onClick={() => setModal('teachers')} />
        <KPICard title="الاختبارات ضمن نطاقك" value={quizList.length} subtitle="بمختلف المواد" icon={ClipboardList} colorScheme="purple" onClick={() => setModal('quizzes')} />
        <KPICard
          title="متوسط الأداء"
          value={`${avgAll}%`}
          subtitle={`نسبة النجاح ${passRate}% • ${subs.length} تسليم`}
          icon={Award}
          colorScheme="emerald"
          trend={{ value: `${passRate}% نجاح`, isPositive: avgAll >= 60 }}
          onClick={() => setModal('avg')}
        />
        <KPICard title="نسبة المشاركة" value={`${participation}%`} subtitle="طلاب أدّوا اختباراً على الأقل" icon={Activity} colorScheme="amber" onClick={() => setModal('participation')} />
        <KPICard title="يحتاجون متابعة" value={atRisk.length} subtitle="متوسط أقل من 50% أو بلا محاولات" icon={AlertTriangle} colorScheme="rose" onClick={() => setModal('risk')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">أداء الصفوف</h2>
          {classRows.length === 0 ? (
            <p className="text-xs text-slate-400">لا توجد بيانات صفوف ضمن نطاقك</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 px-2">الصف</th><th className="py-2 px-2">الطلاب</th><th className="py-2 px-2">المشاركة</th><th className="py-2 px-2">المتوسط</th><th className="py-2 px-2">النجاح</th>
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
            <Trophy className="w-4 h-4 text-amber-500" /> الأوائل ضمن نطاقك
          </h2>
          {topStudents.length === 0 ? (
            <p className="text-xs text-slate-400">لا توجد نتائج بعد</p>
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

      {canSeeTeachers && (
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">أداء المعلمين</h2>
          {teacherRows.length === 0 ? (
            <p className="text-xs text-slate-400">لا يوجد معلمون ضمن نطاقك</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 px-2">المعلم</th><th className="py-2 px-2">اختباراته</th><th className="py-2 px-2">التسليمات</th><th className="py-2 px-2">المتوسط</th><th className="py-2 px-2">النجاح</th><th className="py-2 px-2">آخر نشاط</th>
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

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
        <h2 className="font-bold text-base text-slate-900 dark:text-white mb-4">توزيع الدرجات ونشاط التسليم</h2>
        <AnalyticsCharts
          scoreDistribution={kpis?.scoreDistribution || []}
          completionTimeline={kpis?.completionTimeline || []}
          subjectPerformance={kpis?.subjectPerformance || []}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
        <SubmissionsTable submissions={subs} />
      </div>

      {mc && <KpiDetailModal title={mc.title} subtitle={mc.subtitle} sections={mc.sections} onClose={() => setModal(null)} />}
    </div>
  );
};
