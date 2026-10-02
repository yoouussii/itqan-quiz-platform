import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Save,
  ArrowRight,
  Clock,
  Award,
  HelpCircle,
  FileText,
  CheckCircle,
} from 'lucide-react';
import { TargetType } from '../../types';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { RichTextEditor } from '../common/RichTextEditor';
import { stripHtml } from '../common/RichText';

export type QuestionType = 'mcq' | 'true_false' | 'essay' | 'passage';

export interface SubQuestion {
  id?: string;
  question_text: string;
  type: 'mcq' | 'true_false' | 'essay';
  options: string[];
  correct_option_index: number;
  marks: number;
  explanation?: string;
}

export interface QuestionItem {
  id?: string;
  type: QuestionType;
  question_text: string;
  options: string[];
  correct_option_index: number;
  marks: number;
  explanation: string;
  sub_questions?: SubQuestion[];
}

export const QuizEditor: React.FC = () => {
  const {
    currentUser,
    subjects,
    classes,
    users,
    quizzes,
    createNewQuiz,
    editingQuizId,
    setEditingQuizId,
    updateFullQuiz,
    setCurrentView,
  } = useApp();

  const isEditing = Boolean(editingQuizId);
  const students = users.filter((u) => u.role === 'student');

  const teacherClassIds =
    currentUser?.assigned_class_ids && currentUser.assigned_class_ids.length > 0
      ? currentUser.assigned_class_ids
      : currentUser?.class_id
      ? [currentUser.class_id]
      : [];

  const availableClasses =
    currentUser?.role === 'admin'
      ? classes
      : teacherClassIds.length > 0
      ? classes.filter((c) => teacherClassIds.includes(c.id))
      : classes;

  const teacherSubIds =
    currentUser?.assigned_subject_ids && currentUser.assigned_subject_ids.length > 0
      ? currentUser.assigned_subject_ids
      : currentUser?.specialty_id
      ? [currentUser.specialty_id]
      : [];

  const availableSubjects =
    currentUser?.role === 'admin'
      ? subjects
      : teacherSubIds.length > 0
      ? subjects.filter((s) => teacherSubIds.includes(s.id))
      : subjects;

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState(
    teacherSubIds[0] || subjects[0]?.id || ''
  );
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [passPercentage, setPassPercentage] = useState(60);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [isActive, setIsActive] = useState(true);

  // Target assignment
  const [targetType, setTargetType] = useState<TargetType>('class');
  const [targetClassId, setTargetClassId] = useState(availableClasses[0]?.id || '');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Questions State
  const [questions, setQuestions] = useState<QuestionItem[]>([
    {
      type: 'mcq',
      question_text: 'ما هي الخاصية المميزة للمعادلات الخطية في الرسم البياني؟',
      options: [
        'تُمثل بخط مستقيم دائماً',
        'تُمثل بمنحنى قطعي مكافئ',
        'تُمثل بدائرة مغلقة',
        'تُمثل بنقاط متباعدة عشوائية',
      ],
      correct_option_index: 0,
      marks: 5,
      explanation: 'المعادلات من الدرجة الأولى (الخطية) تظهر على المستوى الإحداثي كخط مستقيم ذي ميل ثابت.',
    },
    {
      type: 'mcq',
      question_text: '',
      options: ['', '', '', ''],
      correct_option_index: 0,
      marks: 5,
      explanation: '',
    },
  ]);

  // ضمان أن المادة المختارة في الـ state موجودة فعلاً في القائمة المعروضة
  // (الحالة الابتدائية قد تكون فارغة لأن المواد تُحمَّل بعد أول رندر)
  const subjectIdsKey = availableSubjects.map((s) => s.id).join(',');
  useEffect(() => {
    if (availableSubjects.length === 0) return;
    const isValid = availableSubjects.some((s) => s.id === subjectId);
    if (!isValid) {
      setSubjectId(availableSubjects[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectIdsKey, subjectId]);

  const loadedQuizIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingQuizId) {
      loadedQuizIdRef.current = null;
      return;
    }

    if (loadedQuizIdRef.current === editingQuizId) {
      return;
    }

    const quizToEdit =
      quizzes.find((q) => q.id === editingQuizId) ||
      StorageService.getQuizWithDetails(editingQuizId);

    if (quizToEdit) {
      loadedQuizIdRef.current = editingQuizId;
      setTitle(quizToEdit.title);
      setDescription(quizToEdit.description || '');
      setSubjectId(quizToEdit.subject_id || '');
      setDurationMinutes(quizToEdit.duration_minutes);
      setPassPercentage(quizToEdit.pass_percentage);
      setStartDate(quizToEdit.start_date ? quizToEdit.start_date.split('T')[0] : '');
      setEndDate(quizToEdit.end_date ? quizToEdit.end_date.split('T')[0] : '');
      setIsActive(quizToEdit.is_active ?? true);

      if (quizToEdit.questions && quizToEdit.questions.length > 0) {
        setQuestions(
          quizToEdit.questions.map((q) => ({
            id: q.id,
            type: (q as any).type || 'mcq',
            question_text: q.question_text,
            options: q.options ? [...q.options] : [],
            correct_option_index: q.correct_option_index ?? 0,
            marks: q.marks,
            explanation: q.explanation || '',
            sub_questions: (q as any).sub_questions
              ? (q as any).sub_questions.map((sq: any) => ({
                  id: sq.id,
                  question_text: sq.question_text || '',
                  type: sq.type || 'mcq',
                  options: sq.options ? [...sq.options] : ['', '', '', ''],
                  correct_option_index: sq.correct_option_index ?? 0,
                  marks: sq.marks || 1,
                  explanation: sq.explanation || '',
                }))
              : [],
          }))
        );
      }

      if (quizToEdit.assignments && quizToEdit.assignments.length > 0) {
        const primaryAsg = quizToEdit.assignments[0];
        setTargetType(primaryAsg.target_type);
        if (primaryAsg.target_type === 'class' && primaryAsg.target_id) {
          setTargetClassId(primaryAsg.target_id);
        } else if (primaryAsg.target_type === 'specific_students' && primaryAsg.target_id) {
          setSelectedStudentIds(primaryAsg.target_id.split(',').map((s) => s.trim()));
        }
      }
    }
  }, [editingQuizId, quizzes]);

  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      {
        type: 'mcq',
        question_text: '',
        options: ['', '', '', ''],
        correct_option_index: 0,
        marks: 5,
        explanation: '',
      },
    ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleQuestionTypeChange = (idx: number, type: QuestionType) => {
    const updated = [...questions];
    updated[idx].type = type;

    if (type === 'passage') {
      if (!updated[idx].sub_questions || updated[idx].sub_questions!.length === 0) {
        updated[idx].sub_questions = [
          {
            id: `sub_${Date.now()}_1`,
            question_text: '',
            type: 'mcq',
            options: ['', '', '', ''],
            correct_option_index: 0,
            marks: 1,
            explanation: '',
          },
        ];
      }
      updated[idx].marks = updated[idx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
    } else if (type === 'true_false') {
      updated[idx].options = ['صح', 'خطأ'];
      updated[idx].correct_option_index = 0;
    } else if (type === 'mcq') {
      if (updated[idx].options.length !== 4) {
        updated[idx].options = ['', '', '', ''];
      }
      updated[idx].correct_option_index = 0;
    } else if (type === 'essay') {
      updated[idx].options = [];
      updated[idx].correct_option_index = -1;
    }

    setQuestions(updated);
  };

  const handleQuestionTextChange = (idx: number, text: string) => {
    const updated = [...questions];
    updated[idx].question_text = text;
    setQuestions(updated);
  };

  const handleOptionChange = (qIdx: number, optIdx: number, val: string) => {
    const updated = [...questions];
    updated[qIdx].options[optIdx] = val;
    setQuestions(updated);
  };

  const handleCorrectOptionChange = (qIdx: number, optIdx: number) => {
    const updated = [...questions];
    updated[qIdx].correct_option_index = optIdx;
    setQuestions(updated);
  };

  const handleMarksChange = (qIdx: number, marks: number) => {
    const updated = [...questions];
    updated[qIdx].marks = Math.max(1, marks);
    setQuestions(updated);
  };

  const handleExplanationChange = (qIdx: number, text: string) => {
    const updated = [...questions];
    updated[qIdx].explanation = text;
    setQuestions(updated);
  };

  const handleAddSubQuestion = (qIdx: number) => {
    const updated = [...questions];
    const currentSubQs = updated[qIdx].sub_questions || [];
    const newSubQ: SubQuestion = {
      id: `sub_${Date.now()}`,
      question_text: '',
      type: 'mcq',
      options: ['', '', '', ''],
      correct_option_index: 0,
      marks: 1,
      explanation: '',
    };
    updated[qIdx].sub_questions = [...currentSubQs, newSubQ];
    updated[qIdx].marks = updated[qIdx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
    setQuestions(updated);
  };

  const handleRemoveSubQuestion = (qIdx: number, sqIdx: number) => {
    const updated = [...questions];
    const subQList = updated[qIdx].sub_questions || [];
    if (subQList.length <= 1) {
      alert('يجب أن تحتوي القطعة على سؤال فرعي واحد على الأقل');
      return;
    }
    updated[qIdx].sub_questions = subQList.filter((_, i) => i !== sqIdx);
    updated[qIdx].marks = updated[qIdx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
    setQuestions(updated);
  };

  const handleSubQuestionTextChange = (qIdx: number, sqIdx: number, text: string) => {
    const updated = [...questions];
    if (updated[qIdx].sub_questions?.[sqIdx]) {
      updated[qIdx].sub_questions![sqIdx].question_text = text;
      setQuestions(updated);
    }
  };

  const handleSubQuestionTypeChange = (qIdx: number, sqIdx: number, type: 'mcq' | 'true_false' | 'essay') => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.type = type;
      if (type === 'true_false') {
        subQ.options = ['صواب', 'خطأ'];
        subQ.correct_option_index = 0;
      } else if (type === 'mcq') {
        subQ.options = ['', '', '', ''];
        subQ.correct_option_index = 0;
      } else if (type === 'essay') {
        subQ.options = [];
        subQ.correct_option_index = -1;
      }
      setQuestions(updated);
    }
  };

  const handleSubOptionChange = (qIdx: number, sqIdx: number, optIdx: number, val: string) => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.options[optIdx] = val;
      setQuestions(updated);
    }
  };

  const handleSubCorrectOptionChange = (qIdx: number, sqIdx: number, optIdx: number) => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.correct_option_index = optIdx;
      setQuestions(updated);
    }
  };

  const handleSubMarksChange = (qIdx: number, sqIdx: number, marks: number) => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.marks = Math.max(1, marks);
      updated[qIdx].marks = updated[qIdx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
      setQuestions(updated);
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const totalCalculatedMarks = questions.reduce((sum, q) => {
    if (q.type === 'passage' && q.sub_questions && q.sub_questions.length > 0) {
      return sum + q.sub_questions.reduce((subSum, sq) => subSum + (Number(sq.marks) || 0), 0);
    }
    return sum + (Number(q.marks) || 0);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('يرجى إدخال عنوان للاختبار');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!stripHtml(q.question_text).trim()) {
        alert(`يرجى كتابة نص السؤال رقم ${i + 1}`);
        return;
      }
      if (q.type === 'passage') {
        if (!q.sub_questions || q.sub_questions.length === 0) {
          alert(`يرجى إضافة سؤال فرعي واحد على الأقل للقطعة في السؤال رقم ${i + 1}`);
          return;
        }
        for (let j = 0; j < q.sub_questions.length; j++) {
          if (!stripHtml(q.sub_questions[j].question_text).trim()) {
            alert(`يرجى كتابة نص السؤال الفرعي رقم ${j + 1} للقطعة رقم ${i + 1}`);
            return;
          }
        }
      }
    }

    if (!subjectId) {
      alert('يرجى اختيار المادة');
      return;
    }

    if (!currentUser?.id) {
      alert('انتهت الجلسة، يرجى تسجيل الدخول من جديد');
      return;
    }

    if (targetType === 'specific_students' && selectedStudentIds.length === 0) {
      alert('يرجى تحديد طالب واحد على الأقل للاستهداف المخصص');
      return;
    }

    if (targetType === 'class' && !targetClassId) {
      alert('يرجى اختيار الصف والشعبة المستهدفة');
      return;
    }

    const formattedQuestions = questions.map((q) => {
      if (q.type === 'passage') {
        const passageMarks = (q.sub_questions || []).reduce((sum, sq) => sum + (Number(sq.marks) || 0), 0);
        return {
          ...q,
          marks: passageMarks,
          sub_questions: q.sub_questions || [],
        };
      }
      return q;
    });

    const assignments = [
      {
        target_type: targetType,
        target_id:
          targetType === 'class'
            ? targetClassId
            : targetType === 'specific_students'
            ? selectedStudentIds.join(',')
            : null,
      },
    ];

    try {
      let outcome: { synced: boolean; error?: string };

      if (isEditing && editingQuizId) {
        outcome = await updateFullQuiz(
          editingQuizId,
          {
            title: title.trim(),
            description: description.trim(),
            subject_id: subjectId,
            total_marks: totalCalculatedMarks,
            duration_minutes: Number(durationMinutes),
            pass_percentage: Number(passPercentage),
            start_date: startDate,
            end_date: endDate,
            is_active: isActive,
          },
          formattedQuestions as any,
          assignments as any
        );
        loadedQuizIdRef.current = null;
        setEditingQuizId(null);
      } else {
        // الحفظ هنا يذهب إلى Supabase أولاً عبر الـ context (مصدر البيانات الرئيسي)
        outcome = await createNewQuiz(
          {
            title: title.trim(),
            description: description.trim(),
            subject_id: subjectId,
            teacher_id: currentUser.id,
            total_marks: totalCalculatedMarks,
            duration_minutes: Number(durationMinutes),
            pass_percentage: Number(passPercentage),
            status: 'published',
            start_date: startDate,
            end_date: endDate,
            is_active: isActive,
          },
          formattedQuestions as any,
          assignments as any
        );
      }

      if (outcome.synced) {
        alert('تم حفظ ونشر الاختبار بنجاح!');
      } else {
        alert(
          'تم حفظ الاختبار على جهازك، لكنه لم يصل إلى الخادم بعد، ولن يراه الآدمن أو الطلاب قبل ذلك.\n' +
            'سيُعاد الإرسال تلقائياً. السبب: ' +
            (outcome.error || 'غير معروف')
        );
      }
      setCurrentView('quizzes');
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ الاختبار: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <button
            type="button"
            onClick={() => {
              setEditingQuizId(null);
              setCurrentView('quizzes');
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 mb-2 font-bold transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى قائمة الاختبارات</span>
          </button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
            {isEditing ? 'تعديل الاختبار والأسئلة' : 'إنشاء اختبار وتقييم إلكتروني جديد'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isEditing
              ? 'قم بتحديث بيانات الاختبار، معايير التقييم، تفاصيل الأسئلة وصلاحيات التعيين'
              : 'حدد إعدادات الاختبار، صلاحيات الاستهداف الدقيقة، وأسئلة التقييم التفاعلية'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-left bg-indigo-50 dark:bg-indigo-950 px-4 py-2 rounded-2xl border border-indigo-100 dark:border-indigo-900">
            <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block font-bold">
              الدرجة الإجمالية
            </span>
            <span className="text-xl font-black text-indigo-900 dark:text-indigo-200 font-cairo">
              {totalCalculatedMarks} درجات
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Basic Information */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              1
            </span>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">البيانات العامة للاختبار</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                عنوان الاختبار الرئيسي *
              </label>
              <input
                type="text"
                required
                placeholder="مثال: الاختبار الفصلي الأول في الجبر والهندسة التحليلية"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                المادة / التخصص *
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">...اختر المادة</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  مدة الاختبار (بالدقائق) *
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full pr-10 pl-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  نسبة النجاح (%) *
                </label>
                <div className="relative">
                  <Award className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={passPercentage}
                    onChange={(e) => setPassPercentage(Number(e.target.value))}
                    className="w-full pr-10 pl-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    جدولة إتاحة الاختبار وحالة التفعيل الفوري
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    حدد الفترة الزمنية التي يُسمح خلالها للطلاب بدخول الاختبار وإمكانية الإيقاف اليدوي
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isActive ? 'الاختبار مفعل ومتاح' : 'الاختبار موقوف ومغلق'}
                  </span>
                  <div
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        isActive ? 'translate-x-[-18px]' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ بدء إتاحة الاختبار *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ انتهاء إتاحة الاختبار *
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                وصف موجز وتعليمات للطلاب
              </label>
              <textarea
                rows={2}
                placeholder="مثال: يغطي هذا الاختبار موضوعات الوحدة الأولى والثانية..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Step 2: Targeting */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              2
            </span>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                صلاحيات وتخصيص استهداف الاختبار (Targeting)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                حدد بدقة من يحق له أداء هذا الاختبار والظهور في لوحته المدرسية
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <label
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                targetType === 'all'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/60 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white">جميع الطلاب (شامل)</span>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'all'}
                  onChange={() => setTargetType('all')}
                  className="accent-indigo-600"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                يظهر الاختبار لكافة الطلاب في المدرسة دون استثناء
              </p>
            </label>

            <label
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                targetType === 'class'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/60 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white">صف / شعبة محددة</span>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'class'}
                  onChange={() => setTargetType('class')}
                  className="accent-indigo-600"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                يظهر حصراً لطلاب الشعبة المحددة فقط
              </p>
            </label>

            <label
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                targetType === 'specific_students'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/60 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white">طلاب محددون بالاسم</span>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'specific_students'}
                  onChange={() => setTargetType('specific_students')}
                  className="accent-indigo-600"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                استهداف فردي مخصص لحالات التقوية أو الموهوبين
              </p>
            </label>
          </div>

          {targetType === 'class' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                اختر الصف والشعبة المستهدفة:
              </label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="w-full sm:w-80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">...اختر الصف والشعبة المستهدفة</option>
                {availableClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.grade_level})
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'specific_students' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                اختر الطلاب المحددين ({selectedStudentIds.length} محددين):
              </label>
              <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                {students.map((st) => (
                  <label
                    key={st.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(st.id)}
                      onChange={() => toggleStudentSelection(st.id)}
                      className="rounded accent-indigo-600"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">{st.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Questions List */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                3
              </span>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">الأسئلة والتمارين</h2>
            </div>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سؤال جديد</span>
            </button>
          </div>

          <div className="space-y-6">
            {questions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-lg">
                      سؤال {qIdx + 1}
                    </span>
                    <select
                      value={q.type}
                      onChange={(e) => handleQuestionTypeChange(qIdx, e.target.value as QuestionType)}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="mcq">اختيار من متعدد (MCQ)</option>
                      <option value="true_false">صح أو خطأ</option>
                      <option value="essay">سؤال مقالي</option>
                      <option value="passage">قطعة وأسئلة فرعية</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-500">الدرجة:</span>
                      <input
                        type="number"
                        min={1}
                        value={q.marks}
                        onChange={(e) => handleMarksChange(qIdx, Number(e.target.value))}
                        disabled={q.type === 'passage'}
                        className="w-16 px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center"
                      />
                    </div>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(qIdx)}
                        className="text-rose-500 hover:text-rose-700 p-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {q.type === 'passage' ? 'نص القطعة / القرائية:' : 'نص السؤال:'}
                  </label>
                  <RichTextEditor
                    value={q.question_text}
                    onChange={(html) => handleQuestionTextChange(qIdx, html)}
                    placeholder={q.type === 'passage' ? 'أدخل نص القطعة القراءية هنا...' : 'اكتب نص السؤال هنا...'}
                    minHeight={q.type === 'passage' ? 140 : 80}
                  />
                </div>

                {/* MCQ Options */}
                {q.type === 'mcq' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct_${qIdx}`}
                          checked={q.correct_option_index === optIdx}
                          onChange={() => handleCorrectOptionChange(qIdx, optIdx)}
                          className="accent-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <RichTextEditor
                            variant="compact"
                            value={opt}
                            onChange={(html) => handleOptionChange(qIdx, optIdx, html)}
                            placeholder={`الخيار ${optIdx + 1}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* True/False Options */}
                {q.type === 'true_false' && (
                  <div className="flex gap-4 pt-2">
                    {['صح', 'خطأ'].map((opt, optIdx) => (
                      <label key={optIdx} className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                        <input
                          type="radio"
                          name={`tf_${qIdx}`}
                          checked={q.correct_option_index === optIdx}
                          onChange={() => handleCorrectOptionChange(qIdx, optIdx)}
                          className="accent-indigo-600"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Essay Note */}
                {q.type === 'essay' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900">
                    * ملاحظة: الأسئلة المقالية تتطلب تصحيحاً يدويًا من قبل المعلم بعد تسليم الطالب.
                  </p>
                )}

                {/* Passage Sub-Questions */}
                {q.type === 'passage' && (
                  <div className="mt-4 space-y-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">الأسئلة الفرعية للقطعة:</h4>
                      <button
                        type="button"
                        onClick={() => handleAddSubQuestion(qIdx)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> إضافة سؤال فرعي
                      </button>
                    </div>

                    {(q.sub_questions || []).map((sq, sqIdx) => (
                      <div key={sqIdx} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-500">سؤال فرعي {sqIdx + 1}</span>
                          <div className="flex items-center gap-2">
                            <select
                              value={sq.type}
                              onChange={(e) => handleSubQuestionTypeChange(qIdx, sqIdx, e.target.value as any)}
                              className="px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700"
                            >
                              <option value="mcq">اختيار من متعدد</option>
                              <option value="true_false">صح أو خطأ</option>
                              <option value="essay">مقالي</option>
                            </select>
                            <input
                              type="number"
                              min={1}
                              value={sq.marks}
                              onChange={(e) => handleSubMarksChange(qIdx, sqIdx, Number(e.target.value))}
                              className="w-14 px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveSubQuestion(qIdx, sqIdx)}
                              className="text-rose-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <RichTextEditor
                          variant="compact"
                          value={sq.question_text}
                          onChange={(html) => handleSubQuestionTextChange(qIdx, sqIdx, html)}
                          placeholder="نص السؤال الفرعي..."
                          minHeight={50}
                        />

                        {sq.type === 'mcq' && (
                          <div className="grid grid-cols-2 gap-2">
                            {sq.options.map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-1.5">
                                <input
                                  type="radio"
                                  name={`sub_correct_${qIdx}_${sqIdx}`}
                                  checked={sq.correct_option_index === optIdx}
                                  onChange={() => handleSubCorrectOptionChange(qIdx, sqIdx, optIdx)}
                                  className="accent-indigo-600"
                                />
                                <div className="flex-1 min-w-0">
                                  <RichTextEditor
                                    variant="compact"
                                    value={opt}
                                    onChange={(html) => handleSubOptionChange(qIdx, sqIdx, optIdx, html)}
                                    placeholder={`خيار ${optIdx + 1}`}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Explanation */}
                <div>
                  <RichTextEditor
                    variant="compact"
                    value={q.explanation}
                    onChange={(html) => handleExplanationChange(qIdx, html)}
                    placeholder="شرح الإجابة النموذجية (اختياري يظهر للطلاب بعد التقييم)..."
                    minHeight={50}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => {
              setEditingQuizId(null);
              setCurrentView('quizzes');
            }}
            className="px-6 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Save className="w-4 h-4" />
            <span>{isEditing ? 'تحديث وتعديل الاختبار' : 'حفظ ونشر الاختبار'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuizEditor;
