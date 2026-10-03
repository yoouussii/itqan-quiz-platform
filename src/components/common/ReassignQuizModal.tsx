import React, { useState } from 'react';
import { X, UserCheck, ArrowRightLeft, BookOpen, AlertCircle } from 'lucide-react';
import { QuizWithDetails, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import { uiDir } from '../../i18n';

interface ReassignQuizModalProps {
  quiz: QuizWithDetails | null;
  onClose: () => void;
}

export const ReassignQuizModal: React.FC<ReassignQuizModalProps> = ({ quiz, onClose }) => {
  const { users, reassignQuizToTeacher } = useApp();
  const teachers = users.filter((u) => u.role === 'teacher');

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    teachers.find((t) => t.id !== quiz?.teacher_id)?.id || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!quiz) return null;

  const currentTeacher = users.find((u) => u.id === quiz.teacher_id);
  const selectedTeacher = users.find((u) => u.id === selectedTeacherId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacherId) return;

    setIsSubmitting(true);
    const success = reassignQuizToTeacher(quiz.id, selectedTeacherId);
    setIsSubmitting(false);

    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        dir={uiDir()}
      >
        {/* Header */}
        <div className="bg-indigo-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">إعادة إسناد وتفويض الاختبار</h2>
              <p className="text-xs text-indigo-100">نقل صلاحيات إدارة ومتابعة الاختبار لمعلم آخر</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Target Quiz Details */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block mb-1 uppercase tracking-wider">
              الاختبار المستهدف
            </span>
            <div className="font-bold text-slate-900 dark:text-white text-sm">{quiz.title}</div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span className="flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                {quiz.subject?.name}
              </span>
              <span>•</span>
              <span>المعلم الحالي: {currentTeacher?.name || 'غير محدد'}</span>
            </div>
          </div>

          {/* Transfer visual arrow */}
          <div className="flex items-center justify-center py-1">
            <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-full flex items-center gap-2 border border-indigo-100 dark:border-indigo-900">
              <span>{currentTeacher?.name}</span>
              <ArrowRightLeft className="w-3.5 h-3.5 rotate-180 text-indigo-500" />
              <span>{selectedTeacher?.name || 'المعلم الجديد'}</span>
            </div>
          </div>

          {/* New Teacher Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              اختر المعلم البديل المراد تفويضه بالصلاحيات:
            </label>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-white font-medium"
              required
            >
              <option value="" disabled>
                -- حدد معلماً من القائمة --
              </option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id} disabled={teacher.id === quiz.teacher_id}>
                  {teacher.name} ({teacher.national_id}) {teacher.id === quiz.teacher_id ? '(المعلم الحالي)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Info note */}
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              عند إتمام النقل، سيتمكن المعلم الجديد من الاطلاع على ورقات إجابة الطلاب، وتعديل خيارات
              التقييم، ومتابعة التحليلات الخاصة بهذا الاختبار.
            </p>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedTeacherId || selectedTeacherId === quiz.teacher_id}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'جارِ التحويل...' : 'تأكيد نقل الاختبار'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
