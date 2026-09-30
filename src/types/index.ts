import React from 'react';
import { Trash2, Plus, HelpCircle, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { Question, QuestionType, SubQuestion } from '../../types';

interface QuestionCardProps {
  question: Question;
  index: number;
  onUpdate: (updatedQuestion: Question) => void;
  onDelete: (id: string) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  onUpdate,
  onDelete,
}) => {
  // تغيير نوع السؤال الرئيسي
  const handleTypeChange = (newType: QuestionType) => {
    if (newType === 'passage') {
      onUpdate({
        ...question,
        type: newType,
        sub_questions: question.sub_questions || [
          {
            id: `sub_${Date.now()}_1`,
            question_text: '',
            type: 'mcq',
            options: ['', '', '', ''],
            correct_option_index: 0,
            marks: 1,
          },
        ],
      });
    } else {
      onUpdate({ ...question, type: newType });
    }
  };

  // --- دوال إدارة الأسئلة الفرعية (الخاصة بالقطعة) --- //
  const handleAddSubQuestion = () => {
    const newSubQ: SubQuestion = {
      id: `sub_${Date.now()}`,
      question_text: '',
      type: 'mcq',
      options: ['', '', '', ''],
      correct_option_index: 0,
      marks: 1,
    };

    const updatedSubQuestions = [...(question.sub_questions || []), newSubQ];
    // إعادة حساب مجموع درجات القطعة بناءً على الأسئلة الفرعية
    const totalMarks = updatedSubQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

    onUpdate({
      ...question,
      sub_questions: updatedSubQuestions,
      marks: totalMarks,
    });
  };

  const handleUpdateSubQuestion = (subId: string, updatedFields: Partial<SubQuestion>) => {
    const updatedSubQuestions = (question.sub_questions || []).map((subQ) => {
      if (subQ.id === subId) {
        const updated = { ...subQ, ...updatedFields };
        // تجهيز خيارات صح وخطأ تلقائياً عند تغيير النوع
        if (updatedFields.type === 'true_false' && !updated.options) {
          updated.options = ['صواب', 'خطأ'];
          updated.correct_option_index = 0;
        } else if (updatedFields.type === 'mcq' && (!updated.options || updated.options.length < 2)) {
          updated.options = ['', '', '', ''];
          updated.correct_option_index = 0;
        }
        return updated;
      }
      return subQ;
    });

    const totalMarks = updatedSubQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

    onUpdate({
      ...question,
      sub_questions: updatedSubQuestions,
      marks: totalMarks,
    });
  };

  const handleRemoveSubQuestion = (subId: string) => {
    const updatedSubQuestions = (question.sub_questions || []).filter((subQ) => subQ.id !== subId);
    const totalMarks = updatedSubQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

    onUpdate({
      ...question,
      sub_questions: updatedSubQuestions,
      marks: totalMarks,
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm mb-6 space-y-5" dir="rtl">
      {/* الشريط العلوي: رقم السؤال، الدرجة، ونوع السؤال */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-md shadow-indigo-200 dark:shadow-none">
            {index + 1}
          </span>
          <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            السؤال رقم {index + 1}
          </span>
          <button
            type="button"
            onClick={() => onDelete(question.id)}
            className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 p-2 rounded-xl transition-colors"
            title="حذف السؤال"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الدرجات:</label>
            <input
              type="number"
              min={1}
              value={question.marks || 1}
              disabled={question.type === 'passage'} // الدرجة تحسب تلقائياً في القطعة
              onChange={(e) => onUpdate({ ...question, marks: Number(e.target.value) })}
              className="w-16 p-2 text-center border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">نوع السؤال:</label>
            <select
              value={question.type || 'essay'}
              onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
              className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white"
            >
              <option value="mcq">اختيار من متعدد</option>
              <option value="true_false">صح / خطأ</option>
              <option value="essay">سؤال مقالي / نصي</option>
              <option value="passage">سؤال قطعة / قراءة وفهم</option>
            </select>
          </div>
        </div>
      </div>

      {/* ======================= حالة: سؤال قطعة / قراءة وفهم ======================= */}
      {question.type === 'passage' ? (
        <div className="space-y-5">
          {/* نص القطعة الرئيسي */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              نص القطعة الرئيسي *
            </label>
            <textarea
              rows={4}
              value={question.question_text || ''}
              onChange={(e) => onUpdate({ ...question, question_text: e.target.value })}
              placeholder="اكتب أو الصق نص القطعة / الفهم القرائي هنا..."
              className="w-full p-3.5 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs leading-relaxed bg-amber-50/30 dark:bg-amber-950/10 focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-slate-100 transition-all"
            />
          </div>

          {/* صندوق الأسئلة الفرعية */}
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  الأسئلة الفرعية المندرجة تحت القطعة ({question.sub_questions?.length || 0})
                </h4>
              </div>
              <button
                type="button"
                onClick={handleAddSubQuestion}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة سؤال فرعي</span>
              </button>
            </div>

            {/* قائمة الأسئلة الفرعية */}
            {question.sub_questions?.map((subQ, subIdx) => (
              <div
                key={subQ.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3"
              >
                {/* هيدر السؤال الفرعي */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    فرعي #{subIdx + 1}
                  </span>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-slate-500">الدرجة:</span>
                      <input
                        type="number"
                        min={1}
                        value={subQ.marks || 1}
                        onChange={(e) =>
                          handleUpdateSubQuestion(subQ.id, { marks: Number(e.target.value) })
                        }
                        className="w-12 p-1 text-center border rounded-lg text-xs font-bold dark:bg-slate-800"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveSubQuestion(subQ.id)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      حذف
                    </button>
                  </div>
                </div>

                {/* نص السؤال الفرعي ونوعه */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      نص السؤال الفرعي *
                    </label>
                    <input
                      type="text"
                      value={subQ.question_text}
                      onChange={(e) => handleUpdateSubQuestion(subQ.id, { question_text: e.target.value })}
                      placeholder="أدخل نص السؤال الفرعي..."
                      className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-800 text-slate-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      نوع السؤال الفرعي
                    </label>
                    <select
                      value={subQ.type}
                      onChange={(e) =>
                        handleUpdateSubQuestion(subQ.id, {
                          type: e.target.value as 'mcq' | 'true_false' | 'essay',
                        })
                      }
                      className="w-full p-2.5 border rounded-xl text-xs font-bold dark:bg-slate-800 text-slate-800 dark:text-white"
                    >
                      <option value="mcq">اختيار من متعدد</option>
                      <option value="true_false">صح / خطأ</option>
                      <option value="essay">مقالي / نصي</option>
                    </select>
                  </div>
                </div>

                {/* --- خيارات حسب نوع السؤال الفرعي --- */}

                {/* 1. اختيار من متعدد */}
                {subQ.type === 'mcq' && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                      الخيارات (حدد الإجابة الصحيحة):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {subQ.options?.map((opt, optIdx) => (
                        <div
                          key={optIdx}
                          className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                            subQ.correct_option_index === optIdx
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`correct_sub_${subQ.id}`}
                            checked={subQ.correct_option_index === optIdx}
                            onChange={() => handleUpdateSubQuestion(subQ.id, { correct_option_index: optIdx })}
                            className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...(subQ.options || [])];
                              newOpts[optIdx] = e.target.value;
                              handleUpdateSubQuestion(subQ.id, { options: newOpts });
                            }}
                            placeholder={`الخيار ${optIdx + 1}`}
                            className="w-full bg-transparent border-none text-xs focus:ring-0 text-slate-800 dark:text-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. صح أو خطأ */}
                {subQ.type === 'true_false' && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">
                      الإجابة الصحيحة:
                    </label>
                    <div className="flex items-center gap-4">
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer text-xs font-bold ${
                        subQ.correct_option_index === 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                      }`}>
                        <input
                          type="radio"
                          name={`tf_sub_${subQ.id}`}
                          checked={subQ.correct_option_index === 0}
                          onChange={() => handleUpdateSubQuestion(subQ.id, { correct_option_index: 0 })}
                        />
                        <span>صواب (صح)</span>
                      </label>

                      <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer text-xs font-bold ${
                        subQ.correct_option_index === 1
                          ? 'bg-rose-50 text-rose-700 border-rose-500 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                      }`}>
                        <input
                          type="radio"
                          name={`tf_sub_${subQ.id}`}
                          checked={subQ.correct_option_index === 1}
                          onChange={() => handleUpdateSubQuestion(subQ.id, { correct_option_index: 1 })}
                        />
                        <span>خطأ</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 3. سؤال مقالي فرعي */}
                {subQ.type === 'essay' && (
                  <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-300">
                    📝 هذا السؤال الفرعي مقالي؛ سيكتب الطالب إجابته كتابةً وسيقوم المعلم بتصحيحه يدوياً.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ======================= الأسئلة العادية (مقالي / اختيارات) ======================= */
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              نص السؤال *
            </label>
            <input
              type="text"
              value={question.question_text || ''}
              onChange={(e) => onUpdate({ ...question, question_text: e.target.value })}
              placeholder="اكتب نص السؤال هنا..."
              className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 text-slate-800 dark:text-white"
            />
          </div>

          {question.type === 'essay' && (
            <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-900 dark:text-amber-300 font-medium">
              هذا السؤال مقالي؛ يقوم الطالب بكتابة الإجابة نصياً وسيتم تصحيحه يدوياً من قبل المعلم.
            </div>
          )}

          {/* التفسير والتوضيح التعليمي */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
              التفسير والتوضيح التعليمي (يظهر للطالب بعد التقييم)
            </label>
            <input
              type="text"
              value={question.explanation || ''}
              onChange={(e) => onUpdate({ ...question, explanation: e.target.value })}
              placeholder="اكتب توضيحاً لسبب صحة الإجابة..."
              className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 text-slate-800 dark:text-white"
            />
          </div>
        </div>
      )}
    </div>
  );
};
