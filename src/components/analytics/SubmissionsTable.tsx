import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Eye,
  Calendar,
  CheckCircle,
  FileSpreadsheet,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Lock,
  Ban,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { SubmissionWithDetails } from '../../types';
import { useApp } from '../../context/AppContext';
import { AnswerSheetModal } from './AnswerSheetModal';
import { hasPerm } from '../../utils/permissions';
import { Avatar } from '../common/Avatar';
import { formatArabicQuizDate } from '../../utils/dateUtils';
import { SUBMISSIONS_FILTER_KEY, ungradedSummary } from '../../utils/grading';
import { t, isEn } from '../../i18n';

interface SubmissionsTableProps {
  submissions: SubmissionWithDetails[];
  title?: string;
  subtitle?: string;
  /** أزرار إضافية بجوار زر التصدير (مثل تصدير PDF للرسوم) */
  extraActions?: React.ReactNode;
}

export const SubmissionsTable: React.FC<SubmissionsTableProps> = ({
  submissions,
  title = t('سجل نتائج وتقييمات الطلاب التفصيلي'),
  subtitle = t('بحث وفلترة فورية لكافة الاختبارات المسلمة مع إمكانية استعراض ورقة الإجابة'),
  extraActions,
}) => {
  const {
    subjects,
    classes,
    currentUser,
    quizzes,
    allowStudentRetake,
    revokeStudentRetake,
    deleteSubmissions,
    branches,
  } = useApp();
  const [genderFilter, setGenderFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  // يمكن فتح الجدول مباشرة على فلتر محدد (مثل «يحتاج تصحيح» من الرئيسية)
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>(() => {
    try {
      const f = sessionStorage.getItem(SUBMISSIONS_FILTER_KEY);
      if (f) sessionStorage.removeItem(SUBMISSIONS_FILTER_KEY);
      return f || 'all';
    } catch {
      return 'all';
    }
  });
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionWithDetails | null>(null);

  // Pagination state for high performance
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // STRICT PRIVACY: If current user is a student, enforce privacy strictly
  const isStudent = currentUser?.role === 'student';
  // التصدير ومنح إعادة المحاولة بحسب الصلاحيات (المدير: تلقائي، المعلم: كما كان، المشرف: بصلاحية صريحة)
  const canExport = !isStudent && hasPerm(currentUser, 'can_export_reports');
  const canManageRetakes = !isStudent && hasPerm(currentUser, 'can_manage_retakes');
  const canDelete = !isStudent && hasPerm(currentUser, 'can_delete_submissions');

  const removeSubs = async (ids: string[], what: string) => {
    if (!ids.length) return;
    if (!window.confirm(t('حذف {what} نهائياً؟\nسيتمكن الطالب من دخول الاختبار مرة أخرى إن كان ما زال متاحاً. لا يمكن التراجع.', { what }))) return;
    setDeleting(true);
    await deleteSubmissions(ids);
    setDeleting(false);
    setPicked((prev) => prev.filter((id) => !ids.includes(id)));
  };

  // المعلم (بدون صلاحية التقارير العامة) يرى في الفلتر المواد المسندة إليه فقط
  const visibleSubjects = useMemo(() => {
    const u = currentUser;
    const mine = u?.assigned_subject_ids || [];
    const canAll = !!(u?.teacher_permissions?.can_view_all_reports || u?.permissions?.can_view_all_reports);
    if ((u?.role === 'teacher' || u?.role === 'supervisor') && !canAll && mine.length > 0) {
      return subjects.filter((s) => mine.includes(s.id));
    }
    return subjects;
  }, [subjects, currentUser]);

  const safeSubmissions = useMemo(() => {
    if (isStudent && currentUser) {
      return submissions.filter((s) => s.student_id === currentUser.id);
    }
    return submissions;
  }, [submissions, isStudent, currentUser]);

  const ungradedIds = useMemo(
    () => (isStudent ? new Set<string>() : ungradedSummary(safeSubmissions).submissionIds),
    [safeSubmissions, isStudent]
  );

  // Filter submissions
  const filteredSubmissions = useMemo(() => {
    return safeSubmissions.filter((sub) => {
      // Search term
      const matchesSearch =
        !searchTerm.trim() ||
        sub.student?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.quiz?.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sub.student?.national_id && sub.student.national_id.includes(searchTerm));

      // Subject filter
      const matchesSubject =
        selectedSubjectId === 'all' || sub.quiz?.subject_id === selectedSubjectId;

      // Class filter
      const matchesClass =
        selectedClassId === 'all' || sub.student?.class_id === selectedClassId;

      // Grade status filter
      if (genderFilter !== 'all' && sub.student?.gender !== genderFilter) return false;
      if (branchFilter !== 'all' && (sub.student?.branch_id || '') !== branchFilter) return false;

      let matchesGrade = true;
      if (selectedGradeFilter === 'excellent') {
        matchesGrade = sub.percentage >= 90;
      } else if (selectedGradeFilter === 'passed') {
        matchesGrade = sub.percentage >= 60;
      } else if (selectedGradeFilter === 'ungraded') {
        matchesGrade = ungradedIds.has(sub.id);
      } else if (selectedGradeFilter === 'failed') {
        matchesGrade = sub.percentage < 60;
      }

      return matchesSearch && matchesSubject && matchesClass && matchesGrade;
    });
  }, [safeSubmissions, searchTerm, selectedSubjectId, selectedClassId, selectedGradeFilter, ungradedIds, genderFilter, branchFilter]);

  // Paginated slice
  const totalPages = Math.ceil(filteredSubmissions.length / pageSize) || 1;
  const paginatedSubmissions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSubmissions.slice(start, start + pageSize);
  }, [filteredSubmissions, currentPage, pageSize]);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString(isEn() ? 'en-GB' : 'ar-EG-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPercentageBadge = (percentage: number) => {
    if (percentage >= 90) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {t('ممتاز (')}{percentage}%)
        </span>
      );
    }
    if (percentage >= 80) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          {t('جيد جداً (')}{percentage}%)
        </span>
      );
    }
    if (percentage >= 65) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
          {t('جيد (')}{percentage}%)
        </span>
      );
    }
    if (percentage >= 50) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          {t('مقبول (')}{percentage}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
        {t('راسب (')}{percentage}%)
      </span>
    );
  };

  const exportCSV = () => {
    const headers = [
      t('اسم الطالب'),
      t('رقم الهوية'),
      t('الصف الدراسي'),
      t('عنوان الاختبار'),
      t('المادة'),
      t('الدرجة المحصلة'),
      t('الدرجة الكلية'),
      t('النسبة المئوية'),
      t('تاريخ الإكمال'),
    ];
    const rows = filteredSubmissions.map((s) => [
      `"${s.student?.name || ''}"`,
      `"${s.student?.national_id || ''}"`,
      `"${s.student_class?.name || ''}"`,
      `"${s.quiz?.title || ''}"`,
      `"${s.subject?.name || ''}"`,
      s.score,
      s.total_possible_score,
      `${s.percentage}%`,
      `"${s.completed_at}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `نتائج_الطلاب_منصة_إتقان_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft overflow-hidden transition-colors duration-200">
      {/* Header & Controls */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isStudent ? t('سجل نتائج اختباراتي الشخصية') : title}
              </h3>
              {isStudent && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <Lock className="w-3 h-3" />
                  <span>{t('خصوصية تامة')}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isStudent
                ? t('استعراض درجاتك التفصيلية وأوراق إجاباتك المصححة فورياً')
                : subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t('تصدير إلى CSV')}</span>
              </button>
            )}
            {canExport && extraActions}
            <span className="text-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold px-3 py-2 rounded-xl border border-indigo-100 dark:border-indigo-900">
              {filteredSubmissions.length}{' '}{t('نتيجة مطابقة')}
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={isStudent ? t('ابحث بعنوان الاختبار...') : t('ابحث باسم الطالب، الهوية أو الاختبار...')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full ps-10 pe-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Subject Filter */}
          <div className="relative">
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t('جميع المواد الدراسية')}</option>
              {visibleSubjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Class Filter (only for admin/teacher) */}
          {!isStudent && (
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                <option value="all">{t('جميع الفصول والشعب')}</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Grade Status Filter */}
          <div className="relative">
            <select
              value={selectedGradeFilter}
              onChange={(e) => {
                setSelectedGradeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t('كافة التقديرات')}</option>
              <option value="excellent">{t('الدرجات الممتازة (≥ 90%)')}</option>
              <option value="passed">{t('الناجحون فقط (≥ 60%)')}</option>
              <option value="failed">{t('بحاجة لتحسين / راسب (< 60%)')}</option>
              {!isStudent && <option value="ungraded">{t('يحتاج تصحيح مقالي (')}{ungradedIds.size})</option>}
            </select>
          </div>

          {!isStudent && (
            <div className="relative flex gap-2">
              <select aria-label={t('تصفية حسب النوع')} value={genderFilter} onChange={(e) => { setGenderFilter(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                <option value="all">{t('البنين والبنات')}</option>
                <option value="male">{t('البنين')}</option>
                <option value="female">{t('البنات')}</option>
              </select>
              {branches.length > 0 && currentUser?.role === 'admin' && (
                <select aria-label={t('تصفية حسب الفرع')} value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                  <option value="all">{t('كل الفروع')}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table Content */}
      {canDelete && filteredSubmissions.length > 0 && (() => {
        const deletedQuizSubs = safeSubmissions.filter((x) => x.quiz?.is_deleted || !x.quiz).map((x) => x.id);
        return (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 bg-rose-50/40 dark:bg-rose-950/10">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" className="accent-rose-600"
                checked={picked.length > 0 && filteredSubmissions.every((x) => picked.includes(x.id))}
                onChange={(e) => setPicked(e.target.checked ? filteredSubmissions.map((x) => x.id) : [])} />
              {t('تحديد كل النتائج المعروضة (')}{filteredSubmissions.length})
            </label>
            <button type="button" disabled={deleting || !picked.length} onClick={() => void removeSubs(picked, t('{n} مشاركة محددة', { n: picked.length }))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/50 hover:bg-rose-200 disabled:opacity-40">
              <Trash2 className="w-3.5 h-3.5" />{' '}{t('حذف المحدد (')}{picked.length})
            </button>
            {deletedQuizSubs.length > 0 && (
              <button type="button" disabled={deleting} onClick={() => void removeSubs(deletedQuizSubs, t('{n} مشاركة في اختبارات محذوفة', { n: deletedQuizSubs.length }))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/50 hover:bg-rose-200 disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />{' '}{t('حذف مشاركات الاختبارات المحذوفة (')}{deletedQuizSubs.length})
              </button>
            )}
          </div>
        );
      })()}

      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
              {canDelete && <th className="py-3 ps-4 w-8"><span className="sr-only">{t('تحديد')}</span></th>}
              {!isStudent && <th className="py-3 px-4">{t('اسم الطالب ورقم الهوية')}</th>}
              {!isStudent && <th className="py-3 px-4">{t('الصف الدراسي')}</th>}
              <th className="py-3 px-4">{t('الاختبار والمادة')}</th>
              <th className="py-3 px-4">{t('الدرجة المحققة')}</th>
              <th className="py-3 px-4">{t('التقدير والنسبة')}</th>
              <th className="py-3 px-4">{t('الحالة')}</th>
              <th className="py-3 px-4">{t('تاريخ الإكمال')}</th>
              <th className="py-3 px-4 text-center">{t('الإجراء')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginatedSubmissions.length === 0 ? (
              <tr>
                <td colSpan={(isStudent ? 6 : 8) + (canDelete ? 1 : 0)} className="py-12 text-center text-slate-400">
                  <GraduationCap className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="font-semibold text-sm text-slate-600 dark:text-slate-300">
                    {t('لا توجد نتائج مطابقة لمعايير البحث الحالية')}
                  </p>
                </td>
              </tr>
            ) : (
              paginatedSubmissions.map((sub) => (
                <tr
                  key={sub.id}
                  className="hover:bg-indigo-50/20 dark:hover:bg-slate-800/40 transition-colors group"
                >
                  {canDelete && (
                    <td className="py-3 ps-4">
                      <input type="checkbox" className="accent-rose-600" aria-label={t('تحديد مشاركة {name}', { name: sub.student?.name || '' })}
                        checked={picked.includes(sub.id)}
                        onChange={() => setPicked(picked.includes(sub.id) ? picked.filter((x) => x !== sub.id) : [...picked, sub.id])} />
                    </td>
                  )}
                  {/* Student Name & ID (Hidden for student view for clean UI) */}
                  {!isStudent && (
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={sub.student?.name || t('ط')} role={sub.student?.role} userId={sub.student_id} size="sm" />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {sub.student?.name || t('طالب مسجل')}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {t('هوية:')}{' '}{sub.student?.national_id || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                  )}

                  {/* Class */}
                  {!isStudent && (
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {sub.student_class?.name || t('غير محدد')}
                      </span>
                    </td>
                  )}

                  {/* Quiz & Subject */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <div className={`font-bold ${sub.quiz?.is_deleted ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                        {sub.quiz?.title}
                      </div>
                      {sub.quiz?.is_deleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-800 w-fit">
                          <Ban className="w-3 h-3" />
                          <span>{t('اختبار محذوف -')}{' '}{formatArabicQuizDate(sub.quiz.deleted_at || '')}{' '}{t('(مستبعد من المعدل)')}</span>
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: sub.subject?.color || '#6366f1' }}
                        />
                        <span>{sub.subject?.name || t('مادة عامة')}</span>
                      </div>
                    </div>
                  </td>

                  {/* Score */}
                  <td className="py-3 px-4">
                    <span className="font-bold text-sm text-slate-900 dark:text-white font-cairo">
                      {sub.score}{' '}
                      <span className="text-slate-400 text-xs font-normal">
                        / {sub.total_possible_score}
                      </span>
                    </span>
                  </td>

                  {/* Percentage & Grade */}
                  <td className="py-3 px-4">{getPercentageBadge(sub.percentage)}</td>

                  {/* Status */}
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle className="w-3 h-3 text-emerald-500" />
                      <span>{t('مكتمل')}</span>
                    </span>
                  </td>

                  {/* Date */}
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDate(sub.completed_at)}</span>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setSelectedSubmission(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors shadow-xs"
                        title={t('عرض ورقة الإجابة التفصيلية')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('عرض الإجابة')}</span>
                      </button>

                      {canDelete && (
                        <button
                          onClick={() => void removeSubs([sub.id], t('مشاركة {name} في «{title}»', { name: sub.student?.name || t('الطالب'), title: sub.quiz?.title || t('الاختبار') }))}
                          disabled={deleting}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-40"
                          title={t('حذف المشاركة')}
                          aria-label={t('حذف المشاركة')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('حذف')}</span>
                        </button>
                      )}

                      {canManageRetakes && !sub.quiz?.is_deleted && (
                        <>
                          {sub.quiz?.allowed_retake_student_ids?.includes(sub.student_id) ? (
                            <button
                              onClick={() => revokeStudentRetake(sub.quiz_id, sub.student_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                              title={t('إلغاء صلاحية الإعادة')}
                            >
                              <span>{t('مسموح بالإعادة ✓')}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => allowStudentRetake(sub.quiz_id, sub.student_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                              title={t('إتاحة إعادة الاختبار لهذا الطالب')}
                            >
                              <RotateCcw className="w-3 h-3 text-indigo-500" />
                              <span>{t('إتاحة الإعادة')}</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
          <div>
            {t('صفحة')}{' '}<span className="font-bold text-slate-900 dark:text-white">{currentPage}</span>{' '}{t('من')}{' '}
            <span className="font-bold">{totalPages}</span> ({filteredSubmissions.length}{' '}{t('إجمالي السجلات)')}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4 dir-icon" />
            </button>
            <span className="font-bold">{currentPage}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 dir-icon" />
            </button>
          </div>
        </div>
      )}

      {/* Answer Sheet Modal */}
      {selectedSubmission && (
        <AnswerSheetModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
        />
      )}
    </div>
  );
};
