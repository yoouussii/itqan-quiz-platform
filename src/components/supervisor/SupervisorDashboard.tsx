import React, { useMemo } from 'react';
import { ShieldAlert, ExternalLink } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { AnalyticsCharts } from '../analytics/AnalyticsCharts';
import { SubmissionsTable } from '../analytics/SubmissionsTable';
import { Avatar } from '../common/Avatar';
import { InsightsPanels } from '../staff/InsightsPanels';
import { hasPerm } from '../../utils/permissions';
import { uiDir, t } from '../../i18n';

export const SupervisorDashboard: React.FC = () => {
  const { currentUser, quizzes, submissions, users, kpis, setCurrentView, settings, pendingApprovalsCount } = useApp();

  const data = useMemo(
    () => (currentUser ? StorageService.getSupervisorData(currentUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, quizzes, submissions, users]
  );
  if (!currentUser || !data) return null;
  const { scope } = data;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir={uiDir()}>
      <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-cyan-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser.name} role="supervisor" userId={currentUser.id} size="xl" showBadge />
            <div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-bold text-sky-100">
                {currentUser.job_title?.trim() || t('لوحة المشرف')}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black font-cairo mt-1">{t('مرحباً بك،')}{' '}{currentUser.name}</h1>
              <p className="text-xs text-sky-100 mt-1">
                {scope.all
                  ? t('نطاق الإشراف: كل الصفوف والمواد')
                  : t('نطاق الإشراف: {classes} • {subjects}', { classes: scope.classIds.length ? t('{n} صف', { n: scope.classIds.length }) : t('كل الصفوف'), subjects: scope.subjectIds.length ? t('{n} مادة', { n: scope.subjectIds.length }) : t('كل المواد') })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasPerm(currentUser, 'can_access_preparations') && (
              <a
                href={settings.preparations_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/90 hover:bg-emerald-500 text-white shadow-md"
              >
                <ExternalLink className="w-4 h-4" />
                <span>{t('متابعة تحضير مزن')}</span>
              </a>
            )}
            <button
              onClick={() => setCurrentView('analytics')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20"
            >
              {t('التحليلات التفصيلية')}
            </button>
          </div>
        </div>
      </div>

      {scope.empty && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('لم تُسنَد لك صفوف أو مواد بعد، لذلك لا تظهر بيانات. اطلب من مدير النظام إسناد نطاق الإشراف لحسابك.')}</span>
        </div>
      )}

      {pendingApprovalsCount > 0 && (
        <button
          onClick={() => setCurrentView('approvals')}
          className="w-full text-start px-5 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100"
        >
          🕓 {pendingApprovalsCount}{' '}{t('اختبار بانتظار اعتمادك — اضغط للمراجعة')}
        </button>
      )}

      <InsightsPanels
        mode="full"
        students={data.students}
        teachers={data.teachers}
        quizzes={data.quizzes}
        submissions={data.submissions}
        showTeacherPerformance={hasPerm(currentUser, 'can_view_teachers_performance')}
      />

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
        <h2 className="font-bold text-base text-slate-900 dark:text-white mb-4">{t('توزيع الدرجات ونشاط التسليم')}</h2>
        <AnalyticsCharts
          scoreDistribution={kpis?.scoreDistribution || []}
          completionTimeline={kpis?.completionTimeline || []}
          subjectPerformance={kpis?.subjectPerformance || []}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
        <SubmissionsTable submissions={submissions || []} />
      </div>
    </div>
  );
};
