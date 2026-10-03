import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  BookOpen,
  X,
  GraduationCap,
  FileText,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { uiDir, t, dateLocale } from '../../i18n';

interface ScoreDistributionItem {
  name: string;
  count: number;
  color: string;
  shortName: string;
}

interface TimelineItem {
  dateKey: string;
  dateLabel: string;
  submissionsCount: number;
}

interface SubjectPerformanceItem {
  subjectId: string;
  subjectName: string;
  averageScore: number;
  submissionsCount: number;
  color: string;
}

interface AnalyticsChartsProps {
  scoreDistribution: ScoreDistributionItem[];
  completionTimeline: TimelineItem[];
  subjectPerformance: SubjectPerformanceItem[];
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({
  scoreDistribution: rawDistribution = [],
  completionTimeline: rawTimeline = [],
  subjectPerformance = [],
}) => {
  // البيانات تُحسب مرة وتُخزَّن بالعربية: تُترجم التسميات والتواريخ هنا عند العرض
  const scoreDistribution = rawDistribution.map((d) => ({ ...d, name: t(d.name), shortName: t(d.shortName) }));
  const completionTimeline = rawTimeline.map((d) => ({
    ...d,
    dateLabel: d.dateKey ? new Date(d.dateKey).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) : d.dateLabel,
  }));
  const { theme, submissions, quizzes, users } = useApp();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#f1f5f9';
  const axisColor = isDark ? '#94a3b8' : '#64748b';

  // ── Subject Drill-Down State ──────────────────────────────────────────────
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const selectedSubject = subjectPerformance.find((s) => s.subjectId === selectedSubjectId);

  const subjectDetailData = selectedSubjectId
    ? (() => {
        const subjectQuizzes = quizzes.filter((q) => q.subject_id === selectedSubjectId);
        const quizIds = new Set(subjectQuizzes.map((q) => q.id));
        const subjectSubmissions = submissions.filter((s) => quizIds.has(s.quiz_id));

        // بيانات الاختبارات
        const quizDetails = subjectQuizzes.map((quiz) => {
          const qSubs = subjectSubmissions.filter((s) => s.quiz_id === quiz.id);
          const avg =
            qSubs.length > 0
              ? Math.round(qSubs.reduce((acc, s) => acc + s.percentage, 0) / qSubs.length)
              : 0;
          const passing = qSubs.filter(
            (s) => s.percentage >= (quiz.pass_percentage || 60)
          ).length;
          return { quiz, count: qSubs.length, avg, passing };
        });

        // بيانات الطلاب مرتبة تنازلياً بالمتوسط
        const studentMap = new Map<
          string,
          { name: string; nationalId: string; scores: number[] }
        >();
        subjectSubmissions.forEach((sub) => {
          const student = users.find((u) => u.id === sub.student_id);
          if (!student) return;
          if (!studentMap.has(student.id)) {
            studentMap.set(student.id, {
              name: student.name,
              nationalId: student.national_id,
              scores: [],
            });
          }
          studentMap.get(student.id)!.scores.push(sub.percentage);
        });

        const studentResults = Array.from(studentMap.entries())
          .map(([id, data]) => ({
            id,
            name: data.name,
            nationalId: data.nationalId,
            avgScore: Math.round(
              data.scores.reduce((a, b) => a + b, 0) / data.scores.length
            ),
            attempts: data.scores.length,
          }))
          .sort((a, b) => b.avgScore - a.avgScore);

        return { quizDetails, studentResults };
      })()
    : null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 1. Score Distribution Bar Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft transition-colors duration-200">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">{t('توزيع الدرجات ومستويات الإنجاز')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('إحصائية التقديرات التراكمية لنتائج جميع الاختبارات')}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg">
              {t('إجمالي التقييمات')}
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={scoreDistribution}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis
                  dataKey="shortName"
                  tick={{ fill: axisColor, fontSize: 12, fontFamily: 'Cairo' }}
                  axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 12, fontFamily: 'Cairo' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ScoreDistributionItem;
                      return (
                        <div
                          className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs font-cairo border border-slate-700"
                          dir={uiDir()}
                        >
                          <p className="font-bold text-sm mb-1">{data.name}</p>
                          <p className="text-slate-300">
                            {t('عدد الطلاب المسجلين:')}{' '}
                            <span className="font-bold text-emerald-400">{data.count}{' '}{t('طلاب')}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={48}>
                  {scoreDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            {scoreDistribution.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-600 dark:text-slate-400 font-medium">{item.shortName}:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Quiz Completion Timeline (Area/Line Chart) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft transition-colors duration-200">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">{t('معدل إكمال وتسليم الاختبارات')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('حركة نشاط الاختبارات اليومية عبر الوقت')}</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800 rounded-lg">
              {t('تحديث فوري')}
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={completionTimeline}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorSubmissions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fill: axisColor, fontSize: 11, fontFamily: 'Cairo' }}
                  axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 12, fontFamily: 'Cairo' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as TimelineItem;
                      return (
                        <div
                          className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs font-cairo border border-slate-700"
                          dir={uiDir()}
                        >
                          <p className="font-bold text-sm mb-1">{data.dateLabel}</p>
                          <p className="text-slate-300">
                            {t('الاختبارات المسلمة:')}{' '}
                            <span className="font-bold text-emerald-400">
                              {data.submissionsCount}{' '}{t('محاولة')}
                            </span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="submissionsCount"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSubmissions)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span>{t('يوضح المنحنى إقبال الطلاب على أداء التقييمات وفق الفترات الزمنية المجدولة')}</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t('نشاط تفاعلي مستمر')}</span>
          </div>
        </div>

        {/* 3. Performance Breakdown By Subject — Clickable Cards */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft transition-colors duration-200">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-xl">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">
                  {t('مؤشر الأداء والتحصيل الأكاديمي حسب المادة')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('متوسط الدرجات ونسبة الإنجاز لكل مادة دراسية — انقر على أي مادة للتفاصيل')}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-lg">
              {t('مقارنة المواد')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {subjectPerformance.map((subj) => (
              <div
                key={subj.subjectId}
                onClick={() => setSelectedSubjectId(subj.subjectId)}
                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer select-none group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                    {subj.subjectName}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{
                      backgroundColor: `${subj.color}15`,
                      color: subj.color,
                    }}
                  >
                    {subj.averageScore}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${subj.averageScore}%`,
                      backgroundColor: subj.color,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{t('المحاولات المسجلة:')}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {subj.submissionsCount}{' '}{t('تسليم')}
                  </span>
                </div>
                <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-2 text-center font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('انقر لعرض التفاصيل ←')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Subject Drill-Down Detail Modal
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedSubjectId && selectedSubject && subjectDetailData && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 dark:border-slate-800 my-8">

            {/* Modal Header */}
            <div
              className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 rounded-t-3xl"
              style={{
                background: `linear-gradient(135deg, ${selectedSubject.color}18, ${selectedSubject.color}06)`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: `${selectedSubject.color}20` }}
                >
                  <BookOpen className="w-5 h-5" style={{ color: selectedSubject.color }} />
                </div>
                <div>
                  <h2 className="font-black text-lg text-slate-900 dark:text-white">
                    {selectedSubject.subjectName}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('تقرير تفصيلي ·')}{' '}
                    <span className="font-bold" style={{ color: selectedSubject.color }}>
                      {selectedSubject.submissionsCount}
                    </span>{' '}
                    {t('محاولة · متوسط')}{' '}
                    <span className="font-bold" style={{ color: selectedSubject.color }}>
                      {selectedSubject.averageScore}%
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSubjectId(null)}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">

              {/* ── Quizzes Section ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">
                    {t('الاختبارات في هذه المادة')}
                  </h3>
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                    {subjectDetailData.quizDetails.length}{' '}{t('اختبار')}
                  </span>
                </div>

                {subjectDetailData.quizDetails.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                    {t('لا توجد اختبارات بعد في هذه المادة')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {subjectDetailData.quizDetails.map(({ quiz, count, avg, passing }) => (
                      <div
                        key={quiz.id}
                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {quiz.title}
                          </p>
                          <p className="text-[10px] text-slate-400">{count}{' '}{t('محاولة')}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ms-3">
                          <div className="text-center">
                            <p className="text-xs font-black" style={{ color: selectedSubject.color }}>
                              {avg}%
                            </p>
                            <p className="text-[9px] text-slate-400">{t('متوسط')}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                              {passing}
                            </p>
                            <p className="text-[9px] text-slate-400">{t('ناجح')}</p>
                          </div>
                          <div className="w-20 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${avg}%`,
                                backgroundColor: selectedSubject.color,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Students Section ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <GraduationCap className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">
                    {t('أداء الطلاب في هذه المادة')}
                  </h3>
                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                    {subjectDetailData.studentResults.length}{' '}{t('طالب')}
                  </span>
                </div>

                {subjectDetailData.studentResults.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                    {t('لا توجد بيانات طلاب بعد')}
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 pe-1">
                    {subjectDetailData.studentResults.map((student, idx) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800"
                      >
                        {/* ترتيب */}
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            idx === 0
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                              : idx === 1
                              ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              : idx === 2
                              ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400'
                              : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {student.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {student.nationalId} · {student.attempts}{' '}{t('محاولة')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${student.avgScore}%`,
                                backgroundColor:
                                  student.avgScore >= 85
                                    ? '#10b981'
                                    : student.avgScore >= 60
                                    ? '#6366f1'
                                    : '#f43f5e',
                              }}
                            />
                          </div>
                          <span
                            className={`text-xs font-black w-10 text-start ${
                              student.avgScore >= 85
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : student.avgScore >= 60
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {student.avgScore}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end">
              <button
                onClick={() => setSelectedSubjectId(null)}
                className="px-6 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
              >
                {t('إغلاق')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
