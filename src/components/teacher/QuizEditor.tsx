import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Save,
  ArrowRight,
  BookOpen,
  Clock,
  Award,
  Users,
  CheckCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { TargetType, Question, QuizAssignment } from '../../types';
import { useApp } from '../../context/AppContext';

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

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState(
    currentUser?.specialty_id || subjects[0]?.id || ''
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
  const [targetClassId, setTargetClassId] = useState(classes[0]?.id || '');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Questions
  const [questions, setQuestions] = useState<
    Array<{
      id?: string;
      question_text: string;
      options: string[];
      correct_option_index: number;
      marks: number;
      explanation: string;
    }>
  >([
    {
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
      question_text: '',
      options: ['', '', '', ''],
      correct_option_index: 0,
      marks: 5,
      explanation: '',
    },
  ]);

  // Pre-fill state when editing an existing quiz
  useEffect(() => {
    if (editingQuizId) {
      const quizToEdit = quizzes.find((q) => q.id === editingQuizId);
      if (quizToEdit) {
        setTitle(quizToEdit.title);
        setDescription(quizToEdit.description || '');
        setSubjectId(quizToEdit.subject_id);
        setDurationMinutes(quizToEdit.duration_minutes);
        setPassPercentage(quizToEdit.pass_percentage);
        setStartDate(quizToEdit.start_date ? quizToEdit.start_date.split('T')[0] : '');
        setEndDate(quizToEdit.end_date ? quizToEdit.end_date.split('T')[0] : '');
        setIsActive(quizToEdit.is_active ?? true);

        // Populate questions
        if (quizToEdit.questions && quizToEdit.questions.length > 0) {
          setQuestions(
            quizToEdit.questions.map((q) => ({
              id: q.id,
              question_text: q.question_text,
              options: [...q.options],
              correct_option_index: q.correct_option_index,
              marks: q.marks,
              explanation: q.explanation || '',
            }))
          );
        }

        // Populate assignments
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
    }
  }, [editingQuizId, quizzes]);

  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      {
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

  const toggleStudentSelection = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const totalCalculatedMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('يرجى إدخال عنوان للاختبار');
      return;
    }

    if (questions.some((q) => !q.question_text.trim())) {
      alert('يرجى كتابة نص كافة الأسئلة قبل الحفظ');
      return;
    }

    let target_id: string | null = null;
    let target_name = '';

    if (targetType === 'all') {
      target_id = null;
      target_name = 'كافة طلاب المدرسة (شامل)';
    } else if (targetType === 'class') {
      target_id = targetClassId;
      const targetClass = classes.find((c) => c.id === targetClassId);
      target_name = targetClass?.name || 'صف دراسي محدد';
    } else if (targetType === 'specific_students') {
      if (selectedStudentIds.length === 0) {
        alert('يرجى تحديد طالب واحد على الأقل للاستهداف المخصص');
        return;
      }
      target_id = selectedStudentIds.join(',');
      target_name = `${selectedStudentIds.length} طلاب محددين بالاسم`;
    }

    const assignments = [
      {
        target_type: targetType,
        target_id,
        target_name,
        assigned_by_teacher_id: currentUser?.id || 'usr-admin-1',
      },
    ];

    if (isEditing && editingQuizId) {
      updateFullQuiz(
        editingQuizId,
        {
          title,
          description,
          subject_id: subjectId,
          total_marks: totalCalculatedMarks,
          duration_minutes: Number(durationMinutes),
          pass_percentage: Number(passPercentage),
          start_date: startDate,
          end_date: endDate,
          is_active: isActive,
        },
        questions,
        assignments
      );
      setEditingQuizId(null);
    } else {
      createNewQuiz(
        {
          title,
          description,
          subject_id: subjectId,
          teacher_id: currentUser?.id || 'usr-teacher-1',
          total_marks: totalCalculatedMarks,
          duration_minutes: Number(durationMinutes),
          pass_percentage: Number(passPercentage),
          status: 'published',
          start_date: startDate,
          end_date: endDate,
          is_active: isActive,
        },
        questions,
        assignments
      );
    }

    setCurrentView('quizzes');
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <button
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
            <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block font-bold">الدرجة الإجمالية</span>
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
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">المادة / التخصص *</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {subjects.map((s) => (
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

            {/* Date Range & Scheduling Controls */}
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
                {/* Instant Manual Toggle Switch */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isActive ? 'الاختبار مفعل ومتاح' : 'الاختبار موقوف ومغلق'}
                  </span>
                  <div
                    onClick={() => setIsActive(!isActive)}
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
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ بدء إتاحة الاختبار (من تاريخ) *
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
                    تاريخ انتهاء إتاحة الاختبار (إلى تاريخ) *
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
                placeholder="مثال: يغطي هذا الاختبار موضوعات الوحدة الأولى والثانية. يرجى التركيز في حل المسائل قبل التسليم النهائي."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Step 2: Granular Assignment & Targeting Permissions */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              2
            </span>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                صلاحيات وتخصيص استهداف الاختبار (Targeting & RBAC)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                حدد بدقة من يحق له أداء هذا الاختبار والظهور في لوحته المدرسية
              </p>
            </div>
          </div>

          {/* Target Type Selector */}
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

          {/* Conditional Target Details */}
          {targetType === 'class' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                اختر الصف والشعبة المستهدفة:
              </label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="w-full sm:w-80 px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.grade_level})
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'specific_students' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  حدد الطلاب المشمولين بالتقييم ({selectedStudentIds.length} تم اختيارهم):
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIds(students.map((s) => s.id))}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    تحديد الكل
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIds([])}
                    className="text-[11px] font-bold text-slate-500 hover:underline"
                  >
                    إلغاء التحديد
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
                {students.map((st) => {
                  const isChecked = selectedStudentIds.includes(st.id);
                  const studentClass = classes.find((c) => c.id === st.class_id);
                  return (
                    <div
                      key={st.id}
                      onClick={() => toggleStudentSelection(st.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                        isChecked
                          ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950 font-bold text-indigo-950 dark:text-indigo-200'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="truncate">
                        <div>{st.name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                          {studentClass?.name || 'طالب'} • هوية: {st.national_id}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="accent-indigo-600 w-4 h-4 ml-1"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Interactive Question Builder */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                3
              </span>
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">
                  بنك الأسئلة وخيارات الإجابة ({questions.length} أسئلة)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  أضف الأسئلة، حدد الإجابة الصحيحة عبر زر الاختيار، واكتب تفسيراً تعليمياً
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold rounded-xl text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سؤال جديد</span>
            </button>
          </div>

          <div className="space-y-6">
            {questions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/40 hover:border-slate-300 transition-colors relative"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                      {qIdx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">السؤال رقم {qIdx + 1}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <span>الدرجات:</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={q.marks}
                        onChange={(e) => handleMarksChange(qIdx, Number(e.target.value))}
                        className="w-16 px-2 py-1 text-center font-bold text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(qIdx)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                        title="حذف هذا السؤال"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Question Text */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    نص السؤال *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="اكتب نص السؤال هنا باللغة العربية..."
                    value={q.question_text}
                    onChange={(e) => handleQuestionTextChange(qIdx, e.target.value)}
                    className="w-full px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                {/* 4 Options */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      خيارات الإجابة (حدد الدائرة بجانب الإجابة الصحيحة):
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                      الإجابة النموذجية المحددة: الخيار (
                      {['أ', 'ب', 'ج', 'د'][q.correct_option_index]})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = q.correct_option_index === optIdx;
                      return (
                        <div
                          key={optIdx}
                          className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all ${
                            isCorrect
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/50 ring-1 ring-emerald-500'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`correct-opt-${qIdx}`}
                            checked={isCorrect}
                            onChange={() => handleCorrectOptionChange(qIdx, optIdx)}
                            className="accent-emerald-600 w-4 h-4 mr-1 cursor-pointer"
                            title="تعيين كإجابة صحيحة"
                          />
                          <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 text-[11px] font-bold flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                            {['أ', 'ب', 'ج', 'د'][optIdx]}
                          </span>
                          <input
                            type="text"
                            required
                            placeholder={`الخيار ${['أ', 'ب', 'ج', 'د'][optIdx]}`}
                            value={opt}
                            onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-transparent focus:outline-none text-slate-900 dark:text-white"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Explanation */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    التفسير والتعليل التعليمي (يظهر للطالب عند مراجعة النتيجة):
                  </label>
                  <input
                    type="text"
                    placeholder="شرح سبب صحة الإجابة أو القاعدة العلمية المرتبطة بها..."
                    value={q.explanation}
                    onChange={(e) => handleExplanationChange(qIdx, e.target.value)}
                    className="w-full px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-dashed border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 text-indigo-700 dark:text-indigo-400 rounded-2xl text-xs font-bold transition-colors w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سؤال آخر للاختبار</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setEditingQuizId(null);
              setCurrentView('quizzes');
            }}
            className="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors"
          >
            إلغاء وتراجع
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl transition-all shadow-lg shadow-indigo-600/30 hover:scale-[1.02]"
          >
            <Save className="w-4 h-4" />
            <span>{isEditing ? 'حفظ التعديلات وتحديث الاختبار' : 'نشر واعتماد الاختبار الآن'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
