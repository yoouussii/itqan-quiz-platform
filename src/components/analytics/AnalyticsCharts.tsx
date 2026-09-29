import React from 'react';
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
import { BarChart3, TrendingUp, BookOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';

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
  scoreDistribution,
  completionTimeline,
  subjectPerformance,
}) => {
  const { theme } = useApp();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#f1f5f9';
  const axisColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* 1. Score Distribution Bar Chart */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft transition-colors duration-200">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">توزيع الدرجات ومستويات الإنجاز</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                إحصائية التقديرات التراكمية لنتائج جميع الاختبارات
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg">
            إجمالي التقييمات
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
                        dir="rtl"
                      >
                        <p className="font-bold text-sm mb-1">{data.name}</p>
                        <p className="text-slate-300">
                          عدد الطلاب المسجلين:{' '}
                          <span className="font-bold text-emerald-400">{data.count} طلاب</span>
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
              <h3 className="text-base font-bold text-slate-800 dark:text-white">معدل إكمال وتسليم الاختبارات</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">حركة نشاط الاختبارات اليومية عبر الوقت</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800 rounded-lg">
            تحديث فوري
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
                        dir="rtl"
                      >
                        <p className="font-bold text-sm mb-1">{data.dateLabel}</p>
                        <p className="text-slate-300">
                          الاختبارات المسلمة:{' '}
                          <span className="font-bold text-emerald-400">
                            {data.submissionsCount} محاولة
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
          <span>يوضح المنحنى إقبال الطلاب على أداء التقييمات وفق الفترات الزمنية المجدولة</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">نشاط تفاعلي مستمر</span>
        </div>
      </div>

      {/* 3. Performance Breakdown By Subject */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft transition-colors duration-200">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">
                مؤشر الأداء والتحصيل الأكاديمي حسب المادة
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">متوسط الدرجات ونسبة الإنجاز لكل مادة دراسية</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-lg">
            مقارنة المواد
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {subjectPerformance.map((subj) => (
            <div
              key={subj.subjectId}
              className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{subj.subjectName}</span>
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
                <span>المحاولات المسجلة:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{subj.submissionsCount} تسليم</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
