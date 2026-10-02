import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Eye, Edit3, BarChart2, Trash2, Copy as CopyIcon, PlusCircle, Search, Undo2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ReassignQuizModal } from '../common/ReassignQuizModal';
import { QuizWithDetails } from '../../types';
import { Avatar } from '../common/Avatar';
import { describeQuizTarget } from '../../utils/quizTarget';
import { getWindowState } from '../../utils/quizWindow';
import { Button, Card, Chip, PageHeader, Tone } from '../common/ui';

const statusOf = (q: QuizWithDetails): { label: string; tone: Tone } => {
  if (q.status === 'draft') return { label: 'مسودة', tone: 'muted' };
  if (q.status === 'pending_approval') return { label: 'بانتظار الاعتماد', tone: 'info' };
  if (q.status === 'rejected') return { label: 'مرفوض', tone: 'bad' };
  if (q.status === 'archived') return { label: 'مؤرشف', tone: 'muted' };
  const w = getWindowState(q.start_date, q.end_date);
  if (w === 'upcoming') return { label: 'لم يبدأ', tone: 'info' };
  if (w === 'ended') return { label: 'منتهٍ', tone: 'muted' };
  return { label: 'متاح الآن', tone: 'ok' };
};

/** بنك الاختبارات المدرسي (للمدير): معاينة، تعديل، نتائج، نسخ، نقل لمعلم آخر، حذف */
export const AdminQuizBank: React.FC = () => {
  const {
    quizzes = [], users = [], classes = [], deleteQuizItem, updateQuizInfo, setActiveQuizId, setEditingQuizId, setDuplicateQuizId, setCurrentView,
  } = useApp();
  const [reassign, setReassign] = useState<QuizWithDetails | null>(null);
  const [term, setTerm] = useState('');

  const list = useMemo(() => {
    const t = term.trim();
    return (quizzes || [])
      .filter((q) => q && !q.is_deleted)
      .filter((q) => !t || q.title.includes(t) || (q.subject?.name || '').includes(t) || (users.find((u) => u.id === q.teacher_id)?.name || '').includes(t));
  }, [quizzes, users, term]);

  const open = (id: string, view: string) => {
    setActiveQuizId?.(id);
    setCurrentView?.(view);
  };
  const handleDelete = async (q: QuizWithDetails) => {
    if (window.confirm(`حذف اختبار «${q.title}»؟ سيمسح ذلك جميع نتائج الطلاب المتعلقة به.`)) await deleteQuizItem?.(q.id);
  };
  /** إيقاف اختبار منشور وإعادته لقائمة الاعتماد (لا يراه الطلاب حتى يُعتمد) */
  const pullBack = async (q: QuizWithDetails) => {
    if (window.confirm(`سحب «${q.title}» للمراجعة؟ سيختفي من قوائم الطلاب حتى تعتمده من «بانتظار الاعتماد».`)) {
      await updateQuizInfo(q.id, { status: 'pending_approval' });
    }
  };
  const iconBtn = 'w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      <PageHeader
        title="بنك الاختبارات"
        subtitle={`${list.length} اختباراً · معاينة وتعديل ونقل الملكية بين المعلمين`}
        actions={
          <Button icon={PlusCircle} onClick={() => { setEditingQuizId?.(null); setDuplicateQuizId?.(null); setCurrentView?.('create_quiz'); }}>
            اختبار جديد
          </Button>
        }
      />
      <label className="flex items-center gap-2 max-w-sm h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500">
        <Search className="w-[18px] h-[18px]" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="بحث بالعنوان أو المادة أو المعلم" aria-label="بحث في الاختبارات"
          className="flex-1 bg-transparent outline-none text-[15px] text-slate-900 dark:text-white" />
      </label>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[14.5px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[13px] border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4 font-semibold">الاختبار</th>
                <th className="py-3 px-4 font-semibold">الحالة</th>
                <th className="py-3 px-4 font-semibold">المعلم</th>
                <th className="py-3 px-4 font-semibold">موجّه إلى</th>
                <th className="py-3 px-4 font-semibold">التسليمات</th>
                <th className="py-3 px-4 font-semibold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((quiz) => {
                const teacher = users.find((u) => u.id === quiz.teacher_id);
                const st = statusOf(quiz);
                return (
                  <tr key={quiz.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{quiz.title}</div>
                      <div className="text-[13px] text-slate-500 dark:text-slate-400">
                        {quiz.subject?.name || 'عام'} · {quiz.duration_minutes} دقيقة · {quiz.total_marks} درجة
                      </div>
                    </td>
                    <td className="py-3 px-4"><Chip tone={st.tone}>{st.label}</Chip></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Avatar name={teacher?.name || 'م'} role={teacher?.role} userId={teacher?.id} size="xs" />
                        <span className="text-slate-700 dark:text-slate-300">{teacher?.name || 'غير معروف'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{describeQuizTarget(quiz.assignments, classes)}</td>
                    <td className="py-3 px-4">
                      <button type="button" onClick={() => open(quiz.id, 'quiz_results')} className="font-semibold text-indigo-700 dark:text-indigo-400 hover:underline">
                        {quiz.submissions_count || 0} تسليم
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-0.5">
                        <button type="button" onClick={() => open(quiz.id, 'quiz_preview')} className={iconBtn} title="معاينة" aria-label="معاينة"><Eye className="w-[18px] h-[18px]" /></button>
                        <button type="button" onClick={() => { setEditingQuizId?.(quiz.id); setCurrentView?.('create_quiz'); }} className={iconBtn} title="تعديل" aria-label="تعديل"><Edit3 className="w-[18px] h-[18px]" /></button>
                        <button type="button" onClick={() => open(quiz.id, 'quiz_results')} className={iconBtn} title="النتائج" aria-label="النتائج"><BarChart2 className="w-[18px] h-[18px]" /></button>
                        <button type="button" onClick={() => { setEditingQuizId?.(null); setDuplicateQuizId?.(quiz.id); setCurrentView?.('create_quiz'); }} className={iconBtn} title="نسخ مع التعديل" aria-label="نسخ"><CopyIcon className="w-[18px] h-[18px]" /></button>
                        {quiz.status === 'published' && (
                          <button type="button" onClick={() => pullBack(quiz)} className={iconBtn} title="سحب للمراجعة (إيقاف النشر)" aria-label="سحب للمراجعة"><Undo2 className="w-[18px] h-[18px]" /></button>
                        )}
                        <button type="button" onClick={() => setReassign(quiz)} className={iconBtn} title="نقل لمعلم آخر" aria-label="نقل لمعلم آخر"><ArrowRightLeft className="w-[18px] h-[18px]" /></button>
                        <button type="button" onClick={() => handleDelete(quiz)} className="w-9 h-9 flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50" title="حذف" aria-label="حذف"><Trash2 className="w-[18px] h-[18px]" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500">لا توجد اختبارات مطابقة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {reassign && <ReassignQuizModal quiz={reassign} onClose={() => setReassign(null)} />}
    </div>
  );
};
